import { and, desc, eq, gte, inArray, isNull, lt, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { apiUsage, getDb, PLANS, sites, subscriptions, type Database, type PlanId } from "@theralys/db";
import {
  anthropicPrice,
  API_FEATURE_IDS,
  API_PROVIDER_IDS,
  API_PROVIDERS,
  apiFeatureLabel,
  GOOGLE_PLACES_OPERATIONS,
  googlePlacesBilledUsd,
  isApiFeatureId,
  isApiProviderId,
  isGooglePlacesOperation,
  type ApiFeatureId,
  type ApiUsagePeriod,
  type ApiUsagePeriodId,
  type GooglePlacesOperation,
} from "@theralys/shared";
import { subscriptionMrr, type SubscriptionLike } from "./metrics";
import { usdToEur } from "./api-usage-format";

export * from "./api-usage-format";

/**
 * Pilotage des API : activité et coûts réels, lus dans le registre
 * `api_usage` (une ligne par appel à une API externe).
 *
 * Le SQL reste mince — des regroupements sur une période — et toute la mise
 * en forme est faite par des fonctions pures, testées unitairement :
 * franchise gratuite Google Places, ventilations par fournisseur,
 * fonctionnalité, site, modèle et jour, marge par site.
 *
 * Les coûts sont en dollars (`costUsd`) ; la conversion en euros se fait à
 * l'affichage (`./api-usage-format`).
 */

// ─── Filtres (paramètres GET) ────────────────────────────────────────────────

/** Valeur « sans rattachement » d'un filtre : appels sans fonctionnalité, ou sans site. */
export const USAGE_NONE = "none";

export type UsageFilters = {
  /** Identifiant du fournisseur tel qu'enregistré (`anthropic`, `fal`…) */
  provider: string | null;
  feature: ApiFeatureId | typeof USAGE_NONE | null;
  /** UUID du site, ou « sans site » */
  siteId: string | null;
  status: "ok" | "error" | null;
};

export const NO_USAGE_FILTERS: UsageFilters = { provider: null, feature: null, siteId: null, status: null };

/** Lignes du journal par page. */
export const USAGE_JOURNAL_PAGE_SIZE = 50;
/** Dernière page qu'un paramètre `page` peut demander (borne de sécurité sur l'OFFSET). */
export const USAGE_JOURNAL_MAX_PAGE = 2000;

export type UsageSearchParams = Record<string, string | string[] | undefined>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Fournisseur absent du barème mais présent dans le registre : identifiant simple uniquement. */
const PROVIDER_SLUG_RE = /^[a-z0-9][a-z0-9_.-]{0,39}$/;

const firstParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? "") : (value ?? "")).trim();

/**
 * Filtres de la page « API & coûts », lus dans l'URL (`fournisseur`,
 * `fonctionnalite`, `site`, `statut`). Toute valeur hors liste est ignorée :
 * rien de ce que l'utilisateur saisit n'atteint le SQL sans validation.
 */
export function parseUsageFilters(params: UsageSearchParams): UsageFilters {
  const provider = firstParam(params.fournisseur).toLowerCase();
  const feature = firstParam(params.fonctionnalite);
  const site = firstParam(params.site).toLowerCase();
  const status = firstParam(params.statut).toLowerCase();
  return {
    provider: isApiProviderId(provider) || PROVIDER_SLUG_RE.test(provider) ? provider : null,
    feature: isApiFeatureId(feature) ? feature : feature === "aucune" ? USAGE_NONE : null,
    siteId: UUID_RE.test(site) ? site : site === "aucun" ? USAGE_NONE : null,
    status: status === "ok" ? "ok" : status === "erreur" || status === "error" ? "error" : null,
  };
}

/** Numéro de page demandé (1 par défaut, entier borné). */
export function parseUsagePage(value: string | string[] | undefined): number {
  const text = firstParam(value);
  if (!/^\d{1,6}$/.test(text)) return 1;
  return Math.min(USAGE_JOURNAL_MAX_PAGE, Math.max(1, Number(text)));
}

export function hasUsageFilters(filters: UsageFilters): boolean {
  return Boolean(filters.provider || filters.feature || filters.siteId || filters.status);
}

/** Adresse d'une vue (période, filtres, page) : seuls les paramètres utiles sont écrits. */
export function usageHref(
  path: string,
  options: { period?: ApiUsagePeriodId; filters?: Partial<UsageFilters>; page?: number; hash?: string } = {},
): string {
  const query = new URLSearchParams();
  if (options.period && options.period !== "mois") query.set("periode", options.period);
  const filters = options.filters ?? {};
  if (filters.provider) query.set("fournisseur", filters.provider);
  if (filters.feature) query.set("fonctionnalite", filters.feature === USAGE_NONE ? "aucune" : filters.feature);
  if (filters.siteId) query.set("site", filters.siteId === USAGE_NONE ? "aucun" : filters.siteId);
  if (filters.status) query.set("statut", filters.status === "error" ? "erreur" : "ok");
  if (options.page && options.page > 1) query.set("page", String(options.page));
  const search = query.toString();
  return `${path}${search ? `?${search}` : ""}${options.hash ? `#${options.hash}` : ""}`;
}

const USAGE_PARAM_KEYS = ["periode", "fournisseur", "fonctionnalite", "site", "statut", "page"];

/**
 * Adresse canonique d'une vue : uniquement les paramètres validés, dans un
 * ordre fixe. `isCanonical` est faux quand l'adresse reçue en diffère
 * (paramètre vide envoyé par le formulaire, valeur invalide, paramètre
 * inconnu) : la page redirige alors vers `href`.
 */
export function canonicalUsageHref(path: string, params: UsageSearchParams, period: ApiUsagePeriodId): { href: string; isCanonical: boolean } {
  const href = usageHref(path, { period, filters: parseUsageFilters(params), page: parseUsagePage(params.page) });
  const received = new URLSearchParams();
  for (const key of USAGE_PARAM_KEYS) {
    const value = params[key];
    if (value !== undefined) received.set(key, Array.isArray(value) ? (value[0] ?? "") : value);
  }
  const hasUnknownParam = Object.keys(params).some((key) => !USAGE_PARAM_KEYS.includes(key));
  const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  return { href, isCanonical: !hasUnknownParam && received.toString() === query };
}

// ─── Lignes agrégées (sorties du SQL) ────────────────────────────────────────

/** Regroupement de la période par dimension métier — `month` : mois civil en temps universel (« 2026-11 »). */
export type UsageCubeRow = {
  month: string;
  provider: string;
  operation: string;
  feature: string | null;
  siteId: string | null;
  model: string | null;
  costSource: string;
  status: string;
  calls: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  units: number;
  /** Coût inscrit au registre (prix catalogue pour Google Places) */
  costUsd: number;
  durationMs: number;
  /** Appels dont la durée a été mesurée (les lignes reprises de l'historique n'en ont pas) */
  timedCalls: number;
  /** Appels servis par un autre modèle que celui demandé (repli côté serveur, `meta.requestedModel`) */
  fallbackCalls: number;
  lastAt: Date | null;
};

export type UsageGranularity = "day" | "hour";

/** Regroupement par intervalle de temps — `bucket` : jour (« 2026-11-03 ») ou heure (« 2026-11-03T14 »), en temps universel. */
export type UsageSeriesRow = {
  bucket: string;
  provider: string;
  operation: string;
  status: string;
  calls: number;
  costUsd: number;
};

/** Appels Google Places d'un mois civil, par type : avant la période (`before`) et pendant (`within`). */
export type PlacesMonthRow = {
  month: string;
  operation: string;
  before: number;
  within: number;
  /** Prix catalogue des appels de la période */
  listUsd: number;
};

export type ProviderErrorRow = { provider: string; operation: string; error: string | null; createdAt: Date };

