"use server";

import { requireClient } from "@/lib/auth";
import { recordToursSeen } from "@/lib/visite/data";
import { TOUR_IDS, isTourId, type TourId } from "@/lib/visite/engine";

/**
 * Note des visites guidées comme vues pour le site de la session. Une session
 * ouverte par l'équipe (mode support) ne note rien : la visite reste à
 * proposer au praticien. `false` : rien n'a été enregistré (le navigateur garde
 * alors son propre repli).
 */
async function record(tours: readonly TourId[]): Promise<boolean> {
  const session = await requireClient();
  if (session.impersonated) return false;
  try {
    await recordToursSeen(session.siteId, tours);
    return true;
  } catch (error) {
    console.error("[visite] visite vue non enregistrée", error instanceof Error ? error.name : "erreur");
    return false;
  }
}

/** Une visite a été suivie ou passée : elle ne se proposera plus d'elle-même. */
export async function markTourSeen(tour: unknown): Promise<boolean> {
  if (!isTourId(tour)) return false;
  return record([tour]);
}

/**
 * La visite d'accueil a été remise à plus tard une deuxième fois : toutes les
 * visites sont notées vues, plus aucune ne se propose d'elle-même (elles
 * restent relançables par leur bouton « Visite guidée »).
 */
export async function dismissTours(): Promise<boolean> {
  return record(TOUR_IDS);
}
