/**
 * Meta Ads (studio Harmony) : constantes, types JSON stockés
 * (`meta_ads_analyses`) et logique pure — graine (métier, ville, département,
 * région, termes de recherche), veille du marché à partir de la bibliothèque
 * publicitaire Meta (portée des annonces, zones ciblées, durée de diffusion,
 * élargissement automatique ville → département → région → France), diagnostic
 * déterministe (« Meta Ads est-il pertinent pour vous ? »), budget, contrats
 * des créas statiques, du plan vidéo et du plan de campagne générés par l'IA.
 * Aucune dépendance base ou IA.
 *
 * Harmony ne pilote pas de compte publicitaire Meta : la veille vient de l'API
 * officielle Ad Library (annonces publiques en Europe), le praticien crée sa
 * campagne lui-même (tuto du studio) et le site envoie les conversions au
 * Pixel (clic RDV, appel, e-mail) — source de vérité des résultats.
 */

import { adsProfessionFamily, normalizeAdsText } from "./google-ads";
import type { SocialAccentRole, SocialTemplate } from "./social";

// ─── Quotas et paramètres ────────────────────────────────────────────────────

/** Analyses complètes (veille + génération) lancées par mois et par site. */
export const META_ADS_ANALYSES_PER_MONTH = 2;
/** Régénérations (créas, plan vidéo, plan de campagne, avec instructions) par mois et par site. */
export const META_ADS_REGENERATIONS_PER_MONTH = 5;
/** Instructions libres transmises aux générateurs (caractères). */
export const META_ADS_INSTRUCTIONS_MAX = 500;
/** Pays des annonces interrogées (code ISO, bibliothèque Meta). */
export const META_AD_LIBRARY_COUNTRY = "FR";
/** Version Graph API par défaut (surchargeable par META_GRAPH_VERSION). */
export const META_GRAPH_VERSION_DEFAULT = "v22.0";
/** Annonces par page de résultats (limite de l'API). */
export const META_LIBRARY_PAGE_LIMIT = 100;
/** Appels HTTP au plus par analyse (termes × pages). */
export const META_LIBRARY_MAX_CALLS = 12;
/** Termes de recherche envoyés au plus par analyse. */
export const META_LIBRARY_TERMS_MAX = 6;
/** Annonces attendues avant d'élargir la zone (ville → département → région → France). */
export const META_MARKET_MIN_LOCAL = 8;
/** Annonces conservées dans la veille. */
export const META_MARKET_MAX_ADS = 60;
/** Annonces transmises à l'IA pour la synthèse (les mieux notées). */
export const META_MARKET_SAMPLE_FOR_AI = 30;
/** Durée de diffusion signant une annonce qui « marche » (jours). */
export const META_MARKET_STRONG_DAYS = 30;
/** Portée européenne signant une annonce qui « marche ». */
export const META_MARKET_STRONG_REACH = 10_000;

/** Limites de texte des annonces Meta. */
export const META_ADS_TEXT = {
  /** Texte principal : recommandé (au-delà, tronqué « … voir plus ») et maximum */
  primaryRecommended: 125,
  primaryMax: 2200,
  headlineMax: 40,
  descriptionMax: 30,
  /** Accroche posée sur le visuel */
  hookMax: 40,
  sublineMax: 80,
} as const;

/** Formats rendus pour chaque créa (tailles de `SOCIAL_SIZES`). */
export const META_ADS_FORMATS = ["square", "portrait", "story"] as const;
export type MetaAdsFormat = (typeof META_ADS_FORMATS)[number];

export const META_ADS_FORMAT_LABELS: Record<MetaAdsFormat, string> = {
  square: "Carré 1:1 (fil Facebook)",
  portrait: "Portrait 4:5 (fil Instagram et Facebook)",
  story: "Story et Reels 9:16",
};

export const META_ADS_CTAS = [
  { id: "BOOK_NOW", label: "Réserver" },
  { id: "LEARN_MORE", label: "En savoir plus" },
  { id: "CONTACT_US", label: "Nous contacter" },
  { id: "SEND_MESSAGE", label: "Envoyer un message" },
] as const;
export type MetaAdsCta = (typeof META_ADS_CTAS)[number]["id"];

export function isMetaAdsCta(value: unknown): value is MetaAdsCta {
  return META_ADS_CTAS.some((c) => c.id === value);
}

/** Angles créatifs d'une campagne de praticien. */
export const META_ADS_ANGLES = [
  { id: "reassurance", label: "Réassurance", description: "Lever les freins : cadre, douceur, première séance" },
  { id: "education", label: "Pédagogie", description: "Expliquer la pratique et ce qu'une séance apporte" },
  { id: "temoignage", label: "Avis et vécu", description: "Faire parler les avis Google et les parcours" },
  { id: "local", label: "Ancrage local", description: "Le cabinet, le quartier, la proximité" },
  { id: "saisonnier", label: "Moment de l'année", description: "Rentrée, hiver, printemps, vacances" },
  { id: "decouverte", label: "Première séance", description: "Inviter à franchir le pas, sans promesse" },
] as const;
export type MetaAdsAngle = (typeof META_ADS_ANGLES)[number]["id"];

export function isMetaAdsAngle(value: unknown): value is MetaAdsAngle {
  return META_ADS_ANGLES.some((a) => a.id === value);
}

/** Plan vidéo : nombre de vidéos et durées conseillées (secondes). */
export const META_VIDEO = { count: 3, minSeconds: 15, maxSeconds: 45, format: "9:16" } as const;

/** Budgets conseillés (EUR). */
export const META_ADS_BUDGET_EUR = { dailyMin: 5, dailyMax: 20, monthlyFloor: 150 } as const;

/** Repères de coût pour un cabinet local (fourchettes basses et hautes). */
export const META_ADS_BENCHMARKS = {
  cpmEur: [6, 12],
  ctr: [0.01, 0.015],
  cpcEur: [0.5, 1],
  /** Clic → contact (RDV, appel, e-mail) mesuré par le Pixel */
  contactRate: [0.03, 0.08],
} as const;

// ─── Affinité du métier avec Meta ────────────────────────────────────────────

export type MetaAffinityLevel = "forte" | "moyenne" | "faible";

export type MetaAffinity = { level: MetaAffinityLevel; reason: string };

