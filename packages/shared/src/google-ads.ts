/**
 * Google Ads (studio Harmony) : constantes, types JSON stockés
 * (`google_ads_analyses`) et logique pure — graines de mots-clés à partir du
 * métier, de la ville et des spécialités ; sélection, regroupement par
 * intention et mots-clés négatifs à partir des idées renvoyées par le
 * fournisseur (DataForSEO, Google Ads Keywords Data) ; diagnostic
 * déterministe (« Google Ads est-il pertinent pour vous ? ») ; estimation de
 * budget ; contrat du plan d'action généré par l'IA. Aucune dépendance base ou IA.
 *
 * Harmony ne pilote pas de compte Google Ads : l'analyse, les mots-clés et le
 * plan sont préparés ici, le praticien paramètre lui-même sa campagne (tuto du
 * studio) et le site envoie les conversions (clic RDV, appel, e-mail).
 */

// ─── Quotas, coûts et paramètres ─────────────────────────────────────────────

/** Analyses de mots-clés (appels DataForSEO) lancées par mois et par site. */
export const GOOGLE_ADS_ANALYSES_PER_MONTH = 2;
/** Régénérations du plan d'action (IA, avec instructions) par mois et par site. */
export const GOOGLE_ADS_PLAN_REGENERATIONS_PER_MONTH = 5;
/** Instructions libres transmises au planificateur (caractères). */
export const GOOGLE_ADS_INSTRUCTIONS_MAX = 500;
/** France (identifiant de zone Google Ads / DataForSEO). */
export const GOOGLE_ADS_LOCATION_CODE_FR = 2250;
export const GOOGLE_ADS_LANGUAGE_CODE = "fr";
/** Graines envoyées au fournisseur (limite de l'endpoint « keywords for keywords »). */
export const GOOGLE_ADS_SEEDS_MAX = 20;
/** Mots-clés conservés après sélection. */
export const GOOGLE_ADS_KEYWORDS_MAX = 60;
/** Mots-clés « cœur » (meilleurs scores) : envoyés à la prévision, mis en avant. */
export const GOOGLE_ADS_CORE_MAX = 15;
/** Volume mensuel minimal pour retenir une idée (sauf graine ou mot-clé suivi). */
export const GOOGLE_ADS_MIN_VOLUME = 10;
/** Taux de conversion USD → EUR appliqué aux CPC et coûts du fournisseur (estimation). */
export const USD_TO_EUR_RATE = 0.92;
/** Coûts unitaires DataForSEO (USD, mode immédiat, par requête quel que soit le nombre de mots-clés). */
export const DATAFORSEO_ADS_UNIT_COSTS = {
  keywordIdeasLive: 0.09,
  adTrafficLive: 0.09,
} as const;
/** Coût estimé d'une analyse complète (idées + prévision), réservé sur le budget mensuel avant appel. */
export const GOOGLE_ADS_ANALYSIS_COST_USD = DATAFORSEO_ADS_UNIT_COSTS.keywordIdeasLive + DATAFORSEO_ADS_UNIT_COSTS.adTrafficLive;
/** Objectif de clics mensuels servant de base au budget conseillé. */
export const GOOGLE_ADS_TARGET_CLICKS = 100;
/** Bornes du budget mensuel conseillé (EUR). */
export const GOOGLE_ADS_BUDGET_EUR = { floor: 90, min: 150, max: 600 } as const;
/** Taux de contact (clic → appel, RDV ou e-mail) retenus pour les fourchettes. */
export const GOOGLE_ADS_CONVERSION_RATES = { low: 0.05, high: 0.12 } as const;
/** CPC supposé quand le fournisseur n'en renvoie aucun (EUR). */
export const GOOGLE_ADS_DEFAULT_CPC_EUR = 1.5;
/** Rayon de diffusion conseillé autour du cabinet (km). */
export const GOOGLE_ADS_RADIUS_KM = 15;

/** Limites des annonces responsives sur le Réseau de Recherche. */
export const GOOGLE_ADS_RSA = {
  headlineMax: 30,
  descriptionMax: 90,
  headlinesMin: 5,
  headlinesMax: 15,
  descriptionsMin: 2,
  descriptionsMax: 4,
  pathMax: 15,
} as const;

// ─── Intentions et types de correspondance ───────────────────────────────────

export const GOOGLE_ADS_MATCH_TYPES = ["exact", "phrase", "broad"] as const;
export type GoogleAdsMatchType = (typeof GOOGLE_ADS_MATCH_TYPES)[number];

export const GOOGLE_ADS_MATCH_LABELS: Record<GoogleAdsMatchType, string> = {
  exact: "Exact",
  phrase: "Expression",
  broad: "Large",
};

export const GOOGLE_ADS_INTENTS = [
  { id: "metier_ville", label: "Métier + ville", weight: 1, match: "phrase" },
  { id: "rendez_vous", label: "Prise de rendez-vous", weight: 1.1, match: "phrase" },
  { id: "specialite", label: "Spécialités", weight: 0.9, match: "phrase" },
  { id: "proximite", label: "Autour du cabinet", weight: 1, match: "phrase" },
  { id: "reputation", label: "Réputation", weight: 0.6, match: "exact" },
  { id: "tarif", label: "Tarifs", weight: 0.7, match: "exact" },
] as const;
export type GoogleAdsIntent = (typeof GOOGLE_ADS_INTENTS)[number]["id"];

export function isGoogleAdsIntent(value: unknown): value is GoogleAdsIntent {
  return GOOGLE_ADS_INTENTS.some((i) => i.id === value);
}

export function intentLabel(intent: GoogleAdsIntent): string {
  return GOOGLE_ADS_INTENTS.find((i) => i.id === intent)?.label ?? intent;
}

function intentMeta(intent: GoogleAdsIntent): { weight: number; match: GoogleAdsMatchType } {
  const meta = GOOGLE_ADS_INTENTS.find((i) => i.id === intent);
  return meta ? { weight: meta.weight, match: meta.match } : { weight: 1, match: "phrase" };
}

// ─── Normalisation ───────────────────────────────────────────────────────────

