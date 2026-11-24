"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@theralys/db";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { isUuid } from "@/lib/crm/filters";
import { askHarmony, cleanQuestion, type AskOutcome } from "@/lib/crm/knowledge/ask";
import { KNOWLEDGE_KINDS, KNOWLEDGE_LIMITS, isKnowledgeCategory } from "@/lib/crm/knowledge/model";
import { deleteEntry, flagEntry, saveValidatedEntry, validateEntry } from "@/lib/crm/knowledge/store";
import { isMissingSchemaError } from "@/lib/pg-errors";

/*
 * Actions de la base de connaissances. Chacune vérifie la session par
 * elle-même :
 * - poser une question et demander une relecture : admin ou commercial actif ;
 * - écrire, corriger, valider, supprimer une fiche : admin seulement.
 * La base est commune : il n'y a pas de portée par commercial ici.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const NOT_READY = "La base de connaissances est en cours d'activation : elle attend la migration 0014.";
const GONE = "Cette fiche n'existe plus.";

/** Entre le déploiement et la migration 0014, les tables manquent : l'action le dit au lieu d'échouer. */
async function guarded<T>(run: () => Promise<T>, onMissing: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isMissingSchemaError(error)) return onMissing;
    throw error;
  }
}

function refresh() {
  revalidatePath("/crm");
  revalidatePath("/crm/questions");
}

/** Pose une question à l'assistant : la réponse est rendue et rangée dans la base commune. */
export async function askQuestion(question: string): Promise<AskOutcome> {
  const user = await requireStaff();
  if (typeof question !== "string") return fail("Question invalide.");
  const outcome = await guarded(() => askHarmony(getDb(), { id: user.id, role: user.role }, question.slice(0, KNOWLEDGE_LIMITS.question * 2)), fail(NOT_READY));
  if (outcome.ok) refresh();
  return outcome;
}

const entrySchema = z.object({
  id: z.string().refine(isUuid, "Identifiant invalide").optional(),
  question: z.string().max(KNOWLEDGE_LIMITS.title * 2),
  kind: z.enum(KNOWLEDGE_KINDS),
  category: z.string().refine(isKnowledgeCategory, "Rubrique inconnue"),
  reply: z.string().max(KNOWLEDGE_LIMITS.reply * 2),
  details: z.string().max(KNOWLEDGE_LIMITS.details * 2).optional().default(""),
});

const multiline = (text: string) =>
  text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** L'admin écrit une fiche, ou corrige celle de l'assistant : elle est validée du même geste. */
export async function saveKnowledge(input: unknown): Promise<Result<{ id: string }>> {
  const admin = await requireAdmin();
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return fail("Fiche invalide : vérifiez la rubrique et la longueur des textes.");
  const question = cleanQuestion(parsed.data.question);
  const reply = multiline(parsed.data.reply);
  const details = multiline(parsed.data.details);
  if (question.length < KNOWLEDGE_LIMITS.questionMin) return fail("Écrivez la question en entier.");
  if (question.length > KNOWLEDGE_LIMITS.title) return fail(`La question tient en ${KNOWLEDGE_LIMITS.title} caractères au plus.`);
  if (!reply) return fail("Écrivez la réponse à donner au téléphone.");
  if (reply.length > KNOWLEDGE_LIMITS.reply) return fail(`La réponse tient en ${KNOWLEDGE_LIMITS.reply} caractères au plus : le détail va dans les faits à l'appui.`);
  if (details.length > KNOWLEDGE_LIMITS.details) return fail(`Les faits à l'appui tiennent en ${KNOWLEDGE_LIMITS.details} caractères au plus.`);
  return guarded<Result<{ id: string }>>(async () => {
    const id = await saveValidatedEntry(getDb(), admin.id, { question, kind: parsed.data.kind, category: parsed.data.category, reply, details }, parsed.data.id);
    if (!id) return fail(GONE);
    refresh();
    return { ok: true, id };
  }, fail(NOT_READY));
}

/** L'admin valide la réponse de l'assistant telle qu'elle est. */
export async function validateKnowledge(id: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return fail(GONE);
  return guarded<Result>(async () => {
    if (!(await validateEntry(getDb(), admin.id, id))) return fail(GONE);
    refresh();
    return { ok: true };
  }, fail(NOT_READY));
}

/** Un commercial (ou l'admin) demande que la réponse soit relue. */
export async function flagKnowledge(id: string): Promise<Result> {
  await requireStaff();
  if (!isUuid(id)) return fail(GONE);
  return guarded<Result>(async () => {
    // Sans effet sur une fiche déjà validée ou déjà à vérifier : la demande est entendue dans tous les cas
    await flagEntry(getDb(), id);
    refresh();
    return { ok: true };
  }, fail(NOT_READY));
}

export async function deleteKnowledge(id: string): Promise<Result> {
  await requireAdmin();
  if (!isUuid(id)) return fail(GONE);
  return guarded<Result>(async () => {
    if (!(await deleteEntry(getDb(), id))) return fail(GONE);
    refresh();
    return { ok: true };
  }, fail(NOT_READY));
}
