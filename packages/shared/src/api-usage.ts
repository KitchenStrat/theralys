/**
 * Registre des appels API (pilotage de l'activité et des coûts) : la liste
 * des fournisseurs externes, les fonctionnalités auxquelles un appel est
 * rattaché, le barème des prix et les calculs de coût. Module pur — utilisé
 * par les fournisseurs (côté serveur) comme par l'admin (affichage).
 *
 * Un appel = un `ApiUsageEvent`, inscrit dans la table `api_usage` par
 * `recordApiUsage` (`@theralys/shared/usage-runtime`). Le coût est en
 * dollars : la plupart des fournisseurs facturent en dollars, l'admin
 * convertit en euros à l'affichage (`USD_TO_EUR_RATE`).
 */

import { USD_TO_EUR_RATE } from "./google-ads";

// ─── Fournisseurs ────────────────────────────────────────────────────────────

export const API_PROVIDER_IDS = [
  "anthropic",
  "fal",
  "pexels",
  "google_places",
  "dataforseo",
  "meta_ad_library",
  "scrapecreators",
  "geo_api",
  "resend",
  "ovh",
  "vercel",
  "client_site",
] as const;
export type ApiProviderId = (typeof API_PROVIDER_IDS)[number];

export type ApiProviderInfo = {
  label: string;
  /** Ce que le fournisseur apporte à la plateforme, en quelques mots */
  role: string;
  /** Unité du volume affiché (`units`, ou les tokens pour Anthropic) */
  unit: string;
  /** Mode de facturation, en une phrase */
  pricing: string;
  /** Aucun coût à l'appel (API gratuite, ou comprise dans un abonnement) */
  free: boolean;
};

export const API_PROVIDERS: Record<ApiProviderId, ApiProviderInfo> = {
  anthropic: {
    label: "Anthropic (Claude)",
    role: "Rédaction : sites, articles, réseaux sociaux, fiche Google, Google Ads, Meta Ads",
    unit: "tokens",
    pricing: "Au token, selon le modèle : coût calculé sur les tokens réellement consommés (réflexion comprise).",
    free: false,
  },
  fal: {
    label: "fal.ai (FLUX)",
    role: "Images générées (articles, sites)",
    unit: "images",
    pricing: "FLUX.1 schnell : 0,003 $ par mégapixel · FLUX 1.1 pro ultra : 0,06 $ par image.",
    free: false,
  },
  pexels: {
    label: "Pexels",
    role: "Photos de banque d'images",
    unit: "recherches",
    pricing: "Gratuit.",
    free: true,
  },
  google_places: {
    label: "Google Places",
    role: "Recherche d'établissements, avis, photos et coordonnées",
    unit: "appels",
    pricing: "À l'appel, après 1 000 appels gratuits par mois et par type : recherche 0,035 $, fiche 0,025 $, photo 0,007 $.",
    free: false,
  },
  dataforseo: {
    label: "DataForSEO",
    role: "Fiche Google (audit, avis, relevés de position) et mots-clés Google Ads",
    unit: "requêtes",
    pricing: "À la requête : coût réel renvoyé par l'API à chaque appel.",
    free: false,
  },
  meta_ad_library: {
    label: "Meta (bibliothèque publicitaire)",
    role: "Veille des annonces Facebook et Instagram",
    unit: "requêtes",
    pricing: "Gratuit (jeton à renouveler tous les 60 jours).",
    free: true,
  },
  scrapecreators: {
    label: "ScrapeCreators",
    role: "Visuels des annonces de la veille Meta",
    unit: "crédits",
    pricing: "Au crédit : 1 crédit par annonce, 47 $ les 25 000 crédits (≈ 0,0019 $ l'annonce).",
    free: false,
  },
  geo_api: {
    label: "API Découpage administratif",
    role: "Communes voisines du praticien (veille Meta)",
    unit: "requêtes",
    pricing: "Gratuit (service public).",
    free: true,
  },
  resend: {
    label: "Resend",
    role: "E-mails envoyés aux praticiens",
    unit: "e-mails",
    pricing: "Compris dans l'abonnement Resend (3 000 e-mails par mois dans l'offre gratuite).",
    free: true,
  },
  ovh: {
    label: "OVH",
    role: "Noms de domaine des sites clients",
    unit: "opérations",
    pricing: "Prix du domaine à la commande (en euros) ; les autres opérations sont gratuites.",
    free: false,
  },
  vercel: {
    label: "Vercel",
    role: "Rattachement des domaines aux sites",
    unit: "opérations",
    pricing: "Compris dans l'abonnement Vercel.",
    free: true,
  },
  client_site: {
    label: "Sites des clients (lecture)",
    role: "Lecture du site internet d'un client qui a connecté le sien",
    unit: "pages",
    pricing: "Gratuit (lecture directe des pages publiques).",
    free: true,
  },
};

