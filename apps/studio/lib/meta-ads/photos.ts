import { getDb } from "@theralys/db";
import { loadGoogleBrief } from "@theralys/jobs";
import type { MetaAdCreative } from "@theralys/shared";

/**
 * URL de la photo d'une créa : `photoId` (« p3 ») résolu dans le catalogue de
 * photos du site, le même que celui transmis au générateur (`loadGoogleBrief`
 * de `@theralys/jobs`, qui fournit `photosById`). Null sans photo ou si le
 * catalogue a changé depuis la génération (le visuel est alors rendu sans
 * photo plutôt qu'en erreur).
 */
export async function metaCreativePhotoUrl(siteId: string, creative: Pick<MetaAdCreative, "photoId">): Promise<string | null> {
  if (!creative.photoId) return null;
  const { photosById } = await loadGoogleBrief(getDb(), siteId);
  return photosById[creative.photoId] ?? null;
}
