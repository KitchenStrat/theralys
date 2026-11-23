/**
 * Format réel d'une image, lu dans ses premiers octets (« nombre magique ») :
 * le type annoncé par le navigateur se falsifie, pas la signature du fichier.
 * Fonction pure. Rend le type MIME reconnu, ou `null`.
 */
export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Marques ISO-BMFF des fichiers AVIF (image fixe ou séquence). */
const AVIF_BRANDS = new Set(["avif", "avis"]);

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

export function sniffImageType(head: Uint8Array): SniffedImageType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && PNG.every((byte, i) => head[i] === byte)) return "image/png";
  if (head.length >= 12 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "image/webp";
  if (head.length >= 12 && ascii(head, 4, 8) === "ftyp") {
    // Marque principale, puis marques compatibles (par blocs de 4 octets à partir du 16e)
    if (AVIF_BRANDS.has(ascii(head, 8, 12))) return "image/avif";
    for (let offset = 16; offset + 4 <= head.length; offset += 4) {
      if (AVIF_BRANDS.has(ascii(head, offset, offset + 4))) return "image/avif";
    }
  }
  return null;
}
