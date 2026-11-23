"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, hitRateLimit, rateLimitMessage, users, type RateLimitRule } from "@theralys/db";
import { requestIp } from "@theralys/shared";
import { createSession, hashPassword, passwordFingerprint } from "@/lib/auth";
import { PASSWORD_RESET_PURPOSE, passwordLinkState, readPasswordLink } from "@/lib/password-links";

const setPasswordSchema = z.object({
  token: z.string().min(10).max(2000),
  password: z.string().min(8, "8 caractères minimum").max(200, "200 caractères maximum"),
  confirm: z.string().max(200),
});

/** Essais de création de mot de passe par adresse : un lien se devine pas, mais la page ne sert pas de banc d'essai. */
const SET_PASSWORD_LIMIT: RateLimitRule = { scope: "password:set", limit: 15, windowSeconds: 15 * 60 };

/**
 * Choix du mot de passe depuis un lien signé : invitation (7 jours, compte
 * jamais activé — un compte déjà activé ne peut pas être écrasé par un vieux
 * lien) ou réinitialisation (1 heure). Le lien ne sert qu'une fois : l'écriture
 * n'a lieu que si le mot de passe en place est toujours celui que le lien a vu.
 */
export async function setPassword(input: unknown): Promise<{ error?: string }> {
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Formulaire invalide" };
  const { token, password, confirm } = parsed.data;
  if (password !== confirm) return { error: "Les deux mots de passe ne correspondent pas." };

  const secret = process.env.AUTH_SECRET;
  if (!secret) return { error: "Configuration incomplète (AUTH_SECRET)." };

  const db = getDb();
  const decision = await hitRateLimit(db, SET_PASSWORD_LIMIT, requestIp(await headers()));
  if (!decision.allowed) return { error: rateLimitMessage(decision) };

  const link = await readPasswordLink(token, secret);
  if (!link) return { error: "Ce lien a expiré ou est invalide. Demandez-en un nouveau." };

  const user = await db.query.users.findFirst({ where: eq(users.id, link.userId) });
  if (!user || user.role !== "client" || !user.siteId) return { error: "Compte introuvable." };
  const state = passwordLinkState(link, user, passwordFingerprint);
  if (state === "already") return { error: "Ce compte est déjà activé — connectez-vous avec votre mot de passe." };
  if (state === "stale") {
    return {
      error:
        link.purpose === PASSWORD_RESET_PURPOSE
          ? "Ce lien a déjà servi ou n'est plus valable. Demandez-en un nouveau depuis la page de connexion."
          : "Ce lien d'invitation n'est plus valable. Contactez Harmony pour en recevoir un nouveau.",
    };
  }

  // Écriture conditionnelle : deux envois simultanés du même lien, un seul gagne
  const passwordHash = await hashPassword(password);
  const updated = await db
    .update(users)
    .set({ passwordHash })
    .where(and(eq(users.id, user.id), eq(users.passwordHash, user.passwordHash)))
    .returning({ id: users.id });
  if (updated.length === 0) return { error: "Ce lien a déjà servi. Connectez-vous avec votre mot de passe." };

  await createSession({ ...user, passwordHash });
  redirect("/");
}
