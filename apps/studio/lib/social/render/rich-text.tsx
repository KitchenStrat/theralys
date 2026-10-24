/**
 * Texte des visuels (§4.1). Contraintes satori rappelées : `display:"flex"`
 * sur tout parent à plusieurs enfants, pas de flux inline (le gras se rend en
 * mots-spans dans une rangée `flexWrap`), `lineClamp` honoré uniquement sur un
 * nœud texte unique en `display:"block"` (ignoré en `flex`), aucun emoji ni
 * symbole hors des 12 polices embarquées (retirés avant rendu : un glyphe
 * manquant déclencherait un chargement réseau de police par satori).
 */

import type { CSSProperties } from "react";
import { bulletLines, parseEmphasis, plainText, stripEmoji } from "@theralys/shared";

const BULLET_RE = /^\s*(?:[-•*]|✅|\d{1,2}[.)])\s+/u;

/** Puce symbolique en tête de ligne (✓ → ▸ ► ✅ ① •…) → « - » : la pastille est dessinée par `RichBody`. */
const LEADING_SYMBOL_BULLET_RE =
  /^[ \t]*[\u2022\u2023\u2043\u25e6\u2190-\u21ff\u2300-\u23ff\u2460-\u24ff\u25a0-\u27bf\u2900-\u2bff\u{1f000}-\u{1faff}]+\ufe0f?[ \t]+/gmu;
/** Flèches (→ ⟶ ➜ ⇒ ➔…) → tiret demi-cadratin, présent dans toutes les polices. */
const ARROW_RE = /[\u2190-\u21ff\u27f0-\u27ff\u2794-\u27bf\u2900-\u297f\u2b00-\u2b11\u2b30-\u2b4c]+/gu;
/** Blocs de symboles absents des polices : techniques, cerclés, formes géométriques, symboles divers, dingbats, maths, pictogrammes. */
const SYMBOL_BLOCK_RE = /[\u2300-\u23ff\u2460-\u24ff\u25a0-\u2bff\u{1f000}-\u{1faff}]/gu;
/**
 * Dernier recours : tout symbole hors de ceux que les 12 polices couvrent,
 * lettre hors alphabet latin, chiffre spécial, caractère de format, privé ou
 * non assigné.
 */