export function isApiProviderId(value: unknown): value is ApiProviderId {
  return typeof value === "string" && (API_PROVIDER_IDS as readonly string[]).includes(value);
}

// ─── Fonctionnalités ─────────────────────────────────────────────────────────

/** Fonctionnalité de la plateforme à laquelle un appel est rattaché (`null` : non attribué). */
export const API_FEATURE_IDS = [
  "site_generation",
  "site_editor",
  "blog",
  "social",
  "google_profile",
  "google_ads",
  "meta_ads",
  "prospecting",
  "notifications",
  "domains",
  "client_site",
] as const;
export type ApiFeatureId = (typeof API_FEATURE_IDS)[number];

export const API_FEATURE_LABELS: Record<ApiFeatureId, string> = {
  site_generation: "Génération de sites",
  site_editor: "Éditeur du site",
  blog: "Blog",
  social: "Réseaux sociaux",
  google_profile: "Fiche Google",
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  prospecting: "Recherche d'établissements",
  notifications: "E-mails",
  domains: "Domaines",
  client_site: "Site du client",
};

/** Libellé d'une fonctionnalité enregistrée ; « Non attribué » quand l'appel n'en portait pas (ou une valeur inconnue). */
export function apiFeatureLabel(feature: string | null | undefined): string {
  return isApiFeatureId(feature) ? API_FEATURE_LABELS[feature] : "Non attribué";
}

export function isApiFeatureId(value: unknown): value is ApiFeatureId {
  return typeof value === "string" && (API_FEATURE_IDS as readonly string[]).includes(value);
}

// ─── Événement ───────────────────────────────────────────────────────────────

/** `provider` : coût réel renvoyé par le fournisseur · `tariff` : calculé au barème · `free` : appel gratuit. */
export type ApiCostSource = "provider" | "tariff" | "free";
export type ApiUsageStatus = "ok" | "error";

export type ApiUsageEvent = {
  provider: ApiProviderId;
  /** Opération technique chez le fournisseur (« messages », « text_search », « place_details »…) */
  operation: string;
  /** Rattachement métier ; hérité du contexte (`withApiUsage`) quand il est omis */
  feature?: ApiFeatureId | null;
  siteId?: string | null;
  model?: string | null;
  status?: ApiUsageStatus;
  /** Requêtes HTTP envoyées (1 par défaut) */
  requests?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Volume dans l'unité du fournisseur (images, crédits, e-mails…) */
  units?: number;
  costUsd?: number;
  costSource?: ApiCostSource;
  durationMs?: number;
  /** Message d'erreur borné, jamais de secret */
  error?: string | null;
  meta?: Record<string, unknown> | null;
};

/** Longueur maximale d'un message d'erreur enregistré. */
export const API_USAGE_ERROR_MAX = 300;

// ─── Barème ──────────────────────────────────────────────────────────────────

/** Montant en euros (OVH) → dollars du registre, au même taux que l'affichage (`USD_TO_EUR_RATE`, `./google-ads`). */
export function eurToUsd(eur: number): number {
  return eur / USD_TO_EUR_RATE;
}

/**
 * Prix Anthropic en dollars par million de tokens (entrée, sortie) — barème
 * public de l'API au 3 novembre 2026. La réflexion du modèle est facturée en
 * tokens de sortie. `cacheRead` : prix de lecture du cache quand il n'est pas
 * 0,1 × le prix d'entrée ; `longPrompt` : palier appliqué quand le prompt
 * dépasse `above` tokens.
 */
export type AnthropicModelPrice = {
  input: number;
  output: number;
  cacheRead?: number;
  longPrompt?: { above: number; input: number; output: number };
};

export const ANTHROPIC_PRICES_USD_PER_MTOK: Record<string, AnthropicModelPrice> = {
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, longPrompt: { above: 100_000, input: 0.5, output: 2.5 } },
  "claude-haiku-4-5": { input: 1, output: 5 },
};
/** Modèle dont le prix sert de repli quand le modèle servi n'est pas au barème. */
export const ANTHROPIC_FALLBACK_PRICE_MODEL = "claude-opus-5";
/** Écriture en cache : 1,25 × le prix d'entrée · lecture du cache : 0,1 × (sauf `cacheRead` du modèle). */
export const ANTHROPIC_CACHE_WRITE_FACTOR = 1.25;
export const ANTHROPIC_CACHE_READ_FACTOR = 0.1;

