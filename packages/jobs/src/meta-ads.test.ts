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
  type MetaAdsCreativeSet,
  type MetaAdsDiagnostic,
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
  META_USAGE_REFUND_TOLERANCE_MS,
  addressFromSections,
  beginMetaRegeneration,
  buildMetaMarket,
  cleanMetaInstructions,
  collectMarketAds,
  decideMetaStart,
  endMetaRegeneration,
  executeMetaAnalysis,
  generateMetaAds,
  hasFreshMetaRunning,
  hasMetaAdsAccess,
  isMetaAnalysisStale,
  isMetaMarketBlocking,
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
  metaRegenerationError,
  regenerateMetaAds,
  renderUrlsOf,
  runMetaAdsAnalysis,
  usageFromCounts,
  usageRefundWindow,
  withCreativePhotoUrls,
  type MetaAdsContextData,
  type MetaRunningRow,
} from "./meta-ads";

const NOW = new Date("2026-10-26T06:00:00Z");
const THEME: SiteTheme = { preset: "terracotta", fontPreset: "chaleureux" } as SiteTheme;
const THEME_WITH_PIXEL: SiteTheme = { ...THEME, tracking: { metaPixelId: "123456789012345" } } as SiteTheme;
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

const SITE_WITH_PIXEL: Site = { ...SITE, theme: THEME_WITH_PIXEL };

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

const rateLimited = () => new MetaAdLibraryError("Meta ads_archive HTTP 400 code 4 : (#4) Application request limit reached", { status: 400, code: 4, transient: true });
const serverError = () => new MetaAdLibraryError("Meta ads_archive HTTP 500", { status: 500, transient: true });

function silenced<T>(run: () => Promise<T>): Promise<T> {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  return run().finally(() => {
    error.mockRestore();
    warn.mockRestore();
    info.mockRestore();
  });
}

