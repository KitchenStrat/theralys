"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { crmActivities, crmContacts, crmImports, getDb } from "@theralys/db";
import { requireAdmin } from "@/lib/auth";
import { matchingIds, refreshNextAction } from "@/lib/crm/data";
import { isUuid, parseFilters } from "@/lib/crm/filters";
import { CRM_STAGES, FIELD_MAX, LOGGABLE_KINDS, displayName, isCrmStage, isPeriodInterest, isPlanInterest, type ContactDraft } from "@/lib/crm/model";
import { cleanMultiline, cleanText, dedupeKeys, isUsableDraft, normalizeDraft, normalizeTags } from "@/lib/crm/normalize";
import { addImportCounts, changeStage, findExisting, mergeIntoExisting, recordActivity } from "@/lib/crm/write";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const uuid = z.string().refine(isUuid, "Identifiant invalide");

function refresh(contactId?: string) {
  revalidatePath("/crm");
  if (contactId) revalidatePath(`/crm/${contactId}`);
}

// ─── Fiche ───────────────────────────────────────────────────────────────────

const text = (max: number) => z.string().max(max * 2).optional().default("");

const contactSchema = z.object({
  id: uuid.optional(),
  firstName: text(FIELD_MAX.firstName),
  lastName: text(FIELD_MAX.lastName),
  company: text(FIELD_MAX.company),
  profession: text(FIELD_MAX.profession),
  email: text(FIELD_MAX.email),
  phone: text(60),
  website: text(FIELD_MAX.website),
  address: text(FIELD_MAX.address),
  postalCode: text(20),
  city: text(FIELD_MAX.city),
  notes: z.string().max(FIELD_MAX.notes * 2).optional().default(""),
  tags: z.string().max(600).optional().default(""),
  source: z.string().max(60).optional().default(""),
  stage: z.enum(CRM_STAGES).optional(),
  plan: z.string().max(20).optional().default(""),
  billingPeriod: z.string().max(20).optional().default(""),
  doNotContact: z.boolean().optional().default(false),
  /** Créer malgré un doublon signalé */
  force: z.boolean().optional().default(false),
});

export type SaveContactResult = Result<{ id: string }> | { ok: false; duplicate: { id: string; name: string } };

export async function saveContact(input: unknown): Promise<SaveContactResult> {
  await requireAdmin();
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return fail("Formulaire invalide.");
  const data = parsed.data;
  const draft = normalizeDraft({ ...data, tags: normalizeTags(data.tags), extra: {} });
  if (data.email.trim() && !draft.email) return fail("Cet e-mail n'a pas la forme d'une adresse.");
  if (data.phone.trim() && !draft.phone) return fail("Ce numéro de téléphone n'est pas reconnu : écrivez-le avec son indicatif (+32…) s'il n'est pas français.");
  if (!isUsableDraft(draft)) return fail("Donnez au moins un nom, un cabinet, un e-mail ou un téléphone.");
  const db = getDb();
  const now = new Date();
  const fields = {
    firstName: draft.firstName,
    lastName: draft.lastName,
    company: draft.company,
    profession: draft.profession,
    email: draft.email || null,
    phone: draft.phone || null,
    website: draft.website || null,
    address: draft.address || null,
    postalCode: draft.postalCode || null,
    city: draft.city,
    notes: draft.notes || null,
    tags: draft.tags,
    plan: isPlanInterest(data.plan) ? data.plan : null,
    billingPeriod: isPlanInterest(data.plan) && isPeriodInterest(data.billingPeriod) ? data.billingPeriod : null,
    doNotContact: data.doNotContact,
    updatedAt: now,
  };

  if (data.id) {
    const [existing] = await db.select({ id: crmContacts.id }).from(crmContacts).where(eq(crmContacts.id, data.id)).limit(1);
    if (!existing) return fail("Cette fiche n'existe plus.");
    await db
      .update(crmContacts)
      .set({ ...fields, ...(cleanText(data.source, 60) ? { source: cleanText(data.source, 60) } : {}) })
      .where(eq(crmContacts.id, data.id));
    refresh(data.id);
    return { ok: true, id: data.id };
  }

  if (!data.force) {
    const existing = await findExisting(db, [draft]);
    const match = dedupeKeys(draft)
      .map((key) => existing.get(key))
      .find(Boolean);
    if (match) return { ok: false, duplicate: { id: match.id, name: displayName(match) } };
  }
  const [created] = await db
    .insert(crmContacts)
    .values({ ...fields, source: cleanText(data.source, 60) || "manual", stage: data.stage ?? "new", createdAt: now, stageChangedAt: now })
    .returning({ id: crmContacts.id });
  refresh();
  return { ok: true, id: created!.id };
}

