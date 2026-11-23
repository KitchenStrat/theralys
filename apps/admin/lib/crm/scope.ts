/**
 * Portée des requêtes du CRM selon la personne connectée. La règle est
 * écrite ici une fois et portée par les requêtes SQL elles-mêmes : un
 * commercial ne lit et ne modifie que les fiches dont il est le
 * propriétaire, hors corbeille. Réservé au serveur.
 */

import { and, eq, inArray, type SQL } from "drizzle-orm";
import { crmActivities, crmContacts, type Database } from "@theralys/db";
import type { CrmViewer } from "./access";
import { NOT_TRASHED } from "./trash";

/**
 * Condition à ajouter à toute requête sur `crm_contacts` : rien pour l'admin
 * (il voit tout, corbeille comprise là où il la demande), `owner_id` égal au
 * commercial et fiche vivante pour un commercial.
 */
export function visibleTo(viewer: CrmViewer): SQL | undefined {
  if (viewer.role === "admin") return undefined;
  return and(eq(crmContacts.ownerId, viewer.id), NOT_TRASHED);
}

/** Une fiche précise, si la personne y a droit. */
export function contactVisibleTo(viewer: CrmViewer, contactId: string): SQL | undefined {
  return and(eq(crmContacts.id, contactId), visibleTo(viewer));
}

/**
 * Condition à ajouter à toute requête sur `crm_activities` désignée par son
 * identifiant : la ligne doit appartenir à une fiche que la personne voit.
 */
export function activityVisibleTo(db: Pick<Database, "select">, viewer: CrmViewer): SQL | undefined {
  if (viewer.role === "admin") return undefined;
  return inArray(crmActivities.contactId, db.select({ id: crmContacts.id }).from(crmContacts).where(visibleTo(viewer)));
}