const AFFINITY_BY_FAMILY: Record<string, MetaAffinity> = {
  sophrologue: { level: "forte", reason: "Les pratiques d'apaisement et de mieux-être créent l'envie sur Facebook et Instagram, où l'on ne cherche rien de précis." },
  hypnotherapeute: { level: "forte", reason: "L'hypnose intrigue et se raconte bien en vidéo courte : un terrain favorable sur Meta." },
  naturopathe: { level: "forte", reason: "L'hygiène de vie et le bien-être sont des sujets très suivis sur Meta, propices aux contenus pédagogiques." },
  massage: { level: "forte", reason: "Le massage se montre : visuels et vidéos d'ambiance convertissent bien sur Meta." },
  reiki: { level: "forte", reason: "Les approches énergétiques trouvent leur public sur Meta par le récit et la réassurance." },
  energeticien: { level: "forte", reason: "Les approches énergétiques trouvent leur public sur Meta par le récit et la réassurance." },
  magnetiseur: { level: "forte", reason: "Le bouche-à-oreille se prolonge naturellement sur Facebook, très utilisé localement." },
  yoga: { level: "forte", reason: "Cours et ateliers se remplissent bien par Meta, surtout avec de la vidéo." },
  nutrition: { level: "forte", reason: "Le rééquilibrage alimentaire est un sujet suivi sur Meta ; la pédagogie y convertit (sans promesse de résultat)." },
  coach: { level: "forte", reason: "L'accompagnement se vend par le récit et la confiance, le format Meta par excellence." },
  psychopraticien: { level: "moyenne", reason: "Le sujet est sensible : la réassurance fonctionne, mais les règles Meta sur les attributs personnels imposent des textes très sobres." },
  kinesiologue: { level: "moyenne", reason: "La pratique est peu connue : la pédagogie sur Meta sert d'abord à la faire comprendre." },
  reflexologue: { level: "moyenne", reason: "Souvent cherché sur Google ; Meta sert surtout la notoriété locale et la fidélisation." },
  shiatsu: { level: "moyenne", reason: "Pratique de niche : Meta aide à la faire connaître, la conversion vient ensuite par la recommandation." },
  acupuncteur: { level: "moyenne", reason: "Besoin plutôt exprimé sur Google ; Meta complète par la notoriété de quartier." },
  osteopathe: { level: "moyenne", reason: "On cherche un ostéopathe quand on a mal, d'abord sur Google ; Meta sert la notoriété et le rappel de proximité." },
  chiropracteur: { level: "moyenne", reason: "Besoin urgent exprimé sur Google ; Meta complète par la notoriété locale." },
  etiopathe: { level: "moyenne", reason: "Besoin urgent exprimé sur Google ; Meta complète par la notoriété locale." },
};

const DEFAULT_AFFINITY: MetaAffinity = { level: "moyenne", reason: "Les pratiques de bien-être trouvent leur public sur Meta par la pédagogie et la réassurance ; la conversion dépend surtout des visuels." };

/** Affinité du métier avec la publicité Meta (demande à créer, pas à capter). */
export function metaProfessionAffinity(profession: string): MetaAffinity {
  const family = adsProfessionFamily(profession);
  return AFFINITY_BY_FAMILY[family.key] ?? DEFAULT_AFFINITY;
}

// ─── Départements et régions (zones ciblées de la bibliothèque) ─────────────

export type FrDepartment = { code: string; name: string; region: string };

const R = {
  ara: "Auvergne-Rhône-Alpes",
  bfc: "Bourgogne-Franche-Comté",
  bre: "Bretagne",
  cvl: "Centre-Val de Loire",
  cor: "Corse",
  ges: "Grand Est",
  hdf: "Hauts-de-France",
  idf: "Île-de-France",
  nor: "Normandie",
  naq: "Nouvelle-Aquitaine",
  occ: "Occitanie",
  pdl: "Pays de la Loire",
  pac: "Provence-Alpes-Côte d'Azur",
} as const;

