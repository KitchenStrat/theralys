import type { GoogleAdsConversionKind, GoogleAdsConversionLabels } from "@theralys/shared";
import type { ClickedTarget } from "./track-client";

/**
 * Action de conversion Google Ads correspondant à un clic : bouton
 * « Prendre rendez-vous » (`data-track="rdv"`), numéro de téléphone (`tel:`)
 * ou adresse e-mail (`mailto:`). Une seule action par clic, dans cet ordre.
 */
export function conversionKindOf(target: ClickedTarget | null): GoogleAdsConversionKind | null {
  if (!target) return null;
  if (target.track === "rdv") return "rdv";
  const href = (target.href ?? "").trim().toLowerCase();
  if (href.startsWith("tel:")) return "call";
  if (href.startsWith("mailto:")) return "email";
  return null;
}

/** Valeur `send_to` de l'événement de conversion (`AW-…/<libellé>`) ; null si le libellé n'est pas renseigné. */
export function conversionSendTo(
  adsId: string,
  labels: GoogleAdsConversionLabels | null | undefined,
  kind: GoogleAdsConversionKind,
): string | null {
  const label = labels?.[kind]?.trim();
  return label ? `${adsId}/${label}` : null;
}
