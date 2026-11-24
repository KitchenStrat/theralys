/**
 * « Votre avis » côté espace client : la table est-elle là, et combien d'avis
 * un même cabinet peut envoyer.
 */

import { getDb, productFeedback, type RateLimitRule } from "@theralys/db";
import { isMissingSchemaError } from "./social/data";

/** Dix avis par cabinet et par jour : large pour un praticien, court pour un envoi en boucle. */
export const FEEDBACK_RATE_LIMIT: RateLimitRule = { scope: "feedback:site", limit: 10, windowSeconds: 24 * 60 * 60 };

/** Entre deux vérifications tant que la table manque (migration 0016 pas encore appliquée). */
const RECHECK_MS = 60_000;

let ready = false;
let checkedAt = 0;

/**
 * La table des avis existe-t-elle ? Tant que non, l'espace client ne propose
 * pas de donner son avis. Une fois vue, elle n'est plus revérifiée ; absente,
 * elle l'est au plus une fois par minute — jamais une requête par page.
 */
export async function feedbackAvailable(now: number = Date.now()): Promise<boolean> {
  if (ready) return true;
  if (checkedAt !== 0 && now - checkedAt < RECHECK_MS) return false;
  checkedAt = now;
  try {
    await getDb().select({ id: productFeedback.id }).from(productFeedback).limit(1);
    ready = true;
  } catch (err) {
    if (!isMissingSchemaError(err)) console.warn("[avis] table des avis illisible :", err instanceof Error ? err.name : "erreur");
  }
  return ready;
}

/** Pour les tests : oublie ce qui a été vu. */
export function resetFeedbackAvailability(): void {
  ready = false;
  checkedAt = 0;
}
