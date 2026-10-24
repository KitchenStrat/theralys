/**
 * Photos et logos des visuels (§4.1). Satori n'accepte que des data:URI : on
 * télécharge (hôtes autorisés, 4 s, 8 Mo max, redirections jamais suivies) ou
 * on décode le data:URI (JPEG/PNG/WebP/AVIF ≤ 4 Mo décodés ; SVG ≤ 200 Ko, le
 * format des photos du mode démo — `MockImageProvider` — et des favicons),
 * puis sharp recadre à la taille exacte (`position: "attention"`) en JPEG — ou
 * en PNG `contain` pour un logo (transparence conservée). LRU mémoire de 40
 * entrées, alimenté uniquement par les succès.
 *
 * Issue d'une préparation (`loadImage`) :
 * - `ok`      : data:URI prêt pour satori ;
 * - `refused` : pas d'URL, URL hors liste blanche, data:URI refusé (type ou
 *               taille) ou indécodable — définitif : la variante sans photo
 *               est le rendu final, mis en cache normalement ;
 * - `failed`  : téléchargement ou décodage d'une URL distante en échec (délai,
 *               5xx, redirection, fichier corrompu) — transitoire : le rendu
 *               est « dégradé » et ne doit être mis en cache nulle part.
 */

import sharp from "sharp";

export type ImageFit = "cover" | "contain";

export type ImageOutcome =
  | { status: "ok"; dataUri: string }
  | { status: "refused" }
  | { status: "failed" };

const REFUSED: ImageOutcome = { status: "refused" };
const FAILED: ImageOutcome = { status: "failed" };

const FETCH_TIMEOUT_MS = 4_000;
const MAX_BYTES = 8 * 1024 * 1024;
const LRU_MAX = 40;

const ALLOWED_HOSTS = ["images.pexels.com", "fal.media"];
const ALLOWED_HOST_SUFFIXES = [".fal.media", ".public.blob.vercel-storage.com"];

/**
 * Types acceptés en data:URI et plafond d'octets décodés : les formats
 * produits par `/api/upload` (4 Mo), et le SVG — rasterisé par librsvg côté
 * serveur — seulement pour de petites illustrations (200 Ko : photos du mode
 * démo ≈ 1 Ko, favicons).
 */
export const DATA_URI_MAX_BYTES: Readonly<Record<string, number>> = {
  "image/jpeg": 4 * 1024 * 1024,
  "image/png": 4 * 1024 * 1024,
  "image/webp": 4 * 1024 * 1024,
  "image/avif": 4 * 1024 * 1024,
  "image/svg+xml": 200 * 1024,
};

type DataUri = { mime: string; base64: boolean; payload: string; maxBytes: number };

/** Découpe un data:URI image de type accepté ; null si la forme ou le type est refusé. */
function parseDataUri(url: string): DataUri | null {
  const match = /^data:(image\/[a-z0-9.+-]+)(;charset=[^;,]+)?(;base64)?,(.*)$/is.exec(url);
  if (!match) return null;
  const mime = match[1]!.toLowerCase();
  const maxBytes = DATA_URI_MAX_BYTES[mime];
  if (maxBytes === undefined) return null;
  return { mime, base64: match[3] !== undefined, payload: match[4] ?? "", maxBytes };
}

/** Borne haute de la taille décodée, sans décoder (base64 → ¾ de la charge ; percent-encoding → sa longueur). */
function decodedUpperBound(uri: DataUri): number {
  return uri.base64 ? Math.floor((uri.payload.length * 3) / 4) : uri.payload.length;
}

/** data:URI image acceptable : type dans `DATA_URI_MAX_BYTES` et taille sous le plafond du type. */
export function isAllowedDataUri(url: string): boolean {
  const uri = parseDataUri(url);
  return uri !== null && decodedUpperBound(uri) <= uri.maxBytes;
}

