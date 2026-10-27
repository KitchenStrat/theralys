/**
 * Fiche Google — services de données partagés entre le studio (server
 * actions) et les ticks : budget fournisseur, synchronisation de la fiche
 * (instantané + audit), relevés de visibilité, tâches d'avis, analyse IA.
 *
 * Signatures figées (le studio les appelle telles quelles). Règles :
 * - aucun appel fournisseur sans vérifier `googleBudget` (plafond
 *   GOOGLE_MONTHLY_BUDGET_USD par site et par mois, démos : GOOGLE_DEMO_BUDGET_USD) ;
 *   pour un relevé (≈ 0,10 $), le quota et le budget sont recomptés sous
 *   verrou consultatif par site et le coût estimé est inscrit dans la même
 *   transaction (budget atomique) ; pour la fiche (≈ 0,005 $) et les avis
 *   (≈ 0,004 $) la vérification reste hors transaction : deux appels
 *   simultanés dépasseraient le plafond de quelques millièmes de dollar ;
 * - chaque appel facturé est inscrit dans `google_usage` avec le coût réel
 *   renvoyé par le fournisseur (0 en mock, pour les compteurs), y compris en
 *   échec partiel ou total (`DataForSeoError.costUsd`, sinon coût estimé par
 *   prudence) ; chaque tentative de synchronisation sans appel abouti laisse
 *   une ligne `sync_attempt` (coût 0) pour la planification ;
 * - jamais de données factices sur un site client : le fournisseur mock ne
 *   sert que les démos (fiche, relevés, tâches d'avis) ; un site client sans
 *   fournisseur réel est ignoré (`no_provider`) et la fiche praticien
 *   (`prospects`) n'est jamais mise à jour depuis un instantané mock ;
 * - repli Places API (New) pour la fiche quand DataForSEO est absent ou en
 *   échec, seulement avec une clé réelle (instantané `source: "places"`,
 *   attributs et description inconnus).
 */

import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, like, ne, notInArray, notLike, or, sql } from "drizzle-orm";
import {
  DATAFORSEO_UNIT_COSTS,
  GOOGLE_GRID,
  GOOGLE_GRID_RADII,
  GOOGLE_KEYWORDS_MAX,
  GOOGLE_MANUAL_SCANS_PER_MONTH,
  GOOGLE_MONTHLY_BUDGET_USD,
  GOOGLE_PROFILE_SYNC_INTERVAL_DAYS,
  GOOGLE_REPLY_GENERATIONS_PER_MONTH,
  GOOGLE_REVIEWS_SYNC_DEPTH,
  GOOGLE_SCAN_MAX_MISSING_POINTS,
  GOOGLE_SCHEDULED_SCAN_INTERVAL_DAYS,
  aggregateCompetitors,
  auditGoogleProfile,
  benchmarkFrom,
  budgetRemainingUsd,
  estimateScanCostUsd,
  findOwnListing,
  gridPoints,
  gridRadiusKm,
  isMockPlaceId,
  summarizeScan,
  usageMonthKey,
  type GeoPoint,
  type GoogleAudit,
  type GoogleBenchmark,
  type GoogleCompetitor,
  type GoogleGridPoint,
  type GoogleGridRadius,
  type GoogleMapsListing,
  type GoogleProfileSnapshot,
  type GoogleScanGrid,
  type GoogleReplyTone,
  type GoogleReviewAnalysis,
} from "@theralys/shared";
import {
  PLANS,
  getDb,
  googleKeywords,
  googleProfileAudits,
  googleRankScans,
  googleReviewTasks,
  googleReviews,
  googleUsage,
  hasGoogleProfile,
  prospects,
  sites,
  type Database,
  type GoogleProfileAudit,
  type GoogleRankScan,
  type PlanId,
  type Prospect,
  type Site,
} from "@theralys/db";
import { GOOGLE_REVIEWS_BATCH, createGoogleReviewsAnalyzer, fallbackReviewAnalysis } from "@theralys/ai";
import { DataForSeoError, createLocalSearchProvider, type GoogleReviewItem } from "@theralys/providers/dataforseo";
import { createGooglePlacesProvider, type GooglePlacesProvider } from "@theralys/providers/google";
import { loadGoogleBrief, siteUrl } from "./google-brief";
import type { TickOptions, TickReport } from "./ticks";

/** Plafond mensuel d'une démo (audit + avis + quelques relevés), USD. */
export const GOOGLE_DEMO_BUDGET_USD = 1;
/** Sites synchronisés par passage du tick `syncGoogleProfiles`. */
export const GOOGLE_SYNC_BATCH = 25;
/** Mots-clés relevés par passage du tick `runScheduledGoogleScans` (≈ 49 requêtes et jusqu'à une minute chacun). */
export const GOOGLE_SCAN_BATCH = 8;
/** Âge d'une tâche d'avis encore en attente au-delà duquel elle est abandonnée (jours). */
export const GOOGLE_REVIEW_TASK_MAX_AGE_DAYS = 3;
/** Lots d'avis (GOOGLE_REVIEWS_BATCH) analysés au plus par appel d'`analyzeGoogleReviews`. */
export const GOOGLE_REVIEWS_MAX_BATCHES = 3;
/** Relevé `running` plus ancien : le processus est mort, la ligne passe en erreur. */
const SCAN_STALE_MINUTES = 15;
/** Profondeur des requêtes Maps (au-delà du 20e, le rang n'a plus d'intérêt). */
const MAPS_DEPTH = 20;
const DAY_MS = 86_400_000;
const ERROR_MESSAGE_MAX = 300;

/** `sync_attempt` : tentative de synchronisation sans appel abouti (coût 0, 0 requête), pour l'échéancier. */
export type GoogleUsageKind = "business_info" | "reviews" | "scan" | "sync_attempt";

export type GoogleBudget = {
  month: string;
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
};

/** Connexion ou transaction drizzle (les lectures de budget se font aussi sous verrou, dans une transaction). */
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbExecutor = Database | DbTransaction;

