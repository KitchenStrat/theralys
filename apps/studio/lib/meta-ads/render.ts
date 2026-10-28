/**
 * Créas Meta → moteur de rendu des posts sociaux : une créa statique porte
 * une seule diapositive (accroche = titre, ligne secondaire = texte, photo
 * du site, template parmi ceux acceptant le format `static`), rendue dans
 * trois tailles (`META_ADS_FORMATS` : carré, portrait 4:5, story 9:16).
 * L'adaptateur construit le `SocialPostContent` attendu par les templates et
 * le cache, et désigne la table `meta_ads_analyses` pour `assets`
 * (`jsonb_set`) et les chemins Blob (`meta/<siteId>/<analysisId>/…`), le slot
 * portant l'identifiant de la créa (`variant`).
 */

import type { MetaAdsAnalysis } from "@theralys/db";
import { DEFAULT_SOCIAL_VOICE, META_ADS_FORMATS, type MetaAdCreative, type MetaAdsFormat, type SocialPostContent } from "@theralys/shared";
import type { CachedRenderInput } from "@/lib/social/render/cache";

export { META_ADS_FORMATS };

export function isMetaAdsFormat(value: unknown): value is MetaAdsFormat {
  return META_ADS_FORMATS.some((f) => f === value);
}

/**
 * Contenu social équivalent : une diapositive `single` dont le titre est
 * l'accroche et le corps la ligne secondaire ; `caption` = texte principal ;
 * `photoUrl` (résolue depuis le catalogue de photos du site) ou aucune photo.
 */
export function metaCreativeToSocialContent(creative: MetaAdCreative, photoUrl?: string | null): SocialPostContent {
  const imageUrl = creative.photoId && photoUrl ? photoUrl : undefined;
  return {
    pillar: "specialite",
    accentRole: creative.accentRole,
    caption: creative.primaryText,
    hashtags: [],
    altText: creative.altText,
    slides: [{ role: "single", title: creative.hook, body: creative.subline, ...(imageUrl ? { imageUrl } : {}) }],
    sourceRefs: [],
    voice: DEFAULT_SOCIAL_VOICE,
    generator: "mock",
  };
}

/** Créa prête pour `renderSlideCached` (table `meta`, slot distingué par l'identifiant de la créa). */
export function renderableMetaCreative(
  analysis: Pick<MetaAdsAnalysis, "id" | "siteId" | "assets">,
  creative: MetaAdCreative,
  photoUrl?: string | null,
): CachedRenderInput["post"] & { variant: string } {
  return {
    id: analysis.id,
    siteId: analysis.siteId,
    table: "meta",
    template: creative.template,
    accentColor: null,
    content: metaCreativeToSocialContent(creative, photoUrl),
    assets: analysis.assets,
    variant: creative.id,
  };
}

/** Nom de fichier d'un visuel ou d'un kit : « meta-c1-reassurance-carre.jpg », en ASCII. */
export function metaCreativeFilename(creative: Pick<MetaAdCreative, "id" | "angle">, suffix: string, ext: string): string {
  return `meta-${creative.id}-${creative.angle}-${suffix}.${ext}`.replace(/[^a-z0-9._-]/gi, "-");
}
