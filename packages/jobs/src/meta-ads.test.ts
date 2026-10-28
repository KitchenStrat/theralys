import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SOCIAL_VOICE,
  META_ADS_ANALYSES_PER_MONTH,
  META_ADS_INSTRUCTIONS_MAX,
  META_ADS_REGENERATIONS_PER_MONTH,
  META_LIBRARY_MAX_CALLS,
  META_LIBRARY_TERMS_MAX,
  META_MARKET_SAMPLE_FOR_AI,
  buildMetaSeed,
  metaCreativeIssues,
  metaPlanIssues,
  metaVideoPlanIssues,
  type MetaAdRecord,
  type MetaAdsDiagnosticInput,
  type PageSections,
  type SiteTheme,
  type SocialSiteBrief,
} from "@theralys/shared";
import { googleUsage, metaAdsAnalyses, type Database, type MetaAdsAnalysis, type Site } from "@theralys/db";
import { createMetaAdsPlanner } from "@theralys/ai";
import { MetaAdLibraryError, MockAdLibraryProvider, type AdLibraryProvider, type AdLibrarySearchInput } from "@theralys/providers/meta";
import {
  META_ADS_ANALYSIS_STALE_MINUTES,
  META_ERROR_MESSAGES,
  addressFromSections,
  beginMetaRegeneration,
  buildMetaMarket,
  cleanMetaInstructions,
  collectMarketAds,
  decideMetaStart,
  endMetaRegeneration,
  executeMetaAnalysis,
  generateMetaAds,
  hasMetaAdsAccess,
  isMetaMarketMessage,
  isMetaRegenerationInFlight,
  localityOf,
  marketProviderFor,
  marketQueryPlan,
  marketSampleForAi,
  metaAnalysisError,
  metaDiagnosticInputFrom,
  metaErrorMessage,
  metaProfileFrom,
  regenerateMetaAds,
  renderUrlsOf,
  runMetaAdsAnalysis,
  usageFromCounts,
  type MetaAdsContextData,
} from "./meta-ads";

const NOW = new Date("2026-10-26T06:00:00Z");
const THEME: SiteTheme = { preset: "terracotta", fontPreset: "chaleureux" } as SiteTheme;
const MOCK_ENV = { AI_MOCK: "1", DATAFORSEO_MOCK: "1", META_ADS_MOCK: "1" } as NodeJS.ProcessEnv;

const SEED = buildMetaSeed({
  profession: "Sophrologue",
  city: "Albi",
  address: "12 rue de la Paix, 81000 Albi",
  specialties: ["Gestion du stress", "Sommeil et récupération"],
  competitorNames: ["Cabinet Martin", "Sophro Albi"],
});

const BRIEF: SocialSiteBrief = {
  practitioner: { firstName: "Claire", lastName: "Dupont", profession: "Sophrologue", practiceName: "la sophrologie", city: "Albi", gender: "feminin" },
  voice: DEFAULT_SOCIAL_VOICE,
  siteType: "demo",
  siteName: "Claire Dupont, sophrologue",
  domain: "localhost:3000/claire-dupont-sophrologue-albi",
  hasBookingUrl: true,
  google: { rating: 4.8, reviewCount: 32 },
  home: { highlights: [], specialties: [], infoCards: [], process: [], faq: [] },
  motifPages: [],
  articles: [],
  reviews: [],
  photos: [{ id: "p1", kind: "hero", orientation: "landscape", portraitSafe: false, hint: "Photo d'accueil" }],
};

const DIAGNOSTIC_INPUT: Omit<MetaAdsDiagnosticInput, "market"> = {
  profession: "Sophrologue",
  city: "Albi",
  hasBookingUrl: true,
  hasPhone: true,
  hasPixel: true,
  cookieBanner: true,
  photosCount: 4,
  facebookUrl: "https://facebook.com/claire",
  instagramUrl: null,
  motifPages: 2,
  profile: { linked: true, rating: 4.8, votes: 32 },
};

const CONTEXT: MetaAdsContextData = {
  seed: SEED,
  landingPages: [
    { path: "/", title: "Accueil", kind: "home" },
    { path: "/gestion-du-stress", title: "Gestion du stress", kind: "motif" },
  ],
  diagnosticInput: DIAGNOSTIC_INPUT,
  brief: BRIEF,
};

const SITE: Site = {
  id: "11111111-1111-4111-8111-111111111111",
  prospectId: null,
  slug: "claire-dupont-sophrologue-albi",
  name: "Claire Dupont, sophrologue",
  type: "demo",
  plan: "scale",
  status: "published",
  theme: THEME,
  bookingUrl: "https://rdv.exemple.fr",
  domain: null,
  createdAt: NOW,
  updatedAt: NOW,
} as unknown as Site;

