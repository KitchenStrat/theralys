import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOCIAL_VOICE,
  GOOGLE_ADS_ANALYSES_PER_MONTH,
  GOOGLE_ADS_ANALYSIS_COST_USD,
  GOOGLE_ADS_INSTRUCTIONS_MAX,
  GOOGLE_ADS_PLAN_REGENERATIONS_PER_MONTH,
  adsPlanIssues,
  buildAdsSeeds,
  diagnoseGoogleAds,
  selectAdsKeywords,
  type GoogleAdsKeyword,
  type GoogleAdsKeywordSet,
  type PageSections,
  type SiteTheme,
  type SocialSiteBrief,
} from "@theralys/shared";
import { motifPagesAllowance } from "@theralys/db";
import { createGoogleAdsPlanner } from "@theralys/ai";
import { DataForSeoError, MockAdsDataProvider } from "@theralys/providers/dataforseo";
import {
  GOOGLE_ADS_ANALYSIS_STALE_MINUTES,
  adsCostOnError,
  adsProviderAllowed,
  adsUsageFromCounts,
  cleanAdsInstructions,
  decideAdsStart,
  diagnosticInputFrom,
  dominantMatch,
  forecastTargets,
  hasGoogleAdsAccess,
  landingPagesFrom,
  onlineMotifPages,
  phoneFromSections,
  profileFrom,
  type GoogleAdsContextData,
} from "./google-ads";

const NOW = new Date("2026-10-26T06:00:00Z");
const THEME: SiteTheme = { preset: "terracotta", fontPreset: "chaleureux" };

function keyword(text: string, overrides: Partial<GoogleAdsKeyword> = {}): GoogleAdsKeyword {
  return {
    keyword: text,
    searchVolume: 100,
    cpcUsd: 1.2,
    competition: "MEDIUM",
    competitionIndex: 50,
    lowTopBidUsd: 0.8,
    highTopBidUsd: 2,
    monthly: [],
    intent: "metier_ville",
    match: "phrase",
    score: 1,
    core: false,
    tracked: false,
    seed: false,
    cpcEur: 1.1,
    ...overrides,
  };
}

function keywordSet(keywords: GoogleAdsKeyword[]): GoogleAdsKeywordSet {
  return { version: 1, source: "mock", fetchedAt: NOW.toISOString(), locationCode: 2250, seeds: [], keywords, groups: [], negatives: [], rawCount: keywords.length, dropped: 0 };
}

const CONTEXT: GoogleAdsContextData = {
  profession: "Sophrologue",
  city: "Albi",
  specialties: ["Gestion du stress", "Sommeil et récupération"],
  bookingUrl: "https://calendly.com/demo",
  phone: "06 39 98 01 23",
  tracking: { googleAdsId: null, hasConversionLabels: false },
  profile: { linked: true, claimed: true, rating: 4.9, votes: 34, hasHours: true, photos: 7, auditScore: 72 },
  benchmark: { medianRating: 4.7, medianVotes: 33 },
  trackedKeywords: ["sophrologue albi"],
  landingPages: [
    { path: "/", title: "Accueil", kind: "home" },
    { path: "/gestion-du-stress", title: "Gestion du stress", kind: "motif" },
    { path: "/sommeil-et-recuperation", title: "Sommeil et récupération", kind: "motif" },
  ],
  motifPages: 2,
};

const BRIEF: SocialSiteBrief = {
  practitioner: { firstName: "Claire", lastName: "Dupont", profession: "Sophrologue", practiceName: "la sophrologie", city: "Albi", gender: "feminin" },
  voice: DEFAULT_SOCIAL_VOICE,
  siteType: "demo",
  siteName: "Claire Dupont, sophrologue",
  domain: "localhost:3000/claire-dupont-sophrologue-albi",
  hasBookingUrl: true,
  home: { highlights: [], specialties: [], infoCards: [], process: [], faq: [] },
  motifPages: [],
  articles: [],
  reviews: [],
  photos: [],
};

