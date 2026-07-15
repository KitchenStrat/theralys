/**
 * Agrégation des événements en statistiques (visiteurs uniques, clics RDV,
 * variation vs période précédente, série journalière). Fonctions pures,
 * utilisées par le dashboard client (Phase 2) et testées dès la Phase 1.
 */

export type EventLike = {
  type: "pageview" | "rdv_click";
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