function record(id: string, overrides: Partial<MetaAdRecord> = {}): MetaAdRecord {
  return {
    id,
    pageId: null,
    pageName: `Cabinet ${id}`,
    bodies: ["Une séance pour souffler."],
    titles: ["Sophrologie à Albi"],
    descriptions: [],
    captions: [],
    libraryUrl: `https://www.facebook.com/ads/library/?id=${id}`,
    startedAt: "2026-09-01T00:00:00.000Z",
    stoppedAt: null,
    platforms: ["facebook"],
    languages: ["fr"],
    euTotalReach: 5_000,
    targetAges: null,
    targetGender: null,
    targetLocations: [{ name: "Albi", type: "city", excluded: false }],
    payer: null,
    ...overrides,
  };
}

/** Fournisseur simulé : réponses par terme, appels enregistrés, erreur optionnelle au n-ième appel. */
function fakeProvider(respond: (input: AdLibrarySearchInput, index: number) => { ads: MetaAdRecord[]; calls: number; truncated: boolean }, mode: "meta" | "mock" = "meta") {
  const inputs: AdLibrarySearchInput[] = [];
  const provider: AdLibraryProvider = {
    mode,
    searchAds: async (input) => {
      inputs.push(input);
      return respond(input, inputs.length - 1);
    },
  };
  return { provider, inputs };
}

describe("accès, fournisseur et messages", () => {
  it("hasMetaAdsAccess : démos toujours, clients selon la formule", () => {
    expect(hasMetaAdsAccess({ type: "demo", plan: "starter" })).toBe(true);
    expect(hasMetaAdsAccess({ type: "client", plan: "scale" })).toBe(true);
    expect(hasMetaAdsAccess({ type: "client", plan: "starter" })).toBe(false);
  });

  it("marketProviderFor : mock réservé aux démos, client sans jeton → null, jeton → réel", () => {
    expect(marketProviderFor(MOCK_ENV, "demo")?.mode).toBe("mock");
    expect(marketProviderFor(MOCK_ENV, "client")).toBeNull();
    expect(marketProviderFor({} as NodeJS.ProcessEnv, "client")).toBeNull();
    expect(marketProviderFor({} as NodeJS.ProcessEnv, "demo")).toBeNull();
    expect(marketProviderFor({ META_AD_LIBRARY_TOKEN: "EAAB-jeton" } as NodeJS.ProcessEnv, "client")?.mode).toBe("meta");
  });

  it("metaErrorMessage : jeton expiré, transitoire, refus, génération, inconnu", () => {
    expect(metaErrorMessage(new MetaAdLibraryError("Meta ads_archive HTTP 400 code 190 : expiré", { status: 400, code: 190 }))).toBe("Le jeton Meta est invalide ou expiré : contactez Harmony.");
    expect(metaErrorMessage(new MetaAdLibraryError("Meta ads_archive HTTP 429 : Too many calls", { status: 429, transient: true }))).toBe("La bibliothèque Meta n'a pas répondu, réessayez dans quelques minutes.");
    expect(metaErrorMessage(new MetaAdLibraryError("Meta ads_archive HTTP 400 code 100 : Invalid parameter", { status: 400, code: 100 }))).toBe(META_ERROR_MESSAGES.marketRefused);
    expect(metaErrorMessage(new Error("ZodError"), "generation")).toBe("Les annonces n'ont pas pu être générées : relancez la génération.");
    expect(metaErrorMessage(Object.assign(new Error("boom"), { name: "ZodError" }))).toBe(META_ERROR_MESSAGES.generation);
    expect(metaErrorMessage(new Error("Planificateur Meta Ads non intégré (stub du lot B)"))).toBe(META_ERROR_MESSAGES.generation);
    expect(metaErrorMessage(new TypeError("fetch failed"), "market")).toBe(META_ERROR_MESSAGES.transient);
    expect(metaErrorMessage(new Error("quelque chose"), "market")).toBe(META_ERROR_MESSAGES.marketRefused);
    expect(metaErrorMessage(new Error("quelque chose"))).toBe(META_ERROR_MESSAGES.unknown);
    // Le jeton l'emporte sur l'étape indiquée
    expect(metaErrorMessage(new MetaAdLibraryError("x", { code: 190 }), "generation")).toBe(META_ERROR_MESSAGES.token);
    expect(isMetaMarketMessage(META_ERROR_MESSAGES.token)).toBe(true);
    expect(isMetaMarketMessage(META_ERROR_MESSAGES.generation)).toBe(false);
    expect(isMetaMarketMessage(null)).toBe(false);
  });

  it("metaAnalysisError : la génération (à relancer) prime sur la veille", () => {
    expect(metaAnalysisError({ marketError: null, generationError: null })).toBeNull();
    expect(metaAnalysisError({ marketError: META_ERROR_MESSAGES.transient, generationError: null })).toBe(META_ERROR_MESSAGES.transient);
    expect(metaAnalysisError({ marketError: META_ERROR_MESSAGES.transient, generationError: META_ERROR_MESSAGES.generation })).toBe(META_ERROR_MESSAGES.generation);
  });
});

