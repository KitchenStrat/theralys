import { afterEach, describe, expect, it, vi } from "vitest";
import { setApiUsageSink, setApiUsageSinkFactory, withApiUsage, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { fetchRegionCommunes } from "./geo";

const SITE_ID = "11111111-1111-4111-8111-111111111111";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(respond: (index: number) => Response | Promise<Response>) {
  const urls: string[] = [];
  const impl = vi.fn(async (input: string | URL | Request) => {
    urls.push(String(input));
    return respond(urls.length - 1);
  });
  return { urls, impl: impl as unknown as typeof fetch };
}

/** Extrait de la réponse de l'API pour l'Occitanie. */
const OCCITANIE = [
  { nom: "Albi", code: "81004", codeDepartement: "81", population: 49_714 },
  { nom: "Castres", code: "81065", codeDepartement: "81", population: 42_672 },
  { nom: "Toulouse", code: "31555", codeDepartement: "31", population: 504_078 },
];

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
  vi.restoreAllMocks();
});

describe("fetchRegionCommunes — registre des appels API", () => {
  it("région chargée : un événement geo_api / communes, gratuit, autant d'unités que de communes, rattaché au contexte", async () => {
    const events = capture();
    const { urls, impl } = stubFetch(() => jsonResponse(OCCITANIE));
    const communes = await withApiUsage({ feature: "meta_ads", siteId: SITE_ID }, () => fetchRegionCommunes("76", { fetchImpl: impl, retryDelayMs: 0 }));
    expect(communes).toHaveLength(3);
    expect(urls).toHaveLength(1);
    expect(events).toHaveLength(1);
    const { createdAt, durationMs, ...event } = events[0]!;
    expect(event).toEqual({
      provider: "geo_api",
      operation: "communes",
      feature: "meta_ads",
      siteId: SITE_ID,
      model: null,
      status: "ok",
      requests: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      units: 3,
      costUsd: 0,
      costSource: "free",
      error: null,
      meta: null,
    });
    expect(createdAt).toBeInstanceOf(Date);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("unités : les communes retenues (les entrées invalides ne comptent pas) ; liste vide → 0 unité, appel compté", async () => {
    const events = capture();
    const { impl } = stubFetch((index) => jsonResponse(index === 0 ? [...OCCITANIE, { nom: "Sans département" }, { nom: "", codeDepartement: "81" }, null, "x"] : []));
    await expect(fetchRegionCommunes("76", { fetchImpl: impl, retryDelayMs: 0 })).resolves.toHaveLength(3);
    await expect(fetchRegionCommunes("76", { fetchImpl: impl, retryDelayMs: 0 })).resolves.toEqual([]);
    expect(events.map((event) => [event.status, event.units, event.costSource])).toEqual([
      ["ok", 3, "free"],
      ["ok", 0, "free"],
    ]);
  });

  it("premier essai en échec, relance aboutie : un seul événement, abouti", async () => {
    const events = capture();
    const { urls, impl } = stubFetch((index) => (index === 0 ? new Response("Bad gateway", { status: 502 }) : jsonResponse(OCCITANIE)));
    await expect(fetchRegionCommunes("76", { fetchImpl: impl, retryDelayMs: 0 })).resolves.toHaveLength(3);
    expect(urls).toHaveLength(2);
    expect(events.map((event) => [event.status, event.units])).toEqual([["ok", 3]]);
  });

  it("deux essais en échec : un événement en erreur, sans unité, l'erreur de la relance est relancée", async () => {
    const events = capture();
    const { urls, impl } = stubFetch((index) => (index === 0 ? new Response("Bad gateway", { status: 502 }) : jsonResponse({ message: "inattendu" })));
    await expect(withApiUsage({ feature: "meta_ads", siteId: SITE_ID }, () => fetchRegionCommunes("76", { fetchImpl: impl, retryDelayMs: 0 }))).rejects.toThrow("geo.api.gouv.fr : réponse inattendue");
    expect(urls).toHaveLength(2);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "geo_api", operation: "communes", feature: "meta_ads", siteId: SITE_ID, status: "error", units: 0, costUsd: 0, costSource: "free", error: "geo.api.gouv.fr : réponse inattendue" });
  });

  it("connexion impossible deux fois : inscrite en erreur une seule fois", async () => {
    const events = capture();
    const { urls, impl } = stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchRegionCommunes("76", { fetchImpl: impl, retryDelayMs: 0 })).rejects.toThrow("fetch failed");
    expect(urls).toHaveLength(2);
    expect(events.map((event) => [event.status, event.error])).toEqual([["error", "fetch failed"]]);
  });

  it("code de région invalide : refusé avant tout appel, rien n'est inscrit", async () => {
    const events = capture();
    const { urls, impl } = stubFetch(() => jsonResponse(OCCITANIE));
    for (const code of ["", "7", "760", "2A", "76&x=1"]) await expect(fetchRegionCommunes(code, { fetchImpl: impl, retryDelayMs: 0 })).rejects.toThrow(/Code de région invalide/);
    expect(urls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("sans puits : les communes sont rendues, l'erreur relancée", async () => {
    const { impl } = stubFetch((index) => (index === 0 ? jsonResponse(OCCITANIE) : new Response("", { status: 500 })));
    await expect(fetchRegionCommunes("76", { fetchImpl: impl, retryDelayMs: 0 })).resolves.toHaveLength(3);
    await expect(fetchRegionCommunes("76", { fetchImpl: impl, retryDelayMs: 0 })).rejects.toThrow("geo.api.gouv.fr HTTP 500");
  });
});
