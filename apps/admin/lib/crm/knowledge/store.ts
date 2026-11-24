/**
 * Lectures et écritures de la base de connaissances de l'équipe commerciale
 * (tables `crm_knowledge` et `crm_knowledge_asks`, migration 0014). La base
 * est commune : l'admin et chaque commercial lisent toutes les fiches. Seul
 * l'admin les modifie, les valide ou les supprime — c'est aux actions de le
 * vérifier ; ce module n'écrit que ce qu'on lui demande.
 */

import { and, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { crmKnowledge, crmKnowledgeAsks, users, type CrmKnowledgeEntry, type Database } from "@theralys/db";
import { isMissingSchemaError } from "@/lib/pg-errors";
import type { CrmViewer } from "../access";
import {
  KNOWLEDGE_CATEGORIES,
  closest,
  isKnowledgeKind,
  isKnowledgeStatus,
  questionKey,
  type KnowledgeCategoryId,
  type KnowledgeFilters,
  type KnowledgeKind,
  type KnowledgeStatus,
} from "./model";

type Reader = Pick<Database, "select">;

/** Nombre de fiches rendues par la page : au-delà, la recherche et les rubriques servent à resserrer. */
export const KNOWLEDGE_PAGE_LIMIT = 300;

// ─── État de la base ─────────────────────────────────────────────────────────

/** `missing` tant que la migration 0014 n'est pas appliquée. */
export type KnowledgeState = "ready" | "missing";

export async function knowledgeState(db: Database): Promise<KnowledgeState> {
  try {
    await db.execute(sql`select (select id from crm_knowledge limit 1), (select id from crm_knowledge_asks limit 1)`);
    return "ready";
  } catch (error) {
    if (isMissingSchemaError(error)) return "missing";
    throw error;
  }
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

/** Une fiche telle que les écrans la reçoivent (dates en texte : elle traverse vers le navigateur). */
export type KnowledgeRow = {
  id: string;
  question: string;
  kind: KnowledgeKind;
  category: string;
  reply: string;
  details: string;
  status: KnowledgeStatus;
  askedCount: number;
  /** Qui l'a posée en premier (null : compte supprimé) */
  authorName: string | null;
  lastAskedAt: string;
  createdAt: string;
  /** La personne qui lit l'a posée elle-même */
  mine: boolean;
};

export function toKnowledgeRow(entry: CrmKnowledgeEntry, extras: { authorName: string | null; mine: boolean }): KnowledgeRow {
  return {
    id: entry.id,
    question: entry.question,
    kind: isKnowledgeKind(entry.kind) ? entry.kind : "question",
    category: entry.category,
    reply: entry.reply,
    details: entry.details,
    status: isKnowledgeStatus(entry.status) ? entry.status : "ai",
    askedCount: entry.askedCount,
    authorName: extras.authorName,
    lastAskedAt: entry.lastAskedAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    mine: extras.mine,
  };
}

/** Texte cherché tel quel : les jokers de LIKE qu'il contient sont neutralisés. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const askedBy = (userId: string) => sql<boolean>`exists (select 1 from ${crmKnowledgeAsks} where ${crmKnowledgeAsks.entryId} = ${crmKnowledge.id} and ${crmKnowledgeAsks.userId} = ${userId})`;

/** Les fiches de la base, filtrées et triées ; les plus posées d'abord par défaut. */
export async function listKnowledge(db: Reader, viewer: CrmViewer, filters: KnowledgeFilters): Promise<KnowledgeRow[]> {
  const conditions: SQL[] = [];
  if (filters.q) {
    const pattern = likePattern(filters.q);
    conditions.push(or(ilike(crmKnowledge.question, pattern), ilike(crmKnowledge.reply, pattern), ilike(crmKnowledge.details, pattern))!);
  }
  if (filters.category) conditions.push(eq(crmKnowledge.category, filters.category));
  if (filters.kind) conditions.push(eq(crmKnowledge.kind, filters.kind));
  if (filters.status) conditions.push(eq(crmKnowledge.status, filters.status));
  if (filters.mine) conditions.push(askedBy(viewer.id));
  const rows = await db
    .select({ entry: crmKnowledge, authorName: users.name, mine: askedBy(viewer.id) })
    .from(crmKnowledge)
    .leftJoin(users, eq(users.id, crmKnowledge.authorId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...(filters.sort === "recent" ? [desc(crmKnowledge.lastAskedAt)] : [desc(crmKnowledge.askedCount), desc(crmKnowledge.lastAskedAt)]))
    .limit(KNOWLEDGE_PAGE_LIMIT);
  return rows.map((row) => toKnowledgeRow(row.entry, { authorName: row.authorName, mine: Boolean(row.mine) }));
}

export async function getKnowledgeRow(db: Reader, viewer: CrmViewer, id: string): Promise<KnowledgeRow | null> {
  const [row] = await db
    .select({ entry: crmKnowledge, authorName: users.name, mine: askedBy(viewer.id) })
    .from(crmKnowledge)
    .leftJoin(users, eq(users.id, crmKnowledge.authorId))
    .where(eq(crmKnowledge.id, id))
    .limit(1);
  return row ? toKnowledgeRow(row.entry, { authorName: row.authorName, mine: Boolean(row.mine) }) : null;
}

export type KnowledgeCounts = {
  total: number;
  /** Fiches à vérifier ou à compléter */
  review: number;
  objections: number;
  categories: Record<KnowledgeCategoryId, number>;
};

/** Volumes de la base entière (hors filtres) : compteurs des rubriques et pastille « À vérifier ». */
export async function knowledgeCounts(db: Reader): Promise<KnowledgeCounts> {
  const rows = await db
    .select({ category: crmKnowledge.category, kind: crmKnowledge.kind, status: crmKnowledge.status, count: sql<number>`count(*)::int` })
    .from(crmKnowledge)
    .groupBy(crmKnowledge.category, crmKnowledge.kind, crmKnowledge.status);
  const categories = Object.fromEntries(KNOWLEDGE_CATEGORIES.map((category) => [category.id, 0])) as Record<KnowledgeCategoryId, number>;
  const counts: KnowledgeCounts = { total: 0, review: 0, objections: 0, categories };
  for (const row of rows) {
    counts.total += row.count;
    if (row.status === "review") counts.review += row.count;
    if (row.kind === "objection") counts.objections += row.count;
    if (row.category in categories) categories[row.category as KnowledgeCategoryId] += row.count;
    else categories.autre += row.count;
  }
  return counts;
}

/** Qui pose des questions, et combien, depuis `since` : ce que l'admin voit de l'usage de l'assistant par son équipe. */
export async function askActivity(db: Reader, since: Date): Promise<{ userId: string | null; name: string; count: number; last: string }[]> {
  const rows = await db
    .select({ userId: crmKnowledgeAsks.userId, name: users.name, count: sql<number>`count(*)::int`, last: sql<Date | string>`max(${crmKnowledgeAsks.createdAt})` })
    .from(crmKnowledgeAsks)
    .leftJoin(users, eq(users.id, crmKnowledgeAsks.userId))
    .where(gte(crmKnowledgeAsks.createdAt, since))
    .groupBy(crmKnowledgeAsks.userId, users.name)
    .orderBy(sql`count(*) desc`);
  return rows.map((row) => ({ userId: row.userId, name: row.name ?? "Compte supprimé", count: row.count, last: new Date(row.last).toISOString() }));
}

// ─── Retrouver une question déjà posée ───────────────────────────────────────

/** La fiche d'une question déjà posée dans les mêmes mots (à la casse, aux accents et à la ponctuation près). */
export async function findAsked(db: Reader, key: string): Promise<CrmKnowledgeEntry | null> {
  if (!key) return null;
  const [direct] = await db.select().from(crmKnowledge).where(eq(crmKnowledge.questionKey, key)).orderBy(desc(crmKnowledge.askedCount)).limit(1);
  if (direct) return direct;
  const [viaAsk] = await db
    .select({ entry: crmKnowledge })
    .from(crmKnowledgeAsks)
    .innerJoin(crmKnowledge, eq(crmKnowledge.id, crmKnowledgeAsks.entryId))
    .where(eq(crmKnowledgeAsks.askedKey, key))
    .orderBy(desc(crmKnowledgeAsks.createdAt))
    .limit(1);
  return viaAsk?.entry ?? null;
}

/** Fiches lues pour préparer une réponse : au plus ce nombre, les plus posées d'abord. */
const MATERIAL_LIMIT = 800;

export type PromptMaterial = {
  /** Réponses validées, les plus proches de la question d'abord */
  validated: { question: string; reply: string; details: string }[];
  /** Fiches proches de la question, sous une référence courte */
  existing: { ref: string; question: string }[];
  /** Fiche de chaque référence */
  byRef: Map<string, { id: string; status: string }>;
};

/**
 * Ce que la base apporte à une réponse : les réponses validées (elles font
 * foi) et les fiches assez proches de la question pour être la même.
 */
export async function promptMaterial(db: Reader, question: string): Promise<PromptMaterial> {
  const entries = await db
    .select({ id: crmKnowledge.id, question: crmKnowledge.question, reply: crmKnowledge.reply, details: crmKnowledge.details, status: crmKnowledge.status })
    .from(crmKnowledge)
    .orderBy(desc(crmKnowledge.askedCount), desc(crmKnowledge.lastAskedAt))
    .limit(MATERIAL_LIMIT);
  const validated = closest(
    question,
    entries.filter((entry) => entry.status === "validated"),
    (entry) => `${entry.question} ${entry.reply}`,
    40,
  ).map((entry) => ({ question: entry.question, reply: entry.reply, details: entry.details }));
  const near = closest(question, entries, (entry) => entry.question, 25, 0.34);
  const byRef = new Map<string, { id: string; status: string }>();
  const existing = near.map((entry, index) => {
    const ref = `f${index + 1}`;
    byRef.set(ref, { id: entry.id, status: entry.status });
    return { ref, question: entry.question };
  });
  return { validated, existing, byRef };
}

// ─── Écriture ────────────────────────────────────────────────────────────────

export type EntryContent = { question: string; kind: KnowledgeKind; category: string; reply: string; details: string };

/** La question vient d'être reposée : une ligne au journal, un passage de plus sur la fiche. */
export async function recordAsk(db: Database, entryId: string, userId: string, asked: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(crmKnowledgeAsks).values({ entryId, userId, asked, askedKey: questionKey(asked) });
    await tx
      .update(crmKnowledge)
      .set({ askedCount: sql`${crmKnowledge.askedCount} + 1`, lastAskedAt: new Date() })
      .where(eq(crmKnowledge.id, entryId));
  });
}

/** Nouvelle fiche née d'une question posée à l'assistant, avec sa première ligne au journal. */
export async function createAskedEntry(db: Database, content: EntryContent, status: KnowledgeStatus, userId: string, asked: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(crmKnowledge)
      .values({ ...content, questionKey: questionKey(content.question), status, authorId: userId })
      .returning({ id: crmKnowledge.id });
    if (!created) throw new Error("Fiche non créée");
    await tx.insert(crmKnowledgeAsks).values({ entryId: created.id, userId, asked, askedKey: questionKey(asked) });
    return created.id;
  });
}

