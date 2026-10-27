import { describe, expect, it } from "vitest";
import {
  GOOGLE_ADS_ANALYSIS_COST_USD,
  GOOGLE_ADS_BUDGET_EUR,
  GOOGLE_ADS_CORE_MAX,
  GOOGLE_ADS_GENERIC_NEGATIVES,
  GOOGLE_ADS_INTENTS,
  GOOGLE_ADS_KEYWORDS_MAX,
  GOOGLE_ADS_LOCATION_CODE_FR,
  GOOGLE_ADS_RSA,
  GOOGLE_ADS_SEEDS_MAX,
  adsKeywordExclusion,
  adsPlanIssues,
  adsProfessionFamily,
  adsReadinessChecks,
  buildAdsSeeds,
  clampAdText,
  classifyAdsIntent,
  diagnoseGoogleAds,
  estimateAdsBudget,
  hasConversionLabels,
  intentLabel,
  isGoogleAdsIntent,
  isGoogleAdsLanding,
  normalizeAdsText,
  selectAdsKeywords,
  suggestBidUsd,
  summarizeDemand,
  summarizeForecast,
  usdToEur,
  type GoogleAdsDiagnosticInput,
  type GoogleAdsForecast,
  type GoogleAdsKeyword,
  type GoogleAdsKeywordData,
  type GoogleAdsKeywordSet,
  type GoogleAdsPlan,
} from "./google-ads";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const osteo = buildAdsSeeds({ profession: "Ostéopathe", city: "Toulouse", specialties: ["Ostéopathie du sport", "Ostéopathie pour nourrissons"] });
const sophro = buildAdsSeeds({ profession: "Sophrologue", city: "Toulouse", specialties: ["Sophrologie et gestion du stress", "Sophrologie", "Accompagnement du sommeil"] });
const masseuse = buildAdsSeeds({ profession: "Masseuse bien-être", city: "Albi", specialties: ["Massage californien", "Massage"] });
const yoga = buildAdsSeeds({ profession: "Professeur de yoga", city: "Albi", specialties: [] });

const fetchedAt = new Date("2026-10-26T10:00:00Z");

function idea(keyword: string, searchVolume: number | null, extra: Partial<GoogleAdsKeywordData> = {}): GoogleAdsKeywordData {
  return {
    keyword,
    searchVolume,
    cpcUsd: 1.5,
    competition: "MEDIUM",
    competitionIndex: 50,
    lowTopBidUsd: 0.8,
    highTopBidUsd: 2.4,
    monthly: [],
    ...extra,
  };
}

function select(raw: GoogleAdsKeywordData[], seed = osteo, opts: { tracked?: string[]; max?: number; coreMax?: number } = {}): GoogleAdsKeywordSet {
  return selectAdsKeywords(raw, seed, { source: "mock", fetchedAt, ...opts });
}

/** Score documenté : (log10(volume + 1) + 0,3) × poids × 1,15 si ville × 1,5 si suivi, arrondi au centième. */
function expectedScore(volume: number, weight: number, city: boolean, tracked = false): number {
  return Math.round((Math.log10(volume + 1) + 0.3) * weight * (city ? 1.15 : 1) * (tracked ? 1.5 : 1) * 100) / 100;
}

function kw(keyword: string, extra: Partial<GoogleAdsKeyword> = {}): GoogleAdsKeyword {
  return {
    ...idea(keyword, 100),
    intent: "metier_ville",
    match: "phrase",
    score: 1,
    core: true,
    tracked: false,
    seed: false,
    cpcEur: 1.38,
    ...extra,
  };
}

function makeSet(keywords: GoogleAdsKeyword[]): GoogleAdsKeywordSet {
  return {
    version: 1,
    source: "mock",
    fetchedAt: fetchedAt.toISOString(),
    locationCode: GOOGLE_ADS_LOCATION_CODE_FR,
    seeds: [],
    keywords,
    groups: [],
    negatives: [],
    rawCount: keywords.length,
    dropped: 0,
  };
}

function makeForecast(totalClicks: number, totalCostUsd: number): GoogleAdsForecast {
  return {
    version: 1,
    source: "mock",
    fetchedAt: fetchedAt.toISOString(),
    bidUsd: 2,
    match: "phrase",
    period: "next_month",
    locationCode: GOOGLE_ADS_LOCATION_CODE_FR,
    rows: [],
    totalClicks,
    totalCostUsd,
  };
}

const readyInput: GoogleAdsDiagnosticInput = {
  profession: "Ostéopathe",
  city: "Toulouse",
  hasBookingUrl: true,
  hasPhone: true,
  hasAdsTag: true,
  hasConversionLabels: true,
  motifPages: 2,
  profile: { linked: true, claimed: true, rating: 4.8, votes: 30, hasHours: true, photos: 8, auditScore: 80 },
  benchmark: { medianRating: 4.7, medianVotes: 20 },
  keywords: null,
  forecast: null,
};

// ─── Normalisation et familles ───────────────────────────────────────────────

describe("normalizeAdsText", () => {
  it("retire accents et ligatures, remplace apostrophes, tirets et barres par des espaces, replie les espaces", () => {
    expect(normalizeAdsText("Bien-Être à Nîmes, au cœur du quartier")).toBe("bien etre a nimes au coeur du quartier");
    expect(normalizeAdsText("L’Isle-Jourdain / l'aide_mémoire `ça`")).toBe("l isle jourdain l aide memoire ca");
    expect(normalizeAdsText("  ostéopathe \t  albi  ")).toBe("osteopathe albi");
    expect(normalizeAdsText("Réflexologie (plantaire, palmaire)")).toBe("reflexologie plantaire palmaire");
  });

  it("chaîne vide ou sans lettre → chaîne vide", () => {
    expect(normalizeAdsText("")).toBe("");
    expect(normalizeAdsText("???")).toBe("");
  });
});