describe("accès et fournisseur", () => {
  it("hasGoogleAdsAccess : démos toujours, clients selon la formule", () => {
    expect(hasGoogleAdsAccess({ type: "demo", plan: "starter" })).toBe(true);
    expect(hasGoogleAdsAccess({ type: "client", plan: "scale" })).toBe(true);
    expect(hasGoogleAdsAccess({ type: "client", plan: "starter" })).toBe(false);
  });

  it("adsProviderAllowed : le mock ne sert que les démos (no_provider pour un client)", () => {
    expect(adsProviderAllowed("mock", "demo")).toBe(true);
    expect(adsProviderAllowed("mock", "client")).toBe(false);
    expect(adsProviderAllowed("dataforseo", "client")).toBe(true);
  });
});

describe("contexte du site", () => {
  it("phoneFromSections : téléphone de la section Contact de l'accueil (masquée comprise), sinon null", () => {
    const sections: PageSections = [
      { type: "hero", title: "Bienvenue", paragraphs: [], stats: [] } as unknown as PageSections[number],
      { type: "contact", title: "Contact", phone: "  06 39 98 01 23 ", hidden: true },
    ];
    expect(phoneFromSections(sections)).toBe("06 39 98 01 23");
    expect(phoneFromSections([{ type: "contact", title: "Contact", phone: "   " }])).toBeNull();
    expect(phoneFromSections([{ type: "contact", title: "Contact" }])).toBeNull();
    expect(phoneFromSections([])).toBeNull();
    expect(phoneFromSections(null)).toBeNull();
  });

  it("onlineMotifPages : ordre, pages désactivées ou vides retirées, démo complète, client borné par la formule", () => {
    const section = { type: "richText", title: "Texte", markdown: "…" } as unknown as PageSections[number];
    const rows = Array.from({ length: 8 }, (_, i) => ({ slug: `motif-${i}`, title: `Motif ${i}`, sections: i === 2 ? [] : [section], position: 8 - i }));
    const demo = onlineMotifPages(rows, { type: "demo", plan: "scale", theme: { ...THEME, disabledMotifs: ["motif-5"] } });
    expect(demo.map((p) => p.slug)).toEqual(["motif-7", "motif-6", "motif-4", "motif-3", "motif-1", "motif-0"]);
    const client = onlineMotifPages(rows, { type: "client", plan: "scale", theme: THEME });
    expect(client).toHaveLength(Math.min(7, motifPagesAllowance("scale")));
    expect(onlineMotifPages(rows, { type: "client", plan: "starter", theme: THEME })).toHaveLength(motifPagesAllowance("starter"));
  });

  it("landingPagesFrom : accueil puis « /<slug> » avec le titre", () => {
    expect(landingPagesFrom([{ slug: "gestion-du-stress", title: "Gestion du stress" }])).toEqual([
      { path: "/", title: "Accueil", kind: "home" },
      { path: "/gestion-du-stress", title: "Gestion du stress", kind: "motif" },
    ]);
  });

  it("profileFrom : fiche reliée (identifiant factice ignoré avec un fournisseur réel), instantané puis fiche praticien", () => {
    const snapshot = { isClaimed: true, rating: 4.8, votes: 40, hasHours: true, totalPhotos: 9 } as never;
    const audit = { snapshot, audit: { score: 72 } as never };
    const prospect = { googlePlaceId: "mock-claire", googleRating: 4.9, googleReviewCount: 34 };
    expect(profileFrom(null, audit, false)).toEqual({ linked: false, claimed: null, rating: null, votes: null, hasHours: null, photos: null, auditScore: null });
    expect(profileFrom({ ...prospect, googlePlaceId: null }, audit, false).linked).toBe(false);
    expect(profileFrom(prospect, audit, true).linked).toBe(false);
    expect(profileFrom(prospect, audit, false)).toEqual({ linked: true, claimed: true, rating: 4.8, votes: 40, hasHours: true, photos: 9, auditScore: 72 });
    expect(profileFrom({ ...prospect, googlePlaceId: "ChIJreal" }, null, true)).toEqual({ linked: true, claimed: null, rating: 4.9, votes: 34, hasHours: null, photos: null, auditScore: null });
  });

  it("diagnosticInputFrom : contact, suivi, pages, fiche, benchmark et résultats de l'analyse", () => {
    const set = keywordSet([keyword("sophrologue albi", { core: true })]);
    const input = diagnosticInputFrom({ ...CONTEXT, tracking: { googleAdsId: "AW-123456789", hasConversionLabels: true } }, set, null);
    expect(input).toMatchObject({
      profession: "Sophrologue",
      city: "Albi",
      hasBookingUrl: true,
      hasPhone: true,
      hasAdsTag: true,
      hasConversionLabels: true,
      motifPages: 2,
      profile: CONTEXT.profile,
      benchmark: CONTEXT.benchmark,
      forecast: null,
    });
    expect(input.keywords).toBe(set);
    expect(diagnosticInputFrom({ ...CONTEXT, bookingUrl: null, phone: null }, null, null)).toMatchObject({ hasBookingUrl: false, hasPhone: false, hasAdsTag: false });
  });
});

