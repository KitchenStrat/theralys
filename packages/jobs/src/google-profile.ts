/**
 * Fiche Google — services de données partagés entre le studio (server
 * actions) et les ticks : budget fournisseur, synchronisation de la fiche
 * (instantané + audit), relevés de visibilité, tâches d'avis, analyse IA.
 *
 * Signatures figées (le studio les appelle telles quelles). Règles :
 * - aucun appel fournisseur sans vérifier `googleBudget` (plafond
 *   GOOGLE_MONTHLY_BUDGET_USD par site et par mois, démos : GOOGLE_DEMO_BUDGET_USD) ;
 * - chaque appel facturé est inscrit dans `google_usage` avec le coût réel
 *   renvoyé par le fournisseur (0 en mock, pour les compteurs) ;
 * - jamais d'avis factices sur un site client : le fournisseur mock ne lance
 *   et ne collecte des tâches d'avis que pour les démos (développement local) ;
 * - repli Places API (New) pour la fiche quand DataForSEO est absent ou en
 *   échec (instantané `source: "places"`, attributs et description inconnus).
 */

import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lt, ne, notInArray, or, sql } from "drizzle-orm";
import {
  DATAFORSEO_UNIT_COSTS,
  GOOGLE_GRID,
  GOOGLE_GRID_RADII,
  GOOGLE_MANUAL_SCANS_PER_MONTH,
  GOOGLE_MONTHLY_BUDGET_USD,
  GOOGLE_PROFILE_SYNC_INTERVAL_DAYS,
  GOOGLE_REVIEWS_SYNC_DEPTH,
  GOOGLE_SCHEDULED_SCAN_INTERVAL_DAYS,
  aggregateCompetitors,
  auditGoogleProfile,
  benchmarkFrom,
  budgetRemainingUsd,
  estimateScanCostUsd,
  findOwnListing,
  gridPoints,
  gridRadiusKm,
  summarizeScan,
  usageMonthKey,
  type GoogleAudit,
  type GoogleBenchmark,
  type GoogleCompetitor,
  type GoogleGridPoint,
  type GoogleGridRadius,
  type GoogleProfileSnapshot,
  type GoogleScanGrid,
} from "@theralys/shared";
import {
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
  type Prospect,
  type Site,
} from "@theralys/db";
import { createGoogleReviewsAnalyzer } from "@theralys/ai";
import { createLocalSearchProvider, type GoogleReviewItem } from "@theralys/providers/dataforseo";
import { createGooglePlacesProvider } from "@theralys/providers/google";
import { loadGoogleBrief, siteUrl } from "./google-brief";
import type { TickReport } from "./ticks";

/** Plafond mensuel d'une démo (audit + avis + quelques relevés), USD. */
export const GOOGLE_DEMO_BUDGET_USD = 1;
/** Sites synchronisés par passage du tick `syncGoogleProfiles`. */
export const GOOGLE_SYNC_BATCH = 25;
/** Mots-clés relevés par passage du tick `runScheduledGoogleScans`. */
export const GOOGLE_SCAN_BATCH = 20;
/** Lectures d'une tâche d'avis encore en attente avant abandon (≈ 2 jours au rythme horaire). */
export const GOOGLE_REVIEW_TASK_MAX_ATTEMPTS = 48;
/** Relevé `running` plus ancien : le processus est mort, la ligne passe en erreur. */
const SCAN_STALE_MINUTES = 15;
/** Profondeur des requêtes Maps (au-delà du 20e, le rang n'a plus d'intérêt). */
const MAPS_DEPTH = 20;
const DAY_MS = 86_400_000;
const ERROR_MESSAGE_MAX = 300;

export type GoogleUsageKind = "business_info" | "reviews" | "scan";

export type GoogleBudget = {
  month: string;
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
};