describe("contexte", () => {
  it("addressFromSections : adresse de la section Contact (masquée comprise), sinon null", () => {
    const sections: PageSections = [
      { type: "hero", title: "Bienvenue", paragraphs: [], stats: [] } as unknown as PageSections[number],
      { type: "contact", title: "Contact", address: " 12 rue de la Paix,\n 81000 Albi ", hidden: true },
    ];
    expect(addressFromSections(sections)).toBe("12 rue de la Paix, 81000 Albi");
    expect(addressFromSections([{ type: "contact", title: "Contact", address: "  " }])).toBeNull();
    expect(addressFromSections(undefined)).toBeNull();
  });

  it("metaProfileFrom : fiche factice ignorée avec un fournisseur réel ; note et avis de l'instantané sinon de la fiche", () => {
    const prospect = { googlePlaceId: "mock-123", googleRating: 4.5, googleReviewCount: 12 };
    expect(metaProfileFrom(prospect, null, true)).toEqual({ linked: false, rating: null, votes: null });
    expect(metaProfileFrom(prospect, null, false)).toEqual({ linked: true, rating: 4.5, votes: 12 });
    const audit = { snapshot: { rating: 4.9, votes: 40 } } as unknown as Parameters<typeof metaProfileFrom>[1];
    expect(metaProfileFrom({ ...prospect, googlePlaceId: "ChIJ-real" }, audit, true)).toEqual({ linked: true, rating: 4.9, votes: 40 });
    expect(metaProfileFrom(null, audit, true)).toEqual({ linked: false, rating: null, votes: null });
  });

  it("metaDiagnosticInputFrom : la veille ne transmet que zone, comptes et annonces", () => {
    const market = buildMetaMarket({ records: [record("1")], matchedTerms: { "1": ["sophrologue"] }, terms: ["sophrologue"], calls: 1, truncated: false }, SEED, "mock", NOW);
    const input = metaDiagnosticInputFrom(DIAGNOSTIC_INPUT, market);
    expect(input.market).toEqual({ scopeUsed: market.scopeUsed, counts: market.counts, ads: market.ads });
    expect(metaDiagnosticInputFrom(DIAGNOSTIC_INPUT, null).market).toBeNull();
  });

  it("localityOf : ville, nom du département et région de la graine", () => {
    expect(localityOf(SEED)).toEqual({ city: "Albi", department: "Tarn", region: "Occitanie" });
    expect(localityOf({ city: "Albi", department: null, region: null })).toEqual({ city: "Albi", department: null, region: null });
  });

  it("cleanMetaInstructions : balises et chevrons retirés, longueur bornée, vide → undefined", () => {
    expect(cleanMetaInstructions("  <b>Sans tarif</b> le soir ")).toBe("Sans tarif le soir");
    expect(cleanMetaInstructions("   ")).toBeUndefined();
    expect(cleanMetaInstructions(null)).toBeUndefined();
    expect(cleanMetaInstructions("a".repeat(META_ADS_INSTRUCTIONS_MAX + 50))!.length).toBe(META_ADS_INSTRUCTIONS_MAX);
  });
});

