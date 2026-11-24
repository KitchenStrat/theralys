/**
 * Photos des visuels, côté espace client : fournit à chaque contenu préparé
 * la photo voulue par le réglage du Paramétrage (IA, banque d'images, les
 * deux), et garde d'une régénération à l'autre celle que le praticien a
 * envoyée lui-même.
 */

import { applyCoverPhoto, createImageProvider, createStockImageProvider, resolveAiMode, sourceSocialPhotos, uploadedCoverPhoto, type FinalizedPost } from "@theralys/ai";
import type { Site } from "@theralys/db";
import { SOCIAL_PHOTO_DATA_URI_MAX_CHARS, isSocialPhotoUrl, portraitSafeUrl, type SocialPostContent, type SocialSiteBrief } from "@theralys/shared";
import { attributeApiUsage } from "@theralys/shared/usage-runtime";
import type { SocialSettingsView } from "./settings";

type Brand = SocialSiteBrief["practitioner"];

/**
 * Donne leur photo aux contenus qui viennent d'être préparés. Tant que le
 * réglage n'existe pas en base (migration 0015), rien n'est changé : les
 * visuels gardent les photos du site, comme avant.
 */
export async function withSourcedPhotos(site: Pick<Site, "id" | "theme">, settings: SocialSettingsView, practitioner: Brand, posts: readonly FinalizedPost[], nonce: string): Promise<FinalizedPost[]> {
  if (!settings.photoSourceAvailable) return posts.map(({ photoWanted: _wanted, ...post }) => post);
  // Registre des appels API : recherches et images rattachées aux réseaux sociaux de ce site
  const usage = { feature: "social", siteId: site.id } as const;
  return sourceSocialPhotos(
    posts,
    // Les illustrations d'un fournisseur sans clé ne servent qu'en démonstration, quand la rédaction l'est aussi
    { source: settings.photoSource, practitioner, themeColor: site.theme.palette?.primary, seed: `${site.id}:${nonce}`, allowPlaceholders: resolveAiMode() === "mock" },
    { stock: attributeApiUsage(createStockImageProvider(), usage), images: attributeApiUsage(createImageProvider(), usage) },
  );
}

/**
 * Régénération : la photo que le praticien avait envoyée pour ce contenu
 * reste la sienne, quel que soit le nouveau visuel (une carte de texte se
 * pose alors sur elle).
 */
export function keepUploadedPhoto(previous: SocialPostContent, regenerated: FinalizedPost, practitioner: Brand): { post: FinalizedPost; kept: boolean } {
  const own = uploadedCoverPhoto(previous);
  if (!own) return { post: regenerated, kept: false };
  const { photoWanted: _wanted, ...post } = regenerated;
  return { post: applyCoverPhoto(post, own, practitioner), kept: true };
}

/** Formats d'image acceptés tels que les rend l'envoi de fichiers (`/api/upload`) quand le stockage de secours sert. */
const EMBEDDED_PHOTO = /^data:image\/(jpeg|png|webp|avif);base64,[A-Za-z0-9+/=]+$/;
/** Une photo embarquée plus lourde ne tiendrait pas dans chaque contenu : elle est refusée avec une explication. */
export const EMBEDDED_PHOTO_MAX_CHARS = SOCIAL_PHOTO_DATA_URI_MAX_CHARS;

/**
 * Une adresse rendue par l'envoi de fichiers de l'espace client : le
 * stockage (Blob), ou une petite photo embarquée quand il n'est pas
 * configuré. Aucune autre adresse n'est acceptée comme photo envoyée.
 */
export function uploadedPhotoVerdict(url: string): "ok" | "too-heavy" | "refused" {
  // Stockage de l'espace client, en https (les règles d'adresse des visuels s'appliquent)
  if (portraitSafeUrl(url)) return isSocialPhotoUrl(url) ? "ok" : "refused";
  if (!EMBEDDED_PHOTO.test(url)) return "refused";
  return url.length <= EMBEDDED_PHOTO_MAX_CHARS ? "ok" : "too-heavy";
}
