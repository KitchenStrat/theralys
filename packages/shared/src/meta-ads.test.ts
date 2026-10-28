import { describe, expect, it } from "vitest";
import {
  FR_DEPARTMENTS,
  META_ADS_BUDGET_EUR,
  META_ADS_LANDING_SUFFIX,
  META_ADS_TEXT,
  META_LIBRARY_TERMS_MAX,
  META_LIBRARY_TERM_MAX,
  META_MARKET_MAX_ADS,
  META_MARKET_MIN_LOCAL,
  META_MARKET_SCOPES,
  META_MARKET_SCOPE_LABELS,
  META_MARKET_STRONG_DAYS,
  META_MARKET_STRONG_REACH,
  META_PERSONAL_ATTRIBUTE_PATTERNS,
  adIsActive,
  adRunningDays,
  adScore,
  adSignal,
  buildMetaSearchTerms,
  buildMetaSeed,
  clampMetaText,
  departmentFromPostalCode,
  diagnoseMetaAds,
  estimateMetaBudget,
  isMetaAdsAngle,
  isMetaAdsCta,
  isMetaAdsLanding,
  marketNearbyCount,
  marketScopeNote,
  marketTotalCount,
  metaCreativeIssues,
  metaLibraryUrl,
  metaPersonalAttributeViolations,
  metaPlanIssues,
  metaProfessionAffinity,
  metaReadinessChecks,
  metaVideoPlanIssues,
  postalCodeFrom,
  scopeOfAd,
  selectMarketAds,
  type MetaAdCreative,
  type MetaAdLocation,
  type MetaAdRecord,
  type MetaAdsCreativeSet,
  type MetaAdsDiagnosticInput,
  type MetaAdsPlan,
  type MetaAdsSeed,
  type MetaAdsVideoPlan,
  type MetaMarketAd,
  type MetaMarketScope,
  type MetaVideoBrief,
} from "./meta-ads";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const now = new Date("2026-10-26T10:00:00Z");