/** Dépenses fournisseur du mois courant (USD) pour un site. */
export async function monthlyGoogleSpendUsd(db: DbExecutor, siteId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${googleUsage.costUsd}), 0)` })
    .from(googleUsage)
    .where(and(eq(googleUsage.siteId, siteId), eq(googleUsage.month, usageMonthKey(now))));
  return Number(row?.total ?? 0);
}

/** Budget restant du mois pour un site (démo : plafond réduit). */
export async function googleBudget(
  db: DbExecutor,
  site: { id: string; type: "demo" | "client" },
  now = new Date(),
): Promise<GoogleBudget> {
  const budgetUsd = site.type === "demo" ? GOOGLE_DEMO_BUDGET_USD : GOOGLE_MONTHLY_BUDGET_USD;
  const spentUsd = await monthlyGoogleSpendUsd(db, site.id, now);
  return { month: usageMonthKey(now), spentUsd, budgetUsd, remainingUsd: budgetRemainingUsd(spentUsd, budgetUsd) };
}

/** Inscrit une dépense réelle (coût renvoyé par le fournisseur ; 0 en mock est inscrit aussi, pour les compteurs). */
export async function recordGoogleUsage(
  db: DbExecutor,
  siteId: string,
  kind: GoogleUsageKind,
  costUsd: number,
  requests = 1,
  now = new Date(),
): Promise<void> {
  await db.insert(googleUsage).values({ siteId, month: usageMonthKey(now), kind, costUsd, requests });
}

// ─── Logique pure (testée sans base) ─────────────────────────────────────────

/** Date valide, ou null (colonnes agrégées en SQL rendues en chaîne, JSON `fetchedAt`, valeurs absentes). */
export function dateOrNull(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function olderThan(date: Date | null, now: Date, days: number): boolean {
  return date === null || now.getTime() - date.getTime() >= days * DAY_MS;
}

/**
 * Fiche due : la dernière tentative (`google_usage` business_info /
 * sync_attempt) ET le dernier audit facturé datent de plus de
 * GOOGLE_PROFILE_SYNC_INTERVAL_DAYS (ou n'existent pas). Un site en échec
 * ou au budget épuisé n'est donc pas repris chaque jour.
 */
export function isProfileSyncDue(
  last: { attemptAt: Date | null; billedAt: Date | null },
  now: Date,
  intervalDays = GOOGLE_PROFILE_SYNC_INTERVAL_DAYS,
): boolean {
  return olderThan(last.attemptAt, now, intervalDays) && olderThan(last.billedAt, now, intervalDays);
}

/** Tri par dernière tentative croissante, jamais tentés d'abord. */
function byOldestAttempt<T extends { attemptAt: Date | null }>(a: T, b: T): number {
  return (a.attemptAt?.getTime() ?? -Infinity) - (b.attemptAt?.getTime() ?? -Infinity);
}

/** Sites dus (`isProfileSyncDue`), triés par dernière tentative croissante (`nulls first`), au plus `batch`. */
export function selectDueSites<T extends { attemptAt: Date | null; billedAt: Date | null }>(
  rows: T[],
  now: Date,
  batch = GOOGLE_SYNC_BATCH,
): T[] {
  return rows
    .filter((row) => isProfileSyncDue(row, now))
    .sort(byOldestAttempt)
    .slice(0, batch);
}

/** Mot-clé dû : dernier relevé (tous statuts : une tentative en échec compte) plus vieux que l'intervalle, ou jamais relevé. */
export function isKeywordScanDue(
  lastAttemptAt: Date | null,
  now: Date,
  intervalDays = GOOGLE_SCHEDULED_SCAN_INTERVAL_DAYS,
): boolean {
  return olderThan(lastAttemptAt, now, intervalDays);
}

/**
 * Mots-clés dus : au plus GOOGLE_KEYWORDS_MAX par site (les premiers par
 * `position`), puis `isKeywordScanDue`, triés par dernière tentative
 * croissante (jamais relevés d'abord), au plus `batch`.
 */
export function selectDueKeywords<T extends { siteId: string; position: number; attemptAt: Date | null }>(
  rows: T[],
  now: Date,
  batch = GOOGLE_SCAN_BATCH,
): T[] {
  const bySite = new Map<string, T[]>();
  for (const row of rows) bySite.set(row.siteId, [...(bySite.get(row.siteId) ?? []), row]);
  const capped = [...bySite.values()].flatMap((list) =>
    [...list].sort((a, b) => a.position - b.position).slice(0, GOOGLE_KEYWORDS_MAX),
  );
  return capped
    .filter((row) => isKeywordScanDue(row.attemptAt, now))
    .sort(byOldestAttempt)
    .slice(0, batch);
}

/** Issue d'un relevé selon les points sans réponse : tolérés jusqu'à GOOGLE_SCAN_MAX_MISSING_POINTS (résumé sur les points connus). */
export function scanStatusForMissing(missing: number, total: number): "done" | "error" {
  if (total === 0 || missing >= total) return "error";
  return missing <= GOOGLE_SCAN_MAX_MISSING_POINTS ? "done" : "error";
}

/** Coût à inscrire après un relevé en échec : celui déjà facturé si le fournisseur le connaît, sinon l'estimation par prudence. */
export function scanCostOnError(err: unknown, estimated = estimateScanCostUsd()): number {
  return err instanceof DataForSeoError ? err.costUsd : estimated;
}

/** Tâche d'avis abandonnée sur l'âge (plutôt qu'un compte de lectures, qui dépend du rythme des ticks). */
export function isReviewTaskExpired(createdAt: Date, now: Date, maxAgeDays = GOOGLE_REVIEW_TASK_MAX_AGE_DAYS): boolean {
  return now.getTime() - createdAt.getTime() > maxAgeDays * DAY_MS;
}

/** Point de grille d'après la liste du fournisseur (null = requête en échec : `missing`, rang inconnu). */
export function gridPointFrom(
  point: GeoPoint,
  listings: GoogleMapsListing[] | null,
  own: { placeId: string | null; cid: string | null; title: string | null },
): GoogleGridPoint {
  if (listings === null) return { ...point, rank: null, top: [], missing: true };
  const self = findOwnListing(listings, own);
  return {
    ...point,
    rank: self?.rank ?? null,
    top: listings.slice(0, 3).map((l) => ({ title: l.title, cid: l.cid, rating: l.rating, votes: l.votes })),
  };
}

/** Le tick a dépassé son échéance : plus aucun site / mot-clé / tâche n'est entamé. */
export function pastDeadline(opts: TickOptions, nowMs = Date.now()): boolean {
  return opts.deadline !== undefined && nowMs > opts.deadline.getTime();
}

// ─── Aides communes ──────────────────────────────────────────────────────────

/** Accès à la section Fiche Google : démos et formule Scale. */
/**
 * Au moins un fournisseur réel est configuré (DataForSEO ou Places) : les
 * identifiants de fiche factices (`mock-…`) ne sont alors jamais envoyés et la
 * section propose de relier la vraie fiche.
 */
export function hasRealGoogleProvider(env: NodeJS.ProcessEnv = process.env): boolean {
  const mock = env.DATAFORSEO_MOCK === "1" || env.DATAFORSEO_MOCK === "true";
  const dataforseo = !mock && Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD);
  return dataforseo || Boolean(env.GOOGLE_PLACES_API_KEY);
}

export function hasGoogleProfileAccess(site: Pick<Site, "type" | "plan">): boolean {
  return site.type === "demo" || hasGoogleProfile(site.plan);
}

/** Formules donnant accès à la section (pour filtrer en SQL). */
const GOOGLE_PROFILE_PLANS = (Object.keys(PLANS) as PlanId[]).filter((plan) => hasGoogleProfile(plan));

/** Condition SQL d'accès à la section : démo, ou formule éligible. */
function googleAccessCondition() {
  return or(eq(sites.type, "demo"), inArray(sites.plan, GOOGLE_PROFILE_PLANS));
}

type SiteWithProspect = { site: Site; prospect: Prospect | null };

async function loadSite(db: Database, siteId: string): Promise<SiteWithProspect | null> {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) return null;
  const prospect = site.prospectId
    ? ((await db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) })) ?? null)
    : null;
  return { site, prospect };
}

async function latestAudit(db: Database, siteId: string): Promise<GoogleProfileAudit | undefined> {
  return db.query.googleProfileAudits.findFirst({
    where: eq(googleProfileAudits.siteId, siteId),
    orderBy: [desc(googleProfileAudits.createdAt)],
  });
}

/** Dernier audit issu d'un appel fournisseur facturé (les recalculs ont un coût 0). */
async function latestBilledAudit(db: Database, siteId: string): Promise<GoogleProfileAudit | undefined> {
  return db.query.googleProfileAudits.findFirst({
    where: and(eq(googleProfileAudits.siteId, siteId), gt(googleProfileAudits.costUsd, 0)),
    orderBy: [desc(googleProfileAudits.createdAt)],
  });
}

function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\s+/g, " ").trim().slice(0, ERROR_MESSAGE_MAX) || "erreur inconnue";
}

/** Le cabinet tel que le fournisseur doit le reconnaître : place_id du prospect, cid et titre du dernier instantané. */
function ownListing(
  prospect: Prospect | null,
  snapshot: GoogleProfileSnapshot | null,
): { placeId: string | null; cid: string | null; title: string | null } {
  return {
    placeId: prospect?.googlePlaceId ?? snapshot?.placeId ?? null,
    cid: snapshot?.cid ?? null,
    title: snapshot?.title || prospect?.googleBusinessName || null,
  };
}

function gridRadiusOf(value: string): GoogleGridRadius {
  return GOOGLE_GRID_RADII.some((r) => r.id === value) ? (value as GoogleGridRadius) : "ville";
}

/**
 * Concurrents des derniers relevés terminés du site (un par mot-clé actif),
 * concaténés et dédoublonnés (cid, sinon place_id, sinon titre) → benchmark ;
 * null sans relevé.
 */
async function benchmarkForSite(db: Database, siteId: string): Promise<GoogleBenchmark | null> {
  const keywords = await db.query.googleKeywords.findMany({
    where: and(eq(googleKeywords.siteId, siteId), eq(googleKeywords.active, true)),
    columns: { id: true },
  });
  const competitors: GoogleCompetitor[] = [];
  const seen = new Set<string>();
  for (const keyword of keywords) {
    const scan = await db.query.googleRankScans.findFirst({
      where: and(eq(googleRankScans.keywordId, keyword.id), eq(googleRankScans.status, "done")),
      orderBy: [desc(googleRankScans.scannedAt)],
      columns: { competitors: true },
    });
    for (const competitor of scan?.competitors ?? []) {
      const key = competitor.cid ?? competitor.placeId ?? competitor.title.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      competitors.push(competitor);
    }
  }
  return competitors.length > 0 ? benchmarkFrom(competitors) : null;
}

/** Avis connus du site pour l'audit (récence, taux de réponse). */
async function reviewsForAudit(db: Database, siteId: string) {
  const rows = await db.query.googleReviews.findMany({
    where: eq(googleReviews.siteId, siteId),
    columns: { rating: true, reviewedAt: true, ownerReply: true, source: true },
  });
  return {
    reviews: rows.map((r) => ({ rating: r.rating, reviewedAt: r.reviewedAt, ownerReply: r.ownerReply })),
    // L'information « réponse du propriétaire » n'existe qu'avec DataForSEO (ou le mock des démos)
    reviewsHaveOwnerReplies: rows.some((r) => r.source === "dataforseo" || r.ownerReply !== null),
  };
}

async function computeAudit(db: Database, site: Site, snapshot: GoogleProfileSnapshot, now: Date): Promise<GoogleAudit> {
  const [benchmark, { reviews, reviewsHaveOwnerReplies }] = await Promise.all([
    benchmarkForSite(db, site.id),
    reviewsForAudit(db, site.id),
  ]);
  return auditGoogleProfile({
    snapshot,
    benchmark,
    reviews,
    reviewsHaveOwnerReplies,
    site: { url: siteUrl(site), hasBookingUrl: Boolean(site.bookingUrl) },
    now,
  });
}

/** « wellness_center » → « Wellness center » (type Places, faute de catégorie Google). */
function humanizeType(type: string | null): string | null {
  if (!type) return null;
  const words = type.replace(/_/g, " ").trim();
  return words === "" ? null : words.charAt(0).toUpperCase() + words.slice(1);
}

/** Instantané de repli depuis Places API (New) : description, attributs et revendication inconnus. */
async function placesSnapshot(
  places: GooglePlacesProvider,
  site: Site,
  prospect: Prospect,
  placeId: string,
  now: Date,
): Promise<GoogleProfileSnapshot> {
  const details = await places.fetchDetails(placeId);
  return {
    source: "places",
    fetchedAt: now.toISOString(),
    placeId,
    cid: null,
    title: prospect.googleBusinessName ?? site.name,
    description: null,
    category: humanizeType(details.primaryType),
    additionalCategories: [],
    address: prospect.googleAddress,
    phone: details.phone,
    website: details.website,
    isClaimed: null,
    rating: details.rating,
    votes: details.reviewCount,
    ratingDistribution: null,
    // Places ne renvoie que 10 photos au plus : « ≥ 10 » vaut 10
    totalPhotos: details.photoCount === null ? null : Math.min(details.photoCount, 10),
    hasHours: details.hasHours,
    hours: null,
    attributes: [],
    bookOnlineUrl: null,
    mainImage: details.photoUrl,
    location: details.location,
  };
}

// ─── Fiche : instantané + audit ──────────────────────────────────────────────

export type SyncProfileOutcome =
  | { status: "done"; audit: GoogleProfileAudit }
  | { status: "skipped"; reason: "no_place" | "recent" | "budget" | "no_access" | "no_provider" }
  | { status: "error"; message: string };

/**
 * Synchronise la fiche d'un site : fiche d'établissement (DataForSEO, ou le
 * mock pour une démo ; repli Places avec une clé réelle), audit déterministe
 * (`auditGoogleProfile`, avec le benchmark des derniers relevés et les avis
 * connus), insertion dans google_profile_audits, mise à jour note / nombre
 * d'avis du prospect (jamais depuis un instantané mock), puis lancement d'une
 * tâche d'avis (GOOGLE_REVIEWS_SYNC_DEPTH) si aucune n'est en attente.
 * Un site client sans fournisseur réel est ignoré (`no_provider`).
 * `force` ignore l'intervalle GOOGLE_PROFILE_SYNC_INTERVAL_DAYS — mesuré sur
 * `snapshot.fetchedAt` du dernier audit facturé — mais pas le budget.
 * Toute tentative sans appel abouti laisse une ligne `sync_attempt`.
 */
export async function syncGoogleProfile(
  siteId: string,
  opts: { now?: Date; force?: boolean } = {},
): Promise<SyncProfileOutcome> {
  const now = opts.now ?? new Date();
  const db = getDb();
  const loaded = await loadSite(db, siteId);
  if (!loaded) return { status: "error", message: "Site introuvable" };
  const { site, prospect } = loaded;
  const placeId = prospect?.googlePlaceId ?? null;
  if (!prospect || !placeId) return { status: "skipped", reason: "no_place" };
  // Fiche factice d'une démo créée sans clé Places : rien à synchroniser avec un fournisseur réel
  if (isMockPlaceId(placeId) && hasRealGoogleProvider()) return { status: "skipped", reason: "no_place" };
  if (!hasGoogleProfileAccess(site)) return { status: "skipped", reason: "no_access" };

  const previousSnapshot = (await latestAudit(db, siteId))?.snapshot ?? null;
  const provider = createLocalSearchProvider(process.env, ownListing(prospect, previousSnapshot));
  const places = createGooglePlacesProvider();
  // Jamais de données factices sur un site client : le mock (DataForSEO comme Places) ne sert que les démos
  const useLocal = provider.mode === "dataforseo" || site.type === "demo";
  const usePlaces = places.mode === "google" || site.type === "demo";
  if (!useLocal && !usePlaces) return { status: "skipped", reason: "no_provider" };

  if (!opts.force) {
    const billed = await latestBilledAudit(db, siteId);
    const fetchedAt = billed ? (dateOrNull(billed.snapshot.fetchedAt) ?? billed.createdAt) : null;
    if (fetchedAt && now.getTime() - fetchedAt.getTime() < GOOGLE_PROFILE_SYNC_INTERVAL_DAYS * DAY_MS) {
      return { status: "skipped", reason: "recent" };
    }
  }
  let attemptRecorded = false;
  const recordAttempt = async () => {
    if (attemptRecorded) return;
    attemptRecorded = true;
    await recordGoogleUsage(db, siteId, "sync_attempt", 0, 0, now);
  };
  const budget = await googleBudget(db, site, now);
  if (budget.remainingUsd < DATAFORSEO_UNIT_COSTS.businessInfoLive) {
    await recordAttempt();
    return { status: "skipped", reason: "budget" };
  }

  // 1. Fiche d'établissement : DataForSEO (ou mock, démos), repli Places
  let snapshot: GoogleProfileSnapshot | null = null;
  let costUsd = 0;
  if (useLocal) {
    try {
      const result = await provider.businessInfo({
        placeId,
        cid: previousSnapshot?.cid ?? null,
        title: prospect.googleBusinessName,
        near: previousSnapshot?.location ?? null,
      });
      costUsd = result.costUsd;
      // Appel abouti (fiche trouvée ou non) : coût réel inscrit, 0 en mock pour les compteurs
      await recordGoogleUsage(db, siteId, "business_info", costUsd, 1, now);
      attemptRecorded = true;
      snapshot = result.data;
      if (snapshot) snapshot = { ...snapshot, fetchedAt: now.toISOString(), placeId: snapshot.placeId ?? placeId };
    } catch (err) {
      console.warn(`[google-profile] fiche ${placeId} indisponible via ${provider.mode} :`, errorMessage(err));
      await recordAttempt();
    }
  }
  if (!snapshot && usePlaces) {
    try {
      snapshot = await placesSnapshot(places, site, prospect, placeId, now);
    } catch (err) {
      await recordAttempt();
      return { status: "error", message: `Fiche Google indisponible : ${errorMessage(err)}` };
    }
  }
  if (!snapshot) {
    await recordAttempt();
    return { status: "error", message: "Fiche Google introuvable chez le fournisseur" };
  }

  // 2. Audit et historique
  const audit = await computeAudit(db, site, snapshot, now);
  const [inserted] = await db
    .insert(googleProfileAudits)
    .values({ siteId, snapshot, audit, score: audit.score, costUsd, createdAt: now })
    .returning();

  // 3. Fiche du prospect (note, nombre d'avis, nom si vide) — jamais depuis un instantané mock
  if (snapshot.source !== "mock") {
    const prospectPatch: Partial<Pick<Prospect, "googleRating" | "googleReviewCount" | "googleBusinessName">> = {};
    if (snapshot.rating !== null) prospectPatch.googleRating = snapshot.rating;
    if (snapshot.votes !== null) prospectPatch.googleReviewCount = snapshot.votes;
    if (!prospect.googleBusinessName && snapshot.title) prospectPatch.googleBusinessName = snapshot.title;
    if (Object.keys(prospectPatch).length > 0) {
      await db.update(prospects).set(prospectPatch).where(eq(prospects.id, prospect.id));
    }
  }

  // 4. Avis : une tâche DataForSEO (ou mock, démos seulement) si aucune n'est en attente et si le budget le permet
  if (useLocal) {
    try {
      const pending = await db.query.googleReviewTasks.findFirst({
        where: and(eq(googleReviewTasks.siteId, siteId), eq(googleReviewTasks.status, "pending")),
        columns: { id: true },
      });
      const after = await googleBudget(db, site, now);
      const reviewsCost = (DATAFORSEO_UNIT_COSTS.reviewsPer10 * GOOGLE_REVIEWS_SYNC_DEPTH) / 10;
      if (!pending && after.remainingUsd >= reviewsCost) {
        const task = await provider.postReviewsTask({
          placeId,
          cid: snapshot.cid,
          near: snapshot.location,
          depth: GOOGLE_REVIEWS_SYNC_DEPTH,
        });
        await db.insert(googleReviewTasks).values({ siteId, taskId: task.data.taskId, depth: GOOGLE_REVIEWS_SYNC_DEPTH, createdAt: now });
        await recordGoogleUsage(db, siteId, "reviews", task.costUsd, 1, now);
      }
    } catch (err) {
      console.warn(`[google-profile] tâche d'avis non lancée pour ${site.slug} :`, errorMessage(err));
    }
  }

  return { status: "done", audit: inserted! };
}

