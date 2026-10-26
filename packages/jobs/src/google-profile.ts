/**
 * Fiche Google — services de données partagés entre le studio (server
 * actions) et les ticks : budget fournisseur, synchronisation de la fiche
 * (instantané + audit), relevés de visibilité, tâches d'avis, analyse IA.
 *
 * Contrat : signatures figées ici ; implémentation dans le lot
 * « fournisseur + IA + jobs ». Règles :
 * - aucun appel fournisseur sans vérifier `googleBudget` (plafond
 *   GOOGLE_MONTHLY_BUDGET_USD par site et par mois, démos : GOOGLE_DEMO_BUDGET_USD) ;
 * - chaque appel facturé est inscrit dans `google_usage` avec le coût réel
 *   renvoyé par le fournisseur ;
 * - jamais d'avis factices sur un site client ; le mock ne sert qu'aux démos
 *   et au développement local.
 */

import { and, eq, sql } from "drizzle-orm";
import { GOOGLE_MONTHLY_BUDGET_USD, budgetRemainingUsd, usageMonthKey } from "@theralys/shared";
import { getDb, googleUsage, type Database, type GoogleProfileAudit, type GoogleRankScan } from "@theralys/db";
import type { TickReport } from "./ticks";

/** Plafond mensuel d'une démo (audit + avis + quelques relevés), USD. */
export const GOOGLE_DEMO_BUDGET_USD = 1;

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
  void siteId;
  void opts;
  void getDb;
  throw new Error("syncGoogleProfile : à implémenter");
}

/**
 * Recalcule l'audit à partir du dernier instantané (sans appel fournisseur) :
 * après l'arrivée d'avis ou d'un relevé. Renvoie null sans instantané.
 */
export async function recomputeGoogleAudit(siteId: string, now = new Date()): Promise<GoogleProfileAudit | null> {
  void siteId;
  void now;
  throw new Error("recomputeGoogleAudit : à implémenter");
}

// ─── Relevés de visibilité ───────────────────────────────────────────────────

export type ScanOutcome =
  | { status: "done"; scan: GoogleRankScan }
  | { status: "skipped"; reason: "budget" | "no_location" | "inactive" | "quota" }
  | { status: "error"; scanId: string | null; message: string };

/**
 * Relevé d'un mot-clé : grille 7×7 (gridPoints, rayon du mot-clé) autour de
 * la fiche, une requête Maps par point, rang du cabinet (findOwnListing),
 * concurrents agrégés, résumé ; ligne google_rank_scans `running` → `done`
 * ou `error` ; coût inscrit ; keyword.lastScannedAt mis à jour.
 * Vérifie le budget (coût estimé) et, pour `manual`, GOOGLE_MANUAL_SCANS_PER_MONTH.
 */
export async function runGoogleScan(
  siteId: string,
  keywordId: string,
  trigger: "manual" | "scheduled",
  opts: { now?: Date } = {},
): Promise<ScanOutcome> {
  void siteId;
  void keywordId;
  void trigger;
  void opts;
  throw new Error("runGoogleScan : à implémenter");
}

// ─── Avis ────────────────────────────────────────────────────────────────────

/**
 * Analyse IA des avis non analysés d'un site (≤ `limit`, les plus récents
 * d'abord) : sentiment, thèmes, réponse proposée → google_reviews.analysis.
 * Renvoie le nombre d'avis analysés.
 */
export async function analyzeGoogleReviews(siteId: string, opts: { limit?: number; now?: Date } = {}): Promise<number> {
  void siteId;
  void opts;
  throw new Error("analyzeGoogleReviews : à implémenter");
}

// ─── Ticks (appelés par runAllTicks, quotidien 6 h UTC) ──────────────────────

/** Sites éligibles (démo ou formule Scale, fiche reliée) dont la fiche date de plus de 30 jours : syncGoogleProfile. Lots de 25. */
export async function syncGoogleProfiles(now = new Date()): Promise<TickReport> {
  void now;
  throw new Error("syncGoogleProfiles : à implémenter");
}

/** Tâches d'avis en attente : fetchReviewsTask → upsert des avis, puis recomputeGoogleAudit + analyzeGoogleReviews. */
export async function collectGoogleReviewTasks(now = new Date()): Promise<TickReport> {
  void now;
  throw new Error("collectGoogleReviewTasks : à implémenter");
}

/** Mots-clés actifs non relevés depuis GOOGLE_SCHEDULED_SCAN_INTERVAL_DAYS : runGoogleScan(scheduled). Lots de 20. */
export async function runScheduledGoogleScans(now = new Date()): Promise<TickReport> {
  void now;
  throw new Error("runScheduledGoogleScans : à implémenter");
}
