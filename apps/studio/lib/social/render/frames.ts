/**
 * Cadres des visuels réseaux sociaux (§4.1) : géométrie et tailles de texte
 * par format d'image. Le carré est la référence ; le portrait élargit les
 * marges ; la story réserve les zones masquées par l'interface d'Instagram
 * (`safeTop` / `safeBottom`).
 */

import type { SocialSize } from "@theralys/shared";

export type Frame = {
  w: number;
  h: number;
  /** Marge intérieure */
  pad: number;
  /** Taille de base du titre (px) */
  title: number;
  /** Taille du corps (px) */
  body: number;
  /** Taille des libellés (pastilles, marque) */
  label: number;
  /** Zone haute masquée (story) */
  safeTop: number;
  /** Zone basse masquée (story) */
  safeBottom: number;
};

export const FRAMES: Record<SocialSize, Frame> = {
  square: { w: 1080, h: 1080, pad: 80, title: 64, body: 34, label: 24, safeTop: 0, safeBottom: 0 },
  portrait: { w: 1080, h: 1350, pad: 88, title: 72, body: 36, label: 26, safeTop: 0, safeBottom: 0 },
  story: { w: 1080, h: 1920, pad: 96, title: 84, body: 40, label: 28, safeTop: 250, safeBottom: 320 },
  // Posts Google (4:3) : marges et corps du carré, titre un peu plus petit (moins de hauteur)
  landscape: { w: 1200, h: 900, pad: 80, title: 60, body: 32, label: 24, safeTop: 0, safeBottom: 0 },
};

/**
 * Taille du titre selon sa longueur : ≤ 32 caractères → taille du cadre ;
 * ≤ 56 → ×0,86 ; ≤ 80 → ×0,74 ; au-delà ×0,64.
 */
export function fitTitle(text: string, frame: Frame): number {
  const n = text.trim().length;
  const ratio = n <= 32 ? 1 : n <= 56 ? 0.86 : n <= 80 ? 0.74 : 0.64;
  return Math.round(frame.title * ratio);
}

/** Taille du corps : > 160 caractères → ×0,9. */
export function fitBody(text: string, frame: Frame): number {
  return text.trim().length > 160 ? Math.round(frame.body * 0.9) : frame.body;
}
