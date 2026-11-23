/**
 * Écritures du CRM partagées entre ses actions et le reste de l'admin
 * (création d'une démo, conversion en client). Réservé au serveur.
 */

import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { crmActivities, crmContacts, crmImports, type CrmContact, type Database } from "@theralys/db";
import { isMissingTableError } from "@/lib/api-usage";
import { isMissingColumnError } from "@/lib/pg-errors";
import type { CrmViewer } from "./access";
import { STAGE_META, isContactKind, isCrmStage, isTrashed, type ContactDraft, type CrmStage } from "./model";
import { cleanText, dedupeKeys, fold, normalizeTags } from "./normalize";
import { contactVisibleTo, visibleTo } from "./scope";
import { NOT_TRASHED } from "./trash";

type Executor = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;

export type ActivityRow = { contactId: string; kind: string; body: string; authorId: string; createdAt: Date; dueAt?: Date };

/**
 * Inscrit des lignes d'historique, avec leur auteur (la personne de la
 * session, admin compris). Drizzle nomme toutes les colonnes du schéma dans
 * son INSERT : tant que la migration 0012 n'est pas appliquée, `author_id`
 * manque (42703) et la ligne entière échouerait. Hors du CRM, la création
 * d'une démo et la conversion en client écrivent ici : entre le déploiement
 * et la migration, elles continuent en SQL explicite, sans auteur. (Repli
 * sans objet dans une transaction : l'échec du premier INSERT l'interrompt.)
 */
export async function insertActivities(db: Executor, rows: ActivityRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    await db.insert(crmActivities).values(rows);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    for (const row of rows) {
      await db.execute(sql`insert into crm_activities (contact_id, kind, body, due_at, created_at) values (${row.contactId}, ${row.kind}, ${row.body}, ${row.dueAt ?? null}, ${row.createdAt})`);
    }
  }
}

/**
 * Change l'étape de prospects et l'inscrit dans leur historique, au nom de
 * la personne connectée. Seules les fiches qu'elle a le droit de voir sont
 * touchées (portée dans la lecture comme dans l'écriture) ; celles déjà à
 * cette étape ne bougent pas. Renvoie le nombre de fiches modifiées.
 */
export async function changeStage(db: Executor, viewer: CrmViewer, ids: string[], stage: CrmStage, options: { lostReason?: string; note?: string; now?: Date } = {}): Promise<number> {
  if (ids.length === 0) return 0;
  const now = options.now ?? new Date();
  const scope = visibleTo(viewer);
  const current = await db
    .select({ id: crmContacts.id, stage: crmContacts.stage })
    .from(crmContacts)
    .where(and(inArray(crmContacts.id, ids), scope));
  // Une fiche à la corbeille ne change pas d'étape : elle garde celle qu'elle retrouvera à sa restauration
  const moving = current.filter((row) => row.stage !== stage && !isTrashed(row.stage));
  if (moving.length === 0) return 0;
  const reason = stage === "lost" ? cleanText(options.lostReason, 200) : "";
  await db
    .update(crmContacts)
    .set({ stage, stageChangedAt: now, updatedAt: now, lostReason: stage === "lost" ? reason || null : null })
    .where(
      and(
        inArray(
          crmContacts.id,
          moving.map((row) => row.id),
        ),
        scope,
      ),
    );
  await insertActivities(
    db,
    moving.map((row) => ({
      contactId: row.id,
      kind: "stage",
      body: `${isCrmStage(row.stage) ? STAGE_META[row.stage].label : row.stage} → ${STAGE_META[stage].label}${reason ? ` — ${reason}` : ""}${options.note ? ` (${options.note})` : ""}`,
      authorId: viewer.id,
      createdAt: now,
    })),
  );
  return moving.length;
}

/**
 * Inscrit une activité sur une fiche, au nom de la personne connectée (la
 * fiche a été lue dans sa portée par l'appelant). Un appel, un e-mail ou un
 * rendez-vous date le dernier contact, et fait passer un prospect « à
 * contacter » à « contacté ».
 */
export async function recordActivity(db: Executor, viewer: CrmViewer, contact: Pick<CrmContact, "id" | "stage">, kind: string, body: string, now = new Date()): Promise<void> {
  await insertActivities(db, [{ contactId: contact.id, kind, body, authorId: viewer.id, createdAt: now }]);
  const own = contactVisibleTo(viewer, contact.id);
  if (isContactKind(kind)) {
    await db.update(crmContacts).set({ lastContactAt: now, updatedAt: now }).where(own);
    if (contact.stage === "new") await changeStage(db, viewer, [contact.id], "contacted", { now: new Date(now.getTime() + 1) });
  } else {
    await db.update(crmContacts).set({ updatedAt: now }).where(own);
  }
}

// ─── Attribution ─────────────────────────────────────────────────────────────

