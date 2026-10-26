/**
 * Lecture des données de la section « Fiche Google » : dernier audit et
 * historique des scores, mots-clés actifs avec leurs derniers relevés, avis
 * (plus récents d'abord) et synthèse, posts du mois, quotas et budget. Chaque
 * requête est filtrée par site ; les projections sont sérialisables (dates en
 * ISO) pour passer au composant client.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  getDb,
  googleKeywords,
  googleProfileAudits,
  googleRankScans,
  googleReviews,
  type Prospect,
  type Site,
} from "@theralys/db";
import { googleBudget, type GoogleBudget } from "@theralys/jobs";
import type {
  GoogleAudit,
  GoogleCompetitor,
  GoogleGridPoint,
  GoogleGridRadius,
  GoogleProfileSnapshot,
  GoogleScanGrid,
  GoogleScanSummary,
} from "@theralys/shared";
import { isGridRadius } from "./keywords";
import { getGoogleMonth, getGoogleRequestUsage, type GoogleMonthData, type GoogleRequestUsage } from "./posts";
import { summarizeReviews, type GoogleReviewView, type ReviewsSummary } from "./reviews";
import { getScanUsage, type ScanUsage } from "./scans";

/** Audits conservés dans l'historique des scores. */
const HISTORY_LIMIT = 12;
/** Relevés conservés par mot-clé (le plus récent d'abord). */
const SCANS_PER_KEYWORD = 6;
/** Avis chargés (les plus récents). */
const REVIEWS_LIMIT = 50;

export type GoogleAuditView = {
  id: string;
  audit: GoogleAudit;
  snapshot: GoogleProfileSnapshot;
  /** ISO 8601 */
  createdAt: string;
};

export type GoogleScoreHistoryPoint = { id: string; score: number; createdAt: string };

export type GoogleScanView = {
  id: string;
  keywordId: string;
  trigger: "manual" | "scheduled";
  status: "running" | "done" | "error";
  grid: GoogleScanGrid;
  points: GoogleGridPoint[];
  summary: GoogleScanSummary | null;
  competitors: GoogleCompetitor[];
  costUsd: number;
  error: string | null;
  /** ISO 8601 */
  scannedAt: string;
};

export type GoogleKeywordView = {
  id: string;
  keyword: string;
  radius: GoogleGridRadius;
  lastScannedAt: string | null;
  /** Derniers relevés, le plus récent d'abord */
  scans: GoogleScanView[];
};

export type GoogleLinkedProfile = {
  placeId: string;
  name: string;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
};

export type GoogleProfileData = {
  linked: GoogleLinkedProfile | null;
  latestAudit: GoogleAuditView | null;
  history: GoogleScoreHistoryPoint[];
  keywords: GoogleKeywordView[];
  scanUsage: ScanUsage;
  budget: GoogleBudget;
  reviews: GoogleReviewView[];
  reviewsSummary: ReviewsSummary;
  posts: GoogleMonthData;
  postUsage: GoogleRequestUsage;
};

/** Fiche reliée (prospect) : null tant que `googlePlaceId` est vide. */
export function linkedProfileOf(prospect: Prospect | null): GoogleLinkedProfile | null {
  if (!prospect?.googlePlaceId) return null;
  return {
    placeId: prospect.googlePlaceId,
    name: prospect.googleBusinessName ?? `${prospect.firstName} ${prospect.lastName}`,
    address: prospect.googleAddress,
    rating: prospect.googleRating,
    reviewCount: prospect.googleReviewCount,
  };
}

/** Dernier audit complet (instantané + audit) du site, null sans synchronisation. */
export async function getLatestGoogleAudit(siteId: string): Promise<GoogleAuditView | null> {
  const row = await getDb().query.googleProfileAudits.findFirst({
    where: eq(googleProfileAudits.siteId, siteId),
    orderBy: [desc(googleProfileAudits.createdAt)],
    columns: { id: true, audit: true, snapshot: true, createdAt: true },
  });
  return row ? { id: row.id, audit: row.audit, snapshot: row.snapshot, createdAt: row.createdAt.toISOString() } : null;
}

async function getScoreHistory(siteId: string): Promise<GoogleScoreHistoryPoint[]> {
  const rows = await getDb().query.googleProfileAudits.findMany({
    where: eq(googleProfileAudits.siteId, siteId),
    orderBy: [desc(googleProfileAudits.createdAt)],
    limit: HISTORY_LIMIT,
    columns: { id: true, score: true, createdAt: true },
  });
  // Du plus ancien au plus récent (courbe)
  return rows.reverse().map((r) => ({ id: r.id, score: r.score, createdAt: r.createdAt.toISOString() }));
}

