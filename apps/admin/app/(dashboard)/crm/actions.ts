"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { crmActivities, crmContacts, crmImports, getDb } from "@theralys/db";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { BULK_ACTIONS, FOREIGN_DUPLICATE_MESSAGE, bulkActionAllowed, duplicateVerdict, ownerOnCreate, type CrmViewer } from "@/lib/crm/access";
import { matchingIds, refreshNextAction } from "@/lib/crm/data";
import { UNASSIGNED, isUuid, parseFilters } from "@/lib/crm/filters";
import { CRM_STAGES, FIELD_MAX, LOGGABLE_KINDS, displayName, isCrmStage, isPeriodInterest, isPlanInterest, isTrashed, type ContactDraft } from "@/lib/crm/model";
import { cleanMultiline, cleanText, dedupeKeys, isUsableDraft, normalizeDraft, normalizeTags } from "@/lib/crm/normalize";
import { activityVisibleTo, contactVisibleTo, visibleTo } from "@/lib/crm/scope";
import { assignableRep } from "@/lib/crm/team";
import { purgeContacts, restoreContacts, trashContacts } from "@/lib/crm/trash";
import { addImportCounts, assignContacts, changeStage, findDuplicates, findExisting, insertActivities, mergeIntoExisting, recordActivity } from "@/lib/crm/write";

/*
 * Actions du CRM. Chacune vérifie la session par elle-même, puis porte la
 * portée de la personne dans ses requêtes :
 * - `staffViewer` : admin ou commercial actif (compte relu en base). Un
 *   commercial n'atteint que ses propres fiches — la condition est dans le
 *   SQL de chaque lecture et de chaque écriture, pas seulement dans l'écran ;
 * - `adminViewer` : admin seulement (suppression, corbeille, import, listes).
 * Toute ligne d'historique porte l'identifiant de la personne de la session.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const uuid = z.string().refine(isUuid, "Identifiant invalide");

/** Fiche absente, ou hors de la portée de la personne : la réponse est la même, pour ne rien révéler des fiches d'autrui. */
const GONE = "Cette fiche n'existe plus.";
const NO_SUCH_REP = "Ce commercial n'existe pas, ou son compte est désactivé.";

async function staffViewer(): Promise<CrmViewer> {
  const user = await requireStaff();
  return { id: user.id, role: user.role };
}

async function adminViewer(): Promise<CrmViewer> {
  const user = await requireAdmin();
  return { id: user.id, role: user.role };
}

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
  /** À la création, par l'admin : commercial à qui attribuer la fiche (vide : non attribuée). Ignoré pour un commercial, qui crée pour lui-même */
  ownerId: z
    .string()
    .refine((value) => value === "" || isUuid(value))
    .optional()
    .default(""),
  /** Créer malgré un doublon signalé */
  force: z.boolean().optional().default(false),
});

export type SaveContactResult = Result<{ id: string }> | { ok: false; duplicate: { id: string; name: string } };

export async function saveContact(input: unknown): Promise<SaveContactResult> {
  const viewer = await staffViewer();
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
    // La fiche est lue et modifiée dans la portée de la personne : celle d'un autre n'existe pas pour un commercial
    const own = contactVisibleTo(viewer, data.id);
    const [existing] = await db.select({ id: crmContacts.id, stage: crmContacts.stage }).from(crmContacts).where(own).limit(1);
    if (!existing) return fail(GONE);
    if (isTrashed(existing.stage)) return fail("Cette fiche est à la corbeille : restaurez-la pour la modifier.");
    await db
      .update(crmContacts)
      .set({ ...fields, ...(cleanText(data.source, 60) ? { source: cleanText(data.source, 60) } : {}) })
      .where(own);
    refresh(data.id);
    return { ok: true, id: data.id };
  }

  const ownerId = ownerOnCreate(viewer, data.ownerId || null);
  if (viewer.role === "admin" && ownerId && !(await assignableRep(db, ownerId))) return fail(NO_SUCH_REP);
  // Le dédoublonnage porte sur tout le CRM ; un commercial n'apprend rien de la fiche d'un autre, et ne passe pas outre
  const matches = viewer.role === "admin" && data.force ? [] : await findDuplicates(db, draft);
  const verdict = duplicateVerdict(viewer, matches, data.force);
  if (verdict.kind === "foreign") return fail(FOREIGN_DUPLICATE_MESSAGE);
  if (verdict.kind === "own") return { ok: false, duplicate: { id: verdict.match.id, name: displayName(verdict.match) } };
  const [created] = await db
    .insert(crmContacts)
    .values({ ...fields, source: cleanText(data.source, 60) || "manual", stage: data.stage ?? "new", ownerId, createdAt: now, stageChangedAt: now })
    .returning({ id: crmContacts.id });
  refresh();
  return { ok: true, id: created!.id };
}

