import { afterEach, describe, expect, it, vi } from "vitest";
import { setApiUsageSink, setApiUsageSinkFactory, withApiUsage, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { MockImageProvider } from "./images";
import { MockStockProvider, PexelsStockProvider, findStockOrGenerate } from "./stock";

const KEY = "pexels-cle-secrete-0123456789abcdef";
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST = { query: "peaceful sleep rest cozy bedroom", width: 1024, height: 576 };

type Call = { url: string; headers: Record<string, string> };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

const photos = (count: number) => ({ photos: Array.from({ length: count }, (_, n) => ({ id: n, src: { original: `https://images.pexels.com/photos/${1000 + n}/pexels-photo.jpeg` } })) });

/** Remplace `fetch` global (le fournisseur Pexels n'accepte pas de `fetch` injecté). */
function stubFetch(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const call: Call = { url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()) };
      calls.push(call);
      return respond(call, calls.length - 1);
    }),
  );
  return calls;
}

function capture(): ResolvedApiUsageEvent[] {
  const events: ResolvedApiUsageEvent[] = [];
  setApiUsageSink(async (event) => {
    events.push(event);
  });
  return events;
}

afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PexelsStockProvider — registre des appels API", () => {
  it("recherche aboutie : un événement pexels / search, gratuit, une unité, rattaché au contexte", async () => {
    const events = capture();
    const calls = stubFetch(() => jsonResponse(photos(4)));
    const found = await withApiUsage({ feature: "site_editor", siteId: SITE_ID }, () => new PexelsStockProvider(KEY).find(REQUEST));
    expect(found?.provider).toBe("pexels");
    expect(calls).toHaveLength(1);
    expect(events).toHaveLength(1);
    const { createdAt, durationMs, ...event } = events[0]!;
    expect(event).toEqual({
      provider: "pexels",
      operation: "search",
      feature: "site_editor",
      siteId: SITE_ID,
      model: null,
      status: "ok",
      requests: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      units: 1,
      costUsd: 0,
      costSource: "free",
      error: null,
      meta: null,
    });
    expect(createdAt).toBeInstanceOf(Date);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("aucun résultat : la recherche a eu lieu, elle est comptée (null rendu)", async () => {
    const events = capture();
    stubFetch(() => jsonResponse({ photos: [] }));
    await expect(new PexelsStockProvider(KEY).find(REQUEST)).resolves.toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "pexels", operation: "search", status: "ok", units: 1, costUsd: 0, costSource: "free" });
  });

  it("erreur HTTP (limite de débit) : événement en erreur, sans unité, erreur relancée ; la clé n'y figure pas", async () => {
    const events = capture();
    stubFetch(() => new Response("Too Many Requests", { status: 429 }));
    await expect(withApiUsage({ feature: "blog" }, () => new PexelsStockProvider(KEY).find(REQUEST))).rejects.toThrow("Pexels 429: Too Many Requests");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "pexels", operation: "search", feature: "blog", siteId: null, status: "error", units: 0, costUsd: 0, costSource: "free", error: "Pexels 429: Too Many Requests" });
    expect(JSON.stringify(events)).not.toContain(KEY);
  });

  it("connexion impossible : inscrite en erreur, l'erreur d'origine est relancée", async () => {
    const events = capture();
    const failure = new TypeError("fetch failed");
    stubFetch(() => {
      throw failure;
    });
    await expect(new PexelsStockProvider(KEY).find(REQUEST)).rejects.toBe(failure);
    expect(events[0]).toMatchObject({ status: "error", error: "fetch failed", units: 0 });
  });

  it("findStockOrGenerate : la recherche en échec reste inscrite, le repli de démonstration n'inscrit rien", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const events = capture();
    stubFetch(() => new Response("panne", { status: 503 }));
    const image = await withApiUsage({ feature: "blog", siteId: SITE_ID }, () => findStockOrGenerate(new PexelsStockProvider(KEY), new MockImageProvider(), { query: REQUEST.query, subject: "Sommeil", width: 1024, height: 576 }));
    expect(image).toMatchObject({ aiGenerated: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(events.map((event) => [event.provider, event.status, event.feature, event.siteId])).toEqual([["pexels", "error", "blog", SITE_ID]]);
  });

  it("sans puits : la photo est rendue, l'erreur relancée", async () => {
    stubFetch((_call, index) => (index === 0 ? jsonResponse(photos(1)) : new Response("clé refusée", { status: 401 })));
    const provider = new PexelsStockProvider(KEY);
    await expect(provider.find(REQUEST)).resolves.toMatchObject({ provider: "pexels" });
    await expect(provider.find(REQUEST)).rejects.toThrow("Pexels 401: clé refusée");
  });
});

describe("MockStockProvider — registre des appels API", () => {
  it("photo de démonstration : aucun appel externe, rien n'est inscrit", async () => {
    const events = capture();
    const calls = stubFetch(() => jsonResponse({}));
    await new MockStockProvider().find(REQUEST);
    expect(calls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});
