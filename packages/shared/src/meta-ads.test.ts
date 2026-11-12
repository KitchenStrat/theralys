import { describe, expect, it } from "vitest";
import {
  FR_DEPARTMENTS,
  FR_FORMER_REGIONS,
  FR_REGION_CODES,
  META_ADS_BUDGET_EUR,
  META_ADS_LANDING_SUFFIX,
  META_ADS_TEXT,
  META_AROUND_RADIUS_KM,
  META_LIBRARY_TERMS_MAX,
  META_LIBRARY_TERM_MAX,
  META_MARKET_MAX_ADS,
  META_MARKET_MAX_PER_PAGE,
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
  buildMetaLocalIndex,
  buildMetaSearchTerms,
  buildMetaSeed,
  clampMetaText,
  departmentFromPostalCode,
  diagnoseMetaAds,
  estimateMetaBudget,
  isMetaAdsAngle,
  isMetaAdsCta,
  isMetaAdsLanding,
  marketNearCount,
  marketNearbyCount,
  marketScopeNote,
  marketTotalCount,
  metaCreativeIssues,
  metaLibraryUrl,
  metaPageKey,
  metaPersonalAttributeViolations,
  metaPlanIssues,
  metaProfessionAffinity,
  metaReadinessChecks,
  metaVideoPlanIssues,
  postalCodeFrom,
  scopeOfAd,
  selectMarketAds,
  specialtyKeyword,
  type MetaAdCreative,
  type MetaAdLocation,
  type MetaAdRecord,
  type MetaAdsCreativeSet,
  type MetaAdsDiagnosticInput,
  type MetaAdsPlan,
  type MetaAdsSeed,
  type MetaAdsVideoPlan,
  type MetaLocalIndex,
  type MetaMarketAd,
  type MetaMarketScope,
  type MetaVideoBrief,
} from "./meta-ads";
import { EXTERNAL_SITE_CHECK_DETAILS } from "./google-ads";

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

/** Graine de zone avec code postal (codes postaux ciblés, index des communes). */
type ScopeSeed = Parameters<typeof scopeOfAd>[1];
const marne = departmentFromPostalCode("51100")!;
const reims: ScopeSeed = { city: "Reims", department: marne, region: "Grand Est", postalCode: "51100" };

function loc(name: string, excluded = false): MetaAdLocation {
  return { name, type: null, excluded };
}

