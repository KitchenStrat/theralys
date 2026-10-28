import { describe, expect, it, vi } from "vitest";
import { META_GRAPH_VERSION_DEFAULT, META_LIBRARY_PAGE_LIMIT, metaLibraryUrl, scopeOfAd } from "@theralys/shared";
import {
  META_ADS_ARCHIVE_FIELDS,
  META_GRAPH_BASE,
  META_RECORD_LIMITS,
  META_TIMEOUT_MS,
  META_TRANSIENT_CODES,
  MetaAdLibraryError,
  MetaAdLibraryProvider,
  MockAdLibraryProvider,
  adRecordFromItem,
  adsArchiveUrl,
  boundedText,
  createAdLibraryProvider,
  isMetaRetryable,
  isMetaStrippedCodePoint,
  isMetaTokenError,
  isoDateOrNull,
  metaGraphVersion,
  mockLibraryAds,
  nextPageUrl,
  redactMetaToken,
  targetAgesFrom,
} from "./index";

const TOKEN = "EAAB-jeton-secret-0123456789abcdef";
const NOW = new Date("2026-10-26T06:00:00Z");

type Call = { url: string; method: string; headers: Record<string, string>; signal: AbortSignal | null };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = { url: String(input), method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()), signal: init?.signal ?? null };
    calls.push(call);
    return respond(call, calls.length - 1);
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

function provider(fetchImpl: typeof fetch, options: { version?: string } = {}) {
  return new MetaAdLibraryProvider(TOKEN, fetchImpl, { retryDelayMs: 0, timeoutMs: 5_000, ...options });
}

const ITEM = {
  id: "1234567890",
  page_id: 987654321,
  page_name: "Cabinet  Martin",
  ad_creation_time: "2026-09-01T10:00:00+0000",
  ad_delivery_start_time: "2026-09-02",
  ad_delivery_stop_time: null,
  ad_creative_bodies: ["Une pause pour respirer.", "  ", 42],
  ad_creative_link_titles: ["Sophrologie à Albi"],
  ad_creative_link_descriptions: [],
  ad_creative_link_captions: ["cabinet-martin.fr"],
  ad_snapshot_url: `https://www.facebook.com/ads/archive/render_ad/?id=1234567890&access_token=${TOKEN}`,
  publisher_platforms: ["facebook", "instagram"],
  languages: ["fr"],
  eu_total_reach: "12500",
  target_ages: "25-54",
  target_gender: "All",
  target_locations: [
    { name: "Albi", type: "city", excluded: false },
    { name: "Toulouse", type: "city", excluded: true },
    { type: "city" },
    "x",
  ],
  beneficiary_payers: [{ beneficiary: "Cabinet Martin", payer: "Cabinet Martin SARL", current: true }],
};