/** Dernier solde de crédits ScrapeCreators relevé (`meta.creditsRemaining` du dernier appel qui le porte). */
export type CreditsRow = { credits: number | string | null; at: Date };

/** Dernier appel à la bibliothèque publicitaire Meta, quel que soit son résultat. */
export type MetaLastCallRow = { status: string; error: string | null; createdAt: Date };

export type UsageJournalRow = {
  id: string;
  createdAt: Date;
  provider: string;
  operation: string;
  feature: string | null;
  siteId: string | null;
  siteName: string | null;
  model: string | null;
  status: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  units: number;
  costUsd: number;
  costSource: string;
  durationMs: number;
  error: string | null;
};

/** Site connu de la plateforme, avec son abonnement (pour le revenu et la marge). */
export type UsageSite = {
  id: string;
  name: string;
  type: "demo" | "client";
  status: string;
  plan: PlanId;
  subscription: SubscriptionLike | null;
};

// ─── Table absente ───────────────────────────────────────────────────────────

/**
 * La table `api_usage` n'existe pas encore (migration 0008 non appliquée) :
 * erreur Postgres 42P01, éventuellement enveloppée par drizzle (`cause`).
 */
export function isMissingTableError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 6 && typeof current === "object" && current !== null; depth++) {
    if ((current as { code?: unknown }).code === "42P01") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

// ─── Google Places : franchise gratuite ──────────────────────────────────────

export const GOOGLE_PLACES_PROVIDER = "google_places";

export type PlacesBillingLine = {
  month: string;
  operation: GooglePlacesOperation;
  label: string;
  /** Appels du mois antérieurs à la période */
  before: number;
  /** Appels de la période dans ce mois */
  within: number;
  freePerMonth: number;
  /** Appels de la période couverts par la franchise */
  freeCalls: number;
  /** Appels de la période réellement facturés */
  billedCalls: number;
  listUsd: number;
  billedUsd: number;
  /** Part du prix catalogue réellement facturée (0 à 1), appliquée à chaque coût Places de ce mois et de ce type */
  ratio: number;
};

export type PlacesBilling = {
  lines: PlacesBillingLine[];
  listUsd: number;
  billedUsd: number;
  /** Ratio par « mois|opération » */
  ratios: Record<string, number>;
};

const placesKey = (month: string, operation: string): string => `${month}|${operation}`;

const whole = (value: number): number => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
const positive = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

/**
 * Montant réellement facturé par Google Places sur une période. Le registre
 * inscrit le prix catalogue de chaque appel, mais Google offre 1 000 appels
 * par mois et par type : pour chaque type d'appel et chaque mois civil de la
 * période, on calcule le montant dû compte tenu des appels déjà faits ce
 * mois-là (`googlePlacesBilledUsd`), puis le ratio facturé / catalogue.
 * Ce ratio s'applique ensuite à tous les coûts Places des ventilations, pour
 * que les totaux concordent partout.
 */
export function computePlacesBilling(rows: readonly PlacesMonthRow[]): PlacesBilling {
  // Plusieurs lignes peuvent décrire le même mois et le même type : on les cumule d'abord
  const merged = new Map<string, { month: string; operation: GooglePlacesOperation; before: number; within: number; listUsd: number }>();
  for (const row of rows) {
    // Type d'appel hors barème : pas de franchise connue, le prix catalogue est gardé
    if (!isGooglePlacesOperation(row.operation)) continue;
    const key = placesKey(row.month, row.operation);
    const entry = merged.get(key) ?? { month: row.month, operation: row.operation, before: 0, within: 0, listUsd: 0 };
    entry.before += whole(row.before);
    entry.within += whole(row.within);
    entry.listUsd += positive(row.listUsd);
    merged.set(key, entry);
  }

  const lines: PlacesBillingLine[] = [];
  const ratios: Record<string, number> = {};
  let listUsd = 0;
  let billedUsd = 0;
  for (const [key, entry] of merged) {
    const { label, freePerMonth, unitUsd } = GOOGLE_PLACES_OPERATIONS[entry.operation];
    const due = googlePlacesBilledUsd(entry.operation, entry.before, entry.within);
    // Jamais plus que le prix catalogue inscrit : le ratio est borné à 1
    const ratio = entry.listUsd > 0 ? Math.min(1, due / entry.listUsd) : 1;
    const billed = entry.listUsd > 0 ? entry.listUsd * ratio : 0;
    const billedCalls = unitUsd > 0 ? Math.min(entry.within, Math.round(due / unitUsd)) : 0;
    lines.push({
      month: entry.month,
      operation: entry.operation,
      label,
      before: entry.before,
      within: entry.within,
      freePerMonth,
      freeCalls: entry.within - billedCalls,
      billedCalls,
      listUsd: entry.listUsd,
      billedUsd: billed,
      ratio,
    });
    ratios[key] = ratio;
    listUsd += entry.listUsd;
    billedUsd += billed;
  }
  lines.sort((a, b) => a.month.localeCompare(b.month) || a.operation.localeCompare(b.operation));
  return { lines, listUsd, billedUsd, ratios };
}

/** Part du prix catalogue réellement facturée pour un appel (1 hors Google Places). */
export function placesCostRatio(billing: PlacesBilling, provider: string, month: string, operation: string): number {
  if (provider !== GOOGLE_PLACES_PROVIDER) return 1;
  return billing.ratios[placesKey(month, operation)] ?? 1;
}

/** Coût facturé : la franchise Google Places est déduite, `listCostUsd` garde le prix catalogue. */
export type Billed<T> = T & { listCostUsd: number };

/** Applique la franchise Google Places à des lignes agrégées par mois. */
export function applyPlacesBilling<T extends { provider: string; operation: string; month: string; costUsd: number }>(
  rows: readonly T[],
  billing: PlacesBilling,
): Billed<T>[] {
  return rows.map((row) => ({
    ...row,
    listCostUsd: row.costUsd,
    costUsd: row.costUsd * placesCostRatio(billing, row.provider, row.month, row.operation),
  }));
}

export type PlacesFreeTierLine = {
  operation: GooglePlacesOperation;
  label: string;
  /** Appels du mois civil en cours */
  used: number;
  freePerMonth: number;
  /** Appels facturés ce mois-ci (au-delà de la franchise) */
  billedCalls: number;
  billedUsd: number;
};

/**
 * Consommation de la franchise gratuite du mois civil en cours, pour chaque
 * type d'appel Google Places (même sans appel : la ligne indique 0 / 1 000).
 */
export function placesFreeTier(rows: readonly PlacesMonthRow[], month: string): PlacesFreeTierLine[] {
  const billing = computePlacesBilling(rows.filter((row) => row.month === month));
  return (Object.keys(GOOGLE_PLACES_OPERATIONS) as GooglePlacesOperation[]).map((operation) => {
    const line = billing.lines.find((entry) => entry.operation === operation);
    const { label, freePerMonth } = GOOGLE_PLACES_OPERATIONS[operation];
    const used = line ? line.before + line.within : 0;
    return {
      operation,
      label,
      used,
      freePerMonth,
      billedCalls: Math.max(0, used - freePerMonth),
      billedUsd: googlePlacesBilledUsd(operation, 0, used),
    };
  });
}

// ─── Filtrage et totaux ──────────────────────────────────────────────────────

const isError = (status: string): boolean => status === "error";

/** Fonctionnalité reconnue, sinon `null` (« Non attribué »). */
export function usageFeatureKey(feature: string | null | undefined): ApiFeatureId | null {
  return isApiFeatureId(feature) ? feature : null;
}

/** Une ligne agrégée correspond-elle aux filtres ? (même règle que le SQL de `usageWhere`) */
export function matchesUsageFilters(
  row: { provider: string; feature: string | null; siteId: string | null; status: string },
  filters: UsageFilters,
): boolean {
  if (filters.provider && row.provider !== filters.provider) return false;
  if (filters.feature === USAGE_NONE ? usageFeatureKey(row.feature) !== null : filters.feature && row.feature !== filters.feature) return false;
  if (filters.siteId === USAGE_NONE ? row.siteId !== null : filters.siteId && row.siteId !== filters.siteId) return false;
  if (filters.status === "error" && !isError(row.status)) return false;
  if (filters.status === "ok" && isError(row.status)) return false;
  return true;
}

export type UsageBaseTotals = { calls: number; errors: number; costUsd: number };

/** Appels, erreurs et coût d'un ensemble de lignes agrégées. */
export function sumUsage(rows: readonly { calls: number; status: string; costUsd: number }[]): UsageBaseTotals {
  let calls = 0;
  let errors = 0;
  let costUsd = 0;
  for (const row of rows) {
    calls += row.calls;
    if (isError(row.status)) errors += row.calls;
    costUsd += row.costUsd;
  }
  return { calls, errors, costUsd };
}

export type UsageTotals = UsageBaseTotals & {
  /** Part des appels en erreur (0 à 1) */
  errorRate: number;
  /** Prix catalogue (avant franchise Google Places) */
  listCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  avgCostUsd: number;
  avgDurationMs: number | null;
};

export function summarizeTotals(rows: readonly Billed<UsageCubeRow>[]): UsageTotals {
  const base = sumUsage(rows);
  let listCostUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let durationMs = 0;
  let timedCalls = 0;
  for (const row of rows) {
    listCostUsd += row.listCostUsd;
    inputTokens += row.inputTokens;
    outputTokens += row.outputTokens;
    cacheReadTokens += row.cacheReadTokens;
    cacheWriteTokens += row.cacheWriteTokens;
    durationMs += row.durationMs;
    timedCalls += row.timedCalls;
  }
  return {
    ...base,
    errorRate: base.calls > 0 ? base.errors / base.calls : 0,
    listCostUsd,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    avgCostUsd: base.calls > 0 ? base.costUsd / base.calls : 0,
    avgDurationMs: timedCalls > 0 ? durationMs / timedCalls : null,
  };
}

/** Variation relative (0,12 = +12 %) ; `null` sans point de comparaison. */
export function percentDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return (current - previous) / previous;
}