/** Zone ciblée avec son type de la bibliothèque (`CITY`, `zips`, `regions`, `countries`…). */
function zone(name: string, type: string, excluded = false): MetaAdLocation {
  return { name, type, excluded };
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

describe("FR_REGION_CODES / FR_FORMER_REGIONS", () => {
  const overseas = ["Guadeloupe", "Martinique", "Guyane", "La Réunion", "Mayotte"];

  it("18 régions : 13 métropolitaines et 5 d'outre-mer, codes INSEE à deux chiffres, tous différents", () => {
    const names = Object.keys(FR_REGION_CODES);
    expect(names).toHaveLength(18);
    expect(overseas.every((name) => names.includes(name))).toBe(true);
    expect(names.filter((name) => !overseas.includes(name))).toHaveLength(13);
    const codes = Object.values(FR_REGION_CODES);
    expect(codes.every((code) => /^\d{2}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBe(18);
    expect(FR_REGION_CODES["Île-de-France"]).toBe("11");
    expect(FR_REGION_CODES["Grand Est"]).toBe("44");
    expect(FR_REGION_CODES["Occitanie"]).toBe("76");
    expect(FR_REGION_CODES["Auvergne-Rhône-Alpes"]).toBe("84");
    expect(FR_REGION_CODES["Corse"]).toBe("94");
    expect(FR_REGION_CODES["La Réunion"]).toBe("04");
  });

  it("chaque région de FR_DEPARTMENTS a son code, et chaque code a au moins un département", () => {
    const regions = new Set(FR_DEPARTMENTS.map((d) => d.region));
    expect(regions.size).toBe(18);
    for (const region of regions) expect(FR_REGION_CODES[region], region).toBeDefined();
    for (const name of Object.keys(FR_REGION_CODES)) expect(regions.has(name), name).toBe(true);
  });

  it("anciennes régions : chacune renvoie à une région actuelle de métropole, aucune n'est elle-même une région actuelle", () => {
    const former = Object.entries(FR_FORMER_REGIONS);
    expect(former).toHaveLength(17);
    for (const [name, current] of former) {
      expect(FR_REGION_CODES[current], `${name} → ${current}`).toBeDefined();
      expect(overseas, name).not.toContain(current);
      expect(FR_REGION_CODES[name], name).toBeUndefined();
    }
    expect(FR_FORMER_REGIONS["Rhône-Alpes"]).toBe("Auvergne-Rhône-Alpes");
    expect(FR_FORMER_REGIONS["Auvergne"]).toBe("Auvergne-Rhône-Alpes");
    expect(FR_FORMER_REGIONS["Midi-Pyrénées"]).toBe("Occitanie");
    expect(FR_FORMER_REGIONS["Languedoc-Roussillon"]).toBe("Occitanie");
    expect(FR_FORMER_REGIONS["Champagne-Ardenne"]).toBe("Grand Est");
    expect(FR_FORMER_REGIONS["Centre"]).toBe("Centre-Val de Loire");
  });
});

// ─── Graine ──────────────────────────────────────────────────────────────────

describe("buildMetaSearchTerms", () => {
  /** Graine complète : ville, villes voisines, spécialités et concurrents. */
  const reimsOsteo = {
    profession: "Ostéopathe",
    city: "Reims",
    nearbyCities: ["Châlons-en-Champagne", "Épernay", "Vitry-le-François"],
    specialties: ["Accompagnement du nourrisson", "Ostéopathie du sport", "Femme enceinte"],
    competitorNames: ["Cabinet Durand", "Cabinet Zen"],
  };

  it("ordre de priorité : métier, métier + ville, synonyme, synonyme + ville, puis villes voisines et spécialités en alternance, un seul concurrent, la troisième ville voisine en dernier", () => {
    expect(buildMetaSearchTerms(reimsOsteo, 20)).toEqual([
      "ostéopathe",
      "ostéopathe reims",
      "ostéopathie",
      "ostéopathie reims",
      "ostéopathe châlons-en-champagne",
      "ostéopathe nourrisson",
      "ostéopathe épernay",
      "ostéopathe sport",
      "cabinet durand",
      "ostéopathe vitry-le-françois",
    ]);
  });

  it("sans ville ni ville voisine : métier et synonyme, puis les spécialités ramenées à « métier + mot-clé » (2 au plus), puis un seul concurrent", () => {
    expect(
      buildMetaSearchTerms({
        profession: "Sophrologue",
        specialties: ["Sophrologie et gestion du stress", "Sommeil", "Confiance en soi (adultes)"],
        competitorNames: ["Cabinet Zen Toulouse", "Léa Dupont"],
      }),
    ).toEqual(["sophrologue", "sophrologie", "sophrologue stress", "sophrologue sommeil", "cabinet zen toulouse"]);
  });

  it("au plus META_LIBRARY_TERMS_MAX termes (8) ou `max` : la coupe suit l'ordre de priorité, le concurrent saute le premier", () => {
    expect(META_LIBRARY_TERMS_MAX).toBe(8);
    const terms = buildMetaSearchTerms(reimsOsteo);
    expect(terms).toHaveLength(META_LIBRARY_TERMS_MAX);
    expect(terms).toEqual(buildMetaSearchTerms(reimsOsteo, 20).slice(0, META_LIBRARY_TERMS_MAX));
    expect(terms).not.toContain("cabinet durand");
    expect(buildMetaSearchTerms(reimsOsteo, 3)).toEqual(["ostéopathe", "ostéopathe reims", "ostéopathie"]);
    expect(buildMetaSearchTerms(reimsOsteo, 0)).toEqual([]);
    // Intitulé de deux mots : il reste en tête, suivi d'un seul nom de la famille (2 termes de base au plus)
    const seed = { profession: "Masseuse bien-être", specialties: ["Massage californien", "Massage suédois"], competitorNames: ["Spa Albi", "Institut Belle Vie"] };
    expect(buildMetaSearchTerms(seed)).toEqual(["masseuse bien-être", "massage", "masseuse bien-être californien", "masseuse bien-être suédois", "spa albi"]);
    expect(buildMetaSearchTerms(seed, 3)).toEqual(["masseuse bien-être", "massage", "masseuse bien-être californien"]);
  });

  it("une spécialité qui redit le métier est ignorée, comme les mots de moins de 3 lettres et les concurrents de moins de 4", () => {
    expect(buildMetaSearchTerms({ profession: "Sophrologue", specialties: ["Sophrologie", "sophrologue", "Dos"], competitorNames: ["Zen", "Sophrologie Toulouse"] })).toEqual([
      "sophrologue",
      "sophrologie",
      "sophrologue dos",
      "sophrologie toulouse",
    ]);
    expect(buildMetaSearchTerms({ profession: "Sophrologue", specialties: ["Do", "Qi", "Sophrologie caycédienne"], competitorNames: ["Zen"] })).toEqual(["sophrologue", "sophrologie", "sophrologue caycédienne"]);
    // « Hypnose ericksonienne » garde son mot propre ; « Hypnothérapie » seule redit le métier
    expect(buildMetaSearchTerms({ profession: "Hypnothérapeute", specialties: ["Hypnothérapie", "Hypnose ericksonienne", "Arrêt du tabac"], competitorNames: [] })).toEqual([
      "hypnothérapeute",
      "hypnose",
      "hypnothérapeute ericksonienne",
      "hypnothérapeute tabac",
    ]);
  });

  it("une spécialité qui redit le métier derrière une élision (« Séance d'hypnose ») n'ajoute aucun terme ; l'article élidé ne part jamais dans un terme", () => {
    expect(buildMetaSearchTerms({ profession: "Hypnothérapeute", specialties: ["Séance d'hypnose"], competitorNames: [] })).toEqual(["hypnothérapeute", "hypnose"]);
    expect(buildMetaSearchTerms({ profession: "Hypnothérapeute", specialties: ["Séance d’hypnose", "Gestion de l'anxiété", "Préparation à l’accouchement"], competitorNames: [] })).toEqual([
      "hypnothérapeute",
      "hypnose",
      "hypnothérapeute anxiété",
      "hypnothérapeute accouchement",
    ]);
  });

  it("ville à arrondissement ou à code (« Paris 15e », « Toulouse (31) ») : nombres et ordinaux retirés des termes, la bibliothèque exigeant tous les mots", () => {
    const seed = { profession: "Ostéopathe", specialties: [], competitorNames: [] };
    expect(buildMetaSearchTerms({ ...seed, city: "Paris 15e" })).toEqual(["ostéopathe", "ostéopathe paris", "ostéopathie", "ostéopathie paris"]);
    expect(buildMetaSearchTerms({ ...seed, city: "Toulouse (31)" })).toEqual(["ostéopathe", "ostéopathe toulouse", "ostéopathie", "ostéopathie toulouse"]);
    for (const city of ["Paris 1er", "Paris 15ème", "Paris 15eme", "75015 Paris", "Paris 75015"]) {
      expect(buildMetaSearchTerms({ ...seed, city }), city).toEqual(["ostéopathe", "ostéopathe paris", "ostéopathie", "ostéopathie paris"]);
    }
    // Villes voisines : même nettoyage, et un autre arrondissement de la ville du praticien n'est pas une ville voisine
    expect(buildMetaSearchTerms({ ...seed, city: "Paris 15e", nearbyCities: ["Paris 14e", "Boulogne-Billancourt", "Lyon 3ème", "Montreuil (93)"] })).toEqual([
      "ostéopathe",
      "ostéopathe paris",
      "ostéopathie",
      "ostéopathie paris",
      "ostéopathe boulogne-billancourt",
      "ostéopathe lyon",
      "ostéopathe montreuil",
    ]);
    // Rien que des chiffres : pas de ville, pas de terme local ; les noms composés restent entiers
    expect(buildMetaSearchTerms({ ...seed, city: "75015" })).toEqual(["ostéopathe", "ostéopathie"]);
    expect(buildMetaSearchTerms({ ...seed, city: "Saint-Étienne", nearbyCities: ["Le Puy-en-Velay"] })).toEqual([
      "ostéopathe",
      "ostéopathe saint-étienne",
      "ostéopathie",
      "ostéopathie saint-étienne",
      "ostéopathe le puy-en-velay",
    ]);
  });

  it("guillemets, crochets et parenthèses retirés des termes (ville, spécialités, concurrent), espaces repliés", () => {
    expect(buildMetaSearchTerms({ profession: "Ostéopathe", specialties: ['« Ostéopathie   du sport »', "EFT [libération émotionnelle]"], competitorNames: [] })).toEqual([
      "ostéopathe",
      "ostéopathie",
      "ostéopathe sport",
      "ostéopathe émotionnelle",
    ]);
    expect(
      buildMetaSearchTerms({ profession: "Ostéopathe", city: "  Saint-Étienne  ", nearbyCities: ["« Firminy »"], specialties: [], competitorNames: ['« Cabinet   "Zen" (Loire) »'] }),
    ).toEqual(["ostéopathe", "ostéopathe saint-étienne", "ostéopathie", "ostéopathie saint-étienne", "ostéopathe firminy", "cabinet zen loire"]);
  });

  it("dédoublonnage sans accent ni casse : « osteopathe » et « ostéopathe » ne font qu'un terme, comme les villes et les spécialités répétées", () => {
    expect(buildMetaSearchTerms({ profession: "osteopathe", specialties: [], competitorNames: [] })).toEqual(["osteopathe", "ostéopathie"]);
    expect(buildMetaSearchTerms({ profession: "OSTEOPATHE", city: "Reims", specialties: [], competitorNames: [] })).toEqual(["osteopathe", "osteopathe reims", "ostéopathie", "ostéopathie reims"]);
    const terms = buildMetaSearchTerms(
      {
        profession: "osteopathe",
        city: "Épernay",
        nearbyCities: ["Reims", "reims", "Châlons-en-Champagne"],
        specialties: ["Stress", "Gestion du stress", "Le STRESS", "Sommeil"],
        competitorNames: [],
      },
      20,
    );
    expect(terms).toEqual(["osteopathe", "osteopathe épernay", "ostéopathie", "ostéopathie épernay", "osteopathe reims", "osteopathe stress", "osteopathe châlons-en-champagne", "osteopathe sommeil"]);
    expect(terms.filter((t) => t.includes("stress"))).toHaveLength(1);
    // Un concurrent qui redit un terme déjà présent disparaît (le suivant ne le remplace pas)
    expect(buildMetaSearchTerms({ profession: "Sophrologue", city: "Toulouse", specialties: [], competitorNames: ["Sophrologue Toulouse", "Cabinet Zen"] })).toEqual([
      "sophrologue",
      "sophrologue toulouse",
      "sophrologie",
      "sophrologie toulouse",
    ]);
  });

  it("sans ville (absente, vide ou espaces) : aucun terme local, les villes voisines restent cherchées", () => {
    const seed = { profession: "Sophrologue", specialties: [], competitorNames: [] };
    for (const city of [undefined, "", "   "]) {
      expect(buildMetaSearchTerms({ ...seed, city }), JSON.stringify(city)).toEqual(["sophrologue", "sophrologie"]);
    }
    expect(buildMetaSearchTerms({ ...seed, city: "", nearbyCities: ["Colomiers"] })).toEqual(["sophrologue", "sophrologie", "sophrologue colomiers"]);
  });

  it("villes voisines : accolées au premier terme, 3 au plus, jamais la ville du praticien (accents et casse indifférents)", () => {
    const seed = { profession: "Sophrologue", city: "Épernay", specialties: [], competitorNames: [] };
    expect(buildMetaSearchTerms({ ...seed, nearbyCities: ["EPERNAY", "Epernay", "Reims", "Châlons-en-Champagne", "Vitry-le-François"] })).toEqual([
      "sophrologue",
      "sophrologue épernay",
      "sophrologie",
      "sophrologie épernay",
      "sophrologue reims",
      "sophrologue châlons-en-champagne",
      "sophrologue vitry-le-françois",
    ]);
    expect(buildMetaSearchTerms({ ...seed, nearbyCities: ["Épernay"] })).toEqual(["sophrologue", "sophrologue épernay", "sophrologie", "sophrologie épernay"]);
    expect(buildMetaSearchTerms({ ...seed, nearbyCities: [] })).toEqual(buildMetaSearchTerms(seed));
  });

  it("intitulé long (« Praticienne en massage bien-être ») : les noms courts de la famille passent devant, l'intitulé entier n'est pas cherché", () => {
    const terms = buildMetaSearchTerms({
      profession: "Praticienne en massage bien-être",
      city: "Albi",
      specialties: ["Massage", "Massage californien", "Drainage lymphatique"],
      competitorNames: ["Spa Albi"],
    });
    expect(terms).toEqual(["massage", "massage albi", "masseur", "masseur albi", "massage californien", "massage lymphatique", "spa albi"]);
    expect(terms.some((t) => t.includes("praticienne"))).toBe(false);
    // Métier d'enseignement en trois mots : mêmes règles
    expect(buildMetaSearchTerms({ profession: "Professeur de yoga", city: "Lyon", specialties: [], competitorNames: [] })).toEqual(["cours de yoga", "cours de yoga lyon", "professeur de yoga", "professeur de yoga lyon"]);
  });

  it("sans métier exploitable (vide ou moins de 3 lettres) : aucun terme, même avec une ville et un concurrent", () => {
    for (const profession of ["", "  ", "Qi"]) {
      expect(buildMetaSearchTerms({ profession, city: "Reims", specialties: ["Stress"], competitorNames: ["Cabinet Zen"] }), JSON.stringify(profession)).toEqual([]);
    }
  });

  it("chaque terme tient en META_LIBRARY_TERM_MAX caractères (coupé au mot) ; un concurrent impossible à tronquer proprement est ignoré au profit du suivant", () => {
    const longName = `${"Cabinet des Thérapies Douces et Naturelles de la Vallée ".repeat(3)}Toulouse`;
    expect(longName.length).toBeGreaterThan(META_LIBRARY_TERM_MAX);
    const terms = buildMetaSearchTerms({ profession: "Sophrologue", specialties: [], competitorNames: [longName, "x".repeat(140), "Cabinet Zen"] });
    expect(terms.every((t) => t.length <= META_LIBRARY_TERM_MAX)).toBe(true);
    const competitor = terms.find((t) => t.startsWith("cabinet des thérapies"));
    expect(competitor).toBeDefined();
    expect(competitor!.endsWith(" ")).toBe(false);
    expect(longName.toLowerCase().startsWith(competitor!)).toBe(true);
    // Un seul concurrent : le premier exploitable, tronqué au mot
    expect(terms).toEqual(["sophrologue", "sophrologie", competitor]);
    const skipped = buildMetaSearchTerms({ profession: "Sophrologue", specialties: [], competitorNames: ["x".repeat(140), "Cabinet Zen"] });
    expect(skipped.some((t) => /^x+$/.test(t))).toBe(false);
    expect(skipped).toEqual(["sophrologue", "sophrologie", "cabinet zen"]);
    // Métier et spécialité démesurés : tronqués, jamais ignorés
    const specialty = `Accompagnement ${"très ".repeat(30)}long`;
    const bounded = buildMetaSearchTerms({ profession: `Praticienne ${"bien-être ".repeat(15)}holistique`, city: "Saint-Rémy-de-Provence", specialties: [specialty], competitorNames: [] });
    expect(bounded.length).toBeGreaterThan(0);
    expect(bounded.every((t) => t.length <= META_LIBRARY_TERM_MAX && t.length >= 3)).toBe(true);
    expect(bounded.every((t) => t === t.trim())).toBe(true);
  });
});

describe("specialtyKeyword", () => {
  it("dernier mot significatif d'une spécialité : « accompagnement du nourrisson » → « nourrisson », « arrêt du tabac » → « tabac »", () => {
    expect(specialtyKeyword("accompagnement du nourrisson")).toBe("nourrisson");
    expect(specialtyKeyword("arrêt du tabac")).toBe("tabac");
    expect(specialtyKeyword("gestion du stress")).toBe("stress");
    expect(specialtyKeyword("confiance en soi")).toBe("confiance");
    expect(specialtyKeyword("Troubles du sommeil")).toBe("sommeil");
    expect(specialtyKeyword("Ostéopathie du sport")).toBe("sport");
  });

  it("mot seul, casse, accents et ponctuation : minuscules, accents gardés, parenthèses et crochets retirés", () => {
    expect(specialtyKeyword("Sommeil")).toBe("sommeil");
    expect(specialtyKeyword("  SOMMEIL  ")).toBe("sommeil");
    expect(specialtyKeyword("Maux de tête")).toBe("tête");
    expect(specialtyKeyword("Confiance en soi (adultes)")).toBe("adultes");
    expect(specialtyKeyword("EFT [libération émotionnelle]")).toBe("émotionnelle");
    expect(specialtyKeyword("Burn-out")).toBe("burn-out");
  });

  it("rien que des mots génériques, des mots de moins de 3 lettres ou une chaîne vide → null", () => {
    for (const specialty of ["Accompagnement", "Prise en charge des douleurs", "Soins", "Aide et soutien", "Suivi de séances", "de la", "Qi", "", "   "]) {
      expect(specialtyKeyword(specialty), JSON.stringify(specialty)).toBeNull();
    }
  });

  it("l'article élidé est détaché du mot : « Séance d'hypnose » → « hypnose », « Gestion de l'anxiété » → « anxiété » (apostrophe droite ou typographique)", () => {
    expect(specialtyKeyword("Séance d'hypnose")).toBe("hypnose");
    expect(specialtyKeyword("Gestion de l'anxiété")).toBe("anxiété");
    expect(specialtyKeyword("Gestion de l’anxiété")).toBe("anxiété");
    expect(specialtyKeyword("Préparation à l'accouchement")).toBe("accouchement");
    expect(specialtyKeyword("Troubles de l'enfant et de l'adolescent")).toBe("adolescent");
    // L'article seul ne fait pas un mot-clé ; le trait d'union ne coupe pas
    expect(specialtyKeyword("L'")).toBeNull();
    expect(specialtyKeyword("Soin d'un")).toBeNull();
    expect(specialtyKeyword("Burn-out")).toBe("burn-out");
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
    expect(seed.searchTerms).toEqual(["ostéopathe", "ostéopathe albi", "ostéopathie", "ostéopathie albi"]);
    expect(buildMetaSeed({ profession: "Ostéopathe", city: "Albi", address: "Rue de la Paix, Albi", specialties: [], competitorNames: [] }).department).toBeNull();
  });

  it("villes voisines nettoyées, sans doublon ni vide, 4 au plus ; les termes écartent la ville du praticien ; champ absent sans ville voisine", () => {
    const seed = buildMetaSeed({
      profession: "Ostéopathe",
      city: "Reims",
      address: "12 rue de Vesle, 51100 Reims",
      specialties: ["Accompagnement du nourrisson"],
      competitorNames: ["Cabinet Durand"],
      nearbyCities: [" Reims ", "Épernay", "Épernay", "", "Châlons-en-Champagne", "Vitry-le-François", "Tinqueux"],
    });
    expect(seed.nearbyCities).toEqual(["Reims", "Épernay", "Châlons-en-Champagne", "Vitry-le-François"]);
    expect(seed.department).toEqual({ code: "51", name: "Marne", region: "Grand Est" });
    expect(seed.searchTerms).toEqual([
      "ostéopathe",
      "ostéopathe reims",
      "ostéopathie",
      "ostéopathie reims",
      "ostéopathe épernay",
      "ostéopathe nourrisson",
      "ostéopathe châlons-en-champagne",
      // Huit termes au plus : le concurrent passe avant la troisième ville voisine
      "cabinet durand",
    ]);
    expect(seed.searchTerms).toEqual(buildMetaSearchTerms(seed));
    for (const nearbyCities of [undefined, [], ["", "  "]]) {
      const bare = buildMetaSeed({ profession: "Ostéopathe", city: "Reims", address: null, specialties: [], competitorNames: [], nearbyCities });
      expect("nearbyCities" in bare, JSON.stringify(nearbyCities)).toBe(false);
      expect(bare.searchTerms).toEqual(["ostéopathe", "ostéopathe reims", "ostéopathie", "ostéopathie reims"]);
    }
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

describe("scopeOfAd : codes postaux, anciennes régions, arrondissements", () => {
  const scope = (locations: MetaAdLocation[], seed: ScopeSeed = reims) => scopeOfAd({ targetLocations: locations }, seed);

  it("code postal ciblé (« 51100, France ») : celui du praticien → ville, un autre code de son département → département", () => {
    expect(scope([zone("51100, France", "zips")])).toBe("ville");
    expect(scope([zone("51100", "zips")])).toBe("ville");
    expect(scope([zone("51200, France", "zips")])).toBe("departement");
    expect(scope([zone("51000, France", "zips")])).toBe("departement");
    // Graine sans code postal (adresse inconnue, graines antérieures) : le code ne dit que le département
    expect(scope([zone("51100, France", "zips")], { city: "Reims", department: marne, region: "Grand Est" })).toBe("departement");
    expect(scope([zone("51100, France", "zips")], { ...reims, postalCode: null })).toBe("departement");
  });

  it("code postal d'un autre département de la région → région ; ailleurs, inconnu ou sans département connu → France", () => {
    expect(scope([zone("10000, France", "zips")])).toBe("region");
    expect(scope([zone("67000, France", "zips")])).toBe("region");
    // L'Aisne touche la Marne mais relève des Hauts-de-France
    expect(scope([zone("02100, France", "zips")])).toBe("france");
    expect(scope([zone("75001, France", "zips")])).toBe("france");
    expect(scope([zone("00000, France", "zips")])).toBe("france");
    expect(scope([zone("51200, France", "zips")], { city: "Reims", department: null, region: null })).toBe("france");
    // Corse (2A / 2B) et outre-mer (trois chiffres)
    expect(scope([zone("20200, France", "zips")], { city: "Ajaccio", department: departmentFromPostalCode("20000"), region: "Corse", postalCode: "20000" })).toBe("region");
    expect(scope([zone("97410, France", "zips")], { city: "Saint-Denis", department: departmentFromPostalCode("97400"), region: "La Réunion", postalCode: "97400" })).toBe("departement");
  });

  it("plusieurs codes postaux : le plus proche l'emporte ; un code exclu est ignoré", () => {
    expect(scope([zone("75001, France", "zips"), zone("10000, France", "zips")])).toBe("region");
    expect(scope([zone("75001, France", "zips"), zone("10000, France", "zips"), zone("51200, France", "zips")])).toBe("departement");
    expect(scope([zone("France", "countries"), zone("51100, France", "zips")])).toBe("ville");
    expect(scope([zone("France", "countries"), zone("51100, France", "zips", true)])).toBe("france");
  });

  it("un code postal étranger à 5 chiffres (« 51100, Germany ») ne désigne ni la ville ni le département du praticien : le dernier segment dit le pays", () => {
    expect(scope([zone("51100, Germany", "zips")])).toBe("france");
    expect(scope([zone("51200, Italy", "zips")])).toBe("france");
    expect(scope([zone("10000, Deutschland", "zips")])).toBe("france");
    expect(scope([zone("10000, Allemagne", "zips")])).toBe("france");
    // En France (casse indifférente), avec ou sans la ville entre le code et le pays
    expect(scope([zone("10000, FRANCE", "zips")])).toBe("region");
    expect(scope([zone("51100, Reims, France", "zips")])).toBe("ville");
    expect(scope([zone("51200, Épernay, France", "zips")])).toBe("departement");
    // Le code suivi de la région ou du département du praticien reste un code de chez lui (outre-mer compris)
    expect(scope([zone("51200, Grand Est", "zips")])).toBe("departement");
    expect(scope([zone("51200, Marne", "zips")])).toBe("departement");
    expect(scope([zone("97410, La Réunion", "zips")], { city: "Saint-Denis", department: departmentFromPostalCode("97400"), region: "La Réunion", postalCode: "97400" })).toBe("departement");
  });

  it("anciennes régions, que la bibliothèque emploie encore : « Genas, Rhône-Alpes, France » → région pour un praticien d'Auvergne-Rhône-Alpes", () => {
    expect(scope([zone("Genas, Rhône-Alpes, France", "CITY")], lyon)).toBe("region");
    expect(scope([zone("Rhône-Alpes, France", "regions")], lyon)).toBe("region");
    expect(scope([zone("Auvergne", "regions")], lyon)).toBe("region");
    expect(scope([zone("Lyon, Rhône-Alpes, France", "CITY")], lyon)).toBe("ville");
    expect(scope([zone("Champagne-Ardenne, France", "regions")])).toBe("region");
    expect(scope([zone("Metz, Lorraine, France", "CITY")])).toBe("region");
    expect(scope([zone("Midi-Pyrénées", "regions")], toulouse)).toBe("region");
    expect(scope([zone("languedoc roussillon", "regions")], toulouse)).toBe("region");
    // Ancienne région d'une autre région actuelle → France
    expect(scope([zone("Aquitaine", "regions")], toulouse)).toBe("france");
    expect(scope([zone("Bordeaux, Aquitaine, France", "CITY")], toulouse)).toBe("france");
    expect(scope([zone("Rhône-Alpes", "regions")], { city: "Lyon", department: null, region: null })).toBe("france");
  });

  it("ville homonyme : la région nommée départage (« Valence, Midi-Pyrénées » n'est pas Valence dans la Drôme, même si le nom est celui de la ville du praticien)", () => {
    const valence: ScopeSeed = { city: "Valence", department: departmentFromPostalCode("26000"), region: "Auvergne-Rhône-Alpes", postalCode: "26000" };
    expect(scope([zone("Valence, Midi-Pyrénées, France", "CITY")], valence)).toBe("france");
    expect(scope([zone("Valence, Occitanie, France", "CITY")], valence)).toBe("france");
    expect(scope([zone("Valence, Rhône-Alpes, France", "CITY")], valence)).toBe("ville");
    expect(scope([zone("Valence, Auvergne-Rhône-Alpes, France", "CITY")], valence)).toBe("ville");
    expect(scope([zone("Valence, France", "CITY")], valence)).toBe("ville");
    expect(scope([zone("Valence", "CITY")], valence)).toBe("ville");
    // Praticien de La Réunion : Saint-Denis d'Île-de-France est ailleurs
    expect(scope([zone("Saint-Denis, Île-de-France, France", "CITY")], { city: "Saint-Denis", department: departmentFromPostalCode("97400"), region: "La Réunion" })).toBe("france");
    // Région du praticien inconnue : rien ne départage, le nom de la ville l'emporte
    expect(scope([zone("Valence, Midi-Pyrénées, France", "CITY")], { city: "Valence", department: null, region: null })).toBe("ville");
  });

  it("ville homonyme d'outre-mer : « Saint-Denis, La Réunion, France » n'est pas Saint-Denis en Île-de-France ; les régions d'outre-mer situent comme les autres", () => {
    const saintDenis: ScopeSeed = { city: "Saint-Denis", department: departmentFromPostalCode("93200"), region: "Île-de-France", postalCode: "93200" };
    expect(scope([zone("Saint-Denis, La Réunion, France", "CITY")], saintDenis)).toBe("france");
    expect(scope([zone("La Réunion", "regions")], saintDenis)).toBe("france");
    expect(scope([zone("Saint-Denis, Île-de-France, France", "CITY")], saintDenis)).toBe("ville");
    const reunion: ScopeSeed = { city: "Saint-Denis", department: departmentFromPostalCode("97400"), region: "La Réunion", postalCode: "97400" };
    expect(scope([zone("Saint-Denis, La Réunion, France", "CITY")], reunion)).toBe("ville");
    expect(scope([zone("Saint-Pierre, La Réunion, France", "CITY")], reunion)).toBe("departement");
    expect(scope([zone("Guadeloupe", "regions")], reunion)).toBe("france");
    expect(scope([zone("Pointe-à-Pitre, Guadeloupe, France", "CITY")], reunion)).toBe("france");
  });

  it("un département nommé après la ville départage aussi : « Valence, Tarn-et-Garonne, France » → France, un département de la même région → région", () => {
    const valence: ScopeSeed = { city: "Valence", department: departmentFromPostalCode("26000"), region: "Auvergne-Rhône-Alpes", postalCode: "26000" };
    expect(scope([zone("Valence, Tarn-et-Garonne, France", "CITY")], valence)).toBe("france");
    expect(scope([zone("Valence, Isère, France", "CITY")], valence)).toBe("region");
    expect(scope([zone("Valence, Drôme, France", "CITY")], valence)).toBe("ville");
    expect(scope([zone("Valence, Drôme, Rhône-Alpes, France", "CITY")], valence)).toBe("ville");
    // Département du praticien inconnu : rien ne départage
    expect(scope([zone("Valence, Tarn-et-Garonne, France", "CITY")], { city: "Valence", department: null, region: "Auvergne-Rhône-Alpes" })).toBe("ville");
    // Une autre ville, située par son département
    expect(scope([zone("Colomiers, Haute-Garonne, France", "CITY")], toulouse)).toBe("departement");
    expect(scope([zone("Albi, Tarn, France", "CITY")], toulouse)).toBe("region");
    expect(scope([zone("Bordeaux, Gironde, France", "CITY")], toulouse)).toBe("france");
  });

  it("le nom d'un quartier n'est pas une région : « Centre, Rennes, France » → ville pour un praticien de Rennes ; « Centre, France » reste l'ancienne région", () => {
    const rennes: ScopeSeed = { city: "Rennes", department: departmentFromPostalCode("35000"), region: "Bretagne" };
    expect(scope([zone("Centre, Rennes, France", "NEIGHBORHOOD")], rennes)).toBe("ville");
    expect(scope([zone("Centre, Rennes, Bretagne, France", "NEIGHBORHOOD")], rennes)).toBe("ville");
    expect(scope([zone("Centre, France", "regions")], rennes)).toBe("france");
    expect(scope([zone("Centre, France", "regions")], { city: "Orléans", department: departmentFromPostalCode("45000"), region: "Centre-Val de Loire" })).toBe("region");
    // Quartier d'une ville d'un autre département de la région, ou d'ailleurs
    const paris: ScopeSeed = { city: "Paris", department: departmentFromPostalCode("75005"), region: "Île-de-France" };
    expect(scope([zone("Montmartre, Paris, Île-de-France, France", "NEIGHBORHOOD")], paris)).toBe("ville");
    expect(scope([zone("Montmartre, Paris, France", "NEIGHBORHOOD")], { city: "Versailles", department: departmentFromPostalCode("78000"), region: "Île-de-France" })).toBe("region");
    expect(scope([zone("Montmartre, Paris, Île-de-France, France", "NEIGHBORHOOD")], lyon)).toBe("france");
  });

  it("quartier d'une ville qui porte le nom d'un département d'ailleurs (« Estressin, Vienne, France ») : ville pour un praticien de Vienne en Isère", () => {
    const vienne: ScopeSeed = { city: "Vienne", department: departmentFromPostalCode("38200"), region: "Auvergne-Rhône-Alpes", postalCode: "38200" };
    expect(scope([zone("Vienne, France", "CITY")], vienne)).toBe("ville");
    expect(scope([zone("Estressin, Vienne, Auvergne-Rhône-Alpes, France", "NEIGHBORHOOD")], vienne)).toBe("ville");
    expect(scope([zone("Estressin, Vienne, France", "NEIGHBORHOOD")], vienne)).toBe("ville");
    // Vu de Grenoble, avec l'index des communes de l'Isère : le quartier d'une commune du département
    const grenoble: ScopeSeed = { city: "Grenoble", department: departmentFromPostalCode("38000"), region: "Auvergne-Rhône-Alpes", postalCode: "38000" };
    const isere = buildMetaLocalIndex([{ name: "Vienne", departmentCode: "38" }, { name: "Grenoble", departmentCode: "38" }], grenoble);
    expect(scopeOfAd({ targetLocations: [zone("Centre-ville, Vienne, France", "NEIGHBORHOOD")] }, grenoble, isere)).toBe("departement");
    // Un pays étranger en fin de zone l'emporte toujours (« Delémont, Jura, Suisse » n'est pas dans le Jura français)
    const besancon: ScopeSeed = { city: "Besançon", department: departmentFromPostalCode("25000"), region: "Bourgogne-Franche-Comté", postalCode: "25000" };
    expect(scope([zone("Delémont, Jura, Suisse", "CITY")], besancon)).toBe("france");
  });

  it("une zone typée région n'est jamais « ville », même si elle porte le nom de la ville du praticien (Paris : ville et département)", () => {
    const paris: ScopeSeed = { city: "Paris", department: departmentFromPostalCode("75005"), region: "Île-de-France" };
    expect(scope([zone("Paris", "CITY")], paris)).toBe("ville");
    expect(scope([loc("Paris")], paris)).toBe("ville");
    expect(scope([zone("Paris", "region")], paris)).toBe("departement");
    expect(scope([zone("Paris, Île-de-France", "regions")], paris)).toBe("departement");
  });

  it("« 5e arrondissement de Paris » → ville pour un praticien parisien (« 1er », « 15ème », Lyon de même)", () => {
    const paris: ScopeSeed = { city: "Paris", department: departmentFromPostalCode("75005"), region: "Île-de-France", postalCode: "75005" };
    expect(scope([zone("5e arrondissement de Paris", "NEIGHBORHOOD")], paris)).toBe("ville");
    expect(scope([zone("5e arrondissement de Paris, Île-de-France, France", "NEIGHBORHOOD")], paris)).toBe("ville");
    expect(scope([zone("1er arrondissement de Paris", "NEIGHBORHOOD")], paris)).toBe("ville");
    expect(scope([zone("15ème arrondissement de Paris", "NEIGHBORHOOD")], paris)).toBe("ville");
    expect(scope([zone("5e arrondissement de Paris", "NEIGHBORHOOD")], { ...paris, city: "Paris 15e" })).toBe("ville");
    expect(scope([zone("3e arrondissement de Lyon", "NEIGHBORHOOD")], lyon)).toBe("ville");
    // Pour un praticien d'ailleurs : Paris reste un département d'Île-de-France, rien de plus
    expect(scope([zone("5e arrondissement de Paris", "NEIGHBORHOOD")], lyon)).toBe("france");
    expect(scope([zone("5e arrondissement de Paris", "NEIGHBORHOOD")], { city: "Versailles", department: departmentFromPostalCode("78000"), region: "Île-de-France" })).toBe("region");
  });
});

describe("buildMetaLocalIndex et villes ciblées sans département", () => {
  const communes = [
    { name: "Reims", departmentCode: "51" },
    { name: "Épernay", departmentCode: "51" },
    { name: "Châlons-en-Champagne", departmentCode: "51" },
    // Commune de la Marne qui porte le nom d'une ancienne région
    { name: "Bourgogne", departmentCode: "51" },
    { name: "Troyes", departmentCode: "10" },
    { name: "Metz", departmentCode: "57" },
    // Commune de Meurthe-et-Moselle, homonyme d'une collectivité d'outre-mer (zone de niveau pays)
    { name: "Saint-Martin", departmentCode: "54" },
    { name: "", departmentCode: "51" },
  ];
  const index = buildMetaLocalIndex(communes, reims);
  /** Zone de l'annonce avec l'index de la Marne ; `null` = sans index. */
  const scope = (locations: MetaAdLocation[], seed: ScopeSeed = reims, localIndex: MetaLocalIndex | null = index) => scopeOfAd({ targetLocations: locations }, seed, localIndex ?? undefined);

  it("index : communes du département du praticien d'un côté, toutes les communes fournies (sa région) de l'autre, noms normalisés", () => {
    expect([...index.department].sort()).toEqual(["bourgogne", "chalons en champagne", "epernay", "reims"]);
    expect([...index.region].sort()).toEqual(["bourgogne", "chalons en champagne", "epernay", "metz", "reims", "saint martin", "troyes"]);
    expect(index.department.has("troyes")).toBe(false);
    // Sans département connu : aucune commune « du département », la région reste indexée
    const unknown = buildMetaLocalIndex(communes, { department: null });
    expect(unknown.department.size).toBe(0);
    expect(unknown.region.size).toBe(7);
    expect(buildMetaLocalIndex([], reims)).toEqual({ department: new Set(), region: new Set() });
  });

  it("agglomération : une commune du département à moins de META_AROUND_RADIUS_KM de la ville du praticien est « autour de vous »", () => {
    const located = [
      { name: "Reims", departmentCode: "51", lat: 49.2515, lng: 4.0347 },
      { name: "Tinqueux", departmentCode: "51", lat: 49.2495, lng: 3.9837 },
      { name: "Bétheny", departmentCode: "51", lat: 49.2853, lng: 4.0575 },
      { name: "Épernay", departmentCode: "51", lat: 49.0368, lng: 3.9602 },
      // Commune sans coordonnées : jamais dans l'agglomération
      { name: "Bezannes", departmentCode: "51" },
      // Autre département, à quelques kilomètres : reste hors de l'agglomération (les homonymes y seraient trop risqués)
      { name: "Voisine", departmentCode: "02", lat: 49.26, lng: 4.0 },
    ];
    const withAround = buildMetaLocalIndex(located, reims);
    expect(META_AROUND_RADIUS_KM).toBe(15);
    expect([...withAround.around!].sort()).toEqual(["betheny", "reims", "tinqueux"]);
    const city = (name: string): MetaAdLocation[] => [{ name: `${name}, France`, type: "CITY", excluded: false }];
    expect(scope(city("Tinqueux"), reims, withAround)).toBe("ville");
    expect(scope(city("Bétheny"), reims, withAround)).toBe("ville");
    // À 25 km : dans le département, pas dans l'agglomération
    expect(scope(city("Épernay"), reims, withAround)).toBe("departement");
    expect(scope(city("Bezannes"), reims, withAround)).toBe("departement");
    expect(scope(city("Voisine"), reims, withAround)).toBe("region");
    // Sans coordonnées, ou ville du praticien introuvable : pas d'agglomération, les communes restent « département »
    expect(index.around).toBeUndefined();
    expect(scope(city("Épernay"))).toBe("departement");
    expect(buildMetaLocalIndex(located, { department: reims.department, city: "Ville inconnue" }).around).toBeUndefined();
    expect(buildMetaLocalIndex(located, { department: reims.department }).around).toBeUndefined();
  });

  it("commune du département (« Épernay, France ») → département ; sans index, la même zone reste « france »", () => {
    expect(scope([zone("Épernay, France", "CITY")])).toBe("departement");
    expect(scope([zone("epernay", "COMMUNE")])).toBe("departement");
    expect(scope([zone("ÉPERNAY, France", "MUNICIPALITY")])).toBe("departement");
    expect(scope([zone("Châlons-en-Champagne, France", "CITY")])).toBe("departement");
    expect(scope([loc("Épernay, France")])).toBe("departement");
    expect(scope([zone("Épernay, France", "CITY")], reims, null)).toBe("france");
    // La ville du praticien reste sa ville, index ou non
    expect(scope([zone("Reims, France", "CITY")])).toBe("ville");
  });

  it("commune d'un autre département de la région (« Troyes, France ») → région ; commune inconnue de l'index → France", () => {
    expect(scope([zone("Troyes, France", "CITY")])).toBe("region");
    expect(scope([zone("Metz, France", "CITY")])).toBe("region");
    expect(scope([zone("Troyes, France", "CITY")], reims, null)).toBe("france");
    expect(scope([zone("Bordeaux, France", "CITY")])).toBe("france");
    expect(scope([zone("Épernay-sous-Gevrey, France", "CITY")])).toBe("france");
  });

  it("zone la plus étroite parmi plusieurs ; une commune exclue ou située par la zone dans une autre région ne compte pas", () => {
    expect(scope([zone("France", "countries"), zone("Troyes, France", "CITY"), zone("Épernay, France", "CITY")])).toBe("departement");
    expect(scope([zone("Bordeaux, France", "CITY"), zone("Troyes, France", "CITY")])).toBe("region");
    expect(scope([zone("France", "countries"), zone("Épernay, France", "CITY", true)])).toBe("france");
    expect(scope([zone("Saint-Martin, Midi-Pyrénées, France", "CITY")])).toBe("france");
    expect(scope([zone("Saint-Martin, Lorraine, France", "CITY")])).toBe("region");
  });

  it("l'index ne s'applique jamais à une zone de niveau pays (types `countries`, `country_groups`, `country`), même si son nom est celui d'une commune", () => {
    expect(scope([zone("Saint-Martin", "CITY")])).toBe("region");
    for (const type of ["countries", "country_groups", "country", "COUNTRIES"]) {
      expect(scope([zone("Saint-Martin", type)]), type).toBe("france");
      expect(scope([zone("Épernay", type)]), type).toBe("france");
    }
    expect(scope([zone("France", "countries")])).toBe("france");
    expect(scope([loc("France")])).toBe("france");
  });

  it("un nom de région ou de département que rien ne désigne comme une ville n'est pas cherché dans l'index : « Bourgogne » reste la région, « Vienne » le département", () => {
    // « Bourgogne » est aussi une commune de la Marne : sans type de ville, la zone désigne l'ancienne région (autre région → France)
    for (const type of ["regions", "DEPARTMENT", "zips"]) expect(scope([zone("Bourgogne, France", type)]), type).toBe("france");
    expect(scope([loc("Bourgogne")])).toBe("france");
    // Les zones régionales du praticien restent des régions, jamais « département »
    expect(scope([zone("Grand Est", "regions")])).toBe("region");
    expect(scope([zone("Champagne-Ardenne, France", "regions")])).toBe("region");
    expect(scope([zone("Aube", "DEPARTMENT")])).toBe("region");
    expect(scope([zone("Marne", "DEPARTMENT")])).toBe("departement");
    // Vienne (Isère) est une commune du département du praticien, mais le nom est d'abord celui d'un département de Nouvelle-Aquitaine
    const grenoble: ScopeSeed = { city: "Grenoble", department: departmentFromPostalCode("38000"), region: "Auvergne-Rhône-Alpes", postalCode: "38000" };
    const isere = buildMetaLocalIndex([{ name: "Vienne", departmentCode: "38" }, { name: "Voiron", departmentCode: "38" }], grenoble);
    expect(isere.department.has("vienne")).toBe(true);
    expect(scope([loc("Vienne, France")], grenoble, isere)).toBe("france");
    expect(scope([zone("Vienne", "DEPARTMENT")], grenoble, isere)).toBe("france");
    expect(scope([zone("Vienne", "regions")], grenoble, isere)).toBe("france");
  });

  it("zone typée ville (`CITY`, `COMMUNE`, `MUNICIPALITY`, `NEIGHBORHOOD`…) : l'index s'applique même si le nom est celui d'un département ou d'une région (« Vienne, France » → département en Isère)", () => {
    const grenoble: ScopeSeed = { city: "Grenoble", department: departmentFromPostalCode("38000"), region: "Auvergne-Rhône-Alpes", postalCode: "38000" };
    const isere = buildMetaLocalIndex([{ name: "Vienne", departmentCode: "38" }, { name: "Voiron", departmentCode: "38" }, { name: "Valence", departmentCode: "26" }], grenoble);
    for (const type of ["CITY", "city", "COMMUNE", "MUNICIPALITY", "NEIGHBORHOOD", "subcity", "subneighborhood"]) {
      expect(scope([zone("Vienne, France", type)], grenoble, isere), type).toBe("departement");
      expect(scope([zone("Bourgogne, France", type)]), type).toBe("departement");
    }
    expect(scope([zone("Voiron, France", "CITY")], grenoble, isere)).toBe("departement");
    expect(scope([zone("Valence, France", "CITY")], grenoble, isere)).toBe("region");
    // Sans index, ou quand la zone situe la ville dans une autre région : rien ne la rattache au praticien
    expect(scope([zone("Vienne, France", "CITY")], grenoble, null)).toBe("france");
    expect(scope([zone("Vienne, Nouvelle-Aquitaine, France", "CITY")], grenoble, isere)).toBe("france");
    expect(scope([zone("Bourgogne, Bourgogne-Franche-Comté, France", "CITY")])).toBe("france");
  });

  it("l'index ne s'applique jamais à une zone typée région (`regions`, `region`), même si son nom est celui d'une commune", () => {
    for (const type of ["regions", "region", "REGIONS"]) {
      expect(scope([zone("Épernay", type)]), type).toBe("france");
      expect(scope([zone("Saint-Martin", type)]), type).toBe("france");
      expect(scope([zone("Troyes, France", type)]), type).toBe("france");
    }
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

  it("3 annonces en ville → département si ≥ 8 cumulées, sinon région, sinon France ; `counts` par zone ; la zone retenue en tête de `ads`, le reste en complément", () => {
    const ville = inZone("ville", 3);
    const dept = selectMarketAds([...ville, ...inZone("departement", 5), ...inZone("region", 2), ...inZone("france", 4)], toulouse, now);
    expect(dept.scopeUsed).toBe("departement");
    expect(dept.counts).toEqual({ ville: 3, departement: 5, region: 2, france: 4 });
    expect(marketNearCount(dept)).toBe(8);
    expect(dept.ads).toHaveLength(14);
    expect(dept.ads.slice(0, 3).every((a) => a.scope === "ville")).toBe(true);
    expect(dept.ads.slice(3, 8).every((a) => a.scope === "departement")).toBe(true);
    expect(dept.ads.slice(8).every((a) => a.scope === "region" || a.scope === "france")).toBe(true);

    const region = selectMarketAds([...ville, ...inZone("departement", 2), ...inZone("region", 4), ...inZone("france", 5)], toulouse, now);
    expect(region.scopeUsed).toBe("region");
    expect(marketNearCount(region)).toBe(9);
    expect(region.ads).toHaveLength(14);
    expect(region.ads.slice(0, 9).some((a) => a.scope === "france")).toBe(false);
    expect(region.ads.slice(9).every((a) => a.scope === "france")).toBe(true);

    const france = selectMarketAds([...ville, ...inZone("departement", 1), ...inZone("region", 2), ...inZone("france", 1)], toulouse, now);
    expect(france.scopeUsed).toBe("france");
    expect(france.ads).toHaveLength(7);
    expect(marketNearCount(france)).toBe(7);
    expect(france.ads.map((a) => a.scope)).toEqual(["ville", "ville", "ville", "departement", "region", "region", "france"]);
  });

  it("8 annonces en ville suffisent : zone ville, sans élargissement ; `minLocal` ajustable", () => {
    const records = [...inZone("ville", META_MARKET_MIN_LOCAL), ...inZone("france", 3)];
    const selected = selectMarketAds(records, toulouse, now);
    expect(selected.scopeUsed).toBe("ville");
    expect(marketNearCount(selected)).toBe(8);
    expect(selected.ads.slice(0, 8).every((a) => a.scope === "ville")).toBe(true);
    expect(selected.ads).toHaveLength(11);
    expect(selectMarketAds(inZone("ville", 2), toulouse, now, { minLocal: 2 }).scopeUsed).toBe("ville");
    expect(selectMarketAds([], toulouse, now)).toEqual({
      ads: [],
      scopeUsed: "france",
      counts: { ville: 0, departement: 0, region: 0, france: 0 },
      strongCounts: { ville: 0, departement: 0, region: 0, france: 0 },
      filtered: null,
      dismissed: 0,
    });
  });

  it("`strongCounts` : signaux forts par zone sur toutes les annonces repérées, même hors des annonces conservées", () => {
    const strong = { startedAt: daysAgo(60), euTotalReach: 20_000 };
    const records = [...inZone("ville", META_MARKET_MIN_LOCAL, strong), ...inZone("departement", 2, strong), ...inZone("region", 1, strong), ...inZone("france", 3)];
    const selected = selectMarketAds(records, toulouse, now, { max: META_MARKET_MIN_LOCAL });
    expect(selected.scopeUsed).toBe("ville");
    expect(selected.ads).toHaveLength(META_MARKET_MIN_LOCAL);
    expect(selected.ads.every((a) => a.scope === "ville")).toBe(true);
    expect(selected.counts).toEqual({ ville: 8, departement: 2, region: 1, france: 3 });
    expect(selected.strongCounts).toEqual({ ville: 8, departement: 2, region: 1, france: 0 });
    // Sans plafond serré : mêmes comptes, les autres zones viennent seulement compléter `ads`
    const completed = selectMarketAds(records, toulouse, now);
    expect(completed.strongCounts).toEqual(selected.strongCounts);
    expect(completed.ads).toHaveLength(14);
  });

  it("tri : la zone retenue d'abord (zone la plus proche, puis score décroissant, puis nom de page), ensuite les mieux notées des zones plus larges ; `max` tronque", () => {
    const records = [
      record("f-fort", { targetLocations: [loc("France")], euTotalReach: 60_000, startedAt: daysAgo(100) }),
      record("v-faible", { targetLocations: [loc("Toulouse")], euTotalReach: 100, startedAt: daysAgo(2), pageName: "Cabinet Zen" }),
      record("v-fort", { targetLocations: [loc("Toulouse")], euTotalReach: 50_000, startedAt: daysAgo(60) }),
      record("v-faible-bis", { targetLocations: [loc("Toulouse")], euTotalReach: 100, startedAt: daysAgo(2), pageName: "Cabinet Alpha" }),
      record("d-moyen", { targetLocations: [loc("Haute-Garonne")], euTotalReach: 5_000, startedAt: daysAgo(20) }),
    ];
    const { ads, scopeUsed } = selectMarketAds(records, toulouse, now, { minLocal: 2 });
    expect(scopeUsed).toBe("ville");
    // Complément : l'annonce nationale (mieux notée) passe avant celle du département
    expect(ads.map((a) => a.id)).toEqual(["v-fort", "v-faible-bis", "v-faible", "f-fort", "d-moyen"]);
    expect(ads[0]?.signal).toBe("fort");
    expect(ads[0]?.score).toBe(adScore(60, 50_000, true));
    expect(selectMarketAds(records, toulouse, now, { minLocal: 2, max: 4 }).ads.map((a) => a.id)).toEqual(["v-fort", "v-faible-bis", "v-faible", "f-fort"]);

    const widened = selectMarketAds(records, toulouse, now, { minLocal: 4 });
    expect(widened.scopeUsed).toBe("departement");
    expect(widened.ads.map((a) => a.id)).toEqual(["v-fort", "v-faible-bis", "v-faible", "d-moyen", "f-fort"]);
    expect(selectMarketAds(records, toulouse, now, { minLocal: 4, max: 2 }).ads.map((a) => a.id)).toEqual(["v-fort", "v-faible-bis"]);
    expect(selectMarketAds(records, toulouse, now, { minLocal: 4, max: 0 }).ads).toEqual([]);
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

describe("selectMarketAds : pertinence, annonces supprimées, rang, index des communes", () => {
  /** Annonce de praticien que le filtre de pertinence garde pour un sophrologue (ciblage national par défaut). */
  function practitioner(id: string, extra: Partial<MetaAdRecord> = {}): MetaAdRecord {
    return record(id, { pageName: `Sophrologue ${id}`, bodies: ["Séances de sophrologie au cabinet, sur rendez-vous."], ...extra });
  }
  const boutique = record("boutique", { pageName: "Zenova", captions: ["zenova-shop.com"], bodies: ["Code promo : livraison offerte sur nos compléments alimentaires."] });
  const ecole = record("ecole", { pageName: "École de Sophrologie du Sud", bodies: ["Devenez sophrologue : formation certifiante, éligible au CPF."] });
  const etranger = practitioner("etranger", { languages: ["nl"] });

  it("`profession` active le filtre de pertinence : commerce, formation et hors sujet écartés d'office et comptés dans `filtered`", () => {
    const records = [practitioner("p1", { targetLocations: [loc("Toulouse")] }), boutique, practitioner("p2"), ecole, etranger];
    const selected = selectMarketAds(records, toulouse, now, { profession: "Sophrologue" });
    expect(selected.ads.map((a) => a.id)).toEqual(["p1", "p2"]);
    expect(selected.filtered).toEqual({ formation: 1, commerce: 1, autre: 1 });
    expect(selected.dismissed).toBe(0);
    // `counts`, `strongCounts` et `rankTotal` ne portent que sur les annonces pertinentes
    expect(selected.counts).toEqual({ ville: 1, departement: 0, region: 0, france: 1 });
    expect(marketTotalCount(selected.counts)).toBe(2);
    expect(selected.ads.every((a) => a.rankTotal === 2)).toBe(true);
    // Tout est pertinent : compteurs à zéro, pas null
    expect(selectMarketAds([practitioner("p1")], toulouse, now, { profession: "Sophrologue" }).filtered).toEqual({ formation: 0, commerce: 0, autre: 0 });
  });

  it("sans `profession` (absente ou vide) : le filtre ne tourne pas, `filtered` vaut null et tout est conservé", () => {
    const records = [practitioner("p1"), boutique, ecole, etranger];
    for (const opts of [undefined, {}, { profession: "" }]) {
      const selected = selectMarketAds(records, toulouse, now, opts);
      expect(selected.filtered, JSON.stringify(opts)).toBeNull();
      expect(selected.ads).toHaveLength(4);
      expect(selected.counts.france).toBe(4);
    }
  });

  it("`excludedIds` : les annonces supprimées par le praticien ne reviennent pas et sont comptées dans `dismissed`", () => {
    const records = [...inZone("ville", 3), ...inZone("france", 2)];
    const selected = selectMarketAds(records, toulouse, now, { excludedIds: new Set(["ville-2", "france-1", "jamais-vue"]) });
    expect(selected.dismissed).toBe(2);
    expect(selected.ads.map((a) => a.id).sort()).toEqual(["france-2", "ville-1", "ville-3"]);
    expect(selected.counts).toEqual({ ville: 2, departement: 0, region: 0, france: 1 });
    expect(selected.ads.every((a) => a.rankTotal === 3)).toBe(true);
    expect(selected.filtered).toBeNull();
    expect(selectMarketAds(records, toulouse, now, { excludedIds: new Set() }).dismissed).toBe(0);
    expect(selectMarketAds(records, toulouse, now).dismissed).toBe(0);
    // Tout supprimé : veille vide, sans erreur
    const none = selectMarketAds(records, toulouse, now, { excludedIds: new Set(records.map((r) => r.id)) });
    expect(none).toMatchObject({ ads: [], scopeUsed: "france", dismissed: 5 });
    expect(marketTotalCount(none.counts)).toBe(0);
  });

  it("`excludedIds` : la zone retenue se calcule après le retrait ; une annonce déjà écartée par le filtre de pertinence n'est pas comptée comme supprimée", () => {
    const records = [...inZone("ville", META_MARKET_MIN_LOCAL), ...inZone("departement", 1)];
    expect(selectMarketAds(records, toulouse, now).scopeUsed).toBe("ville");
    const widened = selectMarketAds(records, toulouse, now, { excludedIds: new Set(["ville-1"]) });
    expect(widened.scopeUsed).toBe("departement");
    expect(widened.ads).toHaveLength(META_MARKET_MIN_LOCAL);
    expect(widened.ads.some((a) => a.id === "ville-1")).toBe(false);

    const both = selectMarketAds([practitioner("p1"), practitioner("p2"), boutique], toulouse, now, { profession: "Sophrologue", excludedIds: new Set(["p2", "boutique"]) });
    expect(both.ads.map((a) => a.id)).toEqual(["p1"]);
    expect(both.filtered).toEqual({ formation: 0, commerce: 1, autre: 0 });
    expect(both.dismissed).toBe(1);
  });

  it("`rank` et `rankTotal` sur chaque annonce : 1 = la mieux notée, total = toutes les annonces pertinentes repérées, pas seulement celles conservées", () => {
    const records = [
      record("f-fort", { targetLocations: [loc("France")], euTotalReach: 60_000, startedAt: daysAgo(100) }),
      record("v-faible", { targetLocations: [loc("Toulouse")], euTotalReach: 100, startedAt: daysAgo(2), pageName: "Cabinet Zen" }),
      record("v-fort", { targetLocations: [loc("Toulouse")], euTotalReach: 50_000, startedAt: daysAgo(60) }),
      record("v-faible-bis", { targetLocations: [loc("Toulouse")], euTotalReach: 100, startedAt: daysAgo(2), pageName: "Cabinet Alpha" }),
      record("d-moyen", { targetLocations: [loc("Haute-Garonne")], euTotalReach: 5_000, startedAt: daysAgo(20) }),
    ];
    const all = selectMarketAds(records, toulouse, now, { minLocal: 99 });
    expect(all.scopeUsed).toBe("france");
    // À note égale : nom de page (« Cabinet Alpha » avant « Cabinet Zen »)
    expect(Object.fromEntries(all.ads.map((a) => [a.id, a.rank]))).toEqual({ "f-fort": 1, "v-fort": 2, "d-moyen": 3, "v-faible-bis": 4, "v-faible": 5 });
    expect(all.ads.every((a) => a.rankTotal === 5)).toBe(true);
    const byRank = [...all.ads].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    expect(byRank.map((a) => a.rank)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < byRank.length; i++) expect(byRank[i - 1]!.score).toBeGreaterThanOrEqual(byRank[i]!.score);

    // Zone « ville » retenue et plafond à 3 : la meilleure annonce (nationale) n'est pas conservée, les autres gardent leur rang global
    const ville = selectMarketAds(records, toulouse, now, { minLocal: 2, max: 3 });
    expect(ville.scopeUsed).toBe("ville");
    expect(ville.ads.map((a) => [a.id, a.rank, a.rankTotal])).toEqual([
      ["v-fort", 2, 5],
      ["v-faible-bis", 4, 5],
      ["v-faible", 5, 5],
    ]);
    expect(selectMarketAds(records, toulouse, now, { minLocal: 2, max: 1 }).ads.map((a) => [a.id, a.rank, a.rankTotal])).toEqual([["v-fort", 2, 5]]);
    // L'ordre de `ads` (zone d'abord) n'est pas celui du rang (note seule)
    expect(selectMarketAds(records, toulouse, now, { minLocal: 2 }).ads.map((a) => a.rank)).toEqual([2, 4, 5, 1, 3]);
    // Les annonces du relevé ne sont pas modifiées : le rang est porté par les annonces de la veille
    expect(records.some((r) => "rank" in r || "rankTotal" in r || "scope" in r)).toBe(false);
  });

  it("`rank` : à note et nom de page égaux, l'identifiant départage ; une seule annonce → 1 sur 1", () => {
    const twins = selectMarketAds([record("b", { pageName: "Cabinet Jumeau" }), record("a", { pageName: "Cabinet Jumeau" })], toulouse, now);
    expect(Object.fromEntries(twins.ads.map((a) => [a.id, a.rank]))).toEqual({ a: 1, b: 2 });
    expect(selectMarketAds([record("seule")], toulouse, now).ads[0]).toMatchObject({ rank: 1, rankTotal: 1 });
  });

  it("`localIndex` : une ville ciblée sans département est rattachée au département ou à la région du praticien", () => {
    const index = buildMetaLocalIndex(
      [
        { name: "Épernay", departmentCode: "51" },
        { name: "Troyes", departmentCode: "10" },
      ],
      reims,
    );
    const records = [
      record("reims", { targetLocations: [zone("Reims, France", "CITY")] }),
      record("epernay", { targetLocations: [zone("Épernay, France", "CITY")] }),
      record("troyes", { targetLocations: [zone("Troyes, France", "CITY")] }),
      record("bordeaux", { targetLocations: [zone("Bordeaux, France", "CITY")] }),
      record("code-postal", { targetLocations: [zone("51200, France", "zips")] }),
    ];
    const withIndex = selectMarketAds(records, reims, now, { localIndex: index, minLocal: 3 });
    expect(withIndex.counts).toEqual({ ville: 1, departement: 2, region: 1, france: 1 });
    expect(withIndex.scopeUsed).toBe("departement");
    expect(marketNearCount(withIndex)).toBe(3);
    expect(Object.fromEntries(withIndex.ads.map((a) => [a.id, a.scope]))).toEqual({ reims: "ville", epernay: "departement", "code-postal": "departement", troyes: "region", bordeaux: "france" });

    const withoutIndex = selectMarketAds(records, reims, now, { minLocal: 3 });
    expect(withoutIndex.counts).toEqual({ ville: 1, departement: 1, region: 0, france: 3 });
    expect(withoutIndex.scopeUsed).toBe("france");
    expect(Object.fromEntries(withoutIndex.ads.map((a) => [a.id, a.scope]))).toEqual({ reims: "ville", "code-postal": "departement", epernay: "france", troyes: "france", bordeaux: "france" });
  });
});

describe("selectMarketAds : complément des zones plus larges et plafond par page", () => {
  const strong = { startedAt: daysAgo(90), euTotalReach: 40_000 };
  const weak = { startedAt: daysAgo(3), euTotalReach: 200 };

  it("zone locale maigre : ses annonces d'abord, puis les mieux notées des zones plus larges, toutes zones confondues", () => {
    const records = [
      ...inZone("france", 2, weak),
      ...inZone("region", 2, { startedAt: daysAgo(20), euTotalReach: 2_000 }),
      ...inZone("ville", 2, weak),
      record("france-forte", { ...strong, targetLocations: [loc("France")] }),
      ...inZone("departement", 1, strong),
    ];
    const selected = selectMarketAds(records, toulouse, now, { minLocal: 3 });
    expect(selected.scopeUsed).toBe("departement");
    expect(selected.counts).toEqual({ ville: 2, departement: 1, region: 2, france: 3 });
    expect(marketNearCount(selected)).toBe(3);
    // Zone retenue : la ville avant le département, même moins bien notée ; complément : par note, la zone ne compte plus
    expect(selected.ads.map((a) => a.id)).toEqual(["ville-1", "ville-2", "departement-1", "france-forte", "region-1", "region-2", "france-1", "france-2"]);
    const complement = selected.ads.slice(marketNearCount(selected));
    for (let i = 1; i < complement.length; i++) expect(complement[i - 1]!.score).toBeGreaterThanOrEqual(complement[i]!.score);
    // `max` coupe dans le complément, jamais dans la zone retenue tant qu'elle tient
    expect(selectMarketAds(records, toulouse, now, { minLocal: 3, max: 5 }).ads.map((a) => a.id)).toEqual(["ville-1", "ville-2", "departement-1", "france-forte", "region-1"]);
  });

  it("zone locale qui remplit la veille : aucune annonce des zones plus larges, même mieux notées", () => {
    const records = [...inZone("france", 5, strong), ...inZone("ville", META_MARKET_MAX_ADS, weak)];
    const selected = selectMarketAds(records, toulouse, now);
    expect(selected.scopeUsed).toBe("ville");
    expect(selected.ads).toHaveLength(META_MARKET_MAX_ADS);
    expect(selected.ads.every((a) => a.scope === "ville")).toBe(true);
    expect(marketNearCount(selected)).toBe(META_MARKET_MAX_ADS);
    expect(selected.counts).toEqual({ ville: META_MARKET_MAX_ADS, departement: 0, region: 0, france: 5 });
    // Les annonces nationales gardent les premiers rangs sans être conservées
    expect(Math.min(...selected.ads.map((a) => a.rank ?? 0))).toBe(6);
    const tight = selectMarketAds([...inZone("france", 3, strong), ...inZone("ville", 8, weak)], toulouse, now, { max: 8 });
    expect(tight.ads.every((a) => a.scope === "ville")).toBe(true);
    expect(tight.ads).toHaveLength(8);
  });

  it("zone retenue « france » : rien à compléter, tout est dans la zone", () => {
    const selected = selectMarketAds([...inZone("ville", 2), ...inZone("region", 1), ...inZone("france", 2)], toulouse, now);
    expect(selected.scopeUsed).toBe("france");
    expect(marketNearCount(selected)).toBe(5);
    expect(selected.ads.map((a) => a.scope)).toEqual(["ville", "ville", "region", "france", "france"]);
  });

  it("au plus META_MARKET_MAX_PER_PAGE annonces par page : 4 annonces d'une page → les 3 mieux notées", () => {
    expect(META_MARKET_MAX_PER_PAGE).toBe(3);
    const variants = [
      record("faible", { pageId: "page-1", pageName: "Cabinet Zen", euTotalReach: 100 }),
      record("forte", { pageId: "page-1", pageName: "Cabinet Zen", euTotalReach: 50_000 }),
      record("moyenne", { pageId: "page-1", pageName: "Cabinet Zen", euTotalReach: 5_000 }),
      record("correcte", { pageId: "page-1", pageName: "Cabinet Zen", euTotalReach: 1_000 }),
    ];
    const selected = selectMarketAds([...variants, record("autre", { pageId: "page-2", euTotalReach: 10 })], toulouse, now);
    expect(selected.ads.map((a) => a.id)).toEqual(["forte", "moyenne", "correcte", "autre"]);
    // Le plafond ne touche que `ads` : comptes et rangs portent sur toutes les annonces repérées
    expect(selected.counts.france).toBe(5);
    expect(selected.ads.every((a) => a.rankTotal === 5)).toBe(true);
    expect(selected.ads.map((a) => a.rank)).toEqual([1, 2, 3, 5]);
    // Trois annonces ou moins : rien n'est écarté
    expect(selectMarketAds(variants.slice(0, 3), toulouse, now).ads).toHaveLength(3);
  });

  it("plafond par page : sans `pageId`, la page se reconnaît à son nom normalisé (casse, accents, traits d'union) ; deux `pageId` différents restent deux pages", () => {
    const sameName = [
      record("n1", { pageName: "Cabinet Zénith", euTotalReach: 4_000 }),
      record("n2", { pageName: "CABINET ZENITH", euTotalReach: 3_000 }),
      record("n3", { pageName: "cabinet-zénith", euTotalReach: 2_000 }),
      record("n4", { pageName: "Cabinet Zenith", euTotalReach: 1_000 }),
    ];
    expect(selectMarketAds(sameName, toulouse, now).ads.map((a) => a.id)).toEqual(["n1", "n2", "n3"]);
    // Homonymes aux identifiants de page différents : chacun garde ses annonces
    const homonyms = sameName.map((ad, i) => ({ ...ad, pageId: i < 2 ? "page-a" : "page-b" }));
    expect(selectMarketAds(homonyms, toulouse, now).ads.map((a) => a.id)).toEqual(["n1", "n2", "n3", "n4"]);
  });

  it("plafond par page : des pages sans rapport ne sont jamais confondues (noms en cyrillique, en idéogrammes, en émojis, ou sans nom)", () => {
    const names = ["Йога Студия", "瑜伽", "🌿", "✨✨", "Ёлка"];
    const distinct = names.map((pageName, i) => record(`d${i + 1}`, { pageName, euTotalReach: 5_000 - i * 500 }));
    expect(selectMarketAds(distinct, toulouse, now).ads.map((a) => a.id)).toEqual(["d1", "d2", "d3", "d4", "d5"]);
    // Sans nom du tout : chaque annonce est sa propre page
    const nameless = Array.from({ length: 5 }, (_, i) => record(`s${i + 1}`, { pageName: i % 2 === 0 ? "" : "   ", euTotalReach: 5_000 - i * 500 }));
    expect(selectMarketAds(nameless, toulouse, now).ads).toHaveLength(5);
    // La même page au nom non latin reste plafonnée
    const same = Array.from({ length: 5 }, (_, i) => record(`c${i + 1}`, { pageName: i % 2 === 0 ? "Йога Студия" : " йога студия ", euTotalReach: 5_000 - i * 500 }));
    expect(selectMarketAds(same, toulouse, now).ads.map((a) => a.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("plafond par page appliqué dans l'ordre de `ads` : la zone retenue prend les places de la page avant le complément, une annonce écartée ne consomme pas de place", () => {
    const page = { pageId: "page-1", pageName: "Cabinet Zen" };
    const records = [
      record("local-1", { ...page, ...weak, targetLocations: [loc("Toulouse")] }),
      record("local-2", { ...page, ...weak, euTotalReach: 100, targetLocations: [loc("Toulouse")] }),
      record("national-1", { ...page, ...strong }),
      record("national-2", { ...page, ...strong, euTotalReach: 30_000 }),
      record("voisin", { pageId: "page-2", targetLocations: [loc("Toulouse")], euTotalReach: 10 }),
      record("ailleurs", { pageId: "page-3", euTotalReach: 10 }),
    ];
    const selected = selectMarketAds(records, toulouse, now, { minLocal: 3 });
    expect(selected.scopeUsed).toBe("ville");
    // Les deux annonces locales de la page passent, puis sa meilleure annonce nationale ; la quatrième saute
    expect(selected.ads.map((a) => a.id)).toEqual(["local-1", "local-2", "voisin", "national-1", "ailleurs"]);
    // `max` compte les annonces conservées, pas celles que le plafond a écartées
    expect(selectMarketAds(records, toulouse, now, { minLocal: 3, max: 5 }).ads.map((a) => a.id)).toEqual(["local-1", "local-2", "voisin", "national-1", "ailleurs"]);
    expect(selectMarketAds(records, toulouse, now, { minLocal: 3, max: 4 }).ads.map((a) => a.id)).toEqual(["local-1", "local-2", "voisin", "national-1"]);
  });

  it("`maxPerPage` remplace le plafond : 1 → une annonce par page, large → aucune limite ; la zone retenue se décide avant le plafond", () => {
    const variants = Array.from({ length: 5 }, (_, i) => record(`v${i + 1}`, { pageId: "page-1", pageName: "Cabinet Zen", euTotalReach: 10_000 - i * 1_000, targetLocations: [loc("Toulouse")] }));
    const records = [...variants, record("autre", { pageId: "page-2", euTotalReach: 10 })];
    expect(selectMarketAds(records, toulouse, now, { maxPerPage: 1 }).ads.map((a) => a.id)).toEqual(["v1", "autre"]);
    expect(selectMarketAds(records, toulouse, now, { maxPerPage: 2 }).ads.map((a) => a.id)).toEqual(["v1", "v2", "autre"]);
    expect(selectMarketAds(records, toulouse, now).ads.map((a) => a.id)).toEqual(["v1", "v2", "v3", "autre"]);
    expect(selectMarketAds(records, toulouse, now, { maxPerPage: 99 }).ads).toHaveLength(6);
    // 5 annonces repérées en ville suffisent à retenir la zone, même si 3 seulement sont conservées
    const local = selectMarketAds(records, toulouse, now, { minLocal: 5 });
    expect(local.scopeUsed).toBe("ville");
    expect(local.counts.ville).toBe(5);
    expect(marketNearCount(local)).toBe(META_MARKET_MAX_PER_PAGE);
  });
});

describe("metaPageKey", () => {
  const key = (id: string, pageId: string | null, pageName: string) => metaPageKey({ id, pageId, pageName });

  it("l'identifiant de page d'abord, quel que soit le nom", () => {
    expect(key("1", "123456", "Cabinet Zen")).toBe("id:123456");
    expect(key("2", "123456", "Un autre nom")).toBe(key("1", "123456", "Cabinet Zen"));
    expect(key("3", "654321", "Cabinet Zen")).not.toBe(key("1", "123456", "Cabinet Zen"));
  });

  it("sans identifiant (null ou vide) : le nom normalisé — casse, accents et traits d'union indifférents", () => {
    expect(key("1", null, "Cabinet Zénith")).toBe("nom:cabinet zenith");
    for (const name of ["CABINET ZENITH", "cabinet-zénith", "  Cabinet   Zenith ", "Cabinet Zénith !"]) {
      expect(key("2", null, name), name).toBe("nom:cabinet zenith");
    }
    expect(key("3", "", "Cabinet Zénith")).toBe("nom:cabinet zenith");
    expect(key("4", null, "Cabinet Zen")).not.toBe(key("1", null, "Cabinet Zénith"));
  });

  it("nom sans lettre latine ni chiffre (cyrillique, idéogrammes, émojis) : le nom brut en minuscules, jamais une clé commune", () => {
    expect(key("1", null, "Йога Студия")).toBe("nom:йога студия");
    expect(key("2", null, "  йога студия ")).toBe(key("1", null, "Йога Студия"));
    const keys = ["Йога Студия", "瑜伽", "🌿", "✨✨"].map((name, i) => key(String(i), null, name));
    expect(new Set(keys).size).toBe(4);
    expect(keys.every((k) => k.startsWith("nom:") && k.length > "nom:".length)).toBe(true);
  });

  it("ni identifiant ni nom : l'annonce elle-même ; une clé d'identifiant ne se confond jamais avec une clé de nom", () => {
    expect(key("a1", null, "")).toBe("annonce:a1");
    expect(key("a2", null, "   ")).toBe("annonce:a2");
    expect(key("a3", "", "")).toBe("annonce:a3");
    expect(key("a1", null, "")).not.toBe(key("a2", null, ""));
    expect(key("x", "cabinet zen", "Sans importance")).not.toBe(key("y", null, "Cabinet Zen"));
    expect(key("x", "a1", "")).not.toBe(key("a1", null, ""));
  });
});

describe("marketScopeNote", () => {
  /** Veille : `adsCount` annonces conservées dans la zone retenue, puis le complément des zones plus larges (`wider`). */
  const market = (scopeUsed: MetaMarketScope, counts: Partial<Record<MetaMarketScope, number>>, adsCount: number, wider: MetaMarketScope[] = []) => ({
    scopeUsed,
    counts: { ville: 0, departement: 0, region: 0, france: 0, ...counts },
    ads: [...Array.from({ length: adsCount }, () => marketAd(scopeUsed)), ...wider.map((scope) => marketAd(scope))],
  });

  it("ville : phrase simple, sans mention d'élargissement ; singulier pour une annonce", () => {
    expect(marketScopeNote(market("ville", { ville: 9 }, 9), toulouse)).toBe("9 annonces autour de Toulouse.");
    expect(marketScopeNote(market("ville", { ville: 1 }, 1), toulouse)).toBe("1 annonce autour de Toulouse.");
  });

  it("département, région, France : formulation sans article piégé et mention de l'élargissement avec le compte près de chez vous (la ville seule quand le département est retenu)", () => {
    expect(marketScopeNote(market("departement", { ville: 3, departement: 5 }, 8), toulouse)).toBe("8 annonces dans votre département (Haute-Garonne). Peu de confrères font de la publicité près de chez vous (3 annonces) : la veille a été élargie pour vous inspirer.");
    expect(marketScopeNote(market("region", { ville: 2, departement: 1, region: 6 }, 9), toulouse)).toBe("9 annonces dans votre région (Occitanie). Peu de confrères font de la publicité près de chez vous (3 annonces) : la veille a été élargie pour vous inspirer.");
    expect(marketScopeNote(market("france", { france: 4 }, 4), toulouse)).toBe("4 annonces en France et dans d'autres zones. Peu de confrères font de la publicité près de chez vous (aucune annonce) : la veille a été élargie pour vous inspirer.");
    expect(marketScopeNote(market("region", {}, 2), { city: "Lille", department: departmentFromPostalCode("59000"), region: "Hauts-de-France" })).toContain("dans votre région (Hauts-de-France)");
  });

  it("annonces conservées sur annonces repérées quand toutes n'ont pas été conservées, puis le compte de la zone retenue", () => {
    expect(marketScopeNote(market("ville", { ville: 12, departement: 3, france: 5 }, 12), toulouse)).toBe("12 annonces conservées sur 20 repérées : 12 autour de Toulouse.");
    expect(marketScopeNote(market("departement", { ville: 2, departement: 9, region: 4 }, 11), toulouse)).toBe(
      "11 annonces conservées sur 15 repérées : 11 dans votre département (Haute-Garonne). Peu de confrères font de la publicité près de chez vous (2 annonces) : la veille a été élargie pour vous inspirer.",
    );
    expect(marketScopeNote(market("ville", { ville: 1, france: 1 }, 1), toulouse)).toBe("1 annonce conservée sur 2 repérées : 1 autour de Toulouse.");
    expect(marketNearbyCount({ scopeUsed: "departement", counts: { ville: 2, departement: 9, region: 0, france: 0 } })).toBe(2);
    expect(marketNearbyCount({ scopeUsed: "region", counts: { ville: 2, departement: 3, region: 9, france: 0 } })).toBe(5);
    expect(marketTotalCount({ ville: 2, departement: 3, region: 9, france: 1 })).toBe(15);
  });

  it("complément des zones plus larges : « complétée(s) par les N mieux notées ailleurs en France », accordé au nombre d'annonces de la zone", () => {
    expect(marketScopeNote(market("ville", { ville: 3, france: 2 }, 3, ["france", "france"]), toulouse)).toBe("3 annonces autour de Toulouse, complétées par les 2 mieux notées ailleurs en France.");
    expect(marketScopeNote(market("ville", { ville: 1, region: 1 }, 1, ["region"]), toulouse)).toBe("1 annonce autour de Toulouse, complétée par la mieux notée ailleurs en France.");
    expect(marketScopeNote(market("ville", { ville: 1, region: 1, france: 2 }, 1, ["region", "france", "france"]), toulouse)).toBe("1 annonce autour de Toulouse, complétée par les 3 mieux notées ailleurs en France.");
    expect(marketScopeNote(market("ville", { ville: 2, departement: 1 }, 2, ["departement"]), toulouse)).toBe("2 annonces autour de Toulouse, complétées par la mieux notée ailleurs en France.");
    // Zone élargie : le complément précède la mention de l'élargissement
    expect(marketScopeNote(market("departement", { ville: 3, departement: 5, region: 2, france: 4 }, 8, ["region", "region", "france", "france", "france", "france"]), toulouse)).toBe(
      "8 annonces dans votre département (Haute-Garonne), complétées par les 6 mieux notées ailleurs en France. Peu de confrères font de la publicité près de chez vous (3 annonces) : la veille a été élargie pour vous inspirer.",
    );
    expect(marketScopeNote(market("region", { ville: 1, region: 8, france: 1 }, 9, ["france"]), toulouse)).toBe(
      "9 annonces dans votre région (Occitanie), complétées par la mieux notée ailleurs en France. Peu de confrères font de la publicité près de chez vous (1 annonce) : la veille a été élargie pour vous inspirer.",
    );
    // Toutes les annonces repérées n'ont pas été conservées : les trois comptes se suivent
    expect(marketScopeNote(market("ville", { ville: 3, france: 17 }, 3, ["france", "france"]), toulouse)).toBe(
      "5 annonces conservées sur 20 repérées : 3 autour de Toulouse, complétées par les 2 mieux notées ailleurs en France.",
    );
  });

  it("marketNearCount : annonces conservées de la zone retenue et des plus étroites, complément exclu", () => {
    const ads = [marketAd("ville"), marketAd("departement"), marketAd("region"), marketAd("france"), marketAd("france")];
    expect(marketNearCount({ scopeUsed: "ville", ads })).toBe(1);
    expect(marketNearCount({ scopeUsed: "departement", ads })).toBe(2);
    expect(marketNearCount({ scopeUsed: "region", ads })).toBe(3);
    expect(marketNearCount({ scopeUsed: "france", ads })).toBe(5);
    expect(marketNearCount({ scopeUsed: "ville", ads: [] })).toBe(0);
    // Veille enregistrée avant le complément : `ads` ne contient que la zone retenue
    expect(marketNearCount(market("departement", {}, 4))).toBe(4);
  });

  it("de la sélection à la phrase : veille locale maigre complétée, veille locale pleine sans complément", () => {
    const thin = selectMarketAds([...inZone("ville", 3), ...inZone("departement", 5), ...inZone("region", 2), ...inZone("france", 4)], toulouse, now);
    expect(marketScopeNote(thin, toulouse)).toBe(
      "8 annonces dans votre département (Haute-Garonne), complétées par les 6 mieux notées ailleurs en France. Peu de confrères font de la publicité près de chez vous (3 annonces) : la veille a été élargie pour vous inspirer.",
    );
    const full = selectMarketAds([...inZone("ville", META_MARKET_MAX_ADS), ...inZone("france", 5)], toulouse, now);
    expect(marketScopeNote(full, toulouse)).toBe(`${META_MARKET_MAX_ADS} annonces conservées sur ${META_MARKET_MAX_ADS + 5} repérées : ${META_MARKET_MAX_ADS} autour de Toulouse.`);
    const capped = selectMarketAds([...inZone("ville", 9), ...inZone("france", 4)], toulouse, now, { max: 10 });
    expect(marketScopeNote(capped, toulouse)).toBe("10 annonces conservées sur 13 repérées : 9 autour de Toulouse, complétées par la mieux notée ailleurs en France.");
  });

  it("département ou région inconnus : pas de parenthèse vide", () => {
    const seed = { city: "Albi", department: null, region: null };
    expect(marketScopeNote(market("departement", {}, 0), seed)).toBe("0 annonce dans votre département. Peu de confrères font de la publicité près de chez vous (aucune annonce) : la veille a été élargie pour vous inspirer.");
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

describe("metaReadinessChecks — site du client (externalSite)", () => {
  const externalInput: MetaAdsDiagnosticInput = { ...readyInput, externalSite: true };

  it("mêmes dix points, mêmes libellés ; rendez-vous, Instagram, avis et fiche Google ne changent pas", () => {
    const hosted = metaReadinessChecks(readyInput);
    const external = metaReadinessChecks(externalInput);
    // Seule différence : le Pixel n'est bloquant que sur le site hébergé, où le produit sait avec certitude s'il est posé
    expect(external.map((c) => [c.id, c.label, c.critical])).toEqual(hosted.map((c) => [c.id, c.label, c.id === "pixel" ? false : c.critical]));
    expect(hosted.find((c) => c.id === "pixel")?.critical).toBe(true);
    expect(external.every((c) => c.status === "ok")).toBe(true);
    const poor: MetaAdsDiagnosticInput = { ...readyInput, hasBookingUrl: false, instagramUrl: null, photosCount: 1, profile: { linked: false, rating: null, votes: null } };
    for (const id of ["instagram", "booking", "reviews", "profile_linked"]) {
      expect(checkOf({ ...poor, externalSite: true }, id)).toEqual(checkOf(poor, id));
    }
    // Photos : même seuil, même compte quand il est atteint
    expect(checkOf(externalInput, "photos")).toEqual(checkOf(readyInput, "photos"));
    // Une page Facebook connue se dit de la même façon
    expect(checkOf(externalInput, "facebook_page")).toEqual(checkOf(readyInput, "facebook_page"));
  });

  it("Pixel : repéré sur le site du client (prises de contact à contrôler chez Meta), sinon à régler sur ce site puis site à relire — jamais bloquant", () => {
    const found = checkOf(externalInput, "pixel");
    expect(found).toMatchObject({ status: "ok", critical: false });
    expect(found.detail).toBe("Le Pixel Meta a été repéré sur votre site : contrôlez dans le Gestionnaire d'événements de Meta que vos prises de rendez-vous et vos appels y sont bien comptés.");
    // Non repéré ne veut pas dire absent (Google Tag Manager, chargement après l'accord du visiteur) : à régler, mais le
    // praticien ne pourrait pas lever un blocage que la lecture aurait posé à tort
    const missing = checkOf({ ...externalInput, hasPixel: false }, "pixel");
    expect(missing).toMatchObject({ status: "todo", critical: false });
    expect(missing.detail).toBe(
      "Aucun Pixel Meta n'a été repéré sur votre site. S'il y est déjà (chargé par Google Tag Manager, ou seulement après l'accord du visiteur, notre lecture ne le voit pas), contrôlez-le dans le Gestionnaire d'événements de Meta ; sinon, installez-le sur votre propre site (vous-même ou la personne qui s'en occupe), puis relancez la lecture de votre site depuis « Mon site ».",
    );
  });

  it("code du site jamais lu (texte collé par le praticien) : Pixel et bandeau « inconnus », rien à régler", () => {
    const unread: MetaAdsDiagnosticInput = { ...externalInput, hasPixel: false, cookieBanner: false, externalSiteUnread: true };
    expect(checkOf(unread, "pixel")).toMatchObject({ status: "unknown", critical: false, detail: EXTERNAL_SITE_CHECK_DETAILS.pixelUnread });
    expect(checkOf(unread, "pixel").detail).toBe("Nous n'avons pas pu lire le code de votre site : nous ne pouvons pas dire si le Pixel Meta y est installé. Contrôlez-le dans le Gestionnaire d'événements de Meta.");
    expect(checkOf(unread, "cookie_banner")).toMatchObject({ status: "unknown", detail: EXTERNAL_SITE_CHECK_DETAILS.cookieBannerUnread });
    // Ni blocage ni prérequis : le verdict ne dépend pas de ce que personne n'a pu lire
    expect(diagnoseMetaAds(unread)).toMatchObject({ verdict: "go", prerequisites: [] });
    // Le drapeau ne vaut que pour un site du client
    expect(checkOf({ ...readyInput, hasPixel: false, externalSiteUnread: true }, "pixel")).toMatchObject({ status: "todo", critical: true });
  });

  it("bandeau cookies : repéré → ok ; non repéré → inconnu (la lecture ne connaît pas tous les bandeaux), jamais « à régler »", () => {
    expect(checkOf(externalInput, "cookie_banner")).toMatchObject({ status: "ok", critical: false, detail: "Un bandeau cookies a été repéré sur votre site." });
    expect(checkOf({ ...externalInput, cookieBanner: false }, "cookie_banner")).toMatchObject({
      status: "unknown",
      critical: false,
      detail: "Aucun bandeau cookies n'a été repéré sur votre site : vérifiez que le Pixel ne s'y charge qu'après l'accord du visiteur.",
    });
  });

  it("page Facebook, téléphone et pages de spécialité : textes sans renvoi vers l'éditeur du site hébergé", () => {
    expect(checkOf({ ...externalInput, facebookUrl: null }, "facebook_page")).toMatchObject({
      status: "todo",
      critical: false,
      detail: "Une page Facebook est indispensable pour diffuser des annonces : indiquez son lien dans « Mon site ».",
    });
    expect(checkOf(externalInput, "phone").detail).toBe("Votre numéro de téléphone figure sur votre site.");
    expect(checkOf({ ...externalInput, hasPhone: false }, "phone")).toMatchObject({
      status: "todo",
      critical: false,
      detail: "Aucun numéro de téléphone n'a été trouvé sur votre site : affichez-le bien en vue ou, s'il y figure déjà, indiquez-le dans « Mon site ».",
    });
    expect(checkOf({ ...externalInput, hasPhone: false, hasBookingUrl: false }, "phone").critical).toBe(true);
    expect(checkOf(externalInput, "landing_pages").detail).toBe("2 pages de spécialité trouvées sur votre site : des pages d'atterrissage ciblées.");
    expect(checkOf({ ...externalInput, motifPages: 0 }, "landing_pages")).toMatchObject({
      status: "todo",
      detail: "Aucune page de spécialité n'a été trouvée sur votre site : vos annonces mèneront à votre page d'accueil.",
    });
    // Photos : elles s'ajoutent dans le studio, l'éditeur du site hébergé n'étant plus le lieu de travail du praticien
    expect(checkOf({ ...externalInput, photosCount: 2 }, "photos")).toMatchObject({
      status: "todo",
      critical: false,
      detail: "Ajoutez au moins 3 photos de vous et du cabinet dans le studio : sur Meta, le visuel fait l'essentiel du résultat.",
    });
    const worst: MetaAdsDiagnosticInput = { ...externalInput, hasPixel: false, cookieBanner: false, facebookUrl: null, hasPhone: false, motifPages: 0, photosCount: 0 };
    for (const id of ["pixel", "cookie_banner", "facebook_page", "phone", "photos", "landing_pages"]) {
      for (const input of [externalInput, worst]) {
        expect(checkOf(input, id).detail).not.toMatch(/Harmony|éditeur|Paramétrage|Tracking|Pied de page/);
      }
    }
  });

  it("site hébergé (drapeau absent) : textes d'origine", () => {
    expect(checkOf(readyInput, "pixel").detail).toBe("Les clics RDV, appels et e-mails remontent dans Meta : vos campagnes s'optimisent sur de vraies prises de contact.");
    expect(checkOf({ ...readyInput, cookieBanner: false }, "cookie_banner")).toMatchObject({
      status: "todo",
      detail: "Votre bandeau est désactivé : le Pixel partirait sans consentement. Réactivez-le dans l'éditeur (Paramètres → Tracking).",
    });
    expect(checkOf(readyInput, "cookie_banner").detail).toBe("Le Pixel se charge après consentement, comme l'exige la CNIL.");
    expect(checkOf({ ...readyInput, facebookUrl: null }, "facebook_page").detail).toBe("Une page Facebook est indispensable pour diffuser des annonces : ajoutez son lien dans l'éditeur (Pied de page → Réseaux).");
    expect(checkOf(readyInput, "phone").detail).toBe("Les appels depuis le site comptent comme des contacts.");
    expect(checkOf({ ...readyInput, hasPhone: false }, "phone").detail).toBe("Affichez un numéro sur le site : beaucoup de patients préfèrent appeler.");
    expect(checkOf({ ...readyInput, motifPages: 0 }, "landing_pages").detail).toBe("Des pages dédiées par spécialité font de meilleures pages d'atterrissage.");
    expect(checkOf({ ...readyInput, photosCount: 2 }, "photos").detail).toBe("Ajoutez au moins 3 photos de vous et du cabinet dans l'éditeur : sur Meta, le visuel fait l'essentiel du résultat.");
  });
});

describe("diagnoseMetaAds", () => {
  it("site du client : un bandeau non repéré ne bloque rien (−3, hors prérequis) ; le bilan porte le drapeau, absent pour un site hébergé", () => {
    const external: MetaAdsDiagnosticInput = { ...readyInput, externalSite: true };
    expect(diagnoseMetaAds(external, now)).toMatchObject({ verdict: "go", score: 100, prerequisites: [], externalSite: true });
    expect(diagnoseMetaAds({ ...external, cookieBanner: false }, now)).toMatchObject({ verdict: "go", score: 97, prerequisites: [] });
    // Pixel non repéré : à régler (−8), sans bloquer — sur un site que le produit n'héberge pas, « non repéré » n'est pas « absent »
    const noPixel = diagnoseMetaAds({ ...external, hasPixel: false }, now);
    expect(noPixel).toMatchObject({ verdict: "go_with_prerequisites", score: 92, externalSite: true });
    expect(noPixel.prerequisites[0]).toBe("Pixel Meta installé sur le site");
    expect("externalSite" in diagnoseMetaAds(readyInput, now)).toBe(false);
    // Site hébergé : bandeau désactivé = point à régler (−8), inchangé
    expect(diagnoseMetaAds({ ...readyInput, cookieBanner: false }, now)).toMatchObject({ verdict: "go_with_prerequisites", score: 92, prerequisites: ["Bandeau cookies actif"] });
  });

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

  it("créas enregistrées avec l'ancien chemin « /<slug> » d'une page de spécialité : connues tant que la page existe sous « /motifs/<slug> »", () => {
    const current = ["/", "/motifs/stress", "/motifs/sommeil"];
    const stored = creativeSet([creative("c1", "reassurance"), creative("c2", "education", { landingPath: "/stress" }), creative("c3", "local", { landingPath: "/motifs/sommeil" })]);
    expect(metaCreativeIssues(stored, current)).toEqual([]);
    // Page supprimée depuis : toujours signalée
    const gone = creativeSet([creative("c1", "reassurance"), creative("c2", "education", { landingPath: "/hypnose" }), creative("c3", "local")]);
    expect(metaCreativeIssues(gone, current)).toEqual(["créa 2 (Créa c2) : page d'atterrissage inconnue"]);
    // Site du client : chemins réels, sans forme imposée
    const external = ["/", "/accompagnements/stress"];
    expect(metaCreativeIssues(creativeSet([creative("c1", "reassurance"), creative("c2", "education", { landingPath: "/accompagnements/stress" }), creative("c3", "local")]), external)).toEqual([]);
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