export const FR_DEPARTMENTS: readonly FrDepartment[] = [
  { code: "01", name: "Ain", region: R.ara },
  { code: "02", name: "Aisne", region: R.hdf },
  { code: "03", name: "Allier", region: R.ara },
  { code: "04", name: "Alpes-de-Haute-Provence", region: R.pac },
  { code: "05", name: "Hautes-Alpes", region: R.pac },
  { code: "06", name: "Alpes-Maritimes", region: R.pac },
  { code: "07", name: "Ardèche", region: R.ara },
  { code: "08", name: "Ardennes", region: R.ges },
  { code: "09", name: "Ariège", region: R.occ },
  { code: "10", name: "Aube", region: R.ges },
  { code: "11", name: "Aude", region: R.occ },
  { code: "12", name: "Aveyron", region: R.occ },
  { code: "13", name: "Bouches-du-Rhône", region: R.pac },
  { code: "14", name: "Calvados", region: R.nor },
  { code: "15", name: "Cantal", region: R.ara },
  { code: "16", name: "Charente", region: R.naq },
  { code: "17", name: "Charente-Maritime", region: R.naq },
  { code: "18", name: "Cher", region: R.cvl },
  { code: "19", name: "Corrèze", region: R.naq },
  { code: "2A", name: "Corse-du-Sud", region: R.cor },
  { code: "2B", name: "Haute-Corse", region: R.cor },
  { code: "21", name: "Côte-d'Or", region: R.bfc },
  { code: "22", name: "Côtes-d'Armor", region: R.bre },
  { code: "23", name: "Creuse", region: R.naq },
  { code: "24", name: "Dordogne", region: R.naq },
  { code: "25", name: "Doubs", region: R.bfc },
  { code: "26", name: "Drôme", region: R.ara },
  { code: "27", name: "Eure", region: R.nor },
  { code: "28", name: "Eure-et-Loir", region: R.cvl },
  { code: "29", name: "Finistère", region: R.bre },
  { code: "30", name: "Gard", region: R.occ },
  { code: "31", name: "Haute-Garonne", region: R.occ },
  { code: "32", name: "Gers", region: R.occ },
  { code: "33", name: "Gironde", region: R.naq },
  { code: "34", name: "Hérault", region: R.occ },
  { code: "35", name: "Ille-et-Vilaine", region: R.bre },
  { code: "36", name: "Indre", region: R.cvl },
  { code: "37", name: "Indre-et-Loire", region: R.cvl },
  { code: "38", name: "Isère", region: R.ara },
  { code: "39", name: "Jura", region: R.bfc },
  { code: "40", name: "Landes", region: R.naq },
  { code: "41", name: "Loir-et-Cher", region: R.cvl },
  { code: "42", name: "Loire", region: R.ara },
  { code: "43", name: "Haute-Loire", region: R.ara },
  { code: "44", name: "Loire-Atlantique", region: R.pdl },
  { code: "45", name: "Loiret", region: R.cvl },
  { code: "46", name: "Lot", region: R.occ },
  { code: "47", name: "Lot-et-Garonne", region: R.naq },
  { code: "48", name: "Lozère", region: R.occ },
  { code: "49", name: "Maine-et-Loire", region: R.pdl },
  { code: "50", name: "Manche", region: R.nor },
  { code: "51", name: "Marne", region: R.ges },
  { code: "52", name: "Haute-Marne", region: R.ges },
  { code: "53", name: "Mayenne", region: R.pdl },
  { code: "54", name: "Meurthe-et-Moselle", region: R.ges },
  { code: "55", name: "Meuse", region: R.ges },
  { code: "56", name: "Morbihan", region: R.bre },
  { code: "57", name: "Moselle", region: R.ges },
  { code: "58", name: "Nièvre", region: R.bfc },
  { code: "59", name: "Nord", region: R.hdf },
  { code: "60", name: "Oise", region: R.hdf },
  { code: "61", name: "Orne", region: R.nor },
  { code: "62", name: "Pas-de-Calais", region: R.hdf },
  { code: "63", name: "Puy-de-Dôme", region: R.ara },
  { code: "64", name: "Pyrénées-Atlantiques", region: R.naq },
  { code: "65", name: "Hautes-Pyrénées", region: R.occ },
  { code: "66", name: "Pyrénées-Orientales", region: R.occ },
  { code: "67", name: "Bas-Rhin", region: R.ges },
  { code: "68", name: "Haut-Rhin", region: R.ges },
  { code: "69", name: "Rhône", region: R.ara },
  { code: "70", name: "Haute-Saône", region: R.bfc },
  { code: "71", name: "Saône-et-Loire", region: R.bfc },
  { code: "72", name: "Sarthe", region: R.pdl },
  { code: "73", name: "Savoie", region: R.ara },
  { code: "74", name: "Haute-Savoie", region: R.ara },
  { code: "75", name: "Paris", region: R.idf },
  { code: "76", name: "Seine-Maritime", region: R.nor },
  { code: "77", name: "Seine-et-Marne", region: R.idf },
  { code: "78", name: "Yvelines", region: R.idf },
  { code: "79", name: "Deux-Sèvres", region: R.naq },
  { code: "80", name: "Somme", region: R.hdf },
  { code: "81", name: "Tarn", region: R.occ },
  { code: "82", name: "Tarn-et-Garonne", region: R.occ },
  { code: "83", name: "Var", region: R.pac },
  { code: "84", name: "Vaucluse", region: R.pac },
  { code: "85", name: "Vendée", region: R.pdl },
  { code: "86", name: "Vienne", region: R.naq },
  { code: "87", name: "Haute-Vienne", region: R.naq },
  { code: "88", name: "Vosges", region: R.ges },
  { code: "89", name: "Yonne", region: R.bfc },
  { code: "90", name: "Territoire de Belfort", region: R.bfc },
  { code: "91", name: "Essonne", region: R.idf },
  { code: "92", name: "Hauts-de-Seine", region: R.idf },
  { code: "93", name: "Seine-Saint-Denis", region: R.idf },
  { code: "94", name: "Val-de-Marne", region: R.idf },
  { code: "95", name: "Val-d'Oise", region: R.idf },
  { code: "971", name: "Guadeloupe", region: "Guadeloupe" },
  { code: "972", name: "Martinique", region: "Martinique" },
  { code: "973", name: "Guyane", region: "Guyane" },
  { code: "974", name: "La Réunion", region: "La Réunion" },
  { code: "976", name: "Mayotte", region: "Mayotte" },
];

/** Code postal (5 chiffres) trouvé dans une adresse, null sinon. */
export function postalCodeFrom(address: string | null | undefined): string | null {
  const match = /\b(\d{5})\b/.exec(address ?? "");
  return match ? match[1]! : null;
}

/** Département d'un code postal (Corse : 20000–20199 → 2A, 20200+ → 2B ; outre-mer : trois chiffres). */
export function departmentFromPostalCode(postalCode: string | null | undefined): FrDepartment | null {
  const cp = (postalCode ?? "").trim();
  if (!/^\d{5}$/.test(cp)) return null;
  let code: string;
  if (cp.startsWith("20")) code = Number(cp) < 20200 ? "2A" : "2B";
  else if (cp.startsWith("97") || cp.startsWith("98")) code = cp.slice(0, 3);
  else code = cp.slice(0, 2);
  return FR_DEPARTMENTS.find((d) => d.code === code) ?? null;
}

// ─── Graine ──────────────────────────────────────────────────────────────────

export type MetaAdsSeedInput = {
  profession: string;
  city: string;
  /** Adresse de la fiche Google ou du site (le code postal en est extrait) */
  address: string | null;
  /** Titres des pages de spécialités */
  specialties: string[];
  /** Noms des concurrents relevés sur Google Maps (carte de visibilité) */
  competitorNames: string[];
};

export type MetaAdsSeed = {
  profession: string;
  professionFamily: string;
  city: string;
  postalCode: string | null;
  department: FrDepartment | null;
  region: string | null;
  specialties: string[];
  competitorNames: string[];
  /** Termes envoyés à la bibliothèque (≤ META_LIBRARY_TERMS_MAX) */
  searchTerms: string[];
  country: string;
};