describe("requête ads_archive", () => {
  it("adsArchiveUrl : version, endpoint et paramètres imposés", () => {
    const url = new URL(adsArchiveUrl({ version: "v22.0", token: TOKEN, term: "sophrologue albi", country: "FR", activeStatus: "ALL", limit: 100 }));
    expect(url.origin).toBe(META_GRAPH_BASE);
    expect(url.pathname).toBe("/v22.0/ads_archive");
    expect(url.searchParams.get("access_token")).toBe(TOKEN);
    expect(url.searchParams.get("ad_type")).toBe("ALL");
    expect(url.searchParams.get("ad_reached_countries")).toBe('["FR"]');
    expect(url.searchParams.get("search_terms")).toBe("sophrologue albi");
    expect(url.searchParams.get("search_type")).toBe("KEYWORD_UNORDERED");
    expect(url.searchParams.get("ad_active_status")).toBe("ALL");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("fields")).toBe(META_ADS_ARCHIVE_FIELDS);
    // ad_snapshot_url n'est jamais demandé (il embarque le jeton) ; délai borné à 15 s
    expect(META_ADS_ARCHIVE_FIELDS.split(",")).not.toContain("ad_snapshot_url");
    expect(META_ADS_ARCHIVE_FIELDS.split(",")).toContain("target_ages");
    expect(META_TIMEOUT_MS).toBe(15_000);
  });

  it("searchAds : GET avec le jeton, limite bornée à 100, statut ACTIVE transmis, version de l'environnement", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse({ data: [ITEM] }));
    const result = await provider(impl, { version: "v23.0" }).searchAds({ term: "  sophrologue   albi ", country: "FR", activeStatus: "ACTIVE", limit: 500 });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(calls[0]!.method).toBe("GET");
    expect(url.pathname).toBe("/v23.0/ads_archive");
    expect(url.searchParams.get("access_token")).toBe(TOKEN);
    expect(url.searchParams.get("search_terms")).toBe("sophrologue albi");
    expect(url.searchParams.get("ad_active_status")).toBe("ACTIVE");
    expect(url.searchParams.get("limit")).toBe(String(META_LIBRARY_PAGE_LIMIT));
    expect(result).toMatchObject({ calls: 1, truncated: false });
    expect(result.ads).toHaveLength(1);
    expect(result.ads[0]!.id).toBe("1234567890");
  });

  it("searchAds : terme vide → aucun appel", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse({ data: [] }));
    expect(await provider(impl).searchAds({ term: "   ", country: "FR", activeStatus: "ALL" })).toEqual({ ads: [], calls: 0, truncated: false });
    expect(calls).toHaveLength(0);
  });

  it("metaGraphVersion : META_GRAPH_VERSION valide, sinon la version par défaut", () => {
    expect(metaGraphVersion({ META_GRAPH_VERSION: "v21.0" } as NodeJS.ProcessEnv)).toBe("v21.0");
    expect(metaGraphVersion({ META_GRAPH_VERSION: "latest" } as NodeJS.ProcessEnv)).toBe(META_GRAPH_VERSION_DEFAULT);
    expect(metaGraphVersion({} as NodeJS.ProcessEnv)).toBe(META_GRAPH_VERSION_DEFAULT);
  });

  it("redactMetaToken : le paramètre access_token et la valeur du jeton disparaissent", () => {
    const text = `GET https://graph.facebook.com/v22.0/ads_archive?access_token=${TOKEN}&limit=100 et aussi ${TOKEN} brut, encodé access_token%3D${TOKEN}%26x`;
    const redacted = redactMetaToken(text, TOKEN);
    expect(redacted).not.toContain(TOKEN);
    expect(redacted).toContain("access_token=***");
    expect(redacted).toContain("&limit=100");
  });
});

