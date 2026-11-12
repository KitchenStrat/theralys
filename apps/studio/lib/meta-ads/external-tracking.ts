/**
 * Pixel Meta quand les annonces mènent au site du client : relevé de la
 * dernière lecture du site, affiché à la place du formulaire du Pixel (qui
 * n'agit que sur le site Harmony). Mêmes règles et mêmes textes que les
 * points de préparation du bilan (`EXTERNAL_SITE_CHECK_DETAILS`). Module pur.
 */

import { EXTERNAL_SITE_CHECK_DETAILS } from "@theralys/shared";
import type { ExternalSiteTracking, TrackingFinding } from "../google-ads/external-tracking";

/** Où lire les résultats des annonces Meta : le Gestionnaire de publicités, seul à les connaître. */
export const META_RESULTS_ACCOUNT =
  "Les résultats de vos annonces (personnes touchées, clics, coût par résultat) se lisent dans le Gestionnaire de publicités de Meta : c'est lui qui fait foi.";

/**
 * Relevé Meta du site du client : le Pixel (repéré, ou à installer) et le
 * bandeau cookies — « inconnu » quand il n'a pas été repéré, la lecture ne
 * reconnaissant pas tous les bandeaux. Ce que le Pixel envoie réellement
 * n'est jamais affirmé : le texte renvoie au Gestionnaire d'événements.
 */
export function metaPixelFindings(tracking: ExternalSiteTracking): TrackingFinding[] {
  const texts = EXTERNAL_SITE_CHECK_DETAILS;
  return [
    {
      id: "pixel",
      label: "Pixel Meta installé sur le site",
      status: tracking.metaPixel ? "ok" : "todo",
      detail: tracking.metaPixel ? texts.pixelOk : texts.pixelTodo,
    },
    {
      id: "consent",
      label: "Bandeau cookies",
      status: tracking.consentBanner ? "ok" : "unknown",
      detail: tracking.consentBanner ? texts.cookieBannerOk : texts.cookieBannerUnknown,
    },
  ];
}
