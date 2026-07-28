"use server";

import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, users } from "@theralys/db";
import { createSession, hashPassword } from "@/lib/auth";

const setPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "8 caractères minimum"),
  confirm: z.string(),
});

/**
 * Création du mot de passe depuis le lien d'invitation (7 jours). Autorisé
 * uniquement tant que le compte porte la sentinelle « invite: » — un compte
 * déjà activé ne peut pas être écrasé par un vieux lien.
 */
export async function setPassword(input: unknown): Promise<{ error?: string }> {
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Formulaire invalide" };
  const { token, password, confirm } = parsed.data;
  if (password !== confirm) return { error: "Les deux mots de passe ne correspondent pas." };

  const secret = process.env.AUTH_SECRET;
  if (!secret) return { error: "Configuration incomplète (AUTH_SECRET)." };

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.purpose !== "studio-password-setup" || typeof payload.sub !== "string") {
      throw new Error("jeton invalide");
    }
    userId = payload.sub;
  } catch {
    return { error: "Ce lien d'invitation a expiré ou est invalide. Demandez-en un nouveau." };
  }

  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || user.role !== "client" || !user.siteId) return { error: "Compte introuvable." };
  if (!user.passwordHash.startsWith("invite:")) {
    return { error: "Ce compte est déjà activé — connectez-vous avec votre mot de passe." };
  }

  await db
    .update(users)
    .set({ passwordHash: hashPassword(password) })
    .where(eq(users.id, user.id));

  await createSession(user);
  redirect("/");
}
