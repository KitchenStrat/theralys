/**
 * Lecture des données de la section « Meta Ads » : dernière analyse lancée
 * (statut, erreur) et dernière analyse aboutie (veille, diagnostic, créas,
 * plan vidéo, plan), quotas du mois, Pixel courant du site, bandeau cookies
 * et résultats des annonces Meta sur 30 jours ; site auquel se rapporte
 * l'analyse affichée et, quand les outils s'appuient sur le site du client,
 * relevé de sa dernière lecture. Projections sérialisables (dates ISO) pour
 * le composant client.
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { analyticsEvents, getDb, metaAdsAnalyses, type Site } from "@theralys/db";
import { META_ADS_ANALYSIS_STALE_MINUTES, getMetaAdsUsage, loadMetaLibrary, mediaLookupsRemaining, mediaProviderFor, mediaSourceFor, planAdsMedia } from "@theralys/jobs";
import {
  filterRelevantAds,
  type MetaAdMedia,
  type MetaAdsAnalysisStatus,
  type MetaAdsCreativeSet,
  type MetaAdsDiagnostic,
  type MetaAdsMarket,
  type MetaAdsPlan,
  type MetaAdsSeed,
  type MetaAdsVideoPlan,
  type MetaLibraryEntry,
} from "@theralys/shared";
import { isMissingSchemaError } from "../social/data";
import { summarizeAdsResults, type AdsResults as PaidResults } from "@theralys/analytics";
import { analysisSiteOf, type AnalysisSite } from "../google-ads/analysis-site";
import type { ExternalSiteTracking } from "../google-ads/external-tracking";
import { loadAdsSiteContext } from "../google-ads/site-context";
import { metaTrackingForm, type MetaTrackingForm } from "./tracking";

/** Fenêtre du bloc « Résultats » (jours). */
export const META_RESULTS_DAYS = 30;
/**
 * Analyse `running` dont `updatedAt` est plus ancien : le processus est mort,
 * elle est affichée comme interrompue — même seuil et même horodatage que le
 * service (`META_ADS_ANALYSIS_STALE_MINUTES` de `@theralys/jobs`).
 */
export const META_RUNNING_STALE_MS = META_ADS_ANALYSIS_STALE_MINUTES * 60_000;
export const META_INTERRUPTED = "Analyse interrompue avant la fin — relancez-la.";

export type MetaAdsAnalysisView = {
  id: string;
  status: MetaAdsAnalysisStatus;
  seed: MetaAdsSeed;
  market: MetaAdsMarket | null;
  diagnostic: MetaAdsDiagnostic | null;
  creatives: MetaAdsCreativeSet | null;
  videoPlan: MetaAdsVideoPlan | null;
  plan: MetaAdsPlan | null;
  instructions: string | null;
  /** meta | mock | none (veille indisponible) */
  provider: string;
  generator: string;
  calls: number;
  error: string | null;
  /** ISO 8601 */
  createdAt: string;
  updatedAt: string;
};

export type MetaAdsUsageView = Awaited<ReturnType<typeof getMetaAdsUsage>>;

/** Bibliothèque personnelle du site : exemples gardés et annonces supprimées de la veille. */
export type MetaLibraryView = {
  /** false : tables de la migration 0007 absentes — garder et supprimer sont indisponibles */
  available: boolean;
  kept: MetaLibraryEntry[];
  dismissedIds: string[];
};

/** État des visuels de la veille courante. */
export type MetaVisualsView = {
  /** Un fournisseur de visuels est configuré pour cette veille */
  provider: boolean;
  /** Annonces affichées dont les visuels restent à chercher (une annonce cherchée sans résultat n'en fait pas partie) */
  missing: number;
  /** Identifiants de ces annonces : leur visuel n'est pas « absent », il n'a pas encore été cherché */
  pendingIds: string[];
  /** Recherches de visuels encore possibles ce mois-ci */
  remaining: number;
};

export type MetaAdsData = {
  /** Dernière analyse lancée (en cours, en erreur ou aboutie) */
  latest: MetaAdsAnalysisView | null;
  /** Dernière analyse aboutie : contenu des onglets */
  current: MetaAdsAnalysisView | null;
  usage: MetaAdsUsageView;
  tracking: MetaTrackingForm;
  /** Bandeau cookies du site actif (`theme.tracking.cookieBanner !== false`) ; sinon le Pixel part sans consentement */
  cookieBanner: boolean;
  results: PaidResults;
  resultsDays: number;
  library: MetaLibraryView;
  /** Visuels des annonces de la veille courante, par identifiant d'annonce */
  mediaByAdId: Record<string, MetaAdMedia>;
  visuals: MetaVisualsView;
  /**
   * Site pour lequel l'analyse affichée a été préparée (`diagnostic.externalSite`) :
   * son adresse et ses pages d'atterrissage servent à tout ce qui est montré,
   * copié ou exporté depuis les créas.
   */
  analysisSite: AnalysisSite;
  /**
   * Relevé de la dernière lecture du site du client quand les outils
   * s'appuient sur lui aujourd'hui : le formulaire du Pixel et le bloc
   * Résultats, qui n'agissent que sur le site Harmony, laissent alors la
   * place à un pas-à-pas. `null` : site Harmony.
   */
  externalTracking: ExternalSiteTracking | null;
};

/**
 * Veille enregistrée avant le filtre de pertinence (`filtered` absent) : le
 * filtre est appliqué à l'affichage, pour que le contenu commercial et les
 * formations disparaissent sans attendre une nouvelle analyse.
 */
