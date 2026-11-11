import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { setApiUsageSink, setApiUsageSinkFactory, withApiUsage, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { completeStructured } from "./anthropic";

// ─── SDK Anthropic simulé ────────────────────────────────────────────────────
// `completeStructured` crée son client (`new Anthropic({ apiKey })`) puis appelle
// `client.beta.messages.stream(params).finalMessage()` : chaque appel consomme la réponse suivante du scénario.

type Scripted = { message?: Record<string, unknown>; error?: unknown; delayMs?: number };

const sdk = vi.hoisted(() => ({
  script: [] as Scripted[],
  requests: [] as Record<string, unknown>[],
  clients: [] as Record<string, unknown>[],
}));

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    readonly beta = {
      messages: {
        stream: (params: Record<string, unknown>) => {
          sdk.requests.push(params);
          const next = sdk.script.shift();
          return {
            finalMessage: async () => {
              if (!next) throw new Error("réponse non prévue par le scénario du test");
              if (next.delayMs) await new Promise((resolve) => setTimeout(resolve, next.delayMs));
              if (next.error !== undefined) throw next.error;
              return next.message;
            },
          };
        },
      },
    };

    constructor(options: Record<string, unknown>) {
      sdk.clients.push(options);
    }
  }
  return { default: FakeAnthropic };
});

const API_KEY = "sk-ant-test-cle-secrete-0123456789";
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const SYSTEM = "Tu rédiges la page d'accueil d'un cabinet de sophrologie.";
const PROMPT = "Cabinet de Claire Martin, sophrologue à Albi.";
const schema = z.object({ titre: z.string(), texte: z.string() });
const VALID = { titre: "Sophrologie à Albi", texte: "Un accompagnement tout en douceur, à votre rythme." };

/** Réponse de l'API (sous-ensemble de `BetaMessage` lu par `completeStructured`). */
function message(text: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_details: null,
    usage: { input_tokens: 1_200, output_tokens: 800, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, iterations: null },
    ...overrides,
  };
}

const json = (value: unknown) => JSON.stringify(value);

function capture(): ResolvedApiUsageEvent[] {
  const events: ResolvedApiUsageEvent[] = [];
  setApiUsageSink(async (event) => {
    events.push(event);
  });
  return events;
}

function run(opts: Partial<Parameters<typeof completeStructured>[0]> = {}) {
  return completeStructured({ apiKey: API_KEY, ...opts }, SYSTEM, PROMPT, schema);
}

beforeEach(() => {
  sdk.script.length = 0;
  sdk.requests.length = 0;
  sdk.clients.length = 0;
  // Le modèle et la profondeur de réflexion ne dépendent pas de l'environnement de la machine
  vi.stubEnv("ANTHROPIC_MODEL", undefined);
  vi.stubEnv("ANTHROPIC_EFFORT", undefined);
});

afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("completeStructured — registre des appels API", () => {
  it("une tentative aboutie : un événement anthropic / messages avec tokens, coût au barème et notes de l'appel", async () => {
    const events = capture();
    sdk.script.push({ message: message(json(VALID)) });
    const result = await withApiUsage({ feature: "site_generation", siteId: SITE_ID }, () => run());
    expect(result).toEqual(VALID);
    expect(sdk.requests).toHaveLength(1);
    expect(sdk.requests[0]).toMatchObject({ model: "claude-opus-5", output_config: { effort: "high" }, fallbacks: [{ model: "claude-opus-4-8" }] });
    expect(sdk.clients).toEqual([{ apiKey: API_KEY }]);
    expect(events).toHaveLength(1);
    const { createdAt, durationMs, ...event } = events[0]!;
    expect(event).toEqual({
      provider: "anthropic",
      operation: "messages",
      feature: "site_generation",
      siteId: SITE_ID,
      model: "claude-opus-5",
      status: "ok",
      requests: 1,
      inputTokens: 1_200,
      outputTokens: 800,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      units: 0,
      // (1 200 × 5 + 800 × 25) / 1 000 000
      costUsd: 0.026,
      costSource: "tariff",
      error: null,
      meta: { effort: "high", attempt: 1, stopReason: "end_turn" },
    });
    expect(createdAt).toBeInstanceOf(Date);
    expect(Number.isInteger(durationMs)).toBe(true);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("modèle et profondeur de réflexion choisis par l'appelant ou l'environnement : repris dans l'événement", async () => {
    const events = capture();
    sdk.script.push({ message: message(json(VALID), { model: "claude-haiku-5-5" }) }, { message: message(json(VALID), { model: "claude-sonnet-5-5" }) });
    await run({ model: "claude-haiku-5-5", effort: "low" });
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-5-5");
    vi.stubEnv("ANTHROPIC_EFFORT", "medium");
    await run();
    expect(sdk.requests.map((request) => request.model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    expect(events.map((event) => [event.model, event.costUsd, event.meta])).toEqual([
      // 1 200 × 0,1 + 800 × 0,5 = 520 millionièmes ; 1 200 × 2 + 800 × 10 = 10 400 millionièmes
      ["claude-haiku-5-5", 0.00052, { effort: "low", attempt: 1, stopReason: "end_turn" }],
      ["claude-sonnet-5-5", 0.0104, { effort: "medium", attempt: 1, stopReason: "end_turn" }],
    ]);
    // Hors de tout contexte : appel non attribué
    expect(events.map((event) => [event.feature, event.siteId])).toEqual([[null, null], [null, null]]);
  });

  it("cache de prompts : tokens lus et écrits repris, coût à leur facteur", async () => {
    const events = capture();
    sdk.script.push({ message: message(json(VALID), { usage: { input_tokens: 1_000, output_tokens: 500, cache_creation_input_tokens: 2_000, cache_read_input_tokens: 10_000, iterations: null } }) });
    await run();
    expect(events[0]).toMatchObject({ inputTokens: 1_000, outputTokens: 500, cacheWriteTokens: 2_000, cacheReadTokens: 10_000, costUsd: 0.035 });
  });

  it("JSON invalide puis valide : deux événements (tentatives 1 et 2), tous deux facturés", async () => {
    const events = capture();
    sdk.script.push(
      { message: message("Voici la page demandée : {titre", { usage: { input_tokens: 1_000, output_tokens: 400 } }) },
      { message: message(json(VALID), { usage: { input_tokens: 1_300, output_tokens: 900 } }) },
    );
    await expect(withApiUsage({ feature: "blog", siteId: SITE_ID }, () => run())).resolves.toEqual(VALID);
    expect(sdk.requests).toHaveLength(2);
    // La relance explique l'échec de la première réponse
    const retryPrompt = (sdk.requests[1]!.messages as { content: string }[])[0]!.content;
    expect(retryPrompt.startsWith(PROMPT)).toBe(true);
    expect(retryPrompt).toContain("JSON valide");
    expect(events.map((event) => [event.status, event.meta?.attempt, event.inputTokens, event.outputTokens, event.costUsd, event.feature, event.siteId])).toEqual([
      ["ok", 1, 1_000, 400, 0.015, "blog", SITE_ID],
      ["ok", 2, 1_300, 900, 0.029, "blog", SITE_ID],
    ]);
  });

  it("JSON valide mais hors format (schéma zod) puis conforme : deux événements", async () => {
    const events = capture();
    sdk.script.push({ message: message(json({ titre: 42 })) }, { message: message(`\`\`\`json\n${json(VALID)}\n\`\`\``) });
    await expect(run()).resolves.toEqual(VALID);
    expect(events.map((event) => event.meta)).toEqual([
      { effort: "high", attempt: 1, stopReason: "end_turn" },
      { effort: "high", attempt: 2, stopReason: "end_turn" },
    ]);
    expect(events.every((event) => event.costUsd === 0.026)).toBe(true);
  });

  it("formulation interdite (marketing éthique) puis réponse conforme : la relance est un second appel facturé", async () => {
    const events = capture();
    sdk.script.push({ message: message(json({ titre: "Résultats garantis", texte: "Une méthode miraculeuse." })) }, { message: message(json(VALID)) });
    await expect(run()).resolves.toEqual(VALID);
    expect((sdk.requests[1]!.messages as { content: string }[])[0]!.content).toContain("formulations interdites");
    expect(events.map((event) => [event.status, event.meta?.attempt, event.costUsd])).toEqual([
      ["ok", 1, 0.026],
      ["ok", 2, 0.026],
    ]);
  });

  it("oubli massif du gras (option `emphasis`) : la relance de mise en forme est un second appel facturé ; sans l'option, un seul appel", async () => {
    const events = capture();
    const pageSchema = z.object({ titre: z.string(), paragraphs: z.array(z.string()) });
    const plain = ["Le cabinet vous accueille du lundi au samedi, dans un cadre calme et lumineux.", "Chaque séance commence par un temps d'écoute, puis des exercices simples à refaire chez vous.", "Les rendez-vous se prennent en ligne en quelques clics, avec une réponse sous vingt-quatre heures."];
    const flat = { titre: "Le cabinet", paragraphs: plain };
    const bold = { titre: "Le cabinet", paragraphs: plain.map((text) => text.replace("séance", "**séance**").replace("cabinet", "**cabinet**").replace("rendez-vous", "**rendez-vous**")) };
    sdk.script.push({ message: message(json(flat)) }, { message: message(json(bold)) }, { message: message(json(flat)) });
    await expect(completeStructured({ apiKey: API_KEY, emphasis: true }, SYSTEM, PROMPT, pageSchema)).resolves.toEqual(bold);
    expect((sdk.requests[1]!.messages as { content: string }[])[0]!.content).toContain("MISE EN FORME");
    expect(events.map((event) => [event.status, event.meta?.attempt, event.costUsd])).toEqual([
      ["ok", 1, 0.026],
      ["ok", 2, 0.026],
    ]);
    await expect(completeStructured({ apiKey: API_KEY }, SYSTEM, PROMPT, pageSchema)).resolves.toEqual(flat);
    expect(sdk.requests).toHaveLength(3);
    expect(events).toHaveLength(3);
    expect(events[2]!.meta).toEqual({ effort: "high", attempt: 1, stopReason: "end_turn" });
  });

  it("deux tentatives infructueuses : deux événements facturés, puis la dernière erreur est levée", async () => {
    const events = capture();
    sdk.script.push({ message: message("pas du json") }, { message: message(json({ titre: "Guérison garantie", texte: "Sans aucun danger." })) });
    await expect(run()).rejects.toThrow(/Contenu non conforme au marketing éthique/);
    expect(sdk.requests).toHaveLength(2);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.status)).toEqual(["ok", "ok"]);
    expect(events.reduce((sum, event) => sum + event.costUsd, 0)).toBeCloseTo(0.052, 9);
  });

  it("erreur de l'API : un événement en erreur, sans coût ni tokens, et l'erreur d'origine est relancée", async () => {
    const events = capture();
    const failure = Object.assign(new Error('429 {"type":"error","error":{"type":"rate_limit_error",\n"message":"Trop de requêtes"}}'), { status: 429 });
    sdk.script.push({ error: failure });
    await expect(withApiUsage({ feature: "social", siteId: SITE_ID }, () => run({ effort: "medium" }))).rejects.toBe(failure);
    expect(sdk.requests).toHaveLength(1);
    expect(events).toHaveLength(1);
    const { createdAt: _createdAt, durationMs: _durationMs, ...event } = events[0]!;
    expect(event).toEqual({
      provider: "anthropic",
      operation: "messages",
      feature: "social",
      siteId: SITE_ID,
      // Aucune réponse : le modèle demandé
      model: "claude-opus-5",
      status: "error",
      requests: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      units: 0,
      costUsd: 0,
      costSource: "free",
      error: '429 {"type":"error","error":{"type":"rate_limit_error", "message":"Trop de requêtes"}}',
      meta: { effort: "medium", attempt: 1 },
    });
  });

  it("erreur de l'API à la relance : la première tentative reste facturée, la seconde est inscrite en erreur", async () => {
    const events = capture();
    const failure = new Error("529 overloaded_error");
    sdk.script.push({ message: message("{") }, { error: failure });
    await expect(run()).rejects.toBe(failure);
    expect(events.map((event) => [event.status, event.meta?.attempt, event.costUsd, event.error])).toEqual([
      ["ok", 1, 0.026, null],
      ["error", 2, 0, "529 overloaded_error"],
    ]);
  });

  it("erreur qui n'est pas une Error (valeur rejetée) : inscrite quand même, relancée telle quelle", async () => {
    const events = capture();
    const odd = { status: 500 };
    sdk.script.push({ error: odd });
    await expect(run()).rejects.toBe(odd);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "error", error: "Erreur inconnue", costUsd: 0 });
  });

  it("requête déclinée (stop_reason « refusal ») : l'appel est inscrit avant que la fonction ne lève, sans relance", async () => {
    const events = capture();
    sdk.script.push({
      message: message("", { content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "Contenu sensible" }, usage: { input_tokens: 900, output_tokens: 12 } }),
    });
    await expect(withApiUsage({ feature: "meta_ads", siteId: SITE_ID }, () => run())).rejects.toThrow("Requête déclinée par les garde-fous du modèle : Contenu sensible");
    expect(sdk.requests).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      provider: "anthropic",
      operation: "messages",
      feature: "meta_ads",
      siteId: SITE_ID,
      status: "ok",
      inputTokens: 900,
      outputTokens: 12,
      // (900 × 5 + 12 × 25) / 1 000 000
      costUsd: 0.0048,
      meta: { effort: "high", attempt: 1, stopReason: "refusal" },
    });
  });

  it("réponse tronquée (stop_reason « max_tokens ») : inscrite et facturée avant l'erreur, sans relance", async () => {
    const events = capture();
    sdk.script.push({ message: message('{"titre":"Sophro', { stop_reason: "max_tokens", usage: { input_tokens: 1_000, output_tokens: 32_000 } }) });
    await expect(run()).rejects.toThrow(/max_tokens/);
    expect(sdk.requests).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "ok", outputTokens: 32_000, costUsd: 0.805, meta: { attempt: 1, stopReason: "max_tokens" } });
  });

  it("repli côté serveur : modèle servi enregistré, modèle demandé et repli notés, chaque modèle à son prix", async () => {
    const events = capture();
    sdk.script.push({
      message: message(json(VALID), {
        model: "claude-opus-4-8",
        usage: {
          input_tokens: 1_000,
          output_tokens: 3_000,
          iterations: [
            { type: "message", model: "claude-fable-5-2", input_tokens: 1_000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
            { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 1_000, output_tokens: 3_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          ],
        },
      }),
    });
    await expect(run({ model: "claude-fable-5-2" })).resolves.toEqual(VALID);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ model: "claude-opus-4-8", inputTokens: 2_000, outputTokens: 3_200, costUsd: 0.096, costSource: "tariff" });
    expect(events[0]!.meta).toEqual({ requestedModel: "claude-fable-5-2", fallback: true, effort: "high", attempt: 1, stopReason: "end_turn" });
  });

  it("modèle servi absent du barème : coût au prix de repli, signalé dans les notes", async () => {
    const events = capture();
    sdk.script.push({ message: message(json(VALID), { model: "claude-nova-1" }) });
    await run({ model: "claude-nova-1" });
    expect(events[0]).toMatchObject({ model: "claude-nova-1", costUsd: 0.026 });
    expect(events[0]!.meta).toEqual({ priceUnknown: true, effort: "high", attempt: 1, stopReason: "end_turn" });
  });

  it("durée de l'appel mesurée, en succès comme en erreur", async () => {
    vi.useFakeTimers();
    const events = capture();
    const failure = new Error("503 service indisponible");
    sdk.script.push({ message: message(json(VALID)), delayMs: 1_500 }, { error: failure, delayMs: 700 });
    const success = run();
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(success).resolves.toEqual(VALID);
    const failed = run();
    const rejection = expect(failed).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(700);
    await rejection;
    expect(events.map((event) => [event.status, event.durationMs])).toEqual([
      ["ok", 1_500],
      ["error", 700],
    ]);
  });

  it("ni la clé, ni les consignes, ni le texte produit n'entrent dans les événements", async () => {
    const events = capture();
    sdk.script.push({ message: message("pas du json") }, { message: message(json(VALID)) }, { error: new Error("401 authentication_error") });
    await run();
    await run().catch(() => undefined);
    expect(events).toHaveLength(3);
    const dump = JSON.stringify(events);
    for (const secret of [API_KEY, SYSTEM, PROMPT, VALID.titre, VALID.texte]) expect(dump).not.toContain(secret);
  });

  it("sans puits : rien ne casse (résultat rendu, erreur relancée, refus signalé)", async () => {
    const failure = new Error("500 api_error");
    sdk.script.push({ message: message(json(VALID)) }, { error: failure }, { message: message("", { content: [], stop_reason: "refusal", stop_details: null }) });
    await expect(run()).resolves.toEqual(VALID);
    await expect(run()).rejects.toBe(failure);
    await expect(run()).rejects.toThrow("Requête déclinée par les garde-fous du modèle : raison inconnue");
    expect(sdk.requests).toHaveLength(3);
  });

  it("puits en panne : la génération aboutit quand même, l'erreur de l'API reste celle d'origine", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setApiUsageSink(async () => {
      throw new Error("base injoignable");
    });
    const failure = new Error("500 api_error");
    sdk.script.push({ message: message(json(VALID)) }, { error: failure });
    await expect(run()).resolves.toEqual(VALID);
    await expect(run()).rejects.toBe(failure);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
