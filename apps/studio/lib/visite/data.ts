import { and, eq, like } from "drizzle-orm";
import { getDb, onboardingTasks } from "@theralys/db";
import { TOUR_KEY_PREFIX, seenFromKeys, tourKey, type TourId } from "./engine";

/**
 * Visites guidées déjà vues par un site, lues dans `onboarding_tasks` (une
 * ligne `tour:<visite>` par visite vue). `null` : l'état n'a pas pu être lu —
 * aucune visite ne se propose alors d'elle-même. Seul le nom de l'erreur est
 * journalisé, jamais une donnée du compte.
 */
export async function readSeenTours(siteId: string): Promise<TourId[] | null> {
  try {
    const rows = await getDb()
      .select({ key: onboardingTasks.key })
      .from(onboardingTasks)
      .where(and(eq(onboardingTasks.siteId, siteId), eq(onboardingTasks.done, true), like(onboardingTasks.key, `${TOUR_KEY_PREFIX}%`)));
    return seenFromKeys(rows.map((row) => row.key));
  } catch (error) {
    console.error("[visite] état des visites illisible", error instanceof Error ? error.name : "erreur");
    return null;
  }
}

/** Note des visites comme vues pour un site (sans effet pour celles qui le sont déjà). */
export async function recordToursSeen(siteId: string, tours: readonly TourId[]): Promise<void> {
  if (tours.length === 0) return;
  const now = new Date();
  await getDb()
    .insert(onboardingTasks)
    // `position` : loin derrière les tâches historiques de la table, que ces lignes ne côtoient dans aucune liste
    .values(tours.map((tour) => ({ siteId, key: tourKey(tour), done: true, completedAt: now, position: 100 })))
    .onConflictDoUpdate({ target: [onboardingTasks.siteId, onboardingTasks.key], set: { done: true, completedAt: now } });
}