/** Dépenses fournisseur du mois courant (USD) pour un site. */
export async function monthlyGoogleSpendUsd(db: Database, siteId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${googleUsage.costUsd}), 0)` })
    .from(googleUsage)
    .where(and(eq(googleUsage.siteId, siteId), eq(googleUsage.month, usageMonthKey(now))));
  return Number(row?.total ?? 0);
}

/** Budget restant du mois pour un site (démo : plafond réduit). */
export async function googleBudget(
  db: Database,
  site: { id: string; type: "demo" | "client" },
  now = new Date(),
): Promise<GoogleBudget> {
  const budgetUsd = site.type === "demo" ? GOOGLE_DEMO_BUDGET_USD : GOOGLE_MONTHLY_BUDGET_USD;
  const spentUsd = await monthlyGoogleSpendUsd(db, site.id, now);
  return { month: usageMonthKey(now), spentUsd, budgetUsd, remainingUsd: budgetRemainingUsd(spentUsd, budgetUsd) };
}

/** Inscrit une dépense réelle (coût renvoyé par le fournisseur ; 0 en mock est inscrit aussi, pour les compteurs). */
export async function recordGoogleUsage(
  db: Database,
  siteId: string,
  kind: GoogleUsageKind,
  costUsd: number,
  requests = 1,
  now = new Date(),
): Promise<void> {
  await db.insert(googleUsage).values({ siteId, month: usageMonthKey(now), kind, costUsd, requests });
}

// ─── Aides communes ──────────────────────────────────────────────────────────

/** Accès à la section Fiche Google : démos et formule Scale. */
export function hasGoogleProfileAccess(site: Pick<Site, "type" | "plan">): boolean {
  return site.type === "demo" || hasGoogleProfile(site.plan);
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
async function placesSnapshot(site: Site, prospect: Prospect, placeId: string, now: Date): Promise<GoogleProfileSnapshot> {
  const places = createGooglePlacesProvider();
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
  | { status: "skipped"; reason: "no_place" | "recent" | "budget" | "no_access" }
  | { status: "error"; message: string };

/**
 * Synchronise la fiche d'un site : fiche d'établissement (DataForSEO, repli
 * Places), audit déterministe (`auditGoogleProfile`, avec le benchmark des
 * derniers relevés et les avis connus), insertion dans google_profile_audits,
 * mise à jour note / nombre d'avis du prospect, puis lancement d'une tâche
 * d'avis (GOOGLE_REVIEWS_SYNC_DEPTH) si aucune n'est en attente.
 * `force` ignore l'intervalle GOOGLE_PROFILE_SYNC_INTERVAL_DAYS (mais pas le budget).
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
  if (!hasGoogleProfileAccess(site)) return { status: "skipped", reason: "no_access" };

  const previous = await latestAudit(db, siteId);
  if (!opts.force && previous && now.getTime() - previous.createdAt.getTime() < GOOGLE_PROFILE_SYNC_INTERVAL_DAYS * DAY_MS) {
    return { status: "skipped", reason: "recent" };
  }
  const budget = await googleBudget(db, site, now);
  if (budget.remainingUsd < DATAFORSEO_UNIT_COSTS.businessInfoLive) return { status: "skipped", reason: "budget" };

  // 1. Fiche d'établissement : DataForSEO (ou mock), repli Places
  const previousSnapshot = previous?.snapshot ?? null;
  const provider = createLocalSearchProvider(process.env, ownListing(prospect, previousSnapshot));
  let snapshot: GoogleProfileSnapshot | null = null;
  let costUsd = 0;
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
    snapshot = result.data;
    if (snapshot) snapshot = { ...snapshot, fetchedAt: now.toISOString(), placeId: snapshot.placeId ?? placeId };
  } catch (err) {
    console.warn(`[google-profile] fiche ${placeId} indisponible via ${provider.mode} :`, errorMessage(err));
  }
  if (!snapshot) {
    try {
      snapshot = await placesSnapshot(site, prospect, placeId, now);
    } catch (err) {
      return { status: "error", message: `Fiche Google indisponible : ${errorMessage(err)}` };
    }
  }

  // 2. Audit et historique
  const audit = await computeAudit(db, site, snapshot, now);
  const [inserted] = await db
    .insert(googleProfileAudits)
    .values({ siteId, snapshot, audit, score: audit.score, costUsd, createdAt: now })
    .returning();

  // 3. Fiche du prospect (note, nombre d'avis, nom si vide)
  const prospectPatch: Partial<Pick<Prospect, "googleRating" | "googleReviewCount" | "googleBusinessName">> = {};
  if (snapshot.rating !== null) prospectPatch.googleRating = snapshot.rating;
  if (snapshot.votes !== null) prospectPatch.googleReviewCount = snapshot.votes;
  if (!prospect.googleBusinessName && snapshot.title) prospectPatch.googleBusinessName = snapshot.title;
  if (Object.keys(prospectPatch).length > 0) {
    await db.update(prospects).set(prospectPatch).where(eq(prospects.id, prospect.id));
  }

  // 4. Avis : une tâche DataForSEO (ou mock, démos seulement) si aucune n'est en attente et si le budget le permet
  if (provider.mode === "dataforseo" || site.type === "demo") {
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
async function manualScansThisMonth(db: Database, siteId: string, now: Date): Promise<number> {
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

/**
 * Relevé d'un mot-clé : grille 7×7 (gridPoints, rayon du mot-clé) autour de
 * la fiche, une requête Maps par point, rang du cabinet (findOwnListing),
 * concurrents agrégés, résumé ; ligne google_rank_scans `running` → `done`
 * ou `error` ; coût inscrit ; keyword.lastScannedAt mis à jour.
 * Vérifie le budget (coût estimé) et, pour `manual`, GOOGLE_MANUAL_SCANS_PER_MONTH.
 * Un verrou consultatif (`google-scan:<keywordId>`) et la ligne `running`
 * empêchent deux relevés simultanés du même mot-clé.
 */
export async function runGoogleScan(
  siteId: string,
  keywordId: string,
  trigger: "manual" | "scheduled",
  opts: { now?: Date } = {},
): Promise<ScanOutcome> {
  const now = opts.now ?? new Date();
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
  if (trigger === "manual" && (await manualScansThisMonth(db, siteId, now)) >= GOOGLE_MANUAL_SCANS_PER_MONTH) {
    return { status: "skipped", reason: "quota" };
  }
  const budget = await googleBudget(db, site, now);
  if (estimateScanCostUsd() > budget.remainingUsd) return { status: "skipped", reason: "budget" };

  const radius = gridRadiusOf(keyword.radius);
  const grid: GoogleScanGrid = {
    center,
    rows: GOOGLE_GRID.rows,
    cols: GOOGLE_GRID.cols,
    radius,
    radiusKm: gridRadiusKm(radius),
    zoom: GOOGLE_GRID.zoom,
  };

  // Transaction courte sous verrou consultatif : un seul relevé `running` par mot-clé
  const scanId = await db.transaction(async (tx) => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${`google-scan:${keywordId}`})) as locked`);
    if (lock.rows[0]?.locked !== true) return null;
    const running = await tx.query.googleRankScans.findMany({
      where: and(eq(googleRankScans.keywordId, keywordId), eq(googleRankScans.status, "running")),
      columns: { id: true, scannedAt: true },
    });
    const stale = running.filter((s) => now.getTime() - s.scannedAt.getTime() > SCAN_STALE_MINUTES * 60_000);
    if (running.length > stale.length) return null;
    if (stale.length > 0) {
      await tx
        .update(googleRankScans)
        .set({ status: "error", error: "Relevé interrompu" })
        .where(inArray(googleRankScans.id, stale.map((s) => s.id)));
    }
    const [row] = await tx
      .insert(googleRankScans)
      .values({ siteId, keywordId, trigger, status: "running", grid, scannedAt: now })
      .returning({ id: googleRankScans.id });
    return row!.id;
  });
  if (!scanId) return { status: "error", scanId: null, message: "Un relevé est déjà en cours pour ce mot-clé" };

  try {
    const own = ownListing(prospect, snapshot);
    const provider = createLocalSearchProvider(process.env, own);
    const points = gridPoints(center, grid.radiusKm);
    const result = await provider.mapsSearch(
      points.map((point) => ({ keyword: keyword.keyword, point, zoom: grid.zoom, depth: MAPS_DEPTH })),
    );
    const gridResults: GoogleGridPoint[] = points.map((point, i) => {
      const listings = result.data[i] ?? [];
      const self = findOwnListing(listings, own);
      return {
        ...point,
        rank: self?.rank ?? null,
        top: listings.slice(0, 3).map((l) => ({ title: l.title, cid: l.cid, rating: l.rating, votes: l.votes })),
      };
    });
    const summary = summarizeScan(gridResults);
    const competitors = aggregateCompetitors(result.data, own);
    await recordGoogleUsage(db, siteId, "scan", result.costUsd, points.length, now);
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
    await db.update(googleRankScans).set({ status: "error", error: message }).where(eq(googleRankScans.id, scanId));
    return { status: "error", scanId, message };
  }
}