function cleanTerm(text: string): string {
  return text.replace(/[(){}[\]"«»<>]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Termes de recherche : le métier et ses synonymes d'abord (la bibliothèque
 * cherche dans les textes des annonces, sans ville), puis les spécialités les
 * plus courtes, puis les noms des concurrents (annonces citant leur enseigne).
 */
export function buildMetaSearchTerms(seed: Pick<MetaAdsSeed, "profession" | "specialties" | "competitorNames">, max = META_LIBRARY_TERMS_MAX): string[] {
  const family = adsProfessionFamily(seed.profession);
  const terms = unique([cleanTerm(seed.profession), ...family.synonyms.map(cleanTerm)].filter((t) => t.length >= 3)).slice(0, 3);
  const specialties = seed.specialties
    .map(cleanTerm)
    .filter((s) => s.length >= 4 && s.split(" ").length <= 4)
    .sort((a, b) => a.length - b.length)
    .slice(0, 2);
  const competitors = seed.competitorNames.map(cleanTerm).filter((c) => c.length >= 4).slice(0, 2);
  return unique([...terms, ...specialties, ...competitors]).slice(0, max);
}

export function buildMetaSeed(input: MetaAdsSeedInput): MetaAdsSeed {
  const postalCode = postalCodeFrom(input.address);
  const department = departmentFromPostalCode(postalCode);
  const profession = input.profession.replace(/\s+/g, " ").trim();
  const city = input.city.replace(/\s+/g, " ").trim();
  const specialties = unique(input.specialties.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length >= 3)).slice(0, 6);
  const competitorNames = unique(input.competitorNames.map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean)).slice(0, 6);
  const base = { profession, professionFamily: adsProfessionFamily(profession).key, city, postalCode, department, region: department?.region ?? null, specialties, competitorNames, country: META_AD_LIBRARY_COUNTRY };
  return { ...base, searchTerms: buildMetaSearchTerms(base) };
}

// ─── Annonces de la bibliothèque ─────────────────────────────────────────────

export type MetaAdLocation = { name: string; type: string | null; excluded: boolean };

/** Annonce normalisée (champs publics de la bibliothèque, textes seulement — jamais d'image). */
export type MetaAdRecord = {
  id: string;
  pageId: string | null;
  pageName: string;
  bodies: string[];
  titles: string[];
  descriptions: string[];
  captions: string[];
  /** Lien public vers l'annonce dans la bibliothèque */
  libraryUrl: string;
  /** ISO 8601, null si inconnu */
  startedAt: string | null;
  stoppedAt: string | null;
  platforms: string[];
  languages: string[];
  euTotalReach: number | null;
  targetAges: string | null;
  targetGender: string | null;
  targetLocations: MetaAdLocation[];
  payer: string | null;
};

export const META_MARKET_SCOPES = ["ville", "departement", "region", "france"] as const;
export type MetaMarketScope = (typeof META_MARKET_SCOPES)[number];

export const META_MARKET_SCOPE_LABELS: Record<MetaMarketScope, string> = {
  ville: "Autour de vous",
  departement: "Votre département",
  region: "Votre région",
  france: "En France",
};

export type MetaMarketSignal = "fort" | "moyen" | "faible";

export type MetaMarketAd = MetaAdRecord & {
  scope: MetaMarketScope;
  active: boolean;
  runningDays: number | null;
  signal: MetaMarketSignal;
  score: number;
  /** Termes de recherche qui ont remonté l'annonce */
  matchedTerms: string[];
};

/** Synthèse de l'IA sur les annonces de la veille (identifiants d'annonces en référence). */
export type MetaMarketInsights = {
  summary: string;
  angles: { label: string; description: string; adIds: string[] }[];
  hooks: string[];
  offers: string[];
  formats: string;
  seasonality: string;
  /** Ce que personne ne fait encore localement */
  gaps: string[];
  warnings: string[];
};

export type MetaAdsMarket = {
  version: 1;
  source: "meta" | "mock";
  /** ISO 8601 */
  fetchedAt: string;
  country: string;
  terms: string[];
  /** Zone retenue après élargissement */
  scopeUsed: MetaMarketScope;
  counts: Record<MetaMarketScope, number>;
  ads: MetaMarketAd[];
  /** Appels HTTP effectués */
  calls: number;
  truncated: boolean;
  insights: MetaMarketInsights | null;
};

export function metaLibraryUrl(adId: string): string {
  return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(adId)}`;
}

function dateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Jours de diffusion (jusqu'à l'arrêt, sinon jusqu'à `now`), null sans date de début. */
export function adRunningDays(ad: Pick<MetaAdRecord, "startedAt" | "stoppedAt">, now = new Date()): number | null {
  const start = dateOrNull(ad.startedAt);
  if (!start) return null;
  const end = dateOrNull(ad.stoppedAt) ?? now;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

export function adIsActive(ad: Pick<MetaAdRecord, "stoppedAt">, now = new Date()): boolean {
  const stop = dateOrNull(ad.stoppedAt);
  return stop === null || stop.getTime() > now.getTime();
}

/** Signal de performance : personne ne paie longtemps une annonce qui ne marche pas. */
export function adSignal(runningDays: number | null, reach: number | null): MetaMarketSignal {
  if ((runningDays ?? 0) >= META_MARKET_STRONG_DAYS && (reach ?? 0) >= META_MARKET_STRONG_REACH) return "fort";
  if ((runningDays ?? 0) >= 14 || (reach ?? 0) >= 3_000) return "moyen";
  return "faible";
}

export function adScore(runningDays: number | null, reach: number | null, active: boolean): number {
  return Math.round((Math.log10((reach ?? 0) + 1) + Math.min(runningDays ?? 0, 120) / 30 + (active ? 0.5 : 0)) * 100) / 100;
}

function locationMatches(locations: MetaAdLocation[], name: string | null | undefined): boolean {
  const needle = normalizeAdsText(name ?? "");
  if (needle === "") return false;
  return locations.some((l) => !l.excluded && ` ${normalizeAdsText(l.name)} `.includes(` ${needle} `));
}

/** Zone la plus étroite dans laquelle l'annonce est diffusée, d'après ses zones ciblées. */
export function scopeOfAd(ad: Pick<MetaAdRecord, "targetLocations">, seed: Pick<MetaAdsSeed, "city" | "department" | "region">): MetaMarketScope {
  if (locationMatches(ad.targetLocations, seed.city)) return "ville";
  if (locationMatches(ad.targetLocations, seed.department?.name)) return "departement";
  if (locationMatches(ad.targetLocations, seed.region)) return "region";
  return "france";
}

export type SelectMarketAdsOptions = {
  minLocal?: number;
  max?: number;
  /** Termes qui ont remonté chaque annonce (id → termes) */
  matchedTerms?: Record<string, string[]>;
};

/**
 * Veille : zone retenue = la plus étroite qui rassemble au moins `minLocal`
 * annonces (ville, puis département, région, France), annonces notées (portée,
 * durée, diffusion en cours) et dédoublonnées par identifiant.
 */
export function selectMarketAds(
  records: MetaAdRecord[],
  seed: Pick<MetaAdsSeed, "city" | "department" | "region">,
  now = new Date(),
  opts: SelectMarketAdsOptions = {},
): { ads: MetaMarketAd[]; scopeUsed: MetaMarketScope; counts: Record<MetaMarketScope, number> } {
  const minLocal = opts.minLocal ?? META_MARKET_MIN_LOCAL;
  const max = opts.max ?? META_MARKET_MAX_ADS;
  const byId = new Map<string, MetaMarketAd>();
  for (const record of records) {
    if (!record.id || byId.has(record.id)) continue;
    const runningDays = adRunningDays(record, now);
    const active = adIsActive(record, now);
    byId.set(record.id, {
      ...record,
      scope: scopeOfAd(record, seed),
      active,
      runningDays,
      signal: adSignal(runningDays, record.euTotalReach),
      score: adScore(runningDays, record.euTotalReach, active),
      matchedTerms: opts.matchedTerms?.[record.id] ?? [],
    });
  }
  const all = [...byId.values()];
  const counts: Record<MetaMarketScope, number> = { ville: 0, departement: 0, region: 0, france: 0 };
  for (const ad of all) counts[ad.scope]++;

  let scopeUsed: MetaMarketScope = "france";
  let cumulative = 0;
  for (const scope of META_MARKET_SCOPES) {
    cumulative += counts[scope];
    if (cumulative >= minLocal) {
      scopeUsed = scope;
      break;
    }
  }
  const rank = (scope: MetaMarketScope) => META_MARKET_SCOPES.indexOf(scope);
  const ads = all
    .filter((ad) => rank(ad.scope) <= rank(scopeUsed))
    .sort((a, b) => rank(a.scope) - rank(b.scope) || b.score - a.score || a.pageName.localeCompare(b.pageName, "fr"))
    .slice(0, max);
  return { ads, scopeUsed, counts };
}

/** Phrase de contexte de la veille (zone retenue, élargissement). */
export function marketScopeNote(market: Pick<MetaAdsMarket, "scopeUsed" | "counts" | "ads">, seed: Pick<MetaAdsSeed, "city" | "department" | "region">): string {
  const local = market.counts.ville + market.counts.departement;
  const where =
    market.scopeUsed === "ville"
      ? `autour de ${seed.city}`
      : market.scopeUsed === "departement"
        ? `dans ${seed.department?.name ?? "votre département"}`
        : market.scopeUsed === "region"
          ? `en ${seed.region ?? "région"}`
          : "en France";
  const widened = market.scopeUsed !== "ville" ? ` Peu d'annonces près de chez vous (${local}) : la veille a été élargie.` : "";
  return `${market.ads.length} annonce${market.ads.length > 1 ? "s" : ""} ${where}.${widened}`;
}