describe("quota et lancement", () => {
  it("usageFromCounts : analyses et régénérations du mois, restes bornés à 0", () => {
    expect(usageFromCounts([])).toEqual({ analysesUsed: 0, analysesRemaining: META_ADS_ANALYSES_PER_MONTH, regenUsed: 0, regenRemaining: META_ADS_REGENERATIONS_PER_MONTH });
    expect(usageFromCounts([{ kind: "meta_analysis", total: 3 }, { kind: "meta_regen", total: 2 }, { kind: "ads_keywords", total: 9 }])).toEqual({
      analysesUsed: 3,
      analysesRemaining: 0,
      regenUsed: 2,
      regenRemaining: META_ADS_REGENERATIONS_PER_MONTH - 2,
    });
  });

  it("decideMetaStart : verrou refusé → busy ; running récent → busy ; périmés clos puis quota ; ok", () => {
    const fresh = { id: "a", updatedAt: new Date(NOW.getTime() - 60_000) };
    const stale = { id: "b", updatedAt: new Date(NOW.getTime() - (META_ADS_ANALYSIS_STALE_MINUTES + 1) * 60_000) };
    expect(decideMetaStart({ locked: false, running: [stale], analysesUsed: 0, now: NOW })).toEqual({ kind: "busy", staleIds: [] });
    expect(decideMetaStart({ locked: true, running: [fresh, stale], analysesUsed: 0, now: NOW })).toEqual({ kind: "busy", staleIds: ["b"] });
    expect(decideMetaStart({ locked: true, running: [stale], analysesUsed: META_ADS_ANALYSES_PER_MONTH, now: NOW })).toEqual({ kind: "quota", staleIds: ["b"] });
    expect(decideMetaStart({ locked: true, running: [stale], analysesUsed: 1, now: NOW })).toEqual({ kind: "ok", staleIds: ["b"] });
    expect(decideMetaStart({ locked: true, running: [], analysesUsed: 0, now: NOW })).toEqual({ kind: "ok", staleIds: [] });
  });
});

describe("veille : termes, budget d'appels et sélection", () => {
  it("marketQueryPlan : 2 pages par terme dans la limite du budget et des termes", () => {
    const terms = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(marketQueryPlan(terms)).toHaveLength(Math.min(META_LIBRARY_TERMS_MAX, META_LIBRARY_MAX_CALLS / 2));
    expect(marketQueryPlan(terms, 5)).toEqual([
      { term: "a", maxPages: 2 },
      { term: "b", maxPages: 2 },
      { term: "c", maxPages: 1 },
    ]);
    expect(marketQueryPlan([], 12)).toEqual([]);
  });

  it("collectMarketAds : appels séquentiels, maxPages borné par le budget restant, arrêt au budget, termes rattachés aux annonces", async () => {
    const { provider, inputs } = fakeProvider((input) => ({ ads: [record("shared"), record(`${input.term}-1`)], calls: 2, truncated: false }));
    const progress = { calls: 0 };
    const result = await collectMarketAds(provider, { searchTerms: ["sophrologue", "sophrologie", "stress"], country: "FR" }, { budget: 5, progress });
    expect(inputs.map((i) => [i.term, i.maxPages, i.activeStatus, i.country])).toEqual([
      ["sophrologue", 2, "ALL", "FR"],
      ["sophrologie", 2, "ALL", "FR"],
      ["stress", 1, "ALL", "FR"],
    ]);
    expect(result.calls).toBe(6);
    expect(progress.calls).toBe(6);
    expect(result.terms).toEqual(["sophrologue", "sophrologie", "stress"]);
    expect(result.matchedTerms.shared).toEqual(["sophrologue", "sophrologie", "stress"]);
    expect(result.matchedTerms["stress-1"]).toEqual(["stress"]);
    expect(result.truncated).toBe(false);
  });

  it("collectMarketAds : budget épuisé avant le dernier terme → truncated ; page suivante non suivie → truncated", async () => {
    const two = fakeProvider(() => ({ ads: [], calls: 2, truncated: false }));
    const exhausted = await collectMarketAds(two.provider, { searchTerms: ["a", "b", "c"], country: "FR" }, { budget: 4 });
    expect(two.inputs).toHaveLength(2);
    expect(exhausted).toMatchObject({ calls: 4, truncated: true, terms: ["a", "b"] });
    const paged = fakeProvider(() => ({ ads: [], calls: 2, truncated: true }));
    expect((await collectMarketAds(paged.provider, { searchTerms: ["a"], country: "FR" })).truncated).toBe(true);
    const many = fakeProvider(() => ({ ads: [], calls: 1, truncated: false }));
    await collectMarketAds(many.provider, { searchTerms: ["a", "b", "c", "d", "e", "f", "g", "h"], country: "FR" });
    expect(many.inputs).toHaveLength(META_LIBRARY_TERMS_MAX);
  });

  it("collectMarketAds : une recherche en échec laisse les appels déjà comptés dans progress", async () => {
    const { provider } = fakeProvider((_input, index) => {
      if (index === 1) throw new MetaAdLibraryError("Meta ads_archive HTTP 500", { status: 500, transient: true });
      return { ads: [record("1")], calls: 2, truncated: false };
    });
    const progress = { calls: 0 };
    await expect(collectMarketAds(provider, { searchTerms: ["a", "b"], country: "FR" }, { progress })).rejects.toBeInstanceOf(MetaAdLibraryError);
    expect(progress.calls).toBe(2);
  });

  it("buildMetaMarket et marketSampleForAi : annonces classées, échantillon des mieux notées", () => {
    const records = Array.from({ length: 40 }, (_, i) => record(`ad-${i}`, { euTotalReach: 100 * (i + 1), targetLocations: [{ name: i % 2 ? "Albi" : "France", type: null, excluded: false }] }));
    const market = buildMetaMarket({ records, matchedTerms: { "ad-3": ["sophrologue"] }, terms: ["sophrologue"], calls: 2, truncated: true }, SEED, "meta", NOW);
    expect(market).toMatchObject({ version: 1, source: "meta", fetchedAt: NOW.toISOString(), country: "FR", terms: ["sophrologue"], calls: 2, truncated: true, insights: null });
    expect(market.scopeUsed).toBe("ville");
    expect(market.counts.ville).toBe(20);
    expect(market.ads.find((a) => a.id === "ad-3")?.matchedTerms).toEqual(["sophrologue"]);
    const sample = marketSampleForAi(market, 5);
    expect(sample.ads).toHaveLength(5);
    expect(sample.ads.map((a) => a.score)).toEqual([...sample.ads.map((a) => a.score)].sort((a, b) => b - a));
    expect(marketSampleForAi(market).ads.length).toBeLessThanOrEqual(META_MARKET_SAMPLE_FOR_AI);
  });

  it("renderUrlsOf : URL Blob des rendus, cache mémoire ignoré", () => {
    expect(renderUrlsOf({ version: 1, renders: { a: { key: "a", url: "https://blob/a.jpg", bytes: 1, renderedAt: "" }, b: { key: "b", url: null, bytes: 1, renderedAt: "" } } })).toEqual(["https://blob/a.jpg"]);
    expect(renderUrlsOf(null)).toEqual([]);
  });
});

