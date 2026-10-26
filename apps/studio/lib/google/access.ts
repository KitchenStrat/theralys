import { hasGoogleProfile, type PlanId } from "@theralys/db";

/**
 * Accès à la section « Fiche Google » : les démos présentent l'offre complète,
 * les clients suivent leur formule (Scale). Vérifié par la page, par chaque
 * server action et par les routes de rendu/téléchargement des posts.
 */
export function googleAccess(site: { type: string; plan: PlanId }): boolean {
  return site.type === "demo" || hasGoogleProfile(site.plan);
}