describe("normalisation adRecordFromItem", () => {
  it("item complet : identifiants en texte, listes nettoyées, dates ISO, portée numérique, zones { name, type, excluded }, payeur", () => {
    const ad = adRecordFromItem(ITEM);
    expect(ad).not.toBeNull();
    expect(ad).toMatchObject({
      id: "1234567890",
      pageId: "987654321",
      pageName: "Cabinet Martin",
      bodies: ["Une pause pour respirer."],
      titles: ["Sophrologie à Albi"],
      descriptions: [],
      captions: ["cabinet-martin.fr"],
      libraryUrl: metaLibraryUrl("1234567890"),
      startedAt: "2026-09-02T00:00:00.000Z",
      stoppedAt: null,
      platforms: ["facebook", "instagram"],
      languages: ["fr"],
      euTotalReach: 12500,
      targetAges: "25-54",
      targetGender: "All",
      targetLocations: [
        { name: "Albi", type: "city", excluded: false },
        { name: "Toulouse", type: "city", excluded: true },
      ],
      payer: "Cabinet Martin SARL",
    });
    // Le lien public ne reprend jamais ad_snapshot_url (il porte le jeton)
    expect(JSON.stringify(ad)).not.toContain(TOKEN);
  });

  it("item minimal : champs absents → tableaux vides et null, page sans nom", () => {
    expect(adRecordFromItem({ id: 42 })).toEqual({
      id: "42",
      pageId: null,
      pageName: "",
      bodies: [],
      titles: [],
      descriptions: [],
      captions: [],
      libraryUrl: metaLibraryUrl("42"),
      startedAt: null,
      stoppedAt: null,
      platforms: [],
      languages: [],
      euTotalReach: null,
      targetAges: null,
      targetGender: null,
      targetLocations: [],
      payer: null,
    });
  });

  it("target_ages en liste (API réelle) → « 18-65+ » ; en texte → tel quel ; sinon null", () => {
    expect(targetAgesFrom(["18", "65+"])).toBe("18-65+");
    expect(targetAgesFrom([25, "54"])).toBe("25-54");
    expect(targetAgesFrom("25-54")).toBe("25-54");
    expect(targetAgesFrom([])).toBeNull();
    expect(targetAgesFrom(null)).toBeNull();
    expect(adRecordFromItem({ ...ITEM, target_ages: ["18", "65+"] })!.targetAges).toBe("18-65+");
    // Le mock produit la même forme
    expect(mockLibraryAds("sophrologue", { now: NOW, locality: null }).every((ad) => ad.targetAges === null || /^\d{2}-\d{2}\+?$/.test(ad.targetAges))).toBe(true);
  });

  it("textes bornés : 3 textes de 1 000 caractères, 3 titres / descriptions / légendes de 200, page de 120 ; caractères de contrôle et de direction retirés", () => {
    const long = (n: number) => Array.from({ length: n }, (_, i) => `mot${i}`).join(" ");
    const ad = adRecordFromItem({
      ...ITEM,
      page_name: `Cabinet ‮Martin‬ ${"très ".repeat(40)}long`,
      ad_creative_bodies: [long(400), "Deuxième\u0000 texte‏ propre", "Troisième", "Quatrième de trop"],
      ad_creative_link_titles: [long(80), "T2", "T3", "T4"],
      ad_creative_link_descriptions: ["D1⁦⁩", "D2", "D3", "D4", "D5"],
      ad_creative_link_captions: ["C1", "C2", "C3", "C4"],
      target_locations: [{ name: `Albi‎ ${"x".repeat(200)}`, type: "city", excluded: false }],
    })!;
    expect(ad.bodies).toHaveLength(META_RECORD_LIMITS.bodies.count);
    expect(ad.bodies[0]!.length).toBeLessThanOrEqual(META_RECORD_LIMITS.bodies.length);
    expect(ad.bodies[0]!.endsWith(" ")).toBe(false);
    expect(ad.bodies[1]).toBe("Deuxième texte propre");
    expect(ad.titles).toHaveLength(META_RECORD_LIMITS.titles.count);
    expect(ad.titles[0]!.length).toBeLessThanOrEqual(META_RECORD_LIMITS.titles.length);
    expect(ad.descriptions).toEqual(["D1", "D2", "D3"]);
    expect(ad.captions).toHaveLength(3);
    expect(ad.pageName.length).toBeLessThanOrEqual(META_RECORD_LIMITS.pageName);
    expect(ad.pageName.startsWith("Cabinet Martin")).toBe(true);
    expect(ad.targetLocations[0]!.name.length).toBeLessThanOrEqual(META_RECORD_LIMITS.short);
    for (const text of [ad.pageName, ...ad.bodies, ...ad.descriptions, ...ad.targetLocations.map((l) => l.name)]) {
      expect([...text].some((ch) => isMetaStrippedCodePoint(ch.codePointAt(0) ?? 0))).toBe(false);
    }
    // Blancs repliés (jamais retirés), contrôle C0 / C1, marques de direction, ALM et BOM retirés
    expect([0x09, 0x0a, 0x0d, 0x20, 0x41, 0xe9].some(isMetaStrippedCodePoint)).toBe(false);
    expect([0x00, 0x07, 0x0b, 0x0c, 0x1f, 0x7f, 0x9f, 0x200e, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069, 0x061c, 0xfeff].every(isMetaStrippedCodePoint)).toBe(true);
    expect(boundedText("  a \n b  ", 10)).toBe("a b");
    expect(boundedText("", 10)).toBeNull();
    expect(boundedText("\u0007", 10)).toBeNull();
    expect(boundedText("abcdefghij klmnop", 12)).toBe("abcdefghij");
    expect(boundedText("abcdefghijklmnopqrstuvwxyz", 12)).toBe("abcdefghijkl");
  });

  it("item malformé : sans identifiant, non objet, dates invalides, portée négative ou texte", () => {
    expect(adRecordFromItem({ page_name: "Cabinet X" })).toBeNull();
    expect(adRecordFromItem(null)).toBeNull();
    expect(adRecordFromItem("1234")).toBeNull();
    expect(adRecordFromItem({ id: "   " })).toBeNull();
    const ad = adRecordFromItem({ id: "7", ad_delivery_start_time: "pas une date", ad_delivery_stop_time: 12, eu_total_reach: -5, target_locations: "Albi", beneficiary_payers: [{ current: true }] });
    expect(ad).toMatchObject({ id: "7", startedAt: null, stoppedAt: null, euTotalReach: null, targetLocations: [], payer: null });
    expect(adRecordFromItem({ id: "8", eu_total_reach: "beaucoup" })!.euTotalReach).toBeNull();
  });

  it("isoDateOrNull : décalage « +0000 » accepté, date seule en UTC", () => {
    expect(isoDateOrNull("2026-09-01T10:00:00+0000")).toBe("2026-09-01T10:00:00.000Z");
    expect(isoDateOrNull("2026-09-01T12:00:00+02:00")).toBe("2026-09-01T10:00:00.000Z");
    expect(isoDateOrNull("2026-09-01")).toBe("2026-09-01T00:00:00.000Z");
    expect(isoDateOrNull("")).toBeNull();
    expect(isoDateOrNull("hier")).toBeNull();
  });
});

