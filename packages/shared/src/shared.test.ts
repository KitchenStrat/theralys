import { describe, expect, it } from "vitest";
import { signPreviewToken, verifyPreviewToken } from "./preview-token";
import { readingTimeMinutes, relativeTimeFr } from "./dates";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("retire les accents et normalise", () => {
    expect(slugify("Réflexologie plantaire à Albi")).toBe("reflexologie-plantaire-a-albi");
    expect(slugify("L'arrêt du tabac — ça marche ?")).toBe("l-arret-du-tabac-ca-marche");
    expect(slugify("  Massage Ayurvédique  ")).toBe("massage-ayurvedique");
  });

  it("uniqueSlug suffixe en cas de collision", () => {
    const existing = new Set(["sophrologue-albi", "sophrologue-albi-2"]);
    expect(uniqueSlug("Sophrologue Albi", (s) => existing.has(s))).toBe("sophrologue-albi-3");
    expect(uniqueSlug("Naturopathe Pau", (s) => existing.has(s))).toBe("naturopathe-pau");
  });
});

describe("preview token", () => {
  const secret = "test-secret-for-preview-tokens";

  it("signe et vérifie un token valide", async () => {
    const token = await signPreviewToken({ articleId: "a1", siteId: "s1" }, secret);
    const payload = await verifyPreviewToken(token, secret);
    expect(payload).toEqual({ articleId: "a1", siteId: "s1" });
  });

  it("rejette un token expiré", async () => {
    const token = await signPreviewToken({ articleId: "a1", siteId: "s1" }, secret, -60);
    expect(await verifyPreviewToken(token, secret)).toBeNull();
  });

  it("rejette un token signé avec un autre secret", async () => {
    const token = await signPreviewToken({ articleId: "a1", siteId: "s1" }, "autre-secret");
    expect(await verifyPreviewToken(token, secret)).toBeNull();
  });

  it("rejette un token altéré", async () => {
    const token = await signPreviewToken({ articleId: "a1", siteId: "s1" }, secret);
    expect(await verifyPreviewToken(token.slice(0, -4) + "AAAA", secret)).toBeNull();
  });
});

describe("dates", () => {
  it("relativeTimeFr", () => {
    const now = new Date("2026-07-15T12:00:00Z");
    expect(relativeTimeFr(new Date("2026-07-15T11:59:40Z"), now)).toBe("à l'instant");
    expect(relativeTimeFr(new Date("2026-07-15T11:30:00Z"), now)).toContain("30");
    expect(relativeTimeFr(new Date("2026-07-12T12:00:00Z"), now)).toContain("3");
  });

  it("readingTimeMinutes : 200 mots/min, minimum 1", () => {
    expect(readingTimeMinutes("court texte")).toBe(1);
    expect(readingTimeMinutes(Array(800).fill("mot").join(" "))).toBe(4);
  });
});