/** Supprimer une fiche la met à la corbeille : elle s'y restaure, ou s'y efface pour de bon. Réservé à l'admin. */
export async function deleteContact(id: unknown): Promise<Result> {
  const viewer = await adminViewer();
  if (!isUuid(id)) return fail("Identifiant invalide.");
  await trashContacts(getDb(), [id], viewer.id);
  refresh(id);
  return { ok: true };
}

// ─── Corbeille (admin) ───────────────────────────────────────────────────────

const trashSchema = z.object({ ids: z.array(uuid).min(1).max(500) });

export async function restoreFromTrash(input: unknown): Promise<Result<{ count: number }>> {
  const viewer = await adminViewer();
  const parsed = trashSchema.safeParse(input);
  if (!parsed.success) return fail("Sélection invalide.");
  const count = await restoreContacts(getDb(), parsed.data.ids, viewer.id);
  refresh();
  for (const id of parsed.data.ids.slice(0, 20)) revalidatePath(`/crm/${id}`);
  revalidatePath("/crm/corbeille");
  return { ok: true, count };
}

/** Efface pour de bon des fiches de la corbeille ; sans `ids`, vide la corbeille. */
export async function purgeFromTrash(input: unknown): Promise<Result<{ count: number }>> {
  await requireAdmin();
  const parsed = z.object({ ids: z.array(uuid).min(1).max(500).optional() }).safeParse(input);
  if (!parsed.success) return fail("Sélection invalide.");
  const count = await purgeContacts(getDb(), parsed.data.ids);
  refresh();
  revalidatePath("/crm/corbeille");
  return { ok: true, count };
}

// ─── Étape ───────────────────────────────────────────────────────────────────

const stageSchema = z.object({ id: uuid, stage: z.enum(CRM_STAGES), lostReason: z.string().max(400).optional() });

export async function setStage(input: unknown): Promise<Result> {
  const viewer = await staffViewer();
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return fail("Étape invalide.");
  const db = getDb();
  const [contact] = await db.select({ id: crmContacts.id }).from(crmContacts).where(contactVisibleTo(viewer, parsed.data.id)).limit(1);
  if (!contact) return fail(GONE);
  await changeStage(db, viewer, [contact.id], parsed.data.stage, { lostReason: parsed.data.lostReason });
  refresh(contact.id);
  return { ok: true };
}

// ─── Actions groupées ────────────────────────────────────────────────────────

const bulkSchema = z.object({
  /** Fiches cochées… */
  ids: z.array(uuid).max(500).optional(),
  /** …ou tous les prospects qui répondent aux filtres (paramètres de l'adresse) */
  query: z.string().max(2000).optional(),
  /** Étape, étiquettes, opposition : ouverts à tous, sur leurs fiches. Suppression et attribution : admin */
  action: z.enum(BULK_ACTIONS),
  /** Étape, étiquette, ou commercial à qui attribuer (`UNASSIGNED` : à personne) */
  value: z.string().max(60).optional().default(""),
});