// ─── Par fournisseur ─────────────────────────────────────────────────────────

export type ProviderSummary = {
  id: string;
  /** Fournisseur du barème (`API_PROVIDERS`) ; faux pour une valeur inconnue trouvée dans le registre */
  known: boolean;
  label: string;
  role: string;
  unit: string;
  pricing: string;
  free: boolean;
  calls: number;
  errors: number;
  errorRate: number;
  costUsd: number;
  listCostUsd: number;
  /** Part du coût total de la sélection (0 à 1) */
  share: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  units: number;
  avgDurationMs: number | null;
  lastCallAt: Date | null;
  lastError: { message: string; operation: string; at: Date } | null;
  /** Provenance des coûts rencontrée sur la période : `provider` (coût réel), `tariff` (barème), `free` */
  costSources: string[];
};

const COST_SOURCE_ORDER = ["provider", "tariff", "free"];

function providerInfo(id: string): Pick<ProviderSummary, "known" | "label" | "role" | "unit" | "pricing" | "free"> {
  if (isApiProviderId(id)) return { known: true, ...API_PROVIDERS[id] };
  return {
    known: false,
    label: id,
    role: "Fournisseur absent du barème",
    unit: "unités",
    pricing: "Tarif inconnu : ce fournisseur n'est pas répertorié dans le barème.",
    free: false,
  };
}

/**
 * Activité et coût par fournisseur. Tous les fournisseurs du barème
 * apparaissent, même sans appel — ainsi que toute valeur inconnue trouvée
 * dans le registre. Tri : coût, puis appels, puis ordre du barème.
 */
