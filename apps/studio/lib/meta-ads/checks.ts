/**
 * Points de préparation du diagnostic Meta Ads : où le praticien règle chacun
 * d'eux. Module pur.
 */

import type { MetaAdsCheckId } from "@theralys/shared";

/**
 * `fiche` : section Fiche Google · `tab` : onglet Paramétrage et suivi ·
 * `editor` : éditeur du site Harmony · `site` : écran « Mon site » (site du
 * client : téléphone, lien de rendez-vous, réseaux, nouvelle lecture du site).
 */
export type MetaCheckLink = "fiche" | "tab" | "editor" | "site";

/**
 * Où régler un point. Ce qui tient au site lui-même (bandeau cookies, page
 * Facebook, Instagram, rendez-vous, téléphone, photos, pages de spécialité)
 * se corrige dans l'éditeur pour le site Harmony ; pour un bilan établi sur
 * le site du client (`externalSite`), l'éditeur n'agit pas sur ce site : le
 * lien mène à « Mon site ». Le Pixel renvoie dans les deux cas à l'onglet
 * Paramétrage et suivi, qui porte le formulaire ou, pour le site du client,
 * le pas-à-pas d'installation.
 */
export function metaCheckLink(id: MetaAdsCheckId, externalSite: boolean): MetaCheckLink {
  switch (id) {
    case "pixel":
      return "tab";
    case "reviews":
    case "profile_linked":
      return "fiche";
    case "cookie_banner":
    case "facebook_page":
    case "instagram":
    case "booking":
    case "phone":
    case "photos":
    case "landing_pages":
      return externalSite ? "site" : "editor";
  }
}