export async function bulkUpdate(input: unknown): Promise<Result<{ count: number }>> {
  const viewer = await staffViewer();
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return fail("Action invalide.");
  const { action, value } = parsed.data;
  if (!bulkActionAllowed(viewer.role, action)) return fail("Cette action est réservée à l'administrateur.");
  const db = getDb();
  const now = new Date();
  // Des identifiants cochés comme des filtres de l'adresse, seules les fiches que la personne voit sont touchées
  const scope = visibleTo(viewer);
  const ids = parsed.data.query !== undefined ? await matchingIds(db, viewer, parseFilters(new URLSearchParams(parsed.data.query)), now) : (parsed.data.ids ?? []);
  if (ids.length === 0) return fail("Aucun prospect sélectionné.");
  if (action === "stage" && !isCrmStage(value)) return fail("Étape invalide.");
  const tag = action === "tag" || action === "untag" ? normalizeTags(value)[0] : undefined;
  if ((action === "tag" || action === "untag") && !tag) return fail("Donnez une étiquette.");
  const owner = action === "assign" && value !== UNASSIGNED ? (isUuid(value) ? await assignableRep(db, value) : null) : null;
  if (action === "assign" && value !== UNASSIGNED && !owner) return fail(NO_SUCH_REP);
  let count = 0;
  // Par paquets : une liste de plusieurs milliers d'identifiants ne part pas dans une seule requête
  for (let start = 0; start < ids.length; start += 500) {
    const chunk = ids.slice(start, start + 500);
    if (action === "stage" && isCrmStage(value)) {
      count += await changeStage(db, viewer, chunk, value, { now });
    } else if (action === "delete") {
      count += await trashContacts(db, chunk, viewer.id, now);
    } else if (action === "assign") {
      count += await assignContacts(db, viewer, chunk, owner, now);
    } else if (action === "dnc" || action === "allow") {
      const changed = await db
        .update(crmContacts)
        .set({ doNotContact: action === "dnc", updatedAt: now })
        .where(and(inArray(crmContacts.id, chunk), scope))
        .returning({ id: crmContacts.id });
      count += changed.length;
    } else if (tag) {
      const rows = await db
        .select({ id: crmContacts.id, tags: crmContacts.tags })
        .from(crmContacts)
        .where(and(inArray(crmContacts.id, chunk), scope));
      count += rows.length;
      for (const row of rows) {
        const tags = action === "tag" ? normalizeTags([...row.tags, tag]) : row.tags.filter((existing) => existing.toLowerCase() !== tag.toLowerCase());
        if (tags.length !== row.tags.length) await db.update(crmContacts).set({ tags, updatedAt: now }).where(contactVisibleTo(viewer, row.id));
      }
    }
  }
  refresh();
  return { ok: true, count };
}

// ─── Historique et tâches ────────────────────────────────────────────────────

const activitySchema = z.object({ contactId: uuid, kind: z.enum(LOGGABLE_KINDS), body: z.string().max(8000) });

export async function logActivity(input: unknown): Promise<Result> {
  const viewer = await staffViewer();
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return fail("Activité invalide.");
  const body = cleanMultiline(parsed.data.body, 4000);
  if (!body && parsed.data.kind === "note") return fail("Écrivez la note avant de l'enregistrer.");
  const db = getDb();
  const [contact] = await db.select({ id: crmContacts.id, stage: crmContacts.stage }).from(crmContacts).where(contactVisibleTo(viewer, parsed.data.contactId)).limit(1);
  if (!contact) return fail(GONE);
  await recordActivity(db, viewer, contact, parsed.data.kind, body);
  refresh(contact.id);
  return { ok: true };
}

const taskSchema = z.object({ contactId: uuid, body: z.string().max(600), dueAt: z.string().max(40) });

export async function addTask(input: unknown): Promise<Result> {
  const viewer = await staffViewer();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return fail("Tâche invalide.");
  const body = cleanText(parsed.data.body, 200);
  const dueAt = new Date(parsed.data.dueAt);
  if (!body) return fail("Décrivez la tâche (« Rappeler », « Envoyer la démo »…).");
  if (Number.isNaN(dueAt.getTime())) return fail("Choisissez une échéance.");
  const db = getDb();
  const [contact] = await db.select({ id: crmContacts.id }).from(crmContacts).where(contactVisibleTo(viewer, parsed.data.contactId)).limit(1);
  if (!contact) return fail(GONE);
  await insertActivities(db, [{ contactId: contact.id, kind: "task", body, dueAt, authorId: viewer.id, createdAt: new Date() }]);
  await refreshNextAction(db, contact.id);
  refresh(contact.id);
  return { ok: true };
}

