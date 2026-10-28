/**
 * Formulaire « Pixel Meta » (onglet Paramétrage & suivi) : identifiant
 * numérique du Pixel (jeu de données) stocké dans
 * `site.theme.tracking.metaPixelId`. Validation pure, partagée par le
 * formulaire (retour immédiat) et l'action serveur (source de vérité).
 */

import { TRACKING_ID_PATTERNS } from "@theralys/shared";

export type MetaTrackingForm = { metaPixelId: string };

export type MetaTrackingValue = {
  /** null = Pixel retiré */
  metaPixelId: string | null;
};

export type MetaTrackingValidation = { ok: true; value: MetaTrackingValue } | { ok: false; error: string };

/** Forme attendue de l'identifiant (même formulation dans l'aide du formulaire et le tuto). */
export const META_PIXEL_ID_SHAPE = "15 à 16 chiffres en général (10 à 20 acceptés)";
export const META_PIXEL_ID_ERROR = `Identifiant de Pixel invalide : un nombre de ${META_PIXEL_ID_SHAPE}, par exemple 1234567890123456.`;

/**
 * Identifiant collé depuis Meta : espaces retirés ; la forme
 * « fbq('init', '1234567890123456') » de l'extrait de code est acceptée (le
 * nombre entre guillemets est retenu). Tout autre texte (« AW-… », lettres)
 * est rendu tel quel et refusé par la validation.
 */
export function normalizePixelId(raw: string): string {
  const compact = raw.replace(/\s+/g, "");
  if (/^\d+$/.test(compact)) return compact;
  const match = /['"](\d{10,20})['"]/.exec(compact);
  return match ? match[1]! : compact;
}

/** Valide et normalise le formulaire ; vide = retiré. */
export function validateMetaTracking(input: unknown): MetaTrackingValidation {
  if (!input || typeof input !== "object") return { ok: false, error: "Requête invalide." };
  const raw = (input as Record<string, unknown>).metaPixelId;
  const metaPixelId = normalizePixelId(typeof raw === "string" ? raw : "");
  if (metaPixelId !== "" && !TRACKING_ID_PATTERNS.metaPixelId.test(metaPixelId)) return { ok: false, error: META_PIXEL_ID_ERROR };
  return { ok: true, value: { metaPixelId: metaPixelId || null } };
}

/** Valeurs initiales du formulaire depuis le suivi du site. */
export function metaTrackingForm(tracking: { metaPixelId?: string } | undefined): MetaTrackingForm {
  return { metaPixelId: tracking?.metaPixelId ?? "" };
}