// ─── Avis ────────────────────────────────────────────────────────────────────

/**
 * Analyse IA des avis non analysés d'un site (≤ `limit`, les plus récents
 * d'abord) : sentiment, thèmes, réponse proposée → google_reviews.analysis.
 * Renvoie le nombre d'avis analysés ; une erreur IA est journalisée et vaut 0
 * (jamais de throw vers le tick).
 */
export async function analyzeGoogleReviews(siteId: string, opts: { limit?: number; now?: Date } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const limit = Math.max(1, opts.limit ?? 20);
  const db = getDb();
  try {
    const pending = await db.query.googleReviews.findMany({
      where: and(eq(googleReviews.siteId, siteId), isNull(googleReviews.analysis), ne(googleReviews.text, "")),
      orderBy: [sql`${googleReviews.reviewedAt} desc nulls last`],
      limit,
    });
    if (pending.length === 0) return 0;
    const { brief } = await loadGoogleBrief(db, siteId, now);
    const analyzer = createGoogleReviewsAnalyzer();
    const analyses = await analyzer.analyze({
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
    });
    let count = 0;
    for (const [id, analysis] of Object.entries(analyses)) {
      await db.update(googleReviews).set({ analysis }).where(and(eq(googleReviews.id, id), eq(googleReviews.siteId, siteId)));
      count += 1;
    }
    return count;
  } catch (err) {
    console.error(`[google-reviews] analyse impossible pour le site ${siteId} :`, errorMessage(err));
    return 0;
  }
}