export function withRelevanceFilter(market: MetaAdsMarket | null, seed: Pick<MetaAdsSeed, "profession">): MetaAdsMarket | null {
  if (!market || market.filtered) return market;
  const { kept, filtered } = filterRelevantAds(market.ads, { profession: seed.profession });
  const keptIds = new Set(kept.map((ad) => ad.id));
  return { ...market, ads: market.ads.filter((ad) => keptIds.has(ad.id)), filtered };
}

/** Statut affiché : une analyse `running` trop ancienne devient une erreur (processus interrompu). */
export function displayMetaStatus(status: MetaAdsAnalysisStatus, updatedAt: Date | string, now: Date): { status: MetaAdsAnalysisStatus; error: string | null } {
  if (status !== "running") return { status, error: null };
  const updated = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  const stale = Number.isNaN(updated.getTime()) || now.getTime() - updated.getTime() > META_RUNNING_STALE_MS;
  return stale ? { status: "error", error: META_INTERRUPTED } : { status: "running", error: null };
}

type AnalysisRow = typeof metaAdsAnalyses.$inferSelect;

function toView(row: AnalysisRow, now: Date): MetaAdsAnalysisView {
  const shown = displayMetaStatus(row.status, row.updatedAt, now);
  return {
    id: row.id,
    status: shown.status,
    seed: row.seed,
    market: withRelevanceFilter(row.market ?? null, row.seed),
    diagnostic: row.diagnostic ?? null,
    creatives: row.creatives ?? null,
    videoPlan: row.videoPlan ?? null,
    plan: row.plan ?? null,
    instructions: row.instructions,
    provider: row.provider,
    generator: row.generator,
    calls: row.calls,
    error: shown.error ?? row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Dernière analyse lancée et dernière analyse aboutie (la même ligne quand la dernière est `done`). */
async function getAnalyses(siteId: string, now: Date): Promise<{ latest: MetaAdsAnalysisView | null; current: MetaAdsAnalysisView | null }> {
  const db = getDb();
  const latestRow = await db.query.metaAdsAnalyses.findFirst({
    where: eq(metaAdsAnalyses.siteId, siteId),
    orderBy: [desc(metaAdsAnalyses.createdAt)],
  });
  if (!latestRow) return { latest: null, current: null };
  const latest = toView(latestRow, now);
  if (latest.status === "done") return { latest, current: latest };
  const doneRow = await db.query.metaAdsAnalyses.findFirst({
    where: and(eq(metaAdsAnalyses.siteId, siteId), eq(metaAdsAnalyses.status, "done")),
    orderBy: [desc(metaAdsAnalyses.createdAt)],
  });
  return { latest, current: doneRow ? toView(doneRow, now) : null };
}

/** Visites, clics RDV et appels venus des annonces Meta sur META_RESULTS_DAYS jours (vide avant la migration 0004). */
export async function getMetaResults(siteId: string, now: Date): Promise<PaidResults> {
  const since = new Date(now.getTime() - META_RESULTS_DAYS * 86_400_000);
  try {
    const events = await getDb().query.analyticsEvents.findMany({
      where: and(eq(analyticsEvents.siteId, siteId), gte(analyticsEvents.occurredAt, since), eq(analyticsEvents.source, "meta_ads")),
      columns: { type: true, visitorId: true, source: true },
    });
    return summarizeAdsResults(events, "meta_ads");
  } catch (err) {
    // Colonne `source` absente (migration 0004 non appliquée) : bloc vide plutôt qu'une page en erreur
    if (!isMissingSchemaError(err)) throw err;
    console.warn("[meta-ads] colonne analytics_events.source absente — migration 0004 non appliquée ?");
    return summarizeAdsResults([], "meta_ads");
  }
}

/** Toutes les données de la section, en parallèle. */
export async function getMetaAdsData(site: Site, now = new Date()): Promise<MetaAdsData> {
  const db = getDb();
  const [analyses, usage, results, library, remaining, siteContext] = await Promise.all([
    getAnalyses(site.id, now),
    getMetaAdsUsage(db, site.id, now),
    getMetaResults(site.id, now),
    loadMetaLibrary(db, site.id),
    mediaLookupsRemaining(db, site.id, now),
    loadAdsSiteContext(site),
  ]);
  // Annonces affichées : celles de la veille courante que le praticien n'a pas supprimées
  const dismissed = new Set(library.dismissedIds);
  const ads = (analyses.current?.market?.ads ?? []).filter((ad) => !dismissed.has(ad.id));
  const mode = analyses.current?.provider ?? "none";
  // Visuels de la même origine que la veille (jamais de visuel de démonstration sur une vraie veille) ; ce qui reste à chercher
  const plan = await planAdsMedia(db, ads.map((ad) => ad.id), { now, source: mediaSourceFor(mode) });
  const provider = analyses.current ? mediaProviderFor(process.env, mode) !== null : false;
  const pendingIds = library.available && !plan.unavailable ? plan.pending : [];
  return {
    latest: analyses.latest,
    current: analyses.current,
    usage,
    tracking: metaTrackingForm(site.theme.tracking),
    cookieBanner: site.theme.tracking?.cookieBanner !== false,
    results,
    resultsDays: META_RESULTS_DAYS,
    library,
    mediaByAdId: plan.cached,
    visuals: { provider, missing: pendingIds.length, remaining, pendingIds },
    analysisSite: analysisSiteOf(analyses.current?.diagnostic ?? null, siteContext.sources),
    externalTracking: siteContext.externalTracking,
  };
}
