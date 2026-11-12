import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  EXTERNAL_SITE_CHECK_DETAILS,
  DEFAULT_SOCIAL_VOICE,
  EMPTY_EXTERNAL_FACTS,
  EMPTY_EXTERNAL_PROFILE,
  META_ADS_ANALYSES_PER_MONTH,
  META_ADS_INSTRUCTIONS_MAX,
  META_ADS_REGENERATIONS_PER_MONTH,
  META_LIBRARY_MAX_CALLS,
  META_LIBRARY_TERMS_MAX,
  META_MARKET_MAX_ADS,
  META_MARKET_MEDIA_SPARE,
  META_MARKET_SAMPLE_FOR_AI,
  META_MEDIA_LOOKUPS_PER_MONTH,
  META_MEDIA_LOOKUP_COST_USD,
  META_MEDIA_POSTER_WIDTH,
  buildMetaLocalIndex,
  buildMetaSeed,
  buildSocialBrief,
  externalBriefPages,
  metaCreativeIssues,
  metaPlanIssues,
  metaVideoPlanIssues,
  type MetaAdMedia,
  type MetaAdRecord,
  type MetaAdsCreativeSet,
  type MetaAdsDiagnostic,
  type MetaAdsDiagnosticInput,
  type MetaAdsMarket,
  type MetaAdsPlan,
  type MetaAdsSeed,
  type MetaMarketAd,
  type MetaMarketInsights,
  type PageSections,
  type SiteTheme,
  type SocialSiteBrief,
} from "@theralys/shared";
import { googleUsage, metaAdMedia, metaAdsAnalyses, metaAdsLibrary, type Database, type MetaAdsAnalysis, type Site } from "@theralys/db";
import { createMetaAdsPlanner } from "@theralys/ai";
import { MetaAdLibraryError, MockAdLibraryProvider, type AdLibraryProvider, type AdLibrarySearchInput } from "@theralys/providers/meta";
import { GEO_RETRY_DELAY_MS } from "@theralys/providers/meta/geo";
import type { ExternalReference } from "./external-site";
import type { AdsReferenceLoader } from "./google-ads";
import {
  META_ADS_ANALYSIS_STALE_MINUTES,
  META_ERROR_MESSAGES,
  META_MARKET_FAVORITES_FOR_AI,
  META_MARKET_PAGES_PER_TERM,
  META_USAGE_REFUND_TOLERANCE_MS,
  addressFromSections,
  beginMetaRegeneration,
  buildMetaMarket,
  cleanMetaInstructions,
  collectMarketAds,
  decideMetaStart,
  dropCommercialPages,
  endMetaRegeneration,
  executeMetaAnalysis,
  generateMetaAds,
  hasFreshMetaRunning,
  hasMetaAdsAccess,
  insightsForMarket,
  isMetaAnalysisStale,
  isMetaMarketBlocking,
  isMetaMarketMessage,
  isMetaRegenerationInFlight,
  loadLocalGeography,
  loadMetaAdsContext,
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
import type { MetaMediaStore } from "./meta-library";

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
    { path: "/motifs/gestion-du-stress", title: "Gestion du stress", kind: "motif", slug: "gestion-du-stress" },
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

/** Annonce d'un praticien diffusée dans toute la France (métier dans le nom de page, prise de rendez-vous en ligne : gardée par le filtre de pertinence). */
function nationalRecord(id: string, overrides: Partial<MetaAdRecord> = {}): MetaAdRecord {
  return record(id, { pageName: `Sophrologue ${id}`, captions: ["doctolib.fr"], targetLocations: [{ name: "France", type: "country", excluded: false }], ...overrides });
}

/** Annonce dont la page et le texte signent une boutique (écartée par le filtre de pertinence : commerce). */
function shopRecord(id: string): MetaAdRecord {
  return record(id, {
    pageName: "NutriZen",
    bodies: ["Livraison offerte dès 30 € : nos compléments alimentaires anti-stress, code promo ZEN10."],
    titles: ["-20 % sur toute la boutique"],
    captions: ["nutrizen-shop.fr"],
    targetLocations: [{ name: "France", type: "country", excluded: false }],
  });
}

/** Annonce d'un organisme de formation (écartée par le filtre de pertinence : formation). */
function schoolRecord(id: string): MetaAdRecord {
  return record(id, {
    pageName: "École Française de Sophrologie",
    bodies: ["Devenez sophrologue : formation certifiante éligible au CPF, rentrée en janvier."],
    titles: ["Portes ouvertes"],
    targetLocations: [{ name: "France", type: "country", excluded: false }],
  });
}

/** Visuels d'une annonce tels qu'enregistrés dans `meta_ad_media` (catégories de la page Facebook au choix). */
function mediaOf(pageCategories: string[], overrides: Partial<MetaAdMedia> = {}): MetaAdMedia {
  return {
    version: 1,
    format: "image",
    variants: false,
    items: [{ kind: "image", posterUrl: "https://blob.test/meta-media/poster.jpg", sourceImageUrl: null, sourceVideoUrl: null }],
    avatarUrl: null,
    ctaText: "En savoir plus",
    linkUrl: null,
    pageCategories,
    pageLikes: 120,
    sourceExpiresAt: null,
    fetchedAt: NOW.toISOString(),
    source: "scrapecreators",
    ...overrides,
  };
}

type FetchCall = { url: string; init: RequestInit | undefined };

/** `fetch` simulé : appels enregistrés, réponse (ou erreur) choisie par URL. */
function stubFetch(respond: (url: URL, index: number) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return respond(new URL(String(input)), calls.length - 1);
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

/** Remplace `fetch` global le temps d'un test (les fournisseurs réels le lisent à leur création ou à l'appel). */
async function withGlobalFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

/** Extrait du référentiel des communes pour l'Occitanie (réponse de geo.api.gouv.fr). */
const OCCITANIE_COMMUNES = [
  { nom: "Gaillac", code: "81099", codeDepartement: "81", population: 15_345 },
  { nom: "Albi", code: "81004", codeDepartement: "81", population: 49_714 },
  { nom: "Castres", code: "81065", codeDepartement: "81", population: 42_672 },
  { nom: "Graulhet", code: "81105", codeDepartement: "81", population: 12_890 },
  { nom: "Mazamet", code: "81163", codeDepartement: "81", population: 10_011 },
  { nom: "Cambon", code: "81052", codeDepartement: "81", population: 2_180 },
  { nom: "Toulouse", code: "31555", codeDepartement: "31", population: 504_078 },
  { nom: "Montpellier", code: "34172", codeDepartement: "34", population: 302_454 },
];

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
  it("marketQueryPlan : une page par terme d'abord, puis le budget restant approfondit les premiers termes (8 termes, budget 12 → tous interrogés, 2 pages pour les 4 premiers)", () => {
    const terms = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const plan = marketQueryPlan(terms, 12);
    expect(plan).toEqual([
      { term: "a", maxPages: 2 },
      { term: "b", maxPages: 2 },
      { term: "c", maxPages: 2 },
      { term: "d", maxPages: 2 },
      { term: "e", maxPages: 1 },
      { term: "f", maxPages: 1 },
      { term: "g", maxPages: 1 },
      { term: "h", maxPages: 1 },
    ]);
    expect(plan.reduce((sum, entry) => sum + entry.maxPages, 0)).toBe(12);
    // Défauts : budget META_LIBRARY_MAX_CALLS, META_MARKET_PAGES_PER_TERM pages par terme
    expect(marketQueryPlan(terms)).toEqual(marketQueryPlan(terms, META_LIBRARY_MAX_CALLS, META_MARKET_PAGES_PER_TERM));
    expect(marketQueryPlan(terms)).toHaveLength(Math.min(META_LIBRARY_TERMS_MAX, META_LIBRARY_MAX_CALLS));
    // Un appel de plus n'approfondit qu'un terme de plus, dans l'ordre
    expect(marketQueryPlan(terms, 9).map((entry) => entry.maxPages)).toEqual([2, 1, 1, 1, 1, 1, 1, 1]);
    expect(marketQueryPlan([], 12)).toEqual([]);
    // Les termes d'entrée ne sont pas modifiés
    expect(terms).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });

  it("marketQueryPlan : budget inférieur au nombre de termes → les premiers termes seulement, une page chacun", () => {
    const terms = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(marketQueryPlan(terms, 5)).toEqual([
      { term: "a", maxPages: 1 },
      { term: "b", maxPages: 1 },
      { term: "c", maxPages: 1 },
      { term: "d", maxPages: 1 },
      { term: "e", maxPages: 1 },
    ]);
    expect(marketQueryPlan(terms, 1)).toEqual([{ term: "a", maxPages: 1 }]);
    expect(marketQueryPlan(terms, 8).map((entry) => entry.maxPages)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(marketQueryPlan(terms, 0)).toEqual([]);
    expect(marketQueryPlan(terms, -3)).toEqual([]);
    // Budget fractionnaire : arrondi à l'appel entier inférieur
    expect(marketQueryPlan(terms, 2.9)).toEqual([
      { term: "a", maxPages: 1 },
      { term: "b", maxPages: 1 },
    ]);
  });

  it("marketQueryPlan : plafond pagesPerTerm (le budget en trop n'est pas dépensé), termes au-delà de META_LIBRARY_TERMS_MAX ignorés", () => {
    const three = ["a", "b", "c"];
    // Défaut : 2 pages par terme, 6 appels sur 12
    expect(marketQueryPlan(three, 12).map((entry) => entry.maxPages)).toEqual([2, 2, 2]);
    expect(marketQueryPlan(three, 12, 1).map((entry) => entry.maxPages)).toEqual([1, 1, 1]);
    expect(marketQueryPlan(three, 12, 3).map((entry) => entry.maxPages)).toEqual([3, 3, 3]);
    // Pages ajoutées tour par tour : le budget s'arrête au milieu du troisième tour
    expect(marketQueryPlan(three, 7, 4).map((entry) => entry.maxPages)).toEqual([3, 2, 2]);
    const many = Array.from({ length: META_LIBRARY_TERMS_MAX + 4 }, (_, i) => `terme ${i}`);
    const plan = marketQueryPlan(many, 100);
    expect(plan.map((entry) => entry.term)).toEqual(many.slice(0, META_LIBRARY_TERMS_MAX));
    expect(plan.every((entry) => entry.maxPages === META_MARKET_PAGES_PER_TERM)).toBe(true);
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

  it("collectMarketAds : le plan écarte des termes (budget inférieur au nombre de termes) → truncated, sans erreur ni terme en échec", async () => {
    const paged = (input: AdLibrarySearchInput) => ({ ads: [record(`${input.term}-1`)], calls: input.maxPages ?? 1, truncated: false });
    const short = fakeProvider(paged);
    const dropped = await collectMarketAds(short.provider, { searchTerms: ["a", "b", "c", "d", "e"], country: "FR" }, { budget: 3 });
    expect(short.inputs.map((i) => [i.term, i.maxPages])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 1],
    ]);
    expect(dropped).toMatchObject({ terms: ["a", "b", "c"], calls: 3, truncated: true, error: null, failedTerms: [] });
    expect(dropped.records.map((ad) => ad.id)).toEqual(["a-1", "b-1", "c-1"]);
    // Budget égal au nombre de termes : tous interrogés sur une page, rien d'écarté
    const exact = fakeProvider(paged);
    expect(await collectMarketAds(exact.provider, { searchTerms: ["a", "b", "c"], country: "FR" }, { budget: 3 })).toMatchObject({ terms: ["a", "b", "c"], calls: 3, truncated: false });
    // Appels déjà consommés (progress) : le plan part du budget restant
    const late = fakeProvider(paged);
    const progress = { calls: META_LIBRARY_MAX_CALLS - 2 };
    const rest = await collectMarketAds(late.provider, { searchTerms: ["a", "b", "c"], country: "FR" }, { progress });
    expect(late.inputs.map((i) => i.term)).toEqual(["a", "b"]);
    expect(rest).toMatchObject({ terms: ["a", "b"], calls: META_LIBRARY_MAX_CALLS, truncated: true, error: null });
    expect(progress.calls).toBe(META_LIBRARY_MAX_CALLS);
  });

  it("collectMarketAds : tous les termes sont interrogés avant d'approfondir les premiers (8 termes, 12 appels) ; pagesPerTerm plafonne les pages", async () => {
    const terms = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const paged = (input: AdLibrarySearchInput) => ({ ads: [], calls: input.maxPages ?? 1, truncated: false });
    const full = fakeProvider(paged);
    const all = await collectMarketAds(full.provider, { searchTerms: terms, country: "FR" });
    expect(full.inputs.map((i) => [i.term, i.maxPages])).toEqual([
      ["a", 2],
      ["b", 2],
      ["c", 2],
      ["d", 2],
      ["e", 1],
      ["f", 1],
      ["g", 1],
      ["h", 1],
    ]);
    expect(all).toMatchObject({ terms, calls: META_LIBRARY_MAX_CALLS, truncated: false, error: null });
    const single = fakeProvider(paged);
    const flat = await collectMarketAds(single.provider, { searchTerms: ["a", "b", "c"], country: "FR" }, { pagesPerTerm: 1 });
    expect(single.inputs.map((i) => i.maxPages)).toEqual([1, 1, 1]);
    expect(flat).toMatchObject({ calls: 3, truncated: false });
    const deep = fakeProvider(paged);
    await collectMarketAds(deep.provider, { searchTerms: ["a", "b", "c"], country: "FR" }, { pagesPerTerm: 3 });
    expect(deep.inputs.map((i) => i.maxPages)).toEqual([3, 3, 3]);
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

  it("buildMetaMarket et marketSampleForAi : annonces classées, comptes et signaux forts par zone, échantillon des mieux notées (zone retenue pour moitié, puis zones plus larges)", () => {
    const records = Array.from({ length: 40 }, (_, i) => record(`ad-${i}`, { euTotalReach: 100 * (i + 1), targetLocations: [{ name: i % 2 ? "Albi" : "France", type: null, excluded: false }] }));
    const market = buildMetaMarket({ records, matchedTerms: { "ad-3": ["sophrologue"] }, terms: ["sophrologue"], calls: 2, truncated: true }, SEED, "meta", NOW);
    expect(market).toMatchObject({ version: 1, source: "meta", fetchedAt: NOW.toISOString(), country: "FR", terms: ["sophrologue"], calls: 2, truncated: true, insights: null });
    expect(market.scopeUsed).toBe("ville");
    expect(market.counts.ville).toBe(20);
    expect(market.strongCounts).toEqual({ ville: market.ads.filter((a) => a.signal === "fort" && a.scope === "ville").length, departement: 0, region: 0, france: records.filter((_r, i) => i % 2 === 0 && 100 * (i + 1) >= 10_000).length });
    expect(market.ads.find((a) => a.id === "ad-3")?.matchedTerms).toEqual(["sophrologue"]);
    const sample = marketSampleForAi(market, 5);
    expect(sample.ads).toHaveLength(5);
    // Moitié de l'échantillon (arrondie au supérieur) : les mieux notées de la zone retenue ; le reste : les mieux notées des zones plus larges
    const best = (scope: MetaMarketAd["scope"], count: number) =>
      market.ads
        .filter((a) => a.scope === scope)
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .map((a) => a.id);
    expect(sample.ads.map((a) => a.scope)).toEqual(["ville", "ville", "ville", "france", "france"]);
    expect(sample.ads.map((a) => a.id)).toEqual([...best("ville", 3), ...best("france", 2)]);
    const scores = sample.ads.map((a) => a.score);
    expect(scores.slice(0, 3)).toEqual([...scores.slice(0, 3)].sort((a, b) => b - a));
    expect(scores.slice(3)).toEqual([...scores.slice(3)].sort((a, b) => b - a));
    expect(marketSampleForAi(market).ads.length).toBeLessThanOrEqual(META_MARKET_SAMPLE_FOR_AI);
  });

  it("buildMetaMarket : métier de la graine → filtre de pertinence (commerce, formation et hors sujet écartés d'office, comptés dans filtered)", () => {
    const foreign = record("40001", { pageName: "Sophrology Studio", bodies: ["Book your session today."], titles: ["Sophrology in Albi"], languages: ["en"] });
    const records = [record("10001"), shopRecord("20001"), record("10002"), schoolRecord("30001"), foreign];
    const collection = { records, matchedTerms: {}, terms: ["sophrologue"], calls: 1, truncated: false };
    const market = buildMetaMarket(collection, SEED, "meta", NOW);
    expect(market.ads.map((a) => a.id).sort()).toEqual(["10001", "10002"]);
    expect(market.filtered).toEqual({ formation: 1, commerce: 1, autre: 1 });
    // Les annonces écartées ne comptent dans aucune zone et ne prennent pas de rang
    expect(market.counts).toEqual({ ville: 2, departement: 0, region: 0, france: 0 });
    expect(market.ads.map((a) => a.rankTotal)).toEqual([2, 2]);
    expect(market).not.toHaveProperty("dismissed");
    // Rien à écarter : le décompte existe quand même (le filtre a tourné)
    expect(buildMetaMarket({ ...collection, records: [record("10001")] }, SEED, "meta", NOW).filtered).toEqual({ formation: 0, commerce: 0, autre: 0 });
    // Graine sans métier (veille antérieure au filtre) : aucun filtre, pas de décompte
    const { profession: _profession, ...zone } = SEED;
    const unfiltered = buildMetaMarket(collection, zone, "meta", NOW);
    expect(unfiltered.ads.map((a) => a.id).sort()).toEqual(["10001", "10002", "20001", "30001", "40001"]);
    expect(unfiltered).not.toHaveProperty("filtered");
  });

  it("buildMetaMarket : excludedIds retire les annonces supprimées par le praticien et les compte dans dismissed", () => {
    const records = [record("10001"), record("10002"), record("10003"), shopRecord("20001")];
    const collection = { records, matchedTerms: {}, terms: ["sophrologue"], calls: 1, truncated: false };
    const market = buildMetaMarket(collection, SEED, "meta", NOW, { excludedIds: new Set(["10002", "99999"]) });
    expect(market.ads.map((a) => a.id).sort()).toEqual(["10001", "10003"]);
    // « 99999 » n'a pas été remontée : seule l'annonce réellement retirée est comptée
    expect(market.dismissed).toBe(1);
    expect(market.counts.ville).toBe(2);
    expect(market.filtered).toEqual({ formation: 0, commerce: 1, autre: 0 });
    // Une annonce déjà écartée par le filtre de pertinence n'est pas comptée deux fois
    const alreadyFiltered = buildMetaMarket(collection, SEED, "meta", NOW, { excludedIds: new Set(["20001"]) });
    expect(alreadyFiltered).not.toHaveProperty("dismissed");
    expect(alreadyFiltered.ads).toHaveLength(3);
    // Sans annonce supprimée : pas de champ
    expect(buildMetaMarket(collection, SEED, "meta", NOW, { excludedIds: new Set() })).not.toHaveProperty("dismissed");
    expect(buildMetaMarket(collection, SEED, "meta", NOW)).not.toHaveProperty("dismissed");
  });

  it("buildMetaMarket : max borne les annonces conservées (défaut META_MARKET_MAX_ADS), les comptes portent sur toutes les annonces repérées", () => {
    const records = Array.from({ length: META_MARKET_MAX_ADS + 10 }, (_, i) => record(String(50_000 + i), { pageName: `Cabinet ${i}`, euTotalReach: 1_000 + i }));
    const collection = { records, matchedTerms: {}, terms: ["sophrologue"], calls: 1, truncated: false };
    const byDefault = buildMetaMarket(collection, SEED, "meta", NOW);
    expect(byDefault.ads).toHaveLength(META_MARKET_MAX_ADS);
    expect(byDefault.counts.ville).toBe(records.length);
    const four = buildMetaMarket(collection, SEED, "meta", NOW, { max: 4 });
    expect(four.ads).toHaveLength(4);
    expect(four.ads.map((a) => a.id)).toEqual(byDefault.ads.slice(0, 4).map((a) => a.id));
    expect(four.counts.ville).toBe(records.length);
    const wide = buildMetaMarket(collection, SEED, "meta", NOW, { max: META_MARKET_MAX_ADS + META_MARKET_MEDIA_SPARE });
    expect(wide.ads).toHaveLength(META_MARKET_MAX_ADS + META_MARKET_MEDIA_SPARE);
    expect(wide.ads.slice(0, META_MARKET_MAX_ADS).map((a) => a.id)).toEqual(byDefault.ads.map((a) => a.id));
  });

  it("buildMetaMarket : localIndex situe une ville ciblée sans département (commune du département du praticien)", () => {
    const gaillac = record("60001", { targetLocations: [{ name: "Gaillac", type: "city", excluded: false }] });
    const toulouse = record("60002", { targetLocations: [{ name: "Toulouse", type: "city", excluded: false }] });
    const collection = { records: [gaillac, toulouse], matchedTerms: {}, terms: ["sophrologue"], calls: 1, truncated: false };
    const scopes = (market: MetaAdsMarket) => Object.fromEntries(market.ads.map((a) => [a.id, a.scope]));
    expect(scopes(buildMetaMarket(collection, SEED, "meta", NOW))).toEqual({ "60001": "france", "60002": "france" });
    const localIndex = buildMetaLocalIndex(
      [
        { name: "Gaillac", departmentCode: "81" },
        { name: "Toulouse", departmentCode: "31" },
      ],
      SEED,
    );
    const located = buildMetaMarket(collection, SEED, "meta", NOW, { localIndex });
    expect(scopes(located)).toEqual({ "60001": "departement", "60002": "region" });
    expect(located.counts).toEqual({ ville: 0, departement: 1, region: 1, france: 0 });
    expect(scopes(buildMetaMarket(collection, SEED, "meta", NOW, { localIndex: null }))).toEqual({ "60001": "france", "60002": "france" });
  });

  it("dropCommercialPages : page classée « Shopping & retail » écartée — retirée des comptes par zone, comptée dans filtered.commerce —, catégories de praticiens gardées", () => {
    // 70001 et 70002 : signal fort (plus de 30 jours de diffusion, portée ≥ 10 000) ; les autres : signal moyen
    const reach = [30_000, 20_000, 9_000, 8_900, 8_800, 8_700];
    const records = ["70001", "70002", "70003", "70004", "70005", "70006"].map((id, i) => record(id, { pageName: `Cabinet ${i}`, euTotalReach: reach[i]! }));
    const market = buildMetaMarket({ records: [...records, shopRecord("20001")], matchedTerms: {}, terms: ["sophrologue"], calls: 1, truncated: false }, SEED, "meta", NOW);
    expect(market.ads.map((a) => a.id)).toEqual(["70001", "70002", "70003", "70004", "70005", "70006"]);
    expect(market.filtered).toEqual({ formation: 0, commerce: 1, autre: 0 });
    expect(market.counts).toEqual({ ville: 6, departement: 0, region: 0, france: 0 });
    expect(market.strongCounts).toEqual({ ville: 2, departement: 0, region: 0, france: 0 });
    const mediaByAdId: Record<string, MetaAdMedia> = {
      "70001": mediaOf(["Osteopathic Doctor"]),
      "70002": mediaOf(["Shopping & retail"]),
      "70003": mediaOf(["Alternative & Holistic Health Service", "Product/service"]),
      "70004": mediaOf(["Health/beauty", "E-commerce website"]),
      "70005": mediaOf([]),
      // 70006 : visuels non obtenus
    };
    const out = dropCommercialPages(market, mediaByAdId);
    expect(out.ads.map((a) => a.id)).toEqual(["70001", "70003", "70005", "70006"]);
    // Ajoutées au décompte du filtre de pertinence
    expect(out.filtered).toEqual({ formation: 0, commerce: 3, autre: 0 });
    // Retirées des comptes par zone : une annonce n'est jamais à la fois « repérée » et « écartée » ; le signal fort de 70002 part avec elle
    expect(out.counts).toEqual({ ville: 4, departement: 0, region: 0, france: 0 });
    expect(out.strongCounts).toEqual({ ville: 1, departement: 0, region: 0, france: 0 });
    // La veille d'entrée n'est pas modifiée
    expect(market.filtered).toEqual({ formation: 0, commerce: 1, autre: 0 });
    expect(market.counts).toEqual({ ville: 6, departement: 0, region: 0, france: 0 });
    expect(market.strongCounts).toEqual({ ville: 2, departement: 0, region: 0, france: 0 });
    expect(market.ads).toHaveLength(6);
    // Veille enregistrée avant strongCounts : le champ reste absent, les comptes sont ajustés ; un compte ne devient jamais négatif
    const { strongCounts: _strong, ...legacy } = market;
    const legacyOut = dropCommercialPages(legacy, mediaByAdId);
    expect(legacyOut).not.toHaveProperty("strongCounts");
    expect(legacyOut.counts.ville).toBe(4);
    expect(dropCommercialPages({ ...market, counts: { ville: 1, departement: 0, region: 0, france: 0 } }, mediaByAdId).counts.ville).toBe(0);
    expect(out).toMatchObject({ source: market.source, terms: market.terms, scopeUsed: market.scopeUsed, calls: market.calls, truncated: market.truncated, insights: null });
    // Aucune page commerciale : annonces et décompte inchangés
    const untouched = dropCommercialPages(market, { "70001": mediaOf(["Osteopathic Doctor"]) });
    expect(untouched.ads).toEqual(market.ads);
    expect(untouched.filtered).toEqual(market.filtered);
    expect(untouched.counts).toEqual(market.counts);
    expect(untouched.strongCounts).toEqual(market.strongCounts);
    expect(dropCommercialPages(market, {}).ads).toEqual(market.ads);
  });

  it("dropCommercialPages : le classement se resserre (rank, rankTotal) et la zone retenue est recalculée sur les comptes restants", () => {
    // Neuf annonces dans la ville du praticien : zone retenue « ville » (au moins huit annonces locales)
    const records = Array.from({ length: 9 }, (_, i) => record(String(90_001 + i), { pageName: `Cabinet ${i}`, euTotalReach: 9_000 - i * 100 }));
    const market = buildMetaMarket({ records, matchedTerms: {}, terms: ["sophrologue"], calls: 1, truncated: false }, SEED, "meta", NOW);
    expect(market.scopeUsed).toBe("ville");
    const byRank = [...market.ads].sort((a, b) => a.rank! - b.rank!);
    expect(byRank.map((a) => a.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const brand = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, mediaOf(["Brand"])]));
    // Une page commerciale en tête : huit annonces locales restent, la zone tient ; chacune remonte d'un rang
    const one = dropCommercialPages(market, brand(byRank[0]!.id));
    expect(one.scopeUsed).toBe("ville");
    expect([...one.ads].sort((a, b) => a.rank! - b.rank!).map((a) => [a.id, a.rank, a.rankTotal])).toEqual(byRank.slice(1).map((a, i) => [a.id, i + 1, 8]));
    // Deux pages commerciales (2e et 5e) : sept annonces locales, plus assez pour la zone « ville » — la veille est élargie
    const dropped = [byRank[1]!.id, byRank[4]!.id];
    const two = dropCommercialPages(market, brand(...dropped));
    expect(two.scopeUsed).toBe("france");
    expect(two.counts).toEqual({ ville: 7, departement: 0, region: 0, france: 0 });
    const left = [...two.ads].sort((a, b) => a.rank! - b.rank!);
    expect(left.map((a) => a.id)).toEqual(byRank.filter((a) => !dropped.includes(a.id)).map((a) => a.id));
    expect(left.map((a) => a.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(left.every((a) => a.rankTotal === 7)).toBe(true);
    // Seuil explicite ; la veille d'entrée n'est pas modifiée
    expect(dropCommercialPages(market, brand(...dropped), META_MARKET_MAX_ADS, 7).scopeUsed).toBe("ville");
    expect(market.ads.map((a) => a.rankTotal)).toEqual(Array.from({ length: 9 }, () => 9));
    expect(market.scopeUsed).toBe("ville");
    // Veille enregistrée avant le classement : pas de rang inventé
    const unranked = { ...market, ads: market.ads.map(({ rank: _rank, rankTotal: _total, ...ad }) => ad) };
    expect(dropCommercialPages(unranked, brand(byRank[0]!.id)).ads.every((a) => a.rank === undefined && a.rankTotal === undefined)).toBe(true);
  });

  it("dropCommercialPages : veille ramenée à max (défaut META_MARKET_MAX_ADS), les annonces de réserve remplacent les pages commerciales", () => {
    const records = Array.from({ length: META_MARKET_MAX_ADS + META_MARKET_MEDIA_SPARE }, (_, i) => record(String(80_000 + i), { pageName: `Cabinet ${i}`, euTotalReach: 9_000 - i }));
    const market = buildMetaMarket({ records, matchedTerms: {}, terms: ["sophrologue"], calls: 1, truncated: false }, SEED, "meta", NOW, { max: META_MARKET_MAX_ADS + META_MARKET_MEDIA_SPARE });
    const ids = market.ads.map((a) => a.id);
    expect(ids).toHaveLength(META_MARKET_MAX_ADS + META_MARKET_MEDIA_SPARE);
    // Sans page commerciale : la réserve est simplement retirée
    expect(dropCommercialPages(market, {}).ads.map((a) => a.id)).toEqual(ids.slice(0, META_MARKET_MAX_ADS));
    // Deux pages commerciales en tête : les deux premières annonces de réserve prennent leur place
    const commercial = { [ids[0]!]: mediaOf(["Brand"]), [ids[2]!]: mediaOf(["Shopping & Retail"]) };
    const replaced = dropCommercialPages(market, commercial);
    expect(replaced.ads).toHaveLength(META_MARKET_MAX_ADS);
    expect(replaced.ads.map((a) => a.id)).toEqual(ids.filter((id) => id !== ids[0] && id !== ids[2]).slice(0, META_MARKET_MAX_ADS));
    expect(replaced.filtered).toEqual({ formation: 0, commerce: 2, autre: 0 });
    // max explicite
    expect(dropCommercialPages(market, commercial, 3).ads.map((a) => a.id)).toEqual([ids[1], ids[3], ids[4]]);
    // Les annonces écartées hors de la limite sont comptées elles aussi
    const beyond = dropCommercialPages(market, { [ids.at(-1)!]: mediaOf(["School"]) });
    expect(beyond.filtered).toEqual({ formation: 0, commerce: 1, autre: 0 });
    expect(beyond.counts.ville).toBe(market.counts.ville - 1);
    expect(replaced.counts.ville).toBe(market.counts.ville - 2);
  });

  it("dropCommercialPages : veille sans filtered (antérieure au filtre) → champ absent tant que rien n'est écarté, créé sinon", () => {
    const { profession: _profession, ...zone } = SEED;
    const market = buildMetaMarket({ records: [record("90001"), record("90002", { pageName: "Cabinet B" })], matchedTerms: {}, terms: ["sophrologue"], calls: 1, truncated: false }, zone, "meta", NOW);
    expect(market).not.toHaveProperty("filtered");
    const kept = dropCommercialPages(market, { "90001": mediaOf(["Osteopathic Doctor"]) });
    expect(kept).not.toHaveProperty("filtered");
    expect(kept.ads).toHaveLength(2);
    const dropped = dropCommercialPages(market, { "90001": mediaOf(["Shopping & retail"]) });
    expect(dropped.ads.map((a) => a.id)).toEqual(["90002"]);
    expect(dropped.filtered).toEqual({ formation: 0, commerce: 1, autre: 0 });
    expect(market).not.toHaveProperty("filtered");
  });

  it("marketSampleForAi : exemples gardés d'abord, puis la moitié de l'échantillon dans la zone retenue, puis les zones plus larges, puis le reste de la zone retenue", () => {
    // 10 annonces autour d'Albi (v0 la mieux notée … v9), 3 nationales (f0 … f2)
    const local = Array.from({ length: 10 }, (_, i) => record(`v${i}`, { pageName: `Cabinet V${i}`, euTotalReach: 9_000 - i * 500 }));
    const national = Array.from({ length: 3 }, (_, i) => nationalRecord(`f${i}`, { pageName: `Sophrologue F${i}`, euTotalReach: 20_000 - i * 500 }));
    const market = buildMetaMarket({ records: [...national, ...local], matchedTerms: {}, terms: ["sophrologue"], calls: 1, truncated: false }, SEED, "meta", NOW);
    expect(market.scopeUsed).toBe("ville");
    const ids = (sample: MetaAdsMarket) => sample.ads.map((a) => a.id);
    // Sans exemple gardé : 4 de la zone retenue (moitié de 8), les 3 nationales, puis la suite de la zone retenue
    expect(ids(marketSampleForAi(market, 8))).toEqual(["v0", "v1", "v2", "v3", "f0", "f1", "f2", "v4"]);
    // Échantillon impair : moitié arrondie au supérieur
    expect(ids(marketSampleForAi(market, 5))).toEqual(["v0", "v1", "v2", "f0", "f1"]);
    // Exemples gardés en tête, dans leur ordre, même absents de la veille courante
    const outside = { ...market.ads.find((a) => a.id === "v9")!, id: "ancien", pageName: "Cabinet d'une veille passée" };
    const v7 = market.ads.find((a) => a.id === "v7")!;
    expect(ids(marketSampleForAi(market, 8, [outside, v7]))).toEqual(["ancien", "v7", "v0", "v1", "v2", "v3", "f0", "f1"]);
    // Dédoublonnage : un exemple gardé déjà dans la moitié de tête n'est transmis qu'une fois
    const v1 = market.ads.find((a) => a.id === "v1")!;
    const deduped = marketSampleForAi(market, 8, [v1, outside, v1]);
    expect(ids(deduped)).toEqual(["v1", "ancien", "v0", "v2", "v3", "f0", "f1", "f2"]);
    expect(new Set(ids(deduped)).size).toBe(deduped.ads.length);
    // Tout le reste de la veille est repris tel quel, la veille d'entrée n'est pas modifiée
    expect(deduped).toMatchObject({ scopeUsed: market.scopeUsed, counts: market.counts, terms: market.terms, calls: market.calls });
    expect(market.ads).toHaveLength(13);
    expect(marketSampleForAi(market, META_MARKET_SAMPLE_FOR_AI, [outside]).ads).toHaveLength(14);
  });

  it("marketSampleForAi : au plus META_MARKET_FAVORITES_FOR_AI exemples gardés (les premiers reçus), la veille du moment reste majoritaire", () => {
    const records = Array.from({ length: 40 }, (_, i) => record(`v${i}`, { pageName: `Cabinet V${i}` }));
    const market = buildMetaMarket({ records, matchedTerms: {}, terms: ["sophrologue"], calls: 1, truncated: false }, SEED, "meta", NOW);
    const favorites = Array.from({ length: META_MARKET_FAVORITES_FOR_AI + 5 }, (_, i): MetaMarketAd => ({ ...market.ads[0]!, id: `g${i}`, pageName: `Cabinet gardé ${i}` }));
    const sample = marketSampleForAi(market, META_MARKET_SAMPLE_FOR_AI, favorites);
    const ids = sample.ads.map((a) => a.id);
    expect(ids).toHaveLength(META_MARKET_SAMPLE_FOR_AI);
    expect(ids.slice(0, META_MARKET_FAVORITES_FOR_AI)).toEqual(favorites.slice(0, META_MARKET_FAVORITES_FOR_AI).map((a) => a.id));
    expect(ids.filter((id) => id.startsWith("g"))).toHaveLength(META_MARKET_FAVORITES_FOR_AI);
    const fromMarket = ids.filter((id) => id.startsWith("v"));
    expect(fromMarket).toHaveLength(META_MARKET_SAMPLE_FOR_AI - META_MARKET_FAVORITES_FOR_AI);
    expect(fromMarket.length).toBeGreaterThan(META_MARKET_SAMPLE_FOR_AI / 2);
    // Moins d'exemples que le plafond : tous transmis
    expect(marketSampleForAi(market, META_MARKET_SAMPLE_FOR_AI, favorites.slice(0, 2)).ads.slice(0, 3).map((a) => a.id)).toEqual(["g0", "g1", fromMarket[0]]);
    expect(META_MARKET_FAVORITES_FOR_AI).toBeLessThan(META_MARKET_SAMPLE_FOR_AI / 2);
  });

  it("insightsForMarket : les annonces citées en référence sont celles de la veille enregistrée (exemple gardé absent de la veille retiré)", () => {
    const market = buildMetaMarket({ records: [record("10001"), record("10002"), record("10003")], matchedTerms: {}, terms: ["sophrologue"], calls: 1, truncated: false }, SEED, "meta", NOW);
    const insights: MetaMarketInsights = {
      summary: "Trois cabinets annoncent autour d'Albi.",
      angles: [
        { label: "Réassurance", description: "Première séance expliquée.", adIds: ["10001", "555000111", "10003"] },
        { label: "Ancrage local", description: "Le quartier est cité.", adIds: ["555000111"] },
        { label: "Saisonnier", description: "Rentrée.", adIds: [] },
      ],
      hooks: ["Et si vous souffliez ?"],
      offers: ["Séance découverte"],
      formats: "Images surtout",
      seasonality: "Rentrée",
      gaps: ["Personne ne parle du sommeil"],
      warnings: [],
    };
    const snapshot = structuredClone(insights);
    const out = insightsForMarket(insights, market);
    expect(out.angles).toEqual([
      { label: "Réassurance", description: "Première séance expliquée.", adIds: ["10001", "10003"] },
      // Un angle garde son libellé et sa description même sans annonce de la veille pour l'illustrer
      { label: "Ancrage local", description: "Le quartier est cité.", adIds: [] },
      { label: "Saisonnier", description: "Rentrée.", adIds: [] },
    ]);
    const { angles: _angles, ...rest } = out;
    const { angles: _before, ...restBefore } = snapshot;
    expect(rest).toEqual(restBefore);
    // La synthèse d'entrée n'est pas modifiée
    expect(insights).toEqual(snapshot);
    expect(insightsForMarket(insights, { ads: [] }).angles.every((angle) => angle.adIds.length === 0)).toBe(true);
  });

  it("marketSampleForAi : la zone retenue comprend les zones plus étroites (département retenu → ville et département confondus, par note)", () => {
    const city = Array.from({ length: 2 }, (_, i) => record(`v${i}`, { pageName: `Cabinet V${i}`, euTotalReach: 2_000 - i * 100 }));
    const department = Array.from({ length: 7 }, (_, i) => record(`d${i}`, { pageName: `Cabinet D${i}`, euTotalReach: 8_000 - i * 100, targetLocations: [{ name: "Tarn", type: "region", excluded: false }] }));
    const national = Array.from({ length: 2 }, (_, i) => nationalRecord(`f${i}`, { pageName: `Sophrologue F${i}`, euTotalReach: 500 - i * 100 }));
    const market = buildMetaMarket({ records: [...city, ...department, ...national], matchedTerms: {}, terms: ["sophrologue"], calls: 1, truncated: false }, SEED, "meta", NOW);
    expect(market.scopeUsed).toBe("departement");
    expect(marketSampleForAi(market, 6).ads.map((a) => a.id)).toEqual(["d0", "d1", "d2", "f0", "f1", "d3"]);
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
    for (const c of result.creatives!.creatives) expect(paths).toContain(c.landingPath);
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
    expect(metaCreativeIssues(result.creatives!, ["/", "/motifs/gestion-du-stress"])).toEqual([]);
    // Chemins exacts des pages actuelles : jamais l'ancien « /<slug> », qui mène à la page introuvable du site public
    for (const c of result.creatives!.creatives) expect(["/", "/motifs/gestion-du-stress"]).toContain(c.landingPath);
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

describe("executeMetaAnalysis : visuels, annonces supprimées, exemples gardés", () => {
  /** Veille réelle simulée : `count` annonces de pages distinctes autour d'Albi, remontées par le premier terme. */
  function wideProvider(count: number) {
    const records = Array.from({ length: count }, (_, i) => record(String(100_000 + i), { pageName: `Cabinet ${i}`, euTotalReach: 1_000 + i }));
    return fakeProvider((_input, index) => ({ ads: index === 0 ? records : [], calls: 1, truncated: false }));
  }
  const planner = () => createMetaAdsPlanner(MOCK_ENV);

  it("enrichMedia reçoit META_MARKET_MAX_ADS + META_MARKET_MEDIA_SPARE annonces au plus ; les pages commerciales sont remplacées par la réserve, la veille revient à META_MARKET_MAX_ADS", async () => {
    const { provider } = wideProvider(META_MARKET_MAX_ADS + META_MARKET_MEDIA_SPARE + 14);
    const requested: string[][] = [];
    const enrichMedia = async (ads: MetaMarketAd[]) => {
      requested.push(ads.map((ad) => ad.id));
      // Les quatre premières annonces viennent d'une boutique, les autres de praticiens
      return Object.fromEntries(ads.map((ad, i) => [ad.id, mediaOf(i < 4 ? ["Shopping & retail"] : ["Alternative & Holistic Health Service"])]));
    };
    const result = await executeMetaAnalysis(CONTEXT, { provider, planner: planner(), now: NOW, enrichMedia });
    expect(requested).toHaveLength(1);
    expect(requested[0]).toHaveLength(META_MARKET_MAX_ADS + META_MARKET_MEDIA_SPARE);
    expect(new Set(requested[0]).size).toBe(requested[0]!.length);
    const market = result.market!;
    expect(market.ads).toHaveLength(META_MARKET_MAX_ADS);
    expect(market.ads.map((a) => a.id)).toEqual(requested[0]!.slice(4, 4 + META_MARKET_MAX_ADS));
    expect(market.filtered).toEqual({ formation: 0, commerce: 4, autre: 0 });
    expect(market.insights).not.toBeNull();
    expect(result.marketError).toBeNull();
    // Sans enrichMedia : pas de réserve, la même sélection bornée à META_MARKET_MAX_ADS
    const plain = await executeMetaAnalysis(CONTEXT, { provider: wideProvider(META_MARKET_MAX_ADS + META_MARKET_MEDIA_SPARE + 14).provider, planner: planner(), now: NOW });
    expect(plain.market!.ads.map((a) => a.id)).toEqual(requested[0]!.slice(0, META_MARKET_MAX_ADS));
    expect(plain.market!.filtered).toEqual({ formation: 0, commerce: 0, autre: 0 });
  });

  it("veille plus petite que la limite : enrichMedia reçoit toutes les annonces retenues, rien n'est retiré", async () => {
    const { provider } = wideProvider(12);
    const requested: string[][] = [];
    const result = await executeMetaAnalysis(CONTEXT, {
      provider,
      planner: planner(),
      now: NOW,
      enrichMedia: async (ads) => {
        requested.push(ads.map((ad) => ad.id));
        return {};
      },
    });
    expect(requested).toHaveLength(1);
    expect(requested[0]).toHaveLength(12);
    expect(result.market!.ads.map((a) => a.id)).toEqual(requested[0]);
    expect(result.market!.filtered).toEqual({ formation: 0, commerce: 0, autre: 0 });
  });

  it("enrichMedia qui lève : la veille reste intacte (ramenée à META_MARKET_MAX_ADS), sans message d'erreur ; synthèse, diagnostic et générations maintenus", async () => {
    const reference = await executeMetaAnalysis(CONTEXT, { provider: wideProvider(80).provider, planner: planner(), now: NOW });
    let beats = 0;
    await silenced(async () => {
      const result = await executeMetaAnalysis(CONTEXT, {
        provider: wideProvider(80).provider,
        planner: planner(),
        now: NOW,
        heartbeat: async () => {
          beats++;
        },
        enrichMedia: async () => Promise.reject(new Error("connexion à la base perdue")),
      });
      expect(result.market).not.toBeNull();
      expect(result.market!.ads).toHaveLength(META_MARKET_MAX_ADS);
      expect(result.market!.ads.map((a) => a.id)).toEqual(reference.market!.ads.map((a) => a.id));
      expect(result.market!.counts).toEqual(reference.market!.counts);
      expect(result.market!.filtered).toEqual({ formation: 0, commerce: 0, autre: 0 });
      expect(result.market!.insights).not.toBeNull();
      expect(result.marketError).toBeNull();
      expect(result.generationError).toBeNull();
      expect(result.providerMode).toBe("meta");
      expect(result.creatives).not.toBeNull();
      expect(result.plan).not.toBeNull();
      expect(beats).toBe(3);
    });
  });

  it("annonces supprimées par le praticien (dismissedAdIds) : absentes de la veille et des visuels demandés, comptées dans dismissed", async () => {
    const ctx: MetaAdsContextData = { ...CONTEXT, dismissedAdIds: ["100003", "100007", "424242"] };
    const requested: string[] = [];
    const result = await executeMetaAnalysis(ctx, {
      provider: wideProvider(12).provider,
      planner: planner(),
      now: NOW,
      enrichMedia: async (ads) => {
        requested.push(...ads.map((ad) => ad.id));
        return {};
      },
    });
    const ids = result.market!.ads.map((a) => a.id);
    expect(ids).toHaveLength(10);
    expect(ids).not.toContain("100003");
    expect(ids).not.toContain("100007");
    expect(requested.sort()).toEqual([...ids].sort());
    expect(result.market!.dismissed).toBe(2);
    // Sans enrichMedia : même exclusion
    const plain = await executeMetaAnalysis(ctx, { provider: wideProvider(12).provider, planner: planner(), now: NOW });
    expect(plain.market!.ads.map((a) => a.id)).toEqual(ids);
    expect(plain.market!.dismissed).toBe(2);
    // Aucune annonce supprimée : pas de champ
    const none = await executeMetaAnalysis({ ...CONTEXT, dismissedAdIds: [] }, { provider: wideProvider(12).provider, planner: planner(), now: NOW });
    expect(none.market).not.toHaveProperty("dismissed");
    expect(none.market!.ads).toHaveLength(12);
  });

  it("exemples gardés (favorites) : transmis en tête de l'échantillon de la synthèse, sans entrer dans la veille enregistrée", async () => {
    const base = planner();
    const samples: MetaAdsMarket[] = [];
    const spy = {
      ...base,
      analyzeMarket: async (...args: Parameters<typeof base.analyzeMarket>) => {
        samples.push(args[1]);
        return base.analyzeMarket(...args);
      },
    };
    const favorite: MetaMarketAd = { ...record("555000111"), pageName: "Cabinet gardé", scope: "ville", active: true, runningDays: 40, signal: "moyen", score: 5, matchedTerms: [] };
    const result = await executeMetaAnalysis({ ...CONTEXT, favorites: [favorite] }, { provider: wideProvider(50).provider, planner: spy, now: NOW });
    expect(samples).toHaveLength(1);
    const sample = samples[0]!;
    expect(sample.ads[0]!.id).toBe("555000111");
    expect(sample.ads).toHaveLength(META_MARKET_SAMPLE_FOR_AI);
    expect(new Set(sample.ads.map((a) => a.id)).size).toBe(sample.ads.length);
    // La veille enregistrée ne contient que les annonces repérées
    expect(result.market!.ads).toHaveLength(50);
    expect(result.market!.ads.some((a) => a.id === "555000111")).toBe(false);
    // Sans exemple gardé : l'échantillon ne contient que des annonces de la veille
    samples.length = 0;
    const plain = await executeMetaAnalysis(CONTEXT, { provider: wideProvider(50).provider, planner: spy, now: NOW });
    const known = new Set(plain.market!.ads.map((a) => a.id));
    expect(samples[0]!.ads.every((a) => known.has(a.id))).toBe(true);
  });

  it("synthèse enregistrée : une annonce citée qui n'est pas dans la veille (exemple gardé, identifiant inventé) est retirée des références", async () => {
    const base = planner();
    const favorite: MetaMarketAd = { ...record("555000111"), pageName: "Cabinet gardé", scope: "ville", active: true, runningDays: 40, signal: "moyen", score: 5, matchedTerms: [] };
    let cited: string[] = [];
    const citing = {
      ...base,
      analyzeMarket: async (...args: Parameters<typeof base.analyzeMarket>) => {
        const insights = await base.analyzeMarket(...args);
        // L'IA cite l'exemple gardé (en tête de l'échantillon), une annonce de la veille et un identifiant qui n'existe pas
        cited = [args[1].ads[0]!.id, args[1].ads[1]!.id, "000000"];
        return { ...insights, angles: [{ label: "Angle cité", description: "Illustré par trois annonces.", adIds: cited }, ...insights.angles] };
      },
    };
    const result = await executeMetaAnalysis({ ...CONTEXT, favorites: [favorite] }, { provider: wideProvider(20).provider, planner: citing, now: NOW });
    expect(cited[0]).toBe("555000111");
    const market = result.market!;
    const known = new Set(market.ads.map((a) => a.id));
    expect(known.has(cited[1]!)).toBe(true);
    expect(market.insights!.angles[0]).toEqual({ label: "Angle cité", description: "Illustré par trois annonces.", adIds: [cited[1]] });
    expect(market.insights!.angles.flatMap((angle) => angle.adIds).every((id) => known.has(id))).toBe(true);
    // Les exemples gardés au-delà du plafond ne sont pas transmis
    const many = Array.from({ length: META_MARKET_FAVORITES_FOR_AI + 3 }, (_, i): MetaMarketAd => ({ ...favorite, id: String(555_000_200 + i) }));
    const samples: MetaAdsMarket[] = [];
    const spy = {
      ...base,
      analyzeMarket: async (...args: Parameters<typeof base.analyzeMarket>) => {
        samples.push(args[1]);
        return base.analyzeMarket(...args);
      },
    };
    await executeMetaAnalysis({ ...CONTEXT, favorites: many }, { provider: wideProvider(40).provider, planner: spy, now: NOW });
    expect(samples[0]!.ads.filter((a) => a.id.startsWith("555000")).map((a) => a.id)).toEqual(many.slice(0, META_MARKET_FAVORITES_FOR_AI).map((a) => a.id));
    expect(samples[0]!.ads).toHaveLength(META_MARKET_SAMPLE_FOR_AI);
  });

  it("index des communes (localIndex) : une ville du département ciblée sans son département est comptée dans le département", async () => {
    const gaillac = Array.from({ length: 3 }, (_, i) => record(String(300_000 + i), { pageName: `Cabinet G${i}`, targetLocations: [{ name: "Gaillac", type: "city", excluded: false }] }));
    const provider = () => fakeProvider((_input, index) => ({ ads: index === 0 ? gaillac : [], calls: 1, truncated: false })).provider;
    const without = await executeMetaAnalysis(CONTEXT, { provider: provider(), planner: planner(), now: NOW });
    expect(without.market!.counts).toEqual({ ville: 0, departement: 0, region: 0, france: 3 });
    const localIndex = buildMetaLocalIndex([{ name: "Gaillac", departmentCode: "81" }], SEED);
    const located = await executeMetaAnalysis({ ...CONTEXT, localIndex }, { provider: provider(), planner: planner(), now: NOW, enrichMedia: async () => ({}) });
    expect(located.market!.counts).toEqual({ ville: 0, departement: 3, region: 0, france: 0 });
    expect(located.market!.ads.every((a) => a.scope === "departement")).toBe(true);
  });

  it("enrichMedia n'est pas appelé sans fournisseur ni quand la veille échoue entièrement", async () => {
    const enrichMedia = vi.fn(async () => ({}));
    const none = await executeMetaAnalysis(CONTEXT, { provider: null, planner: planner(), now: NOW, enrichMedia });
    expect(none.market).toBeNull();
    const { provider } = fakeProvider(() => {
      throw serverError();
    });
    await silenced(async () => {
      const failed = await executeMetaAnalysis(CONTEXT, { provider, planner: planner(), now: NOW, enrichMedia });
      expect(failed.market).toBeNull();
      expect(failed.marketError).toBe(META_ERROR_MESSAGES.transient);
    });
    expect(enrichMedia).not.toHaveBeenCalled();
  });
});

describe("loadLocalGeography", () => {
  it("villes voisines par population (sans la ville du praticien) et index des communes du département et de la région", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse(OCCITANIE_COMMUNES));
    const geography = await loadLocalGeography(SEED, impl);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.origin).toBe("https://geo.api.gouv.fr");
    // Occitanie : code INSEE 76
    expect(url.searchParams.get("codeRegion")).toBe("76");
    expect(geography.nearbyCities).toEqual(["Castres", "Gaillac", "Graulhet"]);
    expect([...geography.localIndex!.department].sort()).toEqual(["albi", "cambon", "castres", "gaillac", "graulhet", "mazamet"]);
    expect([...geography.localIndex!.region].sort()).toEqual(["albi", "cambon", "castres", "gaillac", "graulhet", "mazamet", "montpellier", "toulouse"]);
    // L'index sert tel quel à situer les annonces
    const market = buildMetaMarket(
      { records: [record("1", { targetLocations: [{ name: "Mazamet", type: "city", excluded: false }] })], matchedTerms: {}, terms: [], calls: 1, truncated: false },
      SEED,
      "meta",
      NOW,
      { localIndex: geography.localIndex },
    );
    expect(market.ads[0]!.scope).toBe("departement");
  });

  it("ville du praticien écartée des villes voisines sans tenir compte des accents ni de la casse", async () => {
    const seed = buildMetaSeed({ profession: "Ostéopathe", city: "épernay", address: "3 place de la République, 51200 Épernay", specialties: [], competitorNames: [] });
    const { calls, impl } = stubFetch(() =>
      jsonResponse([
        { nom: "Reims", codeDepartement: "51", population: 179_380 },
        { nom: "Épernay", codeDepartement: "51", population: 22_330 },
        { nom: "Châlons-en-Champagne", codeDepartement: "51", population: 43_800 },
        { nom: "Troyes", codeDepartement: "10", population: 62_000 },
      ]),
    );
    const geography = await loadLocalGeography(seed, impl);
    // Grand Est : code INSEE 44
    expect(new URL(calls[0]!.url).searchParams.get("codeRegion")).toBe("44");
    expect(geography.nearbyCities).toEqual(["Reims", "Châlons-en-Champagne"]);
    expect(geography.localIndex!.department.has("troyes")).toBe(false);
    expect(geography.localIndex!.region.has("troyes")).toBe(true);
  });

  it("référentiel en échec (réseau, HTTP 500, réponse inattendue) : résultat vide après une relance, sans lever", async () => {
    vi.useFakeTimers();
    try {
      for (const respond of [
        () => {
          throw new TypeError("fetch failed");
        },
        () => new Response("Internal Server Error", { status: 500 }),
        () => jsonResponse({ message: "maintenance" }),
      ]) {
        const { calls, impl } = stubFetch(respond);
        const pending = silenced(() => loadLocalGeography(SEED, impl));
        await vi.advanceTimersByTimeAsync(GEO_RETRY_DELAY_MS + 100);
        expect(await pending).toEqual({ nearbyCities: [], localIndex: null });
        expect(calls).toHaveLength(2);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("sans département ou sans région connue du référentiel : aucun appel, résultat vide", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse(OCCITANIE_COMMUNES));
    expect(await loadLocalGeography({ city: "Albi", department: null, region: null }, impl)).toEqual({ nearbyCities: [], localIndex: null });
    expect(await loadLocalGeography({ city: "Albi", department: null, region: "Occitanie" }, impl)).toEqual({ nearbyCities: [], localIndex: null });
    expect(await loadLocalGeography({ city: "Albi", department: SEED.department, region: null }, impl)).toEqual({ nearbyCities: [], localIndex: null });
    const unknown: Pick<MetaAdsSeed, "city" | "department" | "region"> = { city: "Nouméa", department: { code: "988", name: "Nouvelle-Calédonie", region: "Nouvelle-Calédonie" }, region: "Nouvelle-Calédonie" };
    expect(await loadLocalGeography(unknown, impl)).toEqual({ nearbyCities: [], localIndex: null });
    expect(calls).toHaveLength(0);
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
  /** Fiche praticien, lue quand le site porte un `prospectId` */
  prospect?: Record<string, unknown>;
  /** Lignes `meta_ads_library` du site (exemples gardés, annonces supprimées) */
  library?: Record<string, unknown>[];
  /** Lignes `meta_ad_media` déjà en cache */
  media?: Record<string, unknown>[];
  /** Recherches de visuels déjà comptées ce mois-ci (somme des `requests` des usages `meta_media` et `meta_media_pending`) */
  mediaLookups?: number;
  /** Réservations de visuels récentes non soldées (un autre lot du site est en cours) */
  pendingReservations?: { id: string }[];
  /** Tables absentes (migration non appliquée) : toute requête sur elles échoue avec le code 42P01 */
  missingTables?: unknown[];
  /** Pages du site hébergé (accueil et spécialités) */
  pages?: Record<string, unknown>[];
};

/** Erreur du pilote pour une table absente, enveloppée comme le fait drizzle (`cause`). */
function missingTableError(): Error {
  return new Error("Failed query", { cause: Object.assign(new Error("relation does not exist"), { code: "42P01" }) });
}

/** Base simulée : lectures configurées par table, verrou acquis (sauf demande contraire), écritures enregistrées. */
function fakeDb(config: FakeDbConfig = {}) {
  const updates: FakeWrite[] = [];
  const inserts: FakeWrite[] = [];
  const deletes: unknown[] = [];
  /** Ménages des réservations de visuels abandonnées (`delete` des `meta_media_pending` trop anciennes, sous verrou) — comptés à part */
  const purges: unknown[] = [];
  const dialect = new PgDialect();
  /** Tables lues par `select()` (dans l'ordre) */
  const selects: unknown[] = [];
  /** Lectures des pages du site hébergé */
  const reads = { pages: 0 };
  let analysisReads = 0;
  const thenable = <T>(value: T) => ({ then: (res: (v: T) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(value).then(res, rej) });
  const failing = () => ({ then: (res: (v: never) => unknown, rej?: (e: unknown) => unknown) => Promise.reject(missingTableError()).then(res, rej) });
  const isMissing = (table: unknown) => config.missingTables?.includes(table) === true;
  /** Lignes d'une lecture : compteurs d'usage par kind, réservations de visuels en cours, somme des recherches de visuels, bibliothèque, cache des visuels. */
  const rowsOf = (table: unknown, fields: Record<string, unknown> | undefined): unknown[] => {
    if (table === googleUsage) {
      if (fields && "kind" in fields) return config.usage ?? [];
      if (fields && "id" in fields) return config.pendingReservations ?? [];
      return [{ total: config.mediaLookups ?? 0 }];
    }
    if (table === metaAdsLibrary) return config.library ?? [];
    if (table === metaAdMedia) return config.media ?? [];
    return [];
  };
  const selectChain = (fields: Record<string, unknown> | undefined) => {
    let table: unknown = null;
    const chain = {
      from: (source: unknown) => {
        table = source;
        selects.push(source);
        return chain;
      },
      where: () => chain,
      groupBy: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) => (isMissing(table) ? Promise.reject(missingTableError()) : Promise.resolve(rowsOf(table, fields))).then(res, rej),
    };
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
    prospects: { findFirst: async () => config.prospect },
    pages: {
      findMany: async () => {
        reads.pages++;
        return config.pages ?? [];
      },
    },
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
    select: (fields?: Record<string, unknown>) => selectChain(fields),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (isMissing(table)) return { ...failing(), returning: () => failing(), onConflictDoUpdate: () => failing() };
        inserts.push({ table, values });
        return { ...thenable([]), returning: () => thenable([{ id: `new-${inserts.length}` }]), onConflictDoUpdate: () => thenable([]) };
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
      where: (condition?: unknown) => {
        const text = condition === undefined ? "" : dialect.sqlToQuery(condition as SQL).sql;
        if (table === googleUsage && /"google_usage"\."kind" = \$\d+ and "google_usage"\."created_at" < \$\d+/.test(text)) purges.push(table);
        else deletes.push(table);
        return thenable([]);
      },
    }),
  };
  const db = { ...executor, transaction: async <T>(fn: (tx: typeof executor) => Promise<T>) => fn(executor) };
  return { db: db as unknown as Database, updates, inserts, deletes, purges, selects, reads };
}

const doneUpdate = (updates: FakeWrite[]) => updates.find((u) => u.table === metaAdsAnalyses && u.values.status === "done");
/** Visuels mis en cache (une écriture `meta_ad_media` par recherche aboutie). */
const mediaInserts = (inserts: FakeWrite[]) => inserts.filter((i) => i.table === metaAdMedia);
/** Réservations de recherches de visuels (lignes `google_usage` kind `meta_media_pending` insérées sous verrou). */
const mediaReservations = (inserts: FakeWrite[]) => inserts.filter((i) => i.table === googleUsage && i.values.kind === "meta_media_pending");
/** Soldes des réservations : la ligne passe en `meta_media` avec les recherches réellement envoyées et leur coût. */
const mediaSettlements = (updates: FakeWrite[]) => updates.filter((u) => u.table === googleUsage && u.values.kind === "meta_media");
/** Appels à la bibliothèque inscrits sur l'usage `meta_analysis` en fin d'analyse. */
const analysisUsageUpdate = (updates: FakeWrite[]) => updates.find((u) => u.table === googleUsage && !("kind" in u.values));

/** Fiche praticien d'Albi (ville, adresse et donc département connus). */
const PROSPECT = {
  id: "44444444-4444-4444-8444-444444444444",
  firstName: "Claire",
  lastName: "Dupont",
  profession: "Sophrologue",
  city: "Albi",
  gender: "feminin",
  googlePlaceId: null,
  googleAddress: "12 rue de la Paix, 81000 Albi",
  googleRating: null,
  googleReviewCount: null,
};
const heartbeats = (updates: FakeWrite[]) => updates.filter((u) => u.table === metaAdsAnalyses && Object.keys(u.values).length === 1 && u.values.updatedAt instanceof Date);

describe("loadMetaAdsContext (base simulée)", () => {
  const favorite: MetaMarketAd = { ...record("555000111"), pageName: "Cabinet gardé", scope: "ville", active: true, runningDays: 40, signal: "moyen", score: 5, matchedTerms: [] };
  const demoFavorite: MetaMarketAd = { ...favorite, id: "555000333", pageName: "Cabinet de démonstration" };
  const library = [
    { adId: "555000222", status: "dismissed", source: "meta", pageName: "Cabinet écarté", ad: null, media: null, createdAt: NOW, updatedAt: NOW },
    { adId: favorite.id, status: "kept", source: "meta", pageName: favorite.pageName, ad: favorite, media: null, createdAt: NOW, updatedAt: NOW },
    { adId: demoFavorite.id, status: "kept", source: "mock", pageName: demoFavorite.pageName, ad: demoFavorite, media: null, createdAt: NOW, updatedAt: NOW },
    { adId: "555000444", status: "dismissed", source: "mock", pageName: "Démonstration écartée", ad: null, media: null, createdAt: NOW, updatedAt: NOW },
  ];
  const located = () => fakeDb({ site: { ...SITE, prospectId: PROSPECT.id } as Site, prospect: PROSPECT, library });

  it("sans option : ni référentiel des communes ni bibliothèque (graine sans villes voisines, index nul, listes vides)", async () => {
    const fake = located();
    const network = stubFetch(() => jsonResponse(OCCITANIE_COMMUNES));
    const ctx = await withGlobalFetch(network.impl, () => loadMetaAdsContext(fake.db, SITE.id, MOCK_ENV));
    expect(network.calls).toHaveLength(0);
    expect(ctx.seed).toMatchObject({ profession: "Sophrologue", city: "Albi", postalCode: "81000", region: "Occitanie" });
    expect(ctx.seed).not.toHaveProperty("nearbyCities");
    expect(ctx.localIndex).toBeNull();
    expect(ctx.dismissedAdIds).toEqual([]);
    expect(ctx.favorites).toEqual([]);
    expect(fake.selects).not.toContain(metaAdsLibrary);
  });

  it("geography : villes voisines ajoutées à la graine et à ses termes de recherche, index des communes ; library : annonces supprimées et exemples gardés", async () => {
    const fake = located();
    const { calls, impl } = stubFetch(() => jsonResponse(OCCITANIE_COMMUNES));
    const ctx = await loadMetaAdsContext(fake.db, SITE.id, MOCK_ENV, { geography: true, library: true, fetchImpl: impl });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).searchParams.get("codeRegion")).toBe("76");
    expect(ctx.seed.nearbyCities).toEqual(["Castres", "Gaillac", "Graulhet"]);
    expect(ctx.seed.searchTerms).toEqual(
      buildMetaSeed({ profession: "Sophrologue", city: "Albi", address: PROSPECT.googleAddress, specialties: [], competitorNames: [], nearbyCities: ["Castres", "Gaillac", "Graulhet"] }).searchTerms,
    );
    expect(ctx.seed.searchTerms).toContain("sophrologue castres");
    expect(ctx.seed.searchTerms).toContain("sophrologue gaillac");
    expect(ctx.seed.searchTerms.length).toBeLessThanOrEqual(META_LIBRARY_TERMS_MAX);
    expect(ctx.localIndex!.department.has("gaillac")).toBe(true);
    expect(ctx.localIndex!.department.has("toulouse")).toBe(false);
    expect(ctx.localIndex!.region.has("toulouse")).toBe(true);
    // Toutes les annonces supprimées, mais seuls les exemples gardés de la même origine que la veille à venir (réelle par défaut)
    expect(ctx.dismissedAdIds).toEqual(["555000222", "555000444"]);
    expect(ctx.favorites).toEqual([favorite]);
    // Chaque option est indépendante
    const onlyLibrary = await loadMetaAdsContext(located().db, SITE.id, MOCK_ENV, { library: true, fetchImpl: impl });
    expect(calls).toHaveLength(1);
    expect(onlyLibrary.localIndex).toBeNull();
    expect(onlyLibrary.dismissedAdIds).toEqual(["555000222", "555000444"]);
  });

  it("library par origine : « meta » (comme true) → exemples d'une vraie veille ; « mock » → exemples de démonstration ; jamais mélangés", async () => {
    const real = await loadMetaAdsContext(located().db, SITE.id, MOCK_ENV, { library: "meta" });
    expect(real.favorites).toEqual([favorite]);
    const demo = await loadMetaAdsContext(located().db, SITE.id, MOCK_ENV, { library: "mock" });
    expect(demo.favorites).toEqual([demoFavorite]);
    expect(demo.dismissedAdIds).toEqual(real.dismissedAdIds);
    expect((await loadMetaAdsContext(located().db, SITE.id, MOCK_ENV, { library: false })).favorites).toEqual([]);
  });

  it("geography sans département connu (site sans fiche ni adresse) : aucun appel ; bibliothèque absente (migration 0007) : listes vides", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse(OCCITANIE_COMMUNES));
    const fake = fakeDb({ missingTables: [metaAdsLibrary] });
    const ctx = await silenced(() => loadMetaAdsContext(fake.db, SITE.id, MOCK_ENV, { geography: true, library: true, fetchImpl: impl }));
    expect(calls).toHaveLength(0);
    expect(ctx.seed.department).toBeNull();
    expect(ctx.localIndex).toBeNull();
    expect(ctx.dismissedAdIds).toEqual([]);
    expect(ctx.favorites).toEqual([]);
  });

  it("référentiel des communes en échec : contexte rendu quand même, sans villes voisines ni index", async () => {
    vi.useFakeTimers();
    try {
      const { calls, impl } = stubFetch(() => new Response("Bad Gateway", { status: 502 }));
      const pending = silenced(() => loadMetaAdsContext(located().db, SITE.id, MOCK_ENV, { geography: true, fetchImpl: impl }));
      await vi.advanceTimersByTimeAsync(GEO_RETRY_DELAY_MS + 100);
      const ctx = await pending;
      expect(calls).toHaveLength(2);
      expect(ctx.seed).not.toHaveProperty("nearbyCities");
      expect(ctx.seed.city).toBe("Albi");
      expect(ctx.localIndex).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

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
    // Un battement après les visuels, un après la veille, deux entre les générations
    expect(heartbeats(fake.updates)).toHaveLength(4);
    const usageUpdate = analysisUsageUpdate(fake.updates);
    const done = doneUpdate(fake.updates);
    expect(done!.values).toMatchObject({ status: "done", provider: "mock", generator: "mock", error: null, instructions: "Sans tarif" });
    expect(done!.values.calls).toBeGreaterThan(0);
    expect(usageUpdate!.values).toEqual({ requests: done!.values.calls });
    expect(done!.values.market).not.toBeNull();
    expect(done!.values.creatives).not.toBeNull();
    expect(done!.values.videoPlan).not.toBeNull();
    expect(done!.values.plan).not.toBeNull();
    expect(fake.deletes).toHaveLength(0);
    // Le type du site est lu d'abord, puis la bibliothèque (annonces supprimées, exemples gardés) avec le contexte
    expect(fake.selects).toContain(metaAdsLibrary);
    // Visuels de démonstration : une recherche par annonce retenue (réserve comprise), mise en cache dans meta_ad_media
    const market = done!.values.market as MetaAdsMarket;
    const mediaWrites = mediaInserts(fake.inserts);
    expect(market.ads.length).toBeGreaterThan(0);
    expect(market.ads.length).toBeLessThanOrEqual(META_MARKET_MAX_ADS);
    expect(mediaWrites.length).toBeGreaterThanOrEqual(market.ads.length);
    expect(mediaWrites.length).toBeLessThanOrEqual(META_MARKET_MAX_ADS + META_MARKET_MEDIA_SPARE);
    const written = new Map(mediaWrites.map((w) => [w.values.adId as string, w.values]));
    expect(written.size).toBe(mediaWrites.length);
    for (const ad of market.ads) {
      expect(written.get(ad.id)).toMatchObject({ adId: ad.id, status: "ok", provider: "mock", fetchedAt: NOW, updatedAt: NOW });
      expect((written.get(ad.id)!.media as MetaAdMedia).source).toBe("mock");
    }
    // Recherches réservées sur le quota (meta_media_pending) avant d'être envoyées, puis soldées en meta_media : gratuites en démonstration
    const reservations = mediaReservations(fake.inserts);
    expect(reservations).toHaveLength(1);
    expect(reservations[0]!.values).toEqual({ siteId: SITE.id, month: "2026-10", kind: "meta_media_pending", costUsd: 0, requests: mediaWrites.length, createdAt: NOW });
    expect(fake.inserts.indexOf(reservations[0]!)).toBeLessThan(fake.inserts.indexOf(mediaWrites[0]!));
    expect(mediaSettlements(fake.updates).map((u) => u.values)).toEqual([{ kind: "meta_media", requests: mediaWrites.length, costUsd: 0 }]);
    // Rien d'autre n'est inséré : l'analyse, son usage, la réservation, les visuels ; rien n'est supprimé, hors le ménage des réservations abandonnées (une fois, à la réservation)
    expect(fake.inserts).toHaveLength(2 + 1 + mediaWrites.length);
    expect(fake.deletes).toHaveLength(0);
    expect(fake.purges).toEqual([googleUsage]);
  });

  it("démo en mock : aucune requête réseau (ni référentiel des communes, ni fournisseur de visuels réel), même avec une ville et un département connus", async () => {
    const fake = fakeDb({ site: { ...SITE, prospectId: PROSPECT.id } as Site, prospect: PROSPECT });
    const network = stubFetch(() => jsonResponse(OCCITANIE_COMMUNES));
    // Clés réelles présentes : la démo garde la veille et les visuels simulés
    const env = { ...MOCK_ENV, META_AD_LIBRARY_TOKEN: "EAAB-jeton", SCRAPECREATORS_API_KEY: "sc-cle-secrete-0123456789" } as NodeJS.ProcessEnv;
    const outcome = await withGlobalFetch(network.impl, () => silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env })));
    expect(outcome).toMatchObject({ status: "done", marketAvailable: true });
    expect(network.calls).toHaveLength(0);
    const seed = fake.inserts[0]!.values.seed as MetaAdsSeed;
    expect(seed).toMatchObject({ profession: "Sophrologue", city: "Albi", department: { code: "81" } });
    expect(seed).not.toHaveProperty("nearbyCities");
    expect(mediaInserts(fake.inserts).length).toBeGreaterThan(0);
    expect(mediaInserts(fake.inserts).every((w) => w.values.provider === "mock")).toBe(true);
    expect(mediaSettlements(fake.updates).map((u) => u.values.costUsd)).toEqual([0]);
  });

  it("annonces supprimées et cache des visuels : l'annonce supprimée ne revient pas (dismissed), une annonce déjà en cache n'est pas recherchée à nouveau", async () => {
    const first = fakeDb();
    await silenced(() => runMetaAdsAnalysis(first.db, SITE.id, { now: NOW, env: MOCK_ENV }));
    const reference = doneUpdate(first.updates)!.values.market as MetaAdsMarket;
    const [dismissedAd, cachedAd] = reference.ads;
    expect(reference).not.toHaveProperty("dismissed");
    const cached = mediaOf(["Alternative & Holistic Health Service"], { source: "mock" });
    const fake = fakeDb({
      library: [{ adId: dismissedAd!.id, status: "dismissed", source: "mock", pageName: dismissedAd!.pageName, ad: null, media: null, createdAt: NOW, updatedAt: NOW }],
      media: [{ adId: cachedAd!.id, status: "ok", media: cached, provider: "mock", fetchedAt: NOW, updatedAt: NOW }],
    });
    const outcome = await silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env: MOCK_ENV }));
    expect(outcome).toMatchObject({ status: "done", marketAvailable: true });
    const market = doneUpdate(fake.updates)!.values.market as MetaAdsMarket;
    expect(market.ads.some((ad) => ad.id === dismissedAd!.id)).toBe(false);
    expect(market.ads.some((ad) => ad.id === cachedAd!.id)).toBe(true);
    expect(market.dismissed).toBe(1);
    const lookedUp = mediaInserts(fake.inserts).map((w) => w.values.adId);
    expect(lookedUp).not.toContain(dismissedAd!.id);
    expect(lookedUp).not.toContain(cachedAd!.id);
    expect(lookedUp.length).toBeGreaterThan(0);
    // Seules les annonces à chercher sont réservées, seules les recherches réellement envoyées sont comptées
    expect(mediaReservations(fake.inserts).map((i) => i.values.requests)).toEqual([lookedUp.length]);
    expect(mediaSettlements(fake.updates).map((u) => u.values.requests)).toEqual([lookedUp.length]);
  });

  it("visuels d'une autre origine en cache (fournisseur réel) : jamais servis à une veille de démonstration, l'annonce est recherchée à nouveau", async () => {
    const first = fakeDb();
    await silenced(() => runMetaAdsAnalysis(first.db, SITE.id, { now: NOW, env: MOCK_ENV }));
    const [ad] = (doneUpdate(first.updates)!.values.market as MetaAdsMarket).ads;
    const real = mediaOf(["Shopping & retail"], { source: "scrapecreators" });
    const fake = fakeDb({ media: [{ adId: ad!.id, status: "ok", media: real, provider: "scrapecreators", fetchedAt: NOW, updatedAt: NOW }] });
    await silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env: MOCK_ENV }));
    const rewritten = mediaInserts(fake.inserts).find((w) => w.values.adId === ad!.id);
    expect(rewritten!.values).toMatchObject({ provider: "mock", media: { source: "mock" } });
    // La catégorie « boutique » de la ligne étrangère n'écarte donc pas l'annonce de la veille de démonstration
    expect((doneUpdate(fake.updates)!.values.market as MetaAdsMarket).ads.some((a) => a.id === ad!.id)).toBe(true);
  });

  it("exemples gardés de la bibliothèque : transmis à l'analyse sans entrer dans la veille enregistrée", async () => {
    const favorite: MetaMarketAd = { ...record("555000111"), pageName: "Cabinet gardé", scope: "ville", active: true, runningDays: 40, signal: "moyen", score: 5, matchedTerms: [] };
    const fake = fakeDb({ library: [{ adId: favorite.id, status: "kept", source: "mock", pageName: favorite.pageName, ad: favorite, media: null, createdAt: NOW, updatedAt: NOW }] });
    const outcome = await silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env: MOCK_ENV }));
    expect(outcome).toMatchObject({ status: "done", marketAvailable: true });
    const market = doneUpdate(fake.updates)!.values.market as MetaAdsMarket;
    expect(market.ads.some((ad) => ad.id === favorite.id)).toBe(false);
    expect(market).not.toHaveProperty("dismissed");
    expect(market.insights).not.toBeNull();
    expect(mediaInserts(fake.inserts).map((w) => w.values.adId)).not.toContain(favorite.id);
  });

  it("quota mensuel de visuels épuisé : aucune réservation ni recherche, la veille est enregistrée sans visuels ; quota presque épuisé : seul le reste est réservé", async () => {
    const fake = fakeDb({ mediaLookups: META_MEDIA_LOOKUPS_PER_MONTH });
    const outcome = await silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env: MOCK_ENV }));
    expect(outcome).toMatchObject({ status: "done", marketAvailable: true });
    expect(mediaInserts(fake.inserts)).toHaveLength(0);
    expect(mediaReservations(fake.inserts)).toHaveLength(0);
    expect(mediaSettlements(fake.updates)).toHaveLength(0);
    expect(fake.inserts).toHaveLength(2);
    expect(fake.deletes).toHaveLength(0);
    expect((doneUpdate(fake.updates)!.values.market as MetaAdsMarket).ads.length).toBeGreaterThan(0);
    // Quota presque épuisé : les recherches s'arrêtent au reste
    const almost = fakeDb({ mediaLookups: META_MEDIA_LOOKUPS_PER_MONTH - 3 });
    await silenced(() => runMetaAdsAnalysis(almost.db, SITE.id, { now: NOW, env: MOCK_ENV }));
    expect(mediaReservations(almost.inserts).map((i) => i.values.requests)).toEqual([3]);
    expect(mediaInserts(almost.inserts)).toHaveLength(3);
    expect(mediaSettlements(almost.updates).map((u) => u.values)).toEqual([{ kind: "meta_media", requests: 3, costUsd: 0 }]);
  });

  it("un autre lot de visuels du site est en cours (réservation récente non soldée) : aucune recherche, la veille est enregistrée quand même", async () => {
    const fake = fakeDb({ pendingReservations: [{ id: "reservation-en-cours" }] });
    const outcome = await silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env: MOCK_ENV }));
    expect(outcome).toMatchObject({ status: "done", marketAvailable: true });
    expect(mediaInserts(fake.inserts)).toHaveLength(0);
    expect(mediaReservations(fake.inserts)).toHaveLength(0);
    expect(mediaSettlements(fake.updates)).toHaveLength(0);
    // La réservation de l'autre lot n'est ni soldée ni supprimée par cette analyse
    expect(fake.deletes).toHaveLength(0);
    expect((doneUpdate(fake.updates)!.values.market as MetaAdsMarket).ads.length).toBeGreaterThan(0);
    expect(doneUpdate(fake.updates)!.values.error).toBeNull();
  });

  it("tables de la migration 0007 absentes (meta_ads_library, meta_ad_media) : l'analyse aboutit sans bibliothèque ni visuels", async () => {
    const fake = fakeDb({ missingTables: [metaAdsLibrary, metaAdMedia] });
    const outcome = await silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env: MOCK_ENV }));
    expect(outcome).toMatchObject({ status: "done", analysisId: "new-1", marketAvailable: true });
    expect("generationError" in outcome).toBe(false);
    const done = doneUpdate(fake.updates)!;
    expect(done.values).toMatchObject({ status: "done", provider: "mock", error: null });
    expect((done.values.market as MetaAdsMarket).ads.length).toBeGreaterThan(0);
    expect(done.values.creatives).not.toBeNull();
    expect(done.values.plan).not.toBeNull();
    expect(mediaInserts(fake.inserts)).toHaveLength(0);
    expect(mediaReservations(fake.inserts)).toHaveLength(0);
    expect(fake.inserts).toHaveLength(2);
  });

  it("site client sur la vraie bibliothèque : référentiel des communes interrogé (villes voisines dans la graine), visuels du fournisseur réel copiés sur le stockage, usage meta_media facturé, page commerciale écartée", async () => {
    const SCRAPER_KEY = "sc-cle-secrete-0123456789";
    const TOKEN = "EAAB-jeton-0123456789";
    const fake = fakeDb({ site: { ...SITE, type: "client", prospectId: PROSPECT.id } as Site, prospect: PROSPECT });
    const item = (id: string, page: string) => ({
      id,
      page_id: `9${id}`,
      page_name: page,
      ad_delivery_start_time: "2026-09-01",
      ad_creative_bodies: ["Une séance de sophrologie pour souffler."],
      ad_creative_link_titles: ["Sophrologie à Albi"],
      publisher_platforms: ["facebook"],
      languages: ["fr"],
      eu_total_reach: 5_000,
      target_locations: [{ name: "Albi", type: "city", excluded: false }],
    });
    const SHOP_ID = "700000000000002";
    const items = [item("700000000000001", "Cabinet Martin"), item(SHOP_ID, "Cabinet Zen"), item("700000000000003", "Cabinet Roux")];
    const poster = (id: string) => `https://scontent-cdg4-2.xx.fbcdn.net/v/t39.35426-6/${id}_n.jpg?ccb=1-7&oe=6B000000`;
    const network = stubFetch((url) => {
      if (url.hostname === "geo.api.gouv.fr") return jsonResponse(OCCITANIE_COMMUNES);
      if (url.hostname === "graph.facebook.com") return jsonResponse({ data: url.searchParams.get("search_terms") === "sophrologue" ? items : [] });
      if (url.hostname === "api.scrapecreators.com") {
        const id = url.searchParams.get("id")!;
        return jsonResponse({
          success: true,
          credits_remaining: 990,
          snapshot: { display_format: "IMAGE", images: [{ original_image_url: poster(id) }], page_categories: [id === SHOP_ID ? "Shopping & retail" : "Alternative & Holistic Health Service"], page_like_count: 250, cta_text: "En savoir plus" },
        });
      }
      if (url.hostname.endsWith(".fbcdn.net")) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { status: 200, headers: { "content-type": "image/jpeg" } });
      return new Response("inattendu", { status: 418 });
    });
    const stored: { key: string; maxWidth: number }[] = [];
    const mediaStore: MetaMediaStore = {
      putImage: async (key, _bytes, opts) => {
        stored.push({ key, maxWidth: opts.maxWidth });
        return `https://blob.test/${key}`;
      },
      putFile: async () => null,
      remove: async () => undefined,
    };
    // META_ADS_MOCK présent : jamais de données simulées sur un site client (veille et visuels réels)
    const env = { AI_MOCK: "1", META_ADS_MOCK: "1", META_AD_LIBRARY_TOKEN: TOKEN, SCRAPECREATORS_API_KEY: SCRAPER_KEY } as NodeJS.ProcessEnv;
    const outcome = await withGlobalFetch(network.impl, () => silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env, mediaStore })));
    expect(outcome).toMatchObject({ status: "done", marketAvailable: true });

    // Référentiel des communes : une requête pour l'Occitanie, villes voisines ajoutées à la graine et aux termes recherchés
    const hosts = network.calls.map((call) => new URL(call.url).hostname);
    expect(hosts.filter((host) => host === "geo.api.gouv.fr")).toHaveLength(1);
    const seed = fake.inserts[0]!.values.seed as MetaAdsSeed;
    expect(seed.nearbyCities).toEqual(["Castres", "Gaillac", "Graulhet"]);
    expect(seed.searchTerms).toContain("sophrologue castres");
    const searched = network.calls.filter((call) => new URL(call.url).hostname === "graph.facebook.com").map((call) => new URL(call.url).searchParams.get("search_terms"));
    expect(searched).toEqual(seed.searchTerms);

    // Visuels : une recherche par annonce retenue chez le fournisseur réel, clé dans l'en-tête seulement
    const lookups = network.calls.filter((call) => new URL(call.url).hostname === "api.scrapecreators.com");
    expect(lookups.map((call) => new URL(call.url).searchParams.get("id")).sort()).toEqual(items.map((i) => i.id).sort());
    for (const call of lookups) {
      expect(new Headers(call.init?.headers).get("x-api-key")).toBe(SCRAPER_KEY);
      expect(call.url).not.toContain(SCRAPER_KEY);
    }
    for (const call of network.calls) if (new URL(call.url).hostname !== "graph.facebook.com") expect(call.url).not.toContain(TOKEN);
    const mediaWrites = mediaInserts(fake.inserts);
    expect(mediaWrites).toHaveLength(3);
    for (const write of mediaWrites) {
      const id = write.values.adId as string;
      expect(write.values).toMatchObject({ status: "ok", provider: "scrapecreators", fetchedAt: NOW });
      expect(write.values.media).toMatchObject({ source: "scrapecreators", format: "image", items: [{ kind: "image", posterUrl: `https://blob.test/meta-media/${id}/0.jpg`, sourceImageUrl: poster(id), sourceVideoUrl: null }] });
    }
    // Image principale copiée sur le stockage injecté (opts.mediaStore), à la largeur des affiches
    expect(stored.map((s) => s.key).sort()).toEqual(items.map((i) => `meta-media/${i.id}/0.jpg`).sort());
    expect(stored.every((s) => s.maxWidth === META_MEDIA_POSTER_WIDTH)).toBe(true);
    // Trois recherches réservées puis soldées au tarif du fournisseur
    expect(mediaReservations(fake.inserts).map((i) => i.values)).toEqual([{ siteId: SITE.id, month: "2026-10", kind: "meta_media_pending", costUsd: 0, requests: 3, createdAt: NOW }]);
    const settlements = mediaSettlements(fake.updates);
    expect(settlements).toHaveLength(1);
    expect(settlements[0]!.values).toMatchObject({ kind: "meta_media", requests: 3 });
    expect(settlements[0]!.values.costUsd).toBeCloseTo(3 * META_MEDIA_LOOKUP_COST_USD, 10);

    // La page classée boutique est écartée une fois les visuels obtenus
    const done = doneUpdate(fake.updates)!;
    expect(done.values).toMatchObject({ status: "done", provider: "meta", error: null });
    const market = done.values.market as MetaAdsMarket;
    expect(market.source).toBe("meta");
    expect(market.ads.map((ad) => ad.id).sort()).toEqual(["700000000000001", "700000000000003"]);
    expect(market.filtered).toEqual({ formation: 0, commerce: 1, autre: 0 });
    expect(done.values.calls).toBe(seed.searchTerms.length);
    expect(heartbeats(fake.updates)).toHaveLength(4);
  });

  it("site client avec jeton mais sans clé de visuels : veille réelle sans visuels (jamais de visuels simulés, même sous META_ADS_MOCK)", async () => {
    const fake = fakeDb({ site: { ...SITE, type: "client" } as Site });
    const ad = { id: "700000000000001", page_name: "Cabinet Martin", ad_delivery_start_time: "2026-09-01", ad_creative_bodies: ["Une séance de sophrologie pour souffler."], languages: ["fr"], target_locations: [{ name: "Albi", type: "city", excluded: false }] };
    const network = stubFetch((url) => (url.hostname === "graph.facebook.com" ? jsonResponse({ data: [ad] }) : new Response("inattendu", { status: 418 })));
    const env = { AI_MOCK: "1", META_ADS_MOCK: "1", META_AD_LIBRARY_TOKEN: "EAAB-jeton" } as NodeJS.ProcessEnv;
    const outcome = await withGlobalFetch(network.impl, () => silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env })));
    expect(outcome).toMatchObject({ status: "done", marketAvailable: true });
    expect(network.calls.every((call) => new URL(call.url).hostname === "graph.facebook.com")).toBe(true);
    expect((doneUpdate(fake.updates)!.values.market as MetaAdsMarket).ads.map((a) => a.id)).toEqual(["700000000000001"]);
    expect(mediaInserts(fake.inserts)).toHaveLength(0);
    expect(mediaReservations(fake.inserts)).toHaveLength(0);
    expect(fake.selects).not.toContain(metaAdMedia);
    // Pas de visuels : un battement après la veille, deux entre les générations
    expect(heartbeats(fake.updates)).toHaveLength(3);
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