describe("prévision : mots-clés envoyés et correspondance", () => {
  it("forecastTargets : le cœur de cible dédoublonné, sinon tous les mots-clés ; correspondance dominante", () => {
    const set = keywordSet([
      keyword("sophrologue albi", { core: true, match: "phrase" }),
      keyword("sophrologue albi avis", { core: true, match: "exact" }),
      keyword("sophrologue albi", { core: true, match: "phrase" }),
      keyword("rendez-vous sophrologue albi", { core: false, match: "phrase" }),
    ]);
    expect(forecastTargets(set)).toEqual({ keywords: ["sophrologue albi", "sophrologue albi avis"], match: "phrase" });
    const noCore = keywordSet([keyword("a", { match: "exact" }), keyword("b", { match: "exact" }), keyword("c", { match: "broad" })]);
    expect(forecastTargets(noCore)).toEqual({ keywords: ["a", "b", "c"], match: "exact" });
    expect(forecastTargets(keywordSet([]))).toEqual({ keywords: [], match: "phrase" });
  });

  it("dominantMatch : égalité tranchée par l'ordre exact > phrase > large, « phrase » sans mot-clé", () => {
    expect(dominantMatch([])).toBe("phrase");
    expect(dominantMatch([{ match: "broad" }, { match: "exact" }])).toBe("exact");
    expect(dominantMatch([{ match: "broad" }, { match: "broad" }, { match: "phrase" }])).toBe("broad");
  });
});