describe("chaîne mock complète", () => {
  it("veille mock → sélection → diagnostic → créas → vidéo → plan : tous les *Issues vides", async () => {
    const provider = new MockAdLibraryProvider({ now: NOW, locality: localityOf(SEED) });
    const planner = createMetaAdsPlanner(MOCK_ENV);
    const progress = { calls: 0 };
    const result = await executeMetaAnalysis(CONTEXT, { provider, planner, instructions: "Mettre en avant le sommeil", now: NOW, progress });
    expect(result.providerMode).toBe("mock");
    expect(result.marketError).toBeNull();
    expect(result.generationError).toBeNull();
    expect(result.calls).toBe(SEED.searchTerms.length);
    expect(result.calls).toBeLessThanOrEqual(META_LIBRARY_MAX_CALLS);
    const market = result.market!;
    expect(market.source).toBe("mock");
    expect(market.terms).toEqual(SEED.searchTerms);
    expect(market.ads.length).toBeGreaterThan(0);
    expect(market.insights).not.toBeNull();
    expect(market.insights!.angles.length).toBeGreaterThan(0);
    // Les deux annonces communes à tous les termes remontent avec plusieurs termes
    expect(market.ads.some((a) => a.matchedTerms.length > 1)).toBe(true);
    expect(result.diagnostic.marketNote).not.toBeNull();
    expect(result.diagnostic.verdict).toBe("go");
    const paths = CONTEXT.landingPages.map((p) => p.path);
    expect(metaCreativeIssues(result.creatives!, paths)).toEqual([]);
    expect(result.creatives!.creatives.length).toBeGreaterThanOrEqual(3);
    expect(result.creatives!.notes.join(" ")).toContain("Mettre en avant le sommeil");
    expect(metaVideoPlanIssues(result.videoPlan!)).toEqual([]);
    expect(metaPlanIssues(result.plan!, true)).toEqual([]);
    expect(result.plan!.objective.type).toBe("conversions_site");
    expect(result.plan!.objective.pixelEvent).toBe("Schedule");
    // Déterminisme : même now → même veille
    const again = await executeMetaAnalysis(CONTEXT, { provider, planner, now: NOW });
    expect(again.market!.ads.map((a) => a.id)).toEqual(market.ads.map((a) => a.id));
  });

  it("sans Pixel : verdict wait, plan en trafic ; sans fournisseur : veille indisponible, analyse complète", async () => {
    const planner = createMetaAdsPlanner(MOCK_ENV);
    const ctx: MetaAdsContextData = { ...CONTEXT, diagnosticInput: { ...DIAGNOSTIC_INPUT, hasPixel: false } };
    const result = await executeMetaAnalysis(ctx, { provider: null, planner, now: NOW });
    expect(result.market).toBeNull();
    expect(result.providerMode).toBe("none");
    expect(result.marketError).toBeNull();
    expect(result.calls).toBe(0);
    expect(result.diagnostic.verdict).toBe("wait");
    expect(result.diagnostic.marketNote).toBeNull();
    expect(result.plan!.objective.type).toBe("traffic");
    expect(metaPlanIssues(result.plan!, false)).toEqual([]);
    expect(metaCreativeIssues(result.creatives!, ["/", "/gestion-du-stress"])).toEqual([]);
  });

  it("veille en échec (jeton expiré) : market null, provider none, message dans marketError, génération maintenue", async () => {
    const { provider } = fakeProvider(() => {
      throw new MetaAdLibraryError("Meta ads_archive HTTP 400 code 190 : expiré", { status: 400, code: 190 });
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await executeMetaAnalysis(CONTEXT, { provider, planner: createMetaAdsPlanner(MOCK_ENV), now: NOW });
      expect(result.market).toBeNull();
      expect(result.providerMode).toBe("none");
      expect(result.marketError).toBe(META_ERROR_MESSAGES.token);
      expect(result.creatives).not.toBeNull();
      expect(result.plan).not.toBeNull();
      expect(metaAnalysisError(result)).toBe(META_ERROR_MESSAGES.token);
    } finally {
      spy.mockRestore();
    }
  });

  it("génération en échec partiel : champ manquant à null, message utilisateur, le plan reçoit ce qui a abouti", async () => {
    const base = createMetaAdsPlanner(MOCK_ENV);
    const planner = { ...base, createVideoPlan: async () => Promise.reject(Object.assign(new Error("invalid"), { name: "ZodError" })) };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const generated = await generateMetaAds(planner, BRIEF, { diagnostic: (await executeMetaAnalysis(CONTEXT, { provider: null, planner: base, now: NOW })).diagnostic, market: null, landingPages: CONTEXT.landingPages }, "test");
      expect(generated.creatives).not.toBeNull();
      expect(generated.videoPlan).toBeNull();
      expect(generated.plan).not.toBeNull();
      expect(generated.plan!.adSets[0]!.creativeIds).toEqual(generated.creatives!.creatives.map((c) => c.id));
      expect(generated.error).toBeInstanceOf(Error);
      const result = await executeMetaAnalysis(CONTEXT, { provider: null, planner, now: NOW });
      expect(result.videoPlan).toBeNull();
      expect(result.generationError).toBe(META_ERROR_MESSAGES.generation);
    } finally {
      spy.mockRestore();
    }
  });

  it("synthèse IA en échec : la veille est conservée sans insights", async () => {
    const base = createMetaAdsPlanner(MOCK_ENV);
    const planner = { ...base, analyzeMarket: async () => Promise.reject(new Error("Overloaded")) };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await executeMetaAnalysis(CONTEXT, { provider: new MockAdLibraryProvider({ now: NOW, locality: localityOf(SEED) }), planner, now: NOW });
      expect(result.market).not.toBeNull();
      expect(result.market!.insights).toBeNull();
      expect(result.marketError).toBeNull();
      expect(result.providerMode).toBe("mock");
    } finally {
      spy.mockRestore();
    }
  });
});

