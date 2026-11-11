import { afterEach, describe, expect, it, vi } from "vitest";
import { setApiUsageSink, setApiUsageSinkFactory, withApiUsage, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { MetaAdLibraryError, MetaAdLibraryProvider, MockAdLibraryProvider } from "./index";

const TOKEN = "EAAB-jeton-secret-0123456789abcdef";
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const SEARCH = { term: "sophrologue albi", country: "FR", activeStatus: "ALL" } as const;

type Call = { url: string };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: string | URL | Request) => {
    const call: Call = { url: String(input) };
    calls.push(call);
    return respond(call, calls.length - 1);
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

function provider(fetchImpl: typeof fetch) {
  return new MetaAdLibraryProvider(TOKEN, fetchImpl, { retryDelayMs: 0, timeoutMs: 5_000 });
}

/** Annonces d'une page de résultats (identifiants distincts). */
const ads = (count: number, prefix = "70000000000") => Array.from({ length: count }, (_, n) => ({ id: `${prefix}${String(n).padStart(4, "0")}`, page_id: "987654321", page_name: "Cabinet Martin", ad_creative_bodies: ["Une pause pour respirer."] }));

/** Lien de page suivante tel que Graph le renvoie (il embarque le jeton). */
const nextLink = (cursor: string) => `https://graph.facebook.com/v23.0/ads_archive?access_token=${TOKEN}&after=${cursor}`;

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

describe("MetaAdLibraryProvider.searchAds — registre des appels API", () => {
  it("une page : un événement meta_ad_library / ads_archive, gratuit, autant d'unités que d'annonces, rattaché au contexte", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(() => jsonResponse({ data: ads(7) }));
    const result = await withApiUsage({ feature: "meta_ads", siteId: SITE_ID }, () => provider(impl).searchAds(SEARCH));
    expect(result).toMatchObject({ calls: 1, truncated: false });
    expect(result.ads).toHaveLength(7);
    expect(calls).toHaveLength(1);
    expect(events).toHaveLength(1);
    const { createdAt, durationMs, ...event } = events[0]!;
    expect(event).toEqual({
      provider: "meta_ad_library",
      operation: "ads_archive",
      feature: "meta_ads",
      siteId: SITE_ID,
      model: null,
      status: "ok",
      requests: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      units: 7,
      costUsd: 0,
      costSource: "free",
      error: null,
      meta: null,
    });
    expect(createdAt).toBeInstanceOf(Date);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("plusieurs pages : un événement par page, chacun avec les annonces de sa page", async () => {
    const events = capture();
    const pages = [
      { data: ads(5, "7100000000"), paging: { next: nextLink("p2") } },
      { data: ads(3, "7200000000"), paging: { next: nextLink("p3") } },
      { data: ads(1, "7300000000") },
    ];
    const { calls, impl } = stubFetch((_call, index) => jsonResponse(pages[index]));
    const result = await withApiUsage({ feature: "meta_ads", siteId: SITE_ID }, () => provider(impl).searchAds({ ...SEARCH, maxPages: 3 }));
    expect(result).toMatchObject({ calls: 3, truncated: false });
    expect(calls).toHaveLength(3);
    expect(events.map((event) => [event.operation, event.status, event.units, event.costUsd, event.costSource, event.feature, event.siteId])).toEqual([
      ["ads_archive", "ok", 5, 0, "free", "meta_ads", SITE_ID],
      ["ads_archive", "ok", 3, 0, "free", "meta_ads", SITE_ID],
      ["ads_archive", "ok", 1, 0, "free", "meta_ads", SITE_ID],
    ]);
    expect(events.reduce((sum, event) => sum + event.units, 0)).toBe(result.ads.length);
  });

  it("pages au-delà de `maxPages` : jamais demandées, jamais inscrites", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(() => jsonResponse({ data: ads(4), paging: { next: nextLink("suite") } }));
    const result = await provider(impl).searchAds({ ...SEARCH, maxPages: 2 });
    expect(result).toMatchObject({ calls: 2, truncated: true });
    expect(calls).toHaveLength(2);
    expect(events.map((event) => event.units)).toEqual([4, 4]);
  });

  it("unités : les annonces retenues (un item sans identifiant ne compte pas) ; page vide → 0 unité, appel compté", async () => {
    const events = capture();
    const { impl } = stubFetch((_call, index) => jsonResponse(index === 0 ? { data: [...ads(2), { page_name: "Sans identifiant" }, null, "x"] } : { data: [] }));
    const library = provider(impl);
    await library.searchAds(SEARCH);
    await library.searchAds(SEARCH);
    expect(events.map((event) => [event.status, event.units, event.requests])).toEqual([
      ["ok", 2, 1],
      ["ok", 0, 1],
    ]);
  });

  it("terme vide : aucun appel, rien n'est inscrit", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(() => jsonResponse({ data: ads(1) }));
    await expect(provider(impl).searchAds({ ...SEARCH, term: "   " })).resolves.toEqual({ ads: [], calls: 0, truncated: false });
    expect(calls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("jeton refusé (code 190) : un événement en erreur, sans unité, l'erreur d'origine est relancée", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(() => jsonResponse({ error: { message: "Error validating access token: Session has expired.", type: "OAuthException", code: 190, error_subcode: 463 } }, 400));
    const pending = withApiUsage({ feature: "meta_ads", siteId: SITE_ID }, () => provider(impl).searchAds(SEARCH));
    const err = await pending.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(MetaAdLibraryError);
    expect(calls).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "meta_ad_library", operation: "ads_archive", feature: "meta_ads", siteId: SITE_ID, status: "error", units: 0, costUsd: 0, costSource: "free", error: (err as Error).message });
    expect(events[0]!.error).toContain("code 190");
  });

  it("erreur transitoire puis succès : la relance fait partie de la page, un seul événement abouti", async () => {
    const events = capture();
    const { calls, impl } = stubFetch((_call, index) => (index === 0 ? new Response("Bad gateway", { status: 502 }) : jsonResponse({ data: ads(6) })));
    await provider(impl).searchAds(SEARCH);
    expect(calls).toHaveLength(2);
    expect(events.map((event) => [event.status, event.units])).toEqual([["ok", 6]]);
  });

  it("erreur transitoire deux fois : un seul événement en erreur pour la page", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(() => new Response("Service unavailable", { status: 503 }));
    await expect(provider(impl).searchAds(SEARCH)).rejects.toBeInstanceOf(MetaAdLibraryError);
    expect(calls).toHaveLength(2);
    expect(events.map((event) => [event.status, event.units])).toEqual([["error", 0]]);
    expect(events[0]!.error).toContain("HTTP 503");
  });

  it("deuxième page en échec : la première reste inscrite aboutie, la seconde en erreur", async () => {
    const events = capture();
    const { impl } = stubFetch((_call, index) => (index === 0 ? jsonResponse({ data: ads(5), paging: { next: nextLink("p2") } }) : jsonResponse({ error: { message: "Application request limit reached", code: 4 } }, 400)));
    await expect(provider(impl).searchAds({ ...SEARCH, maxPages: 3 })).rejects.toBeInstanceOf(MetaAdLibraryError);
    expect(events.map((event) => [event.status, event.units])).toEqual([
      ["ok", 5],
      ["error", 0],
    ]);
  });

  it("le jeton n'entre dans aucun événement, même quand Graph le recopie dans son message d'erreur", async () => {
    const events = capture();
    const { impl } = stubFetch((_call, index) =>
      index === 0
        ? jsonResponse({ data: ads(2), paging: { next: nextLink("p2") } })
        : jsonResponse({ error: { message: `Invalid OAuth access token ${TOKEN} — see https://graph.facebook.com/v23.0/ads_archive?access_token=${TOKEN}&limit=100`, code: 190 } }, 400),
    );
    await provider(impl).searchAds({ ...SEARCH, maxPages: 2 }).catch(() => undefined);
    expect(events).toHaveLength(2);
    expect(events[1]!.status).toBe("error");
    const dump = JSON.stringify(events);
    expect(dump).not.toContain(TOKEN);
    expect(dump).not.toContain(TOKEN.slice(0, 16));
    // Le terme recherché n'y figure pas non plus
    expect(dump).not.toContain(SEARCH.term);
  });

  it("recherches simultanées de deux sites : chaque événement porte le contexte de son appel", async () => {
    const events = capture();
    const { impl } = stubFetch((call) => jsonResponse({ data: ads(call.url.includes("albi") ? 3 : 8) }));
    const library = provider(impl);
    await Promise.all([
      withApiUsage({ feature: "meta_ads", siteId: "site-a" }, () => library.searchAds(SEARCH)),
      withApiUsage({ feature: "meta_ads", siteId: "site-b" }, () => library.searchAds({ ...SEARCH, term: "naturopathe castres" })),
    ]);
    expect(events.map((event) => [event.siteId, event.units]).sort()).toEqual([
      ["site-a", 3],
      ["site-b", 8],
    ]);
  });

  it("sans puits : la recherche aboutit, l'erreur est relancée", async () => {
    const { impl } = stubFetch((_call, index) => (index === 0 ? jsonResponse({ data: ads(2) }) : jsonResponse({ error: { message: "Invalid parameter", code: 100 } }, 400)));
    const library = provider(impl);
    await expect(library.searchAds(SEARCH)).resolves.toMatchObject({ calls: 1 });
    await expect(library.searchAds(SEARCH)).rejects.toBeInstanceOf(MetaAdLibraryError);
  });
});

describe("MockAdLibraryProvider — registre des appels API", () => {
  it("veille de démonstration : rien n'est inscrit", async () => {
    const events = capture();
    const result = await new MockAdLibraryProvider({ now: new Date("2026-10-26T06:00:00Z") }).searchAds(SEARCH);
    expect(result.calls).toBe(1);
    expect(events).toHaveLength(0);
  });
});