/** Minuscules, accents retirés, apostrophes et traits d'union en espaces, espaces repliés. */
export function normalizeAdsText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'`´\-_/]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): string[] {
  return normalizeAdsText(text).split(" ").filter(Boolean);
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const h = ` ${haystack} `;
  const p = ` ${normalizeAdsText(phrase)} `;
  return p.trim() !== "" && h.includes(p);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round10(value: number): number {
  return Math.round(value / 10) * 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** USD → EUR arrondi au centime (null conservé). */
export function usdToEur(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return round2(value * USD_TO_EUR_RATE);
}

// ─── Familles de métiers (racines, synonymes, négatifs propres) ──────────────

export type AdsProfessionFamily = {
  key: string;
  /** Racines (texte normalisé) qui signent le métier dans une requête */
  roots: string[];
  /** Façons de nommer le métier et la pratique (graines) */
  synonyms: string[];
  /** Mots-clés négatifs propres au métier */
  negatives: string[];
};

const FAMILIES: readonly AdsProfessionFamily[] = [
  { key: "osteopathe", roots: ["osteo"], synonyms: ["ostéopathe", "ostéopathie"], negatives: ["animalier", "équin", "canin", "vétérinaire", "cheval", "chien", "chat"] },
  { key: "sophrologue", roots: ["sophro"], synonyms: ["sophrologue", "sophrologie"], negatives: ["devenir sophrologue", "école de sophrologie"] },
  { key: "massage", roots: ["mass"], synonyms: ["massage", "masseur", "massage bien-être"], negatives: ["érotique", "naturiste", "tantrique", "fauteuil", "chaise", "table de massage", "huile", "appareil", "pistolet", "salon de massage"] },
  { key: "naturopathe", roots: ["naturo"], synonyms: ["naturopathe", "naturopathie"], negatives: ["boutique", "produits", "complément alimentaire"] },
  { key: "hypnotherapeute", roots: ["hypno"], synonyms: ["hypnothérapeute", "hypnose", "hypnothérapie"], negatives: ["spectacle", "hypnose de rue", "devenir hypnotiseur"] },
  { key: "reflexologue", roots: ["reflexo"], synonyms: ["réflexologue", "réflexologie", "réflexologie plantaire"], negatives: ["chaussure", "semelle", "tapis", "appareil"] },
  { key: "reiki", roots: ["reiki"], synonyms: ["reiki", "praticien reiki"], negatives: ["devenir maître reiki"] },
  { key: "shiatsu", roots: ["shiatsu"], synonyms: ["shiatsu", "praticien shiatsu"], negatives: ["tapis", "fauteuil"] },
  { key: "kinesiologue", roots: ["kinesio"], synonyms: ["kinésiologue", "kinésiologie"], negatives: ["devenir kinésiologue"] },
  { key: "acupuncteur", roots: ["acupunct"], synonyms: ["acupuncteur", "acupuncture"], negatives: ["aiguilles", "tapis"] },
  { key: "chiropracteur", roots: ["chiro"], synonyms: ["chiropracteur", "chiropraxie"], negatives: ["table"] },
  { key: "etiopathe", roots: ["etiop"], synonyms: ["étiopathe", "étiopathie"], negatives: [] },
  { key: "nutrition", roots: ["nutri", "dietet"], synonyms: ["nutritionniste", "diététicien", "rééquilibrage alimentaire"], negatives: ["application", "programme en ligne", "livre"] },
  { key: "yoga", roots: ["yoga"], synonyms: ["cours de yoga", "professeur de yoga"], negatives: ["tapis", "tenue", "legging", "vêtement", "youtube", "en ligne"] },
  { key: "magnetiseur", roots: ["magnet"], synonyms: ["magnétiseur", "magnétisme"], negatives: ["aimant", "aimants"] },
  { key: "energeticien", roots: ["energet"], synonyms: ["énergéticien", "soin énergétique"], negatives: [] },
  { key: "psychopraticien", roots: ["psychoprat", "psychotherap", "therapeute"], synonyms: ["psychopraticien", "thérapeute"], negatives: ["remboursé", "psychiatre"] },
  { key: "coach", roots: ["coach"], synonyms: ["coach", "coaching"], negatives: ["sportif en ligne", "application"] },
];

/** Mots-clés négatifs communs à tous les métiers (emploi, formation, information, produits). */
export const GOOGLE_ADS_GENERIC_NEGATIVES: readonly string[] = [
  "emploi",
  "recrutement",
  "salaire",
  "formation",
  "école",
  "études",
  "diplôme",
  "cours",
  "définition",
  "wikipedia",
  "livre",
  "pdf",
  "gratuit",
  "remboursement",
  "mutuelle",
  "sécurité sociale",
  "c'est quoi",
  "danger",
  "arnaque",
  "devenir",
  "fiche métier",
  "reconversion",
  "stage",
  "youtube",
  "vidéo",
  "tuto",
];

/** Marqueurs d'une requête informationnelle : exclue du ciblage (et proposée en négatif si elle a du volume). */
const INFO_MARKERS: readonly string[] = [
  "c est quoi",
  "qu est ce",
  "definition",
  "bienfaits",
  "comment",
  "pourquoi",
  "danger",
  "efficace",
  "ca marche",
  "temoignage",
  "wikipedia",
  "histoire",
  "origine",
  "difference",
];

const RDV_MARKERS: readonly string[] = ["rendez vous", "rdv", "prendre", "reserver", "urgence", "urgent", "aujourd hui", "rapide", "consultation", "seance", "disponible"];
const REPUTATION_MARKERS: readonly string[] = ["avis", "meilleur", "meilleure", "recommande", "top", "reputation"];
const TARIF_MARKERS: readonly string[] = ["tarif", "tarifs", "prix", "combien", "cout", "pas cher", "remboursement"];
const PROXIMITY_MARKERS: readonly string[] = ["pres de", "proche", "autour", "a cote", "a proximite", "chez moi", "alentours"];

/** Famille du métier (racines, synonymes, négatifs) ; repli générique sur le premier mot significatif. */
export function adsProfessionFamily(profession: string): AdsProfessionFamily {
  const normalized = normalizeAdsText(profession);
  for (const family of FAMILIES) {
    if (family.roots.some((root) => normalized.includes(root))) return family;
  }
  const first = words(profession).find((w) => w.length >= 4) ?? normalized;
  const root = first.slice(0, Math.min(first.length, 6));
  return {
    key: "generic",
    roots: root ? [root] : [],
    synonyms: [profession.trim().toLowerCase()].filter(Boolean),
    negatives: [],
  };
}

// ─── Graines ─────────────────────────────────────────────────────────────────

export type GoogleAdsSeedInput = {
  profession: string;
  city: string;
  /** Titres des pages de spécialités (motifs) du site, bruts */
  specialties: string[];
};

export type GoogleAdsSeed = {
  /** Graines envoyées au fournisseur (≤ GOOGLE_ADS_SEEDS_MAX, ≤ 80 caractères, ≤ 10 mots) */
  keywords: string[];
  locationCode: number;
  languageCode: string;
  profession: string;
  professionFamily: string;
  /** Termes désignant le métier (métier saisi + synonymes), minuscules */
  professionTerms: string[];
  /** Racines normalisées signant le métier */
  professionRoots: string[];
  city: string;
  /** Spécialités nettoyées (minuscules, ≤ 40 caractères) */
  specialties: string[];
  /** Racines normalisées des spécialités (premier mot significatif) */
  specialtyRoots: string[];
};

const STOP_WORDS = new Set(["de", "du", "des", "la", "le", "les", "et", "en", "au", "aux", "pour", "par", "sur", "un", "une", "a", "d", "l", "votre", "vos", "mon", "ma", "mes", "the", "of"]);

function cleanSpecialty(raw: string, professionRoots: string[]): string | null {
  const text = raw.replace(/\s+/g, " ").trim().toLowerCase();
  if (text.length < 3 || text.length > 60) return null;
  if (words(text).length > 6) return null;
  // Une spécialité qui n'est que le métier lui-même n'apporte rien de plus
  const normalized = normalizeAdsText(text);
  if (professionRoots.some((root) => normalized === root || normalized.startsWith(`${root} `) && words(normalized).length <= 1)) return null;
  return text.slice(0, 40).trim();
}

function specialtyRoot(specialty: string): string | null {
  const significant = words(specialty).filter((w) => !STOP_WORDS.has(w) && w.length >= 4);
  const first = significant[0];
  return first ? first.slice(0, Math.min(first.length, 6)) : null;
}

function validSeed(keyword: string): boolean {
  const text = keyword.trim();
  return text.length > 0 && text.length <= 80 && words(text).length <= 10;
}

/**
 * Graines à partir du métier, de la ville et des spécialités : « métier ville »
 * d'abord (c'est ce que tapent la plupart des patients), le métier seul (diffusé
 * autour du cabinet par le ciblage géographique), les intentions fortes
 * (rendez-vous, avis, tarif, cabinet), puis les spécialités avec et sans ville.
 */
export function buildAdsSeeds(input: GoogleAdsSeedInput, max = GOOGLE_ADS_SEEDS_MAX): GoogleAdsSeed {
  const family = adsProfessionFamily(input.profession);
  const profession = input.profession.replace(/\s+/g, " ").trim().toLowerCase();
  const city = input.city.replace(/\s+/g, " ").trim().toLowerCase();
  const professionTerms = unique([profession, ...family.synonyms.map((s) => s.toLowerCase())].filter(Boolean)).slice(0, 3);
  const professionRoots = unique([...family.roots, ...(family.key === "generic" ? [] : [])]);
  const specialties = unique(
    input.specialties.map((s) => cleanSpecialty(s, professionRoots)).filter((s): s is string => s !== null),
  ).slice(0, 6);
  const specialtyRoots = unique(specialties.map(specialtyRoot).filter((r): r is string => r !== null));

  const main = professionTerms[0] ?? profession;
  const candidates: string[] = [];
  for (const term of professionTerms) candidates.push(city ? `${term} ${city}` : term);
  for (const term of professionTerms.slice(0, 2)) candidates.push(term);
  candidates.push(`${main} près de chez moi`);
  if (city) {
    candidates.push(`rendez-vous ${main} ${city}`, `cabinet ${main} ${city}`, `${main} ${city} avis`, `${main} ${city} tarif`, `meilleur ${main} ${city}`);
  }
  for (const specialty of specialties) candidates.push(city ? `${specialty} ${city}` : specialty);
  for (const specialty of specialties.slice(0, 3)) candidates.push(specialty);

  const keywords = unique(candidates.map((k) => k.replace(/\s+/g, " ").trim()).filter(validSeed)).slice(0, max);

  return {
    keywords,
    locationCode: GOOGLE_ADS_LOCATION_CODE_FR,
    languageCode: GOOGLE_ADS_LANGUAGE_CODE,
    profession,
    professionFamily: family.key,
    professionTerms,
    professionRoots,
    city,
    specialties,
    specialtyRoots,
  };
}

// ─── Données fournisseur et sélection ────────────────────────────────────────

export type GoogleAdsCompetition = "LOW" | "MEDIUM" | "HIGH";

/** Une idée de mot-clé telle que renvoyée par le fournisseur (normalisée, devise USD). */
export type GoogleAdsKeywordData = {
  keyword: string;
  /** Recherches mensuelles moyennes (null = inconnu) */
  searchVolume: number | null;
  cpcUsd: number | null;
  competition: GoogleAdsCompetition | null;
  /** 0..100 */
  competitionIndex: number | null;
  lowTopBidUsd: number | null;
  highTopBidUsd: number | null;
  /** Douze derniers mois (ordre fournisseur) */
  monthly: { year: number; month: number; searchVolume: number }[];
};

export type GoogleAdsKeyword = GoogleAdsKeywordData & {
  intent: GoogleAdsIntent;
  match: GoogleAdsMatchType;
  /** Score de sélection (volume, intention, ville, mot-clé suivi) */
  score: number;
  /** Fait partie du cœur de cible (≤ GOOGLE_ADS_CORE_MAX) */
  core: boolean;
  /** Suivi sur la carte de visibilité (Fiche Google) */
  tracked: boolean;
  /** Égal à l'une des graines */
  seed: boolean;
  cpcEur: number | null;
};

export type GoogleAdsKeywordGroup = {
  intent: GoogleAdsIntent;
  label: string;
  /** Textes des mots-clés du groupe, par score décroissant */
  keywords: string[];
  totalVolume: number;
  medianCpcEur: number | null;
};

export type GoogleAdsKeywordSet = {
  version: 1;
  source: "dataforseo" | "mock";
  /** ISO 8601 */
  fetchedAt: string;
  locationCode: number;
  seeds: string[];
  keywords: GoogleAdsKeyword[];
  groups: GoogleAdsKeywordGroup[];
  /** Négatifs conseillés : communs, propres au métier, et requêtes informationnelles écartées */
  negatives: string[];
  /** Idées reçues du fournisseur (avant sélection) */
  rawCount: number;
  /** Idées écartées (hors sujet, informationnelles, négatives, volume insuffisant) */
  dropped: number;
};

export type SelectAdsKeywordsOptions = {
  source: GoogleAdsKeywordSet["source"];
  fetchedAt: Date;
  /** Mots-clés suivis dans Fiche Google (toujours conservés, mis en avant) */
  tracked?: string[];
  max?: number;
  coreMax?: number;
};

type Relatedness = { hasRoot: boolean; hasCity: boolean; hasSpecialty: boolean };

function relatedness(normalized: string, seed: GoogleAdsSeed): Relatedness {
  const cityNorm = normalizeAdsText(seed.city);
  return {
    hasRoot: seed.professionRoots.some((root) => normalized.includes(root)),
    hasCity: cityNorm !== "" && containsPhrase(normalized, cityNorm),
    hasSpecialty: seed.specialtyRoots.some((root) => normalized.includes(root)),
  };
}

/** Raison d'exclusion d'une idée, null si elle peut être ciblée. */
export function adsKeywordExclusion(keyword: string, seed: GoogleAdsSeed): "negative" | "informational" | "unrelated" | "too_long" | null {
  const normalized = normalizeAdsText(keyword);
  if (normalized === "" || keyword.length > 80 || words(keyword).length > 10) return "too_long";
  const family = adsProfessionFamily(seed.profession);
  const negatives = [...GOOGLE_ADS_GENERIC_NEGATIVES, ...family.negatives];
  if (negatives.some((n) => containsPhrase(normalized, n))) return "negative";
  if (INFO_MARKERS.some((m) => containsPhrase(normalized, m))) return "informational";
  const rel = relatedness(normalized, seed);
  if (!(rel.hasRoot || (rel.hasSpecialty && rel.hasCity))) return "unrelated";
  return null;
}

/** Intention d'une requête ciblable (marqueurs, puis spécialité, puis métier + ville, sinon autour du cabinet). */
export function classifyAdsIntent(keyword: string, seed: GoogleAdsSeed): GoogleAdsIntent {
  const normalized = normalizeAdsText(keyword);
  const has = (markers: readonly string[]) => markers.some((m) => containsPhrase(normalized, m));
  if (has(RDV_MARKERS)) return "rendez_vous";
  if (has(REPUTATION_MARKERS)) return "reputation";
  if (has(TARIF_MARKERS)) return "tarif";
  if (has(PROXIMITY_MARKERS)) return "proximite";
  const rel = relatedness(normalized, seed);
  if (rel.hasSpecialty) return "specialite";
  if (rel.hasRoot && rel.hasCity) return "metier_ville";
  return "proximite";
}

function dedupeIdeas(raw: GoogleAdsKeywordData[]): GoogleAdsKeywordData[] {
  const byKey = new Map<string, GoogleAdsKeywordData>();
  for (const idea of raw) {
    const key = normalizeAdsText(idea.keyword);
    if (key === "") continue;
    const existing = byKey.get(key);
    if (!existing || (idea.searchVolume ?? 0) > (existing.searchVolume ?? 0)) {
      byKey.set(key, { ...idea, keyword: idea.keyword.replace(/\s+/g, " ").trim().toLowerCase() });
    }
  }
  return [...byKey.values()];
}

/**
 * Sélection : dédoublonnage, exclusion (négatifs, informationnel, hors sujet),
 * volume minimal (sauf graines et mots-clés suivis), intention, score
 * (log10(volume + 1) + 0,3) × poids de l'intention × 1,15 si la ville est
 * citée × 1,5 si suivi ; les `max` meilleurs sont conservés, les `coreMax`
 * premiers forment le cœur. Les négatifs rassemblent les listes communes et du
 * métier, plus les requêtes informationnelles écartées ayant du volume.
 */
export function selectAdsKeywords(raw: GoogleAdsKeywordData[], seed: GoogleAdsSeed, opts: SelectAdsKeywordsOptions): GoogleAdsKeywordSet {
  const max = opts.max ?? GOOGLE_ADS_KEYWORDS_MAX;
  const coreMax = opts.coreMax ?? GOOGLE_ADS_CORE_MAX;
  const trackedKeys = new Set((opts.tracked ?? []).map(normalizeAdsText).filter(Boolean));
  const seedKeys = new Set(seed.keywords.map(normalizeAdsText));
  const family = adsProfessionFamily(seed.profession);

  const ideas = dedupeIdeas(raw);
  const suggestedNegatives: string[] = [];
  const kept: GoogleAdsKeyword[] = [];
  let dropped = 0;

  for (const idea of ideas) {
    const normalized = normalizeAdsText(idea.keyword);
    const exclusion = adsKeywordExclusion(idea.keyword, seed);
    if (exclusion) {
      dropped++;
      if (exclusion === "informational" && (idea.searchVolume ?? 0) >= 50) {
        const marker = INFO_MARKERS.find((m) => containsPhrase(normalized, m));
        if (marker) suggestedNegatives.push(marker.replace("c est quoi", "c'est quoi").replace("qu est ce", "qu'est-ce"));
      }
      continue;
    }
    const tracked = trackedKeys.has(normalized);
    const isSeed = seedKeys.has(normalized);
    const volume = idea.searchVolume ?? 0;
    if (volume < GOOGLE_ADS_MIN_VOLUME && !tracked && !isSeed) {
      dropped++;
      continue;
    }
    const intent = classifyAdsIntent(idea.keyword, seed);
    const meta = intentMeta(intent);
    const rel = relatedness(normalized, seed);
    const score = round2((Math.log10(volume + 1) + 0.3) * meta.weight * (rel.hasCity ? 1.15 : 1) * (tracked ? 1.5 : 1));
    kept.push({
      ...idea,
      intent,
      match: meta.match,
      score,
      core: false,
      tracked,
      seed: isSeed,
      cpcEur: usdToEur(idea.cpcUsd),
    });
  }

  kept.sort((a, b) => b.score - a.score || (b.searchVolume ?? 0) - (a.searchVolume ?? 0) || a.keyword.localeCompare(b.keyword, "fr"));
  const selected = kept.slice(0, max);
  dropped += kept.length - selected.length;
  selected.forEach((k, i) => {
    k.core = i < coreMax;
  });

  const groups: GoogleAdsKeywordGroup[] = [];
  for (const intent of GOOGLE_ADS_INTENTS) {
    const members = selected.filter((k) => k.intent === intent.id);
    if (members.length === 0) continue;
    groups.push({
      intent: intent.id,
      label: intent.label,
      keywords: members.map((k) => k.keyword),
      totalVolume: members.reduce((sum, k) => sum + (k.searchVolume ?? 0), 0),
      medianCpcEur: median(members.map((k) => k.cpcEur).filter((v): v is number => v !== null)),
    });
  }

  const negatives = unique([...GOOGLE_ADS_GENERIC_NEGATIVES, ...family.negatives, ...suggestedNegatives]).slice(0, 80);

  return {
    version: 1,
    source: opts.source,
    fetchedAt: opts.fetchedAt.toISOString(),
    locationCode: seed.locationCode,
    seeds: seed.keywords,
    keywords: selected,
    groups,
    negatives,
    rawCount: raw.length,
    dropped,
  };
}

// ─── Prévision de trafic (enchère → clics et coût) ───────────────────────────

export type GoogleAdsForecastRow = {
  keyword: string;
  clicks: number | null;
  costUsd: number | null;
  averageCpcUsd: number | null;
};

export type GoogleAdsForecast = {
  version: 1;
  source: "dataforseo" | "mock";
  fetchedAt: string;
  /** Enchère maximale envoyée (USD) */
  bidUsd: number;
  match: GoogleAdsMatchType;
  period: "next_month";
  locationCode: number;
  rows: GoogleAdsForecastRow[];
  totalClicks: number;
  totalCostUsd: number;
};

/** Enchère conseillée (USD) : médiane des enchères hautes de haut de page du cœur, sinon CPC × 1,3, sinon 2 $ ; bornée 0,5–10. */
export function suggestBidUsd(keywords: GoogleAdsKeyword[]): number {
  const core = keywords.filter((k) => k.core);
  const pool = core.length > 0 ? core : keywords;
  const highBids = pool.map((k) => k.highTopBidUsd).filter((v): v is number => v !== null && v > 0);
  const cpcs = pool.map((k) => k.cpcUsd).filter((v): v is number => v !== null && v > 0);
  const base = median(highBids) ?? (median(cpcs) !== null ? median(cpcs)! * 1.3 : 2);
  return round2(clamp(base, 0.5, 10));
}

export function summarizeForecast(
  rows: GoogleAdsForecastRow[],
  meta: { source: GoogleAdsForecast["source"]; fetchedAt: Date; bidUsd: number; match: GoogleAdsMatchType; locationCode: number },
): GoogleAdsForecast {
  return {
    version: 1,
    source: meta.source,
    fetchedAt: meta.fetchedAt.toISOString(),
    bidUsd: meta.bidUsd,
    match: meta.match,
    period: "next_month",
    locationCode: meta.locationCode,
    rows,
    totalClicks: Math.round(rows.reduce((sum, r) => sum + (r.clicks ?? 0), 0)),
    totalCostUsd: round2(rows.reduce((sum, r) => sum + (r.costUsd ?? 0), 0)),
  };
}

// ─── Diagnostic déterministe ─────────────────────────────────────────────────

export type GoogleAdsCheckId =
  | "profile_linked"
  | "profile_claimed"
  | "booking"
  | "phone"
  | "reviews"
  | "hours"
  | "photos"
  | "tracking_tag"
  | "tracking_conversions"
  | "landing_pages";

export type GoogleAdsReadinessStatus = "ok" | "todo" | "unknown";

export type GoogleAdsReadinessCheck = {
  id: GoogleAdsCheckId;
  label: string;
  status: GoogleAdsReadinessStatus;
  detail: string;
  /** Bloquant : sans lui, dépenser sur Google Ads n'a pas de sens */
  critical: boolean;
};

export type GoogleAdsDiagnosticInput = {
  profession: string;
  city: string;
  hasBookingUrl: boolean;
  hasPhone: boolean;
  /** Identifiant Google Ads (AW-…) renseigné dans le suivi du site */
  hasAdsTag: boolean;
  /** Au moins un libellé de conversion renseigné */
  hasConversionLabels: boolean;
  /** Pages de spécialités en ligne */
  motifPages: number;
  profile: {
    linked: boolean;
    claimed: boolean | null;
    rating: number | null;
    votes: number | null;
    hasHours: boolean | null;
    photos: number | null;
    auditScore: number | null;
  };
  /** Médianes des concurrents du dernier relevé de visibilité */
  benchmark: { medianRating: number | null; medianVotes: number | null } | null;
  keywords: GoogleAdsKeywordSet | null;
  forecast: GoogleAdsForecast | null;
};

export type GoogleAdsDemand = {
  /** Somme des volumes mensuels du cœur de cible */
  coreMonthlySearches: number;
  /** Somme des volumes de tous les mots-clés retenus */
  totalMonthlySearches: number;
  keywordsCount: number;
  cpcMinEur: number | null;
  cpcMaxEur: number | null;
  cpcMedianEur: number | null;
  competition: "faible" | "moyenne" | "forte" | null;
};

export type GoogleAdsBudgetEstimate = {
  /** forecast : prévision fournisseur ; cpc : CPC des mots-clés ; none : CPC par défaut */
  basis: "forecast" | "cpc" | "none";
  cpcEur: number;
  monthlyMinEur: number;
  monthlyRecommendedEur: number;
  dailyRecommendedEur: number;
  clicksMin: number;
  clicksMax: number;
  contactsMin: number;
  contactsMax: number;
};

export type GoogleAdsVerdict = "go" | "go_with_prerequisites" | "wait";

export type GoogleAdsDiagnostic = {
  version: 1;
  generatedAt: string;
  verdict: GoogleAdsVerdict;
  /** 0..100 : préparation du cabinet à investir */
  score: number;
  headline: string;
  summary: string;
  demand: GoogleAdsDemand;
  checks: GoogleAdsReadinessCheck[];
  /** Libellés des points à régler, bloquants d'abord */
  prerequisites: string[];
  budget: GoogleAdsBudgetEstimate;
};

export function summarizeDemand(keywords: GoogleAdsKeywordSet | null): GoogleAdsDemand {
  if (!keywords || keywords.keywords.length === 0) {
    return { coreMonthlySearches: 0, totalMonthlySearches: 0, keywordsCount: 0, cpcMinEur: null, cpcMaxEur: null, cpcMedianEur: null, competition: null };
  }
  const core = keywords.keywords.filter((k) => k.core);
  const cpcs = core.map((k) => k.cpcEur).filter((v): v is number => v !== null && v > 0);
  const indexes = core.map((k) => k.competitionIndex).filter((v): v is number => v !== null);
  const medianIndex = median(indexes);
  return {
    coreMonthlySearches: core.reduce((sum, k) => sum + (k.searchVolume ?? 0), 0),
    totalMonthlySearches: keywords.keywords.reduce((sum, k) => sum + (k.searchVolume ?? 0), 0),
    keywordsCount: keywords.keywords.length,
    cpcMinEur: cpcs.length ? Math.min(...cpcs) : null,
    cpcMaxEur: cpcs.length ? Math.max(...cpcs) : null,
    cpcMedianEur: median(cpcs),
    competition: medianIndex === null ? null : medianIndex >= 67 ? "forte" : medianIndex >= 34 ? "moyenne" : "faible",
  };
}

/**
 * Budget mensuel conseillé : CPC (prévision si disponible, sinon médiane des
 * CPC du cœur, sinon CPC par défaut) × objectif de clics, borné ; le minimum
 * vise la moitié des clics. Une prévision chiffrant la demande plafonne le
 * budget conseillé (inutile de dépenser plus que les clics disponibles).
 */
export function estimateAdsBudget(keywords: GoogleAdsKeywordSet | null, forecast: GoogleAdsForecast | null): GoogleAdsBudgetEstimate {
  const demand = summarizeDemand(keywords);
  let basis: GoogleAdsBudgetEstimate["basis"] = "none";
  let cpcEur = GOOGLE_ADS_DEFAULT_CPC_EUR;
  if (forecast && forecast.totalClicks > 0 && forecast.totalCostUsd > 0) {
    basis = "forecast";
    cpcEur = usdToEur(forecast.totalCostUsd / forecast.totalClicks) ?? cpcEur;
  } else if (demand.cpcMedianEur !== null && demand.cpcMedianEur > 0) {
    basis = "cpc";
    cpcEur = demand.cpcMedianEur;
  }
  cpcEur = round2(Math.max(0.1, cpcEur));

  let recommended = clamp(round10(cpcEur * GOOGLE_ADS_TARGET_CLICKS), GOOGLE_ADS_BUDGET_EUR.min, GOOGLE_ADS_BUDGET_EUR.max);
  let min = clamp(round10(cpcEur * (GOOGLE_ADS_TARGET_CLICKS / 2)), GOOGLE_ADS_BUDGET_EUR.floor, recommended);
  if (basis === "forecast") {
    const ceiling = usdToEur(forecast!.totalCostUsd) ?? 0;
    if (ceiling > 0 && ceiling < recommended) {
      recommended = Math.max(GOOGLE_ADS_BUDGET_EUR.floor, round10(ceiling));
      min = Math.min(min, recommended);
    }
  }
  const clicksMin = Math.floor(min / cpcEur);
  const clicksMax = Math.floor(recommended / cpcEur);
  return {
    basis,
    cpcEur,
    monthlyMinEur: min,
    monthlyRecommendedEur: recommended,
    dailyRecommendedEur: round2(recommended / 30.4),
    clicksMin,
    clicksMax,
    contactsMin: Math.floor(clicksMin * GOOGLE_ADS_CONVERSION_RATES.low),
    contactsMax: Math.ceil(clicksMax * GOOGLE_ADS_CONVERSION_RATES.high),
  };
}

function check(id: GoogleAdsCheckId, label: string, status: GoogleAdsReadinessStatus, detail: string, critical: boolean): GoogleAdsReadinessCheck {
  return { id, label, status, detail, critical };
}

/** Points de préparation, dans l'ordre d'affichage. */
export function adsReadinessChecks(input: GoogleAdsDiagnosticInput): GoogleAdsReadinessCheck[] {
  const p = input.profile;
  const contactCritical = !input.hasBookingUrl && !input.hasPhone;
  const minVotes = Math.max(10, Math.round((input.benchmark?.medianVotes ?? 0) * 0.5));
  const reviewsStatus: GoogleAdsReadinessStatus =
    p.votes === null || p.rating === null ? "unknown" : p.votes >= minVotes && p.rating >= 4.3 ? "ok" : "todo";
  return [
    check(
      "profile_linked",
      "Fiche Google reliée",
      p.linked ? "ok" : "todo",
      p.linked
        ? "Votre fiche alimente l'extension de lieu des annonces (adresse, horaires, itinéraire)."
        : "Reliez votre fiche dans la section Fiche Google : Google Ads affiche l'adresse et les avis de la fiche sous les annonces.",
      true,
    ),
    check(
      "profile_claimed",
      "Fiche revendiquée",
      p.claimed === null ? "unknown" : p.claimed ? "ok" : "todo",
      p.claimed === false
        ? "Une fiche non revendiquée ne peut pas être associée à votre compte Google Ads."
        : p.claimed === null
          ? "Vérifiez que vous gérez bien votre fiche depuis votre compte Google."
          : "Vous gérez votre fiche : elle pourra être associée à Google Ads.",
      true,
    ),
    check(
      "booking",
      "Prise de rendez-vous en ligne",
      input.hasBookingUrl ? "ok" : "todo",
      input.hasBookingUrl
        ? "Le bouton « Prendre rendez-vous » est la conversion principale de vos annonces."
        : "Sans lien de réservation, chaque clic payé doit aboutir à un appel : ajoutez votre lien de prise de rendez-vous dans le studio.",
      contactCritical,
    ),
    check(
      "phone",
      "Numéro de téléphone affiché",
      input.hasPhone ? "ok" : "todo",
      input.hasPhone
        ? "Les clics sur votre numéro seront comptés comme des conversions."
        : "Affichez un numéro sur le site : l'appel est la conversion la plus fréquente pour un cabinet.",
      contactCritical,
    ),
    check(
      "reviews",
      "Avis Google rassurants",
      reviewsStatus,
      reviewsStatus === "ok"
        ? `${p.votes} avis, note ${p.rating} : vos annonces inspireront confiance.`
        : reviewsStatus === "unknown"
          ? "Synchronisez votre fiche pour connaître votre note et votre nombre d'avis."
          : `Visez au moins ${minVotes} avis et une note ≥ 4,3 avant d'investir : les patients comparent les fiches avant d'appeler.`,
      false,
    ),
    check(
      "hours",
      "Horaires renseignés",
      p.hasHours === null ? "unknown" : p.hasHours ? "ok" : "todo",
      p.hasHours === false ? "Renseignez vos horaires sur la fiche : Google Ads les reprend dans l'extension de lieu." : "Horaires visibles dans les annonces avec l'extension de lieu.",
      false,
    ),
    check(
      "photos",
      "Photos de la fiche",
      p.photos === null ? "unknown" : p.photos >= 5 ? "ok" : "todo",
      p.photos !== null && p.photos < 5 ? "Ajoutez au moins 5 photos (cabinet, salle, praticien) : la fiche est consultée après le clic." : "Assez de photos pour rassurer après le clic.",
      false,
    ),
    check(
      "tracking_tag",
      "Balise Google Ads sur le site",
      input.hasAdsTag ? "ok" : "todo",
      input.hasAdsTag ? "La balise se charge après consentement des visiteurs." : "Renseignez votre identifiant AW-… dans l'onglet Paramétrage & suivi : sans balise, Google ne peut pas optimiser vos annonces.",
      false,
    ),
    check(
      "tracking_conversions",
      "Conversions mesurées",
      input.hasConversionLabels ? "ok" : "todo",
      input.hasConversionLabels ? "Clics RDV, appels et e-mails remontent dans Google Ads." : "Collez vos libellés de conversion : le site enverra les clics RDV, appels et e-mails à Google Ads.",
      false,
    ),
    check(
      "landing_pages",
      "Pages de spécialités dédiées",
      input.motifPages > 0 ? "ok" : "todo",
      input.motifPages > 0 ? `${input.motifPages} page${input.motifPages > 1 ? "s" : ""} de spécialité : des pages d'atterrissage ciblées.` : "Des pages dédiées par spécialité améliorent le score de qualité et le coût par clic.",
      false,
    ),
  ];
}

const VERDICT_HEADLINES: Record<GoogleAdsVerdict, string> = {
  go: "Google Ads est pertinent pour votre cabinet",
  go_with_prerequisites: "Google Ads est pertinent, après quelques réglages",
  wait: "Avant de lancer Google Ads, réglez les points bloquants",
};

function formatEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

/** Diagnostic complet : points de préparation, verdict, score, demande et budget. */
export function diagnoseGoogleAds(input: GoogleAdsDiagnosticInput, now = new Date()): GoogleAdsDiagnostic {
  const checks = adsReadinessChecks(input);
  const criticalTodos = checks.filter((c) => c.status === "todo" && c.critical);
  const minorTodos = checks.filter((c) => c.status === "todo" && !c.critical);
  const unknowns = checks.filter((c) => c.status === "unknown");
  const verdict: GoogleAdsVerdict = criticalTodos.length > 0 ? "wait" : minorTodos.length > 0 ? "go_with_prerequisites" : "go";
  const score = clamp(100 - criticalTodos.length * 20 - minorTodos.length * 8 - unknowns.length * 3, 0, 100);
  const demand = summarizeDemand(input.keywords);
  const budget = estimateAdsBudget(input.keywords, input.forecast);

  const demandSentence =
    demand.keywordsCount === 0
      ? "Lancez une analyse pour mesurer la demande réelle sur vos expressions."
      : demand.coreMonthlySearches >= 30
        ? `Environ ${demand.coreMonthlySearches.toLocaleString("fr-FR")} recherches par mois sur vos ${Math.min(demand.keywordsCount, GOOGLE_ADS_CORE_MAX)} expressions principales${demand.cpcMedianEur !== null ? `, pour un coût par clic médian de ${demand.cpcMedianEur.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : ""}.`
        : "La demande mesurée sur vos expressions est faible : le ciblage géographique autour du cabinet et les requêtes sans ville feront l'essentiel du trafic.";
  const budgetSentence = `Budget conseillé : ${formatEur(budget.monthlyRecommendedEur)} par mois (${formatEur(budget.monthlyMinEur)} au minimum), soit ${budget.clicksMin}–${budget.clicksMax} clics et ${budget.contactsMin}–${budget.contactsMax} prises de contact attendues.`;

  return {
    version: 1,
    generatedAt: now.toISOString(),
    verdict,
    score,
    headline: VERDICT_HEADLINES[verdict],
    summary: `${demandSentence} ${budgetSentence}`,
    demand,
    checks,
    prerequisites: [...criticalTodos, ...minorTodos].map((c) => c.label),
    budget,
  };
}

// ─── Plan d'action (contrat du planificateur IA) ─────────────────────────────

export type GoogleAdsAd = {
  /** 5 à 15 titres de ≤ 30 caractères */
  headlines: string[];
  /** 2 à 4 descriptions de ≤ 90 caractères */
  descriptions: string[];
  /** Chemins d'affichage (≤ 15 caractères chacun), facultatifs */
  path1: string | null;
  path2: string | null;
};

export type GoogleAdsAdGroup = {
  name: string;
  intent: GoogleAdsIntent;
  keywords: { text: string; match: GoogleAdsMatchType }[];
  /** Chemin de la page d'atterrissage sur le site (« / » ou « /<slug-motif> ») */
  landingPath: string;
  ads: GoogleAdsAd[];
};

export type GoogleAdsPlan = {
  version: 1;
  generatedAt: string;
  generator: "anthropic" | "mock";
  /** Objectif en une phrase */
  objective: string;
  /** Résumé du plan en 2-3 phrases */
  summary: string;
  campaign: {
    name: string;
    geo: { city: string; radiusKm: number; note: string };
    /** Jours et heures de diffusion conseillés */
    schedule: string;
    /** Stratégie d'enchères de départ et bascule */
    bidding: string;
    dailyBudgetEur: number;
    monthlyBudgetEur: number;
  };
  adGroups: GoogleAdsAdGroup[];
  negatives: string[];
  extensions: {
    sitelinks: { title: string; path: string }[];
    callouts: string[];
    call: boolean;
    location: boolean;
  };
  milestones: { horizon: string; title: string; actions: string[]; kpis: string[] }[];
  tips: string[];
};

export type GoogleAdsLandingPage = { path: string; title: string; kind: "home" | "motif" };

export type GoogleAdsPlanInput = {
  diagnostic: GoogleAdsDiagnostic;
  keywords: GoogleAdsKeywordSet;
  forecast: GoogleAdsForecast | null;
  /** Pages d'atterrissage possibles (accueil + spécialités) */
  landingPages: GoogleAdsLandingPage[];
  /** Mots-clés suivis dans Fiche Google */
  trackedKeywords: string[];
  /** Instructions libres du praticien (≤ GOOGLE_ADS_INSTRUCTIONS_MAX, nettoyées) */
  instructions?: string;
};

/** Tronque un texte d'annonce à `max` caractères sur une limite de mot, sans ponctuation pendante. */
export function clampAdText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace >= Math.floor(max * 0.6) ? cut.slice(0, lastSpace) : cut;
  return base.replace(/[\s,;:(\-–—]+$/g, "").trim();
}

/** Écarts d'un plan au contrat (vide = conforme) : comptes et longueurs des annonces, groupes et chemins. */
export function adsPlanIssues(plan: GoogleAdsPlan): string[] {
  const issues: string[] = [];
  if (plan.adGroups.length === 0) issues.push("aucun groupe d'annonces");
  plan.adGroups.forEach((group, gi) => {
    const where = `groupe ${gi + 1} (${group.name})`;
    if (group.keywords.length === 0) issues.push(`${where} : aucun mot-clé`);
    if (!group.landingPath.startsWith("/")) issues.push(`${where} : page d'atterrissage invalide`);
    if (group.ads.length === 0) issues.push(`${where} : aucune annonce`);
    group.ads.forEach((ad, ai) => {
      const label = `${where}, annonce ${ai + 1}`;
      if (ad.headlines.length < GOOGLE_ADS_RSA.headlinesMin || ad.headlines.length > GOOGLE_ADS_RSA.headlinesMax) issues.push(`${label} : ${ad.headlines.length} titres`);
      if (ad.descriptions.length < GOOGLE_ADS_RSA.descriptionsMin || ad.descriptions.length > GOOGLE_ADS_RSA.descriptionsMax) issues.push(`${label} : ${ad.descriptions.length} descriptions`);
      ad.headlines.forEach((h) => {
        if (h.length > GOOGLE_ADS_RSA.headlineMax) issues.push(`${label} : titre trop long « ${h} »`);
      });
      ad.descriptions.forEach((d) => {
        if (d.length > GOOGLE_ADS_RSA.descriptionMax) issues.push(`${label} : description trop longue`);
      });
      for (const path of [ad.path1, ad.path2]) {
        if (path !== null && path.length > GOOGLE_ADS_RSA.pathMax) issues.push(`${label} : chemin d'affichage trop long`);
      }
    });
  });
  if (plan.campaign.dailyBudgetEur <= 0 || plan.campaign.monthlyBudgetEur <= 0) issues.push("budget nul");
  return issues;
}

