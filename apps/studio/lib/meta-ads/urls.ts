/**
 * URL des routes de rendu et de téléchargement des créas Meta
 * (`app/api/meta-ads/[analysisId]/creatives/[creativeId]/…`). L'aperçu porte
 * un paramètre `v` (date de génération du jeu de créas) que la route ignore :
 * après une régénération, les identifiants d'analyse et de créa ne changent
 * pas, seule cette version change — l'URL diffère donc et le navigateur
 * recharge le visuel au lieu de garder l'ancien. Fonctions pures.
 */

import type { MetaAdsFormat } from "@theralys/shared";

export function metaCreativeApiBase(analysisId: string, creativeId: string): string {
  return `/api/meta-ads/${encodeURIComponent(analysisId)}/creatives/${encodeURIComponent(creativeId)}`;
}

/** Aperçu (540 px) d'un format, versionné par la date de génération des créas. */
export function metaCreativePreviewUrl(analysisId: string, creativeId: string, size: MetaAdsFormat, version: string): string {
  return `${metaCreativeApiBase(analysisId, creativeId)}/render?size=${size}&preview=1&v=${encodeURIComponent(version)}`;
}

/** Téléchargement d'un visuel (`size`) ou du kit complet (`kit`). */
export function metaCreativeDownloadUrl(analysisId: string, creativeId: string, what: { size: MetaAdsFormat } | { kit: true }): string {
  const base = `${metaCreativeApiBase(analysisId, creativeId)}/download`;
  return "kit" in what ? `${base}?kit=1` : `${base}?size=${what.size}`;
}
