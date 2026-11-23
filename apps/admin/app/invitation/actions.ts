"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { crmReps, getDb, hitRateLimit, rateLimitMessage, users, type RateLimitRule } from "@theralys/db";
import { requestIp } from "@theralys/shared";
import { createSession, hashPassword } from "@/lib/auth";
import { judgeInvitation, readRepInvitation, type InvitationVerdict } from "@/lib/crm/invitation";
import { isMissingSchemaError } from "@/lib/pg-errors";

/*
 * Actions publiques de la page d'invitation d'un commercial. Le jeton n'y
 * arrive que dans le corps de la requête, et n'est écrit dans aucun journal.
 */

export type InvitationState = { kind: "ok"; firstName: string; email: string } | { kind: Exclude<InvitationVerdict, "ok"> };

const MESSAGES: Record<Exclude<InvitationVerdict, "ok">, string> = {
  invalid: "Ce lien d'invitation a expiré ou n'est plus valable. Demandez-en un nouveau à votre responsable.",
  used: "Ce compte est déjà activé : connectez-vous avec votre mot de passe.",
  disabled: "Cet accès a été désactivé. Voyez avec votre responsable.",
};

/** Créations de mot de passe par adresse d'origine : un lien ne se devine pas, mais la page ne sert pas de banc d'essai. */
const ACCEPT_LIMIT: RateLimitRule = { scope: "admin-invitation:ip", limit: 15, windowSeconds: 15 * 60 };

type Account = { id: string; name: string; email: string; role: string; passwordHash: string; disabledAt: Date | null };

/** Le compte que désigne une invitation, tel qu'il est maintenant en base (null avant la migration 0012). */
async function loadAccount(userId: string): Promise<Account | null> {
  try {
    const [account] = await getDb()
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, passwordHash: users.passwordHash, disabledAt: crmReps.disabledAt })
      .from(users)
      .innerJoin(crmReps, eq(crmReps.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    return account ?? null;
  } catch (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
}

async function judge(token: string): Promise<{ verdict: InvitationVerdict; account: Account | null }> {
  const secret = process.env.AUTH_SECRET;
  const claims = secret ? await readRepInvitation(token, secret) : null;
  const account = claims ? await loadAccount(claims.userId) : null;
  return { verdict: judgeInvitation(claims, account), account };
}

/** Ce que vaut le lien ouvert : de quoi accueillir le commercial, ou lui dire pourquoi le lien ne sert plus. */
export async function inspectInvitation(token: unknown): Promise<InvitationState> {
  if (typeof token !== "string" || token.length > 2000) return { kind: "invalid" };
  const { verdict, account } = await judge(token);
  if (verdict !== "ok" || !account) return { kind: verdict === "ok" ? "invalid" : verdict };
  return { kind: "ok", firstName: account.name.split(" ")[0] ?? account.name, email: account.email };
}

// Mêmes règles que la création du mot de passe d'un client dans le studio ; la longueur est bornée pour le hachage
const acceptSchema = z.object({
  token: z.string().min(10).max(2000),
  password: z.string().min(8, "8 caractères minimum").max(200, "200 caractères au plus"),
  confirm: z.string().max(200),
});

/**
 * Création du mot de passe depuis le lien d'invitation. Usage unique : le
 * mot de passe ne remplace que la sentinelle « invite: » pour laquelle le
 * lien a été signé — un lien déjà servi, ou remplacé par un plus récent, ne
 * peut plus rien écrire. En cas de succès, la session s'ouvre sur le CRM.
 */
export async function acceptInvitation(input: unknown): Promise<{ error: string }> {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Formulaire invalide" };
  const { token, password, confirm } = parsed.data;
  if (password !== confirm) return { error: "Les deux mots de passe ne correspondent pas." };
  if (!process.env.AUTH_SECRET) return { error: "Configuration incomplète (AUTH_SECRET)." };

  // Page publique : les essais sont comptés par adresse d'origine
  const db = getDb();
  const decision = await hitRateLimit(db, ACCEPT_LIMIT, requestIp(await headers()));
  if (!decision.allowed) return { error: rateLimitMessage(decision) };

  const { verdict, account } = await judge(token);
  if (verdict !== "ok" || !account) return { error: MESSAGES[verdict === "ok" ? "invalid" : verdict] };

  const [activated] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(and(eq(users.id, account.id), eq(users.passwordHash, account.passwordHash)))
    .returning();
  if (!activated) return { error: MESSAGES.used };
  await db.update(crmReps).set({ lastLoginAt: new Date() }).where(eq(crmReps.userId, account.id));

  await createSession(activated);
  redirect("/crm");
}
