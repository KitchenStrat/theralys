import { describe, expect, it } from "vitest";
import { GOOGLE_MANUAL_SCANS_PER_MONTH } from "@theralys/shared";
import { RUNNING_STALE_MS, computeScanUsage, displayScanStatus, usageMonthBounds, type ScanUsageRow } from "./scans";

const NOW = new Date("2026-10-26T09:00:00Z");

function scan(scannedAt: string, extra: Partial<ScanUsageRow> = {}): ScanUsageRow {
  return { trigger: "manual", status: "done", scannedAt, ...extra };
}

describe("computeScanUsage", () => {
  it("bornes du mois civil UTC", () => {
    const { start, end } = usageMonthBounds(NOW);
    expect(start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("compte les relevés manuels du mois, hors erreurs, relevés en cours compris", () => {
    const usage = computeScanUsage(
      [
        scan("2026-10-02T10:00:00Z"),
        scan("2026-10-20T10:00:00Z", { status: "running" }),
        scan("2026-10-21T10:00:00Z", { status: "error" }),
        scan("2026-10-22T10:00:00Z", { trigger: "scheduled" }),
        scan("2026-09-30T23:59:59Z"),
        scan("2026-11-01T00:00:00Z"),
      ],
      NOW,
    );
    expect(usage.used).toBe(2);
    expect(usage.remaining).toBe(GOOGLE_MANUAL_SCANS_PER_MONTH - 2);
    expect(usage.resetsOn).toBe("2026-11-01");
  });

  it("jamais négatif au-delà du quota, dates en objets Date acceptées", () => {
    const scans = Array.from({ length: GOOGLE_MANUAL_SCANS_PER_MONTH + 2 }, () =>
      scan("", { scannedAt: new Date("2026-10-10T08:00:00Z") }),
    );
    const usage = computeScanUsage(scans, NOW);
    expect(usage.used).toBe(GOOGLE_MANUAL_SCANS_PER_MONTH + 2);
    expect(usage.remaining).toBe(0);
  });
});

describe("displayScanStatus", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  it("un relevé en cours récent reste en cours, un relevé en cours périmé est présenté en erreur", () => {
    expect(displayScanStatus("running", new Date(now.getTime() - 60_000), now)).toBe("running");
    expect(displayScanStatus("running", new Date(now.getTime() - RUNNING_STALE_MS - 1), now)).toBe("error");
    expect(displayScanStatus("running", new Date(now.getTime() - RUNNING_STALE_MS - 1).toISOString(), now)).toBe("error");
  });
  it("les autres statuts sont inchangés", () => {
    expect(displayScanStatus("done", new Date(0), now)).toBe("done");
    expect(displayScanStatus("error", new Date(0), now)).toBe("error");
  });
});
