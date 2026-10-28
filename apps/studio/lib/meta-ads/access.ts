import { and, eq } from "drizzle-orm";
import { getDb, hasMetaAds, metaAdsAnalyses, type MetaAdsAnalysis, type PlanId } from "@theralys/db";
import type { MetaAdCreative } from "@theralys/shared";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CREATIVE_ID_RE = /^[a-z0-9_-]{1,32}$/i;

/**
 * Accès à la section « Meta Ads » : les démos présentent l'offre complète,
 * les clients suivent leur formule (Scale). Vérifié par la page, par chaque
 * server action et par les routes de rendu / téléchargement des créas.
 */
export function metaAccess(site: { type: string; plan: PlanId }): boolean {
  return site.type === "demo" || hasMetaAds(site.plan);
}

/**
 * Analyse Meta Ads aboutie appartenant au site de la session — null sinon
 * (un id d'un autre site, mal formé, ou une analyse en cours / en erreur est
 * introuvable, jamais une erreur).
 */
export async function ownedMetaAnalysis(siteId: string, analysisId: string): Promise<MetaAdsAnalysis | null> {
  if (!UUID_RE.test(analysisId)) return null;
  return (
    (await getDb().query.metaAdsAnalyses.findFirst({
      where: and(eq(metaAdsAnalyses.id, analysisId), eq(metaAdsAnalyses.siteId, siteId), eq(metaAdsAnalyses.status, "done")),
    })) ?? null
  );
}

/** Créa d'une analyse par identifiant (« c1 »…), null si absente ou identifiant mal formé. */
export function creativeOf(analysis: Pick<MetaAdsAnalysis, "creatives">, creativeId: string): MetaAdCreative | null {
  if (!CREATIVE_ID_RE.test(creativeId)) return null;
  return analysis.creatives?.creatives.find((c) => c.id === creativeId) ?? null;
}