// ─── Site du client comme référence ──────────────────────────────────────────

/** Réglage du site : le site du client est la référence. Pixel, bandeau et réseaux saisis dans le studio y figurent encore. */
const EXTERNAL_THEME = {
  ...THEME,
  externalSite: { url: "https://www.cabinet-dupont.fr", active: true },
  tracking: { metaPixelId: "999999999999999", cookieBanner: false },
  social: { instagram: " https://www.instagram.com/reglage-du-studio " },
} as SiteTheme;
const EXTERNAL_SITE = { ...SITE, theme: EXTERNAL_THEME } as Site;

/** Ce que `loadExternalReference` rend pour ce site : profil relu par le praticien et faits relevés dans ses pages. */
const REFERENCE: ExternalReference = {
  setting: { url: "https://www.cabinet-dupont.fr", active: true },
  // Lu sur le site lui-même (le code des pages a été examiné) ; aucune visite encore reçue du code de mesure
  source: "crawl",
  measureSeenAt: null,
  profile: {
    ...EMPTY_EXTERNAL_PROFILE,
    headline: "Sophrologue à Albi",
    specialties: [
      { slug: "gestion-du-stress", title: "Gestion du stress", excerpt: "Relâcher la pression.", url: "https://www.cabinet-dupont.fr/accompagnements/stress/", headings: [], faq: [] },
      { slug: "sommeil", title: "Sommeil", excerpt: "Retrouver des nuits calmes.", url: "https://cabinet-dupont.fr/sommeil?lang=fr", headings: [], faq: [] },
      { slug: "preparation-mentale", title: "Préparation mentale", excerpt: "Avant une échéance.", headings: [], faq: [] },
    ],
    contact: { phone: "05 63 00 00 00", address: "12 rue des Lilas, 81000 Albi", hours: [] },
    social: { facebook: "https://www.facebook.com/cabinetdupont" },
  },
  facts: {
    ...EMPTY_EXTERNAL_FACTS,
    phones: ["06 11 22 33 44"],
    social: { facebook: "https://www.facebook.com/ancienne-page", instagram: "https://www.instagram.com/cabinetdupont" },
    tags: { metaPixelId: "123456789012345", consentBanner: true },
  },
};