export async function deleteContact(id: unknown): Promise<Result> {
  await requireAdmin();
  if (!isUuid(id)) return fail("Identifiant invalide.");
  await getDb().delete(crmContacts).where(eq(crmContacts.id, id));
  refresh(id);
  return { ok: true };
}

// ─── Étape ───────────────────────────────────────────────────────────────────

const stageSchema = z.object({ id: uuid, stage: z.enum(CRM_STAGES), lostReason: z.string().max(400).optional() });

export async function setStage(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return fail("Étape invalide.");
  await changeStage(getDb(), [parsed.data.id], parsed.data.stage, { lostReason: parsed.data.lostReason });
  refresh(parsed.data.id);
  return { ok: true };
}

// ─── Actions groupées ────────────────────────────────────────────────────────

const bulkSchema = z.object({
  /** Fiches cochées… */
  ids: z.array(uuid).max(500).optional(),
  /** …ou tous les prospects qui répondent aux filtres (paramètres de l'adresse) */
  query: z.string().max(2000).optional(),
  action: z.enum(["stage", "tag", "untag", "dnc", "allow", "delete"]),
  value: z.string().max(60).optional().default(""),
});

export async function bulkUpdate(input: unknown): Promise<Result<{ count: number }>> {
  await requireAdmin();
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return fail("Action invalide.");
  const { action, value } = parsed.data;
  const db = getDb();
  const now = new Date();
  const ids = parsed.data.query !== undefined ? await matchingIds(db, parseFilters(new URLSearchParams(parsed.data.query)), now) : (parsed.data.ids ?? []);
  if (ids.length === 0) return fail("Aucun prospect sélectionné.");
  let count = ids.length;
  // Par paquets : une liste de plusieurs milliers d'identifiants ne part pas dans une seule requête
  for (let start = 0; start < ids.length; start += 500) {
    const chunk = ids.slice(start, start + 500);
    if (action === "stage") {
      if (!isCrmStage(value)) return fail("Étape invalide.");
      if (start === 0) count = 0;
      count += await changeStage(db, chunk, value, { now });
    } else if (action === "delete") {
      await db.delete(crmContacts).where(inArray(crmContacts.id, chunk));
    } else if (action === "dnc" || action === "allow") {
      await db.update(crmContacts).set({ doNotContact: action === "dnc", updatedAt: now }).where(inArray(crmContacts.id, chunk));
    } else {
      const tag = normalizeTags(value)[0];
      if (!tag) return fail("Donnez une étiquette.");
      const rows = await db.select({ id: crmContacts.id, tags: crmContacts.tags }).from(crmContacts).where(inArray(crmContacts.id, chunk));
      for (const row of rows) {
        const tags = action === "tag" ? normalizeTags([...row.tags, tag]) : row.tags.filter((existing) => existing.toLowerCase() !== tag.toLowerCase());
        if (tags.length !== row.tags.length) await db.update(crmContacts).set({ tags, updatedAt: now }).where(eq(crmContacts.id, row.id));
      }
    }
  }
  refresh();
  return { ok: true, count };
}

// ─── Historique et tâches ────────────────────────────────────────────────────

const activitySchema = z.object({ contactId: uuid, kind: z.enum(LOGGABLE_KINDS), body: z.string().max(8000) });

export async function logActivity(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return fail("Activité invalide.");
  const body = cleanMultiline(parsed.data.body, 4000);
  if (!body && parsed.data.kind === "note") return fail("Écrivez la note avant de l'enregistrer.");
  const db = getDb();
  const [contact] = await db.select({ id: crmContacts.id, stage: crmContacts.stage }).from(crmContacts).where(eq(crmContacts.id, parsed.data.contactId)).limit(1);
  if (!contact) return fail("Cette fiche n'existe plus.");
  await recordActivity(db, contact, parsed.data.kind, body);
  refresh(contact.id);
  return { ok: true };
}

