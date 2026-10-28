import { describe, expect, it } from "vitest";
import { RANK_COLOR_STOPS, RANK_NONE_COLOR, rankColor, rankGradientCss, rankOrdinal } from "./rank-colors";

describe("rankColor", () => {
  it("rend la couleur exacte des paliers", () => {
    for (const [rank, color] of RANK_COLOR_STOPS) expect(rankColor(rank)).toBe(color);
  });

  it("interpole entre deux paliers (2 = entre émeraude et vert)", () => {
    const between = rankColor(2);
    expect(between).not.toBe(rankColor(1));
    expect(between).not.toBe(rankColor(3));
    expect(between).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("gris neutre pour une fiche absente, un rang invalide ou nul", () => {
    expect(rankColor(null)).toBe(RANK_NONE_COLOR);
    expect(rankColor(0)).toBe(RANK_NONE_COLOR);
    expect(rankColor(Number.NaN)).toBe(RANK_NONE_COLOR);
  });

  it("au-delà de 20, la couleur reste celle du dernier palier", () => {
    expect(rankColor(35)).toBe(rankColor(20));
  });

  it("l'échelle est monotone : les rangs voisins ont des couleurs distinctes et le vert disparaît après le top 3", () => {
    const colors = Array.from({ length: 20 }, (_, i) => rankColor(i + 1));
    expect(new Set(colors).size).toBe(20);
    const [, g10] = [parseInt(colors[9]!.slice(1, 3), 16), parseInt(colors[9]!.slice(3, 5), 16)];
    const [, g1] = [parseInt(colors[0]!.slice(1, 3), 16), parseInt(colors[0]!.slice(3, 5), 16)];
    expect(g1).toBeGreaterThan(parseInt(colors[0]!.slice(1, 3), 16)); // 1re : dominante verte
    expect(parseInt(colors[19]!.slice(1, 3), 16)).toBeGreaterThan(g10); // 20e : dominante rouge
  });
});

describe("rankGradientCss", () => {
  it("place les paliers de 0 % (1re) à 100 % (20e)", () => {
    const css = rankGradientCss();
    expect(css.startsWith("linear-gradient(90deg, #047857 0%")).toBe(true);
    expect(css.endsWith("#9f1239 100%)")).toBe(true);
    expect(css).toContain("#16a34a 11%");
  });
});

describe("rankOrdinal", () => {
  it("1re puis 2e, 20e", () => {
    expect(rankOrdinal(1)).toBe("1re");
    expect(rankOrdinal(2)).toBe("2e");
    expect(rankOrdinal(20)).toBe("20e");
  });
});