type Owner = { id: string; name: string };

const assignmentNote = (owner: Owner | null) => (owner ? `Attribué à ${cleanText(owner.name, 120)}` : "Attribution retirée");

/**
 * Attribue des fiches à un commercial (ou à personne) et l'inscrit dans leur
 * historique. Réservé à l'admin. Les fiches déjà à ce propriétaire ne bougent
 * pas ; la date de modification de la fiche n'est pas touchée (l'attribution
 * n'est pas une modification du prospect). Renvoie le nombre de fiches
 * réattribuées.
 */
export async function assignContacts(db: Executor, viewer: CrmViewer, ids: string[], owner: Owner | null, now = new Date()): Promise<number> {
  if (viewer.role !== "admin" || ids.length === 0) return 0;
  const moved = await db
    .update(crmContacts)
    .set({ ownerId: owner?.id ?? null })
    .where(and(inArray(crmContacts.id, ids), owner ? sql`${crmContacts.ownerId} is distinct from ${owner.id}` : isNotNull(crmContacts.ownerId)))
    .returning({ id: crmContacts.id });
  await insertActivities(
    db,
    moved.map((row) => ({ contactId: row.id, kind: "system", body: assignmentNote(owner), authorId: viewer.id, createdAt: now })),
  );
  return moved.length;
}

/**
 * Réattribue tous les prospects d'un commercial à un autre (ou à personne),
 * corbeille comprise : une fiche restaurée plus tard ne revient pas à
 * l'ancien propriétaire. Réservé à l'admin. Renvoie le nombre de fiches.
 */
export async function reassignOwned(db: Executor, viewer: CrmViewer, fromId: string, owner: Owner | null, now = new Date()): Promise<number> {
  if (viewer.role !== "admin" || owner?.id === fromId) return 0;
  const moved = await db
    .update(crmContacts)
    .set({ ownerId: owner?.id ?? null })
    .where(eq(crmContacts.ownerId, fromId))
    .returning({ id: crmContacts.id });
  for (let start = 0; start < moved.length; start += 1000) {
    await insertActivities(
      db,
      moved.slice(start, start + 1000).map((row) => ({ contactId: row.id, kind: "system", body: assignmentNote(owner), authorId: viewer.id, createdAt: now })),
    );
  }
  return moved.length;
}

// ─── Doublons ────────────────────────────────────────────────────────────────

export type ExistingMatch = Pick<CrmContact, "id" | "firstName" | "lastName" | "company" | "profession" | "email" | "phone" | "website" | "address" | "postalCode" | "city" | "notes" | "tags" | "extra" | "ownerId">;

const MATCH_COLUMNS = {
  id: crmContacts.id,
  firstName: crmContacts.firstName,
  lastName: crmContacts.lastName,
  company: crmContacts.company,
  profession: crmContacts.profession,
  email: crmContacts.email,
  phone: crmContacts.phone,
  website: crmContacts.website,
  address: crmContacts.address,
  postalCode: crmContacts.postalCode,
  city: crmContacts.city,
  notes: crmContacts.notes,
  tags: crmContacts.tags,
  extra: crmContacts.extra,
  ownerId: crmContacts.ownerId,
};

type DedupeDraft = Pick<ContactDraft, "firstName" | "lastName" | "company" | "city" | "email" | "phone">;

/**
 * Toutes les fiches qui correspondent à un brouillon, quel qu'en soit le
 * propriétaire : le dédoublonnage porte sur le CRM entier, pas sur la portée
 * de la personne qui saisit (deux commerciaux ne démarchent pas le même
 * prospect). L'appelant décide ensuite de ce qu'il en montre (`duplicateVerdict`).
 */
export async function findDuplicates(db: Executor, draft: DedupeDraft): Promise<ExistingMatch[]> {
  const keys = new Set(dedupeKeys(draft));
  const rows = await candidateRows(db, [draft]);
  return rows.filter((row) => dedupeKeys(row).some((key) => keys.has(key)));
}

/**
 * Prospects déjà présents qui correspondent à des brouillons : même e-mail,
 * même téléphone, ou même nom dans la même ville. Renvoie, par clé de
 * doublon, la fiche existante. Les fiches à la corbeille ne comptent pas.
 */
export async function findExisting(db: Executor, drafts: DedupeDraft[]): Promise<Map<string, ExistingMatch>> {
  const found = new Map<string, ExistingMatch>();
  for (const row of await candidateRows(db, drafts)) {
    for (const key of dedupeKeys(row)) if (!found.has(key)) found.set(key, row);
  }
  return found;
}