export async function completeTask(input: unknown): Promise<Result> {
  const viewer = await staffViewer();
  const parsed = z.object({ id: uuid, done: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("Tâche invalide.");
  const db = getDb();
  // Une tâche se désigne par son identifiant : elle doit appartenir à une fiche que la personne voit
  const [task] = await db
    .update(crmActivities)
    .set({ doneAt: parsed.data.done ? new Date() : null })
    .where(and(eq(crmActivities.id, parsed.data.id), eq(crmActivities.kind, "task"), activityVisibleTo(db, viewer)))
    .returning({ contactId: crmActivities.contactId });
  if (!task) return fail("Cette tâche n'existe plus.");
  await refreshNextAction(db, task.contactId);
  refresh(task.contactId);
  return { ok: true };
}

export async function deleteActivity(id: unknown): Promise<Result> {
  const viewer = await staffViewer();
  if (!isUuid(id)) return fail("Identifiant invalide.");
  const db = getDb();
  // L'historique des changements d'étape ne s'efface pas. Un commercial ne retire que ce qu'il a lui-même inscrit, sur ses fiches
  const [removed] = await db
    .delete(crmActivities)
    .where(and(eq(crmActivities.id, id), inArray(crmActivities.kind, [...LOGGABLE_KINDS, "task"]), activityVisibleTo(db, viewer), viewer.role === "admin" ? undefined : eq(crmActivities.authorId, viewer.id)))
    .returning({ contactId: crmActivities.contactId });
  if (!removed) return fail("Cet élément n'existe plus.");
  await refreshNextAction(db, removed.contactId);
  refresh(removed.contactId);
  return { ok: true };
}

// ─── Import d'une liste (admin) ──────────────────────────────────────────────

const IMPORT_BATCH = 300;

const startSchema = z.object({
  filename: z.string().max(300),
  format: z.enum(["csv", "xlsx", "json", "vcard", "paste"]),
  source: z.string().max(60).optional().default(""),
  totalRows: z.number().int().min(1).max(20_000),
});

export async function startImport(input: unknown): Promise<Result<{ importId: string }>> {
  await adminViewer();
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
  /** Commercial à qui attribuer les prospects créés (les fiches existantes gardent leur propriétaire) */
  ownerId: uuid.nullable().optional(),
});

export type ImportCounts = { created: number; updated: number; skipped: number };

export async function importRows(input: unknown): Promise<Result<ImportCounts>> {
  await adminViewer();
  const parsed = rowsSchema.safeParse(input);
  if (!parsed.success) return fail("Ce lot de lignes n'a pas pu être lu.");
  const { importId, duplicates, stage } = parsed.data;
  const listTags = normalizeTags(parsed.data.tags);
  const db = getDb();
  const [list] = await db.select({ id: crmImports.id, source: crmImports.source }).from(crmImports).where(eq(crmImports.id, importId)).limit(1);
  if (!list) return fail("Cet import n'existe plus.");
  const ownerId = parsed.data.ownerId ?? null;
  if (ownerId && !(await assignableRep(db, ownerId))) return fail(NO_SUCH_REP);

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
        ownerId,
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
  await adminViewer();
  if (!isUuid(importId)) return fail("Identifiant invalide.");
  await getDb().update(crmImports).set({ status: "done" }).where(eq(crmImports.id, importId));
  refresh();
  return { ok: true };
}

/** Défait un import : la liste disparaît ; ses prospects partent à la corbeille si on le demande. */
export async function deleteImport(input: unknown): Promise<Result<{ removed: number }>> {
  const viewer = await adminViewer();
  const parsed = z.object({ importId: uuid, withContacts: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("Demande invalide.");
  const db = getDb();
  let removed = 0;
  if (parsed.data.withContacts) {
    // Les prospects de la liste partent à la corbeille, d'où ils se restaurent
    const rows = await db.select({ id: crmContacts.id }).from(crmContacts).where(eq(crmContacts.importId, parsed.data.importId));
    const ids = rows.map((row) => row.id);
    for (let start = 0; start < ids.length; start += 500) removed += await trashContacts(db, ids.slice(start, start + 500), viewer.id);
  }
  await db.delete(crmImports).where(eq(crmImports.id, parsed.data.importId));
  refresh();
  return { ok: true, removed };
}
