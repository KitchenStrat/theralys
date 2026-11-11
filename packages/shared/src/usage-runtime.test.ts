import { afterEach, describe, expect, it, vi } from "vitest";
import { API_USAGE_ERROR_MAX, type ApiUsageEvent } from "./api-usage";
import {
  API_USAGE_SINK_TIMEOUT_MS,
  attributeApiUsage,
  currentApiUsageContext,
  hasApiUsageSink,
  recordApiUsage,
  resolveApiUsageEvent,
  setApiUsageSink,
  setApiUsageSinkFactory,
  trackApiCall,
  usageErrorText,
  withApiUsage,
  type ApiUsageContext,
  type ApiUsageSink,
  type ResolvedApiUsageEvent,
} from "./usage-runtime";

// Le puits et sa fabrique sont globaux (portés par globalThis) : remis à zéro après chaque test.
afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const SITE_A = "11111111-1111-4111-8111-111111111111";
const SITE_B = "22222222-2222-4222-8222-222222222222";
const EVENT: ApiUsageEvent = { provider: "pexels", operation: "search" };

/** Puits qui garde les événements reçus. */
function capture(): ResolvedApiUsageEvent[] {
  const events: ResolvedApiUsageEvent[] = [];
  setApiUsageSink(async (event) => {
    events.push(event);
  });
  return events;
}