// ─── Diagnostic ──────────────────────────────────────────────────────────────

export type MetaAdsCheckId =
  | "pixel"
  | "cookie_banner"
  | "facebook_page"
  | "instagram"
  | "booking"
  | "phone"
  | "photos"
  | "reviews"
  | "profile_linked"
  | "landing_pages";

export type MetaAdsReadinessStatus = "ok" | "todo" | "unknown";

export type MetaAdsReadinessCheck = {
  id: MetaAdsCheckId;
  label: string;
  status: MetaAdsReadinessStatus;
  detail: string;
  critical: boolean;
};

export type MetaAdsDiagnosticInput = {
  profession: string;
  city: string;
  hasBookingUrl: boolean;
  hasPhone: boolean;
  /** Identifiant du Pixel renseigné dans le suivi du site */
  hasPixel: boolean;
  /** Bandeau cookies actif sur le site */
  cookieBanner: boolean;
  /** Photos du site disponibles pour les visuels */
  photosCount: number;
  facebookUrl: string | null;
  instagramUrl: string | null;
  motifPages: number;
  profile: { linked: boolean; rating: number | null; votes: number | null };
  market: Pick<MetaAdsMarket, "scopeUsed" | "counts" | "ads"> | null;
};

export type MetaAdsBudgetEstimate = {
  dailyMinEur: number;
  dailyRecommendedEur: number;
  monthlyMinEur: number;
  monthlyRecommendedEur: number;
  clicksMin: number;
  clicksMax: number;
  contactsMin: number;
  contactsMax: number;
};

export type MetaAdsVerdict = "go" | "go_with_prerequisites" | "wait";

export type MetaAdsDiagnostic = {
  version: 1;
  generatedAt: string;
  verdict: MetaAdsVerdict;
  score: number;
  headline: string;
  summary: string;
  affinity: MetaAffinity;
  checks: MetaAdsReadinessCheck[];
  prerequisites: string[];
  budget: MetaAdsBudgetEstimate;
  /** Lecture de la veille : concurrence locale faible ou forte */
  marketNote: string | null;
};

function round10(value: number): number {
  return Math.round(value / 10) * 10;
}

/** Budget conseillé selon l'affinité ; clics et contacts d'après les repères de coût. */
export function estimateMetaBudget(affinity: MetaAffinityLevel): MetaAdsBudgetEstimate {
  const dailyRecommendedEur = affinity === "forte" ? 10 : affinity === "moyenne" ? 8 : 6;
  const dailyMinEur = META_ADS_BUDGET_EUR.dailyMin;
  const monthlyRecommendedEur = Math.max(META_ADS_BUDGET_EUR.monthlyFloor, round10(dailyRecommendedEur * 30.4));
  const monthlyMinEur = round10(dailyMinEur * 30.4);
  const [cpcLow, cpcHigh] = META_ADS_BENCHMARKS.cpcEur;
  const [rateLow, rateHigh] = META_ADS_BENCHMARKS.contactRate;
  const clicksMin = Math.floor(monthlyMinEur / cpcHigh);
  const clicksMax = Math.floor(monthlyRecommendedEur / cpcLow);
  return {
    dailyMinEur,
    dailyRecommendedEur,
    monthlyMinEur,
    monthlyRecommendedEur,
    clicksMin,
    clicksMax,
    contactsMin: Math.floor(clicksMin * rateLow),
    contactsMax: Math.ceil(clicksMax * rateHigh),
  };
}

function check(id: MetaAdsCheckId, label: string, status: MetaAdsReadinessStatus, detail: string, critical: boolean): MetaAdsReadinessCheck {
  return { id, label, status, detail, critical };
}

