/**
 * Agrégation des événements en statistiques (visiteurs uniques, clics RDV,
 * variation vs période précédente, série journalière, provenance des
 * visites, résultats Google Ads). Fonctions pures, utilisées par le dashboard
 * client (Phase 2) et testées dès la Phase 1. Les clics sur le téléphone
 * (`call_click`) n'entrent jamais dans les clics RDV.
 */

import { ANALYTICS_SOURCES, type AnalyticsSource } from "@theralys/shared";
import type { AnalyticsEventType } from "./events";

export type EventLike = {
  type: AnalyticsEventType;
  visitorId: string | null;
  occurredAt: Date;
};

export type PeriodStats = {
  visitors: number;
  rdvClicks: number;
  /** Variation en % vs période précédente (null si période précédente vide) */
  visitorsChangePct: number | null;
  rdvClicksChangePct: number | null;
  /** Une entrée par jour de la période courante */
  daily: { day: string; visitors: number; rdvClicks: number }[];
};

export function summarizePeriod(
  events: EventLike[],
  from: Date,
  to: Date,
): PeriodStats {
  const durationMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - durationMs);

  const current = events.filter((e) => e.occurredAt >= from && e.occurredAt < to);
  const previous = events.filter((e) => e.occurredAt >= prevFrom && e.occurredAt < from);

  const visitors = countVisitors(current);
  const prevVisitors = countVisitors(previous);
  const rdvClicks = current.filter((e) => e.type === "rdv_click").length;
  const prevRdvClicks = previous.filter((e) => e.type === "rdv_click").length;

  const daily: PeriodStats["daily"] = [];
  for (let t = startOfDayUtc(from); t < to; t = addDays(t, 1)) {
    const next = addDays(t, 1);
    const dayEvents = current.filter((e) => e.occurredAt >= t && e.occurredAt < next);
    daily.push({
      day: t.toISOString().slice(0, 10),
      visitors: countVisitors(dayEvents),
      rdvClicks: dayEvents.filter((e) => e.type === "rdv_click").length,
    });
  }

  return {
    visitors,
    rdvClicks,
    visitorsChangePct: changePct(prevVisitors, visitors),
    rdvClicksChangePct: changePct(prevRdvClicks, rdvClicks),
    daily,
  };
}

// ─── Provenance des visites ──────────────────────────────────────────────────

export type SourceEventLike = {
  type: AnalyticsEventType;
  visitorId: string | null;
  /** AnalyticsSource enregistrée à l'ingestion ; null = non renseignée (navigation interne, événement antérieur à la mesure) */
  source: string | null;
};

export type SourceShare = {
  source: AnalyticsSource;
  /** Visiteurs uniques (ou vues, voir `unit`) venus de cette source */
  count: number;
  /** Part en % du total mesuré, arrondie */
  share: number;
};

export type SourceSummary = {
  /** Total mesuré (somme des `count`) ; 0 = aucune provenance renseignée */
  total: number;
  /** `visitors` dès qu'un identifiant visiteur existe, sinon `views` */
  unit: "visitors" | "views";
  /** Sources présentes, triées par `count` décroissant puis ordre d'ANALYTICS_SOURCES */
  rows: SourceShare[];
};

const SOURCE_ORDER = new Map<string, number>(ANALYTICS_SOURCES.map((s, i) => [s, i]));

function isAnalyticsSource(value: string): value is AnalyticsSource {
  return SOURCE_ORDER.has(value);
}

/**
 * Répartition des pages vues par provenance. Seules les pages vues dont la
 * `source` est renseignée comptent : les événements sans source (navigation
 * interne, historique antérieur à la mesure) sont exclus du total pour ne pas
 * fausser les parts. Par source, un visiteur identifié compte une fois ;
 * chaque page vue sans identifiant compte pour une.
 */
export function summarizeSources(events: SourceEventLike[]): SourceSummary {
  const visitors = new Map<AnalyticsSource, Set<string>>();
  const anonymous = new Map<AnalyticsSource, number>();
  let hasVisitorId = false;
  for (const e of events) {
    if (e.type !== "pageview" || e.source === null || !isAnalyticsSource(e.source)) continue;
    if (e.visitorId) {
      hasVisitorId = true;
      const ids = visitors.get(e.source) ?? new Set<string>();
      ids.add(e.visitorId);
      visitors.set(e.source, ids);
    } else {
      anonymous.set(e.source, (anonymous.get(e.source) ?? 0) + 1);
    }
  }
  const rows: SourceShare[] = [];
  for (const source of ANALYTICS_SOURCES) {
    const count = (visitors.get(source)?.size ?? 0) + (anonymous.get(source) ?? 0);
    if (count > 0) rows.push({ source, count, share: 0 });
  }
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  for (const row of rows) row.share = total > 0 ? Math.round((row.count / total) * 100) : 0;
  rows.sort((a, b) => b.count - a.count || SOURCE_ORDER.get(a.source)! - SOURCE_ORDER.get(b.source)!);
  return { total, unit: hasVisitorId ? "visitors" : "views", rows };
}

// ─── Résultats Google Ads ────────────────────────────────────────────────────

export type AdsResults = {
  /** Visites venues des annonces : visiteurs distincts (ou pages vues, voir `unit`) */
  visits: number;
  /** Clics « Prendre rendez-vous » venus des annonces (un par clic) */
  rdvClicks: number;
  /** Clics sur le numéro de téléphone venus des annonces (un par clic) */
  callClicks: number;
  /** `visitors` dès qu'un identifiant visiteur existe, sinon `views` */
  unit: "visitors" | "views";
};

/**
 * Résultats des annonces Google (studio → Google Ads → Paramétrage & suivi) :
 * seuls les événements de provenance `google_ads` comptent. Un visiteur
 * identifié compte une visite quel que soit son nombre de pages vues ; chaque
 * page vue sans identifiant compte pour une. Les clics sont comptés par
 * événement, même sans identifiant.
 */
export function summarizeAdsResults(events: SourceEventLike[]): AdsResults {
  const ids = new Set<string>();
  let views = 0;
  let rdvClicks = 0;
  let callClicks = 0;
  for (const e of events) {
    if (e.source !== "google_ads") continue;
    if (e.type === "pageview") {
      if (e.visitorId) ids.add(e.visitorId);
      else views++;
    } else if (e.type === "rdv_click") {
      rdvClicks++;
    } else if (e.type === "call_click") {
      callClicks++;
    }
  }
  return { visits: ids.size + views, rdvClicks, callClicks, unit: ids.size > 0 ? "visitors" : "views" };
}

/** Visiteurs uniques = identifiants distincts (consentis) sur la période. */
function countVisitors(events: EventLike[]): number {
  const ids = new Set<string>();
  for (const e of events) {
    if (e.type === "pageview" && e.visitorId) ids.add(e.visitorId);
  }
  return ids.size;
}

function changePct(previous: number, current: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function startOfDayUtc(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
