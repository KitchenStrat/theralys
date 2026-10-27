/**
 * Lecture des données de la section « Google Ads » : dernière analyse lancée
 * (statut, erreur) et dernière analyse aboutie (diagnostic, mots-clés, plan),
 * quotas du mois, budget fournisseur, suivi des conversions du site et
 * résultats des annonces sur 30 jours. Projections sérialisables (dates ISO)
 * pour le composant client.
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { analyticsEvents, getDb, googleAdsAnalyses, type Site } from "@theralys/db";
import { getGoogleAdsUsage, googleBudget, type GoogleBudget } from "@theralys/jobs";
import {
  GOOGLE_ADS_ANALYSIS_COST_USD,
  type GoogleAdsAnalysisStatus,
  type GoogleAdsDiagnostic,
  type GoogleAdsForecast,
  type GoogleAdsKeywordSet,
  type GoogleAdsPlan,
} from "@theralys/shared";
import { isMissingSchemaError } from "../social/data";
import { summarizeAdsResults, type AdsResults } from "@theralys/analytics";
import { adsTrackingForm, type AdsTrackingForm } from "./tracking";

/** Fenêtre du bloc « Résultats » (jours). */
export const ADS_RESULTS_DAYS = 30;
/** Analyse `running` plus ancienne : le processus est mort, elle est affichée comme interrompue. */
export const ADS_RUNNING_STALE_MS = 10 * 60 * 1000;
export const ADS_INTERRUPTED = "Analyse interrompue avant la fin — relancez-la.";

export type GoogleAdsAnalysisView = {
  id: string;
  status: GoogleAdsAnalysisStatus;
  keywords: GoogleAdsKeywordSet | null;
  forecast: GoogleAdsForecast | null;
  diagnostic: GoogleAdsDiagnostic | null;
  plan: GoogleAdsPlan | null;
  instructions: string | null;
  provider: string;
  generator: string;
  costUsd: number;
  error: string | null;
  /** ISO 8601 */
  createdAt: string;
  updatedAt: string;
};

export type GoogleAdsUsage = Awaited<ReturnType<typeof getGoogleAdsUsage>>;

export type GoogleAdsData = {
  /** Dernière analyse lancée (en cours, en erreur ou aboutie) */
  latest: GoogleAdsAnalysisView | null;
  /** Dernière analyse aboutie : contenu des onglets */
  current: GoogleAdsAnalysisView | null;
  usage: GoogleAdsUsage;
  budget: GoogleBudget;
  analysisCostUsd: number;
  tracking: AdsTrackingForm;
  results: AdsResults;
  resultsDays: number;
};

/** Statut affiché : une analyse `running` trop ancienne devient une erreur (processus interrompu). */
export function displayAnalysisStatus(
  status: GoogleAdsAnalysisStatus,
  updatedAt: Date | string,
  now: Date,
): { status: GoogleAdsAnalysisStatus; error: string | null } {
  if (status !== "running") return { status, error: null };
  const updated = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  const stale = Number.isNaN(updated.getTime()) || now.getTime() - updated.getTime() > ADS_RUNNING_STALE_MS;
  return stale ? { status: "error", error: ADS_INTERRUPTED } : { status: "running", error: null };
}

type AnalysisRow = typeof googleAdsAnalyses.$inferSelect;

function toView(row: AnalysisRow, now: Date): GoogleAdsAnalysisView {
  const shown = displayAnalysisStatus(row.status, row.updatedAt, now);
  return {
    id: row.id,
    status: shown.status,
    keywords: row.keywords ?? null,
    forecast: row.forecast ?? null,
    diagnostic: row.diagnostic ?? null,
    plan: row.plan ?? null,
    instructions: row.instructions,
    provider: row.provider,
    generator: row.generator,
    costUsd: row.costUsd,
    error: shown.error ?? row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Dernière analyse lancée et dernière analyse aboutie (la même ligne quand la dernière est `done`). */
async function getAnalyses(siteId: string, now: Date): Promise<{ latest: GoogleAdsAnalysisView | null; current: GoogleAdsAnalysisView | null }> {
  const db = getDb();
  const latestRow = await db.query.googleAdsAnalyses.findFirst({
    where: eq(googleAdsAnalyses.siteId, siteId),
    orderBy: [desc(googleAdsAnalyses.createdAt)],
  });
  if (!latestRow) return { latest: null, current: null };
  const latest = toView(latestRow, now);
  if (latest.status === "done") return { latest, current: latest };
  const doneRow = await db.query.googleAdsAnalyses.findFirst({
    where: and(eq(googleAdsAnalyses.siteId, siteId), eq(googleAdsAnalyses.status, "done")),
    orderBy: [desc(googleAdsAnalyses.createdAt)],
  });
  return { latest, current: doneRow ? toView(doneRow, now) : null };
}

/** Visites, clics RDV et appels venus des annonces sur ADS_RESULTS_DAYS jours (vide avant la migration 0004). */
export async function getAdsResults(siteId: string, now: Date): Promise<AdsResults> {
  const since = new Date(now.getTime() - ADS_RESULTS_DAYS * 86_400_000);
  try {
    const events = await getDb().query.analyticsEvents.findMany({
      where: and(eq(analyticsEvents.siteId, siteId), gte(analyticsEvents.occurredAt, since), eq(analyticsEvents.source, "google_ads")),
      columns: { type: true, visitorId: true, source: true },
    });
    return summarizeAdsResults(events);
  } catch (err) {
    // Colonne `source` absente (migration 0004 non appliquée) : bloc vide plutôt qu'une page en erreur
    if (!isMissingSchemaError(err)) throw err;
    console.warn("[google-ads] colonne analytics_events.source absente — migration 0004 non appliquée ?");
    return summarizeAdsResults([]);
  }
}

/** Toutes les données de la section, en parallèle. */
export async function getGoogleAdsData(site: Site, now = new Date()): Promise<GoogleAdsData> {
  const db = getDb();
  const [analyses, usage, budget, results] = await Promise.all([
    getAnalyses(site.id, now),
    getGoogleAdsUsage(db, site.id, now),
    googleBudget(db, { id: site.id, type: site.type }, now),
    getAdsResults(site.id, now),
  ]);
  return {
    latest: analyses.latest,
    current: analyses.current,
    usage,
    budget,
    analysisCostUsd: GOOGLE_ADS_ANALYSIS_COST_USD,
    tracking: adsTrackingForm(site.theme.tracking),
    results,
    resultsDays: ADS_RESULTS_DAYS,
  };
}