export function summarizeByProvider(
  rows: readonly Billed<UsageCubeRow>[],
  lastErrors: readonly ProviderErrorRow[] = [],
  /** Fournisseurs à lister même sans appel (par défaut : tout le barème) */
  always: readonly string[] = API_PROVIDER_IDS,
): ProviderSummary[] {
  type Acc = ProviderSummary & { durationMs: number; timedCalls: number };
  const byId = new Map<string, Acc>();
  const ensure = (id: string): Acc => {
    let entry = byId.get(id);
    if (!entry) {
      entry = {
        id,
        ...providerInfo(id),
        calls: 0,
        errors: 0,
        errorRate: 0,
        costUsd: 0,
        listCostUsd: 0,
        share: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        units: 0,
        avgDurationMs: null,
        lastCallAt: null,
        lastError: null,
        costSources: [],
        durationMs: 0,
        timedCalls: 0,
      };
      byId.set(id, entry);
    }
    return entry;
  };
  for (const id of always) ensure(id);

  let totalCost = 0;
  for (const row of rows) {
    const entry = ensure(row.provider);
    entry.calls += row.calls;
    if (isError(row.status)) entry.errors += row.calls;
    entry.costUsd += row.costUsd;
    entry.listCostUsd += row.listCostUsd;
    entry.inputTokens += row.inputTokens;
    entry.outputTokens += row.outputTokens;
    entry.cacheReadTokens += row.cacheReadTokens;
    entry.cacheWriteTokens += row.cacheWriteTokens;
    entry.units += row.units;
    entry.durationMs += row.durationMs;
    entry.timedCalls += row.timedCalls;
    if (row.lastAt && (!entry.lastCallAt || row.lastAt > entry.lastCallAt)) entry.lastCallAt = row.lastAt;
    if (row.calls > 0 && !entry.costSources.includes(row.costSource)) entry.costSources.push(row.costSource);
    totalCost += row.costUsd;
  }
  for (const error of lastErrors) {
    const entry = byId.get(error.provider);
    if (!entry || (entry.lastError && entry.lastError.at >= error.createdAt)) continue;
    entry.lastError = { message: error.error?.trim() || "Erreur sans message", operation: error.operation, at: error.createdAt };
  }

  const rank = (id: string): number => {
    const index = (API_PROVIDER_IDS as readonly string[]).indexOf(id);
    return index === -1 ? API_PROVIDER_IDS.length : index;
  };
  return [...byId.values()]
    .map(({ durationMs, timedCalls, ...entry }) => ({
      ...entry,
      errorRate: entry.calls > 0 ? entry.errors / entry.calls : 0,
      share: totalCost > 0 ? entry.costUsd / totalCost : 0,
      avgDurationMs: timedCalls > 0 ? durationMs / timedCalls : null,
      costSources: [...entry.costSources].sort((a, b) => COST_SOURCE_ORDER.indexOf(a) - COST_SOURCE_ORDER.indexOf(b)),
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls || rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

// ─── Par fonctionnalité ──────────────────────────────────────────────────────

export type FeatureSummary = {
  /** `null` : appels non attribués */
  id: ApiFeatureId | null;
  label: string;
  calls: number;
  errors: number;
  costUsd: number;
  share: number;
};

/** Activité et coût par fonctionnalité de la plateforme (celles qui ont eu des appels). */
export function summarizeByFeature(rows: readonly Billed<UsageCubeRow>[]): FeatureSummary[] {
  const byId = new Map<ApiFeatureId | null, FeatureSummary>();
  let totalCost = 0;
  for (const row of rows) {
    if (row.calls <= 0) continue;
    const id = usageFeatureKey(row.feature);
    const entry = byId.get(id) ?? { id, label: apiFeatureLabel(id), calls: 0, errors: 0, costUsd: 0, share: 0 };
    entry.calls += row.calls;
    if (isError(row.status)) entry.errors += row.calls;
    entry.costUsd += row.costUsd;
    byId.set(id, entry);
    totalCost += row.costUsd;
  }
  return [...byId.values()]
    .map((entry) => ({ ...entry, share: totalCost > 0 ? entry.costUsd / totalCost : 0 }))
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls || a.label.localeCompare(b.label, "fr"));
}

// ─── Par site ────────────────────────────────────────────────────────────────

/** Libellé de la ligne des appels faits hors de tout site (recherche d'établissements, e-mails d'invitation…). */
export const PLATFORM_SITE_LABEL = "Sans site (plateforme)";

/**
 * Part du revenu mensuel à rapprocher du coût de la période : le mois entier
 * pour les vues mensuelles (mois en cours, mois dernier, 30 jours), ramené à
 * la durée de la fenêtre pour 7 jours et pour la journée.
 */
export function periodRevenueShare(period: ApiUsagePeriodId): number {
  if (period === "7j") return 7 / 30;
  if (period === "aujourdhui") return 1 / 30;
  return 1;
}

export type SiteSummary = {
  /** `null` : appels sans site */
  siteId: string | null;
  name: string;
  type: "demo" | "client" | null;
  siteStatus: string | null;
  plan: PlanId | null;
  planLabel: string | null;
  subscriptionStatus: SubscriptionLike["status"] | null;
  calls: number;
  errors: number;
  costUsd: number;
  share: number;
  /** Revenu mensuel de l'abonnement, en euros (sites clients uniquement) */
  revenueEur: number | null;
  /** Revenu rapproché de la période (`periodRevenueShare`) moins le coût API, en euros */
  marginEur: number | null;
  /** Marge rapportée au revenu (0 à 1) ; `null` sans revenu */
  marginRate: number | null;
};

/**
 * Coût API par site, avec le revenu mensuel et la marge brute des sites
 * clients. Les appels sans site forment la ligne « Sans site (plateforme) ».
 * `includeIdleClients` ajoute les sites clients actifs sans aucun appel sur
 * la période (leur marge est alors entière).
 */
export function summarizeBySite(
  rows: readonly Billed<UsageCubeRow>[],
  knownSites: readonly UsageSite[],
  period: ApiUsagePeriodId,
  options: { includeIdleClients?: boolean } = {},
): SiteSummary[] {
  const siteById = new Map(knownSites.map((site) => [site.id, site]));
  const usage = new Map<string | null, UsageBaseTotals>();
  let totalCost = 0;
  for (const row of rows) {
    if (row.calls <= 0) continue;
    const entry = usage.get(row.siteId) ?? { calls: 0, errors: 0, costUsd: 0 };
    entry.calls += row.calls;
    if (isError(row.status)) entry.errors += row.calls;
    entry.costUsd += row.costUsd;
    usage.set(row.siteId, entry);
    totalCost += row.costUsd;
  }
  if (options.includeIdleClients) {
    for (const site of knownSites) {
      if (site.type === "client" && site.status !== "archived" && !usage.has(site.id)) usage.set(site.id, { calls: 0, errors: 0, costUsd: 0 });
    }
  }

  const revenueShare = periodRevenueShare(period);
  const summaries: SiteSummary[] = [];
  for (const [siteId, totals] of usage) {
    const site = siteId ? siteById.get(siteId) : undefined;
    const share = totalCost > 0 ? totals.costUsd / totalCost : 0;
    if (!site) {
      summaries.push({
        siteId,
        name: siteId ? "Site supprimé" : PLATFORM_SITE_LABEL,
        type: null,
        siteStatus: null,
        plan: null,
        planLabel: null,
        subscriptionStatus: null,
        ...totals,
        share,
        revenueEur: null,
        marginEur: null,
        marginRate: null,
      });
      continue;
    }
    const isClient = site.type === "client";
    const revenueEur = isClient ? (site.subscription ? subscriptionMrr(site.subscription) : 0) : null;
    const periodRevenue = revenueEur === null ? null : revenueEur * revenueShare;
    const marginEur = periodRevenue === null ? null : periodRevenue - usdToEur(totals.costUsd);
    summaries.push({
      siteId,
      name: site.name,
      type: site.type,
      siteStatus: site.status,
      plan: site.plan,
      planLabel: PLANS[site.plan].label,
      subscriptionStatus: site.subscription?.status ?? null,
      ...totals,
      share,
      revenueEur,
      marginEur,
      marginRate: periodRevenue !== null && marginEur !== null && periodRevenue > 0 ? marginEur / periodRevenue : null,
    });
  }
  return summaries.sort(
    (a, b) => b.costUsd - a.costUsd || b.calls - a.calls || (b.revenueEur ?? -1) - (a.revenueEur ?? -1) || a.name.localeCompare(b.name, "fr"),
  );
}

/** Coût API porté par les sites clients, et moyenne par site client actif. */
export function clientSitesCost(summaries: readonly SiteSummary[], activeClientCount: number): { costUsd: number; avgCostUsd: number | null } {
  const costUsd = summaries.filter((site) => site.type === "client").reduce((sum, site) => sum + site.costUsd, 0);
  return { costUsd, avgCostUsd: activeClientCount > 0 ? costUsd / activeClientCount : null };
}

// ─── Par modèle (Anthropic) ──────────────────────────────────────────────────

export type ModelSummary = {
  /** Identifiant du modèle ; chaîne vide quand l'appel n'en portait pas */
  model: string;
  /** Prix au barème (`anthropicPrice`) ; sinon le coût est calculé au prix de repli */
  priceKnown: boolean;
  calls: number;
  errors: number;
  /** Appels pour lesquels un autre modèle avait été demandé (repli côté serveur) */
  fallbackCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  avgCostUsd: number;
  share: number;
};

/** Consommation Anthropic par modèle ; signale les modèles dont le prix n'est pas au barème. */
export function summarizeByModel(rows: readonly Billed<UsageCubeRow>[]): ModelSummary[] {
  const byModel = new Map<string, ModelSummary>();
  let totalCost = 0;
  for (const row of rows) {
    if (row.provider !== "anthropic" || row.calls <= 0) continue;
    const model = (row.model ?? "").trim();
    const entry = byModel.get(model) ?? {
      model,
      priceKnown: model !== "" && anthropicPrice(model).known,
      calls: 0,
      errors: 0,
      fallbackCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
      avgCostUsd: 0,
      share: 0,
    };
    entry.calls += row.calls;
    if (isError(row.status)) entry.errors += row.calls;
    entry.fallbackCalls += row.fallbackCalls;
    entry.inputTokens += row.inputTokens;
    entry.outputTokens += row.outputTokens;
    entry.cacheReadTokens += row.cacheReadTokens;
    entry.cacheWriteTokens += row.cacheWriteTokens;
    entry.costUsd += row.costUsd;
    byModel.set(model, entry);
    totalCost += row.costUsd;
  }
  return [...byModel.values()]
    .map((entry) => ({ ...entry, avgCostUsd: entry.calls > 0 ? entry.costUsd / entry.calls : 0, share: totalCost > 0 ? entry.costUsd / totalCost : 0 }))
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls || a.model.localeCompare(b.model));
}

export type AnthropicFeatureSummary = {
  id: ApiFeatureId | null;
  label: string;
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Coût moyen d'un appel : très variable selon la profondeur de réflexion demandée */
  avgCostUsd: number;
};

export type AnthropicSummary = {
  calls: number;
  errors: number;
  costUsd: number;
  avgCostUsd: number;
  /** Appels servis par un autre modèle que celui demandé (« modèle demandé ≠ modèle servi ») */
  fallbackCalls: number;
  byFeature: AnthropicFeatureSummary[];
};

/**
 * Anthropic, premier poste de coût : coût moyen par appel, global et par
 * fonctionnalité, et nombre d'appels servis par un modèle de repli.
 */
export function summarizeAnthropic(rows: readonly Billed<UsageCubeRow>[]): AnthropicSummary {
  const byFeature = new Map<ApiFeatureId | null, AnthropicFeatureSummary>();
  let calls = 0;
  let errors = 0;
  let costUsd = 0;
  let fallbackCalls = 0;
  for (const row of rows) {
    if (row.provider !== "anthropic" || row.calls <= 0) continue;
    const id = usageFeatureKey(row.feature);
    const entry = byFeature.get(id) ?? { id, label: apiFeatureLabel(id), calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, avgCostUsd: 0 };
    entry.calls += row.calls;
    if (isError(row.status)) entry.errors += row.calls;
    entry.inputTokens += row.inputTokens;
    entry.outputTokens += row.outputTokens;
    entry.costUsd += row.costUsd;
    byFeature.set(id, entry);
    calls += row.calls;
    if (isError(row.status)) errors += row.calls;
    costUsd += row.costUsd;
    fallbackCalls += row.fallbackCalls;
  }
  return {
    calls,
    errors,
    costUsd,
    avgCostUsd: calls > 0 ? costUsd / calls : 0,
    fallbackCalls,
    byFeature: [...byFeature.values()]
      .map((entry) => ({ ...entry, avgCostUsd: entry.calls > 0 ? entry.costUsd / entry.calls : 0 }))
      .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls || a.label.localeCompare(b.label, "fr")),
  };
}

// ─── Soldes et échéances ─────────────────────────────────────────────────────

/** Seuil d'alerte du solde ScrapeCreators (crédits restants). */
export const SCRAPECREATORS_LOW_CREDITS = 200;

export type CreditsBalance = { credits: number; at: Date; low: boolean };

/** Solde de crédits ScrapeCreators au dernier appel qui l'a relevé ; `null` si aucun appel ne le porte. */
export function scrapeCreatorsBalance(row: CreditsRow | null | undefined): CreditsBalance | null {
  if (!row || row.credits === null || row.credits === "") return null;
  const credits = Number(row.credits);
  if (!Number.isFinite(credits)) return null;
  return { credits, at: row.at, low: credits < SCRAPECREATORS_LOW_CREDITS };
}

/** Message d'erreur de l'API Meta qui signale un jeton expiré ou refusé (OAuthException, code 190). */
export function isMetaTokenError(message: string | null | undefined): boolean {
  return /access[\s_-]?token|code\s*:?\s*190\b/i.test(message ?? "");
}

export type MetaTokenState = {
  /** `expired` : le dernier appel a été refusé pour une raison de jeton · `ok` : le dernier appel a réussi · `unknown` : aucun appel, ou dernier échec sans rapport avec le jeton */
  status: "expired" | "ok" | "unknown";
  lastSuccessAt: Date | null;
  /** Date et message de l'erreur de jeton (statut `expired`) */
  errorAt: Date | null;
  errorMessage: string | null;
};

/**
 * État du jeton de la bibliothèque publicitaire Meta, déduit du registre : il
 * expire tous les 60 jours environ et ne peut pas être vérifié depuis l'admin.
 */
export function metaTokenState(last: MetaLastCallRow | null | undefined, lastSuccessAt: Date | null): MetaTokenState {
  if (!last) return { status: "unknown", lastSuccessAt, errorAt: null, errorMessage: null };
  if (isError(last.status)) {
    return isMetaTokenError(last.error)
      ? { status: "expired", lastSuccessAt, errorAt: last.createdAt, errorMessage: last.error }
      : { status: "unknown", lastSuccessAt, errorAt: null, errorMessage: null };
  }
  return { status: "ok", lastSuccessAt: lastSuccessAt ?? last.createdAt, errorAt: null, errorMessage: null };
}

// ─── Par jour (graphique) ────────────────────────────────────────────────────

/**
 * Fournisseurs payants, dans l'ordre fixe des séries du graphique : la
 * couleur suit le fournisseur (série 1 = Anthropic…), jamais son rang, pour
 * qu'un changement de période ne repeigne rien. Tout autre fournisseur
 * facturé rejoint « Autres ».
 */
export const CHART_PROVIDER_ORDER = ["anthropic", "fal", "google_places", "dataforseo", "scrapecreators", "ovh"] as const;
export const CHART_OTHER_KEY = "autres";
/** Séries distinctes au plus, avant regroupement dans « Autres ». */
export const CHART_MAX_SERIES = 6;

const DAY_MS = 86_400_000;
const MAX_BUCKETS = 92;

/**
 * Intervalles d'une période, en temps universel : chaque jour touché par
 * `[from, to[`, ou les 24 heures du jour de `from` (vue « Aujourd'hui »).
 */
export function listBuckets(from: Date, to: Date, granularity: UsageGranularity): string[] {
  if (granularity === "hour") {
    const day = from.toISOString().slice(0, 10);
    return Array.from({ length: 24 }, (_, hour) => `${day}T${String(hour).padStart(2, "0")}`);
  }
  const buckets: string[] = [];
  const last = Math.max(from.getTime(), to.getTime() - 1);
  for (
    let time = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    time <= last && buckets.length < MAX_BUCKETS;
    time += DAY_MS
  ) {
    buckets.push(new Date(time).toISOString().slice(0, 10));
  }
  return buckets;
}

export type DailySeries = {
  granularity: UsageGranularity;
  /** Séries dans l'ordre d'empilement (du bas vers le haut) ; « Autres » en dernier */
  series: { key: string; label: string }[];
  buckets: { key: string; calls: number; errors: number; totalUsd: number; valuesUsd: number[] }[];
  totalUsd: number;
  /** Plus grand total d'un intervalle */
  maxUsd: number;
};

/**
 * Coût par intervalle, ventilé par fournisseur : les `maxSeries` fournisseurs
 * payants les plus coûteux gardent leur série, le reste est regroupé dans
 * « Autres ». Les intervalles sans appel sont présents, à zéro.
 */
export function buildDailySeries(
  rows: readonly UsageSeriesRow[],
  options: { from: Date; to: Date; granularity: UsageGranularity; maxSeries?: number },
): DailySeries {
  const maxSeries = Math.max(0, options.maxSeries ?? CHART_MAX_SERIES);
  const costByProvider = new Map<string, number>();
  for (const row of rows) costByProvider.set(row.provider, (costByProvider.get(row.provider) ?? 0) + row.costUsd);

  const kept = new Set(
    CHART_PROVIDER_ORDER.filter((id) => (costByProvider.get(id) ?? 0) > 0)
      .sort((a, b) => (costByProvider.get(b) ?? 0) - (costByProvider.get(a) ?? 0))
      .slice(0, maxSeries),
  );
  const series: DailySeries["series"] = CHART_PROVIDER_ORDER.filter((id) => kept.has(id)).map((id) => ({ key: id, label: API_PROVIDERS[id].label }));
  const hasOther = [...costByProvider].some(([id, cost]) => cost > 0 && !(kept as Set<string>).has(id));
  if (hasOther) series.push({ key: CHART_OTHER_KEY, label: "Autres" });
  const indexOf = new Map(series.map((entry, index) => [entry.key, index]));

  const buckets = listBuckets(options.from, options.to, options.granularity).map((key) => ({
    key,
    calls: 0,
    errors: 0,
    totalUsd: 0,
    valuesUsd: series.map(() => 0),
  }));
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const row of rows) {
    const bucket = bucketByKey.get(row.bucket);
    if (!bucket) continue;
    bucket.calls += row.calls;
    if (isError(row.status)) bucket.errors += row.calls;
    if (row.costUsd <= 0) continue;
    const index = indexOf.get((kept as Set<string>).has(row.provider) ? row.provider : CHART_OTHER_KEY);
    if (index === undefined) continue;
    bucket.valuesUsd[index] = (bucket.valuesUsd[index] ?? 0) + row.costUsd;
    bucket.totalUsd += row.costUsd;
  }
  return {
    granularity: options.granularity,
    series,
    buckets,
    totalUsd: buckets.reduce((sum, bucket) => sum + bucket.totalUsd, 0),
    maxUsd: buckets.reduce((max, bucket) => Math.max(max, bucket.totalUsd), 0),
  };
}

