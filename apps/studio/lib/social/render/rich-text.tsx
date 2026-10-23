/**
 * Texte des visuels (§4.1). Contraintes satori rappelées : `display:"flex"`
 * sur tout parent à plusieurs enfants, pas de flux inline (le gras se rend en
 * mots-spans dans une rangée `flexWrap`), `lineClamp` uniquement sur un nœud
 * texte unique, aucun emoji (retiré avant rendu).
 */

import type { CSSProperties } from "react";
import { bulletLines, parseEmphasis, plainText, stripEmoji } from "@theralys/shared";

const BULLET_RE = /^\s*(?:[-•*]|✅|\d{1,2}[.)])\s+/u;

/** Texte prêt pour satori : sans emoji, U+202F → U+00A0, espaces normalisés. */
export function cleanText(text: string | null | undefined): string {
  return stripEmoji(text ?? "")
    .replace(/\u202f/g, "\u00a0")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Titre d'une diapositive : texte brut (sans `**`), sur une seule ligne logique. */
export function cleanTitle(text: string | null | undefined): string {
  return cleanText(plainText(text).replace(/\s*\n+\s*/g, " "));
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

/** Une ligne : nœud texte unique (clamp) ou mots-spans quand elle porte du gras. */
function Line({ line, size, color, strong, lineHeight, maxLines, style }: LineProps) {
  const words = mergePunctuation(parseEmphasis(line));
  const hasBold = words.some((w) => w.bold);
  if (!hasBold) {
    return (
      <div style={{ display: "flex", fontSize: size, lineHeight, color, lineClamp: maxLines, ...style }}>
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

/** Titre en police « Heading » 700, nœud texte unique avec clamp. */
export function Title({ text, size, color, maxLines = 3, lineHeight = 1.08, style }: TitleProps) {
  return (
    <div
      style={{
        display: "flex",
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
