"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { crmReps, getDb, users } from "@theralys/db";
import { requireAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/crm/filters";
import { newInviteSentinel, signRepInvitation } from "@/lib/crm/invitation";
import { invitationPath } from "@/lib/crm/invitation-link";
import { cleanText, normalizeEmail } from "@/lib/crm/normalize";
import { assignableRep } from "@/lib/crm/team";
import { reassignOwned } from "@/lib/crm/write";
import { pgErrorCode } from "@/lib/pg-errors";

/*
 * Gestion des comptes des commerciaux. Toutes ces actions sont réservées à
 * l'admin (`requireAdmin` renvoie un commercial vers son CRM). Le lien
 * d'invitation est rendu à l'écran de l'admin, qui le transmet lui-même ; il
 * n'est écrit dans aucun journal.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const uuid = z.string().refine(isUuid, "Identifiant invalide");

const NO_SUCH_REP = "Ce commercial n'existe plus.";
const NOT_READY = "L'équipe attend la migration 0012_crm_sales : appliquez-la, puis recommencez.";

function refresh(repId?: string) {
  revalidatePath("/equipe");
  if (repId) revalidatePath(`/equipe/${repId}`);
  revalidatePath("/crm");
}

/** Chemin du lien d'invitation d'un compte qui attend son mot de passe (l'écran y ajoute l'adresse du back-office). */
async function invitePathFor(rep: { userId: string; passwordHash: string }): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  return secret ? invitationPath(await signRepInvitation(rep, secret)) : null;
}

const createSchema = z.object({ name: z.string().max(200), email: z.string().max(400) });

/**
 * Crée le compte d'un commercial, sans mot de passe utilisable : il choisit
 * le sien depuis le lien d'invitation (7 jours, usage unique) que l'admin
 * lui transmet.
 */
export async function createRep(input: unknown): Promise<Result<{ id: string; invitePath: string }>> {
  await requireAdmin();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("Formulaire invalide.");
  const name = cleanText(parsed.data.name, 80);
  const email = normalizeEmail(parsed.data.email);
  if (name.length < 2) return fail("Donnez le nom du commercial.");
  if (!email) return fail("Cet e-mail n'a pas la forme d'une adresse.");
  if (!process.env.AUTH_SECRET) return fail("Configuration incomplète (AUTH_SECRET).");
  const db = getDb();
  const passwordHash = newInviteSentinel();
  try {
    const created = await db.transaction(async (tx) => {
      // Un e-mail, un compte : quel que soit son rôle (client du studio compris) et sa casse
      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);
      if (taken) return null;
      const [user] = await tx.insert(users).values({ email, name, role: "sales", passwordHash }).returning({ id: users.id });
      await tx.insert(crmReps).values({ userId: user!.id });
      return user!;
    });
    if (!created) return fail("Un compte existe déjà avec cet e-mail.");
    const invitePath = await invitePathFor({ userId: created.id, passwordHash });
    refresh();
    return invitePath ? { ok: true, id: created.id, invitePath } : fail("Configuration incomplète (AUTH_SECRET).");
  } catch (error) {
    const code = pgErrorCode(error);
    if (code === "23505") return fail("Un compte existe déjà avec cet e-mail.");
    // Rôle « sales » ou table crm_reps absents : la migration 0012 n'est pas appliquée
    if (code === "22P02" || code === "42P01") return fail(NOT_READY);
    throw error;
  }
}

/**
 * Nouveau lien d'invitation. Le compte repasse en attente de mot de passe :
 * les liens précédents cessent de valoir et, pour un compte déjà actif (mot
 * de passe oublié ou compromis), l'ancien mot de passe aussi — les sessions
 * ouvertes avec lui sont fermées pour de bon.
 */
export async function renewRepInvitation(input: unknown): Promise<Result<{ invitePath: string }>> {
  await requireAdmin();
  const parsed = z.object({ id: uuid }).safeParse(input);
  if (!parsed.success) return fail("Demande invalide.");
  const db = getDb();
  const [rep] = await db
    .select({ id: users.id, disabledAt: crmReps.disabledAt })
    .from(users)
    .innerJoin(crmReps, eq(crmReps.userId, users.id))
    .where(and(eq(users.id, parsed.data.id), eq(users.role, "sales")))
    .limit(1);
  if (!rep) return fail(NO_SUCH_REP);
  if (rep.disabledAt) return fail("Ce compte est désactivé : réactivez-le avant de lui envoyer un lien.");
  const passwordHash = newInviteSentinel();
  await db
    .update(users)
    .set({ passwordHash })
    .where(and(eq(users.id, rep.id), eq(users.role, "sales")));
  const invitePath = await invitePathFor({ userId: rep.id, passwordHash });
  refresh(rep.id);
  return invitePath ? { ok: true, invitePath } : fail("Configuration incomplète (AUTH_SECRET).");
}

/** Désactive ou réactive un compte. Désactivé, il ne se connecte plus, et sa session ouverte est coupée à sa page suivante. */
export async function setRepDisabled(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = z.object({ id: uuid, disabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("Demande invalide.");
  const [rep] = await getDb()
    .update(crmReps)
    .set({ disabledAt: parsed.data.disabled ? new Date() : null })
    .where(eq(crmReps.userId, parsed.data.id))
    .returning({ userId: crmReps.userId });
  if (!rep) return fail(NO_SUCH_REP);
  refresh(rep.userId);
  return { ok: true };
}

/** Réattribue tous les prospects d'un commercial à un autre (`toId`), ou à personne (`toId` nul). */
export async function reassignRepContacts(input: unknown): Promise<Result<{ count: number }>> {
  const admin = await requireAdmin();
  const parsed = z.object({ fromId: uuid, toId: uuid.nullable() }).safeParse(input);
  if (!parsed.success) return fail("Demande invalide.");
  const { fromId, toId } = parsed.data;
  if (toId === fromId) return fail("Choisissez un autre commercial.");
  const db = getDb();
  const [from] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(crmReps, eq(crmReps.userId, users.id))
    .where(and(eq(users.id, fromId), eq(users.role, "sales")))
    .limit(1);
  if (!from) return fail(NO_SUCH_REP);
  const owner = toId ? await assignableRep(db, toId) : null;
  if (toId && !owner) return fail("Le commercial choisi n'existe pas, ou son compte est désactivé.");
  const count = await db.transaction((tx) => reassignOwned(tx, { id: admin.id, role: admin.role }, fromId, owner));
  refresh(fromId);
  if (toId) revalidatePath(`/equipe/${toId}`);
  return { ok: true, count };
}