const EXTERNAL_LANDING_PAGES = [
  { path: "/", title: "Accueil", kind: "home" },
  { path: "/accompagnements/stress", title: "Gestion du stress", kind: "motif", slug: "gestion-du-stress" },
  { path: "/sommeil?lang=fr", title: "Sommeil", kind: "motif", slug: "sommeil" },
];
const EXTERNAL_PATHS = EXTERNAL_LANDING_PAGES.map((page) => page.path);

/** Pages du site hébergé du même site : elles ne doivent plus rien fournir quand le site du client est la référence. */
const HOSTED_PAGES = [
  { type: "home", slug: "", title: "Accueil", position: 0, sections: [{ type: "contact", title: "Contact", phone: "01 00 00 00 00", address: "1 place du Vigan, 81000 Albi" }] },
  { type: "motif", slug: "hypnose", title: "Hypnose", position: 1, sections: [{ type: "richText", body: "Texte" }] },
];

/**
 * Brief du site du client, construit comme le fait le chargeur de brief quand
 * ce site est la référence : profil converti en pages (`externalBriefPages`),
 * photo d'accueil du site hébergé gardée au catalogue, adresse du site du
 * client. Les spécialités du brief et les pages d'atterrissage se rejoignent
 * par l'identifiant de spécialité.
 */
