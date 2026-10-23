/**
 * Photos et logos des visuels (§4.1). Satori n'accepte que des data:URI : on
 * télécharge (hôtes autorisés, 4 s, 8 Mo max) ou on décode le data:URI, puis
 * sharp recadre à la taille exacte (`position: "attention"`) en JPEG — ou en
 * PNG `contain` pour un logo (transparence conservée). LRU mémoire de 40
 * entrées ; tout échec → `null` (variante sans photo), jamais mis en cache.
 */

import sharp from "sharp";

export type ImageFit = "cover" | "contain";

const FETCH_TIMEOUT_MS = 4_000;
const MAX_BYTES = 8 * 1024 * 1024;
const LRU_MAX = 40;

const ALLOWED_HOSTS = ["images.pexels.com", "fal.media"];
const ALLOWED_HOST_SUFFIXES = [".fal.media", ".public.blob.vercel-storage.com"];

/** Hôte autorisé pour une photo (liste blanche) ; les data:URI sont acceptés. */
export function isAllowedImageUrl(url: string): boolean {
  if (url.startsWith("data:image/")) return true;
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

/** Décode un data:URI image (base64 ou percent-encoded). */
export function decodeDataUri(url: string): Buffer | null {
  const match = /^data:(image\/[a-z0-9.+-]+)(;charset=[^;,]+)?(;base64)?,(.*)$/is.exec(url);
  if (!match) return null;
  const payload = match[4] ?? "";
  try {
    return match[3]
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
  } catch {
    return null;
  }
}

async function fetchImage(url: string): Promise<Buffer | null> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "image/*" },
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

async function loadSource(url: string, w: number, h: number): Promise<Buffer | null> {
  if (url.startsWith("data:")) return decodeDataUri(url);
  return fetchImage(rewritePexelsUrl(url, w, h));
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
 * ou PNG (`contain`, fond transparent — logos). `null` si l'URL n'est pas
 * autorisée, si le téléchargement échoue ou si le fichier n'est pas une image.
 */
export async function prepareImage(
  url: string | null | undefined,
  w: number,
  h: number,
  fit: ImageFit = "cover",
): Promise<string | null> {
  if (!url || !isAllowedImageUrl(url)) return null;
  const key = `${fit}:${w}x${h}:${url}`;
  const hit = lru.get(key);
  if (hit) {
    remember(key, hit);
    return hit;
  }
  try {
    const source = await loadSource(url, w, h);
    if (!source || source.length === 0) return null;
    // SVG (favicons, couvertures mock) : rasterisation à densité élevée
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
    return dataUri;
  } catch (err) {
    console.warn("[social] image ignorée :", err instanceof Error ? err.message : err);
    return null;
  }
}