describe("adsProfessionFamily", () => {
  it("reconnaît le métier par sa racine, quelle que soit la forme (métier, pratique, féminin, intitulé composé)", () => {
    expect(adsProfessionFamily("Ostéopathe")).toMatchObject({ key: "osteopathe", roots: ["osteo"] });
    expect(adsProfessionFamily("Ostéopathe").negatives).toContain("animalier");
    expect(adsProfessionFamily("Masseuse bien-être").key).toBe("massage");
    expect(adsProfessionFamily("Praticienne en hypnose ericksonienne").key).toBe("hypnotherapeute");
    expect(adsProfessionFamily("Hypnothérapie / hypnose ericksonienne").key).toBe("hypnotherapeute");
    expect(adsProfessionFamily("Diététicienne nutritionniste").key).toBe("nutrition");
    expect(adsProfessionFamily("Professeur de yoga").key).toBe("yoga");
    expect(adsProfessionFamily("Tuina (massage chinois)").key).toBe("massage");
  });

  it("métier inconnu → famille générique avec la racine du premier mot significatif", () => {
    expect(adsProfessionFamily("Fasciathérapeute")).toEqual({ key: "generic", roots: ["fascia"], synonyms: ["fasciathérapeute"], negatives: [] });
    expect(adsProfessionFamily("Biodécodage").roots).toEqual(["biodec"]);
    expect(adsProfessionFamily("PNL").roots).toEqual(["pnl"]);
    expect(adsProfessionFamily("")).toEqual({ key: "generic", roots: [], synonyms: [], negatives: [] });
  });

  it("les mots de fonction (praticien, méthode, instructeur) et les parenthèses ne font pas racine", () => {
    expect(adsProfessionFamily("Praticien en lithothérapie").roots).toEqual(["lithot"]);
    expect(adsProfessionFamily("EFT (libération émotionnelle)")).toMatchObject({ roots: ["eft"], synonyms: ["eft"] });
    expect(adsProfessionFamily("Méthode Feldenkrais").roots).toEqual(["felden"]);
    expect(adsProfessionFamily("Instructeur Pilates").roots).toEqual(["pilate"]);
    expect(adsProfessionFamily("Praticienne en médecine traditionnelle chinoise").roots).toEqual(["medeci"]);
  });

  it("« thérapeute » ne signe un psychopraticien qu'en tête d'intitulé : art-thérapeute et kinésithérapeute restent génériques", () => {
    expect(adsProfessionFamily("Thérapeute de couple").key).toBe("psychopraticien");
    expect(adsProfessionFamily("Psychothérapeute").key).toBe("psychopraticien");
    expect(adsProfessionFamily("Art-thérapeute")).toMatchObject({ key: "generic", roots: ["art"] });
    expect(adsProfessionFamily("Kinésithérapeute")).toMatchObject({ key: "generic", roots: ["kinesi"] });
    expect(adsProfessionFamily("Aromathérapeute")).toMatchObject({ key: "generic", roots: ["aromat"] });
  });
});

describe("intentions", () => {
  it("libellés et garde de type", () => {
    expect(intentLabel("rendez_vous")).toBe("Prise de rendez-vous");
    expect(isGoogleAdsIntent("tarif")).toBe(true);
    expect(isGoogleAdsIntent("inconnu")).toBe(false);
    expect(GOOGLE_ADS_INTENTS.map((i) => i.id)).toEqual(["metier_ville", "rendez_vous", "specialite", "proximite", "reputation", "tarif"]);
  });

  it("usdToEur : taux 0,92 arrondi au centime, null conservé, valeurs non finies refusées", () => {
    expect(usdToEur(1)).toBe(0.92);
    expect(usdToEur(2.7174)).toBe(2.5);
    expect(usdToEur(null)).toBeNull();
    expect(usdToEur(undefined)).toBeNull();
    expect(usdToEur(Number.NaN)).toBeNull();
    expect(GOOGLE_ADS_ANALYSIS_COST_USD).toBeCloseTo(0.18, 10);
  });
});

// ─── Graines ─────────────────────────────────────────────────────────────────

