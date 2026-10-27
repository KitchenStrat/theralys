/**
 * Formulaire « Suivi des conversions » (onglet Paramétrage & suivi) :
 * identifiant Google Ads (AW-…) et libellés de conversion RDV / appel /
 * e-mail, stockés dans `site.theme.tracking`. Validation pure, partagée par
 * le formulaire (retour immédiat) et l'action serveur (source de vérité).
 */

import {
  GOOGLE_ADS_CONVERSION_KINDS,
  GOOGLE_ADS_CONVERSION_LABEL_PATTERN,
  TRACKING_ID_PATTERNS,
  type GoogleAdsConversionKind,
  type GoogleAdsConversionLabels,
} from "@theralys/shared";

export type AdsTrackingForm = Record<"googleAdsId" | GoogleAdsConversionKind, string>;

export type AdsTrackingValue = {
  /** null = balise retirée */
  googleAdsId: string | null;
  /** null = aucun libellé */
  labels: GoogleAdsConversionLabels | null;
};

export type AdsTrackingValidation = { ok: true; value: AdsTrackingValue } | { ok: false; error: string };

export const ADS_ID_ERROR = "Identifiant Google Ads invalide. Exemple : AW-1234567890.";
export const ADS_LABEL_ERROR = "Libellé de conversion invalide : copiez la partie après « AW-…/ » dans l'extrait d'événement (lettres, chiffres, tirets).";
export const ADS_LABELS_WITHOUT_ID_ERROR = "Renseignez d'abord votre identifiant AW-… pour utiliser les libellés de conversion.";

/** « AW-123 » accepté en minuscules ; espaces retirés. */
export function normalizeAdsId(raw: string): string {
  const clean = raw.replace(/\s+/g, "").trim();
  return clean.toLowerCase().startsWith("aw-") ? `AW-${clean.slice(3)}` : clean;
}

/**
 * Libellé collé depuis Google Ads : accepte aussi la forme complète
 * « AW-1234567890/AbCdEf… » (l'identifiant est retiré) et les espaces.
 */
export function normalizeConversionLabel(raw: string): string {
  const clean = raw.replace(/\s+/g, "").trim();
  const slash = clean.lastIndexOf("/");
  return slash >= 0 ? clean.slice(slash + 1) : clean;
}

function field(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === "string" ? value : "";
}

/** Valide et normalise le formulaire ; vide = retiré. */
export function validateAdsTracking(input: unknown): AdsTrackingValidation {
  if (!input || typeof input !== "object") return { ok: false, error: "Requête invalide." };
  const record = input as Record<string, unknown>;
  const googleAdsId = normalizeAdsId(field(record, "googleAdsId"));
  if (googleAdsId !== "" && !TRACKING_ID_PATTERNS.googleAdsId.test(googleAdsId)) return { ok: false, error: ADS_ID_ERROR };
  const labels: GoogleAdsConversionLabels = {};
  for (const kind of GOOGLE_ADS_CONVERSION_KINDS) {
    const label = normalizeConversionLabel(field(record, kind.id));
    if (label === "") continue;
    if (!GOOGLE_ADS_CONVERSION_LABEL_PATTERN.test(label)) return { ok: false, error: `${kind.label} — ${ADS_LABEL_ERROR}` };
    labels[kind.id] = label;
  }
  const hasLabels = Object.keys(labels).length > 0;
  if (hasLabels && googleAdsId === "") return { ok: false, error: ADS_LABELS_WITHOUT_ID_ERROR };
  return { ok: true, value: { googleAdsId: googleAdsId || null, labels: hasLabels ? labels : null } };
}

/** Valeurs initiales du formulaire depuis le suivi du site. */
export function adsTrackingForm(tracking: { googleAdsId?: string; googleAdsConversions?: GoogleAdsConversionLabels } | undefined): AdsTrackingForm {
  const labels = tracking?.googleAdsConversions ?? {};
  return {
    googleAdsId: tracking?.googleAdsId ?? "",
    rdv: labels.rdv ?? "",
    call: labels.call ?? "",
    email: labels.email ?? "",
  };
}