/**
 * Avis d'une tâche terminée → google_reviews : mise à jour par sourceReviewId
 * (analyse remise à zéro si le texte a changé), insertion des nouveaux, puis
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
  const ids = incoming.map((r) => r.sourceReviewId);
  if (ids.length === 0) return;
  const existing = await db.query.googleReviews.findMany({
    where: and(eq(googleReviews.siteId, siteId), inArray(googleReviews.sourceReviewId, ids)),
    columns: { id: true, sourceReviewId: true, text: true },
  });
  const byId = new Map(existing.map((r) => [r.sourceReviewId, r]));
  const fresh: (typeof googleReviews.$inferInsert)[] = [];
  for (const r of incoming) {
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

// ─── Ticks (appelés par runAllTicks, quotidien 6 h UTC) ──────────────────────

/** Sites éligibles (démo ou formule Scale, fiche reliée, non archivés), avec leur prospect. */
async function eligibleSites(db: Database): Promise<SiteWithProspect[]> {
  const rows = await db
    .select({ site: sites, prospect: prospects })
    .from(sites)
    .innerJoin(prospects, eq(prospects.id, sites.prospectId))
    .where(and(isNotNull(prospects.googlePlaceId), ne(sites.status, "archived")))
    .orderBy(asc(sites.createdAt));
  return rows.filter((r) => hasGoogleProfileAccess(r.site));
}

