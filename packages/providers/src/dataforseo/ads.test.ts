import { describe, expect, it, vi } from "vitest";
import { buildAdsSeeds, selectAdsKeywords, type GoogleAdsKeywordData } from "@theralys/shared";
import { DATAFORSEO_BASE, DataForSeoError } from "./client";
import {
  ADS_KEYWORD_IDEAS_ENDPOINT,
  ADS_TRAFFIC_ENDPOINT,
  DataForSeoAdsProvider,
  MockAdsDataProvider,
  adsBidForRequest,
  cleanAdsKeywords,
  createAdsDataProvider,
  forecastRowFromItem,
  keywordIdeaFromItem,
  mockAdsKind,
  mockKeywordTraffic,
  type DfsAdsKeywordItem,
} from "./ads";

const LOGIN = "login@exemple.fr";
const PASSWORD = "motdepasse-secret";
const EXPECTED_AUTH = `Basic ${Buffer.from(`${LOGIN}:${PASSWORD}`).toString("base64")}`;
const NOW = new Date("2026-10-26T06:00:00Z");

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

/** Réponse DataForSEO minimale : une tâche, statut et coût donnés, `result` = items. */
function dfs(task: { status_code?: number; status_message?: string; cost?: number; result?: unknown[] | null }) {
  return {
    status_code: 20000,
    status_message: "Ok.",
    cost: task.cost ?? 0,
    tasks: [{ id: "task-1", status_code: 20000, status_message: "Ok.", cost: task.cost ?? 0, result: [], ...task }],
  };
}

function stubFetch(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      headers,
    };
    calls.push(call);
    return respond(call, calls.length - 1);
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

const IDEA_ITEMS: unknown[] = [
  {
    keyword: "sophrologue albi",
    location_code: 2250,
    language_code: "fr",
    search_partners: false,
    search_volume: 170,
    cpc: 1.42,
    competition: "MEDIUM",
    competition_index: 45,
    low_top_of_page_bid: 0.71,
    high_top_of_page_bid: 2.35,
    monthly_searches: [
      { year: 2026, month: 9, search_volume: 210 },
      { year: 2026, month: 8, search_volume: 140 },
      { year: 2026, month: 13, search_volume: 999 },
      { year: 2026, month: 7, search_volume: null },
      null,
      "x",
    ],
    keyword_annotations: { concepts: [{ name: "sophrologue", concept_group: { name: "Métier", type: "NON_BRAND" } }] },
  },
  // Valeurs null (aucune donnée Google Ads) et concurrence en minuscules
  { keyword: "  sophrologue   albi avis ", search_volume: null, cpc: null, competition: "low", competition_index: null, low_top_of_page_bid: null, high_top_of_page_bid: null, monthly_searches: null },
  // Concurrence inconnue, indice hors bornes, volume négatif
  { keyword: "sophrologie", search_volume: -5, cpc: 0.95, competition: "VERY_HIGH", competition_index: 150 },
  // Items malformés : ignorés
  null,
  "sophrologue",
  { keyword: "", search_volume: 10 },
  { search_volume: 10 },
  { keyword: 42 },
];

