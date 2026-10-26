import { describe, expect, it } from "vitest";
import { canAddKeyword, isGridRadius, normalizeKeyword, radiusLabel, type KeywordNormalization } from "./keywords";

const error = (result: KeywordNormalization) => (result.ok ? "" : result.error);

describe("normalizeKeyword", () => {
  it("minuscules, espaces simples, accents conservés", () => {
    expect(normalizeKeyword("  Sophrologue   ALBI ")).toEqual({ ok: true, keyword: "sophrologue albi" });
    expect(normalizeKeyword("Gestion\tdu\n stress  Albi")).toEqual({ ok: true, keyword: "gestion du stress albi" });
    expect(normalizeKeyword("Réflexologie plantaire")).toEqual({ ok: true, keyword: "réflexologie plantaire" });
    expect(normalizeKeyword("l'hypnose à Albi")).toEqual({ ok: true, keyword: "l'hypnose à albi" });
  });

  it("bornes de longueur après normalisation", () => {
    expect(error(normalizeKeyword("ab"))).toMatch(/au moins 3/);
    expect(error(normalizeKeyword("   ab   "))).toMatch(/au moins 3/);
    expect(error(normalizeKeyword("a".repeat(61)))).toMatch(/au plus 60/);
    expect(normalizeKeyword("a".repeat(60))).toEqual({ ok: true, keyword: "a".repeat(60) });
  });

  it("caractères refusés et saisies non textuelles", () => {
    expect(normalizeKeyword("sophrologue <script>").ok).toBe(false);
    expect(normalizeKeyword("stress & sommeil").ok).toBe(false);
    expect(normalizeKeyword(42).ok).toBe(false);
    expect(normalizeKeyword(undefined).ok).toBe(false);
  });
});

describe("rayons et quota", () => {
  it("rayons connus", () => {
    expect(isGridRadius("ville")).toBe(true);
    expect(isGridRadius("quartier")).toBe(true);
    expect(isGridRadius("agglomeration")).toBe(true);
    expect(isGridRadius("pays")).toBe(false);
    expect(isGridRadius(null)).toBe(false);
    expect(radiusLabel("ville")).toBe("Ville (5 km)");
  });

  it("3 mots-clés actifs au plus", () => {
    expect(canAddKeyword(0)).toBe(true);
    expect(canAddKeyword(2)).toBe(true);
    expect(canAddKeyword(3)).toBe(false);
  });
});
