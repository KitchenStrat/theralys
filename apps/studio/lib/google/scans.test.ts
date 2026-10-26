import { describe, expect, it } from "vitest";
import { GOOGLE_MANUAL_SCANS_PER_MONTH } from "@theralys/shared";
import { computeScanUsage, usageMonthBounds, type ScanUsageRow } from "./scans";

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
