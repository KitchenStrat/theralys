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

/** Les deux adresses d'un site dont dépend le bouton d'action d'un post. */
export type GooglePostAddresses = {
  /** Adresse du site hébergé (`siteUrl(site)`) */
  hostedUrl: string;
  /** Adresse de référence (`publicSiteUrl(site)`) : celle du site du client s'il est la référence, sinon la même que `hostedUrl` */
  referenceUrl: string;
};

const withoutTrailingSlash = (url: string): string => url.trim().replace(/\/+$/, "");

/**
 * Contenu d'un post tel qu'il est remis au praticien (modale, fichier texte).
 *
 * Un post garde le bouton d'action avec lequel il a été préparé. S'il l'a été
 * avant que le site du client ne devienne la référence, son bouton « En
 * savoir plus » porte encore l'adresse du site hébergé : tant que le post
 * n'est pas publié, c'est l'adresse de référence qui est montrée à la place —
 * sinon le praticien collerait sur sa fiche l'adresse d'un site qu'il a mis
 * en retrait. Ne changent jamais : le lien de rendez-vous, le lien d'un
 * article (les articles vivent sur le blog hébergé) et le bouton d'un post
 * déjà publié (il dit ce qui a été mis en ligne). Sans site du client en
 * référence, les deux adresses sont égales et le contenu est rendu tel quel.
 */
export function deliveredGoogleContent(post: { status: string; content: GooglePostContent }, addresses: GooglePostAddresses): GooglePostContent {
  const { cta } = post.content;
  const hosted = withoutTrailingSlash(addresses.hostedUrl);
  if (post.status === "published" || cta.type !== "LEARN_MORE" || !cta.url) return post.content;
  if (withoutTrailingSlash(addresses.referenceUrl) === hosted || withoutTrailingSlash(cta.url) !== hosted) return post.content;
  return { ...post.content, cta: { ...cta, url: addresses.referenceUrl } };
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