// ─── Analyse stockée ─────────────────────────────────────────────────────────

export const GOOGLE_ADS_ANALYSIS_STATUSES = ["running", "done", "error"] as const;
export type GoogleAdsAnalysisStatus = (typeof GOOGLE_ADS_ANALYSIS_STATUSES)[number];

// ─── Suivi des conversions (site) ────────────────────────────────────────────

export const GOOGLE_ADS_CONVERSION_KINDS = [
  { id: "rdv", label: "Clic « Prendre rendez-vous »" },
  { id: "call", label: "Clic sur le numéro de téléphone" },
  { id: "email", label: "Clic sur l'adresse e-mail" },
] as const;
export type GoogleAdsConversionKind = (typeof GOOGLE_ADS_CONVERSION_KINDS)[number]["id"];

/** Libellés de conversion Google Ads (partie après « AW-…/ » dans l'extrait d'événement). */
export type GoogleAdsConversionLabels = Partial<Record<GoogleAdsConversionKind, string>>;

/** Format d'un libellé de conversion (ex. AbC-dEfGhIjKlMnOp). */
export const GOOGLE_ADS_CONVERSION_LABEL_PATTERN = /^[A-Za-z0-9_-]{6,40}$/;

export function hasConversionLabels(labels: GoogleAdsConversionLabels | null | undefined): boolean {
  return Boolean(labels && GOOGLE_ADS_CONVERSION_KINDS.some((k) => (labels[k.id] ?? "").trim() !== ""));
}

/** Paramètres d'URL signant une visite venue d'une annonce Google (gclid et variantes, ou UTM payant). */
export function isGoogleAdsLanding(search: string): boolean {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return false;
  }
  if (params.has("gclid") || params.has("gbraid") || params.has("wbraid")) return true;
  const source = (params.get("utm_source") ?? "").toLowerCase();
  const medium = (params.get("utm_medium") ?? "").toLowerCase();
  return source === "google" && ["cpc", "ppc", "paid", "paidsearch", "sem"].includes(medium);
}
