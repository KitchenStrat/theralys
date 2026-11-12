/**
 * Points de préparation du diagnostic Google Ads : où le praticien règle
 * chacun d'eux. Module pur.
 */

import type { GoogleAdsCheckId } from "@theralys/shared";

/**
 * `fiche` : section Fiche Google · `tab` : onglet Paramétrage & suivi ·
 * `editor` : éditeur du site Harmony · `site` : écran « Mon site » (site du
 * client : téléphone, lien de rendez-vous, nouvelle lecture du site).
 */
export type AdsCheckLink = "fiche" | "tab" | "editor" | "site";

/**
 * Où régler un point. Ce qui tient au site lui-même (rendez-vous, téléphone,
 * pages de spécialité) se corrige dans l'éditeur pour le site Harmony ; pour
 * un bilan établi sur le site du client (`externalSite`), l'éditeur n'agit
 * pas sur ce site : le lien mène à « Mon site ». La balise et les conversions
 * renvoient dans les deux cas à l'onglet Paramétrage & suivi, qui porte le
 * formulaire ou, pour le site du client, le pas-à-pas d'installation.
 */
export function adsCheckLink(id: GoogleAdsCheckId, externalSite: boolean): AdsCheckLink {
  switch (id) {
    case "profile_linked":
    case "profile_claimed":
    case "reviews":
    case "hours":
    case "photos":
      return "fiche";
    case "tracking_tag":
    case "tracking_conversions":
      return "tab";
    case "booking":
    case "phone":
    case "landing_pages":
      return externalSite ? "site" : "editor";
  }
}