const EXTERNAL_BRIEF_RESULT = buildSocialBrief({
  site: {
    id: SITE.id,
    name: "Cabinet Dupont",
    type: "client",
    theme: { ...EXTERNAL_THEME, disabledMotifs: [] },
    bookingUrl: SITE.bookingUrl,
    url: REFERENCE.setting.url,
    hostedUrl: "https://demo.harmony-web.fr/claire-dupont-sophrologue-albi",
  },
  prospect: { firstName: "Claire", lastName: "Dupont", profession: "Sophrologue", city: "Albi", gender: "feminin", googleRating: null, googleReviewCount: null },
  pages: externalBriefPages(REFERENCE.profile, { images: { hero: "https://images.pexels.com/photos/3822622/cabinet.jpeg" } }),
  articles: [],
  reviews: [],
  voice: null,
  practiceName: "la sophrologie",
  now: NOW,
});
const EXTERNAL_BRIEF: SocialSiteBrief = EXTERNAL_BRIEF_RESULT.brief;
const loadExternalBrief = async () => EXTERNAL_BRIEF_RESULT;
const loadHostedBrief = async () => ({ brief: BRIEF, photosById: {}, refsById: {} });

/** Chargeur de référence simulé (jamais le vrai) : compte ses appels. */
function referenceLoader(reference: ExternalReference | null) {
  const calls: string[] = [];
  const load: AdsReferenceLoader = async (_db, site) => {
    calls.push(site.id);
    return reference;
  };
  return { load, calls };
}

