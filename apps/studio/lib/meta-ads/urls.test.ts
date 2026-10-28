import { describe, expect, it } from "vitest";
import { metaCreativeApiBase, metaCreativeDownloadUrl, metaCreativePreviewUrl } from "./urls";

const ANALYSIS = "00000000-0000-0000-0000-000000000001";

describe("metaCreativePreviewUrl", () => {
  it("porte le format, preview=1 et la version encodée", () => {
    expect(metaCreativePreviewUrl(ANALYSIS, "c1", "square", "2026-10-27T10:00:00.000Z")).toBe(
      `/api/meta-ads/${ANALYSIS}/creatives/c1/render?size=square&preview=1&v=2026-10-27T10%3A00%3A00.000Z`,
    );
  });

  it("change avec la date de génération (régénération), pas avec les identifiants", () => {
    const before = metaCreativePreviewUrl(ANALYSIS, "c1", "story", "2026-10-27T10:00:00.000Z");
    const after = metaCreativePreviewUrl(ANALYSIS, "c1", "story", "2026-10-28T09:30:00.000Z");
    expect(before).not.toBe(after);
    expect(before.replace(/&v=[^&]*/, "")).toBe(after.replace(/&v=[^&]*/, ""));
  });

  it("encode les identifiants", () => {
    expect(metaCreativeApiBase("a b", "c/1")).toBe("/api/meta-ads/a%20b/creatives/c%2F1");
  });
});

describe("metaCreativeDownloadUrl", () => {
  it("visuel par format ou kit complet", () => {
    expect(metaCreativeDownloadUrl(ANALYSIS, "c2", { size: "portrait" })).toBe(`/api/meta-ads/${ANALYSIS}/creatives/c2/download?size=portrait`);
    expect(metaCreativeDownloadUrl(ANALYSIS, "c2", { kit: true })).toBe(`/api/meta-ads/${ANALYSIS}/creatives/c2/download?kit=1`);
  });
});
