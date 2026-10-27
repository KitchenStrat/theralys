/**
 * Légende modifiable d'un contenu réseaux sociaux : borne (limite Instagram)
 * et normalisation du texte saisi. Fonctions pures, testées sans base.
 */

/** Longueur maximale d'une légende (limite d'Instagram, la plus basse des trois réseaux). */
export const SOCIAL_CAPTION_MAX = 2200;

/**
 * Texte saisi → légende stockée : fins de ligne Unix, caractères de contrôle
 * et de format retirés (sauf le saut de ligne), espaces de fin de ligne
 * supprimés, jamais plus d'une ligne vide d'affilée, bornes retirées, puis
 * coupe à SOCIAL_CAPTION_MAX.
 */
export function normalizeCaption(text: string): string {
  const normalized = text.normalize("NFKC").replace(/[\p{Cf}\u00ad]/gu, "").replace(/\r\n?/g, "\n");
  let out = "";
  for (const ch of normalized) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\n" || ch === "\t") out += ch === "\t" ? " " : ch;
    else if (code < 0x20 || code === 0x7f || (code >= 0x80 && code < 0xa0)) out += " ";
    else out += ch;
  }
  return out
    .split("\n")
    .map((line) => line.replace(/[ \u00a0]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, SOCIAL_CAPTION_MAX);
}