/**
 * Recalcule l'audit à partir du dernier instantané (sans appel fournisseur) :
 * après l'arrivée d'avis ou d'un relevé. Renvoie null sans instantané.
 */
export async function recomputeGoogleAudit(siteId: string, now = new Date()): Promise<GoogleProfileAudit | null> {
  const db = getDb();
  const previous = await latestAudit(db, siteId);
  if (!previous) return null;
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) return null;
  const audit = await computeAudit(db, site, previous.snapshot, now);
  const [inserted] = await db
    .insert(googleProfileAudits)
    .values({ siteId, snapshot: previous.snapshot, audit, score: audit.score, costUsd: 0, createdAt: now })
    .returning();
  return inserted ?? null;
}

// ─── Relevés de visibilité ───────────────────────────────────────────────────

export type ScanOutcome =
  | { status: "done"; scan: GoogleRankScan }
  | { status: "skipped"; reason: "budget" | "no_location" | "inactive" | "quota" }
  | { status: "error"; scanId: string | null; message: string };

/** Relevés lancés à la demande ce mois-ci (tous statuts sauf erreur). */
async function manualScansThisMonth(db: DbExecutor, siteId: string, now: Date): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(googleRankScans)
    .where(
      and(
        eq(googleRankScans.siteId, siteId),
        eq(googleRankScans.trigger, "manual"),
        ne(googleRankScans.status, "error"),
        gte(googleRankScans.scannedAt, monthStart),
      ),
    );
  return Number(row?.total ?? 0);
}

