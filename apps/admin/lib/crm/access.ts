/**
 * Droits dans le CRM. L'admin y fait tout. Un commercial y travaille ses
 * propres prospects (ceux dont il est le propriétaire) : il les crée, les
 * modifie, les fait avancer, les étiquette et tient leur historique. Il ne
 * supprime rien, n'importe ni n'exporte, ne voit pas la corbeille, ne gère
 * pas les listes et n'attribue aucune fiche. Module sans dépendance serveur :
 * les écrans s'en servent pour ne proposer que ce qui est permis, les
 * actions pour le refuser (la portée des requêtes, elle, est dans `scope.ts`).
 */

import type { StaffRole } from "@/lib/staff";

/** La personne qui lit ou écrit dans le CRM, telle que la donne sa session. */
export type CrmViewer = { id: string; role: StaffRole };

/** Ce qui est réservé à l'admin. */
export const ADMIN_ONLY = ["delete", "trash", "import", "export", "lists", "assign", "demo", "team"] as const;
export type AdminOnly = (typeof ADMIN_ONLY)[number];

export function can(role: StaffRole, capability: AdminOnly): boolean {
  return role === "admin" && ADMIN_ONLY.includes(capability);
}

/** Actions groupées de la liste : étape, étiquettes et opposition pour tous ; suppression et attribution pour l'admin. */
export const BULK_ACTIONS = ["stage", "tag", "untag", "dnc", "allow", "delete", "assign"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

const ADMIN_BULK: Partial<Record<BulkAction, AdminOnly>> = { delete: "delete", assign: "assign" };

export function bulkActionAllowed(role: StaffRole, action: BulkAction): boolean {
  const reserved = ADMIN_BULK[action];
  return reserved ? can(role, reserved) : true;
}

/**
 * Propriétaire d'une fiche à sa création : un commercial crée pour lui-même,
 * quoi que dise le formulaire ; l'admin choisit (ou laisse non attribué).
 */
export function ownerOnCreate(viewer: CrmViewer, requested: string | null | undefined): string | null {
  return viewer.role === "sales" ? viewer.id : (requested ?? null);
}

/** Message rendu à un commercial quand le prospect qu'il saisit existe déjà chez quelqu'un d'autre : ni nom ni identifiant. */
export const FOREIGN_DUPLICATE_MESSAGE = "Ce prospect est déjà dans le CRM — voyez avec votre responsable.";

/**
 * Doublons à la création, vus par la personne qui saisit. Pour un
 * commercial, un doublon qui n'est pas à lui bloque la création sans rien
 * révéler de la fiche ; un doublon à lui (ou n'importe lequel pour l'admin)
 * est signalé par son nom, et peut être passé outre.
 */
export function duplicateVerdict<T extends { ownerId: string | null }>(viewer: CrmViewer, matches: T[], force: boolean): { kind: "none" } | { kind: "foreign" } | { kind: "own"; match: T } {
  if (viewer.role === "sales" && matches.some((match) => match.ownerId !== viewer.id)) return { kind: "foreign" };
  const [first] = matches;
  return first && !force ? { kind: "own", match: first } : { kind: "none" };
}