describe("site du client : contexte Meta Ads (base simulée, référence et brief injectés)", () => {
  it("avec une référence : spécialités, téléphone, adresse de repli, pages, Pixel, bandeau et réseaux viennent du site du client ; les pages du site hébergé ne sont pas lues", async () => {
    const fake = fakeDb({ site: EXTERNAL_SITE, pages: HOSTED_PAGES });
    const loader = referenceLoader(REFERENCE);
    const ctx = await loadMetaAdsContext(fake.db, SITE.id, MOCK_ENV, { loadReference: loader.load, loadBrief: loadExternalBrief });
    expect(loader.calls).toEqual([SITE.id]);
    expect(fake.reads.pages).toBe(0);
    expect(ctx.landingPages).toEqual(EXTERNAL_LANDING_PAGES);
    expect(ctx.seed.specialties).toEqual(buildMetaSeed({ profession: "x", city: "", address: null, specialties: ["Gestion du stress", "Sommeil", "Préparation mentale"], competitorNames: [] }).specialties);
    expect(JSON.stringify(ctx.seed)).not.toMatch(/hypnose/i);
    // Sans adresse sur la fiche praticien : celle du site du client (code postal, département), pas celle du site hébergé
    expect(ctx.seed).toMatchObject({ postalCode: "81000", department: { code: "81" } });
    expect(ctx.diagnosticInput).toEqual({
      profession: ctx.seed.profession,
      city: "",
      hasBookingUrl: true,
      hasPhone: true,
      // Pixel et bandeau repérés sur le site du client : le réglage du studio (Pixel saisi, bandeau désactivé) ne compte pas
      hasPixel: true,
      cookieBanner: true,
      photosCount: EXTERNAL_BRIEF.photos.length,
      // Réseaux : le réglage du site d'abord (Instagram), puis les liens trouvés sur le site du client (Facebook du profil)
      facebookUrl: "https://www.facebook.com/cabinetdupont",
      instagramUrl: "https://www.instagram.com/reglage-du-studio",
      motifPages: 2,
      profile: { linked: false, rating: null, votes: null },
      externalSite: true,
    });
    expect(ctx.brief).toBe(EXTERNAL_BRIEF);
    expect(ctx.photosById).toEqual({ p1: "https://images.pexels.com/photos/3822622/cabinet.jpeg" });
    // Le brief porte l'adresse du site du client, et chaque page de spécialité y retrouve sa spécialité
    expect(ctx.brief.domain).toBe("www.cabinet-dupont.fr");
    const briefSlugs = ctx.brief.motifPages.map((motif) => motif.slug);
    expect(briefSlugs).toEqual(["gestion-du-stress", "sommeil", "preparation-mentale"]);
    for (const page of ctx.landingPages) if (page.kind === "motif") expect(briefSlugs).toContain(page.slug);
  });

  it("Pixel, bandeau, téléphone et réseaux absents du site du client : rien n'est repris du site hébergé ni du suivi saisi dans le studio", async () => {
    const bare: ExternalReference = {
      ...REFERENCE,
      profile: { ...REFERENCE.profile, contact: { hours: [] }, social: {}, specialties: REFERENCE.profile.specialties.map((specialty) => ({ ...specialty, url: undefined })) },
      facts: { ...EMPTY_EXTERNAL_FACTS },
    };
    const fake = fakeDb({ site: { ...EXTERNAL_SITE, theme: { ...EXTERNAL_THEME, social: {} } } as Site, pages: HOSTED_PAGES });
    const ctx = await loadMetaAdsContext(fake.db, SITE.id, MOCK_ENV, { loadReference: referenceLoader(bare).load, loadBrief: loadExternalBrief });
    expect(ctx.diagnosticInput).toMatchObject({ hasPhone: false, hasPixel: false, cookieBanner: false, facebookUrl: null, instagramUrl: null, motifPages: 0, externalSite: true });
    expect(ctx.landingPages).toEqual([{ path: "/", title: "Accueil", kind: "home" }]);
    expect(ctx.seed.postalCode).toBeNull();
    expect(fake.reads.pages).toBe(0);
    // Liens relevés dans les pages quand le profil n'en porte pas
    const fromFacts = await loadMetaAdsContext(fake.db, SITE.id, MOCK_ENV, { loadReference: referenceLoader({ ...bare, facts: { ...EMPTY_EXTERNAL_FACTS, social: REFERENCE.facts.social, phones: ["06 11 22 33 44"] } }).load, loadBrief: loadExternalBrief });
    expect(fromFacts.diagnosticInput).toMatchObject({ hasPhone: true, facebookUrl: "https://www.facebook.com/ancienne-page", instagramUrl: "https://www.instagram.com/cabinetdupont" });
  });

  it("l'adresse de la fiche praticien garde la priorité sur celle du site du client", async () => {
    const fake = fakeDb({ site: { ...EXTERNAL_SITE, prospectId: PROSPECT.id } as Site, prospect: { ...PROSPECT, googleAddress: "3 rue Peyrolière, 31000 Toulouse", city: "Toulouse" } });
    const ctx = await loadMetaAdsContext(fake.db, SITE.id, MOCK_ENV, { loadReference: referenceLoader(REFERENCE).load, loadBrief: loadExternalBrief });
    expect(ctx.seed).toMatchObject({ city: "Toulouse", postalCode: "31000" });
  });

  it("sans référence : contexte du site hébergé, strictement comme avant (pages lues, Pixel et bandeau du studio, réseaux du réglage, « /motifs/<slug> »)", async () => {
    const hostedSite = { ...SITE, theme: { ...THEME, tracking: EXTERNAL_THEME.tracking, social: { facebook: "https://www.facebook.com/reglage" } } } as Site;
    const expected = {
      profession: expect.any(String),
      city: "",
      hasBookingUrl: true,
      hasPhone: true,
      hasPixel: true,
      cookieBanner: false,
      photosCount: BRIEF.photos.length,
      facebookUrl: "https://www.facebook.com/reglage",
      instagramUrl: null,
      motifPages: 1,
      profile: { linked: false, rating: null, votes: null },
    };
    const landing = [
      { path: "/", title: "Accueil", kind: "home" },
      { path: "/motifs/hypnose", title: "Hypnose", kind: "motif", slug: "hypnose" },
    ];
    // Site sans site du client : le chargeur de référence n'est pas appelé
    const fake = fakeDb({ site: hostedSite, pages: HOSTED_PAGES });
    const unused = referenceLoader(REFERENCE);
    const ctx = await loadMetaAdsContext(fake.db, SITE.id, MOCK_ENV, { loadReference: unused.load, loadBrief: loadHostedBrief });
    expect(unused.calls).toEqual([]);
    expect(fake.reads.pages).toBe(1);
    expect(ctx.diagnosticInput).toEqual(expected);
    expect("externalSite" in ctx.diagnosticInput).toBe(false);
    expect(ctx.landingPages).toEqual(landing);
    expect(ctx.seed.specialties).toEqual(buildMetaSeed({ profession: "x", city: "", address: null, specialties: ["Hypnose"], competitorNames: [] }).specialties);
    // Adresse de repli : la section Contact de l'accueil hébergé
    expect(ctx.seed.postalCode).toBe("81000");
    // Réglage actif mais référence inexploitable : mêmes données, tirées du site hébergé
    const inactive = fakeDb({ site: { ...hostedSite, theme: { ...hostedSite.theme, externalSite: EXTERNAL_THEME.externalSite } } as Site, pages: HOSTED_PAGES });
    const fallback = await loadMetaAdsContext(inactive.db, SITE.id, MOCK_ENV, { loadReference: referenceLoader(null).load, loadBrief: loadHostedBrief });
    expect(fallback.diagnosticInput).toEqual(expected);
    expect(fallback.landingPages).toEqual(landing);
    expect(inactive.reads.pages).toBe(1);
  });
});