describe("pagination", () => {
  const NEXT = `https://graph.facebook.com/v22.0/ads_archive?access_token=${TOKEN}&after=CURSOR&limit=100`;

  it("suit paging.next jusqu'à maxPages : 2 pages → calls 2, annonces concaténées, non tronqué", async () => {
    const { calls, impl } = stubFetch((_call, index) =>
      index === 0 ? jsonResponse({ data: [{ ...ITEM, id: "1" }, { ...ITEM, id: "2" }], paging: { cursors: { after: "CURSOR" }, next: NEXT } }) : jsonResponse({ data: [{ ...ITEM, id: "3" }], paging: { cursors: { after: "FIN" } } }),
    );
    const result = await provider(impl).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL", maxPages: 3 });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toBe(NEXT);
    expect(result.calls).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.ads.map((a) => a.id)).toEqual(["1", "2", "3"]);
  });

  it("truncated quand maxPages est atteint alors qu'une page suivante existe (défaut : une page)", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse({ data: [ITEM], paging: { next: NEXT } }));
    const result = await provider(impl).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL" });
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({ calls: 1, truncated: true });
    const two = await provider(impl).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL", maxPages: 2 });
    expect(two).toMatchObject({ calls: 2, truncated: true });
  });

  it("items malformés écartés ; `data` vide accepté", async () => {
    const { impl } = stubFetch(() => jsonResponse({ data: [ITEM, null, "x", { page_name: "sans id" }] }));
    expect((await provider(impl).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL" })).ads).toHaveLength(1);
    const { impl: empty } = stubFetch(() => jsonResponse({ data: [] }));
    expect(await provider(empty).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL" })).toEqual({ ads: [], calls: 1, truncated: false });
  });

  it("réponse 200 non JSON, vide ou sans tableau `data` → erreur transitoire (une relance), message sans jeton", async () => {
    const html = stubFetch(() => new Response(`<html>Maintenance ${TOKEN}</html>`, { status: 200, headers: { "Content-Type": "text/html" } }));
    const htmlErr = (await provider(html.impl).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL" }).catch((e: unknown) => e)) as MetaAdLibraryError;
    expect(htmlErr).toBeInstanceOf(MetaAdLibraryError);
    expect(htmlErr.transient).toBe(true);
    expect(htmlErr.status).toBe(200);
    expect(htmlErr.message).toContain("non JSON");
    expect(htmlErr.message).not.toContain(TOKEN);
    expect(html.calls).toHaveLength(2);
    const noData = stubFetch(() => jsonResponse({ paging: {} }));
    const noDataErr = (await provider(noData.impl).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL" }).catch((e: unknown) => e)) as MetaAdLibraryError;
    expect(noDataErr.transient).toBe(true);
    expect(noDataErr.message).toContain("sans tableau data");
    const blank = stubFetch(() => new Response("", { status: 200 }));
    expect(((await provider(blank.impl).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL" }).catch((e: unknown) => e)) as MetaAdLibraryError).transient).toBe(true);
    // Une relance qui aboutit répare la veille
    const flaky = stubFetch((_call, index) => (index === 0 ? new Response("<html>", { status: 200 }) : jsonResponse({ data: [ITEM] })));
    expect((await provider(flaky.impl).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL" })).ads).toHaveLength(1);
  });

  it("paging.next : seul un https sur graph.facebook.com est suivi (autre hôte, http, texte illisible → ignoré, non tronqué)", async () => {
    expect(nextPageUrl(NEXT)).toBe(NEXT);
    expect(nextPageUrl(`https://evil.example.com/v22.0/ads_archive?access_token=${TOKEN}`)).toBeNull();
    expect(nextPageUrl(`https://graph.facebook.com.evil.example/v22.0/ads_archive`)).toBeNull();
    expect(nextPageUrl(`http://graph.facebook.com/v22.0/ads_archive?after=x`)).toBeNull();
    expect(nextPageUrl("pas une url")).toBeNull();
    const { calls, impl } = stubFetch(() => jsonResponse({ data: [ITEM], paging: { next: `https://evil.example.com/ads_archive?access_token=${TOKEN}` } }));
    const result = await provider(impl).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL", maxPages: 3 });
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({ calls: 1, truncated: false });
  });
});

describe("erreurs", () => {
  const search = (impl: typeof fetch) => provider(impl).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL" });

  it("code 190 : jeton invalide ou expiré, non transitoire, sans relance, message sans jeton", async () => {
    const { calls, impl } = stubFetch(() =>
      jsonResponse({ error: { message: `Error validating access token: Session has expired (access_token=${TOKEN})`, type: "OAuthException", code: 190, error_subcode: 463 } }, 400),
    );
    const err = await search(impl).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MetaAdLibraryError);
    const meta = err as MetaAdLibraryError;
    expect(meta.status).toBe(400);
    expect(meta.code).toBe(190);
    expect(meta.transient).toBe(false);
    expect(isMetaTokenError(meta)).toBe(true);
    expect(meta.message).toContain("code 190");
    expect(meta.message).toContain("sous-code 463");
    expect(meta.message).not.toContain(TOKEN);
    expect(calls).toHaveLength(1);
  });

  it("HTTP 429 sans code Graph : transitoire, une relance après le délai puis succès", async () => {
    const { calls, impl } = stubFetch((_call, index) => (index === 0 ? new Response("Too Many Requests", { status: 429 }) : jsonResponse({ data: [ITEM] })));
    const result = await search(impl);
    expect(calls).toHaveLength(2);
    expect(result).toMatchObject({ calls: 1, truncated: false });
    expect(result.ads).toHaveLength(1);
  });

  it("codes de fenêtre horaire 4 / 17 / 32 / 613 : transitoires (message « réessayez ») mais jamais relancés sur-le-champ", async () => {
    for (const code of META_TRANSIENT_CODES) {
      const { calls, impl } = stubFetch(() => jsonResponse({ error: { message: "Too many calls", code } }, code === 4 ? 429 : 400));
      const err = (await search(impl).catch((e: unknown) => e)) as MetaAdLibraryError;
      expect(err, String(code)).toBeInstanceOf(MetaAdLibraryError);
      expect(err.transient, String(code)).toBe(true);
      expect(err.code).toBe(code);
      expect(isMetaRetryable(err)).toBe(false);
      expect(calls, String(code)).toHaveLength(1);
    }
    expect(isMetaRetryable(new MetaAdLibraryError("x", { status: 500, transient: true }))).toBe(true);
    expect(isMetaRetryable(new MetaAdLibraryError("x", { status: 400, code: 100 }))).toBe(false);
    expect(isMetaRetryable(new Error("x"))).toBe(false);
  });

  it("HTTP 500 deux fois : erreur transitoire après l'unique relance", async () => {
    const { calls, impl } = stubFetch(() => new Response("<html>Internal Server Error</html>", { status: 500, statusText: "Internal Server Error" }));
    const err = await search(impl).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MetaAdLibraryError);
    expect((err as MetaAdLibraryError).transient).toBe(true);
    expect((err as MetaAdLibraryError).status).toBe(500);
    expect((err as MetaAdLibraryError).message).toContain("HTTP 500");
    expect(calls).toHaveLength(2);
  });

  it("code Graph 17 ou 613 sur un statut 400 : transitoire sans relance ; code 100 : non transitoire, pas de relance", async () => {
    const limit = stubFetch(() => jsonResponse({ error: { message: "User request limit reached", code: 17 } }, 400));
    const limitErr = (await search(limit.impl).catch((e: unknown) => e)) as MetaAdLibraryError;
    expect(limitErr.transient).toBe(true);
    expect(limit.calls).toHaveLength(1);
    const custom = stubFetch(() => jsonResponse({ error: { message: "Calls to this api have exceeded the rate limit.", code: 613 } }, 400));
    expect(((await search(custom.impl).catch((e: unknown) => e)) as MetaAdLibraryError).transient).toBe(true);
    const invalid = stubFetch(() => jsonResponse({ error: { message: "Invalid parameter", code: 100 } }, 400));
    const invalidErr = (await search(invalid.impl).catch((e: unknown) => e)) as MetaAdLibraryError;
    expect(invalidErr.transient).toBe(false);
    expect(invalidErr.code).toBe(100);
    expect(invalid.calls).toHaveLength(1);
  });

  it("erreur réseau et délai dépassé : transitoires, message sans jeton", async () => {
    const network = stubFetch(() => {
      throw new TypeError(`fetch failed for https://graph.facebook.com/v22.0/ads_archive?access_token=${TOKEN}`);
    });
    const err = (await search(network.impl).catch((e: unknown) => e)) as MetaAdLibraryError;
    expect(err).toBeInstanceOf(MetaAdLibraryError);
    expect(err.transient).toBe(true);
    expect(err.message).toContain("réseau");
    expect(err.message).not.toContain(TOKEN);
    expect(network.calls).toHaveLength(2);

    // Comme fetch : la promesse est rejetée (AbortError) quand le délai annule la requête
    const slow = stubFetch(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          call.signal?.addEventListener("abort", () => reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" })), { once: true });
        }),
    );
    const timeoutProvider = new MetaAdLibraryProvider(TOKEN, slow.impl, { retryDelayMs: 0, timeoutMs: 20 });
    const start = Date.now();
    const timeoutErr = (await timeoutProvider.searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL" }).catch((e: unknown) => e)) as MetaAdLibraryError;
    expect(timeoutErr).toBeInstanceOf(MetaAdLibraryError);
    expect(timeoutErr.transient).toBe(true);
    expect(Date.now() - start).toBeLessThan(2_000);
  });
});

describe("mock déterministe", () => {
  const locality = { city: "Albi", department: "Tarn", region: "Occitanie" };

  it("10 à 18 annonces par terme, même now → mêmes annonces, termes différents → annonces différentes", async () => {
    const a = await new MockAdLibraryProvider({ now: NOW, locality }).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL" });
    const b = await new MockAdLibraryProvider({ now: NOW, locality }).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL" });
    const c = await new MockAdLibraryProvider({ now: NOW, locality }).searchAds({ term: "hypnose", country: "FR", activeStatus: "ALL" });
    expect(a).toEqual(b);
    expect(a.calls).toBe(1);
    expect(a.truncated).toBe(false);
    expect(a.ads.length).toBeGreaterThanOrEqual(10);
    expect(a.ads.length).toBeLessThanOrEqual(18);
    expect(new Set(a.ads.map((ad) => ad.id)).size).toBe(a.ads.length);
    // Les deux premières annonces sont communes aux termes d'une même localité, le reste diffère
    expect(c.ads.slice(0, 2).map((ad) => ad.id)).toEqual(a.ads.slice(0, 2).map((ad) => ad.id));
    expect(c.ads.slice(2).map((ad) => ad.id)).not.toEqual(a.ads.slice(2).map((ad) => ad.id));
  });

  it("annonces plausibles : pages « Cabinet … », textes français, portées 500–60 000, débuts 3 à 200 jours avant now, un tiers arrêtées, zones mélangées, plateformes variées", () => {
    const terms = ["sophrologue", "sophrologie", "gestion du stress", "hypnose", "naturopathe", "cabinet martin"];
    const ads = terms.flatMap((term) => mockLibraryAds(term, { now: NOW, locality }));
    expect(ads.length).toBeGreaterThan(60);
    for (const ad of ads) {
      expect(ad.pageName.startsWith("Cabinet ")).toBe(true);
      expect(ad.bodies[0]!.length).toBeGreaterThan(40);
      expect(ad.titles).toHaveLength(1);
      expect(ad.libraryUrl).toBe(metaLibraryUrl(ad.id));
      expect(ad.languages).toEqual(["fr"]);
      expect(ad.platforms.length).toBeGreaterThan(0);
      if (ad.euTotalReach !== null) {
        expect(ad.euTotalReach).toBeGreaterThanOrEqual(500);
        expect(ad.euTotalReach).toBeLessThanOrEqual(60_000);
      }
      const startDays = (NOW.getTime() - new Date(ad.startedAt!).getTime()) / 86_400_000;
      expect(startDays).toBeGreaterThanOrEqual(3);
      expect(startDays).toBeLessThanOrEqual(200);
      if (ad.stoppedAt) {
        expect(new Date(ad.stoppedAt).getTime()).toBeGreaterThan(new Date(ad.startedAt!).getTime());
        expect(new Date(ad.stoppedAt).getTime()).toBeLessThanOrEqual(NOW.getTime());
      }
    }
    const stopped = ads.filter((ad) => ad.stoppedAt !== null).length;
    expect(stopped / ads.length).toBeGreaterThan(0.25);
    expect(stopped / ads.length).toBeLessThan(0.45);
    const scopes = { ville: 0, departement: 0, region: 0, france: 0 };
    for (const ad of ads) scopes[scopeOfAd(ad, { city: "Albi", department: { code: "81", name: "Tarn", region: "Occitanie" }, region: "Occitanie" })]++;
    for (const share of Object.values(scopes)) expect(share / ads.length).toBeGreaterThan(0.1);
    expect(new Set(ads.map((ad) => ad.platforms.join("+"))).size).toBeGreaterThanOrEqual(3);
    expect(ads.some((ad) => ad.bodies[0]!.includes("sophrologue"))).toBe(true);
  });

  it("ACTIVE écarte les annonces arrêtées ; sans localité, tout cible la France ; limite respectée", async () => {
    const active = await new MockAdLibraryProvider({ now: NOW, locality }).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ACTIVE" });
    expect(active.ads.every((ad) => ad.stoppedAt === null)).toBe(true);
    const national = mockLibraryAds("sophrologue", { now: NOW, locality: null });
    expect(national.every((ad) => ad.targetLocations.length === 1 && ad.targetLocations[0]!.name === "France")).toBe(true);
    const limited = await new MockAdLibraryProvider({ now: NOW, locality }).searchAds({ term: "sophrologue", country: "FR", activeStatus: "ALL", limit: 5 });
    expect(limited.ads).toHaveLength(5);
    expect(limited.truncated).toBe(true);
  });
});

describe("createAdLibraryProvider", () => {
  it("jeton → fournisseur réel ; META_ADS_MOCK=1 → mock (même avec jeton) ; rien → null", () => {
    const real = createAdLibraryProvider({ META_AD_LIBRARY_TOKEN: TOKEN } as NodeJS.ProcessEnv);
    expect(real).toBeInstanceOf(MetaAdLibraryProvider);
    expect(real?.mode).toBe("meta");
    const mock = createAdLibraryProvider({ META_AD_LIBRARY_TOKEN: TOKEN, META_ADS_MOCK: "1" } as NodeJS.ProcessEnv);
    expect(mock).toBeInstanceOf(MockAdLibraryProvider);
    expect(mock?.mode).toBe("mock");
    expect(createAdLibraryProvider({ META_ADS_MOCK: "true" } as NodeJS.ProcessEnv)?.mode).toBe("mock");
    expect(createAdLibraryProvider({} as NodeJS.ProcessEnv)).toBeNull();
    expect(createAdLibraryProvider({ META_AD_LIBRARY_TOKEN: "   " } as NodeJS.ProcessEnv)).toBeNull();
  });
});