/** Fiches vivantes qui partagent un e-mail, un téléphone ou une ville (sans e-mail ni téléphone) avec des brouillons. */
async function candidateRows(db: Executor, drafts: DedupeDraft[]): Promise<ExistingMatch[]> {
  const emails = [...new Set(drafts.map((draft) => draft.email).filter(Boolean))];
  const phones = [...new Set(drafts.map((draft) => draft.phone).filter(Boolean))];
  // Le nom dans la ville ne sert qu'aux brouillons sans e-mail ni téléphone
  const cities = [...new Set(drafts.filter((draft) => !draft.email && !draft.phone && draft.city).map((draft) => draft.city.toLowerCase()))];
  const conditions = [
    emails.length > 0 ? inArray(crmContacts.email, emails) : undefined,
    phones.length > 0 ? inArray(crmContacts.phone, phones) : undefined,
    cities.length > 0 ? and(inArray(sql`lower(${crmContacts.city})`, cities), isNull(crmContacts.email), isNull(crmContacts.phone)) : undefined,
  ].filter((condition) => condition !== undefined);
  if (conditions.length === 0) return [];
  return db
    .select(MATCH_COLUMNS)
    .from(crmContacts)
    .where(and(NOT_TRASHED, or(...conditions)))
    .limit(5000);
}

/** Champs d'une fiche existante que complète un brouillon : seuls les champs vides sont remplis, les étiquettes s'ajoutent. */
export function mergeIntoExisting(existing: ExistingMatch, draft: ContactDraft, extraTags: string[]): Partial<typeof crmContacts.$inferInsert> | null {
  const patch: Partial<typeof crmContacts.$inferInsert> = {};
  for (const field of ["firstName", "lastName", "company", "profession", "city"] as const) {
    if (!existing[field] && draft[field]) patch[field] = draft[field];
  }
  for (const field of ["email", "phone", "website", "address", "postalCode", "notes"] as const) {
    if (!existing[field] && draft[field]) patch[field] = draft[field];
  }
  const tags = normalizeTags([...existing.tags, ...draft.tags, ...extraTags]);
  if (tags.length !== existing.tags.length || tags.some((tag, index) => fold(tag) !== fold(existing.tags[index] ?? ""))) patch.tags = tags;
  const extra = { ...draft.extra, ...existing.extra };
  if (Object.keys(extra).length !== Object.keys(existing.extra).length) patch.extra = Object.fromEntries(Object.entries(extra).slice(0, 20));
  return Object.keys(patch).length > 0 ? patch : null;
}

// ─── Liens avec les démos et les clients ─────────────────────────────────────

/**
 * Une démo vient d'être créée pour une fiche du CRM : la fiche est reliée au
 * prospect et au site, passe à « démo envoyée » si elle n'y était pas encore
 * arrivée, et l'historique le note. Sans effet (et sans erreur) tant que la
 * migration du CRM n'est pas appliquée.
 */
export async function linkContactToDemo(db: Database, viewer: CrmViewer, contactId: string, demo: { prospectId: string; siteId: string; siteName: string }): Promise<void> {
  try {
    const [contact] = await db.select({ id: crmContacts.id, stage: crmContacts.stage }).from(crmContacts).where(eq(crmContacts.id, contactId)).limit(1);
    if (!contact) return;
    const now = new Date();
    await db.update(crmContacts).set({ prospectId: demo.prospectId, siteId: demo.siteId, updatedAt: now }).where(eq(crmContacts.id, contactId));
    await insertActivities(db, [{ contactId, kind: "system", body: `Démo créée : ${cleanText(demo.siteName, 160)}`, authorId: viewer.id, createdAt: now }]);
    if (["new", "contacted", "qualified"].includes(contact.stage)) await changeStage(db, viewer, [contactId], "demo", { now: new Date(now.getTime() + 1) });
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
}

/** La démo d'un prospect vient d'être convertie en site client : ses fiches du CRM passent à « client ». */
export async function markProspectWon(db: Database, viewer: CrmViewer, prospectId: string, siteId: string): Promise<void> {
  try {
    const rows = await db
      .select({ id: crmContacts.id })
      .from(crmContacts)
      .where(or(eq(crmContacts.prospectId, prospectId), eq(crmContacts.siteId, siteId)));
    if (rows.length === 0) return;
    await changeStage(
      db,
      viewer,
      rows.map((row) => row.id),
      "won",
      { note: "site client activé" },
    );
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
}

/** Compteurs d'une liste importée, ajoutés au fil des lots. */
export async function addImportCounts(db: Executor, importId: string, counts: { created: number; updated: number; skipped: number }): Promise<void> {
  await db
    .update(crmImports)
    .set({
      createdCount: sql`${crmImports.createdCount} + ${counts.created}`,
      updatedCount: sql`${crmImports.updatedCount} + ${counts.updated}`,
      skippedCount: sql`${crmImports.skippedCount} + ${counts.skipped}`,
    })
    .where(eq(crmImports.id, importId));
}
