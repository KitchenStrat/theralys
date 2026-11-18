/**
 * Écritures du CRM partagées entre ses actions et le reste de l'admin
 * (création d'une démo, conversion en client). Réservé au serveur.
 */

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { crmActivities, crmContacts, crmImports, type CrmContact, type Database } from "@theralys/db";
import { isMissingTableError } from "@/lib/api-usage";
import { STAGE_META, isContactKind, isCrmStage, type ContactDraft, type CrmStage } from "./model";
import { cleanText, dedupeKeys, fold, normalizeTags } from "./normalize";

type Executor = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;

/**
 * Change l'étape de prospects et l'inscrit dans leur historique. Les
 * prospects déjà à cette étape ne bougent pas. Renvoie le nombre de fiches
 * modifiées.
 */
export async function changeStage(db: Executor, ids: string[], stage: CrmStage, options: { lostReason?: string; note?: string; now?: Date } = {}): Promise<number> {
  if (ids.length === 0) return 0;
  const now = options.now ?? new Date();
  const current = await db.select({ id: crmContacts.id, stage: crmContacts.stage }).from(crmContacts).where(inArray(crmContacts.id, ids));
  const moving = current.filter((row) => row.stage !== stage);
  if (moving.length === 0) return 0;
  const reason = stage === "lost" ? cleanText(options.lostReason, 200) : "";
  await db
    .update(crmContacts)
    .set({ stage, stageChangedAt: now, updatedAt: now, lostReason: stage === "lost" ? reason || null : null })
    .where(
      inArray(
        crmContacts.id,
        moving.map((row) => row.id),
      ),
    );
  await db.insert(crmActivities).values(
    moving.map((row) => ({
      contactId: row.id,
      kind: "stage",
      body: `${isCrmStage(row.stage) ? STAGE_META[row.stage].label : row.stage} → ${STAGE_META[stage].label}${reason ? ` — ${reason}` : ""}${options.note ? ` (${options.note})` : ""}`,
      createdAt: now,
    })),
  );
  return moving.length;
}

/**
 * Inscrit une activité sur une fiche. Un appel, un e-mail ou un rendez-vous
 * date le dernier contact, et fait passer un prospect « à contacter » à
 * « contacté ».
 */
export async function recordActivity(db: Executor, contact: Pick<CrmContact, "id" | "stage">, kind: string, body: string, now = new Date()): Promise<void> {
  await db.insert(crmActivities).values({ contactId: contact.id, kind, body, createdAt: now });
  if (isContactKind(kind)) {
    await db.update(crmContacts).set({ lastContactAt: now, updatedAt: now }).where(eq(crmContacts.id, contact.id));
    if (contact.stage === "new") await changeStage(db, [contact.id], "contacted", { now: new Date(now.getTime() + 1) });
  } else {
    await db.update(crmContacts).set({ updatedAt: now }).where(eq(crmContacts.id, contact.id));
  }
}

// ─── Doublons ────────────────────────────────────────────────────────────────

export type ExistingMatch = Pick<CrmContact, "id" | "firstName" | "lastName" | "company" | "profession" | "email" | "phone" | "website" | "address" | "postalCode" | "city" | "notes" | "tags" | "extra">;

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
};

/**
 * Prospects déjà présents qui correspondent à des brouillons : même e-mail,
 * même téléphone, ou même nom dans la même ville. Renvoie, par clé de
 * doublon, la fiche existante.
 */
export async function findExisting(db: Executor, drafts: Pick<ContactDraft, "firstName" | "lastName" | "company" | "city" | "email" | "phone">[]): Promise<Map<string, ExistingMatch>> {
  const emails = [...new Set(drafts.map((draft) => draft.email).filter(Boolean))];
  const phones = [...new Set(drafts.map((draft) => draft.phone).filter(Boolean))];
  // Le nom dans la ville ne sert qu'aux brouillons sans e-mail ni téléphone
  const cities = [...new Set(drafts.filter((draft) => !draft.email && !draft.phone && draft.city).map((draft) => draft.city.toLowerCase()))];
  const conditions = [
    emails.length > 0 ? inArray(crmContacts.email, emails) : undefined,
    phones.length > 0 ? inArray(crmContacts.phone, phones) : undefined,
    cities.length > 0 ? and(inArray(sql`lower(${crmContacts.city})`, cities), isNull(crmContacts.email), isNull(crmContacts.phone)) : undefined,
  ].filter((condition) => condition !== undefined);
  const found = new Map<string, ExistingMatch>();
  if (conditions.length === 0) return found;
  const rows = await db
    .select(MATCH_COLUMNS)
    .from(crmContacts)
    .where(or(...conditions))
    .limit(5000);
  for (const row of rows) {
    for (const key of dedupeKeys(row)) if (!found.has(key)) found.set(key, row);
  }
  return found;
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
export async function linkContactToDemo(db: Database, contactId: string, demo: { prospectId: string; siteId: string; siteName: string }): Promise<void> {
  try {
    const [contact] = await db.select({ id: crmContacts.id, stage: crmContacts.stage }).from(crmContacts).where(eq(crmContacts.id, contactId)).limit(1);
    if (!contact) return;
    const now = new Date();
    await db.update(crmContacts).set({ prospectId: demo.prospectId, siteId: demo.siteId, updatedAt: now }).where(eq(crmContacts.id, contactId));
    await db.insert(crmActivities).values({ contactId, kind: "system", body: `Démo créée : ${cleanText(demo.siteName, 160)}`, createdAt: now });
    if (["new", "contacted", "qualified"].includes(contact.stage)) await changeStage(db, [contactId], "demo", { now: new Date(now.getTime() + 1) });
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
}

/** La démo d'un prospect vient d'être convertie en site client : ses fiches du CRM passent à « client ». */
export async function markProspectWon(db: Database, prospectId: string, siteId: string): Promise<void> {
  try {
    const rows = await db
      .select({ id: crmContacts.id })
      .from(crmContacts)
      .where(or(eq(crmContacts.prospectId, prospectId), eq(crmContacts.siteId, siteId)));
    if (rows.length === 0) return;
    await changeStage(
      db,
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