const pause = (ms = 1) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Verrou ouvert à la main : l'ordre des reprises est choisi par le test. */
function gate() {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/** Laisse passer les micro-tâches et les reprises en attente. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function mutedWarn() {
  return vi.spyOn(console, "warn").mockImplementation(() => {});
}

// ─── Contexte ────────────────────────────────────────────────────────────────

describe("withApiUsage / currentApiUsageContext", () => {
  it("hors de tout contexte : vide", () => {
    expect(currentApiUsageContext()).toEqual({});
  });

  it("le contexte vaut pendant `fn`, dont la valeur est rendue telle quelle (synchrone ou promesse)", async () => {
    const value = { ok: true };
    expect(withApiUsage({ feature: "blog", siteId: SITE_A }, () => currentApiUsageContext())).toEqual({ feature: "blog", siteId: SITE_A });
    expect(withApiUsage({ feature: "blog" }, () => value)).toBe(value);
    const promise = withApiUsage({ feature: "social", siteId: SITE_B }, async () => {
      await pause();
      return currentApiUsageContext();
    });
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).resolves.toEqual({ feature: "social", siteId: SITE_B });
  });

  it("contextes imbriqués : seules les valeurs définies remplacent celles du contexte englobant", () => {
    withApiUsage({ feature: "meta_ads", siteId: SITE_A }, () => {
      // Le site seul : la fonctionnalité est héritée
      expect(withApiUsage({ siteId: SITE_B }, currentApiUsageContext)).toEqual({ feature: "meta_ads", siteId: SITE_B });
      // La fonctionnalité seule : le site est hérité
      expect(withApiUsage({ feature: "notifications" }, currentApiUsageContext)).toEqual({ feature: "notifications", siteId: SITE_A });
      // Rien de défini (ou `undefined` explicite) : tout est hérité
      expect(withApiUsage({}, currentApiUsageContext)).toEqual({ feature: "meta_ads", siteId: SITE_A });
      expect(withApiUsage({ feature: undefined, siteId: undefined }, currentApiUsageContext)).toEqual({ feature: "meta_ads", siteId: SITE_A });
      // Trois niveaux
      withApiUsage({ feature: "blog" }, () => {
        expect(withApiUsage({ siteId: SITE_B }, currentApiUsageContext)).toEqual({ feature: "blog", siteId: SITE_B });
        expect(currentApiUsageContext()).toEqual({ feature: "blog", siteId: SITE_A });
      });
      expect(currentApiUsageContext()).toEqual({ feature: "meta_ads", siteId: SITE_A });
    });
  });

  it("`null` est une valeur définie : il efface la fonctionnalité ou le site du contexte englobant", () => {
    withApiUsage({ feature: "meta_ads", siteId: SITE_A }, () => {
      expect(withApiUsage({ siteId: null }, currentApiUsageContext)).toEqual({ feature: "meta_ads", siteId: null });
      expect(withApiUsage({ feature: null }, currentApiUsageContext)).toEqual({ feature: null, siteId: SITE_A });
    });
  });

  it("contexte rendu à la sortie de `fn`, qu'elle rende une valeur ou lève", () => {
    withApiUsage({ feature: "blog", siteId: SITE_A }, () => undefined);
    expect(currentApiUsageContext()).toEqual({});
    const failure = new Error("échec dans le contexte");
    expect(() =>
      withApiUsage({ feature: "blog", siteId: SITE_A }, () => {
        throw failure;
      }),
    ).toThrow(failure);
    expect(currentApiUsageContext()).toEqual({});
    // Imbriqué : on retrouve le contexte englobant, pas le vide
    withApiUsage({ feature: "social", siteId: SITE_B }, () => {
      expect(() =>
        withApiUsage({ feature: "blog" }, () => {
          throw failure;
        }),
      ).toThrow(failure);
      expect(currentApiUsageContext()).toEqual({ feature: "social", siteId: SITE_B });
    });
    expect(currentApiUsageContext()).toEqual({});
  });

  it("contexte rendu après une promesse aboutie ou rejetée, et pendant qu'elle est encore en cours", async () => {
    const pending = withApiUsage({ feature: "google_ads", siteId: SITE_A }, async () => {
      await pause(2);
      return currentApiUsageContext();
    });
    // L'appelant ne baigne pas dans le contexte de la tâche qu'il vient de lancer
    expect(currentApiUsageContext()).toEqual({});
    await expect(pending).resolves.toEqual({ feature: "google_ads", siteId: SITE_A });
    expect(currentApiUsageContext()).toEqual({});
    const failure = new Error("rejet dans le contexte");
    await expect(
      withApiUsage({ feature: "google_ads" }, async () => {
        await pause();
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(currentApiUsageContext()).toEqual({});
  });

  it("le contexte suit les attentes : promesses, minuteries, micro-tâches, Promise.all", async () => {
    const expected = { feature: "google_profile", siteId: SITE_A };
    await withApiUsage({ feature: "google_profile", siteId: SITE_A }, async () => {
      await Promise.resolve();
      expect(currentApiUsageContext()).toEqual(expected);
      await pause(2);
      expect(currentApiUsageContext()).toEqual(expected);
      expect(await new Promise<ApiUsageContext>((resolve) => setTimeout(() => resolve(currentApiUsageContext()), 1))).toEqual(expected);
      expect(await new Promise<ApiUsageContext>((resolve) => setImmediate(() => resolve(currentApiUsageContext())))).toEqual(expected);
      expect(await new Promise<ApiUsageContext>((resolve) => queueMicrotask(() => resolve(currentApiUsageContext())))).toEqual(expected);
      const all = await Promise.all([1, 2, 3].map(async (n) => {
        await pause(n);
        return currentApiUsageContext();
      }));
      expect(all).toEqual([expected, expected, expected]);
      expect(await Promise.resolve().then(() => currentApiUsageContext())).toEqual(expected);
    });
  });

  it("deux chaînes asynchrones concurrentes, aux reprises entrelacées, gardent chacune leur contexte", async () => {
    const order: string[] = [];
    const gates = { a: [gate(), gate(), gate()], b: [gate(), gate(), gate()] };
    const chain = (name: "a" | "b", context: ApiUsageContext) =>
      withApiUsage(context, async () => {
        const seen: ApiUsageContext[] = [currentApiUsageContext()];
        for (const step of gates[name]) {
          await step.wait;
          order.push(name);
          seen.push(currentApiUsageContext());
          await Promise.resolve();
          seen.push(currentApiUsageContext());
        }
        return seen;
      });
    const a = chain("a", { feature: "blog", siteId: SITE_A });
    const b = chain("b", { feature: "social", siteId: SITE_B });
    // Reprises alternées, déclenchées hors de tout contexte : b, a, a, b, b, a
    for (const [name, index] of [["b", 0], ["a", 0], ["a", 1], ["b", 1], ["b", 2], ["a", 2]] as const) {
      gates[name][index]!.open();
      await settle();
      expect(currentApiUsageContext()).toEqual({});
    }
    expect(order).toEqual(["b", "a", "a", "b", "b", "a"]);
    const seenA = await a;
    const seenB = await b;
    expect(seenA).toHaveLength(7);
    expect(seenB).toHaveLength(7);
    for (const context of seenA) expect(context).toEqual({ feature: "blog", siteId: SITE_A });
    for (const context of seenB) expect(context).toEqual({ feature: "social", siteId: SITE_B });
  });

  it("un contexte ouvert dans une tâche n'atteint ni sa voisine ni celle qui les a lancées", async () => {
    const outer = { feature: "google_profile" as const, siteId: SITE_A };
    await withApiUsage(outer, async () => {
      const inner = gate();
      const neighbour = gate();
      const first = (async () => {
        await withApiUsage({ feature: "notifications", siteId: SITE_B }, async () => {
          await inner.wait;
        });
        return currentApiUsageContext();
      })();
      const second = (async () => {
        await neighbour.wait;
        return currentApiUsageContext();
      })();
      neighbour.open();
      expect(await second).toEqual(outer);
      inner.open();
      expect(await first).toEqual(outer);
      expect(currentApiUsageContext()).toEqual(outer);
    });
  });

  it("le contexte tient à l'exécution, pas à la fonction : une fonction créée dans un contexte et appelée ailleurs voit le contexte de son appelant", () => {
    const later = withApiUsage({ feature: "blog", siteId: SITE_A }, () => () => currentApiUsageContext());
    expect(later()).toEqual({});
    expect(withApiUsage({ feature: "social" }, later)).toEqual({ feature: "social", siteId: undefined });
  });

  it("deux copies du module (bundles distincts) partagent le contexte, le puits et la fabrique", async () => {
    vi.resetModules();
    const copy = await import("./usage-runtime");
    expect(copy.withApiUsage).not.toBe(withApiUsage);
    withApiUsage({ feature: "domains", siteId: SITE_A }, () => {
      expect(copy.currentApiUsageContext()).toEqual({ feature: "domains", siteId: SITE_A });
    });
    copy.withApiUsage({ feature: "prospecting" }, () => {
      expect(currentApiUsageContext()).toEqual({ feature: "prospecting", siteId: undefined });
    });
    const events = capture();
    expect(copy.hasApiUsageSink()).toBe(true);
    await copy.recordApiUsage(EVENT);
    expect(events).toHaveLength(1);
    copy.setApiUsageSink(null);
    expect(hasApiUsageSink()).toBe(false);
    // La fabrique posée par une copie sert l'autre
    const fromFactory: ResolvedApiUsageEvent[] = [];
    copy.setApiUsageSinkFactory(() => async (event) => {
      fromFactory.push(event);
    });
    await recordApiUsage(EVENT);
    expect(fromFactory).toHaveLength(1);
  });
});

// ─── attributeApiUsage ───────────────────────────────────────────────────────

/** Générateur factice : champ privé, accesseur, méthodes synchrone et asynchrone. */
class FakeGenerator {
  readonly mode = "mock" as const;
  readonly limits = { max: 3 };
  label: string | null = null;
  readonly failure = new Error("génération impossible");
  #calls = 0;

  constructor(private readonly prefix: string) {}

  get calls(): number {
    return this.#calls;
  }

  describe(subject: string, suffix = ""): string {
    this.#calls++;
    const context = currentApiUsageContext();
    return `${this.prefix}:${subject}${suffix}:${context.feature ?? "-"}:${context.siteId ?? "-"}`;
  }

  async generate(subject: string): Promise<{ subject: string; before: ApiUsageContext; after: ApiUsageContext; calls: number; prefix: string }> {
    this.#calls++;
    const before = currentApiUsageContext();
    await pause(2);
    await Promise.resolve();
    return { subject, before, after: currentApiUsageContext(), calls: this.#calls, prefix: this.prefix };
  }

  fail(): never {
    this.#calls++;
    throw this.failure;
  }

  async reject(): Promise<never> {
    await pause();
    throw this.failure;
  }

  *steps(): Generator<ApiUsageContext> {
    yield currentApiUsageContext();
  }
}

describe("attributeApiUsage", () => {
  it("chaque méthode s'exécute dans le contexte donné ; arguments et valeur rendue inchangés", () => {
    const generator = attributeApiUsage(new FakeGenerator("gen"), { feature: "social", siteId: SITE_A });
    expect(generator.describe("post")).toBe(`gen:post:social:${SITE_A}`);
    expect(generator.describe("post", "!")).toBe(`gen:post!:social:${SITE_A}`);
    // Rien ne déborde après l'appel
    expect(currentApiUsageContext()).toEqual({});
  });

  it("méthode asynchrone : le contexte tient au-delà des attentes", async () => {
    const generator = attributeApiUsage(new FakeGenerator("gen"), { feature: "blog", siteId: SITE_B });
    const pending = generator.generate("article");
    expect(currentApiUsageContext()).toEqual({});
    const result = await pending;
    expect(result).toEqual({ subject: "article", before: { feature: "blog", siteId: SITE_B }, after: { feature: "blog", siteId: SITE_B }, calls: 1, prefix: "gen" });
    expect(currentApiUsageContext()).toEqual({});
  });

  it("`this` préservé pour une instance de classe : champs privés, accesseurs, propriétés du constructeur — même méthode détachée", async () => {
    const target = new FakeGenerator("cabinet");
    const generator = attributeApiUsage(target, { feature: "site_editor" });
    generator.describe("a");
    await generator.generate("b");
    expect(generator.calls).toBe(2);
    expect(target.calls).toBe(2);
    const { describe: detached } = generator;
    expect(detached("c")).toBe("cabinet:c:site_editor:-");
    expect(target.calls).toBe(3);
    expect(generator).toBeInstanceOf(FakeGenerator);
  });

  it("propriétés qui ne sont pas des fonctions : lues telles quelles, écrites sur la cible", () => {
    const target = new FakeGenerator("gen");
    const generator = attributeApiUsage(target, { feature: "social" });
    expect(generator.mode).toBe("mock");
    expect(generator.limits).toBe(target.limits);
    expect(generator.label).toBeNull();
    expect((generator as unknown as Record<string, unknown>).absente).toBeUndefined();
    generator.label = "Réseaux";
    expect(target.label).toBe("Réseaux");
    expect("describe" in generator).toBe(true);
    expect(Object.keys(generator)).toEqual(Object.keys(target));
  });

  it("erreurs relancées telles quelles (levée synchrone et promesse rejetée), contexte rendu", async () => {
    const target = new FakeGenerator("gen");
    const generator = attributeApiUsage(target, { feature: "social", siteId: SITE_A });
    expect(() => generator.fail()).toThrow(target.failure);
    await expect(generator.reject()).rejects.toBe(target.failure);
    expect(currentApiUsageContext()).toEqual({});
  });

  it("le contexte donné complète celui qui entoure l'appel, sans toucher à la cible", () => {
    const target = new FakeGenerator("gen");
    const bySite = attributeApiUsage(target, { siteId: SITE_B });
    const byFeature = attributeApiUsage(target, { feature: "google_profile" });
    withApiUsage({ feature: "blog", siteId: SITE_A }, () => {
      expect(bySite.describe("x")).toBe(`gen:x:blog:${SITE_B}`);
      expect(byFeature.describe("x")).toBe(`gen:x:google_profile:${SITE_A}`);
      // La cible, appelée directement, ne voit que le contexte ambiant
      expect(target.describe("x")).toBe(`gen:x:blog:${SITE_A}`);
    });
    expect(target.describe("x")).toBe("gen:x:-:-");
    // Deux attributions empilées se complètent ; pour une même valeur, la plus proche de la cible l'emporte
    const stacked = attributeApiUsage(attributeApiUsage(target, { feature: "social" }), { feature: "blog", siteId: SITE_A });
    expect(stacked.describe("y")).toBe(`gen:y:social:${SITE_A}`);
  });

  it("objet littéral (fournisseur sans classe) : mêmes garanties", async () => {
    const provider = {
      mode: "mock",
      async search(query: string) {
        await pause();
        return { query, mode: this.mode, context: currentApiUsageContext() };
      },
    };
    const attributed = attributeApiUsage(provider, { feature: "prospecting" });
    await expect(attributed.search("sophrologue albi")).resolves.toEqual({ query: "sophrologue albi", mode: "mock", context: { feature: "prospecting", siteId: undefined } });
  });

  // Limite connue : `withApiUsage` entoure l'appel qui crée l'itérateur, pas l'exécution du corps (lancée plus tard
  // par `next()`). Aucun fournisseur n'a de méthode génératrice ; une réponse en flux devrait entourer sa consommation
  // de `withApiUsage`.
  it("limite connue — le corps d'une méthode génératrice (function*) s'exécute hors du contexte donné", () => {
    const generator = attributeApiUsage(new FakeGenerator("gen"), { feature: "social", siteId: SITE_A });
    expect([...generator.steps()]).toEqual([{}]);
    expect(withApiUsage({ feature: "social", siteId: SITE_A }, () => [...new FakeGenerator("gen").steps()])).toEqual([{ feature: "social", siteId: SITE_A }]);
  });
});

// ─── Puits et fabrique ───────────────────────────────────────────────────────

describe("setApiUsageSink / hasApiUsageSink", () => {
  it("aucun puits par défaut ; posé puis retiré avec null", () => {
    expect(hasApiUsageSink()).toBe(false);
    setApiUsageSink(async () => {});
    expect(hasApiUsageSink()).toBe(true);
    setApiUsageSink(null);
    expect(hasApiUsageSink()).toBe(false);
  });

  it("le dernier puits posé remplace le précédent", async () => {
    const first: ResolvedApiUsageEvent[] = [];
    const second: ResolvedApiUsageEvent[] = [];
    setApiUsageSink(async (event) => {
      first.push(event);
    });
    await recordApiUsage(EVENT);
    setApiUsageSink(async (event) => {
      second.push(event);
    });
    await recordApiUsage(EVENT);
    await recordApiUsage(EVENT);
    expect([first.length, second.length]).toEqual([1, 2]);
  });
});

describe("setApiUsageSinkFactory", () => {
  function collecting() {
    const events: ResolvedApiUsageEvent[] = [];
    const sink: ApiUsageSink = async (event) => {
      events.push(event);
    };
    return { events, sink };
  }

  it("fabrique appelée une seule fois, au premier appel inscrit ; son puits est gardé pour la suite", async () => {
    const { events, sink } = collecting();
    const factory = vi.fn(() => sink);
    setApiUsageSinkFactory(factory);
    // Paresseuse : ni la pose ni les lectures ne l'appellent
    expect(factory).not.toHaveBeenCalled();
    expect(hasApiUsageSink()).toBe(false);
    resolveApiUsageEvent(EVENT);
    expect(factory).not.toHaveBeenCalled();
    await recordApiUsage({ ...EVENT, operation: "un" });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(hasApiUsageSink()).toBe(true);
    await recordApiUsage({ ...EVENT, operation: "deux" });
    await Promise.all([recordApiUsage({ ...EVENT, operation: "trois" }), recordApiUsage({ ...EVENT, operation: "quatre" })]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.operation)).toEqual(["un", "deux", "trois", "quatre"]);
  });

  it("premiers appels simultanés : une seule ouverture du puits", async () => {
    const { events, sink } = collecting();
    const factory = vi.fn(() => sink);
    setApiUsageSinkFactory(factory);
    await Promise.all(Array.from({ length: 8 }, (_, n) => recordApiUsage({ ...EVENT, operation: `appel-${n}` })));
    expect(factory).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(8);
  });

  it("un puits explicite l'emporte : la fabrique n'est pas appelée", async () => {
    const lazy = collecting();
    const factory = vi.fn(() => lazy.sink);
    setApiUsageSinkFactory(factory);
    const explicit = capture();
    await recordApiUsage(EVENT);
    await trackApiCall(EVENT, async () => "ok");
    expect(factory).not.toHaveBeenCalled();
    expect(explicit).toHaveLength(2);
    expect(lazy.events).toHaveLength(0);
    // Posé après l'ouverture par la fabrique : il la remplace aussi
    setApiUsageSink(null);
    await recordApiUsage(EVENT);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(lazy.events).toHaveLength(1);
    const later = capture();
    await recordApiUsage(EVENT);
    expect(later).toHaveLength(1);
    expect(lazy.events).toHaveLength(1);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("fabrique qui lève : l'événement est abandonné sans rien lever, la fabrique est réessayée à l'appel suivant", async () => {
    mutedWarn();
    const { events, sink } = collecting();
    let attempts = 0;
    const factory = vi.fn(() => {
      attempts++;
      if (attempts <= 2) throw new Error("DATABASE_URL manquante");
      return sink;
    });
    setApiUsageSinkFactory(factory);
    await expect(recordApiUsage({ ...EVENT, operation: "perdu-1" })).resolves.toBeUndefined();
    expect(hasApiUsageSink()).toBe(false);
    // `trackApiCall` rend quand même le résultat de l'appel mesuré
    await expect(trackApiCall({ ...EVENT, operation: "perdu-2" }, async () => "résultat")).resolves.toBe("résultat");
    expect(factory).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(0);
    await recordApiUsage({ ...EVENT, operation: "inscrit" });
    expect(factory).toHaveBeenCalledTimes(3);
    expect(hasApiUsageSink()).toBe(true);
    await recordApiUsage({ ...EVENT, operation: "inscrit-aussi" });
    expect(factory).toHaveBeenCalledTimes(3);
    expect(events.map((event) => event.operation)).toEqual(["inscrit", "inscrit-aussi"]);
  });

  it("fabrique qui ne rend rien : pas de puits, réessayée à l'appel suivant", async () => {
    const factory = vi.fn(() => undefined as unknown as ApiUsageSink);
    setApiUsageSinkFactory(factory);
    await expect(recordApiUsage(EVENT)).resolves.toBeUndefined();
    await expect(recordApiUsage(EVENT)).resolves.toBeUndefined();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(hasApiUsageSink()).toBe(false);
  });

  it("setApiUsageSink(null) retire le puits ouvert par la fabrique : elle est rappelée au prochain appel inscrit", async () => {
    const { events, sink } = collecting();
    const factory = vi.fn(() => sink);
    setApiUsageSinkFactory(factory);
    await recordApiUsage(EVENT);
    setApiUsageSink(null);
    expect(hasApiUsageSink()).toBe(false);
    expect(factory).toHaveBeenCalledTimes(1);
    await recordApiUsage(EVENT);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(2);
  });

  it("setApiUsageSinkFactory(null) retire la fabrique (plus rien n'est ouvert), sans fermer un puits déjà en place", async () => {
    const { events, sink } = collecting();
    const factory = vi.fn(() => sink);
    setApiUsageSinkFactory(factory);
    setApiUsageSinkFactory(null);
    await recordApiUsage(EVENT);
    expect(factory).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
    // Puits ouvert par la fabrique, puis fabrique retirée : le puits reste
    setApiUsageSinkFactory(factory);
    await recordApiUsage(EVENT);
    setApiUsageSinkFactory(null);
    await recordApiUsage(EVENT);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(2);
    expect(hasApiUsageSink()).toBe(true);
  });

  it("la dernière fabrique posée remplace la précédente tant qu'aucun puits n'est ouvert", async () => {
    const first = collecting();
    const second = collecting();
    const firstFactory = vi.fn(() => first.sink);
    setApiUsageSinkFactory(firstFactory);
    setApiUsageSinkFactory(() => second.sink);
    await recordApiUsage(EVENT);
    expect(firstFactory).not.toHaveBeenCalled();
    expect([first.events.length, second.events.length]).toEqual([0, 1]);
  });

  it("le puits ouvert par la fabrique reçoit l'événement complet, avec le contexte de l'appel", async () => {
    const { events, sink } = collecting();
    setApiUsageSinkFactory(() => sink);
    await withApiUsage({ feature: "prospecting", siteId: SITE_A }, () => recordApiUsage({ provider: "google_places", operation: "text_search", units: 1, costUsd: 0.035 }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "google_places", operation: "text_search", feature: "prospecting", siteId: SITE_A, units: 1, costUsd: 0.035, costSource: "tariff", status: "ok" });
  });
});

// ─── usageErrorText ──────────────────────────────────────────────────────────

describe("usageErrorText", () => {
  it("message d'une erreur ou texte brut ; « Erreur inconnue » pour tout le reste", () => {
    expect(usageErrorText(new Error("Places search 403: clé refusée"))).toBe("Places search 403: clé refusée");
    expect(usageErrorText(new TypeError("fetch failed"))).toBe("fetch failed");
    expect(usageErrorText("délai dépassé")).toBe("délai dépassé");
    for (const value of [null, undefined, 42, { message: "objet" }, ["liste"], Symbol("s")]) expect(usageErrorText(value)).toBe("Erreur inconnue");
  });

  it("une seule ligne : blancs repliés, bords rognés ; vide → « Erreur inconnue »", () => {
    expect(usageErrorText(new Error("  Resend 422:\n\t{\n  \"message\": \"Invalid to\"\n}\r\n"))).toBe('Resend 422: { "message": "Invalid to" }');
    expect(usageErrorText(new Error(""))).toBe("Erreur inconnue");
    expect(usageErrorText("   \n\t ")).toBe("Erreur inconnue");
    expect(usageErrorText("")).toBe("Erreur inconnue");
  });

  it(`borné à API_USAGE_ERROR_MAX (${API_USAGE_ERROR_MAX}) caractères`, () => {
    const text = usageErrorText(new Error(`début ${"x".repeat(1_000)}`));
    expect(text).toHaveLength(API_USAGE_ERROR_MAX);
    expect(text.startsWith("début xxx")).toBe(true);
    expect(usageErrorText("y".repeat(API_USAGE_ERROR_MAX))).toHaveLength(API_USAGE_ERROR_MAX);
  });
});

// ─── resolveApiUsageEvent ────────────────────────────────────────────────────

describe("resolveApiUsageEvent", () => {
  const NOW = new Date("2026-11-11T14:32:05.123Z");

  it("valeurs par défaut d'un événement minimal", () => {
    expect(resolveApiUsageEvent({ provider: "pexels", operation: "search" }, NOW)).toEqual({
      provider: "pexels",
      operation: "search",
      feature: null,
      siteId: null,
      model: null,
      status: "ok",
      requests: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      units: 0,
      costUsd: 0,
      costSource: "free",
      durationMs: 0,
      error: null,
      meta: null,
      createdAt: NOW,
    });
  });

  it("événement complet : repris tel quel, sans modifier l'original", () => {
    const meta = { effort: "high", attempt: 1 };
    const event: ApiUsageEvent = {
      provider: "anthropic",
      operation: "messages",
      feature: "blog",
      siteId: SITE_A,
      model: "claude-opus-5",
      status: "error",
      requests: 2,
      inputTokens: 1_200,
      outputTokens: 800,
      cacheReadTokens: 300,
      cacheWriteTokens: 40,
      units: 1,
      costUsd: 0.026,
      costSource: "provider",
      durationMs: 4_321,
      error: "Réponse tronquée",
      meta,
    };
    const frozen = structuredClone(event);
    const resolved = resolveApiUsageEvent(event, NOW);
    expect(resolved).toEqual({ ...event, createdAt: NOW });
    expect(resolved.meta).toBe(meta);
    expect(event).toEqual(frozen);
  });

  it("`createdAt` : l'instant de l'appel par défaut", () => {
    const before = Date.now();
    const { createdAt } = resolveApiUsageEvent(EVENT);
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(createdAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("fonctionnalité et site hérités du contexte quand l'événement ne les porte pas", () => {
    withApiUsage({ feature: "meta_ads", siteId: SITE_A }, () => {
      expect(resolveApiUsageEvent(EVENT, NOW)).toMatchObject({ feature: "meta_ads", siteId: SITE_A });
      expect(resolveApiUsageEvent({ ...EVENT, feature: undefined, siteId: undefined }, NOW)).toMatchObject({ feature: "meta_ads", siteId: SITE_A });
      // L'événement l'emporte sur le contexte, valeur par valeur
      expect(resolveApiUsageEvent({ ...EVENT, feature: "blog" }, NOW)).toMatchObject({ feature: "blog", siteId: SITE_A });
      expect(resolveApiUsageEvent({ ...EVENT, siteId: SITE_B }, NOW)).toMatchObject({ feature: "meta_ads", siteId: SITE_B });
    });
    withApiUsage({ feature: "notifications" }, () => {
      expect(resolveApiUsageEvent(EVENT, NOW)).toMatchObject({ feature: "notifications", siteId: null });
    });
  });

  it("`siteId: null` (ou `feature: null`) explicite l'emporte sur le contexte", () => {
    withApiUsage({ feature: "meta_ads", siteId: SITE_A }, () => {
      expect(resolveApiUsageEvent({ ...EVENT, siteId: null }, NOW)).toMatchObject({ feature: "meta_ads", siteId: null });
      expect(resolveApiUsageEvent({ ...EVENT, feature: null }, NOW)).toMatchObject({ feature: null, siteId: SITE_A });
    });
  });

  it("bornes des textes : opération (80), modèle (120), erreur (300, sur une ligne)", () => {
    const resolved = resolveApiUsageEvent({ provider: "dataforseo", operation: `serp/${"a".repeat(200)}`, model: "m".repeat(300), error: `Erreur :\n\t${"e".repeat(600)}  ` }, NOW);
    expect(resolved.operation).toHaveLength(80);
    expect(resolved.operation.startsWith("serp/aaa")).toBe(true);
    expect(resolved.model).toHaveLength(120);
    expect(resolved.error).toHaveLength(API_USAGE_ERROR_MAX);
    expect(resolved.error!.startsWith("Erreur : eee")).toBe(true);
    // Sous les bornes : inchangés
    expect(resolveApiUsageEvent({ provider: "fal", operation: "image", model: "fal-ai/flux/schnell", error: "fal.ai 500: indisponible" }, NOW)).toMatchObject({ operation: "image", model: "fal-ai/flux/schnell", error: "fal.ai 500: indisponible" });
  });

  it("modèle ou erreur vides, null ou absents : null", () => {
    for (const blank of ["", null, undefined]) expect(resolveApiUsageEvent({ ...EVENT, model: blank, error: blank }, NOW)).toMatchObject({ model: null, error: null });
  });

  it("nombres négatifs, NaN ou infinis : 0 ; tokens, requêtes et durée arrondis à l'entier", () => {
    const bad = resolveApiUsageEvent({ ...EVENT, requests: -2, inputTokens: -10, outputTokens: Number.NaN, cacheReadTokens: Number.POSITIVE_INFINITY, cacheWriteTokens: -0.5, units: -3, costUsd: -1, durationMs: Number.NEGATIVE_INFINITY }, NOW);
    expect(bad).toMatchObject({ requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, units: 0, costUsd: 0, costSource: "free", durationMs: 0 });
    const rounded = resolveApiUsageEvent({ ...EVENT, requests: 2.4, inputTokens: 12.6, outputTokens: 7.4, cacheReadTokens: 0.6, cacheWriteTokens: 99.5, durationMs: 1_234.5 }, NOW);
    expect(rounded).toMatchObject({ requests: 2, inputTokens: 13, outputTokens: 7, cacheReadTokens: 1, cacheWriteTokens: 100, durationMs: 1_235 });
    expect(resolveApiUsageEvent({ ...EVENT, units: Number.NaN, costUsd: Number.NaN }, NOW)).toMatchObject({ units: 0, costUsd: 0 });
  });

  it("requêtes : 1 par défaut, 0 seulement s'il est donné", () => {
    expect(resolveApiUsageEvent(EVENT, NOW).requests).toBe(1);
    expect(resolveApiUsageEvent({ ...EVENT, requests: undefined }, NOW).requests).toBe(1);
    expect(resolveApiUsageEvent({ ...EVENT, requests: 0 }, NOW).requests).toBe(0);
    expect(resolveApiUsageEvent({ ...EVENT, requests: 4 }, NOW).requests).toBe(4);
  });

  it("volume et coût gardent leurs décimales (crédits, millièmes de dollar)", () => {
    expect(resolveApiUsageEvent({ ...EVENT, units: 0.5, costUsd: 0.00188 }, NOW)).toMatchObject({ units: 0.5, costUsd: 0.00188 });
    expect(resolveApiUsageEvent({ ...EVENT, costUsd: 0.0000001 }, NOW).costUsd).toBe(0.0000001);
  });

  it("origine du coût : « free » par défaut sans coût, « tariff » dès qu'il y en a un ; une origine donnée est gardée", () => {
    expect(resolveApiUsageEvent(EVENT, NOW).costSource).toBe("free");
    expect(resolveApiUsageEvent({ ...EVENT, costUsd: 0 }, NOW).costSource).toBe("free");
    expect(resolveApiUsageEvent({ ...EVENT, costUsd: 0.003 }, NOW).costSource).toBe("tariff");
    expect(resolveApiUsageEvent({ ...EVENT, costUsd: -4 }, NOW).costSource).toBe("free");
    // Coût réel nul renvoyé par le fournisseur : l'origine reste « provider »
    expect(resolveApiUsageEvent({ ...EVENT, costUsd: 0, costSource: "provider" }, NOW)).toMatchObject({ costUsd: 0, costSource: "provider" });
    expect(resolveApiUsageEvent({ ...EVENT, costUsd: 7.6, costSource: "provider" }, NOW).costSource).toBe("provider");
    expect(resolveApiUsageEvent({ ...EVENT, costSource: "tariff" }, NOW).costSource).toBe("tariff");
  });

  it("statut « ok » par défaut ; « error » gardé, avec son coût s'il en porte un", () => {
    expect(resolveApiUsageEvent(EVENT, NOW).status).toBe("ok");
    expect(resolveApiUsageEvent({ ...EVENT, status: "error", error: "refusé", costUsd: 0.00188, units: 1 }, NOW)).toMatchObject({ status: "error", error: "refusé", costUsd: 0.00188, units: 1, costSource: "tariff" });
  });
});

// ─── recordApiUsage ──────────────────────────────────────────────────────────

describe("recordApiUsage", () => {
  it("sans puits ni fabrique : sans effet, sans avertissement — même pour un événement invalide", async () => {
    const warn = mutedWarn();
    await expect(recordApiUsage(EVENT)).resolves.toBeUndefined();
    await expect(recordApiUsage({ provider: "fal" } as unknown as ApiUsageEvent)).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("le puits reçoit l'événement complet, une fois, avec le contexte de l'appelant", async () => {
    const events = capture();
    await withApiUsage({ feature: "google_ads", siteId: SITE_A }, () => recordApiUsage({ provider: "dataforseo", operation: "keywords_data/google_ads/keywords_for_keywords/live", units: 1, costUsd: 0.075, costSource: "provider", durationMs: 812 }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "dataforseo", feature: "google_ads", siteId: SITE_A, status: "ok", requests: 1, units: 1, costUsd: 0.075, costSource: "provider", durationMs: 812, error: null, meta: null });
    expect(events[0]!.createdAt).toBeInstanceOf(Date);
  });

  it("attend la fin de l'écriture avant de rendre la main", async () => {
    let written = false;
    setApiUsageSink(async () => {
      await pause(5);
      written = true;
    });
    await recordApiUsage(EVENT);
    expect(written).toBe(true);
  });

  it("puits qui lève de façon synchrone : rien n'est levé, un avertissement est journalisé", async () => {
    const warn = mutedWarn();
    setApiUsageSink(() => {
      throw new Error("connexion refusée");
    });
    await expect(recordApiUsage(EVENT)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toEqual(["[api-usage] appel non enregistré :", "connexion refusée"]);
  });

  it("puits dont la promesse est rejetée (erreur ou valeur quelconque) : rien n'est levé, un avertissement par appel", async () => {
    const warn = mutedWarn();
    setApiUsageSink(async () => {
      throw new Error('relation "api_usage" violates foreign key constraint');
    });
    await expect(recordApiUsage(EVENT)).resolves.toBeUndefined();
    setApiUsageSink(() => Promise.reject("panne"));
    await expect(recordApiUsage(EVENT)).resolves.toBeUndefined();
    expect(warn.mock.calls).toEqual([
      ["[api-usage] appel non enregistré :", 'relation "api_usage" violates foreign key constraint'],
      ["[api-usage] appel non enregistré :", "panne"],
    ]);
  });

  it("événement invalide (opération absente) : rien n'est levé, le puits n'est pas appelé", async () => {
    const warn = mutedWarn();
    const events = capture();
    await expect(recordApiUsage({ provider: "fal" } as unknown as ApiUsageEvent)).resolves.toBeUndefined();
    expect(events).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("puits qui ne rend pas de promesse : accepté", async () => {
    const seen: string[] = [];
    setApiUsageSink(((event: ResolvedApiUsageEvent) => {
      seen.push(event.operation);
    }) as unknown as ApiUsageSink);
    await expect(recordApiUsage(EVENT)).resolves.toBeUndefined();
    expect(seen).toEqual(["search"]);
  });

  it(`puits lent : abandonné après API_USAGE_SINK_TIMEOUT_MS (${API_USAGE_SINK_TIMEOUT_MS} ms), pas avant`, async () => {
    const warn = mutedWarn();
    vi.useFakeTimers();
    setApiUsageSink(() => new Promise<void>(() => {}));
    let done = false;
    const pending = recordApiUsage(EVENT).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(API_USAGE_SINK_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
    expect(API_USAGE_SINK_TIMEOUT_MS).toBe(3_000);
    // L'abandon est signalé (fournisseur et opération seulement), pour qu'un registre incomplet se voie dans les journaux
    expect(warn.mock.calls).toEqual([["[api-usage] appel non enregistré : la base n'a pas répondu à temps", { provider: EVENT.provider, operation: EVENT.operation }]]);
  });

  it("puits abandonné qui échoue plus tard : ni exception ni rejet non géré", async () => {
    const warn = mutedWarn();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      vi.useFakeTimers();
      setApiUsageSink(() => new Promise<void>((_resolve, reject) => setTimeout(() => reject(new Error("base injoignable")), API_USAGE_SINK_TIMEOUT_MS + 2_000)));
      const pending = recordApiUsage(EVENT);
      await vi.advanceTimersByTimeAsync(API_USAGE_SINK_TIMEOUT_MS);
      await expect(pending).resolves.toBeUndefined();
      await vi.advanceTimersByTimeAsync(2_000);
      vi.useRealTimers();
      await pause(5);
      expect(unhandled).toEqual([]);
      // L'abandon est signalé une fois ; l'échec tardif, lui, n'est plus journalisé
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain("la base n'a pas répondu à temps");
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("puits rapide : la minuterie d'abandon est retirée aussitôt", async () => {
    vi.useFakeTimers();
    const events = capture();
    await recordApiUsage(EVENT);
    expect(events).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    // Idem quand le puits échoue
    mutedWarn();
    setApiUsageSink(async () => {
      throw new Error("échec");
    });
    await recordApiUsage(EVENT);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("appels simultanés : chaque événement est inscrit une fois, avec son propre contexte", async () => {
    const events: ResolvedApiUsageEvent[] = [];
    setApiUsageSink(async (event) => {
      // Écritures de durées inégales : l'ordre d'arrivée n'est pas celui des appels
      await pause(event.requests % 3);
      events.push(event);
    });
    const count = 40;
    await Promise.all(
      Array.from({ length: count }, (_, n) =>
        withApiUsage({ feature: n % 2 === 0 ? "blog" : "social", siteId: `site-${n}` }, async () => {
          await pause(n % 4);
          await recordApiUsage({ provider: "anthropic", operation: `appel-${n}`, requests: n + 1, inputTokens: n });
        }),
      ),
    );
    expect(events).toHaveLength(count);
    expect(new Set(events.map((event) => event.operation)).size).toBe(count);
    for (const event of events) {
      const n = event.requests - 1;
      expect(event).toMatchObject({ operation: `appel-${n}`, siteId: `site-${n}`, feature: n % 2 === 0 ? "blog" : "social", inputTokens: n });
    }
  });

  it("un échec du puits ne touche pas les appels voisins", async () => {
    const warn = mutedWarn();
    const events: ResolvedApiUsageEvent[] = [];
    setApiUsageSink(async (event) => {
      if (event.requests % 2 === 0) throw new Error(`échec ${event.requests}`);
      events.push(event);
    });
    await Promise.all(Array.from({ length: 6 }, (_, n) => recordApiUsage({ ...EVENT, requests: n + 1 })));
    expect(events.map((event) => event.requests).sort()).toEqual([1, 3, 5]);
    expect(warn).toHaveBeenCalledTimes(3);
  });
});

// ─── trackApiCall ────────────────────────────────────────────────────────────

describe("trackApiCall", () => {
  const BASE = { provider: "google_places", operation: "text_search" } as const;

  it("succès sans `describe` : résultat rendu tel quel, événement « ok » fait de la base", async () => {
    const events = capture();
    const result = { places: ["a", "b"] };
    const call = vi.fn(async () => result);
    await expect(trackApiCall({ ...BASE, units: 1, costSource: "free", meta: { query: "x" } }, call)).resolves.toBe(result);
    expect(call).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "google_places", operation: "text_search", status: "ok", units: 1, costUsd: 0, costSource: "free", error: null, meta: { query: "x" }, requests: 1 });
  });

  it("succès avec `describe` : reçoit le résultat, complète et remplace la base (volume, coût réel, meta)", async () => {
    const events = capture();
    const describeResult = vi.fn((result: { cost: number; items: number }) => ({ units: result.items, costUsd: result.cost, costSource: "provider" as const, meta: { items: result.items } }));
    const result = { cost: 0.0123, items: 7 };
    await expect(trackApiCall({ provider: "dataforseo", operation: "serp", units: 1, costUsd: 99, meta: { base: true } }, async () => result, describeResult)).resolves.toBe(result);
    expect(describeResult).toHaveBeenCalledTimes(1);
    expect(describeResult).toHaveBeenCalledWith(result);
    expect(events[0]).toMatchObject({ status: "ok", units: 7, costUsd: 0.0123, costSource: "provider", meta: { items: 7 } });
  });

  it("`describe` peut déclarer une réponse reçue mais refusée (`status: \"error\"`) : le résultat est quand même rendu", async () => {
    const events = capture();
    const refused = { sent: false, error: "Resend 422: adresse invalide" };
    await expect(trackApiCall({ provider: "resend", operation: "email", costSource: "free" }, async () => refused, (result) => (result.sent ? { units: 1 } : { status: "error", error: result.error }))).resolves.toBe(refused);
    expect(events[0]).toMatchObject({ provider: "resend", status: "error", error: "Resend 422: adresse invalide", units: 0, costUsd: 0, costSource: "free" });
  });

  it("`describe` qui lève : l'appel reste inscrit (base seule, « ok ») et son résultat est rendu", async () => {
    const events = capture();
    const result = await trackApiCall({ ...BASE, units: 1 }, async () => "réponse", () => {
      throw new Error("lecture du résultat impossible");
    });
    expect(result).toBe("réponse");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "ok", units: 1, costUsd: 0, error: null });
  });

  it("échec : inscrit en « error » sans coût ni volume — même si la base en portait —, erreur d'origine relancée telle quelle", async () => {
    const events = capture();
    const failure = new Error("Places search 403:\n  clé refusée");
    const describeResult = vi.fn(() => ({ units: 5 }));
    const pending = trackApiCall({ ...BASE, units: 1, costUsd: 0.035, costSource: "tariff", meta: { query: "x" } }, async () => {
      throw failure;
    }, describeResult);
    await expect(pending).rejects.toBe(failure);
    expect(describeResult).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "google_places", operation: "text_search", status: "error", units: 0, costUsd: 0, error: "Places search 403: clé refusée", meta: { query: "x" } });
  });

  it("échec : levée synchrone, valeur qui n'est pas une erreur — relancées à l'identique", async () => {
    const events = capture();
    const failure = new TypeError("argument invalide");
    await expect(
      trackApiCall(BASE, (() => {
        throw failure;
      }) as () => Promise<string>),
    ).rejects.toBe(failure);
    const odd = { code: 503 };
    await expect(trackApiCall(BASE, () => Promise.reject(odd))).rejects.toBe(odd);
    await expect(trackApiCall(BASE, () => Promise.reject("panne"))).rejects.toBe("panne");
    expect(events.map((event) => [event.status, event.error])).toEqual([
      ["error", "argument invalide"],
      ["error", "Erreur inconnue"],
      ["error", "panne"],
    ]);
  });

  it("`onError` : un échec qui a pu être facturé garde son coût ; le statut reste « error »", async () => {
    const events = capture();
    const failure = new Error("délai dépassé");
    const onError = vi.fn(() => ({ units: 1, costUsd: 0.00188, costSource: "tariff" as const, meta: { billed: true } }));
    await expect(trackApiCall({ provider: "scrapecreators", operation: "ad_library_ad" }, () => Promise.reject(failure), undefined, onError)).rejects.toBe(failure);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(events[0]).toMatchObject({ status: "error", units: 1, costUsd: 0.00188, costSource: "tariff", error: "délai dépassé", meta: { billed: true } });
    // `onError` ne peut ni changer le statut ni taire l'erreur
    await expect(trackApiCall(BASE, () => Promise.reject(failure), undefined, () => ({ status: "ok", error: null }) as never)).rejects.toBe(failure);
    expect(events[1]).toMatchObject({ status: "error", error: "délai dépassé", units: 0, costUsd: 0 });
  });

  it("`onError` qui lève ou ne rend rien : échec inscrit sans coût, erreur d'origine relancée", async () => {
    const events = capture();
    const failure = new Error("fetch failed");
    await expect(
      trackApiCall({ ...BASE, costUsd: 0.035 }, () => Promise.reject(failure), undefined, () => {
        throw new Error("classement de l'erreur impossible");
      }),
    ).rejects.toBe(failure);
    await expect(trackApiCall({ ...BASE, costUsd: 0.035 }, () => Promise.reject(failure), undefined, () => undefined as never)).rejects.toBe(failure);
    expect(events).toHaveLength(2);
    for (const event of events) expect(event).toMatchObject({ status: "error", units: 0, costUsd: 0, costSource: "free", error: "fetch failed" });
  });

  it("durée mesurée, en succès comme en échec", async () => {
    vi.useFakeTimers();
    const events = capture();
    const success = trackApiCall(BASE, () => new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 250)));
    await vi.advanceTimersByTimeAsync(250);
    await expect(success).resolves.toBe("ok");
    const failure = new Error("trop tard");
    const failed = trackApiCall(BASE, () => new Promise<string>((_resolve, reject) => setTimeout(() => reject(failure), 1_200)));
    const rejection = expect(failed).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(1_200);
    await rejection;
    expect(events.map((event) => [event.status, event.durationMs])).toEqual([
      ["ok", 250],
      ["error", 1_200],
    ]);
  });

  it("`describe` ne peut pas fausser la durée ; `durationMs` de la base est ignoré", async () => {
    vi.useFakeTimers();
    const events = capture();
    const pending = trackApiCall({ ...BASE, durationMs: 9_999 } as never, () => new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 40)), () => ({ durationMs: 5 }) as never);
    await vi.advanceTimersByTimeAsync(40);
    await pending;
    expect(events[0]!.durationMs).toBe(40);
  });

  it("l'événement est inscrit avant que l'appel ne rende la main", async () => {
    const written: string[] = [];
    setApiUsageSink(async (event) => {
      await pause(5);
      written.push(event.status);
    });
    await trackApiCall(BASE, async () => "ok");
    expect(written).toEqual(["ok"]);
    await trackApiCall(BASE, () => Promise.reject(new Error("échec"))).catch(() => undefined);
    expect(written).toEqual(["ok", "error"]);
  });

  it("fonctionnalité et site : ceux du contexte de l'appel, sauf si la base les porte", async () => {
    const events = capture();
    await withApiUsage({ feature: "prospecting", siteId: SITE_A }, async () => {
      await trackApiCall(BASE, async () => "ok");
      await trackApiCall({ ...BASE, feature: "site_editor", siteId: null }, async () => "ok");
      await trackApiCall(BASE, () => Promise.reject(new Error("échec"))).catch(() => undefined);
    });
    await trackApiCall(BASE, async () => "ok");
    expect(events.map((event) => [event.feature, event.siteId, event.status])).toEqual([
      ["prospecting", SITE_A, "ok"],
      ["site_editor", null, "ok"],
      ["prospecting", SITE_A, "error"],
      [null, null, "ok"],
    ]);
  });

  it("le contexte de l'appel mesuré est celui de l'appelant", async () => {
    capture();
    const seen = await withApiUsage({ feature: "google_profile", siteId: SITE_B }, () => trackApiCall(BASE, async () => currentApiUsageContext()));
    expect(seen).toEqual({ feature: "google_profile", siteId: SITE_B });
  });

  it("sans puits : transparent (résultat rendu, erreur relancée)", async () => {
    const failure = new Error("échec");
    await expect(trackApiCall(BASE, async () => 42, () => ({ units: 1 }))).resolves.toBe(42);
    await expect(trackApiCall(BASE, () => Promise.reject(failure))).rejects.toBe(failure);
  });

  it("puits en panne : l'appel mesuré n'en souffre pas", async () => {
    const warn = mutedWarn();
    setApiUsageSink(async () => {
      throw new Error("base injoignable");
    });
    const failure = new Error("échec du fournisseur");
    await expect(trackApiCall(BASE, async () => "résultat")).resolves.toBe("résultat");
    await expect(trackApiCall(BASE, () => Promise.reject(failure))).rejects.toBe(failure);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
