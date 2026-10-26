/**
 * Posts Google → moteur de rendu social : un post Google porte une seule
 * diapositive (`content.slide`) rendue en 4:3 (`landscape`). L'adaptateur
 * construit le `SocialPostContent` attendu par les templates et le cache,
 * et désigne la table `google_posts` pour `assets` (`jsonb_set`) et les
 * chemins Blob.
 */

import type { GooglePost } from "@theralys/db";
import { GOOGLE_POST_CTAS, type GooglePostContent, type SocialPostContent } from "@theralys/shared";
import type { CachedRenderInput } from "@/lib/social/render/cache";

export const GOOGLE_POST_SIZE = "landscape" as const;

/** Contenu social équivalent (légende = texte du post, sans hashtags, une diapositive). */
export function googleToSocialContent(content: GooglePostContent): SocialPostContent {
  return {
    pillar: content.pillar,
    accentRole: content.accentRole,
    caption: content.summary,
    hashtags: [],
    altText: content.altText,
    slides: [{ ...content.slide, role: "single" }],
    sourceRefs: content.sourceRefs,
    ...(content.note ? { note: content.note } : {}),
    voice: content.voice,
    generator: content.generator,
  };
}

/** Post Google prêt pour `renderSlideCached` (table `google`). */
export function renderableGooglePost(post: GooglePost): CachedRenderInput["post"] {
  return {
    id: post.id,
    siteId: post.siteId,
    table: "google",
    template: post.template,
    accentColor: post.accentColor,
    content: googleToSocialContent(post.content),
    assets: post.assets,
  };
}

/** Libellé du bouton d'action (« Réserver », « Appeler »…). */
export function ctaLabel(type: GooglePostContent["cta"]["type"]): string {
  return GOOGLE_POST_CTAS.find((c) => c.id === type)?.label ?? type;
}

/** Texte prêt à coller sur Google : texte du post, puis bouton d'action et texte alternatif en mémo. */
export function googlePostTxt(content: GooglePostContent): string {
  const parts = [content.summary.trim()];
  if (content.cta.type !== "NONE") {
    parts.push(`Bouton : ${ctaLabel(content.cta.type)}${content.cta.url ? ` → ${content.cta.url}` : ""}`);
  }
  if (content.altText.trim() !== "") parts.push(`Texte alternatif : ${content.altText.trim()}`);
  return `${parts.join("\n\n")}\n`;
}