/**
 * Échelle « ronde » d'un axe : graduations à 1, 2, 2,5 ou 5 × 10ⁿ, la
 * dernière au-dessus du maximum. `niceScale(0.0137)` → 0 · 0,005 · 0,01 · 0,015.
 */
export function niceScale(max: number, targetTicks = 4): { top: number; step: number; ticks: number[] } {
  if (!Number.isFinite(max) || max <= 0) return { top: 1, step: 1, ticks: [0, 1] };
  const rough = max / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const round = (value: number) => Number(value.toPrecision(12));
  const step = round(factor * magnitude);
  const count = Math.max(1, Math.ceil(round(max / step)));
  return { top: round(step * count), step, ticks: Array.from({ length: count + 1 }, (_, index) => round(step * index)) };
}

// ─── Journal ─────────────────────────────────────────────────────────────────

export type UsageJournalEntry = UsageJournalRow & {
  /** Prix catalogue inscrit au registre (différent du coût affiché pour Google Places sous franchise) */
  listCostUsd: number;
};

const utcMonthKey = (date: Date): string => date.toISOString().slice(0, 7);

/** Lignes du journal, franchise Google Places déduite (même ratio que les ventilations). */
export function billJournal(rows: readonly UsageJournalRow[], billing: PlacesBilling): UsageJournalEntry[] {
  return rows.map((row) => ({
    ...row,
    listCostUsd: row.costUsd,
    costUsd: row.costUsd * placesCostRatio(billing, row.provider, utcMonthKey(row.createdAt), row.operation),
  }));
}