describe("site du client : analyse et régénération Meta Ads (base simulée, référence et brief injectés)", () => {
  const deps = { loadReference: referenceLoader(REFERENCE).load, loadBrief: loadExternalBrief };

  it("runMetaAdsAnalysis : bilan formulé pour le site du client, créas sur ses pages réelles, plan sans suffixe « ?src=meta »", async () => {
    const fake = fakeDb({ site: EXTERNAL_SITE, pages: HOSTED_PAGES });
    const outcome = await silenced(() => runMetaAdsAnalysis(fake.db, SITE.id, { now: NOW, env: MOCK_ENV, ...deps }));
    expect(outcome).toMatchObject({ status: "done" });
    expect(fake.reads.pages).toBe(0);
    const done = doneUpdate(fake.updates)!;
    const diagnostic = done.values.diagnostic as MetaAdsDiagnostic;
    expect(diagnostic.externalSite).toBe(true);
    const check = (id: string) => diagnostic.checks.find((c) => c.id === id)!;
    // Site du client : le Pixel n'est jamais bloquant (non repéré, il peut échapper à la lecture)
    expect(check("pixel")).toMatchObject({ status: "ok", critical: false });
    expect(check("pixel").detail).toContain("Le Pixel Meta a été repéré sur votre site");
    expect(check("cookie_banner").detail).toBe("Un bandeau cookies a été repéré sur votre site.");
    expect(check("phone").detail).toBe("Votre numéro de téléphone figure sur votre site.");
    expect(check("landing_pages").detail).toBe("2 pages de spécialité trouvées sur votre site : des pages d'atterrissage ciblées.");
    expect(JSON.stringify(diagnostic.checks)).not.toMatch(/Harmony|Paramétrage|Tracking|Pied de page/);
    const creatives = done.values.creatives as MetaAdsCreativeSet;
    expect(metaCreativeIssues(creatives, EXTERNAL_PATHS)).toEqual([]);
    for (const creative of creatives.creatives) expect(EXTERNAL_PATHS).toContain(creative.landingPath);
    expect(creatives.creatives.map((creative) => creative.landingPath)).toContain("/accompagnements/stress");
    const plan = done.values.plan as MetaAdsPlan;
    // Pixel repéré : campagne en conversions ; la mesure du site du client ne lit aucun paramètre d'adresse
    expect(metaPlanIssues(plan, true)).toEqual([]);
    expect(plan.objective.type).toBe("conversions_site");
    // Le Pixel est seulement repéré : le plan demande de vérifier que l'événement est bien reçu avant de lancer
    expect(plan.objective.rationale).toContain("vérifiez d'abord, dans le Gestionnaire d'événements de Meta, qu'il reçoit bien l'événement Schedule");
    expect("landingSuffix" in plan.campaign).toBe(false);
    expect(JSON.stringify(plan)).not.toMatch(/src=meta|Paramétrage|bloc Résultats/);
    // Les termes de veille viennent des spécialités du site du client, pas des pages du site hébergé
    expect(JSON.stringify(fake.inserts[0]!.values.seed)).not.toMatch(/hypnose/i);
  });

  it("regenerateMetaAds : le bilan est recalculé pour le site du client devenu la référence ; sans Pixel repéré, le plan demande de l'installer sur le site", async () => {
    const noPixel: ExternalReference = { ...REFERENCE, facts: { ...REFERENCE.facts, tags: {} } };
    // Analyse d'avant la connexion du site : bilan et créas établis pour le site hébergé
    const fake = fakeDb({ analysis: doneAnalysis(), site: EXTERNAL_SITE, pages: HOSTED_PAGES });
    const outcome = await silenced(() => regenerateMetaAds(fake.db, SITE.id, { now: NOW, env: MOCK_ENV, loadReference: referenceLoader(noPixel).load, loadBrief: loadExternalBrief }));
    expect(outcome).toMatchObject({ status: "done" });
    const values = fake.updates.find((u) => u.table === metaAdsAnalyses)!.values;
    const diagnostic = values.diagnostic as MetaAdsDiagnostic;
    // Pixel non repéré sur le site du client : à régler, sans bloquer le verdict (le praticien ne pourrait pas lever un blocage que la lecture a peut-être posé à tort)
    expect(diagnostic).toMatchObject({ externalSite: true, verdict: "go_with_prerequisites" });
    expect(diagnostic.checks.find((c) => c.id === "pixel")).toMatchObject({ status: "todo", critical: false, detail: EXTERNAL_SITE_CHECK_DETAILS.pixelTodo });
    expect(diagnostic.checks.find((c) => c.id === "pixel")!.detail).toContain("installez-le sur votre propre site");
    expect(diagnostic.prerequisites).toContain("Pixel Meta installé sur le site");
    // Bandeau non repéré : inconnu, pas un point à régler
    expect(diagnostic.checks.find((c) => c.id === "cookie_banner")).toMatchObject({ status: "unknown" });
    expect(diagnostic.prerequisites).not.toContain("Bandeau cookies actif");
    const creatives = values.creatives as MetaAdsCreativeSet;
    for (const creative of creatives.creatives) expect(EXTERNAL_PATHS).toContain(creative.landingPath);
    const plan = values.plan as MetaAdsPlan;
    expect(metaPlanIssues(plan, false)).toEqual([]);
    expect(plan.objective.rationale).toContain("installez-le d'abord sur votre site");
    expect(JSON.stringify(plan)).not.toMatch(/src=meta|Paramétrage|bloc Résultats/);
    expect(fake.reads.pages).toBe(0);
    expect(isMetaRegenerationInFlight(SITE.id)).toBe(false);
  });
});