/** Suffixe d'un identifiant daté (« -20260401 ») ou d'un alias (« -latest ») : même modèle, même prix. */
const ANTHROPIC_SNAPSHOT_SUFFIX = /^-(\d{8}|latest)$/;

/**
 * Ligne du barème d'un modèle : identifiant exact ou daté (`known`), sinon
 * la ligne de la même famille — le plus long identifiant dont il prolonge le
 * nom, une version « claude-opus-5-6 » sortie après le barème — ou le prix de
 * repli, signalés `known: false` pour que l'admin montre un prix à vérifier.
 */
function anthropicPriceEntry(model: string | null | undefined): { price: AnthropicModelPrice; known: boolean } {
  const id = (model ?? "").trim().toLowerCase();
  if (Object.hasOwn(ANTHROPIC_PRICES_USD_PER_MTOK, id)) return { price: ANTHROPIC_PRICES_USD_PER_MTOK[id]!, known: true };
  const family = Object.keys(ANTHROPIC_PRICES_USD_PER_MTOK)
    .filter((key) => id.startsWith(`${key}-`))
    .sort((a, b) => b.length - a.length)[0];
  if (family) return { price: ANTHROPIC_PRICES_USD_PER_MTOK[family]!, known: ANTHROPIC_SNAPSHOT_SUFFIX.test(id.slice(family.length)) };
  return { price: ANTHROPIC_PRICES_USD_PER_MTOK[ANTHROPIC_FALLBACK_PRICE_MODEL]!, known: false };
}

/**
 * Prix de base d'un modèle Anthropic (entrée, sortie, par million de
 * tokens). `known: false` : le modèle n'est pas au barème, le prix est celui
 * de sa famille ou, à défaut, le prix de repli.
 */
export function anthropicPrice(model: string | null | undefined): { input: number; output: number; known: boolean } {
  const { price, known } = anthropicPriceEntry(model);
  return { input: price.input, output: price.output, known };
}

export type AnthropicTokenUsage = { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number };

const count = (value: number | null | undefined): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/** Coût d'un appel Anthropic au barème, d'après les tokens réellement consommés. */
export function anthropicCostUsd(model: string | null | undefined, usage: AnthropicTokenUsage): number {
  const { price } = anthropicPriceEntry(model);
  const input = count(usage.inputTokens);
  const cacheWrite = count(usage.cacheWriteTokens);
  const cacheRead = count(usage.cacheReadTokens);
  // Le palier se décide sur le prompt entier : entrée hors cache, écriture et lecture du cache
  const long = price.longPrompt && input + cacheWrite + cacheRead > price.longPrompt.above ? price.longPrompt : null;
  const inputPrice = long ? long.input : price.input;
  const outputPrice = long ? long.output : price.output;
  const cacheReadPrice = !long && price.cacheRead !== undefined ? price.cacheRead : inputPrice * ANTHROPIC_CACHE_READ_FACTOR;
  const total = input * inputPrice + cacheWrite * inputPrice * ANTHROPIC_CACHE_WRITE_FACTOR + cacheRead * cacheReadPrice + count(usage.outputTokens) * outputPrice;
  return roundUsd(total / 1_000_000);
}

/** Prix fal.ai : au mégapixel pour FLUX.1 schnell, à l'image pour FLUX 1.1 pro ultra. */
export const FAL_PRICES_USD: Record<string, { perMegapixel?: number; perImage?: number }> = {
  "fal-ai/flux/schnell": { perMegapixel: 0.003 },
  "fal-ai/flux-pro/v1.1-ultra": { perImage: 0.06 },
};
/** Prix appliqué à un modèle fal.ai absent du barème (celui du modèle par défaut). */
export const FAL_FALLBACK_PRICE_MODEL = "fal-ai/flux/schnell";

/** Coût d'une image fal.ai au barème (mégapixels arrondis au supérieur, comme la facturation). */
export function falCostUsd(model: string, width: number, height: number): number {
  const price = (Object.hasOwn(FAL_PRICES_USD, model) ? FAL_PRICES_USD[model] : undefined) ?? FAL_PRICES_USD[FAL_FALLBACK_PRICE_MODEL]!;
  if (price.perImage !== undefined) return roundUsd(price.perImage);
  const megapixels = Math.max(1, Math.ceil((count(width) * count(height)) / 1_000_000));
  return roundUsd(megapixels * (price.perMegapixel ?? 0));
}

/**
 * Google Places (API « New ») : prix à l'appel selon les champs demandés
 * (barème public, première tranche) et franchise mensuelle gratuite par type
 * d'appel. Les opérations enregistrées portent ces identifiants.
 */