describe("accès, fournisseur et messages", () => {
  it("hasMetaAdsAccess : démos toujours, clients selon la formule", () => {
    expect(hasMetaAdsAccess({ type: "demo", plan: "starter" })).toBe(true);
    expect(hasMetaAdsAccess({ type: "client", plan: "scale" })).toBe(true);
    expect(hasMetaAdsAccess({ type: "client", plan: "starter" })).toBe(false);
  });

  it("marketProviderFor : mock réservé aux démos ; client sans jeton → null ; client avec jeton → réel, même sous META_ADS_MOCK", () => {
    expect(marketProviderFor(MOCK_ENV, "demo")?.mode).toBe("mock");
    expect(marketProviderFor(MOCK_ENV, "client")).toBeNull();
    expect(marketProviderFor({} as NodeJS.ProcessEnv, "client")).toBeNull();
    expect(marketProviderFor({} as NodeJS.ProcessEnv, "demo")).toBeNull();
    expect(marketProviderFor({ META_AD_LIBRARY_TOKEN: "EAAB-jeton" } as NodeJS.ProcessEnv, "client")?.mode).toBe("meta");
    // Jeton présent sous META_ADS_MOCK=1 : jamais de données simulées sur un site client, la démo garde le mock
    expect(marketProviderFor({ ...MOCK_ENV, META_AD_LIBRARY_TOKEN: "EAAB-jeton" }, "client")?.mode).toBe("meta");
    expect(marketProviderFor({ ...MOCK_ENV, META_AD_LIBRARY_TOKEN: "EAAB-jeton" }, "demo")?.mode).toBe("mock");
    expect(marketProviderFor({ ...MOCK_ENV, META_AD_LIBRARY_TOKEN: "   " }, "client")).toBeNull();
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
    expect(isMetaMarketMessage(META_ERROR_MESSAGES.marketMissing)).toBe(true);
    expect(isMetaMarketMessage(META_ERROR_MESSAGES.generation)).toBe(false);
    expect(isMetaMarketMessage(null)).toBe(false);
  });

  it("metaAnalysisError : la génération (à relancer) prime sur la veille", () => {
    expect(metaAnalysisError({ marketError: null, generationError: null })).toBeNull();
    expect(metaAnalysisError({ marketError: META_ERROR_MESSAGES.transient, generationError: null })).toBe(META_ERROR_MESSAGES.transient);
    expect(metaAnalysisError({ marketError: META_ERROR_MESSAGES.transient, generationError: META_ERROR_MESSAGES.generation })).toBe(META_ERROR_MESSAGES.generation);
  });

  it("metaRegenerationError : génération d'abord, puis message de veille conservé, sinon message recalculé si la veille manque avec un fournisseur, sinon rien", () => {
    const base = { market: null, provider: "meta" as const, error: null };
    expect(metaRegenerationError(base, META_ERROR_MESSAGES.generation)).toBe(META_ERROR_MESSAGES.generation);
    expect(metaRegenerationError({ ...base, error: META_ERROR_MESSAGES.token })).toBe(META_ERROR_MESSAGES.token);
    // Le message de veille a été écrasé par celui d'une génération : recalculé depuis la constante
    expect(metaRegenerationError({ ...base, error: META_ERROR_MESSAGES.generation })).toBe(META_ERROR_MESSAGES.marketMissing);
    expect(metaRegenerationError({ ...base, provider: "mock", error: null })).toBe(META_ERROR_MESSAGES.marketMissing);
    // Sans fournisseur, la veille est « en attente d'activation » : pas un échec
    expect(metaRegenerationError({ ...base, provider: "none", error: META_ERROR_MESSAGES.generation })).toBeNull();
    // Veille présente : rien à conserver
    const market = buildMetaMarket({ records: [record("1")], matchedTerms: {}, terms: ["sophrologue"], calls: 1, truncated: false }, SEED, "meta", NOW);
    expect(metaRegenerationError({ market, provider: "meta", error: META_ERROR_MESSAGES.generation })).toBeNull();
    // Veille partielle (un terme en échec) : son message est gardé
    expect(metaRegenerationError({ market: { ...market, truncated: true }, provider: "meta", error: META_ERROR_MESSAGES.transient })).toBe(META_ERROR_MESSAGES.transient);
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

  it("metaDiagnosticInputFrom : la veille ne transmet que zone, comptes, signaux forts par zone et annonces", () => {
    const market = buildMetaMarket({ records: [record("1")], matchedTerms: { "1": ["sophrologue"] }, terms: ["sophrologue"], calls: 1, truncated: false }, SEED, "mock", NOW);
    const input = metaDiagnosticInputFrom(DIAGNOSTIC_INPUT, market);
    expect(input.market).toEqual({ scopeUsed: market.scopeUsed, counts: market.counts, strongCounts: market.strongCounts, ads: market.ads });
    // Veille enregistrée avant `strongCounts` : le champ reste absent (le diagnostic se rabat sur les annonces conservées)
    const { strongCounts: _ignored, ...legacy } = market;
    expect(metaDiagnosticInputFrom(DIAGNOSTIC_INPUT, legacy).market).toEqual({ scopeUsed: market.scopeUsed, counts: market.counts, ads: market.ads });
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

  it("withCreativePhotoUrls : `photoUrl` résolu depuis photosById, null sans photo ou photo inconnue", () => {
    const set = { version: 1, generatedAt: NOW.toISOString(), generator: "mock", notes: [], creatives: [{ id: "c1", photoId: "p1" }, { id: "c2", photoId: null }, { id: "c3", photoId: "p9" }] } as unknown as MetaAdsCreativeSet;
    const out = withCreativePhotoUrls(set, { p1: "https://cdn/p1.jpg" });
    expect(out.creatives.map((c) => c.photoUrl)).toEqual(["https://cdn/p1.jpg", null, null]);
    expect(set.creatives[0]).not.toHaveProperty("photoUrl");
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

  it("isMetaAnalysisStale / hasFreshMetaRunning : péremption sur `updatedAt` (15 min), une ligne vivante suffit à occuper le site", () => {
    const limit = META_ADS_ANALYSIS_STALE_MINUTES * 60_000;
    expect(isMetaAnalysisStale({ updatedAt: new Date(NOW.getTime() - limit) }, NOW)).toBe(false);
    expect(isMetaAnalysisStale({ updatedAt: new Date(NOW.getTime() - limit - 1) }, NOW)).toBe(true);
    // Un battement récent ressuscite une analyse lancée il y a longtemps
    const revived: MetaRunningRow = { id: "x", updatedAt: new Date(NOW.getTime() - 30_000), createdAt: new Date(NOW.getTime() - 3 * limit) };
    expect(isMetaAnalysisStale(revived, NOW)).toBe(false);
    expect(hasFreshMetaRunning([], NOW)).toBe(false);
    expect(hasFreshMetaRunning([{ updatedAt: new Date(NOW.getTime() - limit - 1) }], NOW)).toBe(false);
    expect(hasFreshMetaRunning([{ updatedAt: new Date(NOW.getTime() - limit - 1) }, { updatedAt: new Date(NOW.getTime() - 1_000) }], NOW)).toBe(true);
  });

  it("decideMetaStart : verrou refusé → busy ; running récent → busy ; périmés clos (avec leur createdAt) puis quota ; ok", () => {
    const fresh = { id: "a", updatedAt: new Date(NOW.getTime() - 60_000) };
    const staleCreated = new Date(NOW.getTime() - 2 * 60 * 60_000);
    const stale = { id: "b", updatedAt: new Date(NOW.getTime() - (META_ADS_ANALYSIS_STALE_MINUTES + 1) * 60_000), createdAt: staleCreated };
    expect(decideMetaStart({ locked: false, running: [stale], analysesUsed: 0, now: NOW })).toEqual({ kind: "busy", staleIds: [], stale: [] });
    expect(decideMetaStart({ locked: true, running: [fresh, stale], analysesUsed: 0, now: NOW })).toEqual({ kind: "busy", staleIds: ["b"], stale: [{ id: "b", createdAt: staleCreated }] });
    expect(decideMetaStart({ locked: true, running: [stale], analysesUsed: META_ADS_ANALYSES_PER_MONTH, now: NOW })).toEqual({ kind: "quota", staleIds: ["b"], stale: [{ id: "b", createdAt: staleCreated }] });
    expect(decideMetaStart({ locked: true, running: [stale], analysesUsed: 1, now: NOW })).toEqual({ kind: "ok", staleIds: ["b"], stale: [{ id: "b", createdAt: staleCreated }] });
    expect(decideMetaStart({ locked: true, running: [{ ...stale, createdAt: undefined }], analysesUsed: 1, now: NOW })).toEqual({ kind: "ok", staleIds: ["b"], stale: [{ id: "b", createdAt: null }] });
    expect(decideMetaStart({ locked: true, running: [], analysesUsed: 0, now: NOW })).toEqual({ kind: "ok", staleIds: [], stale: [] });
  });

  it("usageRefundWindow : ± 5 s autour du createdAt de l'analyse périmée", () => {
    const { from, to } = usageRefundWindow(NOW);
    expect(to.getTime() - from.getTime()).toBe(2 * META_USAGE_REFUND_TOLERANCE_MS);
    expect(from.getTime()).toBe(NOW.getTime() - 5_000);
    expect(usageRefundWindow(NOW, 1_000)).toEqual({ from: new Date(NOW.getTime() - 1_000), to: new Date(NOW.getTime() + 1_000) });
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
    expect(result).toMatchObject({ truncated: false, error: null, failedTerms: [] });
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

  it("collectMarketAds : un terme en échec n'efface pas la veille — t1 OK, t2 → code 4 : annonces de t1 gardées, truncated, erreur rendue, termes suivants abandonnés", async () => {
    const { provider, inputs } = fakeProvider((_input, index) => {
      if (index === 1) throw rateLimited();
      return { ads: [record(`ad-${index}`)], calls: 2, truncated: false };
    });
    const progress = { calls: 0 };
    const result = await collectMarketAds(provider, { searchTerms: ["sophrologue", "sophrologie", "stress"], country: "FR" }, { progress });
    // Code Graph connu (limite de débit) : inutile d'insister sur « stress »
    expect(inputs.map((i) => i.term)).toEqual(["sophrologue", "sophrologie"]);
    expect(result.records.map((a) => a.id)).toEqual(["ad-0"]);
    expect(result.terms).toEqual(["sophrologue"]);
    expect(result.failedTerms).toEqual(["sophrologie", "stress"]);
    expect(result.truncated).toBe(true);
    expect(result.error).toBeInstanceOf(MetaAdLibraryError);
    expect((result.error as MetaAdLibraryError).code).toBe(4);
    expect(result.calls).toBe(2);
    expect(progress.calls).toBe(2);
    expect(isMetaMarketBlocking(rateLimited())).toBe(true);
    expect(isMetaMarketBlocking(serverError())).toBe(false);
    expect(isMetaMarketBlocking(new Error("réseau"))).toBe(false);
  });

  it("collectMarketAds : un incident sans code Graph (5xx, réseau) n'empêche pas le terme suivant ; lève seulement si aucune recherche n'a abouti", async () => {
    const flaky = fakeProvider((_input, index) => {
      if (index === 0) throw serverError();
      return { ads: [record(`ad-${index}`)], calls: 1, truncated: false };
    });
    const partial = await collectMarketAds(flaky.provider, { searchTerms: ["a", "b", "c"], country: "FR" });
    expect(flaky.inputs.map((i) => i.term)).toEqual(["a", "b", "c"]);
    expect(partial).toMatchObject({ terms: ["b", "c"], failedTerms: ["a"], truncated: true, calls: 2 });
    expect(partial.records.map((a) => a.id)).toEqual(["ad-1", "ad-2"]);
    expect(partial.error).toBeInstanceOf(MetaAdLibraryError);
    const dead = fakeProvider(() => {
      throw serverError();
    });
    const progress = { calls: 0 };
    await expect(collectMarketAds(dead.provider, { searchTerms: ["a", "b"], country: "FR" }, { progress })).rejects.toBeInstanceOf(MetaAdLibraryError);
    expect(dead.inputs).toHaveLength(2);
    expect(progress.calls).toBe(0);
    // Jeton expiré dès le premier terme : bloquant, un seul appel, levé
    const expired = fakeProvider(() => {
      throw new MetaAdLibraryError("code 190", { status: 400, code: 190 });
    });
    await expect(collectMarketAds(expired.provider, { searchTerms: ["a", "b"], country: "FR" })).rejects.toMatchObject({ code: 190 });
    expect(expired.inputs).toHaveLength(1);
  });

  it("buildMetaMarket et marketSampleForAi : annonces classées, comptes et signaux forts par zone, échantillon des mieux notées", () => {
    const records = Array.from({ length: 40 }, (_, i) => record(`ad-${i}`, { euTotalReach: 100 * (i + 1), targetLocations: [{ name: i % 2 ? "Albi" : "France", type: null, excluded: false }] }));
    const market = buildMetaMarket({ records, matchedTerms: { "ad-3": ["sophrologue"] }, terms: ["sophrologue"], calls: 2, truncated: true }, SEED, "meta", NOW);
    expect(market).toMatchObject({ version: 1, source: "meta", fetchedAt: NOW.toISOString(), country: "FR", terms: ["sophrologue"], calls: 2, truncated: true, insights: null });
    expect(market.scopeUsed).toBe("ville");
    expect(market.counts.ville).toBe(20);
    expect(market.strongCounts).toEqual({ ville: market.ads.filter((a) => a.signal === "fort" && a.scope === "ville").length, departement: 0, region: 0, france: records.filter((_r, i) => i % 2 === 0 && 100 * (i + 1) >= 10_000).length });
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
  it("veille mock → sélection → diagnostic → créas → vidéo → plan : tous les *Issues vides, photoUrl résolu, battements après la veille et entre les générations", async () => {
    const provider = new MockAdLibraryProvider({ now: NOW, locality: localityOf(SEED) });
    const planner = createMetaAdsPlanner(MOCK_ENV);
    const progress = { calls: 0 };
    const beats: number[] = [];
    const heartbeat = async () => {
      beats.push(Date.now());
    };
    const ctx: MetaAdsContextData = { ...CONTEXT, photosById: { p1: "https://cdn/p1.jpg" } };
    const result = await executeMetaAnalysis(ctx, { provider, planner, instructions: "Mettre en avant le sommeil", now: NOW, progress, heartbeat });
    expect(result.providerMode).toBe("mock");
    expect(result.marketError).toBeNull();
    expect(result.generationError).toBeNull();
    expect(result.calls).toBe(SEED.searchTerms.length);
    expect(result.calls).toBeLessThanOrEqual(META_LIBRARY_MAX_CALLS);
    expect(beats).toHaveLength(3);
    const market = result.market!;
    expect(market.source).toBe("mock");
    expect(market.terms).toEqual(SEED.searchTerms);
    expect(market.ads.length).toBeGreaterThan(0);
    expect(market.strongCounts).toBeDefined();
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
    // `photoUrl` renseigné depuis photosById (p1 est la seule photo du brief)
    for (const c of result.creatives!.creatives) expect(c.photoUrl).toBe(c.photoId === "p1" ? "https://cdn/p1.jpg" : null);
    expect(metaVideoPlanIssues(result.videoPlan!)).toEqual([]);
    expect(metaPlanIssues(result.plan!, true)).toEqual([]);
    expect(result.plan!.objective.type).toBe("conversions_site");
    expect(result.plan!.objective.pixelEvent).toBe("Schedule");
    expect(result.plan!.campaign.landingSuffix).toBe("?src=meta");
    // Déterminisme : même now → même veille ; sans photosById ni battement, photoUrl absent
    const again = await executeMetaAnalysis(CONTEXT, { provider, planner, now: NOW });
    expect(again.market!.ads.map((a) => a.id)).toEqual(market.ads.map((a) => a.id));
    expect(again.creatives!.creatives[0]).not.toHaveProperty("photoUrl");
  });

  it("sans Pixel : verdict wait, plan en trafic ; sans fournisseur : veille indisponible, provider none, deux battements (entre les générations)", async () => {
    const planner = createMetaAdsPlanner(MOCK_ENV);
    const ctx: MetaAdsContextData = { ...CONTEXT, diagnosticInput: { ...DIAGNOSTIC_INPUT, hasPixel: false } };
    let beats = 0;
    const result = await executeMetaAnalysis(ctx, {
      provider: null,
      planner,
      now: NOW,
      heartbeat: async () => {
        beats++;
      },
    });
    expect(result.market).toBeNull();
    expect(result.providerMode).toBe("none");
    expect(result.marketError).toBeNull();
    expect(result.calls).toBe(0);
    expect(beats).toBe(2);
    expect(result.diagnostic.verdict).toBe("wait");
    expect(result.diagnostic.marketNote).toBeNull();
    expect(result.plan!.objective.type).toBe("traffic");
    expect(metaPlanIssues(result.plan!, false)).toEqual([]);
    expect(metaCreativeIssues(result.creatives!, ["/", "/gestion-du-stress"])).toEqual([]);
  });

  it("veille en échec total (jeton expiré) : market null, provider conservé (meta), message dans marketError, génération maintenue", async () => {
    const { provider } = fakeProvider(() => {
      throw new MetaAdLibraryError("Meta ads_archive HTTP 400 code 190 : expiré", { status: 400, code: 190 });
    });
    await silenced(async () => {
      const result = await executeMetaAnalysis(CONTEXT, { provider, planner: createMetaAdsPlanner(MOCK_ENV), now: NOW });
      expect(result.market).toBeNull();
      expect(result.providerMode).toBe("meta");
      expect(result.marketError).toBe(META_ERROR_MESSAGES.token);
      expect(result.creatives).not.toBeNull();
      expect(result.plan).not.toBeNull();
      expect(metaAnalysisError(result)).toBe(META_ERROR_MESSAGES.token);
    });
  });

  it("veille partielle (t1 OK, t2 → code 4) : veille conservée et tronquée, synthèse produite, message de veille dans marketError", async () => {
    const { provider } = fakeProvider((_input, index) => {
      if (index === 1) throw rateLimited();
      return { ads: Array.from({ length: 10 }, (_, i) => record(`ad-${index}-${i}`)), calls: 1, truncated: false };
    });
    await silenced(async () => {
      const result = await executeMetaAnalysis(CONTEXT, { provider, planner: createMetaAdsPlanner(MOCK_ENV), now: NOW });
      expect(result.providerMode).toBe("meta");
      expect(result.market).not.toBeNull();
      expect(result.market!.truncated).toBe(true);
      expect(result.market!.terms).toEqual([SEED.searchTerms[0]]);
      expect(result.market!.ads).toHaveLength(10);
      expect(result.market!.insights).not.toBeNull();
      expect(result.calls).toBe(1);
      expect(result.marketError).toBe(META_ERROR_MESSAGES.transient);
      expect(metaAnalysisError(result)).toBe(META_ERROR_MESSAGES.transient);
      expect(result.diagnostic.marketNote).toContain("10 annonces près de chez vous");
    });
  });

  it("génération en échec partiel : champ manquant à null, message utilisateur, le plan reçoit ce qui a abouti", async () => {
    const base = createMetaAdsPlanner(MOCK_ENV);
    const planner = { ...base, createVideoPlan: async () => Promise.reject(Object.assign(new Error("invalid"), { name: "ZodError" })) };
    await silenced(async () => {
      const generated = await generateMetaAds(planner, BRIEF, { diagnostic: (await executeMetaAnalysis(CONTEXT, { provider: null, planner: base, now: NOW })).diagnostic, market: null, landingPages: CONTEXT.landingPages }, "test");
      expect(generated.creatives).not.toBeNull();
      expect(generated.videoPlan).toBeNull();
      expect(generated.plan).not.toBeNull();
      expect(generated.plan!.adSets[0]!.creativeIds).toEqual(generated.creatives!.creatives.map((c) => c.id));
      expect(generated.error).toBeInstanceOf(Error);
      const result = await executeMetaAnalysis(CONTEXT, { provider: null, planner, now: NOW });
      expect(result.videoPlan).toBeNull();
      expect(result.generationError).toBe(META_ERROR_MESSAGES.generation);
    });
  });

  it("un battement qui échoue n'interrompt pas l'analyse", async () => {
    await silenced(async () => {
      const result = await executeMetaAnalysis(CONTEXT, {
        provider: new MockAdLibraryProvider({ now: NOW, locality: localityOf(SEED) }),
        planner: createMetaAdsPlanner(MOCK_ENV),
        now: NOW,
        heartbeat: async () => Promise.reject(new Error("connexion perdue")),
      });
      expect(result.market).not.toBeNull();
      expect(result.plan).not.toBeNull();
      expect(result.generationError).toBeNull();
    });
  });

  it("synthèse IA en échec : la veille est conservée sans insights", async () => {
    const base = createMetaAdsPlanner(MOCK_ENV);
    const planner = { ...base, analyzeMarket: async () => Promise.reject(new Error("Overloaded")) };
    await silenced(async () => {
      const result = await executeMetaAnalysis(CONTEXT, { provider: new MockAdLibraryProvider({ now: NOW, locality: localityOf(SEED) }), planner, now: NOW });
      expect(result.market).not.toBeNull();
      expect(result.market!.insights).toBeNull();
      expect(result.marketError).toBeNull();
      expect(result.providerMode).toBe("mock");
    });
  });
});

// ─── Services avec base simulée ──────────────────────────────────────────────

const DONE_DIAGNOSTIC: MetaAdsDiagnostic = {
  version: 1,
  generatedAt: NOW.toISOString(),
  verdict: "go",
  score: 95,
  headline: "",
  summary: "",
  affinity: { level: "forte", reason: "" },
  checks: [
    { id: "pixel", label: "Pixel", status: "ok", detail: "", critical: true },
    { id: "booking", label: "RDV", status: "ok", detail: "", critical: false },
  ],
  prerequisites: [],
  budget: { dailyMinEur: 5, dailyRecommendedEur: 10, monthlyMinEur: 150, monthlyRecommendedEur: 300, clicksMin: 150, clicksMax: 600, contactsMin: 4, contactsMax: 48 },
  marketNote: null,
};

function doneAnalysis(overrides: Partial<MetaAdsAnalysis> = {}): MetaAdsAnalysis {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    siteId: SITE.id,
    status: "done",
    seed: SEED,
    market: null,
    diagnostic: DONE_DIAGNOSTIC,
    creatives: null,
    videoPlan: null,
    plan: null,
    assets: { version: 1, renders: { "square:0:c1": { key: "square:0:c1", url: "https://blob/meta/c1.jpg", bytes: 10, renderedAt: NOW.toISOString() } } },
    instructions: null,
    provider: "none",
    generator: "mock",
    calls: 0,
    error: META_ERROR_MESSAGES.generation,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

type FakeWrite = { table: unknown; values: Record<string, unknown> };

type FakeDbConfig = {
  site?: Site;
  /** Dernière analyse `done` lue au départ d'une régénération */
  analysis?: MetaAdsAnalysis | undefined;
  /** Dernière analyse `done` relue dans la transaction finale (défaut : la même ; null : plus aucune) */
  latestDone?: MetaAdsAnalysis | null;
  running?: { id: string; updatedAt: Date; createdAt?: Date }[];
  locked?: boolean;
  usage?: { kind: string; total: number }[];
  /** Lignes rendues par `update().returning()` (défaut : une ligne) */
  updateReturning?: (values: Record<string, unknown>) => { id: string }[];
};

/** Base simulée : lectures configurées, verrou acquis (sauf demande contraire), écritures enregistrées. */
function fakeDb(config: FakeDbConfig = {}) {
  const updates: FakeWrite[] = [];
  const inserts: FakeWrite[] = [];
  const deletes: unknown[] = [];
  let analysisReads = 0;
  const thenable = <T>(value: T) => ({ then: (res: (v: T) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(value).then(res, rej) });
  const selectChain = () => {
    const chain = { from: () => chain, where: () => chain, groupBy: () => chain, orderBy: () => chain, limit: () => chain, ...thenable(config.usage ?? []) };
    return chain;
  };
  const query = {
    sites: { findFirst: async () => config.site ?? SITE },
    metaAdsAnalyses: {
      findFirst: async () => {
        analysisReads++;
        if (analysisReads === 1 || config.latestDone === undefined) return config.analysis;
        return config.latestDone ?? undefined;
      },
      findMany: async () => config.running ?? [],
    },
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
          const rows = config.updateReturning ? config.updateReturning(values) : [{ id: "updated" }];
          return { ...thenable(rows), returning: () => thenable(rows) };
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        deletes.push(table);
        return thenable([]);
      },
    }),
  };
  const db = { ...executor, transaction: async <T>(fn: (tx: typeof executor) => Promise<T>) => fn(executor) };
  return { db: db as unknown as Database, updates, inserts, deletes };
}

const doneUpdate = (updates: FakeWrite[]) => updates.find((u) => u.table === metaAdsAnalyses && u.values.status === "done");
const heartbeats = (updates: FakeWrite[]) => updates.filter((u) => u.table === metaAdsAnalyses && Object.keys(u.values).length === 1 && u.values.updatedAt instanceof Date);

describe("runMetaAdsAnalysis (base simulée)", () => {
  it("démo en mock : ligne running + usage meta_analysis au même createdAt, battements, puis done avec veille, créas, plans et appels réels", async () => {
    const fake = fakeDb();
    const outcome = await silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env: MOCK_ENV, instructions: "Sans tarif" }));
    expect(outcome).toMatchObject({ status: "done", analysisId: "new-1", marketAvailable: true });
    expect("generationError" in outcome).toBe(false);
    const [analysisInsert, usageInsert] = fake.inserts;
    expect(analysisInsert!.table).toBe(metaAdsAnalyses);
    expect(analysisInsert!.values).toMatchObject({ siteId: SITE.id, status: "running", provider: "mock", generator: "mock", instructions: "Sans tarif", calls: 0, createdAt: NOW });
    expect(usageInsert!.table).toBe(googleUsage);
    expect(usageInsert!.values).toMatchObject({ siteId: SITE.id, kind: "meta_analysis", costUsd: 0, requests: 0, createdAt: NOW });
    // Un battement après la veille, deux entre les générations
    expect(heartbeats(fake.updates)).toHaveLength(3);
    const usageUpdate = fake.updates.find((u) => u.table === googleUsage);
    const done = doneUpdate(fake.updates);
    expect(done!.values).toMatchObject({ status: "done", provider: "mock", generator: "mock", error: null, instructions: "Sans tarif" });
    expect(done!.values.calls).toBeGreaterThan(0);
    expect(usageUpdate!.values.requests).toBe(done!.values.calls);
    expect(done!.values.market).not.toBeNull();
    expect(done!.values.creatives).not.toBeNull();
    expect(done!.values.videoPlan).not.toBeNull();
    expect(done!.values.plan).not.toBeNull();
    expect(fake.deletes).toHaveLength(0);
  });

  it("verrou refusé → busy ; quota atteint → quota (périmés clos avant, usage remboursé) ; running récent → busy", async () => {
    expect(await runMetaAdsAnalysis(fakeDb({ locked: false }).db, SITE.id, { now: NOW, env: MOCK_ENV })).toEqual({ status: "skipped", reason: "busy" });
    const stale = { id: "old", updatedAt: new Date(NOW.getTime() - 60 * 60_000), createdAt: new Date(NOW.getTime() - 61 * 60_000) };
    const quota = fakeDb({ running: [stale], usage: [{ kind: "meta_analysis", total: META_ADS_ANALYSES_PER_MONTH }] });
    expect(await silenced(() => runMetaAdsAnalysis(quota.db, SITE.id, { now: NOW, env: MOCK_ENV }))).toEqual({ status: "skipped", reason: "quota" });
    expect(quota.updates).toHaveLength(1);
    expect(quota.updates[0]!.values).toMatchObject({ status: "error", error: META_ERROR_MESSAGES.interrupted });
    // La ligne google_usage meta_analysis insérée avec l'analyse périmée est supprimée
    expect(quota.deletes).toEqual([googleUsage]);
    expect(quota.inserts).toHaveLength(0);
    // Périmée sans createdAt connu : close, rien à rembourser
    const unknownCreated = fakeDb({ running: [{ id: "old", updatedAt: stale.updatedAt }], usage: [{ kind: "meta_analysis", total: META_ADS_ANALYSES_PER_MONTH }] });
    await silenced(() => runMetaAdsAnalysis(unknownCreated.db, SITE.id, { now: NOW, env: MOCK_ENV }));
    expect(unknownCreated.deletes).toHaveLength(0);
    const busy = fakeDb({ running: [{ id: "recent", updatedAt: new Date(NOW.getTime() - 60_000) }] });
    expect(await runMetaAdsAnalysis(busy.db, SITE.id, { now: NOW, env: MOCK_ENV })).toEqual({ status: "skipped", reason: "busy" });
    expect(busy.inserts).toHaveLength(0);
  });

  it("ligne close pour péremption pendant l'analyse : le résultat n'est pas enregistré (done refusé), erreur « interrompue »", async () => {
    const fake = fakeDb({ updateReturning: (values) => (values.status === "done" ? [] : [{ id: "x" }]) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const outcome = await silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env: MOCK_ENV }));
      expect(outcome).toEqual({ status: "error", analysisId: "new-1", message: META_ERROR_MESSAGES.interrupted });
      expect(doneUpdate(fake.updates)).toBeDefined();
      // Aucune écriture d'erreur par-dessus la ligne déjà close
      expect(fake.updates.filter((u) => u.table === metaAdsAnalyses && u.values.status === "error")).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });

  it("sans fournisseur (démo sans jeton ni mock) : done, veille indisponible, provider none, aucun appel", async () => {
    const fake = fakeDb();
    const outcome = await silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env: { AI_MOCK: "1" } as NodeJS.ProcessEnv }));
    expect(outcome).toMatchObject({ status: "done", marketAvailable: false });
    const done = doneUpdate(fake.updates);
    expect(done!.values).toMatchObject({ status: "done", provider: "none", market: null, calls: 0, error: null });
    expect(fake.updates.find((u) => u.table === googleUsage)!.values).toEqual({ requests: 0 });
    expect(heartbeats(fake.updates)).toHaveLength(2);
  });

  it("veille en échec sur un site client avec jeton : done, provider meta (pas none), market null et message de veille dans error", async () => {
    const fake = fakeDb({ site: { ...SITE, type: "client" } as Site });
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ error: { message: "Session has expired", code: 190 } }), { status: 400 });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const outcome = await silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env: { AI_MOCK: "1", META_ADS_MOCK: "1", META_AD_LIBRARY_TOKEN: "EAAB-jeton" } as NodeJS.ProcessEnv }));
      expect(outcome).toMatchObject({ status: "done", marketAvailable: false });
      expect(fake.inserts[0]!.values).toMatchObject({ provider: "meta" });
      expect(doneUpdate(fake.updates)!.values).toMatchObject({ status: "done", provider: "meta", market: null, calls: 0, error: META_ERROR_MESSAGES.token });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("regenerateMetaAds (base simulée)", () => {
  it("régénère créas (photoUrl résolu), plan vidéo et plan, recalcule le diagnostic, remet les rendus à vide (rien à supprimer) et inscrit meta_regen dans la même transaction", async () => {
    const fake = fakeDb({ analysis: doneAnalysis(), site: SITE_WITH_PIXEL });
    const outcome = await silenced(() => regenerateMetaAds(fake.db, SITE.id, { now: NOW, env: MOCK_ENV, instructions: "Sans tarif" }));
    expect(outcome).toEqual({ status: "done", analysisId: doneAnalysis().id, remaining: META_ADS_REGENERATIONS_PER_MONTH - 1, removedRenderUrls: [] });
    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0]!.table).toBe(googleUsage);
    expect(fake.inserts[0]!.values).toMatchObject({ siteId: SITE.id, kind: "meta_regen", costUsd: 0, requests: 1 });
    expect(fake.updates).toHaveLength(1);
    const values = fake.updates[0]!.values;
    expect(values).toMatchObject({ generator: "mock", instructions: "Sans tarif", error: null, assets: { version: 1, renders: {} } });
    const diagnostic = values.diagnostic as MetaAdsDiagnostic;
    expect(diagnostic.generatedAt).toBe(NOW.toISOString());
    expect(diagnostic.checks.find((c) => c.id === "pixel")?.status).toBe("ok");
    expect(metaCreativeIssues(values.creatives as never, ["/"])).toEqual([]);
    for (const c of (values.creatives as MetaAdsCreativeSet).creatives) expect(c).toHaveProperty("photoUrl");
    expect(metaVideoPlanIssues(values.videoPlan as never)).toEqual([]);
    expect(metaPlanIssues(values.plan as never, true)).toEqual([]);
    expect(isMetaRegenerationInFlight(SITE.id)).toBe(false);
  });

  it("Pixel enregistré depuis l'analyse : le diagnostic recalculé le voit et le plan passe en conversions (et inversement)", async () => {
    const stale: MetaAdsDiagnostic = { ...DONE_DIAGNOSTIC, verdict: "wait", checks: [{ id: "pixel", label: "Pixel", status: "todo", detail: "", critical: true }] };
    const gained = fakeDb({ analysis: doneAnalysis({ diagnostic: stale }), site: SITE_WITH_PIXEL });
    expect((await silenced(() => regenerateMetaAds(gained.db, SITE.id, { now: NOW, env: MOCK_ENV }))).status).toBe("done");
    const after = gained.updates[0]!.values;
    expect((after.diagnostic as MetaAdsDiagnostic).checks.find((c) => c.id === "pixel")?.status).toBe("ok");
    expect((after.plan as { objective: { type: string } }).objective.type).toBe("conversions_site");
    expect(metaPlanIssues(after.plan as never, true)).toEqual([]);
    // Pixel retiré depuis : repli trafic, diagnostic « wait »
    const lost = fakeDb({ analysis: doneAnalysis(), site: SITE });
    expect((await silenced(() => regenerateMetaAds(lost.db, SITE.id, { now: NOW, env: MOCK_ENV }))).status).toBe("done");
    const values = lost.updates[0]!.values;
    expect((values.diagnostic as MetaAdsDiagnostic).verdict).toBe("wait");
    expect((values.plan as { objective: { type: string } }).objective.type).toBe("traffic");
    expect(metaPlanIssues(values.plan as never, false)).toEqual([]);
  });

  it("colonne error : message de veille conservé, recalculé si la veille manque avec un fournisseur, effacé sans fournisseur", async () => {
    const kept = fakeDb({ analysis: doneAnalysis({ provider: "meta", error: META_ERROR_MESSAGES.token }) });
    await silenced(() => regenerateMetaAds(kept.db, SITE.id, { now: NOW, env: MOCK_ENV }));
    expect(kept.updates[0]!.values.error).toBe(META_ERROR_MESSAGES.token);
    const missing = fakeDb({ analysis: doneAnalysis({ provider: "meta", error: META_ERROR_MESSAGES.generation }) });
    await silenced(() => regenerateMetaAds(missing.db, SITE.id, { now: NOW, env: MOCK_ENV }));
    expect(missing.updates[0]!.values.error).toBe(META_ERROR_MESSAGES.marketMissing);
    const none = fakeDb({ analysis: doneAnalysis({ provider: "none", error: META_ERROR_MESSAGES.generation }) });
    await silenced(() => regenerateMetaAds(none.db, SITE.id, { now: NOW, env: MOCK_ENV }));
    expect(none.updates[0]!.values.error).toBeNull();
  });

  it("sans analyse → no_analysis, quota → quota, verrou refusé ou marqueur en cours → busy, deux appels simultanés → un seul aboutit", async () => {
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
    const [first, second] = await silenced(() =>
      Promise.all([
        regenerateMetaAds(fakeDb({ analysis: doneAnalysis() }).db, SITE.id, { now: NOW, env: MOCK_ENV }),
        regenerateMetaAds(fakeDb({ analysis: doneAnalysis() }).db, SITE.id, { now: NOW, env: MOCK_ENV }),
      ]),
    );
    expect([first.status, second.status].sort()).toEqual(["done", "skipped"]);
  });

  it("analyse `running` non périmée → busy sans appel IA ; périmée → la régénération passe", async () => {
    const running = fakeDb({ analysis: doneAnalysis(), running: [{ id: "run", updatedAt: new Date(NOW.getTime() - 60_000) }] });
    expect(await regenerateMetaAds(running.db, SITE.id, { now: NOW, env: MOCK_ENV })).toEqual({ status: "skipped", reason: "busy" });
    expect(running.inserts).toHaveLength(0);
    expect(running.updates).toHaveLength(0);
    const stale = fakeDb({ analysis: doneAnalysis(), running: [{ id: "run", updatedAt: new Date(NOW.getTime() - (META_ADS_ANALYSIS_STALE_MINUTES + 1) * 60_000) }] });
    expect((await silenced(() => regenerateMetaAds(stale.db, SITE.id, { now: NOW, env: MOCK_ENV }))).status).toBe("done");
  });

  it("l'analyse visée n'est plus la dernière `done` du site au moment d'écrire → busy, quota non consommé, rien d'écrit", async () => {
    const replaced = fakeDb({ analysis: doneAnalysis(), latestDone: doneAnalysis({ id: "33333333-3333-4333-8333-333333333333" }) });
    expect(await silenced(() => regenerateMetaAds(replaced.db, SITE.id, { now: NOW, env: MOCK_ENV }))).toEqual({ status: "skipped", reason: "busy" });
    expect(replaced.inserts).toHaveLength(0);
    expect(replaced.updates).toHaveLength(0);
    const gone = fakeDb({ analysis: doneAnalysis(), latestDone: null });
    expect(await silenced(() => regenerateMetaAds(gone.db, SITE.id, { now: NOW, env: MOCK_ENV }))).toEqual({ status: "skipped", reason: "busy" });
    expect(gone.inserts).toHaveLength(0);
    expect(isMetaRegenerationInFlight(SITE.id)).toBe(false);
  });

  it("génération en échec → error avec le message utilisateur, rien d'inscrit", async () => {
    const fake = fakeDb({ analysis: doneAnalysis() });
    await silenced(async () => {
      // Clé présente sans AI_MOCK : le planificateur réel échoue (aucun appel réseau possible)
      const outcome = await regenerateMetaAds(fake.db, SITE.id, { now: NOW, env: { ANTHROPIC_API_KEY: "sk-test" } as NodeJS.ProcessEnv });
      expect(outcome).toEqual({ status: "error", message: META_ERROR_MESSAGES.generation });
      expect(fake.inserts).toHaveLength(0);
      expect(fake.updates).toHaveLength(0);
    });
  });
});