/** Nombre de pages du journal (au moins une) et page réellement servie. */
export function journalPaging(total: number, requestedPage: number, pageSize = USAGE_JOURNAL_PAGE_SIZE): { page: number; pageCount: number } {
  const pageCount = Math.min(USAGE_JOURNAL_MAX_PAGE, Math.max(1, Math.ceil(Math.max(0, total) / pageSize)));
  return { page: Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1)), pageCount };
}

// ─── Rapport complet ─────────────────────────────────────────────────────────

/** La table `api_usage` n'existe pas encore : l'interface affiche un bandeau. */
/** `missing` : table `api_usage` absente (migration 0008 non appliquée) · `error` : registre momentanément illisible. */
export type ApiUsageUnavailable = { available: false; period: ApiUsagePeriod; reason: "missing" | "error" };

export type ApiUsageReport = {
  available: true;
  period: ApiUsagePeriod;
  granularity: UsageGranularity;
  filters: UsageFilters;
  /** Totaux de la sélection (période + filtres), franchise Google Places déduite */
  totals: UsageTotals;
  /** Même sélection sur la période précédente */
  previous: UsageBaseTotals;
  costDelta: number | null;
  callsDelta: number | null;
  /** Coût de toutes les API sur le mois civil en cours (marge brute de la vue d'ensemble) */
  monthCostUsd: number;
  providers: ProviderSummary[];
  features: FeatureSummary[];
  sites: SiteSummary[];
  models: ModelSummary[];
  anthropic: AnthropicSummary;
  daily: DailySeries;
  /** Soldes et échéances, relevés au dernier appel connu (indépendants de la période) */
  balances: { scrapeCreators: CreditsBalance | null; metaToken: MetaTokenState };
  /** Franchise Google Places appliquée sur la période */
  places: PlacesBilling;
  /** Consommation de la franchise sur le mois civil en cours */
  placesFreeTier: PlacesFreeTierLine[];
  recentErrors: UsageJournalEntry[];
  journal: { entries: UsageJournalEntry[]; page: number; pageCount: number; total: number; pageSize: number } | null;
  /** Valeurs proposées par les filtres (toute la période, avant filtrage) */
  options: { providers: { id: string; label: string }[]; sites: { id: string; name: string }[]; hasPlatformCalls: boolean };
  /** Premier appel réellement mesuré (hors reprise de l'historique) */
  firstMeasuredAt: Date | null;
  /** Plus ancienne ligne du registre, reprise de l'historique comprise */
  firstRowAt: Date | null;
};

export type ApiUsageReportInput = {
  period: ApiUsagePeriod;
  now: Date;
  filters: UsageFilters;
  /** Période entière, non filtrée */
  cube: UsageCubeRow[];
  /** Période, filtres appliqués */
  series: UsageSeriesRow[];
  placesRows: PlacesMonthRow[];
  /** Période précédente, filtres appliqués */
  previousSeries: UsageSeriesRow[];
  previousPlacesRows: PlacesMonthRow[];
  /** Mois civil en cours, non filtré */
  monthSeries: UsageSeriesRow[];
  monthPlacesRows: PlacesMonthRow[];
  providerErrors: ProviderErrorRow[];
  recentErrors: UsageJournalRow[];
  journal: { rows: UsageJournalRow[]; page: number } | null;
  sites: UsageSite[];
  scrapeCreatorsCredits: CreditsRow | null;
  metaLastCall: MetaLastCallRow | null;
  metaLastSuccessAt: Date | null;
  firstMeasuredAt: Date | null;
  firstRowAt: Date | null;
};

const seriesWithMonth = (rows: readonly UsageSeriesRow[]) => rows.map((row) => ({ ...row, month: row.bucket.slice(0, 7) }));