/**
 * Réponse plus récente de l'assistant sur une fiche qui n'a pas été validée :
 * elle remplace l'ancienne. Une fiche validée n'est jamais touchée par ici
 * (la condition est dans la requête).
 */
export async function refreshUnvalidated(db: Database, id: string, content: Omit<EntryContent, "question">, status: KnowledgeStatus): Promise<void> {
  await db
    .update(crmKnowledge)
    .set({ ...content, status, updatedAt: new Date() })
    .where(and(eq(crmKnowledge.id, id), sql`${crmKnowledge.status} <> 'validated'`));
}

/** Fiche écrite ou corrigée par l'admin : elle est validée du même geste. Rend son identifiant, null si elle n'existe plus. */
export async function saveValidatedEntry(db: Database, adminId: string, content: EntryContent, id?: string): Promise<string | null> {
  const now = new Date();
  const values = { ...content, questionKey: questionKey(content.question), status: "validated" as const, validatedBy: adminId, validatedAt: now, updatedAt: now };
  if (id) {
    const [updated] = await db.update(crmKnowledge).set(values).where(eq(crmKnowledge.id, id)).returning({ id: crmKnowledge.id });
    return updated?.id ?? null;
  }
  const [created] = await db
    .insert(crmKnowledge)
    .values({ ...values, authorId: adminId, askedCount: 0 })
    .returning({ id: crmKnowledge.id });
  return created?.id ?? null;
}

/** L'admin valide la réponse telle qu'elle est. */
export async function validateEntry(db: Database, adminId: string, id: string): Promise<boolean> {
  const now = new Date();
  const updated = await db.update(crmKnowledge).set({ status: "validated", validatedBy: adminId, validatedAt: now, updatedAt: now }).where(eq(crmKnowledge.id, id)).returning({ id: crmKnowledge.id });
  return updated.length > 0;
}

/** Quelqu'un de l'équipe demande une relecture : seule une réponse de l'assistant non relue change d'état. */
export async function flagEntry(db: Database, id: string): Promise<boolean> {
  const updated = await db
    .update(crmKnowledge)
    .set({ status: "review", updatedAt: new Date() })
    .where(and(eq(crmKnowledge.id, id), eq(crmKnowledge.status, "ai")))
    .returning({ id: crmKnowledge.id });
  return updated.length > 0;
}

export async function deleteEntry(db: Database, id: string): Promise<boolean> {
  const deleted = await db.delete(crmKnowledge).where(eq(crmKnowledge.id, id)).returning({ id: crmKnowledge.id });
  return deleted.length > 0;
}
