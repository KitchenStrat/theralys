/**
 * Légende modifiable d'un contenu réseaux sociaux : borne (limite Instagram)
 * et normalisation du texte saisi. Fonctions pures, testées sans base.
 */

/** Longueur maximale d'une légende, en points de code (limite d'Instagram, la plus basse des trois réseaux). */
export const SOCIAL_CAPTION_MAX = 2200;

/**
 * Caractères de format dangereux : marques et isolats bidirectionnels
 * (U+061C, U+200E, U+200F, U+202A–202E, U+2066–2069), espace de largeur nulle
 * (U+200B), gluons invisibles (U+2060–2064), BOM (U+FEFF) et trait d'union
 * conditionnel (U+00AD). Le gluon U+200D (émojis composés, « 🧘‍♀️ ») et les
 * sélecteurs de variante (U+FE0E/U+FE0F) sont conservés.
 */
const DANGEROUS_FORMAT_RE = /[\u00ad\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

/** `String.prototype.toWellFormed` (Node ≥ 20) quand il existe : aucun substitut isolé ne sort d'ici. */
function wellFormed(text: string): string {
  const fn = (text as string & { toWellFormed?: () => string }).toWellFormed;
  return typeof fn === "function" ? fn.call(text) : text;
}

/**
 * Coupe à `max` points de code (jamais au milieu d'une paire de substituts),
 * au dernier espace quand il y en a un, puis sans espace final.
 */
export function truncateCaption(text: string, max: number = SOCIAL_CAPTION_MAX): string {
  const points = Array.from(text);
  if (points.length <= max) return text;
  const cut = points.slice(0, max).join("");
  const lastSpace = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("\n"));
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/**
 * Texte saisi → légende stockée : forme NFC (les émojis composés, exposants et
 * espaces insécables restent tels quels), caractères de format dangereux
 * retirés, fins de ligne Unix, caractères de contrôle remplacés par une
 * espace (sauf le saut de ligne), espaces de fin de ligne supprimés, jamais
 * plus d'une ligne vide d'affilée, bornes retirées, coupe à SOCIAL_CAPTION_MAX
 * points de code, chaîne bien formée.
 */
export function normalizeCaption(text: string): string {
  const normalized = text.normalize("NFC").replace(DANGEROUS_FORMAT_RE, "").replace(/\r\n?/g, "\n");
  let out = "";
  for (const ch of normalized) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\n" || ch === "\t") out += ch === "\t" ? " " : ch;
    else if (code < 0x20 || code === 0x7f || (code >= 0x80 && code < 0xa0)) out += " ";
    else out += ch;
  }
  const cleaned = out
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return wellFormed(truncateCaption(cleaned));
}