/** Hôte autorisé pour une photo (liste blanche, https seulement) ; data:URI selon `isAllowedDataUri`. */
export function isAllowedImageUrl(url: string): boolean {
  if (url.startsWith("data:")) return isAllowedDataUri(url);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return (
      ALLOWED_HOSTS.includes(host) || ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

/** Pexels : on demande directement la taille utile (bande passante, vitesse). */
export function rewritePexelsUrl(url: string, w: number, h: number): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "images.pexels.com") return url;
    parsed.searchParams.set("auto", "compress");
    parsed.searchParams.set("cs", "tinysrgb");
    parsed.searchParams.set("fit", "crop");
    parsed.searchParams.set("w", String(w));
    parsed.searchParams.set("h", String(h));
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Décode un data:URI image (base64 ou percent-encoded) de type accepté ;
 * null si le type est refusé ou si le décodé dépasse le plafond du type.
 */
export function decodeDataUri(url: string): Buffer | null {
  const uri = parseDataUri(url);
  if (!uri || decodedUpperBound(uri) > uri.maxBytes) return null;
  try {
    const buffer = uri.base64
      ? Buffer.from(uri.payload, "base64")
      : Buffer.from(decodeURIComponent(uri.payload), "utf8");
    return buffer.length > uri.maxBytes ? null : buffer;
  } catch {
    return null;
  }
}

async function fetchImage(url: string): Promise<Buffer | null> {
  // `redirect: "manual"` : la liste blanche ne vaut que pour l'URL d'origine,
  // une 3xx n'est donc jamais suivie — elle n'est pas `ok` et vaut échec.
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "image/*" },
    redirect: "manual",
  });
  if (!response.ok) return null;
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return null;
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_BYTES) return null;
  return buffer;
}

const lru = new Map<string, string>();

function remember(key: string, value: string): void {
  lru.delete(key);
  lru.set(key, value);
  while (lru.size > LRU_MAX) {
    const oldest = lru.keys().next().value;
    if (oldest === undefined) break;
    lru.delete(oldest);
  }
}

/** Vide le cache (tests). */
export function clearImageCache(): void {
  lru.clear();
}

/**
 * Image prête pour satori : data:URI JPEG (`cover`, recadrage « attention »)
 * ou PNG (`contain`, fond transparent — logos), avec l'issue détaillée (voir
 * l'en-tête du module) qui permet au cache de ne pas retenir un rendu dégradé.
 */
export async function loadImage(
  url: string | null | undefined,
  w: number,
  h: number,
  fit: ImageFit = "cover",
): Promise<ImageOutcome> {
  if (!url || !isAllowedImageUrl(url)) return REFUSED;
  const key = `${fit}:${w}x${h}:${url}`;
  const hit = lru.get(key);
  if (hit) {
    remember(key, hit);
    return { status: "ok", dataUri: hit };
  }
  const remote = !url.startsWith("data:");
  try {
    const source = remote ? await fetchImage(rewritePexelsUrl(url, w, h)) : decodeDataUri(url);
    if (!source || source.length === 0) return remote ? FAILED : REFUSED;
    // SVG (favicons, photos du mode démo) : rasterisation à densité élevée
    const pipeline = sharp(source, { density: 150, limitInputPixels: 40_000_000 });
    const out =
      fit === "contain"
        ? await pipeline
            .resize(w, h, { fit: "inside", withoutEnlargement: true })
            .png({ compressionLevel: 6 })
            .toBuffer()
        : await pipeline
            .resize(w, h, { fit: "cover", position: "attention" })
            .jpeg({ quality: 80, mozjpeg: true })
            .toBuffer();
    const dataUri = `data:image/${fit === "contain" ? "png" : "jpeg"};base64,${out.toString("base64")}`;
    remember(key, dataUri);
    return { status: "ok", dataUri };
  } catch (err) {
    console.warn("[social] image ignorée :", err instanceof Error ? err.message : err);
    return remote ? FAILED : REFUSED;
  }
}

/** `loadImage` réduit au data:URI (null si refusée ou en échec). */
export async function prepareImage(
  url: string | null | undefined,
  w: number,
  h: number,
  fit: ImageFit = "cover",
): Promise<string | null> {
  const outcome = await loadImage(url, w, h, fit);
  return outcome.status === "ok" ? outcome.dataUri : null;
}