type ScanStart =
  | { kind: "started"; scanId: string; usageId: string }
  | { kind: "busy" }
  | { kind: "quota" }
  | { kind: "budget" };

/**
 * Relevé d'un mot-clé : grille 7×7 (gridPoints, rayon du mot-clé) autour de
 * la fiche, une requête Maps par point, rang du cabinet (findOwnListing),
 * concurrents agrégés, résumé ; ligne google_rank_scans `running` → `done`
 * ou `error` ; keyword.lastScannedAt mis à jour sur succès seulement.
 *
 * Budget atomique : dans la transaction courte qui insère la ligne `running`
 * (verrou consultatif `google-scan:<keywordId>` contre deux relevés
 * simultanés du même mot-clé), un verrou `google-budget:<siteId>` sérialise
 * les relevés du site, le quota GOOGLE_MANUAL_SCANS_PER_MONTH (`manual`) et
 * le budget sont recomptés, et une ligne `google_usage` au coût estimé est
 * inscrite aussitôt. Après l'appel, elle est ramenée au coût réel (succès,
 * ou échec total dont le fournisseur connaît le coût) ; sinon elle reste à
 * l'estimation, par prudence. Jusqu'à GOOGLE_SCAN_MAX_MISSING_POINTS points
 * sans réponse, le relevé est `done` (points `missing`, résumé sur les
 * points connus) ; au-delà, `error`.
 *
 * L'horodatage est l'heure réelle (`new Date()`), jamais le `now` d'un tick
 * qui peut dater de plusieurs minutes : `opts.now` est accepté pour la
 * compatibilité des appelants mais n'est plus lu.
 */
