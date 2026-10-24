/**
 * Texte des contenus réseaux sociaux : aplatissement du mini-format riche du
 * site (**gras**, liens, lignes ✅), emojis, troncatures, gras des
 * diapositives, hashtags, contraste. Fonctions pures, sans dépendance.
 */

import { slugify } from "./slug";

// ─── Mini-format riche → texte brut ──────────────────────────────────────────

/**
 * Aplatit le mini-format riche des sections : `**x**` → x, `[t](u)` → t,
 * « ✅ » en tête de ligne → « - », espaces normalisés (U+202F → U+00A0,
 * espaces multiples réduits, lignes vides consécutives fusionnées).
 */
export function plainText(input: string | null | undefined): string {
  if (!input) return "";
  const lines = input
    .replace(/\r\n?/g, "\n")
    .replace(/\u202f/g, "\u00a0")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*\*/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*✅\s*/u, "- ").replace(/[ \t]+/g, " ").trim());
  const out: string[] = [];
  for (const line of lines) {
    if (line === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(line);
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/** Première ligne non vide (ce qui s'affiche avant « … plus »). */
export function firstLine(text: string): string {
  return text.split("\n").find((line) => line.trim() !== "")?.trim() ?? "";
}

/** Paragraphes séparés par une ligne vide, sans les vides. */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

// ─── Emojis ──────────────────────────────────────────────────────────────────

/** Pictogrammes, drapeaux, carnations, VS16, ZWJ, touches ⃣. */
const EMOJI_RE =
  /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|[\u{1F3FB}-\u{1F3FF}]|\u{FE0F}|\u{200D}|\u{20E3}/gu;

/** Retire les emojis (la police des visuels ne les affiche pas) et resserre les espaces. */
export function stripEmoji(text: string): string {
  return text
    .replace(EMOJI_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +(\n|$)/g, "$1")
    .replace(/(^|\n) +/g, "$1");
}

/** Nombre d'emojis (pictogrammes) d'un texte — les modificateurs ne comptent pas. */
export function countEmoji(text: string): number {
  return (text.match(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/gu) ?? []).length;
}

// ─── Troncatures ─────────────────────────────────────────────────────────────

/**
 * Tronque au dernier espace avant `max` et ajoute « … » (le résultat fait au
 * plus `max` caractères). Un mot plus long que `max` est coupé net.
 */
export function truncateAtWord(text: string, max: number): string {
  const s = text.trim();
  if (s.length <= max) return s;
  if (max <= 1) return "…";
  const head = s.slice(0, max - 1);
  // Coupure déjà sur une frontière de mot : on garde tout le début
  const boundary = /\s/.test(s.charAt(max - 1)) ? head.length : head.lastIndexOf(" ");
  const base = (boundary > max / 3 ? head.slice(0, boundary) : head).replace(/[\s,;:.!?…«(-]+$/u, "");
  return `${base}…`;
}

/** Fin de phrase : ponctuation finale, guillemet fermant éventuel (« fini. »), puis espace ou fin de texte. */
const SENTENCE_END_RE = /[.!?…]+(?:\s?[»"”)])?(?=\s|$)/g;

/**
 * Tronque à la dernière fin de phrase qui tient dans `max` — sans « … », le
 * texte rendu se termine proprement — à condition de conserver au moins
 * `minRatio` × `max` caractères ; sinon retombe sur `truncateAtWord`. Un texte
 * qui tient déjà est rendu tel quel (espaces extérieurs retirés).
 */
export function truncateAtSentence(text: string, max: number, minRatio = 0.5): string {
  const s = text.trim();
  if (s.length <= max) return s;
  let cut = -1;
  SENTENCE_END_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SENTENCE_END_RE.exec(s)) !== null) {
    const end = m.index + m[0].length;
    if (end > max) break;
    cut = end;
  }
  return cut >= max * minRatio ? s.slice(0, cut).trim() : truncateAtWord(s, max);
}

// ─── Gras des diapositives ───────────────────────────────────────────────────

/**
 * Ne conserve qu'un seul passage `**gras**` (le premier) : les autres sont
 * déstylés et les `**` orphelins retirés.
 */
export function singleEmphasis(text: string): string {
  let kept = false;
  const OPEN = "\u0001";
  const CLOSE = "\u0002";
  const paired = text.replace(/\*\*([^*\n]+?)\*\*/g, (_m, inner: string) => {
    if (kept) return inner;
    kept = true;
    return `${OPEN}${inner}${CLOSE}`;
  });
  return paired.replace(/\*\*/g, "").replace(OPEN, "**").replace(CLOSE, "**");
}

/**
 * Découpe une ligne en mots pour le rendu satori (mots-spans) : les mots du
 * premier passage `**…**` sont en gras, les autres passages sont déstylés,
 * les `**` orphelins ignorés.
 */
export function parseEmphasis(line: string): { word: string; bold: boolean }[] {
  const normalized = singleEmphasis(line);
  const match = /\*\*([^*\n]+?)\*\*/.exec(normalized);
  const stripped = match
    ? normalized.slice(0, match.index) + match[1] + normalized.slice(match.index + match[0].length)
    : normalized;
  const boldStart = match ? match.index : -1;
  const boldEnd = match ? match.index + (match[1]?.length ?? 0) : -1;
  const out: { word: string; bold: boolean }[] = [];
  const words = /\S+/g;
  let word: RegExpExecArray | null;
  while ((word = words.exec(stripped)) !== null) {
    const from = word.index;
    const to = from + word[0].length;
    out.push({ word: word[0], bold: match !== null && from < boldEnd && to > boldStart });
  }
  return out;
}

// ─── Listes ──────────────────────────────────────────────────────────────────

const BULLET_RE = /^\s*(?:[-•*]|✅|\d{1,2}[.)])\s+/u;

/**
 * Lignes de liste d'un body (marqueur « - », « • », « ✅ » ou « 1. » retiré).
 * Sans marqueur, toutes les lignes non vides sont rendues (repli).
 */
export function bulletLines(body: string): string[] {
  const lines = body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const bullets = lines.filter((l) => BULLET_RE.test(l));
  return (bullets.length > 0 ? bullets : lines).map((l) => l.replace(BULLET_RE, "").trim());
}

// ─── Hashtags ────────────────────────────────────────────────────────────────

const HASHTAG_RE = /^#[A-Za-z0-9_]{2,40}$/;

/**
 * « Sophrologue à Albi » → « #SophrologueAAlbi » ; « Gestion du stress » →
 * « #GestionDuStress ». Mots entiers conservés dans la limite de `maxLen`.
 */
export function camelHashtag(text: string, maxLen = 40): string {
  const words = slugify(text).split("-").filter(Boolean);
  let out = "";
  for (const word of words) {
    const camel = word.charAt(0).toUpperCase() + word.slice(1);
    if (out !== "" && out.length + camel.length > maxLen) break;
    out += camel;
  }
  return `#${out.slice(0, maxLen)}`;
}

/**
 * Normalise les hashtags rendus par le modèle : NFD sans diacritiques,
 * espaces/apostrophes/tirets retirés, `^#[A-Za-z0-9_]{2,40}$`, dédoublonnage
 * insensible à la casse, ajout de `#<Metier><Ville>` et `#<Ville>` en tête,
 * 8 au maximum.
 */
export function normalizeHashtags(
  list: string[],
  ctx: { profession: string; city: string },
  max = 8,
): string[] {
  const mandatory = [camelHashtag(`${ctx.profession} ${ctx.city}`), camelHashtag(ctx.city)].filter(
    (h) => HASHTAG_RE.test(h),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (tag: string) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(tag);
  };
  for (const tag of mandatory) add(tag);
  for (const raw of list) {
    const bare = raw.trim().replace(/^#+/, "");
    // Plusieurs mots (espaces, tirets, apostrophes) → CamelCase lisible
    const cleaned = /[\s'\u2019-]/.test(bare)
      ? camelHashtag(bare)
      : `#${bare.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\./g, "")}`;
    if (!HASHTAG_RE.test(cleaned)) continue;
    add(cleaned);
  }
  return out.slice(0, max);
}

// ─── Couleurs ────────────────────────────────────────────────────────────────

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** Luminance relative (WCAG) d'une couleur hex #rrggbb — 0 (noir) à 1 (blanc). */
export function relativeLuminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/**
 * Couleur de texte lisible sur `hex` : blanc si le fond est sombre
 * (luminance < 0,45), sinon la couleur de texte du thème.
 */
export function contrastOn(hex: string, textColor = "#2b2b2b"): string {
  if (!isHexColor(hex)) return textColor;
  return relativeLuminance(hex) < 0.45 ? "#ffffff" : textColor;
}