const taskSchema = z.object({ contactId: uuid, body: z.string().max(600), dueAt: z.string().max(40) });

export async function addTask(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return fail("Tâche invalide.");
  const body = cleanText(parsed.data.body, 200);
  const dueAt = new Date(parsed.data.dueAt);
  if (!body) return fail("Décrivez la tâche (« Rappeler », « Envoyer la démo »…).");
  if (Number.isNaN(dueAt.getTime())) return fail("Choisissez une échéance.");
  const db = getDb();
  const [contact] = await db.select({ id: crmContacts.id }).from(crmContacts).where(eq(crmContacts.id, parsed.data.contactId)).limit(1);
  if (!contact) return fail("Cette fiche n'existe plus.");
  await db.insert(crmActivities).values({ contactId: contact.id, kind: "task", body, dueAt });
  await refreshNextAction(db, contact.id);
  refresh(contact.id);
  return { ok: true };
}

export async function completeTask(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = z.object({ id: uuid, done: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("Tâche invalide.");
  const db = getDb();
  const [task] = await db
    .update(crmActivities)
    .set({ doneAt: parsed.data.done ? new Date() : null })
    .where(and(eq(crmActivities.id, parsed.data.id), eq(crmActivities.kind, "task")))
    .returning({ contactId: crmActivities.contactId });
  if (!task) return fail("Cette tâche n'existe plus.");
  await refreshNextAction(db, task.contactId);
  refresh(task.contactId);
  return { ok: true };
}

export async function deleteActivity(id: unknown): Promise<Result> {
  await requireAdmin();
  if (!isUuid(id)) return fail("Identifiant invalide.");
  const db = getDb();
  // L'historique des changements d'étape ne s'efface pas
  const [removed] = await db
    .delete(crmActivities)
    .where(and(eq(crmActivities.id, id), inArray(crmActivities.kind, [...LOGGABLE_KINDS, "task"])))
    .returning({ contactId: crmActivities.contactId });
  if (!removed) return fail("Cet élément n'existe plus.");
  await refreshNextAction(db, removed.contactId);
  refresh(removed.contactId);
  return { ok: true };
}

// ─── Import d'une liste ──────────────────────────────────────────────────────

const IMPORT_BATCH = 300;

const startSchema = z.object({
  filename: z.string().max(300),
  format: z.enum(["csv", "xlsx", "json", "vcard", "paste"]),
  source: z.string().max(60).optional().default(""),
  totalRows: z.number().int().min(1).max(20_000),
});

export async function startImport(input: unknown): Promise<Result<{ importId: string }>> {
  await requireAdmin();
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return fail("Import invalide.");
  const [created] = await getDb()
    .insert(crmImports)
    .values({ filename: cleanText(parsed.data.filename, 160) || "Liste importée", format: parsed.data.format, source: cleanText(parsed.data.source, 60) || "import", totalRows: parsed.data.totalRows })
    .returning({ id: crmImports.id });
  return { ok: true, importId: created!.id };
}

const draftSchema = z.object({
  firstName: z.string().max(400).default(""),
  lastName: z.string().max(400).default(""),
  company: z.string().max(400).default(""),
  profession: z.string().max(400).default(""),
  email: z.string().max(400).default(""),
  phone: z.string().max(100).default(""),
  website: z.string().max(600).default(""),
  address: z.string().max(600).default(""),
  postalCode: z.string().max(40).default(""),
  city: z.string().max(400).default(""),
  notes: z.string().max(8000).default(""),
  tags: z.array(z.string().max(80)).max(20).default([]),
  stage: z.enum(CRM_STAGES).optional(),
  source: z.string().max(120).optional(),
  extra: z.record(z.string().max(600)).default({}),
});

const rowsSchema = z.object({
  importId: uuid,
  rows: z.array(draftSchema).min(1).max(IMPORT_BATCH),
  /** Doublons : les ignorer, compléter les fiches existantes, ou tout créer */
  duplicates: z.enum(["skip", "merge", "create"]),
  stage: z.enum(CRM_STAGES).default("new"),
  tags: z.array(z.string().max(80)).max(12).default([]),
});

export type ImportCounts = { created: number; updated: number; skipped: number };

export async function importRows(input: unknown): Promise<Result<ImportCounts>> {
  await requireAdmin();
  const parsed = rowsSchema.safeParse(input);
  if (!parsed.success) return fail("Ce lot de lignes n'a pas pu être lu.");
  const { importId, duplicates, stage } = parsed.data;
  const listTags = normalizeTags(parsed.data.tags);
  const db = getDb();
  const [list] = await db.select({ id: crmImports.id, source: crmImports.source }).from(crmImports).where(eq(crmImports.id, importId)).limit(1);
  if (!list) return fail("Cet import n'existe plus.");

  const counts: ImportCounts = { created: 0, updated: 0, skipped: 0 };
  // Le serveur refait la mise au propre : ce qui vient du navigateur n'est jamais pris tel quel
  const drafts: ContactDraft[] = [];
  for (const row of parsed.data.rows) {
    const draft = normalizeDraft(row);
    if (isUsableDraft(draft)) drafts.push(draft);
    else counts.skipped++;
  }

  await db.transaction(async (tx) => {
    const existing = duplicates === "create" ? new Map() : await findExisting(tx, drafts);
    const seen = new Map<string, true>();
    const now = new Date();
    const toInsert: (typeof crmContacts.$inferInsert)[] = [];
    for (const draft of drafts) {
      const keys = dedupeKeys(draft);
      if (duplicates !== "create") {
        // Deux fois le même prospect dans le fichier : la première ligne compte
        if (keys.some((key) => seen.has(key))) {
          counts.skipped++;
          continue;
        }
        const match = keys.map((key) => existing.get(key)).find(Boolean);
        if (match) {
          const patch = duplicates === "merge" ? mergeIntoExisting(match, draft, listTags) : null;
          if (patch) {
            await tx
              .update(crmContacts)
              .set({ ...patch, updatedAt: now })
              .where(eq(crmContacts.id, match.id));
            counts.updated++;
          } else counts.skipped++;
          for (const key of keys) seen.set(key, true);
          continue;
        }
        for (const key of keys) seen.set(key, true);
      }
      toInsert.push({
        firstName: draft.firstName,
        lastName: draft.lastName,
        company: draft.company,
        profession: draft.profession,
        email: draft.email || null,
        phone: draft.phone || null,
        website: draft.website || null,
        address: draft.address || null,
        postalCode: draft.postalCode || null,
        city: draft.city,
        notes: draft.notes || null,
        tags: normalizeTags([...draft.tags, ...listTags]),
        extra: draft.extra,
        source: draft.source || list.source,
        stage: draft.stage ?? stage,
        importId,
        createdAt: now,
        updatedAt: now,
        stageChangedAt: now,
      });
    }
    if (toInsert.length > 0) await tx.insert(crmContacts).values(toInsert);
    counts.created = toInsert.length;
    await addImportCounts(tx, importId, counts);
  });
  return { ok: true, ...counts };
}

export async function finishImport(importId: unknown): Promise<Result> {
  await requireAdmin();
  if (!isUuid(importId)) return fail("Identifiant invalide.");
  await getDb().update(crmImports).set({ status: "done" }).where(eq(crmImports.id, importId));
  refresh();
  return { ok: true };
}

/** Défait un import : la liste disparaît, avec les prospects qu'elle avait créés si on le demande. */
export async function deleteImport(input: unknown): Promise<Result<{ removed: number }>> {
  await requireAdmin();
  const parsed = z.object({ importId: uuid, withContacts: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("Demande invalide.");
  const db = getDb();
  let removed = 0;
  if (parsed.data.withContacts) {
    const rows = await db.delete(crmContacts).where(eq(crmContacts.importId, parsed.data.importId)).returning({ id: crmContacts.id });
    removed = rows.length;
  }
  await db.delete(crmImports).where(eq(crmImports.id, parsed.data.importId));
  refresh();
  return { ok: true, removed };
}