describe("buildAdsSeeds", () => {
  it("métier + ville d'abord, puis métier seul, intentions fortes, spécialités avec et sans ville", () => {
    expect(osteo.keywords.slice(0, 10)).toEqual([
      "ostéopathe toulouse",
      "ostéopathie toulouse",
      "ostéopathe",
      "ostéopathie",
      "ostéopathe près de chez moi",
      "rendez-vous ostéopathe toulouse",
      "cabinet ostéopathe toulouse",
      "ostéopathe toulouse avis",
      "ostéopathe toulouse tarif",
      "meilleur ostéopathe toulouse",
    ]);
    expect(osteo.keywords.slice(10)).toEqual([
      "ostéopathie du sport toulouse",
      "ostéopathie pour nourrissons toulouse",
      "ostéopathie du sport",
      "ostéopathie pour nourrissons",
    ]);
    expect(osteo).toMatchObject({
      locationCode: GOOGLE_ADS_LOCATION_CODE_FR,
      languageCode: "fr",
      profession: "ostéopathe",
      professionFamily: "osteopathe",
      professionTerms: ["ostéopathe", "ostéopathie"],
      professionRoots: ["osteo"],
      city: "toulouse",
      specialties: ["ostéopathie du sport", "ostéopathie pour nourrissons"],
      specialtyRoots: ["sport", "nourri"],
    });
  });

  it("au plus GOOGLE_ADS_SEEDS_MAX graines (ou `max`), chacune ≤ 80 caractères et ≤ 10 mots, sans doublon", () => {
    const specialties = Array.from({ length: 12 }, (_, i) => `Accompagnement spécifique numéro ${i} des troubles`);
    const seed = buildAdsSeeds({ profession: "Sophrologue", city: "Villefranche-de-Rouergue", specialties });
    expect(seed.keywords.length).toBeLessThanOrEqual(GOOGLE_ADS_SEEDS_MAX);
    expect(seed.specialties).toHaveLength(6);
    for (const keyword of seed.keywords) {
      expect(keyword.length).toBeLessThanOrEqual(80);
      expect(keyword.split(" ").length).toBeLessThanOrEqual(10);
    }
    expect(new Set(seed.keywords).size).toBe(seed.keywords.length);
    expect(buildAdsSeeds({ profession: "Sophrologue", city: "Albi", specialties }, 5).keywords).toHaveLength(5);
  });

  it("spécialités nettoyées : minuscules, ponctuation retirée, doublons fusionnés, page « métier seul » ignorée, racine hors métier", () => {
    expect(sophro.specialties).toEqual(["sophrologie et gestion du stress", "accompagnement du sommeil"]);
    expect(sophro.specialtyRoots).toEqual(["stress", "sommei"]);
    expect(masseuse.specialties).toEqual(["massage californien"]);
    expect(masseuse.specialtyRoots).toEqual(["califo"]);
    const seed = buildAdsSeeds({
      profession: "Hypnothérapeute",
      city: "Albi",
      specialties: ["Hypnose : arrêt du tabac (séances)", "hypnose   arrêt  du tabac", "Hypnose", "ok", "Un titre beaucoup trop long pour une spécialité raisonnable sur un site"],
    });
    expect(seed.specialties).toEqual(["hypnose arrêt du tabac"]);
    expect(seed.specialtyRoots).toEqual(["arret"]);
  });

  it("spécialité de plus de 40 caractères coupée sur un mot, sans mot vide pendant", () => {
    const seed = buildAdsSeeds({
      profession: "Réflexologue",
      city: "Albi",
      specialties: ["Hypnothérapie et accompagnement émotionnel", "Réflexologie plantaire palmaire et faciale douce"],
    });
    expect(seed.specialties).toEqual(["hypnothérapie et accompagnement", "réflexologie plantaire palmaire"]);
    expect(seed.keywords).toContain("hypnothérapie et accompagnement albi");
  });

  it("ville vide : pas de graines avec ville ni d'intentions localisées", () => {
    const seed = buildAdsSeeds({ profession: "Ostéopathe", city: "   ", specialties: ["Ostéopathie du sport"] });
    expect(seed.city).toBe("");
    expect(seed.keywords).toEqual(["ostéopathe", "ostéopathie", "ostéopathe près de chez moi", "ostéopathie du sport"]);
  });

  it("ville avec apostrophe, accent ou complément entre parenthèses", () => {
    const isle = buildAdsSeeds({ profession: "Ostéopathe", city: "L'Isle-Jourdain", specialties: [] });
    expect(isle.city).toBe("l'isle-jourdain");
    expect(isle.keywords[0]).toBe("ostéopathe l'isle-jourdain");
    expect(isle.keywords).toContain("rendez-vous ostéopathe l'isle-jourdain");
    expect(buildAdsSeeds({ profession: "Ostéopathe", city: "Nîmes", specialties: [] }).keywords[0]).toBe("ostéopathe nîmes");
    expect(buildAdsSeeds({ profession: "Ostéopathe", city: "Albi", specialties: [] }).keywords[0]).toBe("ostéopathe albi");
    expect(buildAdsSeeds({ profession: "Ostéopathe", city: "Toulouse (31)", specialties: [] }).city).toBe("toulouse");
  });

  it("métier avec parenthèses ou barre : graines sans ponctuation refusée par Google Ads", () => {
    const seed = buildAdsSeeds({ profession: "Réflexologie (plantaire, palmaire, faciale)", city: "L'Isle-Jourdain", specialties: [] });
    expect(seed.keywords[0]).toBe("réflexologie l'isle-jourdain");
    expect(seed.professionTerms).toEqual(["réflexologie", "réflexologue", "réflexologie plantaire"]);
    for (const keyword of seed.keywords) expect(keyword).toMatch(/^[\p{L}\p{N}\s'’-]+$/u);
    expect(seed.profession).toBe("réflexologie (plantaire, palmaire, faciale)");
    expect(buildAdsSeeds({ profession: "Magnétisme / magnétiseur", city: "Albi", specialties: [] }).keywords[0]).toBe("magnétisme albi");
  });

  it("le mot par lequel le praticien se désigne signe aussi le métier quand la famille ne le couvre pas", () => {
    const tuina = buildAdsSeeds({ profession: "Tuina (massage chinois)", city: "Albi", specialties: [] });
    expect(tuina.professionFamily).toBe("massage");
    expect(tuina.professionRoots).toEqual(["mass", "tuina"]);
    expect(adsKeywordExclusion("tuina albi", tuina)).toBeNull();
    expect(masseuse.professionRoots).toEqual(["mass"]);
  });

  it("professeur de yoga : « cours de yoga » reste une graine (le négatif commun « cours » ne s'applique pas)", () => {
    expect(yoga.keywords).toContain("cours de yoga albi");
    expect(yoga.keywords).toContain("professeur de yoga albi");
  });
});

// ─── Exclusion et intention ──────────────────────────────────────────────────

describe("adsKeywordExclusion", () => {
  it("négatifs communs et propres au métier", () => {
    expect(adsKeywordExclusion("formation ostéopathe", osteo)).toBe("negative");
    expect(adsKeywordExclusion("ostéopathe animalier", osteo)).toBe("negative");
    expect(adsKeywordExclusion("ostéopathe toulouse emploi", osteo)).toBe("negative");
    expect(adsKeywordExclusion("ostéopathe équin toulouse", osteo)).toBe("negative");
    expect(adsKeywordExclusion("massage érotique albi", masseuse)).toBe("negative");
    expect(adsKeywordExclusion("cours ostéopathie toulouse", osteo)).toBe("negative");
  });

  it("requêtes informationnelles", () => {
    expect(adsKeywordExclusion("ostéopathe c'est quoi", osteo)).toBe("informational");
    expect(adsKeywordExclusion("bienfaits du massage", masseuse)).toBe("informational");
    expect(adsKeywordExclusion("comment choisir son ostéopathe", osteo)).toBe("informational");
    expect(adsKeywordExclusion("ostéopathie définition", osteo)).toBe("informational");
  });

  it("hors sujet : ni racine du métier, ni spécialité + ville", () => {
    expect(adsKeywordExclusion("plombier toulouse", osteo)).toBe("unrelated");
    expect(adsKeywordExclusion("gestion du stress", sophro)).toBe("unrelated");
    expect(adsKeywordExclusion("stress", sophro)).toBe("unrelated");
    expect(adsKeywordExclusion("californien", masseuse)).toBe("unrelated");
    expect(adsKeywordExclusion("massage californien", masseuse)).toBeNull();
  });

  it("spécialité + ville acceptée, métier accepté partout", () => {
    expect(adsKeywordExclusion("gestion du stress toulouse", sophro)).toBeNull();
    expect(adsKeywordExclusion("troubles du sommeil toulouse", sophro)).toBeNull();
    expect(adsKeywordExclusion("massage californien albi", masseuse)).toBeNull();
    expect(adsKeywordExclusion("sophrologue", sophro)).toBeNull();
    expect(adsKeywordExclusion("Ostéopathe Nîmes", osteo)).toBeNull();
  });

  it("le négatif commun qui nomme la pratique ne s'applique pas à ce métier (« cours » pour un professeur de yoga)", () => {
    expect(adsKeywordExclusion("cours de yoga albi", yoga)).toBeNull();
    expect(adsKeywordExclusion("formation professeur de yoga", yoga)).toBe("negative");
  });

  it("vide ou trop long", () => {
    expect(adsKeywordExclusion("", osteo)).toBe("too_long");
    expect(adsKeywordExclusion("???", osteo)).toBe("too_long");
    expect(adsKeywordExclusion(`ostéopathe ${"toulouse ".repeat(10)}`.trim(), osteo)).toBe("too_long");
    expect(adsKeywordExclusion(`ostéopathe ${"x".repeat(75)}`, osteo)).toBe("too_long");
  });
});

describe("classifyAdsIntent", () => {
  it("marqueurs : rendez-vous, réputation, tarif, proximité (dans cet ordre de priorité)", () => {
    expect(classifyAdsIntent("rendez-vous ostéopathe toulouse", osteo)).toBe("rendez_vous");
    expect(classifyAdsIntent("ostéopathe toulouse urgence", osteo)).toBe("rendez_vous");
    expect(classifyAdsIntent("meilleur ostéopathe toulouse", osteo)).toBe("reputation");
    expect(classifyAdsIntent("ostéopathe toulouse avis", osteo)).toBe("reputation");
    expect(classifyAdsIntent("ostéopathe toulouse tarif", osteo)).toBe("tarif");
    expect(classifyAdsIntent("prix ostéopathe", osteo)).toBe("tarif");
    expect(classifyAdsIntent("ostéopathe près de chez moi", osteo)).toBe("proximite");
    expect(classifyAdsIntent("ostéopathe à proximité", osteo)).toBe("proximite");
    expect(classifyAdsIntent("meilleur ostéopathe toulouse tarif", osteo)).toBe("reputation");
  });

  it("spécialité, métier + ville, métier seul → autour du cabinet", () => {
    expect(classifyAdsIntent("gestion du stress toulouse", sophro)).toBe("specialite");
    expect(classifyAdsIntent("sophrologie stress", sophro)).toBe("specialite");
    expect(classifyAdsIntent("ostéopathe toulouse", osteo)).toBe("metier_ville");
    expect(classifyAdsIntent("osteopathe nimes", buildAdsSeeds({ profession: "Ostéopathe", city: "Nîmes", specialties: [] }))).toBe("metier_ville");
    expect(classifyAdsIntent("ostéopathe", osteo)).toBe("proximite");
    expect(classifyAdsIntent("ostéopathe blagnac", osteo)).toBe("proximite");
  });

  it("ville avec article : reconnue avec ou sans « l' »", () => {
    const isle = buildAdsSeeds({ profession: "Ostéopathe", city: "L'Isle-Jourdain", specialties: [] });
    expect(classifyAdsIntent("ostéopathe l'isle-jourdain", isle)).toBe("metier_ville");
    expect(classifyAdsIntent("osteopathe l isle jourdain", isle)).toBe("metier_ville");
    expect(classifyAdsIntent("osteopathe isle jourdain", isle)).toBe("metier_ville");
    const mans = buildAdsSeeds({ profession: "Ostéopathe", city: "Le Mans", specialties: [] });
    expect(classifyAdsIntent("ostéopathe le mans", mans)).toBe("metier_ville");
    expect(classifyAdsIntent("ostéopathe romans", mans)).toBe("proximite");
  });

  it("une page de spécialité qui n'est que le métier ne transforme pas « métier + ville » en spécialité", () => {
    const seed = buildAdsSeeds({ profession: "Ostéopathe", city: "Toulouse", specialties: ["Ostéopathie", "Ostéopathie du sport"] });
    expect(seed.specialtyRoots).toEqual(["sport"]);
    expect(classifyAdsIntent("ostéopathe toulouse", seed)).toBe("metier_ville");
    expect(classifyAdsIntent("sophrologue toulouse", sophro)).toBe("metier_ville");
  });
});

// ─── Sélection ───────────────────────────────────────────────────────────────

describe("selectAdsKeywords", () => {
  it("dédoublonne sur le texte normalisé en gardant le volume maximal ; rawCount − dropped = mots-clés retenus", () => {
    const set = select([idea("Ostéopathe Toulouse", 320), idea("ostéopathe toulouse", 90), idea("  ostéopathe   toulouse ", 10)]);
    expect(set.keywords).toHaveLength(1);
    expect(set.keywords[0]).toMatchObject({ keyword: "ostéopathe toulouse", searchVolume: 320, seed: true, intent: "metier_ville", match: "phrase", cpcEur: 1.38 });
    expect(set).toMatchObject({ version: 1, source: "mock", fetchedAt: "2026-10-26T10:00:00.000Z", locationCode: GOOGLE_ADS_LOCATION_CODE_FR, rawCount: 3, dropped: 2 });
    expect(set.seeds).toEqual(osteo.keywords);
  });

  it("écarte volume < 10 sauf graine ou mot-clé suivi, et les idées exclues ; compteurs cohérents", () => {
    const set = select(
      [
        idea("ostéopathe toulouse", 320),
        idea("ostéopathe lavaur", 5),
        idea("ostéopathe toulouse avis", 0),
        idea("ostéopathe du sport toulouse", 3),
        idea("formation ostéopathe", 500),
        idea("plombier toulouse", 900),
        idea("ostéopathe c'est quoi", 70),
        idea("", 100),
      ],
      osteo,
      { tracked: ["Ostéopathe du sport Toulouse"] },
    );
    expect(set.keywords.map((k) => k.keyword)).toEqual(["ostéopathe toulouse", "ostéopathe du sport toulouse", "ostéopathe toulouse avis"]);
    expect(set.keywords.find((k) => k.keyword === "ostéopathe toulouse avis")).toMatchObject({ seed: true, tracked: false, searchVolume: 0 });
    expect(set.keywords.find((k) => k.keyword === "ostéopathe du sport toulouse")).toMatchObject({ seed: false, tracked: true, searchVolume: 3 });
    expect(set.rawCount).toBe(8);
    expect(set.dropped).toBe(5);
    expect(set.rawCount - set.dropped).toBe(set.keywords.length);
  });

  it("score documenté : volume, poids de l'intention, ×1,15 avec la ville, ×1,5 si suivi", () => {
    const set = select([idea("ostéopathe toulouse", 320), idea("ostéopathe", 320), idea("meilleur ostéopathe toulouse", 320), idea("ostéopathe du sport toulouse", 320)], osteo, {
      tracked: ["ostéopathe du sport toulouse"],
    });
    const byText = Object.fromEntries(set.keywords.map((k) => [k.keyword, k]));
    expect(byText["ostéopathe toulouse"]?.score).toBe(expectedScore(320, 1, true));
    expect(byText["ostéopathe"]?.score).toBe(expectedScore(320, 1, false));
    expect(byText["meilleur ostéopathe toulouse"]).toMatchObject({ score: expectedScore(320, 0.6, true), intent: "reputation", match: "exact" });
    expect(byText["ostéopathe du sport toulouse"]).toMatchObject({ score: expectedScore(320, 0.9, true, true), intent: "specialite", tracked: true });
    expect(set.keywords.map((k) => k.keyword)[0]).toBe("ostéopathe du sport toulouse");
  });

  it("tri stable : score décroissant, puis volume, puis ordre alphabétique", () => {
    // « ostéopathe toulouse » (50 recherches, ×1,15 ville) et « ostéopathe muret » (101, autour du cabinet) ont le même score arrondi : le volume départage
    const set = select([
      idea("ostéopathe colomiers", 50),
      idea("ostéopathe blagnac", 50),
      idea("ostéopathe albi", 50),
      idea("ostéopathe muret", 101),
      idea("ostéopathe toulouse", 50),
      idea("ostéopathe lavaur", 300),
    ]);
    const byText = Object.fromEntries(set.keywords.map((k) => [k.keyword, k]));
    expect(byText["ostéopathe muret"]?.score).toBe(byText["ostéopathe toulouse"]?.score);
    expect(set.keywords.map((k) => k.keyword)).toEqual(["ostéopathe lavaur", "ostéopathe muret", "ostéopathe toulouse", "ostéopathe albi", "ostéopathe blagnac", "ostéopathe colomiers"]);
    expect(set.keywords.map((k) => k.score)).toEqual([...set.keywords.map((k) => k.score)].sort((a, b) => b - a));
  });

  it("`max` respecté, cœur = les `coreMax` premiers (15 par défaut)", () => {
    const many = Array.from({ length: 70 }, (_, i) => idea(`ostéopathe toulouse ${i}`, 100 + i));
    const set = select(many);
    expect(set.keywords).toHaveLength(GOOGLE_ADS_KEYWORDS_MAX);
    expect(set.keywords.filter((k) => k.core)).toHaveLength(GOOGLE_ADS_CORE_MAX);
    expect(set.keywords.slice(0, GOOGLE_ADS_CORE_MAX).every((k) => k.core)).toBe(true);
    expect(set.keywords.slice(GOOGLE_ADS_CORE_MAX).some((k) => k.core)).toBe(false);
    expect(set.dropped).toBe(10);
    const small = select(many, osteo, { max: 10, coreMax: 3 });
    expect(small.keywords).toHaveLength(10);
    expect(small.keywords.filter((k) => k.core)).toHaveLength(3);
    expect(small.rawCount - small.dropped).toBe(10);
  });

  it("un mot-clé suivi n'est jamais évincé par de meilleurs scores (dans la limite de `max`)", () => {
    const many = Array.from({ length: 70 }, (_, i) => idea(`ostéopathe toulouse ${i}`, 100 + i));
    const set = select([...many, idea("ostéopathe pédiatrique", 0)], osteo, { tracked: ["ostéopathe pédiatrique"] });
    expect(set.keywords).toHaveLength(GOOGLE_ADS_KEYWORDS_MAX);
    expect(set.keywords.some((k) => k.keyword === "ostéopathe pédiatrique" && k.tracked)).toBe(true);
    expect(set.keywords.map((k) => k.score)).toEqual([...set.keywords.map((k) => k.score)].sort((a, b) => b - a));
    const tight = select([idea("ostéopathe a", 0), idea("ostéopathe b", 0), idea("ostéopathe c", 0), idea("ostéopathe toulouse", 900)], osteo, {
      max: 2,
      tracked: ["ostéopathe a", "ostéopathe b", "ostéopathe c"],
    });
    expect(tight.keywords).toHaveLength(2);
    expect(tight.keywords.every((k) => k.tracked)).toBe(true);
    expect(tight.rawCount - tight.dropped).toBe(2);
  });

  it("groupes par intention dans l'ordre des intentions, avec volume total et CPC médian", () => {
    const set = select([
      idea("ostéopathe toulouse", 300, { cpcUsd: 1 }),
      idea("ostéopathie toulouse", 100, { cpcUsd: 2 }),
      idea("ostéopathe toulouse tarif", 40, { cpcUsd: null }),
      idea("rendez-vous ostéopathe toulouse", 50, { cpcUsd: 3 }),
      idea("ostéopathe toulouse avis", 30, { cpcUsd: 0.5 }),
    ]);
    expect(set.groups.map((g) => g.intent)).toEqual(["metier_ville", "rendez_vous", "reputation", "tarif"]);
    expect(set.groups[0]).toEqual({ intent: "metier_ville", label: "Métier + ville", keywords: ["ostéopathe toulouse", "ostéopathie toulouse"], totalVolume: 400, medianCpcEur: 1.38 });
    expect(set.groups[3]).toMatchObject({ intent: "tarif", keywords: ["ostéopathe toulouse tarif"], totalVolume: 40, medianCpcEur: null });
    expect(set.groups[1]?.medianCpcEur).toBe(2.76);
  });

  it("négatifs : communs + métier + informationnels écartés à ≥ 50 de volume, sans doublon", () => {
    const set = select([idea("ostéopathe toulouse", 300), idea("ostéopathe bienfaits", 80), idea("ostéopathe histoire", 20), idea("ostéopathie définition", 120), idea("ostéopathie c'est quoi", 400)]);
    expect(set.negatives).toEqual(expect.arrayContaining([...GOOGLE_ADS_GENERIC_NEGATIVES, "animalier", "vétérinaire", "bienfaits"]));
    expect(set.negatives).not.toContain("histoire");
    expect(set.negatives.filter((n) => normalizeAdsText(n) === "definition")).toHaveLength(1);
    expect(set.negatives.filter((n) => normalizeAdsText(n) === "c est quoi")).toEqual(["c'est quoi"]);
    expect(set.negatives.length).toBeLessThanOrEqual(80);
    expect(new Set(set.negatives.map(normalizeAdsText)).size).toBe(set.negatives.length);
  });

  it("professeur de yoga : « cours » absent des négatifs, « cours de yoga » ciblé", () => {
    const set = select([idea("cours de yoga albi", 200)], yoga);
    expect(set.keywords.map((k) => k.keyword)).toEqual(["cours de yoga albi"]);
    expect(set.negatives).not.toContain("cours");
    expect(set.negatives).toContain("formation");
  });

  it("aucune idée : ensemble vide mais négatifs conseillés", () => {
    const set = select([]);
    expect(set).toMatchObject({ keywords: [], groups: [], rawCount: 0, dropped: 0 });
    expect(set.negatives).toContain("formation");
  });
});

// ─── Enchère et prévision ────────────────────────────────────────────────────

describe("suggestBidUsd", () => {
  it("médiane des enchères hautes du cœur (les autres mots-clés sont ignorés)", () => {
    const keywords = [
      kw("a", { highTopBidUsd: 1 }),
      kw("b", { highTopBidUsd: 3 }),
      kw("c", { highTopBidUsd: 10 }),
      kw("d", { highTopBidUsd: 2 }),
      kw("e", { core: false, highTopBidUsd: 9 }),
      kw("f", { highTopBidUsd: null }),
      kw("g", { highTopBidUsd: 0 }),
    ];
    expect(suggestBidUsd(keywords)).toBe(2.5);
    expect(suggestBidUsd(keywords.map((k) => ({ ...k, core: false })))).toBe(3);
  });

  it("repli CPC × 1,3, puis 2 $, borné 0,5–10", () => {
    expect(suggestBidUsd([kw("a", { highTopBidUsd: null, cpcUsd: 2 }), kw("b", { highTopBidUsd: null, cpcUsd: 4 })])).toBe(3.9);
    expect(suggestBidUsd([kw("a", { highTopBidUsd: null, cpcUsd: null })])).toBe(2);
    expect(suggestBidUsd([])).toBe(2);
    expect(suggestBidUsd([kw("a", { highTopBidUsd: 50 })])).toBe(10);
    expect(suggestBidUsd([kw("a", { highTopBidUsd: 0.1 })])).toBe(0.5);
    expect(suggestBidUsd([kw("a", { highTopBidUsd: null, cpcUsd: 0.2 })])).toBe(0.5);
  });
});

describe("summarizeForecast", () => {
  it("totaux arrondis (clics entiers, coût au centime), nulls ignorés, métadonnées reprises", () => {
    const forecast = summarizeForecast(
      [
        { keyword: "a", clicks: 10.4, costUsd: 12.345, averageCpcUsd: 1.2 },
        { keyword: "b", clicks: 5.3, costUsd: 0.111, averageCpcUsd: null },
        { keyword: "c", clicks: null, costUsd: null, averageCpcUsd: null },
      ],
      { source: "dataforseo", fetchedAt, bidUsd: 2.5, match: "phrase", locationCode: GOOGLE_ADS_LOCATION_CODE_FR },
    );
    expect(forecast).toMatchObject({ version: 1, source: "dataforseo", fetchedAt: "2026-10-26T10:00:00.000Z", bidUsd: 2.5, match: "phrase", period: "next_month", locationCode: 2250, totalClicks: 16, totalCostUsd: 12.46 });
    expect(forecast.rows).toHaveLength(3);
    expect(summarizeForecast([], { source: "mock", fetchedAt, bidUsd: 1, match: "exact", locationCode: 2250 })).toMatchObject({ totalClicks: 0, totalCostUsd: 0 });
  });
});

// ─── Demande, budget, diagnostic ─────────────────────────────────────────────

describe("summarizeDemand", () => {
  it("sans mots-clés : zéros et inconnus", () => {
    const empty = { coreMonthlySearches: 0, totalMonthlySearches: 0, keywordsCount: 0, cpcMinEur: null, cpcMaxEur: null, cpcMedianEur: null, competition: null };
    expect(summarizeDemand(null)).toEqual(empty);
    expect(summarizeDemand(makeSet([]))).toEqual(empty);
  });

  it("volumes du cœur et de l'ensemble, CPC du cœur (> 0 seulement), concurrence par médiane d'indice", () => {
    const set = makeSet([
      kw("a", { searchVolume: 100, cpcEur: 2, competitionIndex: 80 }),
      kw("b", { searchVolume: 50, cpcEur: 0, competitionIndex: 70 }),
      kw("c", { searchVolume: null, cpcEur: 1, competitionIndex: null }),
      kw("d", { core: false, searchVolume: 30, cpcEur: 9, competitionIndex: 10 }),
    ]);
    expect(summarizeDemand(set)).toEqual({ coreMonthlySearches: 150, totalMonthlySearches: 180, keywordsCount: 4, cpcMinEur: 1, cpcMaxEur: 2, cpcMedianEur: 1.5, competition: "forte" });
    expect(summarizeDemand(makeSet([kw("a", { competitionIndex: 50 })])).competition).toBe("moyenne");
    expect(summarizeDemand(makeSet([kw("a", { competitionIndex: 33 })])).competition).toBe("faible");
    expect(summarizeDemand(makeSet([kw("a", { competitionIndex: null, cpcEur: null })]))).toMatchObject({ competition: null, cpcMedianEur: null });
  });
});

describe("estimateAdsBudget", () => {
  it("sans données : CPC par défaut, bornes 90 / 150, clics et contacts dérivés", () => {
    expect(estimateAdsBudget(null, null)).toEqual({
      basis: "none",
      cpcEur: 1.5,
      monthlyMinEur: 90,
      monthlyRecommendedEur: 150,
      dailyRecommendedEur: 4.93,
      clicksMin: 60,
      clicksMax: 100,
      contactsMin: 3,
      contactsMax: 12,
    });
    expect(GOOGLE_ADS_BUDGET_EUR).toEqual({ floor: 90, min: 150, max: 600 });
  });

  it("base CPC : médiane du cœur × 100 clics, minimum pour 50 clics, plafond 600", () => {
    const set = makeSet([kw("a", { cpcEur: 2 }), kw("b", { cpcEur: 3 }), kw("c", { core: false, cpcEur: 50 })]);
    expect(estimateAdsBudget(set, null)).toEqual({
      basis: "cpc",
      cpcEur: 2.5,
      monthlyMinEur: 130,
      monthlyRecommendedEur: 250,
      dailyRecommendedEur: 8.22,
      clicksMin: 52,
      clicksMax: 100,
      contactsMin: 2,
      contactsMax: 12,
    });
    expect(estimateAdsBudget(makeSet([kw("a", { cpcEur: 9 })]), null)).toMatchObject({ basis: "cpc", monthlyMinEur: 450, monthlyRecommendedEur: 600 });
    expect(estimateAdsBudget(makeSet([kw("a", { cpcEur: 0.05 })]), null)).toMatchObject({ basis: "cpc", cpcEur: 0.1, monthlyMinEur: 90, monthlyRecommendedEur: 150 });
  });

  it("base prévision : CPC = coût / clics converti en euros, plafonné par la prévision, jamais sous 90 €", () => {
    expect(estimateAdsBudget(null, makeForecast(40, 100))).toEqual({
      basis: "forecast",
      cpcEur: 2.3,
      monthlyMinEur: 90,
      monthlyRecommendedEur: 90,
      dailyRecommendedEur: 2.96,
      clicksMin: 39,
      clicksMax: 39,
      contactsMin: 1,
      contactsMax: 5,
    });
    const set = makeSet([kw("a", { cpcEur: 4 })]);
    expect(estimateAdsBudget(set, makeForecast(500, 1000))).toMatchObject({ basis: "forecast", cpcEur: 1.84, monthlyMinEur: 90, monthlyRecommendedEur: 180, clicksMin: 48, clicksMax: 97 });
    expect(estimateAdsBudget(set, makeForecast(0, 0))).toMatchObject({ basis: "cpc", cpcEur: 4 });
    expect(estimateAdsBudget(null, makeForecast(10, 0))).toMatchObject({ basis: "none", cpcEur: 1.5 });
  });
});

describe("adsReadinessChecks", () => {
  it("dix points dans l'ordre d'affichage, tous ok pour un cabinet prêt", () => {
    const checks = adsReadinessChecks(readyInput);
    expect(checks.map((c) => c.id)).toEqual(["profile_linked", "profile_claimed", "booking", "phone", "reviews", "hours", "photos", "tracking_tag", "tracking_conversions", "landing_pages"]);
    expect(checks.every((c) => c.status === "ok")).toBe(true);
    expect(checks.find((c) => c.id === "reviews")?.detail).toBe("30 avis, note 4,8 : vos annonces inspireront confiance.");
    expect(checks.find((c) => c.id === "landing_pages")?.detail).toContain("2 pages de spécialité");
  });

  it("contact critique seulement si ni rendez-vous ni téléphone", () => {
    const noBooking = adsReadinessChecks({ ...readyInput, hasBookingUrl: false });
    expect(noBooking.find((c) => c.id === "booking")).toMatchObject({ status: "todo", critical: false });
    expect(noBooking.find((c) => c.id === "phone")).toMatchObject({ status: "ok", critical: false });
    const none = adsReadinessChecks({ ...readyInput, hasBookingUrl: false, hasPhone: false });
    expect(none.find((c) => c.id === "booking")).toMatchObject({ status: "todo", critical: true });
    expect(none.find((c) => c.id === "phone")).toMatchObject({ status: "todo", critical: true });
    expect(adsReadinessChecks({ ...readyInput, profile: { ...readyInput.profile, linked: false } }).find((c) => c.id === "profile_linked")).toMatchObject({ status: "todo", critical: true });
    expect(adsReadinessChecks({ ...readyInput, profile: { ...readyInput.profile, claimed: false } }).find((c) => c.id === "profile_claimed")).toMatchObject({ status: "todo", critical: true });
  });

  it("avis : seuil max(10, médiane des concurrents / 2), note ≥ 4,3, inconnu sans synchronisation", () => {
    const review = (input: GoogleAdsDiagnosticInput) => adsReadinessChecks(input).find((c) => c.id === "reviews")!;
    const demanding = review({ ...readyInput, benchmark: { medianRating: 4.6, medianVotes: 60 }, profile: { ...readyInput.profile, votes: 25, rating: 4.8 } });
    expect(demanding.status).toBe("todo");
    expect(demanding.detail).toContain("au moins 30 avis");
    expect(review({ ...readyInput, benchmark: { medianRating: 4.6, medianVotes: 4 }, profile: { ...readyInput.profile, votes: 12, rating: 4.5 } }).status).toBe("ok");
    expect(review({ ...readyInput, benchmark: null, profile: { ...readyInput.profile, votes: 9, rating: 5 } }).status).toBe("todo");
    expect(review({ ...readyInput, profile: { ...readyInput.profile, votes: 40, rating: 4.2 } }).status).toBe("todo");
    expect(review({ ...readyInput, profile: { ...readyInput.profile, votes: null, rating: null } })).toMatchObject({ status: "unknown", critical: false });
  });

  it("horaires et photos inconnus : statut « unknown » et texte qui n'affirme rien", () => {
    const checks = adsReadinessChecks({ ...readyInput, profile: { ...readyInput.profile, hasHours: null, photos: null } });
    expect(checks.find((c) => c.id === "hours")).toMatchObject({ status: "unknown" });
    expect(checks.find((c) => c.id === "hours")?.detail).toContain("Synchronisez");
    expect(checks.find((c) => c.id === "photos")).toMatchObject({ status: "unknown" });
    expect(checks.find((c) => c.id === "photos")?.detail).toContain("Synchronisez");
    expect(adsReadinessChecks({ ...readyInput, profile: { ...readyInput.profile, photos: 2 } }).find((c) => c.id === "photos")).toMatchObject({ status: "todo" });
  });
});

describe("diagnoseGoogleAds", () => {
  const now = new Date("2026-10-27T08:00:00Z");

  it("verdict « wait » dès qu'un point critique manque ; score et prérequis (bloquants d'abord)", () => {
    const diagnostic = diagnoseGoogleAds(
      {
        ...readyInput,
        hasAdsTag: false,
        hasConversionLabels: false,
        motifPages: 0,
        profile: { linked: false, claimed: null, rating: null, votes: null, hasHours: null, photos: null, auditScore: null },
      },
      now,
    );
    expect(diagnostic).toMatchObject({ version: 1, generatedAt: "2026-10-27T08:00:00.000Z", verdict: "wait", score: 44 });
    expect(diagnostic.headline).toBe("Avant de lancer Google Ads, réglez les points bloquants");
    expect(diagnostic.prerequisites).toEqual(["Fiche Google reliée", "Balise Google Ads sur le site", "Conversions mesurées", "Pages de spécialités dédiées"]);
    expect(diagnostic.summary).toContain("Lancez une analyse");
    expect(diagnostic.summary).toContain("Budget conseillé");
    expect(diagnostic.summary).not.toContain("NaN");
    expect(diagnoseGoogleAds({ ...readyInput, hasBookingUrl: false, hasPhone: false }, now).verdict).toBe("wait");
  });

  it("verdict « go_with_prerequisites » pour des points mineurs, « go » quand tout est prêt", () => {
    const partial = diagnoseGoogleAds({ ...readyInput, hasAdsTag: false }, now);
    expect(partial).toMatchObject({ verdict: "go_with_prerequisites", score: 92, prerequisites: ["Balise Google Ads sur le site"] });
    expect(partial.headline).toBe("Google Ads est pertinent, après quelques réglages");
    const go = diagnoseGoogleAds(readyInput, now);
    expect(go).toMatchObject({ verdict: "go", score: 100, prerequisites: [] });
    expect(go.headline).toBe("Google Ads est pertinent pour votre cabinet");
    expect(go.checks).toHaveLength(10);
    expect(go.budget).toEqual(estimateAdsBudget(null, null));
  });

  it("résumé en français avec la demande mesurée, le CPC médian et le budget, sans NaN", () => {
    const keywords = select([idea("ostéopathe toulouse", 320, { cpcUsd: 2 }), idea("ostéopathie toulouse", 90, { cpcUsd: 1 }), idea("ostéopathe", 40, { cpcUsd: null })]);
    const diagnostic = diagnoseGoogleAds({ ...readyInput, keywords, forecast: makeForecast(60, 120) }, now);
    expect(diagnostic.demand).toMatchObject({ coreMonthlySearches: 450, totalMonthlySearches: 450, keywordsCount: 3, cpcMedianEur: 1.38 });
    expect(diagnostic.summary).toMatch(/^Environ 450 recherches par mois sur vos 3 expressions principales, pour un coût par clic médian de 1,38 €\./);
    expect(diagnostic.summary).toContain("Budget conseillé");
    expect(diagnostic.summary).not.toContain("NaN");
    expect(diagnostic.budget.basis).toBe("forecast");
    const weak = diagnoseGoogleAds({ ...readyInput, keywords: select([idea("ostéopathe toulouse", 12)]) }, now);
    expect(weak.summary).toContain("La demande mesurée sur vos expressions est faible");
  });
});

// ─── Plan d'action ───────────────────────────────────────────────────────────

describe("clampAdText", () => {
  it("texte court : espaces repliés, inchangé sinon", () => {
    expect(clampAdText("  Ostéopathe  à Toulouse ", 30)).toBe("Ostéopathe à Toulouse");
    expect(clampAdText("", 30)).toBe("");
  });

  it("coupe sur une limite de mot et retire la ponctuation pendante", () => {
    expect(clampAdText("Ostéopathe à Toulouse, prise de rendez-vous en ligne", 30)).toBe("Ostéopathe à Toulouse, prise");
    expect(clampAdText("Sophrologie à Toulouse, gestion du stress", 25)).toBe("Sophrologie à Toulouse");
    expect(clampAdText("Massage bien-être à Albi – séances relaxantes", 27)).toBe("Massage bien-être à Albi");
    expect(clampAdText("Ostéopathe à Toulouse", 30).length).toBeLessThanOrEqual(30);
  });

  it("sans espace exploitable : coupe franche à `max`", () => {
    expect(clampAdText("Ostéopathiepédiatriquetoulouse", 10)).toBe("Ostéopathi");
    expect(clampAdText("Un ostéopathetrèslongmotsansespace", 12)).toBe("Un ostéopath");
  });
});

function validPlan(): GoogleAdsPlan {
  return {
    version: 1,
    generatedAt: "2026-10-27T08:00:00.000Z",
    generator: "mock",
    objective: "Obtenir des prises de rendez-vous",
    summary: "Une campagne locale.",
    campaign: {
      name: "Ostéopathe Toulouse",
      geo: { city: "Toulouse", radiusKm: 15, note: "Autour du cabinet" },
      schedule: "Lundi–samedi, 8 h–20 h",
      bidding: "Maximiser les clics, puis conversions",
      dailyBudgetEur: 4.93,
      monthlyBudgetEur: 150,
    },
    adGroups: [
      {
        name: "Métier + ville",
        intent: "metier_ville",
        keywords: [{ text: "ostéopathe toulouse", match: "phrase" }],
        landingPath: "/",
        ads: [
          {
            headlines: ["Ostéopathe à Toulouse", "Prise de rendez-vous", "Cabinet en centre-ville", "Séances sur mesure", "Accueil du lundi au samedi"],
            descriptions: ["Prenez rendez-vous en ligne avec votre ostéopathe à Toulouse.", "Un accompagnement attentif, à votre écoute."],
            path1: "toulouse",
            path2: null,
          },
        ],
      },
    ],
    negatives: ["formation"],
    extensions: { sitelinks: [{ title: "Tarifs", path: "/tarifs" }], callouts: ["Rendez-vous en ligne"], call: true, location: true },
    milestones: [{ horizon: "J+7", title: "Vérifier", actions: ["Contrôler les conversions"], kpis: ["Clics"] }],
    tips: ["Répondez aux appels"],
  };
}

describe("adsPlanIssues", () => {
  it("plan conforme → aucun écart", () => {
    expect(adsPlanIssues(validPlan())).toEqual([]);
    expect(GOOGLE_ADS_RSA).toMatchObject({ headlineMax: 30, descriptionMax: 90, headlinesMin: 5, descriptionsMin: 2, pathMax: 15 });
  });

  it("titres trop longs, trop peu de descriptions, chemin invalide, chemin d'affichage trop long", () => {
    const plan = validPlan();
    const ad = plan.adGroups[0]!.ads[0]!;
    ad.headlines[0] = "Ostéopathe à Toulouse centre-ville";
    ad.descriptions = ["Une seule description."];
    ad.path2 = "rendez-vous-en-ligne";
    plan.adGroups[0]!.landingPath = "accueil";
    const issues = adsPlanIssues(plan);
    expect(issues).toEqual([
      "groupe 1 (Métier + ville) : page d'atterrissage invalide",
      "groupe 1 (Métier + ville), annonce 1 : 1 descriptions",
      "groupe 1 (Métier + ville), annonce 1 : titre trop long « Ostéopathe à Toulouse centre-ville »",
      "groupe 1 (Métier + ville), annonce 1 : chemin d'affichage trop long",
    ]);
  });

  it("comptes de titres, description trop longue, groupe sans mot-clé ni annonce, budget nul, aucun groupe", () => {
    const plan = validPlan();
    const ad = plan.adGroups[0]!.ads[0]!;
    ad.headlines = ad.headlines.slice(0, 3);
    ad.descriptions[0] = "x".repeat(91);
    plan.campaign.monthlyBudgetEur = 0;
    expect(adsPlanIssues(plan)).toEqual([
      "groupe 1 (Métier + ville), annonce 1 : 3 titres",
      "groupe 1 (Métier + ville), annonce 1 : description trop longue",
      "budget nul",
    ]);
    const bare = validPlan();
    bare.adGroups[0]!.keywords = [];
    bare.adGroups[0]!.ads = [];
    expect(adsPlanIssues(bare)).toEqual(["groupe 1 (Métier + ville) : aucun mot-clé", "groupe 1 (Métier + ville) : aucune annonce"]);
    expect(adsPlanIssues({ ...validPlan(), adGroups: [] })).toEqual(["aucun groupe d'annonces"]);
  });
});

// ─── Suivi des conversions ───────────────────────────────────────────────────

describe("hasConversionLabels", () => {
  it("vrai dès qu'un libellé non vide est renseigné", () => {
    expect(hasConversionLabels(null)).toBe(false);
    expect(hasConversionLabels(undefined)).toBe(false);
    expect(hasConversionLabels({})).toBe(false);
    expect(hasConversionLabels({ rdv: "   " })).toBe(false);
    expect(hasConversionLabels({ call: "AbC-dEfGhIjKlMnOp" })).toBe(true);
    expect(hasConversionLabels({ rdv: "", email: "x_y-z123" })).toBe(true);
  });
});

describe("isGoogleAdsLanding", () => {
  it("gclid, gbraid, wbraid ou UTM payant Google", () => {
    expect(isGoogleAdsLanding("?gclid=EAIaIQobChMI")).toBe(true);
    expect(isGoogleAdsLanding("gbraid=abc&src=ig")).toBe(true);
    expect(isGoogleAdsLanding("?utm_source=site&wbraid=xyz")).toBe(true);
    expect(isGoogleAdsLanding("?utm_source=google&utm_medium=cpc")).toBe(true);
    expect(isGoogleAdsLanding("?utm_source=Google&utm_medium=PPC&utm_campaign=rdv")).toBe(true);
    expect(isGoogleAdsLanding("?utm_source=google&utm_medium=paidsearch")).toBe(true);
  });

  it("ni réseaux sociaux, ni organique, ni chaîne vide", () => {
    expect(isGoogleAdsLanding("?src=ig")).toBe(false);
    expect(isGoogleAdsLanding("?utm_source=google&utm_medium=organic")).toBe(false);
    expect(isGoogleAdsLanding("?utm_source=facebook&utm_medium=cpc")).toBe(false);
    expect(isGoogleAdsLanding("?utm_medium=cpc")).toBe(false);
    expect(isGoogleAdsLanding("")).toBe(false);
    expect(isGoogleAdsLanding("?")).toBe(false);
  });
});