/** Points de préparation, dans l'ordre d'affichage. Le Pixel est bloquant : sans lui, aucune donnée réelle de conversion. */
export function metaReadinessChecks(input: MetaAdsDiagnosticInput): MetaAdsReadinessCheck[] {
  const contactCritical = !input.hasBookingUrl && !input.hasPhone;
  const p = input.profile;
  const reviewsStatus: MetaAdsReadinessStatus = p.votes === null || p.rating === null ? "unknown" : p.votes >= 10 && p.rating >= 4.3 ? "ok" : "todo";
  return [
    check(
      "pixel",
      "Pixel Meta installé sur le site",
      input.hasPixel ? "ok" : "todo",
      input.hasPixel
        ? "Les clics RDV, appels et e-mails remontent dans Meta : vos campagnes s'optimisent sur de vraies prises de contact."
        : "Collez l'identifiant de votre Pixel dans l'onglet Paramétrage & suivi : c'est la seule façon de mesurer de vraies prises de contact et de laisser Meta optimiser dessus.",
      true,
    ),
    check(
      "cookie_banner",
      "Bandeau cookies actif",
      input.cookieBanner ? "ok" : "todo",
      input.cookieBanner ? "Le Pixel se charge après consentement, comme l'exige la CNIL." : "Votre bandeau est désactivé : le Pixel partirait sans consentement. Réactivez-le dans l'éditeur (Paramètres → Tracking).",
      false,
    ),
    check(
      "facebook_page",
      "Page Facebook reliée au site",
      input.facebookUrl ? "ok" : "todo",
      input.facebookUrl ? "Vos annonces seront diffusées au nom de cette page." : "Une page Facebook est indispensable pour diffuser des annonces : ajoutez son lien dans l'éditeur (Pied de page → Réseaux).",
      false,
    ),
    check(
      "instagram",
      "Compte Instagram professionnel",
      input.instagramUrl ? "ok" : "unknown",
      input.instagramUrl ? "Les placements Instagram (fil, stories, Reels) sont ouverts." : "Associez un compte Instagram professionnel à votre page pour diffuser aussi sur Instagram.",
      false,
    ),
    check(
      "booking",
      "Prise de rendez-vous en ligne",
      input.hasBookingUrl ? "ok" : "todo",
      input.hasBookingUrl ? "Le clic « Prendre rendez-vous » est l'événement de conversion principal." : "Sans lien de réservation, chaque clic payé doit aboutir à un appel : ajoutez votre lien de prise de rendez-vous dans le studio.",
      contactCritical,
    ),
    check(
      "phone",
      "Numéro de téléphone affiché",
      input.hasPhone ? "ok" : "todo",
      input.hasPhone ? "Les appels depuis le site comptent comme des contacts." : "Affichez un numéro sur le site : beaucoup de patients préfèrent appeler.",
      contactCritical,
    ),
    check(
      "photos",
      "Photos pour les visuels",
      input.photosCount >= 3 ? "ok" : "todo",
      input.photosCount >= 3 ? `${input.photosCount} photos disponibles pour vos annonces.` : "Ajoutez au moins 3 photos de vous et du cabinet dans l'éditeur : sur Meta, le visuel fait l'essentiel du résultat.",
      false,
    ),
    check(
      "reviews",
      "Avis Google rassurants",
      reviewsStatus,
      reviewsStatus === "ok" ? `${p.votes} avis, note ${p.rating} : de quoi rassurer après le clic.` : reviewsStatus === "unknown" ? "Reliez et synchronisez votre fiche Google pour afficher vos avis." : "Visez au moins 10 avis et une note ≥ 4,3 : les visiteurs venus d'une annonce vérifient les avis avant de contacter.",
      false,
    ),
    check(
      "profile_linked",
      "Fiche Google reliée",
      p.linked ? "ok" : "todo",
      p.linked ? "Vos avis alimentent les annonces « Avis et vécu »." : "Reliez votre fiche dans la section Fiche Google pour réutiliser vos avis dans les annonces.",
      false,
    ),
    check(
      "landing_pages",
      "Pages de spécialités dédiées",
      input.motifPages > 0 ? "ok" : "todo",
      input.motifPages > 0 ? `${input.motifPages} page${input.motifPages > 1 ? "s" : ""} de spécialité pour accueillir les clics.` : "Des pages dédiées par spécialité font de meilleures pages d'atterrissage.",
      false,
    ),
  ];
}

