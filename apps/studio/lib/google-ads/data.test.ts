import { describe, expect, it } from "vitest";
import { ADS_INTERRUPTED, ADS_RUNNING_STALE_MS, displayAnalysisStatus } from "./data";

const NOW = new Date("2026-10-27T10:00:00Z");

describe("displayAnalysisStatus", () => {
  it("done et error sont rendus tels quels", () => {
    expect(displayAnalysisStatus("done", NOW, NOW)).toEqual({ status: "done", error: null });
    expect(displayAnalysisStatus("error", "2026-10-01T00:00:00Z", NOW)).toEqual({ status: "error", error: null });
  });

  it("une analyse en cours récente reste en cours", () => {
    expect(displayAnalysisStatus("running", new Date(NOW.getTime() - 60_000), NOW)).toEqual({ status: "running", error: null });
  });

  it("une analyse en cours trop ancienne est affichée comme interrompue", () => {
    expect(displayAnalysisStatus("running", new Date(NOW.getTime() - ADS_RUNNING_STALE_MS - 1), NOW)).toEqual({
      status: "error",
      error: ADS_INTERRUPTED,
    });
    expect(displayAnalysisStatus("running", "pas une date", NOW).status).toBe("error");
  });
});
