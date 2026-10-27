/**
 * Fichiers de téléchargement (§5.3) : ZIP de JPEG (fflate, sans
 * recompression), PDF une page par diapositive (pdf-lib, px → pt 1:1),
 * légende .txt, noms de fichiers et en-tête Content-Disposition.
 */

import { zipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import {
  captionFor,
  SOCIAL_NETWORKS,
  slugify,
  type SocialFormat,
  type SocialPostContent,
  type SocialSize,
} from "@theralys/shared";

export type ZipEntry = { name: string; data: Uint8Array };

/** ZIP sans compression (les JPEG sont déjà compressés). */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) files[entry.name] = entry.data;
  return zipSync(files, { level: 0 });
}

export type PdfPage = { data: Uint8Array; width: number; height: number };

/** PDF : une page par JPEG, aux dimensions en points égales aux pixels. */
export async function buildPdf(pages: PdfPage[], title?: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  if (title) pdf.setTitle(title);
  pdf.setProducer("Harmony");
  for (const page of pages) {
    const image = await pdf.embedJpg(page.data);
    const p = pdf.addPage([page.width, page.height]);
    p.drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
  }
  return pdf.save({ useObjectStreams: false });
}

export type CaptionTxtOptions = {
  /** URL publique du site (lien tracé sur Facebook et LinkedIn) */
  siteUrl: string;
  /** Ligne « lien dans ma bio » exacte insérée par le générateur (`SOCIAL_BIO_LINE`) */
  bioLine: string;
  /** Format du contenu : une story n'a pas de variante LinkedIn */
  format?: SocialFormat;
};

/**
 * Fichier .txt prêt à coller : une variante de légende par réseau
 * (`captionFor` : Instagram avec tous les hashtags, Facebook et LinkedIn avec
 * le lien du site tracé et 3 hashtags), séparées par des titres, puis le
 * texte alternatif du visuel.
 */
export function captionTxt(
  content: { caption: string; hashtags: readonly string[]; altText: string },
  options: CaptionTxtOptions,
): string {
  const networks = SOCIAL_NETWORKS.filter((n) => options.format !== "story" || n.id !== "linkedin");
  const parts = networks.map(
    (network) => `=== ${network.label} ===\n${captionFor(network.id, content, options.siteUrl, options.bioLine)}`,
  );
  if (content.altText.trim() !== "") parts.push(`=== Texte alternatif ===\n${content.altText.trim()}`);
  return `${parts.join("\n\n")}\n`;
}

/** Nom de fichier d'une diapositive dans un ZIP : « 01-couverture.jpg », « 02-page.jpg », « 06-fin.jpg ». */
export function slideFileName(index: number, role: SocialPostContent["slides"][number]["role"]) {
  const label =
    role === "cover" ? "couverture" : role === "cta" ? "fin" : role === "page" ? "page" : "visuel";
  return `${String(index + 1).padStart(2, "0")}-${label}.jpg`;
}

export const SIZE_SUFFIX: Record<SocialSize, string> = {
  square: "carre",
  portrait: "portrait",
  story: "story",
  landscape: "paysage",
};

/** `${date}-${slug(topic)}-${suffixe}.${ext}`, en ASCII (le slug retire les accents). */
export function downloadFilename(
  post: { scheduledFor: string; topic: string },
  suffix: string,
  ext: string,
): string {
  const slug = slugify(post.topic).slice(0, 40).replace(/-+$/, "") || "contenu";
  return `${post.scheduledFor}-${slug}-${suffix}.${ext}`;
}

/** En-tête `Content-Disposition: attachment` avec repli ASCII et `filename*` UTF-8. */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