/** Assemble le rapport à partir des lignes agrégées — fonction pure. */
export function buildApiUsageReport(input: ApiUsageReportInput): ApiUsageReport {
  const { period, filters } = input;
  const granularity: UsageGranularity = period.id === "aujourdhui" ? "hour" : "day";
  const places = computePlacesBilling(input.placesRows);
  const billedCube = applyPlacesBilling(input.cube, places);
  const selection = billedCube.filter((row) => matchesUsageFilters(row, filters));

  const totals = summarizeTotals(selection);
  const previous = sumUsage(applyPlacesBilling(seriesWithMonth(input.previousSeries), computePlacesBilling(input.previousPlacesRows)));
  const monthTotals = sumUsage(applyPlacesBilling(seriesWithMonth(input.monthSeries), computePlacesBilling(input.monthPlacesRows)));

  // Un filtre sur le fournisseur ne garde que sa ligne ; sinon tout le barème est listé
  const providers = summarizeByProvider(
    selection,
    input.providerErrors.filter((error) => !filters.provider || error.provider === filters.provider),
    filters.provider ? [filters.provider] : API_PROVIDER_IDS,
  );

  const siteById = new Map(input.sites.map((site) => [site.id, site]));
  const siteIds = new Set<string>();
  const providerIds = new Set<string>(API_PROVIDER_IDS);
  let hasPlatformCalls = false;
  for (const row of input.cube) {
    providerIds.add(row.provider);
    if (row.siteId) siteIds.add(row.siteId);
    else hasPlatformCalls = true;
  }
  // Le site filtré reste proposé même s'il n'a plus d'appel sur la période choisie
  if (filters.siteId && filters.siteId !== USAGE_NONE) siteIds.add(filters.siteId);
  if (filters.provider) providerIds.add(filters.provider);

  const paging = input.journal ? journalPaging(totals.calls, input.journal.page) : null;

  return {
    available: true,
    period,
    granularity,
    filters,
    totals,
    previous,
    costDelta: percentDelta(totals.costUsd, previous.costUsd),
    callsDelta: percentDelta(totals.calls, previous.calls),
    monthCostUsd: monthTotals.costUsd,
    providers,
    features: summarizeByFeature(selection),
    sites: summarizeBySite(selection, input.sites, period.id, { includeIdleClients: !hasUsageFilters(filters) }),
    models: summarizeByModel(selection),
    anthropic: summarizeAnthropic(selection),
    balances: {
      scrapeCreators: scrapeCreatorsBalance(input.scrapeCreatorsCredits),
      metaToken: metaTokenState(input.metaLastCall, input.metaLastSuccessAt),
    },
    daily: buildDailySeries(applyPlacesBilling(seriesWithMonth(input.series), places), { from: period.from, to: period.to, granularity }),
    places,
    placesFreeTier: placesFreeTier(input.monthPlacesRows, utcMonthKey(input.now)),
    recentErrors: billJournal(input.recentErrors, places),
    journal:
      input.journal && paging
        ? { entries: billJournal(input.journal.rows, places), page: paging.page, pageCount: paging.pageCount, total: totals.calls, pageSize: USAGE_JOURNAL_PAGE_SIZE }
        : null,
    options: {
      providers: [...providerIds].map((id) => ({ id, label: providerInfo(id).label })),
      sites: [...siteIds]
        .map((id) => ({ id, name: siteById.get(id)?.name ?? "Site supprimé" }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
      hasPlatformCalls,
    },
    firstMeasuredAt: input.firstMeasuredAt,
    firstRowAt: input.firstRowAt,
  };
}

// ─── SQL : regroupements sur une période ─────────────────────────────────────

// Découpage en temps universel, comme les mois du registre des quotas. Aucune
// valeur liée dans ces expressions : elles servent aussi de clé de regroupement.
const UTC_MONTH = sql<string>`to_char(${apiUsage.createdAt} at time zone 'UTC', 'YYYY-MM')`;
const UTC_DAY = sql<string>`to_char(${apiUsage.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
const UTC_HOUR = sql<string>`to_char(${apiUsage.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24')`;

const startOfUtcMonth = (date: Date): Date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const inPeriod = (from: Date, to: Date): SQL | undefined => and(gte(apiUsage.createdAt, from), lt(apiUsage.createdAt, to));

/** Condition SQL d'une sélection — même règle que `matchesUsageFilters`. Toutes les valeurs sont liées. */
function usageWhere(from: Date, to: Date, filters: UsageFilters): SQL | undefined {
  return and(
    inPeriod(from, to),
    filters.provider ? eq(apiUsage.provider, filters.provider) : undefined,
    filters.feature === USAGE_NONE
      ? or(isNull(apiUsage.feature), notInArray(apiUsage.feature, [...API_FEATURE_IDS]))
      : filters.feature
        ? eq(apiUsage.feature, filters.feature)
        : undefined,
    filters.siteId === USAGE_NONE ? isNull(apiUsage.siteId) : filters.siteId ? eq(apiUsage.siteId, filters.siteId) : undefined,
    filters.status === "error" ? eq(apiUsage.status, "error") : filters.status === "ok" ? ne(apiUsage.status, "error") : undefined,
  );
}

async function fetchUsageCube(db: Database, from: Date, to: Date): Promise<UsageCubeRow[]> {
  return db
    .select({
      month: UTC_MONTH,
      provider: apiUsage.provider,
      operation: apiUsage.operation,
      feature: apiUsage.feature,
      siteId: apiUsage.siteId,
      model: apiUsage.model,
      costSource: apiUsage.costSource,
      status: apiUsage.status,
      calls: sql<number>`count(*)`.mapWith(Number),
      requests: sql<number>`coalesce(sum(${apiUsage.requests}), 0)`.mapWith(Number),
      inputTokens: sql<number>`coalesce(sum(${apiUsage.inputTokens}), 0)`.mapWith(Number),
      outputTokens: sql<number>`coalesce(sum(${apiUsage.outputTokens}), 0)`.mapWith(Number),
      cacheReadTokens: sql<number>`coalesce(sum(${apiUsage.cacheReadTokens}), 0)`.mapWith(Number),
      cacheWriteTokens: sql<number>`coalesce(sum(${apiUsage.cacheWriteTokens}), 0)`.mapWith(Number),
      units: sql<number>`coalesce(sum(${apiUsage.units}), 0)`.mapWith(Number),
      costUsd: sql<number>`coalesce(sum(${apiUsage.costUsd}), 0)`.mapWith(Number),
      durationMs: sql<number>`coalesce(sum(${apiUsage.durationMs}), 0)`.mapWith(Number),
      timedCalls: sql<number>`count(*) filter (where ${apiUsage.durationMs} > 0)`.mapWith(Number),
      fallbackCalls: sql<number>`count(*) filter (where jsonb_exists(${apiUsage.meta}, 'requestedModel'))`.mapWith(Number),
      lastAt: sql<Date | null>`max(${apiUsage.createdAt})`.mapWith(apiUsage.createdAt),
    })
    .from(apiUsage)
    .where(inPeriod(from, to))
    .groupBy(UTC_MONTH, apiUsage.provider, apiUsage.operation, apiUsage.feature, apiUsage.siteId, apiUsage.model, apiUsage.costSource, apiUsage.status);
}

async function fetchUsageSeries(db: Database, from: Date, to: Date, filters: UsageFilters, granularity: UsageGranularity): Promise<UsageSeriesRow[]> {
  const bucket = granularity === "hour" ? UTC_HOUR : UTC_DAY;
  return db
    .select({
      bucket,
      provider: apiUsage.provider,
      operation: apiUsage.operation,
      status: apiUsage.status,
      calls: sql<number>`count(*)`.mapWith(Number),
      costUsd: sql<number>`coalesce(sum(${apiUsage.costUsd}), 0)`.mapWith(Number),
    })
    .from(apiUsage)
    .where(usageWhere(from, to, filters))
    .groupBy(bucket, apiUsage.provider, apiUsage.operation, apiUsage.status);
}

/**
 * Appels Google Places réussis (les échecs ne sont pas facturés), par mois
 * civil et par type, depuis le début du mois de `from` : ceux d'avant la
 * période entament la franchise, ceux de la période sont à facturer.
 * Jamais filtré : la franchise est commune à toute la plateforme.
 */
async function fetchPlacesMonthRows(db: Database, from: Date, to: Date): Promise<PlacesMonthRow[]> {
  return db
    .select({
      month: UTC_MONTH,
      operation: apiUsage.operation,
      before: sql<number>`coalesce(sum(${apiUsage.requests}) filter (where ${apiUsage.createdAt} < ${from} and ${apiUsage.status} <> 'error'), 0)`.mapWith(Number),
      within: sql<number>`coalesce(sum(${apiUsage.requests}) filter (where ${apiUsage.createdAt} >= ${from} and ${apiUsage.status} <> 'error'), 0)`.mapWith(Number),
      listUsd: sql<number>`coalesce(sum(${apiUsage.costUsd}) filter (where ${apiUsage.createdAt} >= ${from}), 0)`.mapWith(Number),
    })
    .from(apiUsage)
    .where(and(eq(apiUsage.provider, GOOGLE_PLACES_PROVIDER), gte(apiUsage.createdAt, startOfUtcMonth(from)), lt(apiUsage.createdAt, to)))
    .groupBy(UTC_MONTH, apiUsage.operation);
}

/** Dernière erreur de chaque fournisseur dans la sélection. */
async function fetchProviderErrors(db: Database, from: Date, to: Date, filters: UsageFilters): Promise<ProviderErrorRow[]> {
  return db
    .selectDistinctOn([apiUsage.provider], {
      provider: apiUsage.provider,
      operation: apiUsage.operation,
      error: apiUsage.error,
      createdAt: apiUsage.createdAt,
    })
    .from(apiUsage)
    .where(usageWhere(from, to, { ...filters, status: "error" }))
    .orderBy(apiUsage.provider, desc(apiUsage.createdAt));
}

async function fetchJournal(db: Database, where: SQL | undefined, limit: number, offset: number): Promise<UsageJournalRow[]> {
  return db
    .select({
      id: apiUsage.id,
      createdAt: apiUsage.createdAt,
      provider: apiUsage.provider,
      operation: apiUsage.operation,
      feature: apiUsage.feature,
      siteId: apiUsage.siteId,
      siteName: sites.name,
      model: apiUsage.model,
      status: apiUsage.status,
      requests: apiUsage.requests,
      inputTokens: apiUsage.inputTokens,
      outputTokens: apiUsage.outputTokens,
      cacheReadTokens: apiUsage.cacheReadTokens,
      cacheWriteTokens: apiUsage.cacheWriteTokens,
      units: apiUsage.units,
      costUsd: apiUsage.costUsd,
      costSource: apiUsage.costSource,
      durationMs: apiUsage.durationMs,
      error: apiUsage.error,
    })
    .from(apiUsage)
    .leftJoin(sites, eq(sites.id, apiUsage.siteId))
    .where(where)
    .orderBy(desc(apiUsage.createdAt), desc(apiUsage.id))
    .limit(limit)
    .offset(offset);
}

/** Premier appel mesuré (hors lignes reprises de `google_usage` par la migration, marquées `meta.backfill`) et plus ancienne ligne. */
async function fetchFirstDates(db: Database): Promise<{ firstMeasuredAt: Date | null; firstRowAt: Date | null }> {
  const [row] = await db
    .select({
      firstMeasuredAt: sql<Date | null>`min(${apiUsage.createdAt}) filter (where ${apiUsage.meta} is null or not jsonb_exists(${apiUsage.meta}, 'backfill'))`.mapWith(
        apiUsage.createdAt,
      ),
      firstRowAt: sql<Date | null>`min(${apiUsage.createdAt})`.mapWith(apiUsage.createdAt),
    })
    .from(apiUsage);
  return { firstMeasuredAt: row?.firstMeasuredAt ?? null, firstRowAt: row?.firstRowAt ?? null };
}

/** Solde ScrapeCreators : dernier appel dont `meta.creditsRemaining` est un nombre. */
async function fetchScrapeCreatorsCredits(db: Database): Promise<CreditsRow | null> {
  const [row] = await db
    .select({ credits: sql<string | null>`${apiUsage.meta}->>'creditsRemaining'`, at: apiUsage.createdAt })
    .from(apiUsage)
    .where(and(eq(apiUsage.provider, "scrapecreators"), sql`jsonb_typeof(${apiUsage.meta}->'creditsRemaining') = 'number'`))
    .orderBy(desc(apiUsage.createdAt))
    .limit(1);
  return row ?? null;
}

/** Bibliothèque publicitaire Meta : dernier appel (réussi ou non) et date du dernier succès. */
async function fetchMetaLastCalls(db: Database): Promise<{ last: MetaLastCallRow | null; lastSuccessAt: Date | null }> {
  const provider = eq(apiUsage.provider, "meta_ad_library");
  const [[last], [success]] = await Promise.all([
    db
      .select({ status: apiUsage.status, error: apiUsage.error, createdAt: apiUsage.createdAt })
      .from(apiUsage)
      .where(provider)
      .orderBy(desc(apiUsage.createdAt))
      .limit(1),
    db
      .select({ createdAt: apiUsage.createdAt })
      .from(apiUsage)
      .where(and(provider, ne(apiUsage.status, "error")))
      .orderBy(desc(apiUsage.createdAt))
      .limit(1),
  ]);
  return { last: last ?? null, lastSuccessAt: success?.createdAt ?? null };
}

/** Sites clients, et sites (démos comprises) ayant eu des appels sur la période. */
async function fetchUsageSites(db: Database, siteIds: string[]): Promise<UsageSite[]> {
  const rows = await db
    .select({
      id: sites.id,
      name: sites.name,
      type: sites.type,
      status: sites.status,
      plan: sites.plan,
      subscriptionPlan: subscriptions.plan,
      billingPeriod: subscriptions.billingPeriod,
      subscriptionStatus: subscriptions.status,
    })
    .from(sites)
    .leftJoin(subscriptions, eq(subscriptions.siteId, sites.id))
    .where(siteIds.length > 0 ? or(eq(sites.type, "client"), inArray(sites.id, siteIds)) : eq(sites.type, "client"));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    plan: row.plan,
    subscription:
      row.subscriptionPlan && row.billingPeriod && row.subscriptionStatus
        ? { plan: row.subscriptionPlan, billingPeriod: row.billingPeriod, status: row.subscriptionStatus }
        : null,
  }));
}

// ─── Chargement ──────────────────────────────────────────────────────────────

export type LoadApiUsageOptions = {
  period: ApiUsagePeriod;
  filters?: UsageFilters;
  /** Page du journal à charger ; omise : pas de journal (vue d'ensemble) */
  journalPage?: number;
  /** Nombre d'erreurs récentes à remonter (10 par défaut) */
  recentErrorCount?: number;
  now?: Date;
};

/**
 * Rapport d'activité et de coûts des API sur une période. Si la table
 * `api_usage` n'existe pas encore (migration 0008 non appliquée), renvoie
 * `{ available: false }` au lieu d'échouer.
 */
export async function loadApiUsageReport(options: LoadApiUsageOptions): Promise<ApiUsageReport | ApiUsageUnavailable> {
  const { period } = options;
  const now = options.now ?? new Date();
  const filters = options.filters ?? NO_USAGE_FILTERS;
  const granularity: UsageGranularity = period.id === "aujourdhui" ? "hour" : "day";
  const monthFrom = startOfUtcMonth(now);
  const db = getDb();

  try {
    const [cube, series, placesRows, previousSeries, previousPlacesRows, monthSeries, monthPlacesRows, providerErrors, recentErrors, firstDates, credits, meta] =
      await Promise.all([
        fetchUsageCube(db, period.from, period.to),
        fetchUsageSeries(db, period.from, period.to, filters, granularity),
        fetchPlacesMonthRows(db, period.from, period.to),
        fetchUsageSeries(db, period.previousFrom, period.previousTo, filters, "day"),
        fetchPlacesMonthRows(db, period.previousFrom, period.previousTo),
        fetchUsageSeries(db, monthFrom, now, NO_USAGE_FILTERS, "day"),
        fetchPlacesMonthRows(db, monthFrom, now),
        fetchProviderErrors(db, period.from, period.to, filters),
        fetchJournal(db, usageWhere(period.from, period.to, { ...filters, status: "error" }), options.recentErrorCount ?? 10, 0),
        fetchFirstDates(db),
        fetchScrapeCreatorsCredits(db),
        fetchMetaLastCalls(db),
      ]);

    const siteIds = [...new Set(cube.map((row) => row.siteId).filter((id): id is string => id !== null))];
    // Le site filtré est chargé même sans appel sur la période, pour garder son nom dans le filtre
    if (filters.siteId && filters.siteId !== USAGE_NONE && !siteIds.includes(filters.siteId)) siteIds.push(filters.siteId);
    // Le total du journal vient du regroupement déjà chargé : la page demandée est bornée avant la requête
    const journalTotal = sumUsage(cube.filter((row) => matchesUsageFilters(row, filters))).calls;
    const paging = options.journalPage === undefined ? null : journalPaging(journalTotal, options.journalPage);
    const [knownSites, journalRows] = await Promise.all([
      fetchUsageSites(db, siteIds),
      paging
        ? fetchJournal(db, usageWhere(period.from, period.to, filters), USAGE_JOURNAL_PAGE_SIZE, (paging.page - 1) * USAGE_JOURNAL_PAGE_SIZE)
        : Promise.resolve(null),
    ]);

    return buildApiUsageReport({
      period,
      now,
      filters,
      cube,
      series,
      placesRows,
      previousSeries,
      previousPlacesRows,
      monthSeries,
      monthPlacesRows,
      providerErrors,
      recentErrors,
      journal: paging && journalRows ? { rows: journalRows, page: paging.page } : null,
      sites: knownSites,
      scrapeCreatorsCredits: credits,
      metaLastCall: meta.last,
      metaLastSuccessAt: meta.lastSuccessAt,
      firstMeasuredAt: firstDates.firstMeasuredAt,
      firstRowAt: firstDates.firstRowAt,
    });
  } catch (err) {
    if (isMissingTableError(err)) return { available: false, period, reason: "missing" };
    throw err;
  }
}
