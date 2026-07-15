/**
 * Tracking maison conforme CNIL/RGPD :
 * - le cookie visiteur n'est posé qu'après consentement explicite ;
 * - le choix (accepté OU refusé) est mémorisé 6 mois ;
 * - le cookie visiteur vit au maximum 13 mois (plafond CNIL) ;
 * - sans consentement, les événements sont enregistrés sans identifiant
 *   (les clics RDV restent comptés, les visiteurs uniques non).
 */

export const CONSENT_COOKIE = "tl_consent";
export const VISITOR_COOKIE = "tl_vid";

/** 6 mois — durée de mémorisation du choix recommandée par la CNIL */
export const CONSENT_MAX_AGE_S = 60 * 60 * 24 * 182;
/** 13 mois — durée de vie maximale d'un traceur de mesure d'audience */
export const VISITOR_MAX_AGE_S = 60 * 60 * 24 * 396;

export type ConsentValue = "granted" | "denied";

export function parseConsent(raw: string | undefined): ConsentValue | null {
  return raw === "granted" || raw === "denied" ? raw : null;
}