const META_HEADLINES: Record<MetaAdsVerdict, string> = {
  go: "Meta Ads est pertinent pour votre cabinet",
  go_with_prerequisites: "Meta Ads est pertinent, après quelques réglages",
  wait: "Avant de lancer Meta Ads, installez le Pixel et réglez les points bloquants",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function diagnoseMetaAds(input: MetaAdsDiagnosticInput, now = new Date()): MetaAdsDiagnostic {
  const affinity = metaProfessionAffinity(input.profession);
  const checks = metaReadinessChecks(input);
  const criticalTodos = checks.filter((c) => c.status === "todo" && c.critical);
  const minorTodos = checks.filter((c) => c.status === "todo" && !c.critical);
  const unknowns = checks.filter((c) => c.status === "unknown");
  const verdict: MetaAdsVerdict = criticalTodos.length > 0 ? "wait" : minorTodos.length > 0 ? "go_with_prerequisites" : "go";
  const affinityPenalty = affinity.level === "forte" ? 0 : affinity.level === "moyenne" ? 5 : 15;
  const score = clamp(100 - affinityPenalty - criticalTodos.length * 20 - minorTodos.length * 8 - unknowns.length * 3, 0, 100);
  const budget = estimateMetaBudget(affinity.level);

  let marketNote: string | null = null;
  if (input.market) {
    const local = input.market.counts.ville + input.market.counts.departement;
    const strong = input.market.ads.filter((a) => a.signal === "fort").length;
    marketNote =
      local === 0
        ? "Aucune annonce repérée près de chez vous : la place est libre et les coûts d'affichage devraient rester bas."
        : local < META_MARKET_MIN_LOCAL
          ? `${local} annonce${local > 1 ? "s" : ""} près de chez vous : concurrence publicitaire faible, de la place à prendre.`
          : `${local} annonces près de chez vous${strong > 0 ? `, dont ${strong} diffusée${strong > 1 ? "s" : ""} depuis longtemps avec une large portée` : ""} : le marché local est actif, vos visuels devront se démarquer.`;
  }

  const budgetSentence = `Budget conseillé : ${budget.dailyRecommendedEur} € par jour (${budget.monthlyRecommendedEur} € par mois, ${budget.monthlyMinEur} € au minimum), soit ${budget.clicksMin}–${budget.clicksMax} visites et ${budget.contactsMin}–${budget.contactsMax} prises de contact attendues, mesurées par le Pixel.`;
  return {
    version: 1,
    generatedAt: now.toISOString(),
    verdict,
    score,
    headline: META_HEADLINES[verdict],
    summary: `${affinity.reason} ${budgetSentence}`,
    affinity,
    checks,
    prerequisites: [...criticalTodos, ...minorTodos].map((c) => c.label),
    budget,
    marketNote,
  };
}

// ─── Créas statiques (contrat du générateur) ─────────────────────────────────

export type MetaAdCreative = {
  /** Identifiant stable dans l'analyse (« c1 »…) */
  id: string;
  angle: MetaAdsAngle;
  /** Nom court affiché (≤ 40) */
  name: string;
  /** Texte principal (≤ META_ADS_TEXT.primaryMax ; les 125 premiers caractères portent le message) */
  primaryText: string;
  /** ≤ 40 */
  headline: string;
  /** ≤ 30 */
  description: string;
  cta: MetaAdsCta;
  /** Accroche posée sur le visuel (≤ 40) */
  hook: string;
  /** Ligne secondaire du visuel (≤ 80) */
  subline: string;
  /** Photo du brief (« p3 »), null = visuel sans photo */
  photoId: string | null;
  template: SocialTemplate;
  accentRole: SocialAccentRole;
  altText: string;
  /** Page d'atterrissage sur le site (« / » ou « /<slug> ») */
  landingPath: string;
};

export type MetaAdsCreativeSet = {
  version: 1;
  generatedAt: string;
  generator: "anthropic" | "mock";
  /** 3 à 5 créas, un angle différent chacune */
  creatives: MetaAdCreative[];
  /** Conseils de déclinaison et de test */
  notes: string[];
};

export const META_CREATIVES_MIN = 3;
export const META_CREATIVES_MAX = 5;

// ─── Plan vidéo (à tourner et monter soi-même) ───────────────────────────────

export type MetaVideoBeat = {
  /** Seconde de début */
  at: number;
  /** Ce que dit le praticien (ou voix off) */
  say: string;
  /** Texte incrusté à l'écran (≤ 60) */
  onScreen: string;
  /** Plan : cadrage, lieu, action */
  shot: string;
};

export type MetaVideoBrief = {
  id: string;
  title: string;
  angle: MetaAdsAngle;
  /** Objectif de la vidéo en une phrase */
  goal: string;
  durationSeconds: number;
  format: "9:16";
  /** Les 3 premières secondes */
  hook: string;
  beats: MetaVideoBeat[];
  /** Plans à tourner (liste de courses) */
  shotList: string[];
  /** Ce qu'il faut dire, et ne pas dire (règles santé et Meta) */
  doSay: string[];
  dontSay: string[];
  cta: MetaAdsCta;
  /** Texte principal à coller avec la vidéo */
  caption: string;
};

export type MetaAdsVideoPlan = {
  version: 1;
  generatedAt: string;
  generator: "anthropic" | "mock";
  videos: MetaVideoBrief[];
  /** Matériel et réglages (smartphone, lumière, son) */
  equipment: string[];
  /** Montage : rythme, sous-titres, musique, export */
  editingTips: string[];
};

// ─── Plan de campagne ────────────────────────────────────────────────────────

export const META_PIXEL_EVENTS = ["Schedule", "Contact", "Lead"] as const;
export type MetaPixelEvent = (typeof META_PIXEL_EVENTS)[number];

export type MetaAdsPlan = {
  version: 1;
  generatedAt: string;
  generator: "anthropic" | "mock";
  objective: {
    /** conversions_site : Pixel sur le site (toujours privilégié) ; traffic : repli tant que le Pixel manque */
    type: "conversions_site" | "traffic";
    pixelEvent: MetaPixelEvent;
    rationale: string;
  };
  campaign: {
    name: string;
    geo: { city: string; radiusKm: number; note: string };
    ages: { min: number; max: number };
    gender: "all";
    placements: string;
    language: "fr";
    schedule: string;
  };
  adSets: {
    name: string;
    audience: "large" | "interets" | "retargeting";
    details: string;
    /** Identifiants des créas (MetaAdCreative.id) et des vidéos (MetaVideoBrief.id) */
    creativeIds: string[];
  }[];
  budget: {
    dailyEur: number;
    monthlyEur: number;
    testPlan: string;
  };
  milestones: { horizon: string; title: string; actions: string[]; kpis: string[] }[];
  tips: string[];
};

export type MetaAdsLandingPage = { path: string; title: string; kind: "home" | "motif" };

export type MetaAdsGenerationInput = {
  diagnostic: MetaAdsDiagnostic;
  market: MetaAdsMarket | null;
  landingPages: MetaAdsLandingPage[];
  /** Instructions libres (≤ META_ADS_INSTRUCTIONS_MAX, nettoyées) */
  instructions?: string;
};

export type MetaAdsPlanInput = MetaAdsGenerationInput & {
  creatives: MetaAdsCreativeSet | null;
  videoPlan: MetaAdsVideoPlan | null;
};

// ─── Conformité (règles Meta sur les attributs personnels, avant/après) ──────

/**
 * Formulations qui affirment ou laissent entendre connaître l'état de santé,
 * le poids ou l'état émotionnel du lecteur (interdites par Meta), et les
 * avant/après.
 */
export const META_PERSONAL_ATTRIBUTE_PATTERNS: { rule: string; pattern: RegExp }[] = [
  { rule: "attribut personnel : « vous souffrez / vous avez mal »", pattern: /\b(vous|tu)\s+(souffrez|souffres|avez\s+mal|as\s+mal|n'arrivez\s+plus|n'arrives\s+plus)\b/i },
  { rule: "attribut personnel : « vous êtes stressé·e / anxieux·se / déprimé·e / fatigué·e / en surpoids »", pattern: /\b(vous\s+êtes|tu\s+es)\s+(stress|anxieu|angoiss|déprim|deprim|fatigu|épuis|epuis|en\s+surpoids|obèse|obese|malade)/i },
  { rule: "attribut personnel : « votre stress / votre anxiété / votre dépression / votre poids / votre douleur »", pattern: /\b(votre|ton|ta)\s+(stress|anxiété|anxiete|angoisse|dépression|depression|burn[- ]?out|surpoids|poids|douleur|maladie|insomnie)\b/i },
  { rule: "avant / après", pattern: /\bavant\s*[/\-–]\s*après\b|\bavant\s+et\s+après\b/i },
  { rule: "diagnostic implicite : « si vous souffrez de »", pattern: /\bsi\s+(vous|tu)\s+(souffrez|souffres|avez|as)\b/i },
];

/** Règles enfreintes par un texte d'annonce (vide = conforme à ces motifs). */
export function metaPersonalAttributeViolations(text: string): string[] {
  return META_PERSONAL_ATTRIBUTE_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.rule);
}