describe("DataForSeoAdsProvider — idées de mots-clés", () => {
  it("auth Basic, une tâche par appel, corps conforme, items normalisés (null conservés, malformés écartés)", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse(dfs({ cost: 0.09, result: IDEA_ITEMS })));
    const provider = new DataForSeoAdsProvider(LOGIN, PASSWORD, impl);
    const out = await provider.keywordIdeas({ seeds: ["sophrologue albi", "Sophrologue Albi", " sophrologue ", ""], locationCode: 2250, languageCode: "fr" });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${DATAFORSEO_BASE}${ADS_KEYWORD_IDEAS_ENDPOINT}`);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers.authorization).toBe(EXPECTED_AUTH);
    expect(calls[0]!.body).toEqual([
      { keywords: ["sophrologue albi", "sophrologue"], location_code: 2250, language_code: "fr", search_partners: false, sort_by: "search_volume" },
    ]);
    expect(out.mode).toBe("dataforseo");
    expect(out.costUsd).toBe(0.09);
    expect(out.data).toEqual([
      {
        keyword: "sophrologue albi",
        searchVolume: 170,
        cpcUsd: 1.42,
        competition: "MEDIUM",
        competitionIndex: 45,
        lowTopBidUsd: 0.71,
        highTopBidUsd: 2.35,
        monthly: [
          { year: 2026, month: 9, searchVolume: 210 },
          { year: 2026, month: 8, searchVolume: 140 },
        ],
      },
      { keyword: "sophrologue albi avis", searchVolume: null, cpcUsd: null, competition: "LOW", competitionIndex: null, lowTopBidUsd: null, highTopBidUsd: null, monthly: [] },
      { keyword: "sophrologie", searchVolume: null, cpcUsd: 0.95, competition: null, competitionIndex: 100, lowTopBidUsd: null, highTopBidUsd: null, monthly: [] },
    ]);
  });

  it("au plus 20 graines par appel, aucune requête sans graine, `result` null toléré", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse(dfs({ cost: 0.09, result: null })));
    const provider = new DataForSeoAdsProvider(LOGIN, PASSWORD, impl);
    const seeds = Array.from({ length: 25 }, (_, i) => `graine ${i}`);
    const out = await provider.keywordIdeas({ seeds, locationCode: 2250, languageCode: "fr" });
    expect((calls[0]!.body as { keywords: string[] }[])[0]!.keywords).toHaveLength(20);
    expect(out.data).toEqual([]);
    expect(out.costUsd).toBe(0.09);

    const empty = await provider.keywordIdeas({ seeds: ["", "   "], locationCode: 2250, languageCode: "fr" });
    expect(calls).toHaveLength(1);
    expect(empty).toEqual({ data: [], costUsd: 0, mode: "dataforseo" });
  });

  it("des milliers d'items sont tous conservés (la sélection revient à selectAdsKeywords)", async () => {
    const items = Array.from({ length: 3000 }, (_, i) => ({ keyword: `sophrologue variante ${i}`, search_volume: i, cpc: 1 }));
    const { impl } = stubFetch(() => jsonResponse(dfs({ cost: 0.09, result: items })));
    const provider = new DataForSeoAdsProvider(LOGIN, PASSWORD, impl);
    const out = await provider.keywordIdeas({ seeds: ["sophrologue"], locationCode: 2250, languageCode: "fr" });
    expect(out.data).toHaveLength(3000);
  });
});

describe("DataForSeoAdsProvider — prévision de trafic", () => {
  it("corps conforme (enchère entière en USD, correspondance, next_month) et ligne agrégée de la documentation (keyword null) conservée", async () => {
    const { calls, impl } = stubFetch(() =>
      jsonResponse(
        dfs({
          cost: 0.09,
          // Exemple de la documentation « ad_traffic_by_keywords/live » : un seul item pour toute la campagne
          result: [{ keyword: null, clicks: 459.42, cost: 2562.44, average_cpc: 5.58, impressions: 15234.2, ctr: 3.02 }],
        }),
      ),
    );
    const provider = new DataForSeoAdsProvider(LOGIN, PASSWORD, impl);
    const out = await provider.adTraffic({
      keywords: ["sophrologue albi", "sophrologue albi avis", "sophrologue albi"],
      bidUsd: 2.345,
      match: "phrase",
      locationCode: 2250,
      languageCode: "fr",
    });
    expect(calls[0]!.url).toBe(`${DATAFORSEO_BASE}${ADS_TRAFFIC_ENDPOINT}`);
    expect(calls[0]!.body).toEqual([
      { keywords: ["sophrologue albi", "sophrologue albi avis"], bid: 3, match: "phrase", location_code: 2250, language_code: "fr", date_interval: "next_month" },
    ]);
    expect(Number.isInteger((calls[0]!.body as { bid: number }[])[0]!.bid)).toBe(true);
    expect(out.costUsd).toBe(0.09);
    expect(out.data).toEqual([{ keyword: null, clicks: 459.42, costUsd: 2562.44, averageCpcUsd: 5.58 }]);
  });

  it("ancien format (une ligne par mot-clé) toujours accepté ; items vides ou malformés écartés", async () => {
    const { impl } = stubFetch(() =>
      jsonResponse(
        dfs({
          cost: 0.09,
          result: [
            { keyword: "sophrologue albi", clicks: 12.4, cost: 17.86, average_cpc: 1.44, impressions: null, ctr: null },
            { keyword: "sophrologue albi avis", clicks: null, cost: null, average_cpc: null },
            { keyword: "", clicks: 1 },
            {},
            null,
            "x",
          ],
        }),
      ),
    );
    const provider = new DataForSeoAdsProvider(LOGIN, PASSWORD, impl);
    const out = await provider.adTraffic({ keywords: ["sophrologue albi"], bidUsd: 2, match: "exact", locationCode: 2250, languageCode: "fr" });
    expect(out.data).toEqual([
      { keyword: "sophrologue albi", clicks: 12.4, costUsd: 17.86, averageCpcUsd: 1.44 },
      { keyword: "sophrologue albi avis", clicks: null, costUsd: null, averageCpcUsd: null },
      { keyword: null, clicks: 1, costUsd: null, averageCpcUsd: null },
    ]);
  });

  it("sans mot-clé : aucune requête ; correspondance invalide : erreur avant tout appel", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse(dfs({ cost: 0.09 })));
    const provider = new DataForSeoAdsProvider(LOGIN, PASSWORD, impl);
    expect(await provider.adTraffic({ keywords: [], bidUsd: 2, match: "exact", locationCode: 2250, languageCode: "fr" })).toEqual({ data: [], costUsd: 0, mode: "dataforseo" });
    await expect(
      provider.adTraffic({ keywords: ["x"], bidUsd: 2, match: "large" as "broad", locationCode: 2250, languageCode: "fr" }),
    ).rejects.toThrow(/correspondance invalide/);
    expect(calls).toHaveLength(0);
  });

  it("adsBidForRequest : entier en unités de devise (arrondi au dollar supérieur), bornes 1–999, valeurs invalides", () => {
    expect(adsBidForRequest(2.5)).toBe(3);
    expect(adsBidForRequest(1.234)).toBe(2);
    expect(adsBidForRequest(2)).toBe(2);
    expect(adsBidForRequest(0.5)).toBe(1);
    expect(adsBidForRequest(0)).toBe(1);
    expect(adsBidForRequest(5000)).toBe(999);
    expect(adsBidForRequest(Number.NaN)).toBe(1);
  });
});

describe("DataForSeoAdsProvider — erreurs", () => {
  it("tâche refusée (statut 40xxx) → DataForSeoError portant le coût facturé", async () => {
    const { impl } = stubFetch(() => jsonResponse(dfs({ status_code: 40501, status_message: "Invalid Field: 'keywords'.", cost: 0.09 })));
    const provider = new DataForSeoAdsProvider(LOGIN, PASSWORD, impl);
    const err = await provider.keywordIdeas({ seeds: ["sophrologue"], locationCode: 2250, languageCode: "fr" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DataForSeoError);
    expect((err as DataForSeoError).costUsd).toBe(0.09);
    expect((err as Error).message).toContain("40501");
    expect((err as Error).message).not.toContain(PASSWORD);

    const errTraffic = await provider.adTraffic({ keywords: ["sophrologue"], bidUsd: 2, match: "exact", locationCode: 2250, languageCode: "fr" }).catch((e: unknown) => e);
    expect(errTraffic).toBeInstanceOf(DataForSeoError);
  });

  it("HTTP 500 : une relance, puis erreur ordinaire si elle échoue aussi ; succès si la relance aboutit", async () => {
    const failing = stubFetch(() => new Response("Internal error", { status: 500 }));
    const provider = new DataForSeoAdsProvider(LOGIN, PASSWORD, failing.impl);
    const err = await provider.keywordIdeas({ seeds: ["sophrologue"], locationCode: 2250, languageCode: "fr" }).catch((e: unknown) => e);
    expect(failing.calls).toHaveLength(2);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(DataForSeoError);
    expect((err as Error).message).toContain("500");

    const flaky = stubFetch((_call, index) => (index === 0 ? new Response("Bad gateway", { status: 502 }) : jsonResponse(dfs({ cost: 0.09, result: IDEA_ITEMS.slice(0, 1) }))));
    const retried = new DataForSeoAdsProvider(LOGIN, PASSWORD, flaky.impl);
    const out = await retried.adTraffic({ keywords: ["sophrologue albi"], bidUsd: 2, match: "exact", locationCode: 2250, languageCode: "fr" });
    expect(flaky.calls).toHaveLength(2);
    expect(out.costUsd).toBe(0.09);
  });

  it("HTTP 401 : aucune relance, erreur explicite sans identifiants", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse({ status_code: 40100, status_message: "Unauthorized." }, 401));
    const provider = new DataForSeoAdsProvider(LOGIN, PASSWORD, impl);
    await expect(provider.keywordIdeas({ seeds: ["sophrologue"], locationCode: 2250, languageCode: "fr" })).rejects.toThrow(/401/);
    expect(calls).toHaveLength(1);
  });

  it("statut général ≠ 20000 (HTTP 200) : erreur, un seul appel", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse({ status_code: 40202, status_message: "Rate limit exceeded.", tasks: [] }));
    const provider = new DataForSeoAdsProvider(LOGIN, PASSWORD, impl);
    await expect(provider.keywordIdeas({ seeds: ["sophrologue"], locationCode: 2250, languageCode: "fr" })).rejects.toThrow(/40202/);
    expect(calls).toHaveLength(1);
  });
});

describe("normalisation unitaire", () => {
  it("keywordIdeaFromItem : null pour un item sans mot-clé ; forecastRowFromItem : l'item sans mot-clé est l'agrégat (keyword null)", () => {
    expect(keywordIdeaFromItem({ search_volume: 10 })).toBeNull();
    expect(keywordIdeaFromItem(undefined)).toBeNull();
    expect(forecastRowFromItem({ clicks: 3 })).toEqual({ keyword: null, clicks: 3, costUsd: null, averageCpcUsd: null });
    expect(forecastRowFromItem({ keyword: null, clicks: 459.42, cost: 2562.44, average_cpc: 5.58 })).toEqual({ keyword: null, clicks: 459.42, costUsd: 2562.44, averageCpcUsd: 5.58 });
    expect(forecastRowFromItem({})).toBeNull();
    expect(forecastRowFromItem({ keyword: null, clicks: null, cost: null, average_cpc: null })).toBeNull();
    expect(forecastRowFromItem(null)).toBeNull();
    expect(forecastRowFromItem("x")).toBeNull();
    const item: DfsAdsKeywordItem = { keyword: "x", competition_index: -3, cpc: -1 };
    expect(keywordIdeaFromItem(item)).toMatchObject({ competitionIndex: 0, cpcUsd: null });
  });

  it("cleanAdsKeywords : espaces, vides, longueur, doublons (casse) et plafond", () => {
    expect(cleanAdsKeywords(["  A  b ", "a b", "", "x".repeat(81), "c"], 10)).toEqual(["A b", "c"]);
    expect(cleanAdsKeywords(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });
});

describe("MockAdsDataProvider", () => {
  const seed = buildAdsSeeds({ profession: "Sophrologue", city: "Albi", specialties: ["Gestion du stress", "Sommeil et récupération", "Confiance en soi"] });

  it("déterministe : mêmes graines → mêmes idées ; coût 0, mode mock", async () => {
    const a = await new MockAdsDataProvider({ now: NOW }).keywordIdeas({ seeds: seed.keywords, locationCode: 2250, languageCode: "fr" });
    const b = await new MockAdsDataProvider({ now: NOW }).keywordIdeas({ seeds: seed.keywords, locationCode: 2250, languageCode: "fr" });
    expect(a).toEqual(b);
    expect(a.costUsd).toBe(0);
    expect(a.mode).toBe("mock");
    expect(a.data.length).toBeGreaterThanOrEqual(30);
    const texts = a.data.map((k) => k.keyword);
    for (const s of seed.keywords) expect(texts).toContain(s);
    // Distracteurs : formation, informationnel, hors sujet, volume nul, sans donnée
    expect(texts).toEqual(expect.arrayContaining(["formation sophrologue", "sophrologue c'est quoi", "bienfaits sophrologue", "psychologue albi", "sophrologue albi dimanche", "sophrologue albi horaires"]));
  });

  it("volumes et CPC plausibles selon l'intention, concurrence cohérente, douze mois de saisonnalité", async () => {
    const { data } = await new MockAdsDataProvider({ now: NOW }).keywordIdeas({ seeds: seed.keywords, locationCode: 2250, languageCode: "fr" });
    const byText = new Map(data.map((k) => [k.keyword, k]));
    const within = (keyword: string, lo: number, hi: number) => {
      const idea = byText.get(keyword)!;
      expect(idea, keyword).toBeDefined();
      expect(idea.searchVolume, keyword).toBeGreaterThanOrEqual(lo);
      expect(idea.searchVolume, keyword).toBeLessThanOrEqual(hi);
    };
    within("sophrologue", 2000, 20000);
    within("sophrologue albi", 50, 400);
    within("gestion du stress albi", 20, 200);
    within("sophrologue albi avis", 10, 80);
    within("rendez-vous sophrologue albi", 10, 80);
    within("sophrologue albi tarif", 10, 80);
    within("sophrologue albi dimanche", 0, 8);
    expect(mockAdsKind("devenir sophrologue")).toBe("informationnel");

    const nothing = byText.get("sophrologue albi horaires")!;
    expect(nothing).toMatchObject({ searchVolume: null, cpcUsd: null, competition: null, competitionIndex: null, monthly: [] });

    for (const idea of data) {
      if (idea.cpcUsd === null) continue;
      expect(idea.cpcUsd).toBeGreaterThanOrEqual(0.8);
      expect(idea.cpcUsd).toBeLessThanOrEqual(3.5);
      expect(idea.lowTopBidUsd).toBeLessThan(idea.cpcUsd);
      expect(idea.highTopBidUsd).toBeGreaterThan(idea.cpcUsd);
      const index = idea.competitionIndex!;
      expect(idea.competition).toBe(index >= 67 ? "HIGH" : index >= 34 ? "MEDIUM" : "LOW");
      expect(idea.monthly).toHaveLength(12);
      expect(idea.monthly[0]).toEqual(expect.objectContaining({ year: 2025, month: 10 }));
      expect(idea.monthly[11]).toEqual(expect.objectContaining({ year: 2026, month: 9 }));
      const avg = idea.monthly.reduce((s, m) => s + m.searchVolume, 0) / 12;
      expect(Math.abs(avg - idea.searchVolume!)).toBeLessThanOrEqual(Math.max(2, idea.searchVolume! * 0.1));
    }
    // Tri par volume décroissant, comme sort_by: search_volume
    const volumes = data.map((k) => k.searchVolume ?? -1);
    expect(volumes).toEqual([...volumes].sort((x, y) => y - x));
  });

  it("les idées mock exercent la sélection : métier + ville retenu, informationnel et hors sujet écartés, négatifs proposés", async () => {
    const { data } = await new MockAdsDataProvider({ now: NOW }).keywordIdeas({ seeds: seed.keywords, locationCode: 2250, languageCode: "fr" });
    const set = selectAdsKeywords(data, seed, { source: "mock", fetchedAt: NOW, tracked: ["sophrologue albi"] });
    const kept = set.keywords.map((k) => k.keyword);
    expect(kept).toContain("sophrologue albi");
    expect(set.keywords.find((k) => k.keyword === "sophrologue albi")?.tracked).toBe(true);
    expect(kept).not.toContain("formation sophrologue");
    expect(kept).not.toContain("psychologue albi");
    expect(kept).not.toContain("sophrologue albi dimanche");
    expect(set.dropped).toBeGreaterThan(5);
    expect(set.negatives).toContain("bienfaits");
    expect(set.groups.map((g) => g.intent)).toEqual(expect.arrayContaining(["metier_ville", "rendez_vous", "tarif"]));
  });

  it("mockKeywordTraffic : clics ≈ volume × 3 % bornés, coût = clics × CPC moyen, enchère plafonnant le CPC, null sans donnée", async () => {
    const provider = new MockAdsDataProvider({ now: NOW });
    const ideas = await provider.keywordIdeas({ seeds: seed.keywords, locationCode: 2250, languageCode: "fr" });
    const idea = ideas.data.find((k) => k.keyword === "sophrologue") as GoogleAdsKeywordData;
    const main = mockKeywordTraffic("sophrologue", 1, "exact", NOW)!;
    expect(main.clicks).toBeLessThanOrEqual(300);
    expect(main.clicks).toBeLessThanOrEqual(idea.searchVolume! * 0.03 + 0.1);
    expect(main.averageCpcUsd).toBe(Math.min(1, idea.cpcUsd!));
    expect(main.costUsd).toBeCloseTo(main.clicks * main.averageCpcUsd, 1);
    expect(mockKeywordTraffic("sophrologue albi horaires", 1, "exact", NOW)).toBeNull();
    expect(mockKeywordTraffic("sophrologue albi", 5, "broad", NOW)!.clicks).toBeGreaterThan(mockKeywordTraffic("sophrologue albi", 5, "exact", NOW)!.clicks);
  });

  it("adTraffic : comme l'API, UNE ligne agrégée (keyword null) sommant les mots-clés envoyés ; clics et coût > 0 ; déterministe", async () => {
    const provider = new MockAdsDataProvider({ now: NOW });
    const keywords = ["sophrologue", "sophrologue albi", "sophrologue albi horaires", "sophrologue albi"];
    const out = await provider.adTraffic({ keywords, bidUsd: 1, match: "exact", locationCode: 2250, languageCode: "fr" });
    expect(out.costUsd).toBe(0);
    expect(out.data).toHaveLength(1);
    const row = out.data[0]!;
    expect(row.keyword).toBeNull();
    const parts = ["sophrologue", "sophrologue albi"].map((k) => mockKeywordTraffic(k, 1, "exact", NOW)!);
    expect(row.clicks).toBeCloseTo(parts.reduce((s, p) => s + p.clicks, 0), 1);
    expect(row.costUsd).toBeCloseTo(parts.reduce((s, p) => s + p.costUsd, 0), 2);
    expect(row.clicks!).toBeGreaterThan(0);
    expect(row.costUsd!).toBeGreaterThan(0);
    expect(row.averageCpcUsd).toBeCloseTo(row.costUsd! / row.clicks!, 2);

    const broad = await provider.adTraffic({ keywords: ["sophrologue albi"], bidUsd: 5, match: "broad", locationCode: 2250, languageCode: "fr" });
    const exact = await provider.adTraffic({ keywords: ["sophrologue albi"], bidUsd: 5, match: "exact", locationCode: 2250, languageCode: "fr" });
    expect(broad.data[0]!.clicks!).toBeGreaterThan(exact.data[0]!.clicks!);
    expect(await provider.adTraffic({ keywords: ["sophrologue albi"], bidUsd: 5, match: "exact", locationCode: 2250, languageCode: "fr" })).toEqual(exact);
    // Aucun mot-clé exploitable : aucune ligne ; mots-clés sans donnée seulement : agrégat à zéro
    expect((await provider.adTraffic({ keywords: [], bidUsd: 5, match: "exact", locationCode: 2250, languageCode: "fr" })).data).toEqual([]);
    expect((await provider.adTraffic({ keywords: ["sophrologue albi horaires"], bidUsd: 5, match: "exact", locationCode: 2250, languageCode: "fr" })).data).toEqual([
      { keyword: null, clicks: 0, costUsd: 0, averageCpcUsd: null },
    ]);
  });

  it("sans graine : aucune idée", async () => {
    expect(await new MockAdsDataProvider().keywordIdeas({ seeds: [], locationCode: 2250, languageCode: "fr" })).toEqual({ data: [], costUsd: 0, mode: "mock" });
  });
});

describe("createAdsDataProvider", () => {
  it("mock sans identifiants ou avec DATAFORSEO_MOCK, réel sinon", () => {
    expect(createAdsDataProvider({} as NodeJS.ProcessEnv).mode).toBe("mock");
    expect(createAdsDataProvider({ DATAFORSEO_LOGIN: "a", DATAFORSEO_PASSWORD: "b", DATAFORSEO_MOCK: "1" } as NodeJS.ProcessEnv).mode).toBe("mock");
    expect(createAdsDataProvider({ DATAFORSEO_LOGIN: "a", DATAFORSEO_PASSWORD: "b", DATAFORSEO_MOCK: "true" } as NodeJS.ProcessEnv).mode).toBe("mock");
    expect(createAdsDataProvider({ DATAFORSEO_LOGIN: "a" } as NodeJS.ProcessEnv).mode).toBe("mock");
    const real = createAdsDataProvider({ DATAFORSEO_LOGIN: "a", DATAFORSEO_PASSWORD: "b" } as NodeJS.ProcessEnv);
    expect(real.mode).toBe("dataforseo");
    expect(real).toBeInstanceOf(DataForSeoAdsProvider);
  });
});
