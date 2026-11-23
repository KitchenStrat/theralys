/**
 * Qui entre dans le back-office, et où. Deux rôles : l'admin (tout), le
 * commercial (le CRM, pour ses propres prospects). Module sans dépendance :
 * il sert au garde d'entrée (`middleware.ts`, exécuté hors Node), à
 * l'authentification et aux écrans.
 */

export const STAFF_ROLES = ["admin", "sales"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

/** Page d'arrivée après la connexion. */
export function homeFor(role: StaffRole): string {
  return role === "admin" ? "/" : "/crm";
}

/** Chemins ouverts sans session : connexion, choix du mot de passe d'un commercial, fin d'une session coupée. */
export const PUBLIC_PATHS: readonly string[] = ["/login", "/invitation", "/deconnexion"];

const CONTACT_PATH = /^\/crm\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un commercial n'ouvre que le CRM et ses fiches. Refus par défaut : tout
 * autre chemin (corbeille et export du CRM compris) lui est fermé, y compris
 * ceux qui seront ajoutés plus tard sans être inscrits ici.
 */
export function salesMayOpen(pathname: string): boolean {
  return pathname === "/crm" || CONTACT_PATH.test(pathname);
}

/** Où envoyer une requête selon le rôle porté par le jeton : laisser passer, vers le CRM, ou vers la connexion. */
export function routeFor(role: unknown, pathname: string): "pass" | "crm" | "login" {
  if (role === "admin") return "pass";
  if (role === "sales") return salesMayOpen(pathname) ? "pass" : "crm";
  return "login";
}