// ─── Services avec base simulée ──────────────────────────────────────────────

function doneAnalysis(overrides: Partial<MetaAdsAnalysis> = {}): MetaAdsAnalysis {
  const diagnostic = { ...DIAGNOSTIC_INPUT, market: null };
  return {
    id: "22222222-2222-4222-8222-222222222222",
    siteId: SITE.id,
    status: "done",
    seed: SEED,
    market: null,
    diagnostic: { version: 1, generatedAt: NOW.toISOString(), verdict: "go", score: 95, headline: "", summary: "", affinity: { level: "forte", reason: "" }, checks: [{ id: "pixel", label: "Pixel", status: "ok", detail: "", critical: true }, { id: "booking", label: "RDV", status: "ok", detail: "", critical: false }], prerequisites: [], budget: { dailyMinEur: 5, dailyRecommendedEur: 10, monthlyMinEur: 150, monthlyRecommendedEur: 300, clicksMin: 150, clicksMax: 600, contactsMin: 4, contactsMax: 48 }, marketNote: null },
    creatives: null,
    videoPlan: null,
    plan: null,
    assets: { version: 1, renders: { "square:0:c1": { key: "square:0:c1", url: "https://blob/meta/c1.jpg", bytes: 10, renderedAt: NOW.toISOString() } } },
    instructions: null,
    provider: "none",
    generator: "mock",
    calls: 0,
    error: diagnostic ? META_ERROR_MESSAGES.generation : null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

type FakeWrite = { table: unknown; values: Record<string, unknown> };

/** Base simulée : lectures configurées, verrou acquis (sauf demande contraire), écritures enregistrées. */
function fakeDb(config: { analysis?: MetaAdsAnalysis | undefined; running?: { id: string; updatedAt: Date }[]; locked?: boolean; usage?: { kind: string; total: number }[] } = {}) {
  const updates: FakeWrite[] = [];
  const inserts: FakeWrite[] = [];
  const thenable = <T>(value: T) => ({ then: (res: (v: T) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(value).then(res, rej) });
  const selectChain = () => {
    const chain = { from: () => chain, where: () => chain, groupBy: () => chain, orderBy: () => chain, limit: () => chain, ...thenable(config.usage ?? []) };
    return chain;
  };
  const query = {
    sites: { findFirst: async () => SITE },
    metaAdsAnalyses: { findFirst: async () => config.analysis, findMany: async () => config.running ?? [] },
    prospects: { findFirst: async () => undefined },
    pages: { findMany: async () => [] },
    googleProfileAudits: { findFirst: async () => undefined },
    googleRankScans: { findFirst: async () => undefined },
    blogArticles: { findMany: async () => [] },
    googleReviews: { findMany: async () => [] },
    socialSettings: { findFirst: async () => undefined },
    blogSettings: { findFirst: async () => undefined },
  };
  const executor = {
    query,
    execute: async () => ({ rows: [{ locked: config.locked ?? true }] }),
    select: () => selectChain(),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return { ...thenable([]), returning: () => thenable([{ id: `new-${inserts.length}` }]) };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          updates.push({ table, values });
          return thenable([]);
        },
      }),
    }),
  };
  const db = { ...executor, transaction: async <T>(fn: (tx: typeof executor) => Promise<T>) => fn(executor) };
  return { db: db as unknown as Database, updates, inserts };
}

