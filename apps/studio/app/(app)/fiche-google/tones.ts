import type { rankTone } from "@theralys/shared";

/**
 * Couleurs et libellés des pastilles de la carte par ton de rang (jetons du
 * thème `packages/ui/src/styles.css`). Module sans Leaflet : importable par
 * la légende rendue côté serveur (Leaflet touche `window`).
 */
export type RankTone = ReturnType<typeof rankTone>;

export const TONE_COLOR: Record<RankTone, string> = {
  top: "var(--color-success-500)",
  good: "var(--color-warning-500)",
  weak: "var(--color-danger-500)",
  none: "var(--color-ink-300)",
};

export const TONE_LABEL: Record<RankTone, string> = {
  top: "Top 3",
  good: "4 à 10",
  weak: "11 à 20",
  none: "Au-delà de 20",
};
