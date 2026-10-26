/**
 * Mots-clés suivis sur la carte de visibilité : normalisation de la saisie
 * (fonction pure, testée) et quota de mots-clés actifs par site.
 */

import { GOOGLE_GRID_RADII, GOOGLE_KEYWORDS_MAX, type GoogleGridRadius } from "@theralys/shared";

export const KEYWORD_MIN = 3;
export const KEYWORD_MAX = 60;

export type KeywordNormalization = { ok: true; keyword: string } | { ok: false; error: string };

/**
 * Mot-clé normalisé : minuscules, espaces simples, 3 à 60 caractères, lettres
 * (accents compris), chiffres, espaces, apostrophes et tirets seulement.
 */
export function normalizeKeyword(raw: unknown): KeywordNormalization {
  if (typeof raw !== "string") return { ok: false, error: "Saisissez un mot-clé." };
  const keyword = raw.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  if (keyword.length < KEYWORD_MIN) return { ok: false, error: `Un mot-clé compte au moins ${KEYWORD_MIN} caractères.` };
  if (keyword.length > KEYWORD_MAX) return { ok: false, error: `Un mot-clé compte au plus ${KEYWORD_MAX} caractères.` };
  if (!/^[\p{L}\p{N}' -]+$/u.test(keyword)) {
    return { ok: false, error: "Un mot-clé ne contient que des lettres, des chiffres, des espaces, des apostrophes et des tirets." };
  }
  return { ok: true, keyword };
}

export function isGridRadius(value: unknown): value is GoogleGridRadius {
  return typeof value === "string" && GOOGLE_GRID_RADII.some((r) => r.id === value);
}

/** Libellé du rayon (« Ville (5 km) »). */
export function radiusLabel(id: string): string {
  const radius = GOOGLE_GRID_RADII.find((r) => r.id === id);
  return radius ? `${radius.label} (${radius.km} km)` : id;
}

/** Peut-on ajouter un mot-clé actif ? (quota GOOGLE_KEYWORDS_MAX) */
export function canAddKeyword(activeCount: number): boolean {
  return activeCount < GOOGLE_KEYWORDS_MAX;
}
