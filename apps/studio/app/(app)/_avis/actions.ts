"use server";

import { getDb, hitRateLimit, productFeedback } from "@theralys/db";
import { checkFeedback } from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { FEEDBACK_RATE_LIMIT } from "@/lib/feedback";
import { isMissingSchemaError } from "@/lib/social/data";

export type SendFeedbackResult = { ok: true } | { ok: false; field: "message" | "form"; error: string };

const UNAVAILABLE = "Cet espace n'est pas encore ouvert : réessayez un peu plus tard.";

/**
 * « Envoyer mon avis » : ouvert à chaque praticien, quelle que soit sa
 * formule. Une session ouverte par l'équipe (mode support) n'écrit pas d'avis
 * au nom du praticien.
 */
export async function sendFeedback(input: unknown): Promise<SendFeedbackResult> {
  const session = await requireClient();
  if (session.impersonated) return { ok: false, field: "form", error: "En mode support, l'avis du praticien ne peut pas être envoyé à sa place." };
  const checked = checkFeedback(input);
  if (!checked.ok) return checked;

  const db = getDb();
  const limit = await hitRateLimit(db, FEEDBACK_RATE_LIMIT, session.siteId);
  if (!limit.allowed) return { ok: false, field: "form", error: "Vous nous avez déjà beaucoup écrit aujourd'hui : merci ! Revenez demain pour la suite." };

  const { kind, topic, message, rating, contactOk, page } = checked.value;
  try {
    await db.insert(productFeedback).values({ siteId: session.siteId, userId: session.userId, kind, topic, rating, message, contactOk, page });
  } catch (err) {
    if (isMissingSchemaError(err)) return { ok: false, field: "form", error: UNAVAILABLE };
    console.error("[avis] enregistrement échoué", { siteId: session.siteId, err });
    return { ok: false, field: "form", error: "Votre avis n'a pas pu être envoyé — réessayez dans un instant." };
  }
  console.info("[avis] reçu", { siteId: session.siteId, kind, topic, rating });
  return { ok: true };
}