export async function runGoogleScan(
  siteId: string,
  keywordId: string,
  trigger: "manual" | "scheduled",
  _opts: { now?: Date } = {},
): Promise<ScanOutcome> {
  const now = new Date();
  const db = getDb();
  const keyword = await db.query.googleKeywords.findFirst({
    where: and(eq(googleKeywords.id, keywordId), eq(googleKeywords.siteId, siteId)),
  });
  if (!keyword || !keyword.active) return { status: "skipped", reason: "inactive" };
  const loaded = await loadSite(db, siteId);
  if (!loaded) return { status: "error", scanId: null, message: "Site introuvable" };
  const { site, prospect } = loaded;
  const snapshot = (await latestAudit(db, siteId))?.snapshot ?? null;
  const center = snapshot?.location ?? null;
  if (!center) return { status: "skipped", reason: "no_location" };

  const radius = gridRadiusOf(keyword.radius);
  const grid: GoogleScanGrid = {
    center,
    rows: GOOGLE_GRID.rows,
    cols: GOOGLE_GRID.cols,
    radius,
    radiusKm: gridRadiusKm(radius),
    zoom: GOOGLE_GRID.zoom,
  };
  const points = gridPoints(center, grid.radiusKm);
  const estimated = estimateScanCostUsd();

  // Transaction courte sous verrous consultatifs : un seul relevé `running` par mot-clé, budget recompté et réservé
  const started = await db.transaction(async (tx): Promise<ScanStart> => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${`google-scan:${keywordId}`})) as locked`);
    if (lock.rows[0]?.locked !== true) return { kind: "busy" };
    const running = await tx.query.googleRankScans.findMany({
      where: and(eq(googleRankScans.keywordId, keywordId), eq(googleRankScans.status, "running")),
      columns: { id: true, scannedAt: true },
    });
    const stale = running.filter((s) => now.getTime() - s.scannedAt.getTime() > SCAN_STALE_MINUTES * 60_000);
    if (running.length > stale.length) return { kind: "busy" };
    if (stale.length > 0) {
      await tx
        .update(googleRankScans)
        .set({ status: "error", error: "Relevé interrompu" })
        .where(inArray(googleRankScans.id, stale.map((s) => s.id)));
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`google-budget:${siteId}`}))`);
    if (trigger === "manual" && (await manualScansThisMonth(tx, siteId, now)) >= GOOGLE_MANUAL_SCANS_PER_MONTH) {
      return { kind: "quota" };
    }
    const budget = await googleBudget(tx, site, now);
    if (estimated > budget.remainingUsd) return { kind: "budget" };
    const [scan] = await tx
      .insert(googleRankScans)
      .values({ siteId, keywordId, trigger, status: "running", grid, scannedAt: now })
      .returning({ id: googleRankScans.id });
    const [usage] = await tx
      .insert(googleUsage)
      .values({ siteId, month: usageMonthKey(now), kind: "scan", costUsd: estimated, requests: points.length })
      .returning({ id: googleUsage.id });
    return { kind: "started", scanId: scan!.id, usageId: usage!.id };
  });
  if (started.kind === "busy") return { status: "error", scanId: null, message: "Un relevé est déjà en cours pour ce mot-clé" };
  if (started.kind === "quota") return { status: "skipped", reason: "quota" };
  if (started.kind === "budget") return { status: "skipped", reason: "budget" };
  const { scanId, usageId } = started;

  try {
    const own = ownListing(prospect, snapshot);
    const provider = createLocalSearchProvider(process.env, own);
    const result = await provider.mapsSearch(
      points.map((point) => ({ keyword: keyword.keyword, point, zoom: grid.zoom, depth: MAPS_DEPTH })),
    );
    await db.update(googleUsage).set({ costUsd: result.costUsd }).where(eq(googleUsage.id, usageId));
    const gridResults = points.map((point, i) => gridPointFrom(point, result.data[i] ?? null, own));
    const missing = gridResults.filter((p) => p.missing).length;
    if (scanStatusForMissing(missing, points.length) === "error") {
      const message = `${missing} points sur ${points.length} sans réponse du fournisseur`;
      console.error(`[google-scan] relevé ${scanId} (${keyword.keyword}) en échec :`, message);
      await db
        .update(googleRankScans)
        .set({ status: "error", points: gridResults, costUsd: result.costUsd, error: message })
        .where(eq(googleRankScans.id, scanId));
      return { status: "error", scanId, message };
    }
    const summary = summarizeScan(gridResults);
    const competitors = aggregateCompetitors(result.data, own);
    const [scan] = await db
      .update(googleRankScans)
      .set({ status: "done", points: gridResults, summary, competitors, costUsd: result.costUsd, error: null })
      .where(eq(googleRankScans.id, scanId))
      .returning();
    await db.update(googleKeywords).set({ lastScannedAt: now }).where(eq(googleKeywords.id, keywordId));
    return { status: "done", scan: scan! };
  } catch (err) {
    const message = errorMessage(err);
    console.error(`[google-scan] relevé ${scanId} (${keyword.keyword}) en échec :`, message);
    const costUsd = scanCostOnError(err, estimated);
    await db.update(googleUsage).set({ costUsd }).where(eq(googleUsage.id, usageId));
    await db.update(googleRankScans).set({ status: "error", costUsd, error: message }).where(eq(googleRankScans.id, scanId));
    return { status: "error", scanId, message };
  }
}

