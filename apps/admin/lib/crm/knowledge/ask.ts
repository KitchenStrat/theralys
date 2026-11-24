/**
 * Une question posée à l'assistant du CRM, de bout en bout : la retrouver si
 * elle a déjà été posée, sinon réunir ce qu'on sait (définition du produit,
 * page publique, réponses validées), demander la réponse, et ranger la fiche
 * dans la base commune.
 *
 * - Une question déjà posée dans les mêmes mots est rendue sans appel au
 *   modèle.
 * - Une question que l'assistant reconnaît comme déjà posée rejoint sa fiche :
 *   une réponse validée est rendue telle quelle, une réponse non relue est
 *   remplacée par la nouvelle.
 * - Une réponse que les sources ne couvrent pas part « à vérifier ».
 */

import { createSalesAssistant, type SalesAssistant } from "@theralys/ai";
import { hitRateLimit, rateLimitMessage, type Database, type RateLimitRule } from "@theralys/db";
import { withApiUsage } from "@theralys/shared/usage-runtime";
import type { CrmViewer } from "../access";
import { loadLandingText } from "./landing";
import { FALLBACK_CATEGORY, KNOWLEDGE_CATEGORIES, KNOWLEDGE_LIMITS, isKnowledgeCategory, questionKey, type KnowledgeStatus } from "./model";
import { productFacts } from "./product";
import { createAskedEntry, findAsked, getKnowledgeRow, promptMaterial, recordAsk, refreshUnvalidated, type KnowledgeRow } from "./store";

/** Par personne : de quoi tenir une journée d'appels, pas de quoi vider le budget du modèle. */
export const ASK_RATE_LIMIT: RateLimitRule = { scope: "crm:ask", limit: 40, windowSeconds: 60 * 60 };

export type AskOrigin =
  /** Déjà posée dans les mêmes mots : rendue sans appel au modèle */
  | "known"
  /** Reconnue par l'assistant comme une question de la base */
  | "matched"
  /** Nouvelle fiche */
  | "new";

export type AskOutcome = { ok: true; entry: KnowledgeRow; origin: AskOrigin } | { ok: false; error: string };

export type AskDeps = {
  assistant?: SalesAssistant;
  landing?: () => Promise<string>;
};

const TOO_SHORT = "Votre question est trop courte : dites-la comme le praticien vous l'a dite.";
const TOO_LONG = `Votre question est trop longue (${KNOWLEDGE_LIMITS.question} caractères au plus) : gardez l'essentiel.`;
const FAILED = "La réponse n'a pas pu être rédigée. Réessayez dans un instant.";

/** La question, espaces remis au propre. */
export function cleanQuestion(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function askHarmony(db: Database, viewer: CrmViewer, rawQuestion: string, deps: AskDeps = {}): Promise<AskOutcome> {
  const question = cleanQuestion(rawQuestion);
  const key = questionKey(question);
  if (question.length < KNOWLEDGE_LIMITS.questionMin || key.length < 4) return { ok: false, error: TOO_SHORT };
  if (question.length > KNOWLEDGE_LIMITS.question) return { ok: false, error: TOO_LONG };

  const rendered = async (id: string, origin: AskOrigin): Promise<AskOutcome> => {
    const entry = await getKnowledgeRow(db, viewer, id);
    return entry ? { ok: true, entry, origin } : { ok: false, error: FAILED };
  };

  // Déjà posée dans ces mots : la fiche, sans rien demander au modèle
  const known = await findAsked(db, key);
  if (known) {
    await recordAsk(db, known.id, viewer.id, question);
    return rendered(known.id, "known");
  }

  const limit = await hitRateLimit(db, ASK_RATE_LIMIT, viewer.id);
  if (!limit.allowed) return { ok: false, error: rateLimitMessage(limit).replace("Trop de tentatives.", "Beaucoup de questions en peu de temps.") };

  const assistant = deps.assistant ?? createSalesAssistant();
  try {
    // Sans modèle (démonstration), la page publique n'est pas relue : aucun appel réseau
    const [material, landing] = await Promise.all([promptMaterial(db, question), assistant.mode === "mock" ? Promise.resolve("") : (deps.landing ?? loadLandingText)()]);
    // L'appel au modèle s'inscrit au registre des coûts sous « Assistant commercial »
    const answer = await withApiUsage({ feature: "sales_assistant" }, () =>
      assistant.answer({
        question,
        categories: KNOWLEDGE_CATEGORIES,
        knowledge: { product: productFacts(), landing, validated: material.validated },
        existing: material.existing,
      }),
    );
    const status: KnowledgeStatus = answer.covered ? "ai" : "review";
    const category = isKnowledgeCategory(answer.category) ? answer.category : FALLBACK_CATEGORY;
    const same = answer.sameAs ? material.byRef.get(answer.sameAs) : undefined;
    if (same) {
      if (same.status !== "validated") await refreshUnvalidated(db, same.id, { kind: answer.kind, category, reply: answer.reply, details: answer.details }, status);
      await recordAsk(db, same.id, viewer.id, question);
      return rendered(same.id, "matched");
    }
    const id = await createAskedEntry(db, { question: answer.title, kind: answer.kind, category, reply: answer.reply, details: answer.details }, status, viewer.id, question);
    return rendered(id, "new");
  } catch (error) {
    // Ni la question ni la réponse dans le journal : le nom de l'erreur suffit à diagnostiquer
    console.error(`[assistant] réponse non rédigée : ${error instanceof Error ? `${error.name} — ${error.message.slice(0, 200)}` : "erreur"}`);
    return { ok: false, error: FAILED };
  }
}
