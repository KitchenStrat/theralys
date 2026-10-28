import { describe, expect, it } from "vitest";
import { META_ADS_ANALYSIS_STALE_MINUTES } from "@theralys/jobs";
import { META_INTERRUPTED, META_RUNNING_STALE_MS, displayMetaStatus } from "./data";

const NOW = new Date("2026-10-27T10:00:00Z");

describe("displayMetaStatus", () => {
  it("le seuil de péremption est celui du service (META_ADS_ANALYSIS_STALE_MINUTES)", () => {
    expect(META_RUNNING_STALE_MS).toBe(META_ADS_ANALYSIS_STALE_MINUTES * 60_000);
  });

  it("done et error sont rendus tels quels", () => {
    expect(displayMetaStatus("done", NOW, NOW)).toEqual({ status: "done", error: null });
    expect(displayMetaStatus("error", "2026-10-01T00:00:00Z", NOW)).toEqual({ status: "error", error: null });
  });

  it("une analyse en cours récente reste en cours, jusqu'au seuil inclus", () => {
    expect(displayMetaStatus("running", new Date(NOW.getTime() - 60_000), NOW)).toEqual({ status: "running", error: null });
    expect(displayMetaStatus("running", new Date(NOW.getTime() - META_RUNNING_STALE_MS), NOW)).toEqual({ status: "running", error: null });
  });

  it("une analyse en cours trop ancienne (d'après updatedAt) est affichée comme interrompue", () => {
    expect(displayMetaStatus("running", new Date(NOW.getTime() - META_RUNNING_STALE_MS - 1), NOW)).toEqual({ status: "error", error: META_INTERRUPTED });
    expect(displayMetaStatus("running", "pas une date", NOW).status).toBe("error");
  });
});
