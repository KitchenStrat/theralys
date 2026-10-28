import { getDb } from "@theralys/db";
import { loadGoogleBrief } from "@theralys/jobs";
import type { MetaAdCreative } from "@theralys/shared";

/** Résolution d'un identifiant de photo (« p3 ») en URL, null si inconnu. */
export type MetaPhotoResolver = (siteId: string, photoId: string) => Promise<string | null>;

/**
 * Repli : le catalogue de photos du site, le même que celui transmis au
 * générateur (`loadGoogleBrief` de `@theralys/jobs`, qui fournit `photosById`).
 */
const resolveFromBrief: MetaPhotoResolver = async (siteId, photoId) => {
  const { photosById } = await loadGoogleBrief(getDb(), siteId);
  return photosById[photoId] ?? null;
};

/**
 * URL de la photo d'une créa : `photoUrl` posée par le service à la génération
 * quand elle existe (aucune lecture du brief au rendu), sinon `photoId`
 * résolu dans le catalogue du site. Null sans photo ou si le catalogue a
 * changé depuis la génération (le visuel est alors rendu sans photo plutôt
 * qu'en erreur).
 */
export async function metaCreativePhotoUrl(
  siteId: string,
  creative: Pick<MetaAdCreative, "photoId" | "photoUrl">,
  resolve: MetaPhotoResolver = resolveFromBrief,
): Promise<string | null> {
  if (!creative.photoId) return null;
  const given = typeof creative.photoUrl === "string" ? creative.photoUrl.trim() : "";
  if (/^https?:\/\//.test(given)) return given;
  return resolve(siteId, creative.photoId);
}