/** Mots-clés actifs du site (ordre de position puis de création) avec leurs derniers relevés. */
export async function getGoogleKeywords(siteId: string): Promise<GoogleKeywordView[]> {
  const db = getDb();
  const keywords = await db.query.googleKeywords.findMany({
    where: and(eq(googleKeywords.siteId, siteId), eq(googleKeywords.active, true)),
    orderBy: [asc(googleKeywords.position), asc(googleKeywords.createdAt)],
  });
  if (keywords.length === 0) return [];
  const ids = keywords.map((k) => k.id);
  // Au plus SCANS_PER_KEYWORD relevés par mot-clé (fenêtre SQL), sans charger tout l'historique
  const ranked = db.$with("ranked").as(
    db
      .select({
        id: googleRankScans.id,
        rank: sql<number>`row_number() over (partition by ${googleRankScans.keywordId} order by ${googleRankScans.scannedAt} desc)`.as("rank"),
      })
      .from(googleRankScans)
      .where(and(eq(googleRankScans.siteId, siteId), inArray(googleRankScans.keywordId, ids))),
  );
  const kept = await db.with(ranked).select({ id: ranked.id }).from(ranked).where(sql`${ranked.rank} <= ${SCANS_PER_KEYWORD}`);
  const scans =
    kept.length === 0
      ? []
      : await db.query.googleRankScans.findMany({
          where: and(
            eq(googleRankScans.siteId, siteId),
            inArray(
              googleRankScans.id,
              kept.map((r) => r.id),
            ),
          ),
          orderBy: [desc(googleRankScans.scannedAt)],
        });
  const byKeyword = new Map<string, GoogleScanView[]>();
  for (const scan of scans) {
    const list = byKeyword.get(scan.keywordId) ?? [];
    list.push({
      id: scan.id,
      keywordId: scan.keywordId,
      trigger: scan.trigger,
      status: scan.status,
      grid: scan.grid,
      points: scan.points,
      summary: scan.summary ?? null,
      competitors: scan.competitors,
      costUsd: scan.costUsd,
      error: scan.error,
      scannedAt: scan.scannedAt.toISOString(),
    });
    byKeyword.set(scan.keywordId, list);
  }
  return keywords.map((k) => ({
    id: k.id,
    keyword: k.keyword,
    radius: isGridRadius(k.radius) ? k.radius : "ville",
    lastScannedAt: k.lastScannedAt?.toISOString() ?? null,
    scans: byKeyword.get(k.id) ?? [],
  }));
}

/** Avis du site, les plus récents d'abord (date d'avis, sinon date de synchronisation). */
export async function getGoogleReviews(siteId: string): Promise<GoogleReviewView[]> {
  const rows = await getDb().query.googleReviews.findMany({
    where: eq(googleReviews.siteId, siteId),
    orderBy: [sql`${googleReviews.reviewedAt} desc nulls last`, desc(googleReviews.syncedAt)],
    limit: REVIEWS_LIMIT,
  });
  return rows.map((r) => ({
    id: r.id,
    authorName: r.authorName,
    authorPhotoUrl: r.authorPhotoUrl,
    rating: r.rating,
    text: r.text,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    ownerReply: r.ownerReply,
    ownerRepliedAt: r.ownerRepliedAt?.toISOString() ?? null,
    reviewUrl: r.reviewUrl,
    analysis: r.analysis ?? null,
  }));
}

/** Toutes les données de la section, en parallèle. */
export async function getGoogleProfileData(
  site: Site,
  prospect: Prospect | null,
  calendar: { year: number; month: number },
  now = new Date(),
): Promise<GoogleProfileData> {
  const [latestAudit, history, keywords, scanUsage, budget, reviews, posts, postUsage] = await Promise.all([
    getLatestGoogleAudit(site.id),
    getScoreHistory(site.id),
    getGoogleKeywords(site.id),
    getScanUsage(site.id, now),
    googleBudget(getDb(), { id: site.id, type: site.type }, now),
    getGoogleReviews(site.id),
    getGoogleMonth(site.id, calendar.year, calendar.month, now),
    getGoogleRequestUsage(site.id, now),
  ]);
  return {
    linked: linkedProfileOf(prospect),
    latestAudit,
    history,
    keywords,
    scanUsage,
    budget,
    reviews,
    reviewsSummary: summarizeReviews(reviews),
    posts,
    postUsage,
  };
}
