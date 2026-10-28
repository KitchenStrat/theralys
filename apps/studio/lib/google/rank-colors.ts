/**
 * Couleurs de la carte de visibilité (Fiche Google) : une échelle continue de
 * la 1re à la 20e place — émeraude (pack local), orange (4 à 10), rouge puis
 * carmin (11 à 20) — et un gris neutre pour les emplacements où la fiche est
 * absente des 20 premiers. Fonctions pures, sans Leaflet (importables par la
 * légende rendue côté serveur).
 */

/** Paliers de l'échelle (rang → couleur), interpolés linéairement entre eux. */
export const RANK_COLOR_STOPS: readonly (readonly [number, string])[] = [
  [1, "#047857"],
  [3, "#16a34a"],
  [4, "#f97316"],
  [10, "#ea580c"],
  [11, "#dc2626"],
  [20, "#9f1239"],
];

/** Emplacements où la fiche n'apparaît pas dans les 20 premiers. */
export const RANK_NONE_COLOR = "#b8c7d3";

/** Dernier rang relevé par le fournisseur (profondeur des résultats Maps). */
export const RANK_MAX = 20;

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}

/** Couleur d'un rang (1 = émeraude … 20 = carmin) ; null ou hors plage = gris neutre. */
export function rankColor(rank: number | null): string {
  if (rank === null || !Number.isFinite(rank) || rank < 1) return RANK_NONE_COLOR;
  const clamped = Math.min(rank, RANK_MAX);
  for (let i = 1; i < RANK_COLOR_STOPS.length; i++) {
    const [fromRank, fromColor] = RANK_COLOR_STOPS[i - 1]!;
    const [toRank, toColor] = RANK_COLOR_STOPS[i]!;
    if (clamped <= toRank) {
      const t = toRank === fromRank ? 0 : (clamped - fromRank) / (toRank - fromRank);
      return mix(fromColor, toColor, Math.max(0, t));
    }
  }
  return RANK_COLOR_STOPS[RANK_COLOR_STOPS.length - 1]![1];
}

/** Dégradé CSS de la légende (1re place à gauche, 20e à droite). */
export function rankGradientCss(): string {
  const stops = RANK_COLOR_STOPS.map(([rank, color]) => `${color} ${Math.round(((rank - 1) / (RANK_MAX - 1)) * 100)}%`);
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** Rangs repérés sur la légende. */
export const RANK_LEGEND_TICKS: readonly number[] = [1, 3, 10, 20];

/** Libellé ordinal français d'un rang (1re, 2e…). */
export function rankOrdinal(rank: number): string {
  return `${rank}${rank === 1 ? "re" : "e"}`;
}
