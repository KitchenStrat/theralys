/**
 * Formules des comptes clients, côté admin. Réservé au serveur.
 */

import { and, eq, inArray, lt, notExists, sql } from "drizzle-orm";
import { FORMULAS_SPLIT_AT, PLAN_COMPLETE, onboardingTasks, sites, subscriptions, type Database } from "@theralys/db";

/** Marque d'un compte déjà aligné (une ligne de `onboarding_tasks`, table que le studio n'affiche plus). */
export const FORMULAS_SPLIT_MARKER = "formulas_split";

/**
 * Les comptes clients ouverts avant le découpage de l'offre en deux formules
 * avaient l'offre d'alors : ils ont aujourd'hui les deux formules, Site et
 * Scale. Les passe sur l'offre complète, une seule fois par compte : le
 * compte est ensuite marqué, et ses formules sont celles que l'admin lui
 * donne (ajouter ou retirer une formule n'est jamais défait).
 *
 * « Ouvert avant » se lit sur la date de l'abonnement, créé à la conversion
 * de la démo en client — pas sur celle du site, qui est celle de la démo.
 * Sans effet sur les comptes ouverts depuis.
 */
export async function alignLegacyAccounts(db: Database): Promise<number> {
  const legacy = await db
    .select({ id: sites.id })
    .from(sites)
    .innerJoin(subscriptions, eq(subscriptions.siteId, sites.id))
    .where(
      and(
        eq(sites.type, "client"),
        lt(subscriptions.createdAt, FORMULAS_SPLIT_AT),
        notExists(
          db
            .select({ one: sql`1` })
            .from(onboardingTasks)
            .where(and(eq(onboardingTasks.siteId, sites.id), eq(onboardingTasks.key, FORMULAS_SPLIT_MARKER))),
        ),
      ),
    );
  if (legacy.length === 0) return 0;
  const ids = legacy.map((row) => row.id);
  await db.transaction(async (tx) => {
    await tx.update(sites).set({ plan: PLAN_COMPLETE }).where(inArray(sites.id, ids));
    await tx.update(subscriptions).set({ plan: PLAN_COMPLETE }).where(inArray(subscriptions.siteId, ids));
    await tx
      .insert(onboardingTasks)
      .values(ids.map((siteId) => ({ siteId, key: FORMULAS_SPLIT_MARKER, done: true, completedAt: new Date() })))
      .onConflictDoNothing();
  });
  return ids.length;
}
