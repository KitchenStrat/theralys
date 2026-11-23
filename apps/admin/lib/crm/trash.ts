/**
 * Corbeille du CRM. Supprimer une fiche ne l'efface pas : elle quitte le
 * pipeline, la liste, les compteurs et les exports, et se retrouve dans la
 * corbeille d'où elle se restaure telle quelle, historique compris. Seule la
 * corbeille efface pour de bon. Réservé au serveur.
 *
 * Une fiche supprimée garde son étape d'origine derrière le préfixe
 * `trash:` (colonne `stage`, texte libre) : aucune colonne à ajouter, et la
 * restauration la remet exactement où elle était.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { crmActivities, crmContacts, leads, type CrmContact, type Database } from "@theralys/db";
import { TRASH_PREFIX } from "./model";

type Executor = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;

/** Fiches vivantes : la condition que portent toutes les lectures du CRM hors corbeille. */
export const NOT_TRASHED = sql`${crmContacts.stage} not like ${`${TRASH_PREFIX}%`}`;
export const IN_TRASH = sql`${crmContacts.stage} like ${`${TRASH_PREFIX}%`}`;

/** Met des fiches à la corbeille, au nom de `authorId`. Renvoie le nombre de fiches déplacées (celles qui y sont déjà ne comptent pas). */
export async function trashContacts(db: Executor, ids: string[], authorId: string, now = new Date()): Promise<number> {
  if (ids.length === 0) return 0;
  const moved = await db
    .update(crmContacts)
    .set({ stage: sql`${TRASH_PREFIX} || ${crmContacts.stage}`, updatedAt: now })
    .where(and(inArray(crmContacts.id, ids), NOT_TRASHED))
    .returning({ id: crmContacts.id });
  if (moved.length > 0) await db.insert(crmActivities).values(moved.map((row) => ({ contactId: row.id, kind: "system", body: "Mise à la corbeille", authorId, createdAt: now })));
  return moved.length;
}

/** Sort des fiches de la corbeille : elles retrouvent leur étape d'avant. */
export async function restoreContacts(db: Executor, ids: string[], authorId: string, now = new Date()): Promise<number> {
  if (ids.length === 0) return 0;
  const restored = await db
    .update(crmContacts)
    .set({ stage: sql`substr(${crmContacts.stage}, ${TRASH_PREFIX.length + 1}::int)`, updatedAt: now })
    .where(and(inArray(crmContacts.id, ids), IN_TRASH))
    .returning({ id: crmContacts.id });
  if (restored.length > 0) await db.insert(crmActivities).values(restored.map((row) => ({ contactId: row.id, kind: "system", body: "Restaurée depuis la corbeille", authorId, createdAt: now })));
  return restored.length;
}

/**
 * Efface pour de bon des fiches de la corbeille (toutes si `ids` est omis),
 * avec leur historique. La demande d'origine (table `leads`) part avec la
 * fiche : sinon elle serait reprise dans le CRM à la prochaine visite.
 */
export async function purgeContacts(db: Executor, ids?: string[]): Promise<number> {
  if (ids && ids.length === 0) return 0;
  const removed = await db
    .delete(crmContacts)
    .where(ids ? and(inArray(crmContacts.id, ids), IN_TRASH) : IN_TRASH)
    .returning({ id: crmContacts.id, leadId: crmContacts.leadId });
  const leadIds = removed.map((row) => row.leadId).filter((id): id is string => Boolean(id));
  for (let start = 0; start < leadIds.length; start += 500) await db.delete(leads).where(inArray(leads.id, leadIds.slice(start, start + 500)));
  return removed.length;
}

export type TrashRow = Pick<CrmContact, "id" | "firstName" | "lastName" | "company" | "profession" | "city" | "email" | "phone" | "source" | "stage" | "updatedAt">;

export const TRASH_LIMIT = 500;

/** Contenu de la corbeille, la suppression la plus récente d'abord. */
export async function listTrash(db: Database): Promise<{ rows: TrashRow[]; total: number }> {
  const [rows, count] = await Promise.all([
    db
      .select({
        id: crmContacts.id,
        firstName: crmContacts.firstName,
        lastName: crmContacts.lastName,
        company: crmContacts.company,
        profession: crmContacts.profession,
        city: crmContacts.city,
        email: crmContacts.email,
        phone: crmContacts.phone,
        source: crmContacts.source,
        stage: crmContacts.stage,
        updatedAt: crmContacts.updatedAt,
      })
      .from(crmContacts)
      .where(IN_TRASH)
      .orderBy(desc(crmContacts.updatedAt), desc(crmContacts.id))
      .limit(TRASH_LIMIT),
    trashCount(db),
  ]);
  return { rows, total: count };
}

export async function trashCount(db: Database): Promise<number> {
  const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(crmContacts).where(IN_TRASH);
  return row?.total ?? 0;
}

/** Identifiant de la fiche si elle est à la corbeille. */
export async function isInTrash(db: Database, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(and(eq(crmContacts.id, id), IN_TRASH))
    .limit(1);
  return Boolean(row);
}