describe("runMetaAdsAnalysis (base simulée)", () => {
  it("démo en mock : ligne running + usage meta_analysis, puis done avec veille, créas, plans et appels réels", async () => {
    const fake = fakeDb();
    const outcome = await runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env: MOCK_ENV, instructions: "Sans tarif" });
    expect(outcome).toMatchObject({ status: "done", analysisId: "new-1", marketAvailable: true });
    expect("generationError" in outcome).toBe(false);
    const [analysisInsert, usageInsert] = fake.inserts;
    expect(analysisInsert!.table).toBe(metaAdsAnalyses);
    expect(analysisInsert!.values).toMatchObject({ siteId: SITE.id, status: "running", provider: "mock", generator: "mock", instructions: "Sans tarif", calls: 0 });
    expect(usageInsert!.table).toBe(googleUsage);
    expect(usageInsert!.values).toMatchObject({ siteId: SITE.id, kind: "meta_analysis", costUsd: 0, requests: 0 });
    const usageUpdate = fake.updates.find((u) => u.table === googleUsage);
    const done = fake.updates.find((u) => u.table === metaAdsAnalyses);
    expect(done!.values).toMatchObject({ status: "done", provider: "mock", generator: "mock", error: null, instructions: "Sans tarif" });
    expect(done!.values.calls).toBeGreaterThan(0);
    expect(usageUpdate!.values.requests).toBe(done!.values.calls);
    expect(done!.values.market).not.toBeNull();
    expect(done!.values.creatives).not.toBeNull();
    expect(done!.values.videoPlan).not.toBeNull();
    expect(done!.values.plan).not.toBeNull();
  });

  it("verrou refusé → busy ; quota atteint → quota (périmés clos avant) ; running récent → busy", async () => {
    expect(await runMetaAdsAnalysis(fakeDb({ locked: false }).db, SITE.id, { now: NOW, env: MOCK_ENV })).toEqual({ status: "skipped", reason: "busy" });
    const stale = { id: "old", updatedAt: new Date(NOW.getTime() - 60 * 60_000) };
    const quota = fakeDb({ running: [stale], usage: [{ kind: "meta_analysis", total: META_ADS_ANALYSES_PER_MONTH }] });
    expect(await runMetaAdsAnalysis(quota.db, SITE.id, { now: NOW, env: MOCK_ENV })).toEqual({ status: "skipped", reason: "quota" });
    expect(quota.updates).toHaveLength(1);
    expect(quota.updates[0]!.values).toMatchObject({ status: "error", error: META_ERROR_MESSAGES.interrupted });
    expect(quota.inserts).toHaveLength(0);
    const busy = fakeDb({ running: [{ id: "recent", updatedAt: new Date(NOW.getTime() - 60_000) }] });
    expect(await runMetaAdsAnalysis(busy.db, SITE.id, { now: NOW, env: MOCK_ENV })).toEqual({ status: "skipped", reason: "busy" });
  });

  it("sans fournisseur (démo sans jeton ni mock) : done, veille indisponible, provider none, aucun appel", async () => {
    const fake = fakeDb();
    const outcome = await runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env: { AI_MOCK: "1" } as NodeJS.ProcessEnv });
    expect(outcome).toMatchObject({ status: "done", marketAvailable: false });
    const done = fake.updates.find((u) => u.table === metaAdsAnalyses);
    expect(done!.values).toMatchObject({ status: "done", provider: "none", market: null, calls: 0, error: null });
    expect(fake.updates.find((u) => u.table === googleUsage)!.values).toEqual({ requests: 0 });
  });
});