/** Sites éligibles (démo ou formule Scale, fiche reliée) dont la fiche date de plus de 30 jours : syncGoogleProfile. Lots de 25. */
export async function syncGoogleProfiles(now = new Date()): Promise<TickReport> {
  const db = getDb();
  const candidates = await eligibleSites(db);
  const latest = await db
    .select({ siteId: googleProfileAudits.siteId, last: sql<string | Date>`max(${googleProfileAudits.createdAt})` })
    .from(googleProfileAudits)
    .groupBy(googleProfileAudits.siteId);
  const lastBySite = new Map(latest.map((r) => [r.siteId, new Date(r.last).getTime()]));
  const cutoff = now.getTime() - GOOGLE_PROFILE_SYNC_INTERVAL_DAYS * DAY_MS;
  const due = candidates
    .filter(({ site }) => {
      const last = lastBySite.get(site.id);
      return last === undefined || !Number.isFinite(last) || last < cutoff;
    })
    .slice(0, GOOGLE_SYNC_BATCH);

  let processed = 0;
  for (const { site } of due) {
    try {
      const outcome = await syncGoogleProfile(site.id, { now });
      if (outcome.status === "done") processed += 1;
      else if (outcome.status === "error") console.error(`[google-profile] ${site.slug} : ${outcome.message}`);
    } catch (err) {
      console.error(`[google-profile] ${site.slug} :`, errorMessage(err));
    }
  }
  return { task: "sync-google-profiles", processed };
}

/** Tâches d'avis en attente : fetchReviewsTask → upsert des avis, puis recomputeGoogleAudit + analyzeGoogleReviews. */
export async function collectGoogleReviewTasks(now = new Date()): Promise<TickReport> {
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
  /** Encore en attente : une tentative de plus, abandon au-delà de GOOGLE_REVIEW_TASK_MAX_ATTEMPTS. */
  const retryLater = async (task: { id: string; attempts: number }, reason: string | null) => {
    const attempts = task.attempts + 1;
    if (attempts >= GOOGLE_REVIEW_TASK_MAX_ATTEMPTS) {
      await db
        .update(googleReviewTasks)
        .set({ status: "error", attempts, error: reason ?? "Délai dépassé : la tâche n'a jamais abouti", completedAt: now })
        .where(eq(googleReviewTasks.id, task.id));
    } else {
      await db.update(googleReviewTasks).set({ attempts, error: reason }).where(eq(googleReviewTasks.id, task.id));
    }
  };

  for (const task of tasks) {
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
      if (prospect) {
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

/** Mots-clés actifs non relevés depuis GOOGLE_SCHEDULED_SCAN_INTERVAL_DAYS : runGoogleScan(scheduled). Lots de 20. */
export async function runScheduledGoogleScans(now = new Date()): Promise<TickReport> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - GOOGLE_SCHEDULED_SCAN_INTERVAL_DAYS * DAY_MS);
  const rows = await db
    .select({ keyword: googleKeywords, site: sites })
    .from(googleKeywords)
    .innerJoin(sites, eq(sites.id, googleKeywords.siteId))
    .innerJoin(prospects, eq(prospects.id, sites.prospectId))
    .where(
      and(
        eq(googleKeywords.active, true),
        isNotNull(prospects.googlePlaceId),
        ne(sites.status, "archived"),
        or(isNull(googleKeywords.lastScannedAt), lt(googleKeywords.lastScannedAt, cutoff)),
      ),
    )
    .orderBy(sql`${googleKeywords.lastScannedAt} asc nulls first`);
  const due = rows.filter((r) => hasGoogleProfileAccess(r.site)).slice(0, GOOGLE_SCAN_BATCH);

  let processed = 0;
  for (const { keyword, site } of due) {
    try {
      const outcome = await runGoogleScan(site.id, keyword.id, "scheduled", { now });
      if (outcome.status === "done") processed += 1;
      else if (outcome.status === "error") console.error(`[google-scan] ${site.slug} « ${keyword.keyword} » : ${outcome.message}`);
    } catch (err) {
      console.error(`[google-scan] ${site.slug} « ${keyword.keyword} » :`, errorMessage(err));
    }
  }
  return { task: "scheduled-google-scans", processed };
}
