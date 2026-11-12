/**
 * Nettoyage du texte venu d'un site tiers (ou collé par le praticien) :
 * module pur, partagé par l'extraction des pages, les faits et le texte
 * collé. Le texte lu est ensuite donné à un modèle de langage : on en retire
 * ce qu'un lecteur humain ne verrait pas (caractères invisibles), sans rien
 * réécrire.
 */

import { createHash } from "node:crypto";

// Plages écrites par leurs codes : aucun caractère invisible dans ce fichier
const INVISIBLE_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x0008], // contrôles C0 (hors tabulation et sauts de ligne)
  [0x000b, 0x000c],
  [0x000e, 0x001f],
  [0x007f, 0x009f], // DEL et contrôles C1
  [0x00ad, 0x00ad], // césure conditionnelle
  [0x034f, 0x034f], // liant de graphèmes
  [0x061c, 0x061c], // marque de sens d'écriture arabe
  [0x180e, 0x180e], // séparateur mongol
  [0x200b, 0x200f], // largeur nulle, marques gauche-droite
  [0x202a, 0x202e], // changements de sens d'écriture
  [0x2060, 0x206f], // liant de mots, opérateurs invisibles, isolats
  [0xfe00, 0xfe0f], // sélecteurs de variante
  [0xfeff, 0xfeff], // marque d'ordre des octets
  [0xfff9, 0xfffc], // annotations interlinéaires, objet de remplacement
  [0xe0000, 0xe007f], // « étiquettes » Unicode : servent à dissimuler des consignes
  [0xe0100, 0xe01ef], // sélecteurs de variante supplémentaires
];

const codePoint = (code: number): string => `\\u{${code.toString(16)}}`;
const INVISIBLE_CHARS = new RegExp(`[${INVISIBLE_RANGES.map(([from, to]) => (from === to ? codePoint(from) : `${codePoint(from)}-${codePoint(to)}`)).join("")}]`, "gu");
/** Séparateurs de ligne et de paragraphe Unicode : ce sont des sauts de ligne. */
const UNICODE_LINE_BREAKS = new RegExp(`[${codePoint(0x2028)}${codePoint(0x2029)}]`, "gu");

/** Retire les caractères qu'un lecteur ne voit pas (largeur nulle, sens d'écriture, étiquettes Unicode, contrôles). */
export function stripInvisible(value: string): string {
  return value.replace(UNICODE_LINE_BREAKS, "\n").replace(INVISIBLE_CHARS, "");
}

/** Texte sur une ligne : accents composés (NFC), caractères invisibles retirés, espaces (insécables compris) réduits à un seul. */
export function cleanLine(value: string): string {
  return stripInvisible(value.normalize("NFC")).replace(/\s+/g, " ").trim();
}

/** Ligne nettoyée et bornée (coupe sur un mot, sans points de suspension : titres, descriptions, noms). */
export function cleanLineMax(value: string, max: number): string {
  const line = cleanLine(value);
  if (line.length <= max) return line;
  const cut = safeSlice(line, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–—-]+$/, "");
}

/** Coupe à `max` unités sans laisser une demi-paire de substitution en fin de chaîne. */
function safeSlice(value: string, max: number): string {
  const cut = value.slice(0, Math.max(0, max));
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * Blocs de texte → texte borné : une ligne par bloc, coupé de préférence
 * entre deux blocs, sinon entre deux mots, et terminé par « … » quand il a
 * été coupé. La longueur rendue ne dépasse jamais `max`.
 */
export function joinBlocks(blocks: readonly string[], max: number): string {
  const text = blocks.filter((block) => block !== "").join("\n");
  if (text.length <= max) return text;
  const room = Math.max(0, max - 1);
  const cut = safeSlice(text, room);
  const lastBreak = cut.lastIndexOf("\n");
  const lastSpace = cut.lastIndexOf(" ");
  const end = lastBreak > room * 0.6 ? lastBreak : lastSpace > room * 0.6 ? lastSpace : cut.length;
  return `${cut.slice(0, end).trimEnd()}…`;
}

/** Empreinte SHA-256 (hexadécimal) d'un texte : sert à détecter qu'une page a changé. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Forme de comparaison d'un libellé ou d'un segment d'adresse : minuscules,
 * sans accents, mots séparés par « - » (`Qui suis-je ?` → `qui-suis-je`).
 * Les mots-clés de classement des pages sont écrits sous cette forme.
 */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