const UNSAFE_RE =
  /(?![€$£¥¢+<>=|~^°©®´¨`¬×÷−≠™])\p{S}|(?!\p{Script=Latin})\p{L}|(?![¹²³¼½¾])\p{No}|\p{Nl}|\p{Cf}|\p{Co}|\p{Cn}|\p{Cs}/gu;

/**
 * Texte prêt pour satori : puces symboliques → « - », flèches → « – », primes
 * → apostrophe/guillemet droit, emojis et symboles hors polices retirés,
 * espaces typographiques → espace (insécable pour U+202F), tirets rares
 * normalisés, espaces resserrées.
 */
export function cleanText(text: string | null | undefined): string {
  const bulleted = (text ?? "").replace(LEADING_SYMBOL_BULLET_RE, "- ");
  return stripEmoji(bulleted)
    .replace(ARROW_RE, "–")
    .replace(/[′‵]/g, "'")
    .replace(/[″‶]/g, '"')
    .replace(SYMBOL_BLOCK_RE, "")
    .replace(UNSAFE_RE, "")
    .replace(/\u202f/g, "\u00a0")
    .replace(/[\u2000-\u200a\u205f\u3000]/g, " ")
    .replace(/\u00ad/g, "")
    .replace(/[‐-‒]/g, "-")
    .replace(/―/g, "—")
    .replace(/[∙⋅]/g, "·")
    .replace(/[ \t]+/g, " ")
    .replace(/ ([,.])/g, "$1")
    .replace(/ +(\n|$)/g, "$1")
    .replace(/(^|\n) +/g, "$1")
    .trim();
}

/** Titre d'une diapositive : texte brut (sans `**`), sur une seule ligne logique, sans puce en tête. */
export function cleanTitle(text: string | null | undefined): string {
  return cleanText(plainText(text).replace(/\s*\n+\s*/g, " ")).replace(/^-\s+/, "");
}

type Word = { word: string; bold: boolean };

/**
 * Recolle la ponctuation française détachée par une espace (insécable ou non)
 * au mot précédent (« séance : » → « séance\u00a0: », « 60\u00a0% »), et le
 * guillemet ouvrant au mot suivant, pour qu'un retour à la ligne ne les sépare
 * jamais.
 */
export function mergePunctuation(words: Word[]): Word[] {
  const out: Word[] = [];
  for (const item of words) {
    const prev = out[out.length - 1];
    if (prev && (/^[«(]$/.test(prev.word) || /^[:;!?»%)]/.test(item.word))) {
      prev.word = `${prev.word}\u00a0${item.word}`;
      prev.bold = prev.bold || item.bold;
      continue;
    }
    out.push({ ...item });
  }
  return out;
}

type LineProps = {
  line: string;
  size: number;
  color: string;
  strong: string;
  lineHeight: number;
  maxLines: number;
  style?: CSSProperties;
};

/**
 * Une ligne : nœud texte unique en `display:"block"` (seul mode où satori
 * applique `lineClamp` et l'ellipse), ou mots-spans quand elle porte du gras —
 * la rangée est alors bornée en hauteur (`maxLines` lignes) et rognée.
 */
function Line({ line, size, color, strong, lineHeight, maxLines, style }: LineProps) {
  const words = mergePunctuation(parseEmphasis(line));
  const hasBold = words.some((w) => w.bold);
  if (!hasBold) {
    return (
      <div style={{ display: "block", fontSize: size, lineHeight, color, lineClamp: maxLines, ...style }}>
        {words.map((w) => w.word).join(" ")}
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        columnGap: Math.round(size * 0.28),
        fontSize: size,
        lineHeight,
        color,
        maxHeight: Math.ceil(maxLines * size * lineHeight),
        overflow: "hidden",
        ...style,
      }}
    >
      {words.map((w, i) => (
        <span
          key={i}
          style={w.bold ? { fontWeight: 700, color: strong } : { fontWeight: 400, color }}
        >
          {w.word}
        </span>
      ))}
    </div>
  );
}

export type RichBodyProps = {
  text: string;
  size: number;
  color: string;
  /** Couleur (et graisse) du passage en gras et des pastilles de liste */
  strong: string;
  /** Lignes visibles au plus (clamp sur chaque ligne logique) */
  maxLines?: number;
  lineHeight?: number;
  style?: CSSProperties;
};

/**
 * Corps d'une diapositive : paragraphes et lignes de liste (« - », « • »,
 * « ✅ », « 1. ») rendus en rangées avec une pastille ronde ; le passage
 * `**gras**` en mots-spans.
 */
export function RichBody({
  text,
  size,
  color,
  strong,
  maxLines = 6,
  lineHeight = 1.35,
  style,
}: RichBodyProps) {
  const lines = cleanText(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const isList = lines.some((l) => BULLET_RE.test(l));
  const items = isList ? bulletLines(lines.join("\n")).slice(0, 3) : lines.slice(0, maxLines);
  const perLine = Math.max(1, Math.floor(maxLines / Math.max(1, items.length)));
  const dot = Math.round(size * 0.4);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: Math.round(size * (isList ? 0.5 : 0.35)),
        ...style,
      }}
    >
      {items.map((line, i) =>
        isList ? (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: Math.round(size * 0.5) }}>
            <div
              style={{
                display: "flex",
                width: dot,
                height: dot,
                borderRadius: dot / 2,
                backgroundColor: strong,
                marginTop: Math.round((size * lineHeight - dot) / 2),
                flexShrink: 0,
              }}
            />
            <Line
              line={line}
              size={size}
              color={color}
              strong={strong}
              lineHeight={lineHeight}
              maxLines={Math.max(2, perLine)}
              style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}
            />
          </div>
        ) : (
          <Line
            key={i}
            line={line}
            size={size}
            color={color}
            strong={strong}
            lineHeight={lineHeight}
            maxLines={perLine}
          />
        ),
      )}
    </div>
  );
}

export type TitleProps = {
  text: string;
  size: number;
  color?: string;
  maxLines?: number;
  lineHeight?: number;
  style?: CSSProperties;
};

/** Titre en police « Heading » 700 : nœud texte unique en `display:"block"`, clamp avec ellipse. */
export function Title({ text, size, color, maxLines = 3, lineHeight = 1.08, style }: TitleProps) {
  return (
    <div
      style={{
        display: "block",
        fontFamily: "Heading",
        fontWeight: 700,
        fontSize: size,
        lineHeight,
        lineClamp: maxLines,
        ...(color ? { color } : {}),
        ...style,
      }}
    >
      {cleanTitle(text)}
    </div>
  );
}