/** Date ISO `days` jours avant `now`. */
function daysAgo(days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

const hauteGaronne = departmentFromPostalCode("31400")!;
const toulouse: Pick<MetaAdsSeed, "city" | "department" | "region"> = { city: "Toulouse", department: hauteGaronne, region: "Occitanie" };
const lyon: Pick<MetaAdsSeed, "city" | "department" | "region"> = { city: "Lyon", department: departmentFromPostalCode("69003"), region: "Auvergne-Rhône-Alpes" };
const saintEtienne: Pick<MetaAdsSeed, "city" | "department" | "region"> = { city: "Saint-Étienne", department: departmentFromPostalCode("42000"), region: "Auvergne-Rhône-Alpes" };

function loc(name: string, excluded = false): MetaAdLocation {
  return { name, type: null, excluded };
}

function record(id: string, extra: Partial<MetaAdRecord> = {}): MetaAdRecord {
  return {
    id,
    pageId: null,
    pageName: `Cabinet ${id}`,
    bodies: ["Une séance pour souffler."],
    titles: [],
    descriptions: [],
    captions: [],
    libraryUrl: metaLibraryUrl(id),
    startedAt: daysAgo(20),
    stoppedAt: null,
    platforms: ["facebook"],
    languages: ["fr"],
    euTotalReach: 1_000,
    targetAges: null,
    targetGender: null,
    targetLocations: [loc("France")],
    payer: null,
    ...extra,
  };
}

const ZONE_LOCATION: Record<MetaMarketScope, string> = { ville: "Toulouse, Occitanie", departement: "Haute-Garonne, Occitanie", region: "Occitanie", france: "France" };

/** `count` annonces ciblant la zone donnée (identifiants préfixés par la zone). */
function inZone(scope: MetaMarketScope, count: number, extra: Partial<MetaAdRecord> = {}): MetaAdRecord[] {
  return Array.from({ length: count }, (_, i) => record(`${scope}-${i + 1}`, { targetLocations: [loc(ZONE_LOCATION[scope])], ...extra }));
}

function marketAd(scope: MetaMarketScope, signal: MetaMarketAd["signal"] = "faible"): MetaMarketAd {
  return { ...record(`${scope}-${signal}`), scope, active: true, runningDays: 10, signal, score: 1, matchedTerms: [] };
}

const readyInput: MetaAdsDiagnosticInput = {
  profession: "Sophrologue",
  city: "Toulouse",
  hasBookingUrl: true,
  hasPhone: true,
  hasPixel: true,
  cookieBanner: true,
  photosCount: 5,
  facebookUrl: "https://www.facebook.com/cabinet",
  instagramUrl: "https://www.instagram.com/cabinet",
  motifPages: 2,
  profile: { linked: true, rating: 4.8, votes: 30 },
  market: null,
};

function checkOf(input: MetaAdsDiagnosticInput, id: string) {
  const found = metaReadinessChecks(input).find((c) => c.id === id);
  if (!found) throw new Error(`check ${id} absent`);
  return found;
}

function creative(id: string, angle: MetaAdCreative["angle"], extra: Partial<MetaAdCreative> = {}): MetaAdCreative {
  return {
    id,
    angle,
    name: `Créa ${id}`,
    primaryText: "Une séance pour souffler, respirer et repartir du bon pied. Cabinet au centre de Toulouse.",
    headline: "Sophrologie à Toulouse",
    description: "Première séance en douceur",
    cta: "BOOK_NOW",
    hook: "Et si vous souffliez un peu ?",
    subline: "Séances individuelles, en cabinet ou à distance",
    photoId: "p1",
    template: "photo-titre",
    accentRole: "primary",
    altText: "Cabinet lumineux",
    landingPath: "/",
    ...extra,
  };
}

function creativeSet(creatives: MetaAdCreative[]): MetaAdsCreativeSet {
  return { version: 1, generatedAt: now.toISOString(), generator: "mock", creatives, notes: [] };
}

const validCreatives = [creative("c1", "reassurance"), creative("c2", "education", { landingPath: "/stress" }), creative("c3", "local")];
const landingPaths = ["/", "/stress"];

function video(id: string, extra: Partial<MetaVideoBrief> = {}): MetaVideoBrief {
  return {
    id,
    title: `Vidéo ${id}`,
    angle: "education",
    goal: "Expliquer ce qu'est une séance",
    durationSeconds: 30,
    format: "9:16",
    hook: "Trois respirations, et on commence.",
    beats: [
      { at: 0, say: "Bonjour, je suis sophrologue à Toulouse.", onScreen: "Sophrologue à Toulouse", shot: "Plan buste, cabinet" },
      { at: 10, say: "Une séance, c'est d'abord respirer.", onScreen: "Respirer", shot: "Plan large" },
      { at: 25, say: "Prenez rendez-vous en ligne.", onScreen: "Prendre rendez-vous", shot: "Gros plan" },
    ],
    shotList: ["Plan buste", "Plan large"],
    doSay: ["Parler de la séance"],
    dontSay: ["Promettre un résultat"],
    cta: "BOOK_NOW",
    caption: "Une séance pour souffler. Prenez rendez-vous.",
    ...extra,
  };
}

function videoPlan(videos: MetaVideoBrief[]): MetaAdsVideoPlan {
  return { version: 1, generatedAt: now.toISOString(), generator: "mock", videos, equipment: [], editingTips: [] };
}

function plan(extra: Partial<MetaAdsPlan> = {}): MetaAdsPlan {
  return {
    version: 1,
    generatedAt: now.toISOString(),
    generator: "mock",
    objective: { type: "conversions_site", pixelEvent: "Schedule", rationale: "Le Pixel mesure les prises de rendez-vous." },
    campaign: {
      name: "Sophrologie Toulouse",
      geo: { city: "Toulouse", radiusKm: 15, note: "Ville et proche banlieue" },
      ages: { min: 25, max: 55 },
      gender: "all",
      placements: "Advantage+",
      language: "fr",
      schedule: "En continu",
    },
    adSets: [
      { name: "Large", audience: "large", details: "Toulouse + 15 km", creativeIds: ["c1", "c2", "c3"] },
      { name: "Reciblage", audience: "retargeting", details: "Visiteurs 30 jours", creativeIds: ["v1"] },
    ],
    budget: { dailyEur: 10, monthlyEur: 300, testPlan: "3 créas, 14 jours" },
    milestones: [
      { horizon: "J+7", title: "Premiers signaux", actions: [], kpis: [] },
      { horizon: "J+30", title: "Premier bilan", actions: [], kpis: [] },
      { horizon: "J+60", title: "Optimisation", actions: [], kpis: [] },
    ],
    tips: [],
    ...extra,
  };
}

// ─── Affinité du métier ──────────────────────────────────────────────────────

describe("metaProfessionAffinity", () => {
  it("sophrologue → forte, ostéopathe → moyenne (besoin exprimé sur Google), psychopraticien → moyenne", () => {
    expect(metaProfessionAffinity("Sophrologue").level).toBe("forte");
    expect(metaProfessionAffinity("Ostéopathe").level).toBe("moyenne");
    expect(metaProfessionAffinity("Ostéopathe").reason).toContain("Google");
    expect(metaProfessionAffinity("Psychopraticienne").level).toBe("moyenne");
  });

  it("métier inconnu → moyenne par défaut, avec la raison générique", () => {
    const unknown = metaProfessionAffinity("Praticien en lithothérapie");
    expect(unknown.level).toBe("moyenne");
    expect(unknown.reason).toContain("dépend surtout des visuels");
  });

  it("la famille est reconnue quelle que soit la forme de l'intitulé (« Masseuse bien-être » → massage → forte, « Professeur de yoga » → forte)", () => {
    expect(metaProfessionAffinity("Masseuse bien-être").level).toBe("forte");
    expect(metaProfessionAffinity("Masseuse bien-être").reason).toContain("massage");
    expect(metaProfessionAffinity("Professeur de yoga").level).toBe("forte");
  });
});

// ─── Code postal et département ──────────────────────────────────────────────

describe("postalCodeFrom", () => {
  it("adresse réelle, adresse sans code, null, undefined, chaîne vide", () => {
    expect(postalCodeFrom("2 Rue Léna Bernstein, 31400 Toulouse")).toBe("31400");
    expect(postalCodeFrom("2 Rue Léna Bernstein, 31400 Toulouse, France")).toBe("31400");
    expect(postalCodeFrom("Rue Léna Bernstein, Toulouse")).toBeNull();
    expect(postalCodeFrom(null)).toBeNull();
    expect(postalCodeFrom(undefined)).toBeNull();
    expect(postalCodeFrom("")).toBeNull();
  });

  it("un nombre de 5 chiffres avant le code (résidence, boîte postale) ne le remplace pas : on retient le dernier suivi de la ville", () => {
    expect(postalCodeFrom("Résidence Les 10000 Fleurs, 31400 Toulouse")).toBe("31400");
    expect(postalCodeFrom("BP 12345, 31400 Toulouse")).toBe("31400");
    expect(postalCodeFrom("Appartement 12345, 31400")).toBe("31400");
  });

  it("ne lit pas 5 chiffres au milieu d'un numéro plus long (téléphone, SIRET)", () => {
    expect(postalCodeFrom("Tél. 0561123456")).toBeNull();
    expect(postalCodeFrom("SIRET 12345678900012, Toulouse")).toBeNull();
  });
});

describe("departmentFromPostalCode", () => {
  it("31400 → Haute-Garonne / Occitanie, 75011 → Paris / Île-de-France, espaces tolérés", () => {
    expect(departmentFromPostalCode("31400")).toEqual({ code: "31", name: "Haute-Garonne", region: "Occitanie" });
    expect(departmentFromPostalCode("75011")).toEqual({ code: "75", name: "Paris", region: "Île-de-France" });
    expect(departmentFromPostalCode(" 31400 ")?.code).toBe("31");
  });

  it("Corse : 20100 → 2A, 20200 et 20250 → 2B", () => {
    expect(departmentFromPostalCode("20100")?.code).toBe("2A");
    expect(departmentFromPostalCode("20000")?.name).toBe("Corse-du-Sud");
    expect(departmentFromPostalCode("20200")?.code).toBe("2B");
    expect(departmentFromPostalCode("20250")?.name).toBe("Haute-Corse");
    expect(departmentFromPostalCode("20250")?.region).toBe("Corse");
  });

  it("outre-mer sur trois chiffres : 97400 → La Réunion, 97100 → Guadeloupe", () => {
    expect(departmentFromPostalCode("97400")).toEqual({ code: "974", name: "La Réunion", region: "La Réunion" });
    expect(departmentFromPostalCode("97100")?.name).toBe("Guadeloupe");
  });

  it("code invalide ou inconnu → null (trop court, lettres, vide, null, 00000, 96000, Monaco 98000)", () => {
    for (const cp of ["3140", "314000", "abcde", "", "00000", "96000", "98000", null, undefined]) {
      expect(departmentFromPostalCode(cp), String(cp)).toBeNull();
    }
  });

  it("la table couvre les 101 départements avec des codes uniques", () => {
    expect(FR_DEPARTMENTS).toHaveLength(101);
    expect(new Set(FR_DEPARTMENTS.map((d) => d.code)).size).toBe(101);
  });
});

// ─── Graine ──────────────────────────────────────────────────────────────────

describe("buildMetaSearchTerms", () => {
  it("métier et synonymes d'abord, puis les spécialités les plus courtes (≤ 4 mots), puis les concurrents ; parenthèses retirées", () => {
    expect(
      buildMetaSearchTerms({
        profession: "Sophrologue",
        specialties: ["Sophrologie et gestion du stress", "Sommeil", "Confiance en soi (adultes)"],
        competitorNames: ["Cabinet Zen Toulouse", "Léa Dupont"],
      }),
    ).toEqual(["sophrologue", "sophrologie", "sommeil", "confiance en soi adultes", "cabinet zen toulouse", "léa dupont"]);
  });

  it("au plus META_LIBRARY_TERMS_MAX termes (ou `max`) : 3 du métier, 2 spécialités, le reste pour les concurrents", () => {
    const seed = { profession: "Masseuse bien-être", specialties: ["Massage californien", "Massage suédois"], competitorNames: ["Spa Albi", "Institut Belle Vie"] };
    const terms = buildMetaSearchTerms(seed);
    expect(terms).toEqual(["masseuse bien-être", "massage", "masseur", "massage suédois", "massage californien", "spa albi"]);
    expect(terms).toHaveLength(META_LIBRARY_TERMS_MAX);
    expect(buildMetaSearchTerms(seed, 3)).toEqual(["masseuse bien-être", "massage", "masseur"]);
  });

  it("dédoublonne (spécialité qui répète le métier) et ignore les termes trop courts", () => {
    expect(buildMetaSearchTerms({ profession: "Sophrologue", specialties: ["Sophrologie", "sophrologue", "Dos"], competitorNames: ["Zen", "Sophrologie Toulouse"] })).toEqual([
      "sophrologue",
      "sophrologie",
      "sophrologie toulouse",
    ]);
  });

  it("guillemets et crochets retirés des termes, espaces repliés", () => {
    expect(buildMetaSearchTerms({ profession: "Ostéopathe", specialties: ['« Ostéopathie   du sport »', "EFT [libération émotionnelle]"], competitorNames: [] })).toEqual([
      "ostéopathe",
      "ostéopathie",
      "ostéopathie du sport",
      "eft libération émotionnelle",
    ]);
  });

  it("chaque terme tient en META_LIBRARY_TERM_MAX caractères (coupé au mot) ; un concurrent impossible à tronquer proprement est ignoré", () => {
    const longName = `${"Cabinet des Thérapies Douces et Naturelles de la Vallée ".repeat(3)}Toulouse`;
    expect(longName.length).toBeGreaterThan(META_LIBRARY_TERM_MAX);
    const terms = buildMetaSearchTerms({ profession: "Sophrologue", specialties: [], competitorNames: [longName, "x".repeat(140), "Cabinet Zen"] });
    expect(terms.every((t) => t.length <= META_LIBRARY_TERM_MAX)).toBe(true);
    const competitor = terms.find((t) => t.startsWith("cabinet des thérapies"));
    expect(competitor).toBeDefined();
    expect(competitor!.endsWith(" ")).toBe(false);
    expect(longName.toLowerCase().startsWith(competitor!)).toBe(true);
    expect(terms.some((t) => /^x+$/.test(t))).toBe(false);
    expect(terms).toContain("cabinet zen");
    // Métier et spécialité démesurés : tronqués, jamais ignorés
    const specialty = `Accompagnement ${"très ".repeat(30)}long`;
    const bounded = buildMetaSearchTerms({ profession: `Praticienne ${"bien-être ".repeat(15)}holistique`, specialties: [specialty], competitorNames: [] });
    expect(bounded.length).toBeGreaterThan(0);
    expect(bounded.every((t) => t.length <= META_LIBRARY_TERM_MAX && t.length >= 3)).toBe(true);
  });
});

describe("buildMetaSeed", () => {
  it("département et région déduits de l'adresse, métier et ville nettoyés, spécialités ≤ 6 et concurrents ≤ 6 sans doublon", () => {
    const seed = buildMetaSeed({
      profession: "  Sophrologue ",
      city: " Toulouse  ",
      address: "2 Rue Léna Bernstein, 31400 Toulouse",
      specialties: ["Stress", "  Sommeil  ", "Stress", "Do", "Confiance", "Deuil", "Acouphènes", "Examens", "Enfants"],
      competitorNames: ["Cabinet A", "", "Cabinet A", "Cabinet B", "Cabinet C", "Cabinet D", "Cabinet E", "Cabinet F", "Cabinet G"],
    });
    expect(seed.profession).toBe("Sophrologue");
    expect(seed.professionFamily).toBe("sophrologue");
    expect(seed.city).toBe("Toulouse");
    expect(seed.postalCode).toBe("31400");
    expect(seed.department?.name).toBe("Haute-Garonne");
    expect(seed.region).toBe("Occitanie");
    expect(seed.country).toBe("FR");
    expect(seed.specialties).toEqual(["Stress", "Sommeil", "Confiance", "Deuil", "Acouphènes", "Examens"]);
    expect(seed.competitorNames).toEqual(["Cabinet A", "Cabinet B", "Cabinet C", "Cabinet D", "Cabinet E", "Cabinet F"]);
    expect(seed.searchTerms).toEqual(buildMetaSearchTerms(seed));
    expect(seed.searchTerms.length).toBeLessThanOrEqual(META_LIBRARY_TERMS_MAX);
  });

  it("sans adresse (ou sans code postal) : code, département et région null, graine quand même utilisable", () => {
    const seed = buildMetaSeed({ profession: "Ostéopathe", city: "Albi", address: null, specialties: [], competitorNames: [] });
    expect(seed.postalCode).toBeNull();
    expect(seed.department).toBeNull();
    expect(seed.region).toBeNull();
    expect(seed.searchTerms).toEqual(["ostéopathe", "ostéopathie"]);
    expect(buildMetaSeed({ profession: "Ostéopathe", city: "Albi", address: "Rue de la Paix, Albi", specialties: [], competitorNames: [] }).department).toBeNull();
  });
});

// ─── Annonces : durée, activité, signal, score ───────────────────────────────

describe("adRunningDays / adIsActive", () => {
  it("sans date de début → null ; date illisible → null", () => {
    expect(adRunningDays({ startedAt: null, stoppedAt: null }, now)).toBeNull();
    expect(adRunningDays({ startedAt: "pas une date", stoppedAt: null }, now)).toBeNull();
  });

  it("en cours : jours jusqu'à `now` ; arrêtée : jours jusqu'à l'arrêt ; arrêt avant le début → 0", () => {
    expect(adRunningDays({ startedAt: daysAgo(30), stoppedAt: null }, now)).toBe(30);
    expect(adRunningDays({ startedAt: daysAgo(30), stoppedAt: daysAgo(16) }, now)).toBe(14);
    expect(adRunningDays({ startedAt: daysAgo(5), stoppedAt: daysAgo(10) }, now)).toBe(0);
  });

  it("un arrêt programmé dans le futur ne crédite pas les jours non diffusés", () => {
    expect(adRunningDays({ startedAt: daysAgo(10), stoppedAt: daysAgo(-20) }, now)).toBe(10);
    expect(adSignal(adRunningDays({ startedAt: daysAgo(10), stoppedAt: daysAgo(-20) }, now), 50_000)).toBe("moyen");
  });

  it("active sans date d'arrêt ou avec un arrêt futur ; inactive dès que l'arrêt est passé (ou maintenant)", () => {
    expect(adIsActive({ stoppedAt: null }, now)).toBe(true);
    expect(adIsActive({ stoppedAt: daysAgo(-3) }, now)).toBe(true);
    expect(adIsActive({ stoppedAt: daysAgo(3) }, now)).toBe(false);
    expect(adIsActive({ stoppedAt: now.toISOString() }, now)).toBe(false);
    expect(adIsActive({ stoppedAt: "n'importe quoi" }, now)).toBe(true);
  });
});

describe("adSignal", () => {
  it("fort = au moins 30 jours ET au moins 10 000 de portée", () => {
    expect(adSignal(META_MARKET_STRONG_DAYS, META_MARKET_STRONG_REACH)).toBe("fort");
    expect(adSignal(90, 50_000)).toBe("fort");
    expect(adSignal(29, 50_000)).toBe("moyen");
    expect(adSignal(90, 9_999)).toBe("moyen");
  });

  it("moyen = 14 jours OU 3 000 de portée ; faible sinon ; null traité comme 0", () => {
    expect(adSignal(14, 0)).toBe("moyen");
    expect(adSignal(0, 3_000)).toBe("moyen");
    expect(adSignal(13, 2_999)).toBe("faible");
    expect(adSignal(null, null)).toBe("faible");
    expect(adSignal(null, 3_000)).toBe("moyen");
  });
});

describe("adScore", () => {
  it("formule documentée : log10(portée + 1) + min(jours, 120) / 30 + 0,5 si en cours, arrondi au centième ; null → 0", () => {
    expect(adScore(0, 0, false)).toBe(0);
    expect(adScore(null, null, true)).toBe(0.5);
    expect(adScore(30, 999, false)).toBe(4);
    expect(adScore(120, 999, true)).toBe(7.5);
    expect(adScore(300, 999, true)).toBe(7.5);
    expect(adScore(7, 1_234, true)).toBe(Math.round((Math.log10(1_235) + 7 / 30 + 0.5) * 100) / 100);
  });

  it("croît avec la portée, la durée et la diffusion en cours, et reste un nombre fini", () => {
    expect(adScore(10, 5_000, false)).toBeGreaterThan(adScore(10, 500, false));
    expect(adScore(60, 500, false)).toBeGreaterThan(adScore(10, 500, false));
    expect(adScore(10, 500, true)).toBeGreaterThan(adScore(10, 500, false));
    for (const score of [adScore(null, null, false), adScore(0, 60_000, true), adScore(400, 0, false)]) expect(Number.isFinite(score)).toBe(true);
  });
});

// ─── Zone d'une annonce ──────────────────────────────────────────────────────

describe("scopeOfAd", () => {
  const scope = (names: (string | MetaAdLocation)[], seed = toulouse) => scopeOfAd({ targetLocations: names.map((n) => (typeof n === "string" ? loc(n) : n)) }, seed);

  it("ville, département, région, France, d'après la zone la plus étroite", () => {
    expect(scope(["Toulouse, Occitanie"])).toBe("ville");
    expect(scope(["Toulouse"])).toBe("ville");
    expect(scope(["Haute-Garonne, Occitanie"])).toBe("departement");
    expect(scope(["Occitanie"])).toBe("region");
    expect(scope(["France"])).toBe("france");
    expect(scope([])).toBe("france");
    expect(scope(["France", "Occitanie", "Toulouse"])).toBe("ville");
  });

  it("accents, casse et traits d'union indifférents (« toulouse », « Haute Garonne », « occitanie »)", () => {
    expect(scope(["toulouse"])).toBe("ville");
    expect(scope(["TOULOUSE"])).toBe("ville");
    expect(scope(["Haute Garonne"])).toBe("departement");
    expect(scope(["haute-garonne"])).toBe("departement");
    expect(scope(["occitanie"])).toBe("region");
    expect(scope(["Île-de-France"], { city: "Paris", department: departmentFromPostalCode("75011"), region: "Île-de-France" })).toBe("region");
  });

  it("une zone exclue est ignorée (France sauf Toulouse → France)", () => {
    expect(scope(["France", loc("Toulouse", true)])).toBe("france");
    expect(scope([loc("Occitanie", true), "France"])).toBe("france");
  });

  it("un nom contenu dans un autre ne compte pas : « Lyon » n'est pas dans « Villeurbanne », « Rhône » n'est pas « Auvergne-Rhône-Alpes » ni « Bouches-du-Rhône »", () => {
    expect(scope(["Villeurbanne"], lyon)).toBe("france");
    expect(scope(["Lyon, Auvergne-Rhône-Alpes"], lyon)).toBe("ville");
    expect(scope(["Auvergne-Rhône-Alpes"], lyon)).toBe("region");
    expect(scope(["Rhône, Auvergne-Rhône-Alpes"], lyon)).toBe("departement");
    expect(scope(["Bouches-du-Rhône"], lyon)).toBe("france");
  });

  it("« Loire » n'est ni « Pays de la Loire » ni « Loire-Atlantique » ; « Toulouse-le-Château » n'est pas Toulouse (commune différente → France, choix documenté)", () => {
    expect(scope(["Pays de la Loire"], saintEtienne)).toBe("france");
    expect(scope(["Loire-Atlantique"], saintEtienne)).toBe("france");
    expect(scope(["Loire, Auvergne-Rhône-Alpes"], saintEtienne)).toBe("departement");
    expect(scope(["Toulouse-le-Château"])).toBe("france");
  });

  it("ville à arrondissement ou à code (« Paris 15e », « Toulouse (31) », « 31000 Toulouse ») reconnue des deux côtés", () => {
    const paris15 = { city: "Paris 15e", department: departmentFromPostalCode("75015"), region: "Île-de-France" };
    expect(scope(["Paris, Île-de-France"], paris15)).toBe("ville");
    expect(scope(["Paris 15e"], paris15)).toBe("ville");
    expect(scope(["Toulouse"], { ...toulouse, city: "Toulouse (31)" })).toBe("ville");
    expect(scope(["31000 Toulouse"])).toBe("ville");
    expect(scope(["Toulouse 31"])).toBe("ville");
  });

  it("un autre département de la même région relève de la région (Tarn pour Toulouse, Haute-Corse pour Ajaccio) ; une autre région → France", () => {
    expect(scope(["Tarn, Occitanie"])).toBe("region");
    expect(scope(["Tarn"])).toBe("region");
    expect(scope(["Gironde"])).toBe("france");
    expect(scope(["Haute-Corse"], { city: "Ajaccio", department: departmentFromPostalCode("20000"), region: "Corse" })).toBe("region");
  });

  it("sans département ni région connus : seule la ville peut être reconnue", () => {
    const seed = { city: "Albi", department: null, region: null };
    expect(scope(["Albi"], seed)).toBe("ville");
    expect(scope(["Tarn"], seed)).toBe("france");
    expect(scope(["Occitanie"], seed)).toBe("france");
  });
});

// ─── Sélection de la veille ──────────────────────────────────────────────────

describe("selectMarketAds", () => {
  it("dédoublonne par identifiant et ignore les identifiants vides", () => {
    const { ads, counts } = selectMarketAds([record("a"), record("a", { pageName: "Doublon" }), record(""), record("b")], toulouse, now);
    expect(ads.map((a) => a.id)).toEqual(["a", "b"]);
    expect(ads[0]?.pageName).toBe("Cabinet a");
    expect(counts).toEqual({ ville: 0, departement: 0, region: 0, france: 2 });
  });

  it("3 annonces en ville → département si ≥ 8 cumulées, sinon région, sinon France ; `counts` par zone", () => {
    const ville = inZone("ville", 3);
    const dept = selectMarketAds([...ville, ...inZone("departement", 5), ...inZone("region", 2), ...inZone("france", 4)], toulouse, now);
    expect(dept.scopeUsed).toBe("departement");
    expect(dept.counts).toEqual({ ville: 3, departement: 5, region: 2, france: 4 });
    expect(dept.ads).toHaveLength(8);
    expect(dept.ads.every((a) => a.scope === "ville" || a.scope === "departement")).toBe(true);

    const region = selectMarketAds([...ville, ...inZone("departement", 2), ...inZone("region", 4), ...inZone("france", 5)], toulouse, now);
    expect(region.scopeUsed).toBe("region");
    expect(region.ads).toHaveLength(9);
    expect(region.ads.some((a) => a.scope === "france")).toBe(false);

    const france = selectMarketAds([...ville, ...inZone("departement", 1), ...inZone("region", 2), ...inZone("france", 1)], toulouse, now);
    expect(france.scopeUsed).toBe("france");
    expect(france.ads).toHaveLength(7);
  });

  it("8 annonces en ville suffisent : zone ville, sans élargissement ; `minLocal` ajustable", () => {
    const records = [...inZone("ville", META_MARKET_MIN_LOCAL), ...inZone("france", 3)];
    expect(selectMarketAds(records, toulouse, now).scopeUsed).toBe("ville");
    expect(selectMarketAds(records, toulouse, now).ads).toHaveLength(8);
    expect(selectMarketAds(inZone("ville", 2), toulouse, now, { minLocal: 2 }).scopeUsed).toBe("ville");
    expect(selectMarketAds([], toulouse, now)).toEqual({ ads: [], scopeUsed: "france", counts: { ville: 0, departement: 0, region: 0, france: 0 }, strongCounts: { ville: 0, departement: 0, region: 0, france: 0 } });
  });

  it("`strongCounts` : signaux forts par zone sur toutes les annonces repérées, même hors des annonces conservées", () => {
    const strong = { startedAt: daysAgo(60), euTotalReach: 20_000 };
    const records = [...inZone("ville", META_MARKET_MIN_LOCAL, strong), ...inZone("departement", 2, strong), ...inZone("region", 1, strong), ...inZone("france", 3)];
    const selected = selectMarketAds(records, toulouse, now);
    expect(selected.scopeUsed).toBe("ville");
    expect(selected.ads.every((a) => a.scope === "ville")).toBe(true);
    expect(selected.counts).toEqual({ ville: 8, departement: 2, region: 1, france: 3 });
    expect(selected.strongCounts).toEqual({ ville: 8, departement: 2, region: 1, france: 0 });
  });

  it("tri : zone la plus proche d'abord, puis score décroissant, puis nom de page ; `max` tronque", () => {
    const records = [
      record("f-fort", { targetLocations: [loc("France")], euTotalReach: 60_000, startedAt: daysAgo(100) }),
      record("v-faible", { targetLocations: [loc("Toulouse")], euTotalReach: 100, startedAt: daysAgo(2), pageName: "Cabinet Zen" }),
      record("v-fort", { targetLocations: [loc("Toulouse")], euTotalReach: 50_000, startedAt: daysAgo(60) }),
      record("v-faible-bis", { targetLocations: [loc("Toulouse")], euTotalReach: 100, startedAt: daysAgo(2), pageName: "Cabinet Alpha" }),
      record("d-moyen", { targetLocations: [loc("Haute-Garonne")], euTotalReach: 5_000, startedAt: daysAgo(20) }),
    ];
    const { ads, scopeUsed } = selectMarketAds(records, toulouse, now, { minLocal: 2 });
    expect(scopeUsed).toBe("ville");
    expect(ads.map((a) => a.id)).toEqual(["v-fort", "v-faible-bis", "v-faible"]);
    expect(ads[0]?.signal).toBe("fort");
    expect(ads[0]?.score).toBe(adScore(60, 50_000, true));

    const widened = selectMarketAds(records, toulouse, now, { minLocal: 4 });
    expect(widened.scopeUsed).toBe("departement");
    expect(widened.ads.map((a) => a.id)).toEqual(["v-fort", "v-faible-bis", "v-faible", "d-moyen"]);
    expect(selectMarketAds(records, toulouse, now, { minLocal: 4, max: 2 }).ads.map((a) => a.id)).toEqual(["v-fort", "v-faible-bis"]);
  });

  it("au plus META_MARKET_MAX_ADS annonces par défaut", () => {
    expect(selectMarketAds(inZone("france", META_MARKET_MAX_ADS + 10), toulouse, now).ads).toHaveLength(META_MARKET_MAX_ADS);
  });

  it("`matchedTerms` recopiés par identifiant, vide sinon ; champs calculés présents", () => {
    const { ads } = selectMarketAds([record("a", { startedAt: daysAgo(40), euTotalReach: 20_000 }), record("b", { stoppedAt: daysAgo(1) })], toulouse, now, {
      matchedTerms: { a: ["sophrologue", "sommeil"] },
    });
    const a = ads.find((x) => x.id === "a")!;
    const b = ads.find((x) => x.id === "b")!;
    expect(a.matchedTerms).toEqual(["sophrologue", "sommeil"]);
    expect(b.matchedTerms).toEqual([]);
    expect(a).toMatchObject({ scope: "france", active: true, runningDays: 40, signal: "fort" });
    expect(b).toMatchObject({ active: false, runningDays: 19, signal: "moyen" });
    expect(a.score).toBeGreaterThan(b.score);
  });
});

describe("marketScopeNote", () => {
  const market = (scopeUsed: MetaMarketScope, counts: Partial<Record<MetaMarketScope, number>>, adsCount: number) => ({
    scopeUsed,
    counts: { ville: 0, departement: 0, region: 0, france: 0, ...counts },
    ads: Array.from({ length: adsCount }, () => marketAd(scopeUsed)),
  });

  it("ville : phrase simple, sans mention d'élargissement ; singulier pour une annonce", () => {
    expect(marketScopeNote(market("ville", { ville: 9 }, 9), toulouse)).toBe("9 annonces autour de Toulouse.");
    expect(marketScopeNote(market("ville", { ville: 1 }, 1), toulouse)).toBe("1 annonce autour de Toulouse.");
  });

  it("département, région, France : formulation sans article piégé et mention de l'élargissement avec le compte près de chez vous (la ville seule quand le département est retenu)", () => {
    expect(marketScopeNote(market("departement", { ville: 3, departement: 5 }, 8), toulouse)).toBe("8 annonces dans votre département (Haute-Garonne). Peu d'annonces près de chez vous (3) : la veille a été élargie.");
    expect(marketScopeNote(market("region", { ville: 2, departement: 1, region: 6 }, 9), toulouse)).toBe("9 annonces dans votre région (Occitanie). Peu d'annonces près de chez vous (3) : la veille a été élargie.");
    expect(marketScopeNote(market("france", { france: 4 }, 4), toulouse)).toBe("4 annonces en France et dans d'autres zones. Peu d'annonces près de chez vous (0) : la veille a été élargie.");
    expect(marketScopeNote(market("region", {}, 2), { city: "Lille", department: departmentFromPostalCode("59000"), region: "Hauts-de-France" })).toContain("dans votre région (Hauts-de-France)");
  });

  it("annonces conservées sur annonces repérées quand des annonces plus lointaines ont été écartées", () => {
    expect(marketScopeNote(market("ville", { ville: 12, departement: 3, france: 5 }, 12), toulouse)).toBe("12 annonces conservées sur 20 repérées, autour de Toulouse.");
    expect(marketScopeNote(market("departement", { ville: 2, departement: 9, region: 4 }, 11), toulouse)).toBe(
      "11 annonces conservées sur 15 repérées, dans votre département (Haute-Garonne). Peu d'annonces près de chez vous (2) : la veille a été élargie.",
    );
    expect(marketScopeNote(market("ville", { ville: 1, france: 1 }, 1), toulouse)).toBe("1 annonce conservée sur 2 repérées, autour de Toulouse.");
    expect(marketNearbyCount({ scopeUsed: "departement", counts: { ville: 2, departement: 9, region: 0, france: 0 } })).toBe(2);
    expect(marketNearbyCount({ scopeUsed: "region", counts: { ville: 2, departement: 3, region: 9, france: 0 } })).toBe(5);
    expect(marketTotalCount({ ville: 2, departement: 3, region: 9, france: 1 })).toBe(15);
  });

  it("département ou région inconnus : pas de parenthèse vide", () => {
    const seed = { city: "Albi", department: null, region: null };
    expect(marketScopeNote(market("departement", {}, 0), seed)).toBe("0 annonce dans votre département. Peu d'annonces près de chez vous (0) : la veille a été élargie.");
    expect(marketScopeNote(market("region", {}, 0), seed)).toContain("0 annonce dans votre région.");
  });
});

// ─── Budget, préparation, diagnostic ─────────────────────────────────────────

describe("estimateMetaBudget", () => {
  it("forte 10 €/j (300 €/mois), moyenne 8 (240), faible 6 (180) ; minimum 5 €/j soit 150 €/mois", () => {
    expect(estimateMetaBudget("forte")).toEqual({ dailyMinEur: 5, dailyRecommendedEur: 10, monthlyMinEur: 150, monthlyRecommendedEur: 300, clicksMin: 150, clicksMax: 600, contactsMin: 4, contactsMax: 48 });
    expect(estimateMetaBudget("moyenne")).toMatchObject({ dailyRecommendedEur: 8, monthlyRecommendedEur: 240, clicksMax: 480, contactsMax: 39 });
    expect(estimateMetaBudget("faible")).toMatchObject({ dailyRecommendedEur: 6, monthlyRecommendedEur: 180, clicksMax: 360, contactsMax: 29 });
  });

  it("mensuel conseillé ≥ plancher, bornes cohérentes, jamais négatif", () => {
    for (const level of ["forte", "moyenne", "faible"] as const) {
      const b = estimateMetaBudget(level);
      expect(b.monthlyRecommendedEur).toBeGreaterThanOrEqual(META_ADS_BUDGET_EUR.monthlyFloor);
      expect(b.monthlyRecommendedEur).toBeGreaterThanOrEqual(b.monthlyMinEur);
      expect(b.dailyRecommendedEur).toBeGreaterThanOrEqual(b.dailyMinEur);
      expect(b.clicksMax).toBeGreaterThanOrEqual(b.clicksMin);
      expect(b.contactsMax).toBeGreaterThanOrEqual(b.contactsMin);
      expect(b.contactsMin).toBeGreaterThanOrEqual(0);
      expect(Object.values(b).every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
    }
  });
});

describe("metaReadinessChecks", () => {
  it("site prêt : tous les points au vert, dans l'ordre d'affichage", () => {
    const checks = metaReadinessChecks(readyInput);
    expect(checks.map((c) => c.id)).toEqual(["pixel", "cookie_banner", "facebook_page", "instagram", "booking", "phone", "photos", "reviews", "profile_linked", "landing_pages"]);
    expect(checks.every((c) => c.status === "ok")).toBe(true);
    expect(checkOf(readyInput, "photos").detail).toBe("5 photos disponibles pour vos annonces.");
    expect(checkOf(readyInput, "reviews").detail).toBe("30 avis, note 4.8 : de quoi rassurer après le clic.");
    expect(checkOf(readyInput, "landing_pages").detail).toBe("2 pages de spécialité pour accueillir les clics.");
  });

  it("le Pixel est toujours critique ; le bandeau cookies, la page Facebook, les photos ne le sont jamais", () => {
    const pixel = checkOf({ ...readyInput, hasPixel: false }, "pixel");
    expect(pixel).toMatchObject({ status: "todo", critical: true });
    expect(pixel.detail).toContain("Paramétrage & suivi");
    expect(checkOf(readyInput, "pixel").critical).toBe(true);
    expect(checkOf({ ...readyInput, cookieBanner: false }, "cookie_banner")).toMatchObject({ status: "todo", critical: false });
    expect(checkOf({ ...readyInput, facebookUrl: null }, "facebook_page")).toMatchObject({ status: "todo", critical: false });
    expect(checkOf({ ...readyInput, photosCount: 2 }, "photos")).toMatchObject({ status: "todo", critical: false });
    expect(checkOf({ ...readyInput, photosCount: 3 }, "photos").status).toBe("ok");
  });

  it("RDV et téléphone : critiques seulement quand les deux manquent", () => {
    expect(checkOf({ ...readyInput, hasBookingUrl: false }, "booking")).toMatchObject({ status: "todo", critical: false });
    expect(checkOf({ ...readyInput, hasPhone: false }, "phone")).toMatchObject({ status: "todo", critical: false });
    const none = { ...readyInput, hasBookingUrl: false, hasPhone: false };
    expect(checkOf(none, "booking")).toMatchObject({ status: "todo", critical: true });
    expect(checkOf(none, "phone")).toMatchObject({ status: "todo", critical: true });
  });

  it("Instagram inconnu sans lien ; avis inconnus sans fiche, à faire sous 10 avis ou 4,3", () => {
    expect(checkOf({ ...readyInput, instagramUrl: null }, "instagram").status).toBe("unknown");
    expect(checkOf({ ...readyInput, profile: { linked: false, rating: null, votes: null } }, "reviews").status).toBe("unknown");
    expect(checkOf({ ...readyInput, profile: { linked: true, rating: 4.9, votes: 9 } }, "reviews").status).toBe("todo");
    expect(checkOf({ ...readyInput, profile: { linked: true, rating: 4.2, votes: 40 } }, "reviews").status).toBe("todo");
    expect(checkOf({ ...readyInput, profile: { linked: true, rating: 4.3, votes: 10 } }, "reviews").status).toBe("ok");
    expect(checkOf({ ...readyInput, profile: { linked: false, rating: 4.9, votes: 50 } }, "profile_linked").status).toBe("todo");
    expect(checkOf({ ...readyInput, motifPages: 0 }, "landing_pages").status).toBe("todo");
    expect(checkOf({ ...readyInput, motifPages: 1 }, "landing_pages").detail).toBe("1 page de spécialité pour accueillir les clics.");
  });
});

describe("diagnoseMetaAds", () => {
  it("sans Pixel → wait, le Pixel en tête des prérequis, score −20", () => {
    const d = diagnoseMetaAds({ ...readyInput, hasPixel: false }, now);
    expect(d.verdict).toBe("wait");
    expect(d.headline).toContain("installez le Pixel");
    expect(d.prerequisites[0]).toBe("Pixel Meta installé sur le site");
    expect(d.score).toBe(80);
    expect(d.generatedAt).toBe(now.toISOString());
  });

  it("Pixel en place mais un point mineur à faire → go_with_prerequisites, score −8 par point", () => {
    const d = diagnoseMetaAds({ ...readyInput, photosCount: 1 }, now);
    expect(d.verdict).toBe("go_with_prerequisites");
    expect(d.prerequisites).toEqual(["Photos pour les visuels"]);
    expect(d.score).toBe(92);
    expect(diagnoseMetaAds({ ...readyInput, photosCount: 1, facebookUrl: null }, now).score).toBe(84);
  });

  it("tout en place → go ; un point inconnu ne bloque pas (−3) ; l'affinité pèse (moyenne −5, faible −15) ; score borné", () => {
    const go = diagnoseMetaAds(readyInput, now);
    expect(go).toMatchObject({ verdict: "go", score: 100, prerequisites: [], headline: "Meta Ads est pertinent pour votre cabinet" });
    expect(go.affinity.level).toBe("forte");
    expect(diagnoseMetaAds({ ...readyInput, instagramUrl: null }, now)).toMatchObject({ verdict: "go", score: 97 });
    expect(diagnoseMetaAds({ ...readyInput, profession: "Ostéopathe" }, now).score).toBe(95);
    const worst = diagnoseMetaAds(
      { ...readyInput, profession: "Ostéopathe", hasPixel: false, hasBookingUrl: false, hasPhone: false, cookieBanner: false, photosCount: 0, facebookUrl: null, instagramUrl: null, motifPages: 0, profile: { linked: false, rating: null, votes: null } },
      now,
    );
    expect(worst.verdict).toBe("wait");
    expect(worst.score).toBe(0);
    expect(worst.prerequisites.slice(0, 3)).toEqual(["Pixel Meta installé sur le site", "Prise de rendez-vous en ligne", "Numéro de téléphone affiché"]);
  });

  it("budget et résumé : chiffres entiers, formulation française, jamais « NaN » ni « undefined »", () => {
    const d = diagnoseMetaAds(readyInput, now);
    expect(d.budget).toEqual(estimateMetaBudget("forte"));
    expect(d.summary).toContain("Budget conseillé : 10 € par jour (300 € par mois, 150 € au minimum), soit 150–600 visites et 4–48 prises de contact attendues");
    for (const level of ["Sophrologue", "Ostéopathe", "Praticien en lithothérapie"]) {
      const s = diagnoseMetaAds({ ...readyInput, profession: level }, now).summary;
      expect(s).not.toMatch(/NaN|undefined|null/);
    }
    expect(d.marketNote).toBeNull();
  });

  it("marketNote : aucune annonce locale → place libre ; moins de 8 → concurrence faible ; 8 et plus → marché actif, avec les signaux forts locaux", () => {
    const market = (ville: number, departement: number, ads: MetaMarketAd[]) => ({ ...readyInput, market: { scopeUsed: "ville" as const, counts: { ville, departement, region: 0, france: 0 }, ads } });
    expect(diagnoseMetaAds(market(0, 0, []), now).marketNote).toContain("Aucune annonce repérée près de chez vous");
    expect(diagnoseMetaAds(market(1, 0, [marketAd("ville")]), now).marketNote).toBe("1 annonce près de chez vous : concurrence publicitaire faible, de la place à prendre.");
    expect(diagnoseMetaAds(market(2, 3, []), now).marketNote).toBe("5 annonces près de chez vous : concurrence publicitaire faible, de la place à prendre.");
    expect(diagnoseMetaAds(market(5, 4, [marketAd("ville", "moyen")]), now).marketNote).toBe("9 annonces près de chez vous : le marché local est actif, vos visuels devront se démarquer.");
    expect(diagnoseMetaAds(market(5, 4, [marketAd("ville", "fort"), marketAd("departement", "fort"), marketAd("ville", "moyen")]), now).marketNote).toBe(
      "9 annonces près de chez vous, dont 2 diffusées depuis longtemps avec une large portée : le marché local est actif, vos visuels devront se démarquer.",
    );
    expect(diagnoseMetaAds(market(5, 3, [marketAd("ville", "fort")]), now).marketNote).toContain("dont 1 diffusée depuis longtemps");
  });

  it("marketNote : les signaux forts venus de l'élargissement (région, France) ne comptent pas comme locaux", () => {
    const input = { ...readyInput, market: { scopeUsed: "region" as const, counts: { ville: 4, departement: 4, region: 3, france: 0 }, ads: [marketAd("region", "fort"), marketAd("france", "fort")] } };
    expect(diagnoseMetaAds(input, now).marketNote).toBe("8 annonces près de chez vous : le marché local est actif, vos visuels devront se démarquer.");
    expect(diagnoseMetaAds({ ...input, market: { ...input.market, strongCounts: { ville: 0, departement: 0, region: 1, france: 1 } } }, now).marketNote).toBe(
      "8 annonces près de chez vous : le marché local est actif, vos visuels devront se démarquer.",
    );
  });

  it("marketNote : avec `strongCounts`, les signaux forts se comptent sur toutes les annonces repérées (ville + département), pas seulement sur celles conservées", () => {
    // Zone ville retenue : les annonces du département ne sont pas conservées dans `ads`, mais comptent comme locales
    const input = {
      ...readyInput,
      market: { scopeUsed: "ville" as const, counts: { ville: 8, departement: 4, region: 0, france: 2 }, strongCounts: { ville: 1, departement: 2, region: 0, france: 1 }, ads: [marketAd("ville", "fort")] },
    };
    expect(diagnoseMetaAds(input, now).marketNote).toBe("12 annonces près de chez vous, dont 3 diffusées depuis longtemps avec une large portée : le marché local est actif, vos visuels devront se démarquer.");
  });
});

// ─── Conformité Meta ─────────────────────────────────────────────────────────

describe("metaPersonalAttributeViolations", () => {
  it("affirmer l'état du lecteur : « Vous souffrez de stress ? », « Vous avez mal au dos ? », « Tu n’en peux plus ? »", () => {
    expect(metaPersonalAttributeViolations("Vous souffrez de stress ?")).toHaveLength(1);
    expect(metaPersonalAttributeViolations("Vous avez mal au dos ?")[0]).toContain("vous souffrez");
    expect(metaPersonalAttributeViolations("Vous n’arrivez plus à dormir ?")).toHaveLength(1);
    expect(metaPersonalAttributeViolations("Vous n'en pouvez plus ?")).toHaveLength(1);
    expect(metaPersonalAttributeViolations("Tu n’en peux plus ?")).toHaveLength(1);
  });

  it("« vous êtes / vous vous sentez stressé·e, fatigué·e, en surpoids », avec ou sans accent", () => {
    expect(metaPersonalAttributeViolations("Vous êtes stressée en ce moment ?")).toHaveLength(1);
    expect(metaPersonalAttributeViolations("vous etes fatigué")).toHaveLength(1);
    expect(metaPersonalAttributeViolations("Vous vous sentez épuisé ?")).toHaveLength(1);
    expect(metaPersonalAttributeViolations("Tu es en surpoids ?")).toHaveLength(1);
    expect(metaPersonalAttributeViolations("Vous êtes les bienvenus au cabinet.")).toEqual([]);
  });

  it("« votre anxiété », « vos douleurs », « votre poids santé » (le poids du lecteur reste un attribut personnel, même « santé »)", () => {
    expect(metaPersonalAttributeViolations("Votre anxiété n'est pas une fatalité")).toHaveLength(1);
    expect(metaPersonalAttributeViolations("Soulagez vos douleurs")).toHaveLength(1);
    expect(metaPersonalAttributeViolations("Perdez vos kilos en trop")).toHaveLength(1);
    expect(metaPersonalAttributeViolations("Retrouvez votre poids santé")).toHaveLength(1);
    expect(metaPersonalAttributeViolations("ton stress, ta douleur")).toHaveLength(1);
    expect(metaPersonalAttributeViolations("Votre première séance est offerte")).toEqual([]);
  });

  it("avant / après sous toutes ses formes", () => {
    for (const text of ["Résultats avant / après", "avant/après", "Avant – après", "avant et après la séance"]) {
      expect(metaPersonalAttributeViolations(text), text).toEqual(["avant / après"]);
    }
    expect(metaPersonalAttributeViolations("Avant la séance, après le travail")).toEqual([]);
  });

  it("« si vous avez » n'est une violation que suivi d'un état de santé : « envie de souffler » ou « des questions » passent", () => {
    expect(metaPersonalAttributeViolations("Si vous avez envie de souffler, le cabinet est ouvert le samedi.")).toEqual([]);
    expect(metaPersonalAttributeViolations("Si vous avez des questions, écrivez-nous.")).toEqual([]);
    expect(metaPersonalAttributeViolations("Si vous avez besoin d'une pause")).toEqual([]);
    expect(metaPersonalAttributeViolations("Si vous souffrez de migraines")).toContain("diagnostic implicite : « si vous souffrez de / si vous avez mal »");
    expect(metaPersonalAttributeViolations("Si vous avez des douleurs au dos")).toHaveLength(1);
    // « si tu as du mal à » cumule le diagnostic implicite et l'attribut « vous avez du mal à »
    expect(metaPersonalAttributeViolations("Si tu as du mal à dormir")).toEqual([
      "diagnostic implicite : « si vous souffrez de / si vous avez mal »",
      "attribut personnel : « vous dormez mal / vous avez du mal à »",
    ]);
    // « si vous avez mal » cumule l'attribut (« vous avez mal ») et le diagnostic implicite.
    expect(metaPersonalAttributeViolations("si vous avez mal")).toEqual([
      "attribut personnel : « vous souffrez / vous avez mal / vous n'en pouvez plus »",
      "diagnostic implicite : « si vous souffrez de / si vous avez mal »",
    ]);
  });

  it("« vous dormez mal », « vous avez du mal à », « marre du stress », « trop de stress », adjectif d'état posé en question", () => {
    const flagged = ["Vous dormez mal ?", "Vous avez du mal à dormir ?", "Tu dors mal ces temps-ci ?", "Stressé·e ?", "Stressés ?", "Fatigué(e) ?", "Marre du stress ?", "Trop de stress au travail ?", "Assez des douleurs ?", "Épuisé·e par le travail ?", "Anxieux de nature ?", "Un temps pour vous. Déprimé·e ?"];
    for (const text of flagged) {
      const rules = metaPersonalAttributeViolations(text);
      expect(rules.length, text).toBeGreaterThanOrEqual(1);
      expect(rules.every((r) => r.startsWith("attribut personnel")), text).toBe(true);
    }
    expect(metaPersonalAttributeViolations("Vous dormez mal ?")).toEqual(["attribut personnel : « vous dormez mal / vous avez du mal à »"]);
    expect(metaPersonalAttributeViolations("Marre du stress ?")).toEqual(["attribut personnel : « marre du stress / trop de fatigue / assez des douleurs »"]);
    expect(metaPersonalAttributeViolations("Stressé·e ?")).toEqual(["attribut personnel : « Stressé·e ? », « Épuisé·e par le travail ? »"]);
  });

  it("formulations conformes : rien", () => {
    for (const text of [
      "Un accompagnement pour retrouver la sérénité",
      "Stress, sommeil, confiance : des séances pour souffler",
      "Première séance découverte au cabinet",
      "Un accompagnement pour mieux dormir",
      "Retrouver un sommeil apaisé",
      "Stress : comment souffler ?",
      "Fatigue et sommeil : que faire ?",
      "Le stress, parlons-en ?",
      "Trop de bruit autour ? Un cadre calme.",
      "Envie d'essayer ?",
      "",
    ]) {
      expect(metaPersonalAttributeViolations(text), text).toEqual([]);
    }
  });

  it("un texte peut cumuler plusieurs règles ; chaque règle a un libellé", () => {
    const rules = metaPersonalAttributeViolations("Vous souffrez de votre stress ? Voyez l'avant/après.");
    expect(rules).toHaveLength(3);
    expect(new Set(rules).size).toBe(3);
    expect(META_PERSONAL_ATTRIBUTE_PATTERNS.every((p) => p.rule.length > 0 && !p.pattern.global)).toBe(true);
  });
});

describe("clampMetaText", () => {
  it("texte court : espaces repliés, inchangé sinon", () => {
    expect(clampMetaText("  Une   séance\npour souffler ", 40)).toBe("Une séance pour souffler");
    expect(clampMetaText("Sophrologie", 11)).toBe("Sophrologie");
  });

  it("coupe sur un mot et retire la ponctuation pendante", () => {
    expect(clampMetaText("Une séance pour souffler, respirer et repartir", 26)).toBe("Une séance pour souffler");
    expect(clampMetaText("Une séance pour souffler, respirer et repartir", 25)).toBe("Une séance pour");
    expect(clampMetaText("Respirer (enfin) et repartir", 10)).toBe("Respirer");
    expect(clampMetaText("Dites « oui » à la pause", 8)).toBe("Dites");
    expect(clampMetaText("Stress : sommeil et confiance", 9)).toBe("Stress");
  });

  it("coupe sur un tiret quand il est plus proche de la limite", () => {
    expect(clampMetaText("Massage bien-être à domicile", 14)).toBe("Massage bien");
    expect(clampMetaText("Rendez-vous en ligne", 7)).toBe("Rendez");
  });

  it("sans coupure propre assez loin (< 60 % de la limite) : coupe franche ; jamais plus long que `max`", () => {
    expect(clampMetaText("Sophrologie", 6)).toBe("Sophro");
    expect(clampMetaText("Un accompagnement", 10)).toBe("Un accompa");
    const text = "Séance découverte de sophrologie à Toulouse — respirer, relâcher, repartir ; sans promesse de résultat";
    for (const max of [0, 1, 5, 12, 30, 40, 80]) {
      expect(clampMetaText(text, max).length, `max ${max}`).toBeLessThanOrEqual(max);
      expect(clampMetaText(text, max)).not.toMatch(/[\s,;:(«\-–—]$/);
    }
  });
});

// ─── Contrats des générateurs ────────────────────────────────────────────────

describe("metaCreativeIssues", () => {
  it("jeu conforme → aucun écart (avec ou sans liste de pages)", () => {
    expect(metaCreativeIssues(creativeSet(validCreatives), landingPaths)).toEqual([]);
    expect(metaCreativeIssues(creativeSet(validCreatives))).toEqual([]);
    expect(metaCreativeIssues(creativeSet([...validCreatives, creative("c4", "temoignage"), creative("c5", "saisonnier")]), landingPaths)).toEqual([]);
  });

  it("2 créas ou 6 créas → écart de nombre", () => {
    expect(metaCreativeIssues(creativeSet(validCreatives.slice(0, 2)), landingPaths)).toEqual(["2 créas (attendu 3 à 5)"]);
    const six = [...validCreatives, creative("c4", "temoignage"), creative("c5", "saisonnier"), creative("c6", "decouverte")];
    expect(metaCreativeIssues(creativeSet(six), landingPaths)).toEqual(["6 créas (attendu 3 à 5)"]);
  });

  it("longueurs : titre > 40, description > 30, accroche > 40 ou vide, ligne secondaire > 80, texte principal vide ou > 2 200", () => {
    const long = (n: number) => "a".repeat(n);
    const set = creativeSet([
      creative("c1", "reassurance", { headline: long(META_ADS_TEXT.headlineMax + 1) }),
      creative("c2", "education", { description: long(META_ADS_TEXT.descriptionMax + 1), hook: "" }),
      creative("c3", "local", { subline: long(META_ADS_TEXT.sublineMax + 1), primaryText: "   " }),
    ]);
    expect(metaCreativeIssues(set, landingPaths)).toEqual([
      "créa 1 (Créa c1) : titre vide ou > 40",
      "créa 2 (Créa c2) : description > 30",
      "créa 2 (Créa c2) : accroche vide ou > 40",
      "créa 3 (Créa c3) : texte principal vide ou trop long",
      "créa 3 (Créa c3) : ligne secondaire > 80",
    ]);
    expect(metaCreativeIssues(creativeSet([creative("c1", "reassurance", { headline: long(40), description: long(30), hook: long(40), subline: long(80) }), validCreatives[1]!, validCreatives[2]!]), landingPaths)).toEqual([]);
    expect(metaCreativeIssues(creativeSet([creative("c1", "reassurance", { primaryText: long(META_ADS_TEXT.primaryMax + 1) }), validCreatives[1]!, validCreatives[2]!]))).toEqual(["créa 1 (Créa c1) : texte principal vide ou trop long"]);
  });

  it("identifiant en double, angle ou bouton inconnus, angle repété", () => {
    const set = creativeSet([creative("c1", "reassurance"), creative("c1", "education"), creative("c3", "inconnu" as MetaAdCreative["angle"], { cta: "SHOP_NOW" as MetaAdCreative["cta"] })]);
    expect(metaCreativeIssues(set, landingPaths)).toEqual(["créa 2 (Créa c1) : identifiant en double", "créa 3 (Créa c3) : angle inconnu", "créa 3 (Créa c3) : bouton inconnu"]);
    const repeated = creativeSet([creative("c1", "reassurance"), creative("c2", "reassurance"), creative("c3", "local")]);
    expect(metaCreativeIssues(repeated, landingPaths)).toEqual(["créa 2 (Créa c2) : angle déjà utilisé par une autre créa"]);
  });

  it("page d'atterrissage : invalide sans « / », inconnue hors de la liste fournie", () => {
    const set = creativeSet([creative("c1", "reassurance", { landingPath: "stress" }), creative("c2", "education", { landingPath: "/inconnue" }), creative("c3", "local")]);
    expect(metaCreativeIssues(set, landingPaths)).toEqual(["créa 1 (Créa c1) : page d'atterrissage invalide", "créa 1 (Créa c1) : page d'atterrissage inconnue", "créa 2 (Créa c2) : page d'atterrissage inconnue"]);
    expect(metaCreativeIssues(set)).toEqual(["créa 1 (Créa c1) : page d'atterrissage invalide"]);
  });

  it("violation d'attribut personnel dans n'importe quel champ texte", () => {
    const set = creativeSet([creative("c1", "reassurance", { primaryText: "Vous souffrez de stress ? Venez souffler." }), creative("c2", "education", { subline: "Votre anxiété, on en parle" }), creative("c3", "local")]);
    const issues = metaCreativeIssues(set, landingPaths);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/^créa 1 \(Créa c1\) : attribut personnel/);
    expect(issues[1]).toMatch(/^créa 2 \(Créa c2\) : attribut personnel/);
  });

  it("gardes de type des angles et boutons", () => {
    expect(isMetaAdsAngle("reassurance")).toBe(true);
    expect(isMetaAdsAngle("promo")).toBe(false);
    expect(isMetaAdsCta("BOOK_NOW")).toBe(true);
    expect(isMetaAdsCta("SHOP_NOW")).toBe(false);
    expect(isMetaAdsCta(null)).toBe(false);
  });
});

describe("metaVideoPlanIssues", () => {
  it("plan conforme → aucun écart ; aucune vidéo → écart ; META_VIDEO.count vidéos exigées", () => {
    expect(metaVideoPlanIssues(videoPlan([video("v1"), video("v2"), video("v3")]))).toEqual([]);
    expect(metaVideoPlanIssues(videoPlan([]))).toEqual(["aucune vidéo"]);
    expect(metaVideoPlanIssues(videoPlan([video("v1")]))).toEqual(["1 vidéo (attendu 3)"]);
    expect(metaVideoPlanIssues(videoPlan([video("v1"), video("v2"), video("v3"), video("v4")]))).toEqual(["4 vidéos (attendu 3)"]);
  });

  it("identifiant en double, format autre que 9:16", () => {
    expect(metaVideoPlanIssues(videoPlan([video("v1"), video("v1"), video("v3", { format: "16:9" as MetaVideoBrief["format"] })]))).toEqual([
      "vidéo 2 (Vidéo v1) : identifiant en double",
      "vidéo 3 (Vidéo v3) : format 16:9 (attendu 9:16)",
    ]);
  });

  it("durée hors 15–45 s, moins de 3 temps, accroche vide, bouton inconnu", () => {
    const shortBeats = video("x").beats.map((b, i) => ({ ...b, at: i * 3 }));
    const issues = metaVideoPlanIssues(videoPlan([video("v1", { durationSeconds: 10, beats: shortBeats }), video("v2", { durationSeconds: 46, beats: video("x").beats.slice(0, 2) }), video("v3", { hook: "  ", cta: "SHOP_NOW" as MetaVideoBrief["cta"] })]));
    expect(issues).toEqual([
      "vidéo 1 (Vidéo v1) : durée hors 15–45 s",
      "vidéo 2 (Vidéo v2) : durée hors 15–45 s",
      "vidéo 2 (Vidéo v2) : moins de 3 temps",
      "vidéo 3 (Vidéo v3) : accroche vide",
      "vidéo 3 (Vidéo v3) : bouton inconnu",
    ]);
    expect(metaVideoPlanIssues(videoPlan([video("v1", { durationSeconds: 15, beats: shortBeats }), video("v2", { durationSeconds: 45 }), video("v3")]))).toEqual([]);
  });

  it("temps forts : seconde hors durée, texte à l'écran > 60", () => {
    const beats = [...video("x").beats];
    beats[2] = { ...beats[2]!, at: 31, onScreen: "x".repeat(61) };
    expect(metaVideoPlanIssues(videoPlan([video("v1", { beats }), video("v2"), video("v3")]))).toEqual(["vidéo 1 (Vidéo v1), temps 3 : seconde hors durée", "vidéo 1 (Vidéo v1), temps 3 : texte à l'écran > 60"]);
    expect(metaVideoPlanIssues(videoPlan([video("v1", { beats: [{ ...beats[0]!, at: -1 }, beats[1]!, { ...beats[2]!, at: 30, onScreen: "x".repeat(60) }] }), video("v2"), video("v3")]))).toEqual(["vidéo 1 (Vidéo v1), temps 1 : seconde hors durée"]);
  });

  it("violation d'attribut personnel dans l'accroche, le texte à coller, les paroles ou le texte à l'écran", () => {
    const beats = [...video("x").beats];
    beats[1] = { ...beats[1]!, say: "Si vous souffrez de stress…" };
    const issues = metaVideoPlanIssues(videoPlan([video("v1", { caption: "Résultats avant / après" }), video("v2", { beats }), video("v3")]));
    expect(issues).toEqual([
      "vidéo 1 (Vidéo v1) : avant / après",
      "vidéo 2 (Vidéo v2) : attribut personnel : « vous souffrez / vous avez mal / vous n'en pouvez plus »",
      "vidéo 2 (Vidéo v2) : diagnostic implicite : « si vous souffrez de / si vous avez mal »",
    ]);
  });
});

describe("metaPlanIssues", () => {
  it("plan conforme → aucun écart : conversions avec le Pixel, trafic sans", () => {
    expect(metaPlanIssues(plan(), true)).toEqual([]);
    expect(metaPlanIssues(plan({ objective: { type: "traffic", pixelEvent: "Contact", rationale: "Installez le Pixel…" } }), false)).toEqual([]);
    expect(metaPlanIssues(plan({ campaign: { ...plan().campaign, landingSuffix: "?src=meta" } }), true)).toEqual([]);
  });

  it("Pixel installé mais objectif trafic → écart ; conversions sans Pixel → écart", () => {
    expect(metaPlanIssues(plan({ objective: { type: "traffic", pixelEvent: "Schedule", rationale: "" } }), true)).toEqual(["objectif : le Pixel est installé, l'objectif doit être les conversions sur le site"]);
    expect(metaPlanIssues(plan(), false)).toEqual(["objectif : sans Pixel, les conversions sur le site ne peuvent pas être mesurées (repli trafic attendu)"]);
  });

  it("événement Pixel inconnu, aucun ensemble, budget hors bornes (5 à 40 €/j), tranche d'âge invalide, moins de 3 jalons", () => {
    const broken = plan({
      objective: { type: "conversions_site", pixelEvent: "Purchase" as MetaAdsPlan["objective"]["pixelEvent"], rationale: "" },
      adSets: [],
      budget: { dailyEur: 4, monthlyEur: 120, testPlan: "" },
      campaign: { ...plan().campaign, ages: { min: 16, max: 55 } },
      milestones: plan().milestones.slice(0, 2),
    });
    expect(metaPlanIssues(broken, true)).toEqual(["événement Pixel inconnu", "aucun ensemble de publicités", "budget quotidien hors bornes", "tranche d'âge invalide", "moins de 3 jalons"]);
    expect(metaPlanIssues(plan({ budget: { dailyEur: 41, monthlyEur: 1_230, testPlan: "" } }), true)).toEqual(["budget quotidien hors bornes"]);
    expect(metaPlanIssues(plan({ budget: { dailyEur: 40, monthlyEur: 1_200, testPlan: "" } }), true)).toEqual([]);
    expect(metaPlanIssues(plan({ campaign: { ...plan().campaign, ages: { min: 25, max: 66 } } }), true)).toEqual(["tranche d'âge invalide"]);
    expect(metaPlanIssues(plan({ campaign: { ...plan().campaign, ages: { min: 40, max: 40 } } }), true)).toEqual(["tranche d'âge invalide"]);
    expect(metaPlanIssues(plan({ campaign: { ...plan().campaign, ages: { min: 18, max: 65 } } }), true)).toEqual([]);
  });
});

// ─── Mesure ──────────────────────────────────────────────────────────────────

describe("isMetaAdsLanding", () => {
  it("fbclid seul ne vaut pas « annonce » : Facebook l'ajoute à tout lien sortant, organique compris", () => {
    expect(isMetaAdsLanding("?fbclid=IwAR123")).toBe(false);
    expect(isMetaAdsLanding("fbclid=IwAR123&utm_source=x")).toBe(false);
    expect(isMetaAdsLanding("?fbclid")).toBe(false);
    // Un fbclid accompagné d'un UTM payant reste une annonce (c'est l'UTM qui signe)
    expect(isMetaAdsLanding("?fbclid=IwAR123&utm_source=facebook&utm_medium=paid")).toBe(true);
  });

  it("UTM payant Facebook, Instagram ou Meta, insensible à la casse", () => {
    expect(isMetaAdsLanding("?utm_source=facebook&utm_medium=paid")).toBe(true);
    expect(isMetaAdsLanding("?utm_source=instagram&utm_medium=cpc")).toBe(true);
    expect(isMetaAdsLanding("?utm_source=Facebook&utm_medium=Paid_Social")).toBe(true);
    expect(isMetaAdsLanding("?utm_source=meta&utm_medium=ads")).toBe(true);
    expect(isMetaAdsLanding("?utm_source=fb&utm_medium=paidsocial")).toBe(true);
    expect(isMetaAdsLanding("?utm_source=ig&utm_medium=ppc")).toBe(true);
    expect(isMetaAdsLanding("?utm_source=fb&utm_medium=social_paid")).toBe(true);
  });

  it("publication organique, autre réseau, Google Ads, paramètre src, chaîne vide → false (le suffixe des annonces est lu avant, par `src`)", () => {
    expect(META_ADS_LANDING_SUFFIX).toBe("?src=meta");
    expect(isMetaAdsLanding("?utm_source=facebook&utm_medium=social")).toBe(false);
    expect(isMetaAdsLanding("?utm_source=facebook")).toBe(false);
    expect(isMetaAdsLanding("?utm_medium=cpc")).toBe(false);
    expect(isMetaAdsLanding("?utm_source=linkedin&utm_medium=cpc")).toBe(false);
    expect(isMetaAdsLanding("?src=ig")).toBe(false);
    expect(isMetaAdsLanding("?src=meta")).toBe(false);
    expect(isMetaAdsLanding("?gclid=abc")).toBe(false);
    expect(isMetaAdsLanding("")).toBe(false);
    expect(isMetaAdsLanding("?")).toBe(false);
  });
});

describe("metaLibraryUrl et constantes", () => {
  it("lien public de la bibliothèque, identifiant encodé", () => {
    expect(metaLibraryUrl("123456")).toBe("https://www.facebook.com/ads/library/?id=123456");
    expect(metaLibraryUrl("a b&c")).toBe("https://www.facebook.com/ads/library/?id=a%20b%26c");
  });

  it("les zones de la veille vont du plus étroit au plus large ; « france » regroupe aussi les autres zones", () => {
    expect(META_MARKET_SCOPES).toEqual(["ville", "departement", "region", "france"]);
    expect(META_MARKET_SCOPE_LABELS.france).toBe("Autres zones et France");
  });
});
