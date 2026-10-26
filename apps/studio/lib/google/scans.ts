/**
 * Relevés de visibilité : quota mensuel des relevés lancés à la main
 * (`GOOGLE_MANUAL_SCANS_PER_MONTH`, mois civil UTC, relevés en erreur non
 * décomptés) — fonction pure testée, et sa lecture en base.
 */

import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import { getDb, googleRankScans } from "@theralys/db";
import { GOOGLE_MANUAL_SCANS_PER_MONTH, isoDay } from "@theralys/shared";

export type ScanUsage = {
  used: number;
  remaining: number;
  /** "YYYY-MM-DD" : 1er du mois suivant (UTC) */
  resetsOn: string;
};

export type ScanUsageRow = {
  trigger: "manual" | "scheduled";
  status: "running" | "done" | "error";
  scannedAt: Date | string;
};

/** Bornes UTC du mois civil de `now` : [1er du mois, 1er du mois suivant[. */
export function usageMonthBounds(now: Date): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

/**
 * Relevés manuels du mois civil UTC de `now`, hors relevés en erreur (un
 * relevé raté n'est pas décompté), relevés en cours compris.
 */
export function computeScanUsage(scans: ScanUsageRow[], now: Date): ScanUsage {
  const { start, end } = usageMonthBounds(now);
  const used = scans.filter((scan) => {
    if (scan.trigger !== "manual" || scan.status === "error") return false;
    const at = scan.scannedAt instanceof Date ? scan.scannedAt : new Date(scan.scannedAt);
    return at >= start && at < end;
  }).length;
  return { used, remaining: Math.max(0, GOOGLE_MANUAL_SCANS_PER_MONTH - used), resetsOn: isoDay(end) };
}

/** Quota des relevés manuels d'un site pour le mois en cours (une requête). */
export async function getScanUsage(siteId: string, now = new Date()): Promise<ScanUsage> {
  const { start, end } = usageMonthBounds(now);
  const [row] = await getDb()
    .select({ used: sql<number>`count(*)`.mapWith(Number) })
    .from(googleRankScans)
    .where(
      and(
        eq(googleRankScans.siteId, siteId),
        eq(googleRankScans.trigger, "manual"),
        ne(googleRankScans.status, "error"),
        gte(googleRankScans.scannedAt, start),
        lt(googleRankScans.scannedAt, end),
      ),
    );
  const used = row?.used ?? 0;
  return { used, remaining: Math.max(0, GOOGLE_MANUAL_SCANS_PER_MONTH - used), resetsOn: isoDay(end) };
}