// ─── Avis ────────────────────────────────────────────────────────────────────

/**
 * Analyse IA des avis non analysés d'un site (≤ `limit`, les plus récents
 * d'abord ; défaut et plafond : GOOGLE_REVIEWS_MAX_BATCHES lots de
 * GOOGLE_REVIEWS_BATCH) : sentiment, thèmes, réponse proposée →
 * google_reviews.analysis, écrit lot par lot (un lot en erreur ne défait pas
 * les précédents). Un avis dont la réponse a été écartée par les garde-fous
 * reçoit une analyse minimale (`fallbackReviewAnalysis`, réponse vide) pour
 * ne pas être renvoyé au modèle indéfiniment. Renvoie le nombre d'avis
 * analysés avec réponse ; une erreur IA est journalisée et le compte des
 * lots déjà écrits est rendu (jamais de throw vers le tick).
 */
export async function analyzeGoogleReviews(siteId: string, opts: { limit?: number; now?: Date } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const max = GOOGLE_REVIEWS_BATCH * GOOGLE_REVIEWS_MAX_BATCHES;
  const limit = Math.max(1, Math.min(opts.limit ?? max, max));
  const db = getDb();
  let count = 0;
  try {
    const pending = await db.query.googleReviews.findMany({
      where: and(eq(googleReviews.siteId, siteId), isNull(googleReviews.analysis), ne(googleReviews.text, "")),
      orderBy: [sql`${googleReviews.reviewedAt} desc nulls last`],
      limit,
    });
    if (pending.length === 0) return 0;
    const { brief } = await loadGoogleBrief(db, siteId, now);
    const analyzer = createGoogleReviewsAnalyzer();
    await analyzer.analyze(
      {
        brief,
        reviews: pending.map((r) => ({
          id: r.id,
          authorName: r.authorName,
          rating: r.rating,
          text: r.text,
          reviewedAt: r.reviewedAt,
          ownerReply: r.ownerReply,
        })),
        now,
      },
      {
        onBatch: async (analyses, batch) => {
          for (const review of batch) {
            const analysis = analyses[review.id] ?? fallbackReviewAnalysis(review, brief.voice, analyzer.mode, now);
            await db
              .update(googleReviews)
              .set({ analysis })
              .where(and(eq(googleReviews.id, review.id), eq(googleReviews.siteId, siteId)));
            if (analyses[review.id]) count += 1;
          }
        },
      },
    );
    return count;
  } catch (err) {
    console.error(`[google-reviews] analyse impossible pour le site ${siteId} :`, errorMessage(err));
    return count;
  }
}

/**
 * Avis d'une tâche terminée → google_reviews : dédoublonnage par
 * sourceReviewId (le premier gagne), mise à jour des avis connus (analyse
 * remise à zéro si le texte a changé), insertion des nouveaux, puis
 * suppression des anciens avis Places / mock du site (les avis sans
 * sourceReviewId des démos restent).
 */
async function upsertReviews(
  db: Database,
  siteId: string,
  incoming: GoogleReviewItem[],
  source: "dataforseo" | "mock",
  now: Date,
): Promise<void> {
  const unique = [...new Map(incoming.map((r) => [r.sourceReviewId, r])).values()];
  const ids = unique.map((r) => r.sourceReviewId);
  if (ids.length === 0) return;
  const existing = await db.query.googleReviews.findMany({
    where: and(eq(googleReviews.siteId, siteId), inArray(googleReviews.sourceReviewId, ids)),
    columns: { id: true, sourceReviewId: true, text: true },
  });
  const byId = new Map(existing.map((r) => [r.sourceReviewId, r]));
  const fresh: (typeof googleReviews.$inferInsert)[] = [];
  for (const r of unique) {
    const values = {
      authorName: r.authorName,
      authorPhotoUrl: r.authorPhotoUrl,
      rating: r.rating,
      text: r.text,
      reviewedAt: r.reviewedAt,
      ownerReply: r.ownerReply,
      ownerRepliedAt: r.ownerRepliedAt,
      reviewUrl: r.reviewUrl,
      source,
      syncedAt: now,
    };
    const known = byId.get(r.sourceReviewId);
    if (known) {
      await db
        .update(googleReviews)
        .set(known.text === r.text ? values : { ...values, analysis: null })
        .where(eq(googleReviews.id, known.id));
    } else {
      fresh.push({ siteId, sourceReviewId: r.sourceReviewId, ...values });
    }
  }
  if (fresh.length > 0) await db.insert(googleReviews).values(fresh);
  await db.delete(googleReviews).where(
    and(
      eq(googleReviews.siteId, siteId),
      isNotNull(googleReviews.sourceReviewId),
      notInArray(googleReviews.sourceReviewId, ids),
      or(
        inArray(googleReviews.source, ["places", "mock"]),
        like(googleReviews.sourceReviewId, "places/%"),
        like(googleReviews.sourceReviewId, "mock-%"),
      ),
    ),
  );
}

/** Réponses générées « sur mesure » (ton choisi) ce mois-ci pour un site (lecture sous transaction possible). */
export async function monthlyReplyGenerations(db: DbExecutor, siteId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(googleUsage)
    .where(and(eq(googleUsage.siteId, siteId), eq(googleUsage.month, usageMonthKey(now)), eq(googleUsage.kind, "reply_ai")));
  return row?.total ?? 0;
}

export type ReplyGenerationOutcome =
  | { status: "done"; analysis: GoogleReviewAnalysis; remaining: number }
  | { status: "skipped"; reason: "not_found" | "no_text" | "quota" | "busy" }
  | { status: "error"; message: string };

