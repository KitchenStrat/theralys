/**
 * Suivi Search Console (« N personnes ont vu votre cabinet sur Google »).
 * La connexion réelle au compte Google du praticien n'est pas encore ouverte :
 * il n'existe aujourd'hui qu'un mode simulé, fait pour la démonstration.
 * Règle : des chiffres simulés ne sont jamais montrés à un vrai client.
 */

/** Adresse du compte fictif créé par la connexion simulée. */
export const SIMULATED_GOOGLE_EMAIL = "compte.google@exemple.fr";

/** Le suivi Search Console est-il proposé pour ce site ? Démonstrations seulement, tant qu'il est simulé. */
export function searchConsoleAvailable(site: { type: "demo" | "client" }): boolean {
  return site.type === "demo";
}
