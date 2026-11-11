import { afterEach, describe, expect, it, vi } from "vitest";
import { SCRAPECREATORS_CREDIT_USD } from "@theralys/shared";
import { setApiUsageSink, setApiUsageSinkFactory, withApiUsage, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { AdMediaError, MockAdMediaProvider, ScrapeCreatorsMediaProvider } from "./media";

const KEY = "sc-cle-secrete-0123456789abcdef";
const AD_ID = "1234567890123456";
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE = "https://scontent-cdg4-2.xx.fbcdn.net/v/t39.35426-6/origine.jpg?oe=6AF90589";

type Call = { url: string; signal: AbortSignal | null };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Réponse de `GET /v1/facebook/adLibrary/ad` pour une annonce trouvée. */
function found(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { success: true, credits_remaining: 4821, ad_archive_id: AD_ID, snapshot: { display_format: "IMAGE", images: [{ original_image_url: IMAGE }], videos: [], cards: [] }, ...overrides };
}

function stubFetch(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = { url: String(input), signal: init?.signal ?? null };
    calls.push(call);
    return respond(call, calls.length - 1);
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

function provider(fetchImpl: typeof fetch, options: { timeoutMs?: number } = {}) {
  return new ScrapeCreatorsMediaProvider(KEY, fetchImpl, { retryDelayMs: 0, timeoutMs: 5_000, ...options });
}

function capture(): ResolvedApiUsageEvent[] {
  const events: ResolvedApiUsageEvent[] = [];
  setApiUsageSink(async (event) => {
    events.push(event);
  });
  return events;
}

/** Un crédit compté au barème. */
const CREDIT = { units: 1, costUsd: SCRAPECREATORS_CREDIT_USD, costSource: "tariff" } as const;
/** Échec qui n'a rien coûté. */
const NO_CREDIT = { units: 0, costUsd: 0, costSource: "free" } as const;

afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  vi.restoreAllMocks();
});