describe("coûts, instructions et quotas", () => {
  it("adsCostOnError : coût connu du fournisseur, 0 en mock, sinon l'estimation par prudence", () => {
    expect(adsCostOnError(new DataForSeoError("refusée", 0.09), 0.5, "dataforseo")).toBe(0.09);
    expect(adsCostOnError(new Error("réseau"), 0.09, "dataforseo")).toBe(0.09);
    expect(adsCostOnError(new Error("réseau"), 0.09, "mock")).toBe(0);
    expect(adsCostOnError("boom", 0, "dataforseo")).toBe(0);
  });

  it("cleanAdsInstructions : nettoyage, plafond, undefined si vide", () => {
    expect(cleanAdsInstructions("  Sans   tarif ​")).toBe("Sans tarif");
    expect(cleanAdsInstructions("")).toBeUndefined();
    expect(cleanAdsInstructions(null)).toBeUndefined();
    expect(cleanAdsInstructions("x".repeat(GOOGLE_ADS_INSTRUCTIONS_MAX + 50))).toHaveLength(GOOGLE_ADS_INSTRUCTIONS_MAX);
  });

  it("adsUsageFromCounts : compteurs par kind et restes bornés à zéro", () => {
    expect(adsUsageFromCounts([])).toEqual({ analysesUsed: 0, analysesRemaining: GOOGLE_ADS_ANALYSES_PER_MONTH, planRegenUsed: 0, planRegenRemaining: GOOGLE_ADS_PLAN_REGENERATIONS_PER_MONTH });
    expect(adsUsageFromCounts([{ kind: "ads_keywords", total: 5 }, { kind: "ads_plan", total: 2 }, { kind: "scan", total: 9 }])).toEqual({
      analysesUsed: 5,
      analysesRemaining: 0,
      planRegenUsed: 2,
      planRegenRemaining: GOOGLE_ADS_PLAN_REGENERATIONS_PER_MONTH - 2,
    });
  });

  it("decideAdsStart : busy (verrou ou analyse en cours), quota, budget, ok avec les analyses interrompues à clore", () => {
    const base = { locked: true, running: [], analysesUsed: 0, budgetRemainingUsd: 1, now: NOW };
    expect(decideAdsStart({ ...base, locked: false })).toEqual({ kind: "busy" });
    expect(decideAdsStart({ ...base, running: [{ id: "a", createdAt: new Date(NOW.getTime() - 60_000) }] })).toEqual({ kind: "busy" });
    const stale = { id: "old", createdAt: new Date(NOW.getTime() - (GOOGLE_ADS_ANALYSIS_STALE_MINUTES + 1) * 60_000) };
    expect(decideAdsStart({ ...base, running: [stale] })).toEqual({ kind: "ok", staleIds: ["old"] });
    expect(decideAdsStart({ ...base, analysesUsed: GOOGLE_ADS_ANALYSES_PER_MONTH })).toEqual({ kind: "quota" });
    expect(decideAdsStart({ ...base, budgetRemainingUsd: GOOGLE_ADS_ANALYSIS_COST_USD - 0.01 })).toEqual({ kind: "budget" });
    expect(decideAdsStart({ ...base, budgetRemainingUsd: GOOGLE_ADS_ANALYSIS_COST_USD })).toEqual({ kind: "ok", staleIds: [] });
  });
});

describe("chaîne mock : idées → sélection → diagnostic → plan", () => {
  it("le plan du planificateur mock est conforme au contrat et reflète les instructions", async () => {
    const seed = buildAdsSeeds({ profession: CONTEXT.profession, city: CONTEXT.city, specialties: CONTEXT.specialties });
    const ideas = await new MockAdsDataProvider({ now: NOW }).keywordIdeas({ seeds: seed.keywords, locationCode: seed.locationCode, languageCode: seed.languageCode });
    const set = selectAdsKeywords(ideas.data, seed, { source: "mock", fetchedAt: NOW, tracked: CONTEXT.trackedKeywords });
    const diagnostic = diagnoseGoogleAds(diagnosticInputFrom(CONTEXT, set, null), NOW);
    expect(diagnostic.demand.keywordsCount).toBe(set.keywords.length);
    expect(set.groups.some((g) => g.intent === "tarif")).toBe(true);

    const planner = createGoogleAdsPlanner({ AI_MOCK: "1" } as NodeJS.ProcessEnv);
    expect(planner.mode).toBe("mock");
    const input = { diagnostic, keywords: set, forecast: null, landingPages: CONTEXT.landingPages, trackedKeywords: CONTEXT.trackedKeywords };
    const plan = await planner.plan(BRIEF, input);
    expect(adsPlanIssues(plan)).toEqual([]);
    expect(plan.generator).toBe("mock");
    expect(plan.campaign.monthlyBudgetEur).toBe(diagnostic.budget.monthlyRecommendedEur);
    expect(plan.campaign.geo.city).toBe("Albi");
    for (const group of plan.adGroups) {
      expect(CONTEXT.landingPages.map((p) => p.path)).toContain(group.landingPath);
      for (const k of group.keywords) expect(set.keywords.map((x) => x.keyword)).toContain(k.text);
    }
    expect(plan.milestones.map((m) => m.horizon)).toEqual(["J+7", "J+30", "J+60", "J+90"]);

    const withoutTarif = await planner.plan(BRIEF, { ...input, instructions: "Sans tarif" });
    expect(adsPlanIssues(withoutTarif)).toEqual([]);
    expect(withoutTarif.adGroups.some((g) => g.intent === "tarif")).toBe(false);
  });
});