/**
 * Génère (ou regénère) la réponse proposée d'un avis avec le ton demandé :
 * un appel IA pour cet avis seul, voix du praticien dont le ton est remplacé.
 * Quota GOOGLE_REPLY_GENERATIONS_PER_MONTH par site (ligne `google_usage`
 * kind "reply_ai", coût 0 : l'IA n'est pas un coût fournisseur mesuré ici),
 * vérifié avant l'appel IA (sous verrou consultatif de l'avis : une
 * génération à la fois) et recompté sous verrou par site dans la transaction
 * qui inscrit la génération et enregistre l'analyse (garantie). Une réponse
 * écartée par les garde-fous est une erreur lisible, l'analyse précédente
 * est conservée (l'appel IA a eu lieu : il est décompté).
 */
export async function generateGoogleReviewReply(
  siteId: string,
  reviewId: string,
  tone: GoogleReplyTone,
  opts: { now?: Date } = {},
): Promise<ReplyGenerationOutcome> {
  const now = opts.now ?? new Date();
  const db = getDb();
  const review = await db.query.googleReviews.findFirst({
    where: and(eq(googleReviews.id, reviewId), eq(googleReviews.siteId, siteId)),
  });
  if (!review) return { status: "skipped", reason: "not_found" };
  if (review.text.trim() === "") return { status: "skipped", reason: "no_text" };
  // Transaction courte : verrou consultatif de l'avis (génération déjà lancée ailleurs ?) et quota (message immédiat)
  const initial = await db.transaction(async (tx) => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${`google-reply:${reviewId}`})) as locked`);
    if (lock.rows[0]?.locked !== true) return null;
    return monthlyReplyGenerations(tx, siteId, now);
  });
  if (initial === null) return { status: "skipped", reason: "busy" };
  if (initial >= GOOGLE_REPLY_GENERATIONS_PER_MONTH) return { status: "skipped", reason: "quota" };

  try {
    const { brief } = await loadGoogleBrief(db, siteId, now);
    const toned = { ...brief, voice: { ...brief.voice, tone } };
    const analyzer = createGoogleReviewsAnalyzer();
    const analyses = await analyzer.analyze({
      brief: toned,
      reviews: [
        {
          id: review.id,
          authorName: review.authorName,
          rating: review.rating,
          text: review.text,
          reviewedAt: review.reviewedAt,
          ownerReply: review.ownerReply,
        },
      ],
      now,
    });
    const analysis = analyses[review.id];
    const usable = analysis !== undefined && analysis.suggestedReply.trim() !== "";
    // Transaction courte sous verrou par site : quota recompté, génération inscrite et analyse enregistrée ensemble
    const used = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${siteId}:google-reply`}))`);
      const count = await monthlyReplyGenerations(tx, siteId, now);
      if (count >= GOOGLE_REPLY_GENERATIONS_PER_MONTH) return null;
      // L'appel IA a eu lieu : décompté même si la réponse est écartée
      await tx.insert(googleUsage).values({ siteId, month: usageMonthKey(now), kind: "reply_ai", costUsd: 0, requests: 1 });
      if (usable) {
        await tx
          .update(googleReviews)
          .set({ analysis })
          .where(and(eq(googleReviews.id, review.id), eq(googleReviews.siteId, siteId)));
      }
      return count;
    });
    if (used === null) return { status: "skipped", reason: "quota" };
    if (!usable) {
      return { status: "error", message: "La réponse générée ne respectait pas nos règles de prudence — essayez un autre ton." };
    }
    return { status: "done", analysis, remaining: Math.max(0, GOOGLE_REPLY_GENERATIONS_PER_MONTH - used - 1) };
  } catch (err) {
    const message = errorMessage(err);
    console.error(`[google-reviews] génération de réponse impossible (avis ${reviewId}) :`, message);
    return { status: "error", message };
  }
}

// ─── Ticks (appelés par runAllTicks, quotidien 6 h UTC) ──────────────────────

/**
 * Sites éligibles (démo ou formule Scale, fiche reliée, non archivés) dont la
 * dernière tentative et le dernier audit facturé datent de plus de 30 jours
 * (`selectDueSites`) : syncGoogleProfile. Lots de GOOGLE_SYNC_BATCH, jamais
 * tentés d'abord. Sans fournisseur réel (DataForSEO ou Places), seules les
 * démos sont synchronisées (mock) : les sites clients n'entament pas le lot.
 * S'arrête avant le site suivant une fois `opts.deadline` dépassée.
 */
export async function syncGoogleProfiles(now = new Date(), opts: TickOptions = {}): Promise<TickReport> {
  const db = getDb();
  const clientsAllowed = createLocalSearchProvider().mode === "dataforseo" || createGooglePlacesProvider().mode === "google";
  const attempts = db
    .select({ siteId: googleUsage.siteId, last: sql<string | Date | null>`max(${googleUsage.createdAt})`.as("last_attempt") })
    .from(googleUsage)
    .where(inArray(googleUsage.kind, ["business_info", "sync_attempt"]))
    .groupBy(googleUsage.siteId)
    .as("attempts");
  const billed = db
    .select({ siteId: googleProfileAudits.siteId, last: sql<string | Date | null>`max(${googleProfileAudits.createdAt})`.as("last_billed") })
    .from(googleProfileAudits)
    .where(gt(googleProfileAudits.costUsd, 0))
    .groupBy(googleProfileAudits.siteId)
    .as("billed");
  const rows = await db
    .select({ site: sites, attemptAt: attempts.last, billedAt: billed.last })
    .from(sites)
    .innerJoin(prospects, eq(prospects.id, sites.prospectId))
    .leftJoin(attempts, eq(attempts.siteId, sites.id))
    .leftJoin(billed, eq(billed.siteId, sites.id))
    .where(
      and(
        isNotNull(prospects.googlePlaceId),
        // Fiches factices (démos créées sans clé Places) ignorées dès qu'un fournisseur réel existe
        hasRealGoogleProvider() ? notLike(prospects.googlePlaceId, "mock-%") : undefined,
        ne(sites.status, "archived"),
        googleAccessCondition(),
        clientsAllowed ? undefined : eq(sites.type, "demo"),
      ),
    )
    .orderBy(asc(sites.createdAt));
  const due = selectDueSites(
    rows.map((r) => ({ site: r.site, attemptAt: dateOrNull(r.attemptAt), billedAt: dateOrNull(r.billedAt) })),
    now,
    GOOGLE_SYNC_BATCH,
  );

  let processed = 0;
  for (const { site } of due) {
    if (pastDeadline(opts)) break;
    try {
      const outcome = await syncGoogleProfile(site.id, { now });
      if (outcome.status === "done") processed += 1;
      else if (outcome.status === "error") console.error(`[google-profile] ${site.slug} : ${outcome.message}`);
    } catch (err) {
      console.error(`[google-profile] ${site.slug} :`, errorMessage(err));
      // Échec hors du service (base, réseau) : la tentative compte pour l'échéancier
      await recordGoogleUsage(db, site.id, "sync_attempt", 0, 0, now).catch(() => undefined);
    }
  }
  return { task: "sync-google-profiles", processed };
}

/**
 * Tâches d'avis en attente : fetchReviewsTask → upsert des avis, puis
 * recomputeGoogleAudit + analyzeGoogleReviews. Une tâche encore en attente
 * après GOOGLE_REVIEW_TASK_MAX_AGE_DAYS est abandonnée. S'arrête avant la
 * tâche suivante une fois `opts.deadline` dépassée.
 */
export async function collectGoogleReviewTasks(now = new Date(), opts: TickOptions = {}): Promise<TickReport> {
  const db = getDb();
  const tasks = await db.query.googleReviewTasks.findMany({
    where: eq(googleReviewTasks.status, "pending"),
    orderBy: [asc(googleReviewTasks.createdAt)],
  });
  let processed = 0;

  const fail = async (taskId: string, error: string) => {
    await db
      .update(googleReviewTasks)
      .set({ status: "error", error: error.slice(0, ERROR_MESSAGE_MAX), completedAt: now })
      .where(eq(googleReviewTasks.id, taskId));
  };
  /** Encore en attente : une lecture de plus, abandon sur l'âge de la tâche. */
  const retryLater = async (task: { id: string; attempts: number; createdAt: Date }, reason: string | null) => {
    const attempts = task.attempts + 1;
    if (isReviewTaskExpired(task.createdAt, now)) {
      await db
        .update(googleReviewTasks)
        .set({ status: "error", attempts, error: reason ?? "Délai dépassé : la tâche n'a jamais abouti", completedAt: now })
        .where(eq(googleReviewTasks.id, task.id));
    } else {
      await db.update(googleReviewTasks).set({ attempts, error: reason }).where(eq(googleReviewTasks.id, task.id));
    }
  };

  for (const task of tasks) {
    if (pastDeadline(opts)) break;
    try {
      const loaded = await loadSite(db, task.siteId);
      if (!loaded) {
        await fail(task.id, "Site introuvable");
        continue;
      }
      const { site, prospect } = loaded;
      const snapshot = (await latestAudit(db, site.id))?.snapshot ?? null;
      const provider = createLocalSearchProvider(process.env, ownListing(prospect, snapshot));
      if (provider.mode === "mock" && site.type !== "demo") {
        await fail(task.id, "Avis factices interdits sur un site client");
        continue;
      }
      const result = await provider.fetchReviewsTask(task.taskId);
      if (result.costUsd > 0) await recordGoogleUsage(db, site.id, "reviews", result.costUsd, 1, now);
      if (result.data.status === "pending") {
        await retryLater(task, null);
        continue;
      }
      if (result.data.status === "error") {
        await fail(task.id, result.data.message);
        continue;
      }
      const source = provider.mode === "mock" ? "mock" : "dataforseo";
      await upsertReviews(db, site.id, result.data.reviews, source, now);
      // Fiche praticien : jamais depuis des avis factices
      if (prospect && source !== "mock") {
        const patch: Partial<Pick<Prospect, "googleRating" | "googleReviewCount">> = {};
        if (result.data.rating !== null) patch.googleRating = result.data.rating;
        if (result.data.total !== null) patch.googleReviewCount = result.data.total;
        if (Object.keys(patch).length > 0) await db.update(prospects).set(patch).where(eq(prospects.id, prospect.id));
      }
      await db
        .update(googleReviewTasks)
        .set({ status: "done", attempts: task.attempts + 1, error: null, completedAt: now })
        .where(eq(googleReviewTasks.id, task.id));
      processed += 1;
      try {
        await recomputeGoogleAudit(site.id, now);
      } catch (err) {
        console.error(`[google-reviews] audit non recalculé pour ${site.slug} :`, errorMessage(err));
      }
      await analyzeGoogleReviews(site.id, { now });
    } catch (err) {
      // Fournisseur ou réseau indisponible : on réessaie au prochain passage
      const message = errorMessage(err);
      console.error(`[google-reviews] tâche ${task.taskId} :`, message);
      await retryLater(task, message);
    }
  }
  return { task: "collect-google-reviews", processed };
}

/**
 * Mots-clés actifs (sites éligibles, fiche reliée avec position connue, au
 * plus GOOGLE_KEYWORDS_MAX par site) dont la dernière tentative de relevé —
 * tous statuts — date de plus de GOOGLE_SCHEDULED_SCAN_INTERVAL_DAYS
 * (`selectDueKeywords`) : runGoogleScan(scheduled). Lots de GOOGLE_SCAN_BATCH,
 * jamais relevés d'abord. S'arrête avant le mot-clé suivant une fois
 * `opts.deadline` dépassée.
 */
export async function runScheduledGoogleScans(now = new Date(), opts: TickOptions = {}): Promise<TickReport> {
  const db = getDb();
  const lastScans = db
    .select({ keywordId: googleRankScans.keywordId, last: sql<string | Date | null>`max(${googleRankScans.scannedAt})`.as("last_scan") })
    .from(googleRankScans)
    .groupBy(googleRankScans.keywordId)
    .as("last_scans");
  const rows = await db
    .select({ keyword: googleKeywords, site: sites, attemptAt: lastScans.last })
    .from(googleKeywords)
    .innerJoin(sites, eq(sites.id, googleKeywords.siteId))
    .innerJoin(prospects, eq(prospects.id, sites.prospectId))
    .leftJoin(lastScans, eq(lastScans.keywordId, googleKeywords.id))
    .where(
      and(
        eq(googleKeywords.active, true),
        isNotNull(prospects.googlePlaceId),
        hasRealGoogleProvider() ? notLike(prospects.googlePlaceId, "mock-%") : undefined,
        ne(sites.status, "archived"),
        googleAccessCondition(),
        // Position de la fiche connue : le dernier audit du site porte un instantané avec `location`
        sql`exists (
          select 1 from ${googleProfileAudits} a
          where a.site_id = ${sites.id}
          and a.snapshot -> 'location' is not null
          and a.created_at = (select max(b.created_at) from ${googleProfileAudits} b where b.site_id = a.site_id)
        )`,
      ),
    );
  const due = selectDueKeywords(
    rows.map((r) => ({ keyword: r.keyword, site: r.site, siteId: r.site.id, position: r.keyword.position, attemptAt: dateOrNull(r.attemptAt) })),
    now,
    GOOGLE_SCAN_BATCH,
  );

  let processed = 0;
  for (const { keyword, site } of due) {
    if (pastDeadline(opts)) break;
    try {
      const outcome = await runGoogleScan(site.id, keyword.id, "scheduled");
      if (outcome.status === "done") processed += 1;
      else if (outcome.status === "error") console.error(`[google-scan] ${site.slug} « ${keyword.keyword} » : ${outcome.message}`);
    } catch (err) {
      console.error(`[google-scan] ${site.slug} « ${keyword.keyword} » :`, errorMessage(err));
    }
  }
  return { task: "scheduled-google-scans", processed };
}