export const GOOGLE_PLACES_OPERATIONS = {
  /** Text Search Enterprise (note et nombre d'avis demandés) */
  text_search: { label: "Recherche d'établissement", unitUsd: 0.035, freePerMonth: 1000 },
  /** Place Details Enterprise + Atmosphere (avis demandés) */
  place_details: { label: "Fiche détaillée", unitUsd: 0.025, freePerMonth: 1000 },
  /** Place Details Photos */
  place_photo: { label: "Photo", unitUsd: 0.007, freePerMonth: 1000 },
} as const;
export type GooglePlacesOperation = keyof typeof GOOGLE_PLACES_OPERATIONS;

export function isGooglePlacesOperation(value: string): value is GooglePlacesOperation {
  return Object.hasOwn(GOOGLE_PLACES_OPERATIONS, value);
}

/**
 * Montant réellement facturé pour `inPeriod` appels d'un type donné, sachant
 * que `beforeInMonth` appels du même type ont déjà eu lieu ce mois-là : les
 * premiers appels du mois sont gratuits (franchise), les suivants au prix
 * unitaire.
 */
export function googlePlacesBilledUsd(operation: GooglePlacesOperation, beforeInMonth: number, inPeriod: number): number {
  const { unitUsd, freePerMonth } = GOOGLE_PLACES_OPERATIONS[operation];
  const before = Math.max(0, Math.floor(count(beforeInMonth)));
  const within = Math.max(0, Math.floor(count(inPeriod)));
  const billable = Math.max(0, before + within - freePerMonth) - Math.max(0, before - freePerMonth);
  return roundUsd(billable * unitUsd);
}

/** ScrapeCreators : 47 $ les 25 000 crédits, un crédit par annonce. */
export const SCRAPECREATORS_CREDIT_USD = 47 / 25_000;

/** Coût arrondi au millionième de dollar (les appels unitaires valent souvent moins d'un centime). */
export function roundUsd(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1_000_000) / 1_000_000 : 0;
}

// ─── Périodes ────────────────────────────────────────────────────────────────

export const API_USAGE_PERIOD_IDS = ["mois", "mois-precedent", "30j", "7j", "aujourdhui"] as const;
export type ApiUsagePeriodId = (typeof API_USAGE_PERIOD_IDS)[number];

export const API_USAGE_PERIOD_LABELS: Record<ApiUsagePeriodId, string> = {
  mois: "Ce mois-ci",
  "mois-precedent": "Mois dernier",
  "30j": "30 derniers jours",
  "7j": "7 derniers jours",
  aujourdhui: "Aujourd'hui",
};

export type ApiUsagePeriod = {
  id: ApiUsagePeriodId;
  label: string;
  /** Début inclus */
  from: Date;
  /** Fin exclue */
  to: Date;
  /** Période précédente de même durée (comparaison) : début inclus, fin exclue */
  previousFrom: Date;
  previousTo: Date;
};

const DAY_MS = 86_400_000;

/**
 * Période d'analyse, en temps universel (comme les mois du registre des
 * quotas). Une valeur inconnue vaut « ce mois-ci ». La période précédente
 * sert à la comparaison : le mois d'avant pour un mois civil (jusqu'au même
 * jour du mois pour le mois en cours), la fenêtre glissante d'avant sinon.
 */
export function resolveApiUsagePeriod(value: string | null | undefined, now = new Date()): ApiUsagePeriod {
  const id: ApiUsagePeriodId = (API_USAGE_PERIOD_IDS as readonly string[]).includes(value ?? "") ? (value as ApiUsagePeriodId) : "mois";
  const label = API_USAGE_PERIOD_LABELS[id];
  const monthStart = (offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  if (id === "mois") {
    const from = monthStart(0);
    const previousFrom = monthStart(-1);
    // Même avancement dans le mois d'avant, sans dépasser sa fin
    const previousTo = new Date(Math.min(previousFrom.getTime() + (now.getTime() - from.getTime()), from.getTime()));
    return { id, label, from, to: now, previousFrom, previousTo };
  }
  if (id === "mois-precedent") {
    return { id, label, from: monthStart(-1), to: monthStart(0), previousFrom: monthStart(-2), previousTo: monthStart(-1) };
  }
  if (id === "aujourdhui") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { id, label, from, to: now, previousFrom: new Date(from.getTime() - DAY_MS), previousTo: new Date(now.getTime() - DAY_MS) };
  }
  const days = id === "7j" ? 7 : 30;
  const from = new Date(now.getTime() - days * DAY_MS);
  return { id, label, from, to: now, previousFrom: new Date(from.getTime() - days * DAY_MS), previousTo: from };
}