describe("ScrapeCreatorsMediaProvider.lookup — registre des appels API", () => {
  it("annonce trouvée : un événement scrapecreators / ad_library_ad, un crédit au barème, solde noté, rattaché au contexte", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(() => jsonResponse(found()));
    const media = await withApiUsage({ feature: "meta_ads", siteId: SITE_ID }, () => provider(impl).lookup(AD_ID));
    expect(media).toMatchObject({ adId: AD_ID, format: "image" });
    expect(calls).toHaveLength(1);
    expect(events).toHaveLength(1);
    const { createdAt, durationMs, ...event } = events[0]!;
    expect(event).toEqual({
      provider: "scrapecreators",
      operation: "ad_library_ad",
      feature: "meta_ads",
      siteId: SITE_ID,
      model: null,
      status: "ok",
      requests: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      units: 1,
      costUsd: 47 / 25_000,
      costSource: "tariff",
      error: null,
      meta: { found: true, creditsRemaining: 4821 },
    });
    expect(createdAt).toBeInstanceOf(Date);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("annonce introuvable (success: false, réponse sans snapshot, 404) : le fournisseur a répondu, le crédit est compté, `found: false`", async () => {
    const events = capture();
    const responses = [jsonResponse({ success: false, credits_remaining: 4820, message: "No ad found for this id" }), jsonResponse({ success: true, credits_remaining: 4819 }), jsonResponse({ success: false, message: "Ad not found" }, 404)];
    const { impl } = stubFetch((_call, index) => responses[index]!);
    const scraper = provider(impl);
    for (let n = 0; n < 3; n++) await expect(scraper.lookup(AD_ID)).resolves.toBeNull();
    expect(events).toHaveLength(3);
    for (const event of events) expect(event).toMatchObject({ status: "ok", ...CREDIT, error: null });
    // Le 404 ne porte pas de solde : le dernier solde connu est repris
    expect(events.map((event) => event.meta)).toEqual([
      { found: false, creditsRemaining: 4820 },
      { found: false, creditsRemaining: 4819 },
      { found: false, creditsRemaining: 4819 },
    ]);
  });

  it("solde jamais communiqué : `creditsRemaining` null", async () => {
    const events = capture();
    const { impl } = stubFetch(() => jsonResponse(found({ credits_remaining: undefined })));
    await provider(impl).lookup(AD_ID);
    expect(events[0]!.meta).toEqual({ found: true, creditsRemaining: null });
  });

  it("identifiant d'annonce invalide : aucun appel, rien n'est inscrit", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(() => jsonResponse(found()));
    const scraper = provider(impl);
    for (const id of ["", "abc", "1234", "12ab34", "1".repeat(26), "123456&x=1"]) await expect(scraper.lookup(id)).resolves.toBeNull();
    expect(calls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("clé refusée (401, 403), crédits épuisés (402), limite de débit (429), autre refus (400) : en erreur, aucun crédit compté", async () => {
    for (const status of [401, 403, 402, 429, 400]) {
      const events = capture();
      const { calls, impl } = stubFetch(() => jsonResponse({ success: false, message: "Refusé" }, status));
      await expect(withApiUsage({ feature: "meta_ads", siteId: SITE_ID }, () => provider(impl).lookup(AD_ID))).rejects.toBeInstanceOf(AdMediaError);
      expect(calls).toHaveLength(1);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ provider: "scrapecreators", operation: "ad_library_ad", feature: "meta_ads", siteId: SITE_ID, status: "error", ...NO_CREDIT, error: `ScrapeCreators HTTP ${status} : Refusé`, meta: null });
    }
  });

  it("5xx deux fois, ou connexion impossible deux fois : rien n'a pu être facturé, aucun crédit compté — un seul événement pour les deux tentatives", async () => {
    const events = capture();
    const down = stubFetch((_call, index) => jsonResponse({ message: "Bad gateway" }, index === 0 ? 502 : 503));
    await expect(provider(down.impl).lookup(AD_ID)).rejects.toMatchObject({ kind: "retry" });
    const dead = stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(provider(dead.impl).lookup(AD_ID)).rejects.toMatchObject({ kind: "retry" });
    expect([down.calls.length, dead.calls.length]).toEqual([2, 2]);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ status: "error", ...NO_CREDIT, error: "ScrapeCreators HTTP 503 : Bad gateway" });
    expect(events[1]).toMatchObject({ status: "error", ...NO_CREDIT, error: "ScrapeCreators réseau : fetch failed" });
  });

  it("délai dépassé : la recherche a pu être facturée, l'échec est inscrit avec son crédit", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          call.signal?.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")));
        }),
    );
    await expect(withApiUsage({ feature: "meta_ads", siteId: SITE_ID }, () => provider(impl, { timeoutMs: 5 }).lookup(AD_ID))).rejects.toMatchObject({ kind: "transient" });
    expect(calls).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "error", ...CREDIT, feature: "meta_ads", siteId: SITE_ID, meta: null });
    expect(events[0]!.error).toMatch(/^ScrapeCreators réseau : /);
  });

  it("réponse 200 illisible (HTML, JSON qui n'est pas un objet) : elle a pu être facturée, crédit compté", async () => {
    const events = capture();
    const html = stubFetch(() => new Response("<html><body>Bad gateway</body></html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    await expect(provider(html.impl).lookup(AD_ID)).rejects.toMatchObject({ kind: "transient" });
    const list = stubFetch(() => jsonResponse([found()]));
    await expect(provider(list.impl).lookup(AD_ID)).rejects.toMatchObject({ kind: "transient" });
    expect(events).toHaveLength(2);
    for (const event of events) expect(event).toMatchObject({ status: "error", ...CREDIT, error: "ScrapeCreators : réponse illisible" });
  });

  it("erreur d'une autre nature (ni réseau ni refus HTTP) : dans le doute, le crédit est compté", async () => {
    const events = capture();
    // Réponse dont la lecture du statut échoue : l'erreur n'est pas une AdMediaError
    const broken = {
      text: async () => "{}",
      get status(): number {
        throw new RangeError("réponse corrompue");
      },
    } as unknown as Response;
    const { impl } = stubFetch(() => broken);
    const err = await provider(impl)
      .lookup(AD_ID)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(RangeError);
    expect(err).not.toBeInstanceOf(AdMediaError);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "error", ...CREDIT, error: "réponse corrompue" });
  });

  it("5xx puis succès : la relance fait partie de la recherche — un événement, un crédit", async () => {
    const events = capture();
    const { calls, impl } = stubFetch((_call, index) => (index === 0 ? jsonResponse({ message: "Internal error" }, 500) : jsonResponse(found({ credits_remaining: 12 }))));
    await expect(provider(impl).lookup(AD_ID)).resolves.toMatchObject({ adId: AD_ID });
    expect(calls).toHaveLength(2);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "ok", requests: 1, ...CREDIT, meta: { found: true, creditsRemaining: 12 } });
  });

  it("5xx puis délai dépassé : l'échec final a pu être facturé, crédit compté ; 5xx puis clé refusée : aucun crédit", async () => {
    const events = capture();
    const late = stubFetch((call, index) =>
      index === 0
        ? jsonResponse({ message: "Internal error" }, 500)
        : new Promise<Response>((_resolve, reject) => {
            call.signal?.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")));
          }),
    );
    await expect(provider(late.impl, { timeoutMs: 5 }).lookup(AD_ID)).rejects.toMatchObject({ kind: "transient" });
    const refused = stubFetch((_call, index) => (index === 0 ? jsonResponse({ message: "Internal error" }, 500) : jsonResponse({ message: "Unauthorized" }, 401)));
    await expect(provider(refused.impl).lookup(AD_ID)).rejects.toMatchObject({ kind: "auth" });
    expect(events.map((event) => [event.status, event.units, event.costUsd])).toEqual([
      ["error", 1, SCRAPECREATORS_CREDIT_USD],
      ["error", 0, 0],
    ]);
  });

  it("la clé n'entre dans aucun événement, même recopiée par le serveur ou par l'erreur réseau", async () => {
    const events = capture();
    const echoed = stubFetch(() => jsonResponse({ message: `Invalid API key: ${KEY}` }, 401));
    await provider(echoed.impl).lookup(AD_ID).catch(() => undefined);
    const network = stubFetch(() => {
      throw new TypeError(`request failed, headers: {"x-api-key":"${KEY}"}`);
    });
    await provider(network.impl).lookup(AD_ID).catch(() => undefined);
    const ok = stubFetch(() => jsonResponse(found()));
    await provider(ok.impl).lookup(AD_ID);
    expect(events).toHaveLength(3);
    const dump = JSON.stringify(events);
    expect(dump).not.toContain(KEY);
    expect(dump).not.toContain(AD_ID);
    expect(events[0]!.error).toContain("Invalid API key");
  });

  it("lot de recherches simultanées : un événement par annonce, chacun avec le contexte de son appel", async () => {
    const events = capture();
    const { impl } = stubFetch((call) => (call.url.endsWith("7") ? jsonResponse({ success: false, credits_remaining: 90 }) : jsonResponse(found({ credits_remaining: 91 }))));
    const scraper = provider(impl);
    const ids = ["700000000000001", "700000000000002", "700000000000007", "700000000000004"];
    await Promise.all(ids.map((id, n) => withApiUsage({ feature: "meta_ads", siteId: `site-${n % 2}` }, () => scraper.lookup(id))));
    expect(events).toHaveLength(4);
    expect(events.filter((event) => event.siteId === "site-0")).toHaveLength(2);
    expect(events.filter((event) => event.siteId === "site-1")).toHaveLength(2);
    expect(events.filter((event) => (event.meta as { found: boolean }).found)).toHaveLength(3);
    expect(events.reduce((sum, event) => sum + event.costUsd, 0)).toBeCloseTo(4 * SCRAPECREATORS_CREDIT_USD, 9);
  });

  it("sans puits : les visuels sont rendus, l'erreur relancée", async () => {
    const { impl } = stubFetch((_call, index) => (index === 0 ? jsonResponse(found()) : jsonResponse({ message: "Payment required" }, 402)));
    const scraper = provider(impl);
    await expect(scraper.lookup(AD_ID)).resolves.toMatchObject({ adId: AD_ID });
    await expect(scraper.lookup(AD_ID)).rejects.toMatchObject({ kind: "credits" });
  });
});

describe("MockAdMediaProvider — registre des appels API", () => {
  it("visuels de démonstration : rien n'est inscrit", async () => {
    const events = capture();
    await expect(new MockAdMediaProvider().lookup(AD_ID)).resolves.toMatchObject({ adId: AD_ID });
    expect(events).toHaveLength(0);
  });
});
