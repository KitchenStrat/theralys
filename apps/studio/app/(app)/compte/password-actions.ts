"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, hitRateLimit, rateLimitMessage, users, type RateLimitRule } from "@theralys/db";
import { createSession, hashPassword, requireClient, verifyPassword } from "@/lib/auth";

export type ChangePasswordState = { ok?: boolean; error?: string };

/** Essais par compte : le mot de passe actuel ne se devine pas à la chaîne depuis une session laissée ouverte. */
const CHANGE_LIMIT: RateLimitRule = { scope: "password:change", limit: 8, windowSeconds: 15 * 60 };

const schema = z.object({
  current: z.string().min(1, "Saisissez votre mot de passe actuel.").max(200),
  next: z.string().min(8, "Le nouveau mot de passe doit compter au moins 8 caractères.").max(200, "200 caractères maximum."),
  confirm: z.string().max(200),
});

/**
 * Changement du mot de passe depuis « Mon compte ». Le mot de passe actuel est
 * redemandé ; une fois changé, les sessions ouvertes ailleurs avec l'ancien ne
 * sont plus acceptées (le jeton de session porte l'empreinte du mot de passe),
 * et celle-ci est renouvelée.
 */
export async function changePassword(_previous: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const session = await requireClient();
  if (session.impersonated) return { error: "Le mot de passe ne se change pas depuis une session de l'équipe Harmony." };

  const parsed = schema.safeParse({ current: formData.get("current"), next: formData.get("next"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Formulaire invalide" };
  const { current, next, confirm } = parsed.data;
  if (next !== confirm) return { error: "Les deux nouveaux mots de passe ne correspondent pas." };
  if (next === current) return { error: "Le nouveau mot de passe est identique à l'actuel." };

  const db = getDb();
  const decision = await hitRateLimit(db, CHANGE_LIMIT, session.userId);
  if (!decision.allowed) return { error: rateLimitMessage(decision) };

  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user || user.role !== "client" || !(await verifyPassword(current, user.passwordHash))) {
    return { error: "Le mot de passe actuel est incorrect." };
  }

  const passwordHash = await hashPassword(next);
  const updated = await db
    .update(users)
    .set({ passwordHash })
    .where(and(eq(users.id, user.id), eq(users.passwordHash, user.passwordHash)))
    .returning({ id: users.id });
  if (updated.length === 0) return { error: "Votre mot de passe vient d'être modifié ailleurs. Reconnectez-vous." };

  await createSession({ ...user, passwordHash });
  return { ok: true };
}
