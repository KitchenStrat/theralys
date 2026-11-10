/**
 * Stockage durable des visuels de la veille Meta Ads sur Vercel Blob :
 * images redimensionnées en JPEG (affiches des annonces, avatars) et vidéos
 * des exemples gardés. Les annonces sont des contenus publics : les objets
 * sont publics, à chemin déterministe (`meta-media/<annonce>/…`,
 * `meta-library/<site>/<annonce>/…`), écrasés en place.
 *
 * Sans BLOB_READ_WRITE_TOKEN (développement local), aucun stockage : la
 * veille affiche les liens d'origine tant qu'ils vivent.
 */

import type { MetaMediaStore } from "@theralys/jobs";

/** Pixels acceptés en entrée par sharp (au-delà, l'image est refusée). */
const IMAGE_PIXELS_MAX = 60_000_000;
/** Durée de cache des copies (secondes) : un an, le chemin est stable pour un même visuel. */
const CACHE_SECONDS = 31_536_000;

/** Seuls les objets de ce stockage peuvent être supprimés par `remove`. */
export function isMetaMediaBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".public.blob.vercel-storage.com") && /^\/meta-(?:media|library)\//.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function createMetaMediaStore(env: NodeJS.ProcessEnv = process.env): MetaMediaStore | null {
  if (!env.BLOB_READ_WRITE_TOKEN) return null;
  return {
    async putImage(key, bytes, { maxWidth }) {
      const sharp = (await import("sharp")).default;
      const output = await sharp(bytes, { failOn: "none", limitInputPixels: IMAGE_PIXELS_MAX })
        .rotate()
        .resize({ width: maxWidth, withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
      const { put } = await import("@vercel/blob");
      const blob = await put(key, output, { access: "public", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: CACHE_SECONDS });
      return blob.url;
    },
    async putFile(key, bytes, contentType) {
      const { put } = await import("@vercel/blob");
      const blob = await put(key, Buffer.from(bytes), {
        access: "public",
        contentType: contentType.startsWith("video/") ? contentType : "video/mp4",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: CACHE_SECONDS,
      });
      return blob.url;
    },
    async remove(urls) {
      const owned = urls.filter(isMetaMediaBlobUrl);
      if (owned.length === 0) return;
      const { del } = await import("@vercel/blob");
      await del(owned);
    },
  };
}