describe("regenerateMetaAds (base simulée)", () => {
  it("régénère créas, plan vidéo et plan, remet les rendus à vide et inscrit meta_regen dans la même transaction", async () => {
    const fake = fakeDb({ analysis: doneAnalysis() });
    const outcome = await regenerateMetaAds(fake.db, SITE.id, { now: NOW, env: MOCK_ENV, instructions: "Sans tarif" });
    expect(outcome).toMatchObject({ status: "done", analysisId: doneAnalysis().id, remaining: META_ADS_REGENERATIONS_PER_MONTH - 1, removedRenderUrls: ["https://blob/meta/c1.jpg"] });
    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0]!.table).toBe(googleUsage);
    expect(fake.inserts[0]!.values).toMatchObject({ siteId: SITE.id, kind: "meta_regen", costUsd: 0, requests: 1 });
    expect(fake.updates).toHaveLength(1);
    const values = fake.updates[0]!.values;
    expect(values).toMatchObject({ generator: "mock", instructions: "Sans tarif", error: null, assets: { version: 1, renders: {} } });
    expect(metaCreativeIssues(values.creatives as never, ["/"])).toEqual([]);
    expect(metaVideoPlanIssues(values.videoPlan as never)).toEqual([]);
    expect(metaPlanIssues(values.plan as never, true)).toEqual([]);
    expect(isMetaRegenerationInFlight(SITE.id)).toBe(false);
  });

  it("conserve un message de veille, sans analyse → no_analysis, quota → quota, marqueur en cours → busy", async () => {
    const market = fakeDb({ analysis: doneAnalysis({ error: META_ERROR_MESSAGES.token }) });
    await regenerateMetaAds(market.db, SITE.id, { now: NOW, env: MOCK_ENV });
    expect(market.updates[0]!.values.error).toBe(META_ERROR_MESSAGES.token);
    expect(await regenerateMetaAds(fakeDb({ analysis: undefined }).db, SITE.id, { now: NOW, env: MOCK_ENV })).toEqual({ status: "skipped", reason: "no_analysis" });
    const quota = fakeDb({ analysis: doneAnalysis(), usage: [{ kind: "meta_regen", total: META_ADS_REGENERATIONS_PER_MONTH }] });
    expect(await regenerateMetaAds(quota.db, SITE.id, { now: NOW, env: MOCK_ENV })).toEqual({ status: "skipped", reason: "quota" });
    expect(quota.inserts).toHaveLength(0);
    expect(await regenerateMetaAds(fakeDb({ analysis: doneAnalysis(), locked: false }).db, SITE.id, { now: NOW, env: MOCK_ENV })).toEqual({ status: "skipped", reason: "busy" });
    expect(beginMetaRegeneration(SITE.id)).toBe(true);
    try {
      expect(await regenerateMetaAds(fakeDb({ analysis: doneAnalysis() }).db, SITE.id, { now: NOW, env: MOCK_ENV })).toEqual({ status: "skipped", reason: "busy" });
    } finally {
      endMetaRegeneration(SITE.id);
    }
    const [first, second] = await Promise.all([
      regenerateMetaAds(fakeDb({ analysis: doneAnalysis() }).db, SITE.id, { now: NOW, env: MOCK_ENV }),
      regenerateMetaAds(fakeDb({ analysis: doneAnalysis() }).db, SITE.id, { now: NOW, env: MOCK_ENV }),
    ]);
    expect([first.status, second.status].sort()).toEqual(["done", "skipped"]);
  });

  it("génération en échec → error avec le message utilisateur, rien d'inscrit", async () => {
    const fake = fakeDb({ analysis: doneAnalysis() });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // Clé présente sans AI_MOCK : le stub du planificateur refuse de générer
      const outcome = await regenerateMetaAds(fake.db, SITE.id, { now: NOW, env: { ANTHROPIC_API_KEY: "sk-test" } as NodeJS.ProcessEnv });
      expect(outcome).toEqual({ status: "error", message: META_ERROR_MESSAGES.generation });
      expect(fake.inserts).toHaveLength(0);
      expect(fake.updates).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});