/** Tronque un texte à `max` caractères sur une limite de mot ou de tiret, sans ponctuation pendante. */
export function clampMetaText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const boundary = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("-"));
  const base = boundary >= Math.floor(max * 0.6) ? cut.slice(0, boundary) : cut;
  return base.replace(/[\s,;:(\-–—]+$/g, "").trim();
}

/** Écarts d'un jeu de créas au contrat (vide = conforme). */
export function metaCreativeIssues(set: MetaAdsCreativeSet, landingPaths?: readonly string[]): string[] {
  const issues: string[] = [];
  if (set.creatives.length < META_CREATIVES_MIN || set.creatives.length > META_CREATIVES_MAX) issues.push(`${set.creatives.length} créas (attendu ${META_CREATIVES_MIN} à ${META_CREATIVES_MAX})`);
  const ids = new Set<string>();
  set.creatives.forEach((c, i) => {
    const where = `créa ${i + 1} (${c.name})`;
    if (ids.has(c.id)) issues.push(`${where} : identifiant en double`);
    ids.add(c.id);
    if (!isMetaAdsAngle(c.angle)) issues.push(`${where} : angle inconnu`);
    if (!isMetaAdsCta(c.cta)) issues.push(`${where} : bouton inconnu`);
    if (c.primaryText.trim() === "" || c.primaryText.length > META_ADS_TEXT.primaryMax) issues.push(`${where} : texte principal vide ou trop long`);
    if (c.headline.trim() === "" || c.headline.length > META_ADS_TEXT.headlineMax) issues.push(`${where} : titre vide ou > ${META_ADS_TEXT.headlineMax}`);
    if (c.description.length > META_ADS_TEXT.descriptionMax) issues.push(`${where} : description > ${META_ADS_TEXT.descriptionMax}`);
    if (c.hook.trim() === "" || c.hook.length > META_ADS_TEXT.hookMax) issues.push(`${where} : accroche vide ou > ${META_ADS_TEXT.hookMax}`);
    if (c.subline.length > META_ADS_TEXT.sublineMax) issues.push(`${where} : ligne secondaire > ${META_ADS_TEXT.sublineMax}`);
    if (!c.landingPath.startsWith("/")) issues.push(`${where} : page d'atterrissage invalide`);
    if (landingPaths && !landingPaths.includes(c.landingPath)) issues.push(`${where} : page d'atterrissage inconnue`);
    for (const text of [c.primaryText, c.headline, c.description, c.hook, c.subline]) {
      for (const rule of metaPersonalAttributeViolations(text)) issues.push(`${where} : ${rule}`);
    }
  });
  return issues;
}

/** Écarts d'un plan vidéo au contrat (vide = conforme). */
export function metaVideoPlanIssues(plan: MetaAdsVideoPlan): string[] {
  const issues: string[] = [];
  if (plan.videos.length === 0) issues.push("aucune vidéo");
  plan.videos.forEach((v, i) => {
    const where = `vidéo ${i + 1} (${v.title})`;
    if (v.durationSeconds < META_VIDEO.minSeconds || v.durationSeconds > META_VIDEO.maxSeconds) issues.push(`${where} : durée hors ${META_VIDEO.minSeconds}–${META_VIDEO.maxSeconds} s`);
    if (v.beats.length < 3) issues.push(`${where} : moins de 3 temps`);
    if (v.hook.trim() === "") issues.push(`${where} : accroche vide`);
    if (!isMetaAdsCta(v.cta)) issues.push(`${where} : bouton inconnu`);
    v.beats.forEach((b, bi) => {
      if (b.at < 0 || b.at > v.durationSeconds) issues.push(`${where}, temps ${bi + 1} : seconde hors durée`);
      if (b.onScreen.length > 60) issues.push(`${where}, temps ${bi + 1} : texte à l'écran > 60`);
    });
    for (const text of [v.hook, v.caption, ...v.beats.map((b) => b.say), ...v.beats.map((b) => b.onScreen)]) {
      for (const rule of metaPersonalAttributeViolations(text)) issues.push(`${where} : ${rule}`);
    }
  });
  return issues;
}

/** Écarts d'un plan de campagne au contrat (vide = conforme). */
export function metaPlanIssues(plan: MetaAdsPlan, hasPixel: boolean): string[] {
  const issues: string[] = [];
  if (hasPixel && plan.objective.type !== "conversions_site") issues.push("objectif : le Pixel est installé, l'objectif doit être les conversions sur le site");
  if (!META_PIXEL_EVENTS.includes(plan.objective.pixelEvent)) issues.push("événement Pixel inconnu");
  if (plan.adSets.length === 0) issues.push("aucun ensemble de publicités");
  if (plan.budget.dailyEur < META_ADS_BUDGET_EUR.dailyMin || plan.budget.dailyEur > META_ADS_BUDGET_EUR.dailyMax * 2) issues.push("budget quotidien hors bornes");
  if (plan.campaign.ages.min < 18 || plan.campaign.ages.max > 65 || plan.campaign.ages.min >= plan.campaign.ages.max) issues.push("tranche d'âge invalide");
  if (plan.milestones.length < 3) issues.push("moins de 3 jalons");
  return issues;
}

// ─── Analyse stockée ─────────────────────────────────────────────────────────

export const META_ADS_ANALYSIS_STATUSES = ["running", "done", "error"] as const;
export type MetaAdsAnalysisStatus = (typeof META_ADS_ANALYSIS_STATUSES)[number];

// ─── Mesure (site) ───────────────────────────────────────────────────────────

/** Paramètres d'URL signant une visite venue d'une annonce Meta (fbclid, ou UTM payant Facebook/Instagram). */
export function isMetaAdsLanding(search: string): boolean {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return false;
  }
  if (params.has("fbclid")) return true;
  const source = (params.get("utm_source") ?? "").toLowerCase();
  const medium = (params.get("utm_medium") ?? "").toLowerCase();
  return ["facebook", "instagram", "meta", "fb", "ig"].includes(source) && ["cpc", "ppc", "paid", "paidsocial", "paid_social", "ads", "social_paid"].includes(medium);
}
