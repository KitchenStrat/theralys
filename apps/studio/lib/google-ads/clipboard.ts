/**
 * Mise en forme pour le presse-papiers, au format attendu par Google Ads :
 * une ligne par mot-clé, « "expression" » entre guillemets pour la
 * correspondance expression, « [exact] » entre crochets pour l'exact, texte
 * nu pour la correspondance large ; une ligne par titre ou description
 * d'annonce ; une ligne par mot-clé négatif. Fonctions pures.
 */

import type { GoogleAdsMatchType } from "@theralys/shared";

export type ClipboardKeyword = { text: string; match: GoogleAdsMatchType };

/** Un mot-clé au format Google Ads selon sa correspondance. */
export function formatAdsKeyword(text: string, match: GoogleAdsMatchType): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/^["[]+|["\]]+$/g, "");
  if (clean === "") return "";
  if (match === "phrase") return `"${clean}"`;
  if (match === "exact") return `[${clean}]`;
  return clean;
}

/** Liste de mots-clés, une ligne par mot-clé, dédoublonnée, vides retirés. */
export function formatAdsKeywordList(keywords: ClipboardKeyword[]): string {
  return uniqueLines(keywords.map((k) => formatAdsKeyword(k.text, k.match)));
}

/** Mots-clés négatifs : une ligne par mot-clé, en correspondance expression (recommandation Google pour les listes partagées). */
export function formatAdsNegativeList(negatives: string[]): string {
  return uniqueLines(negatives.map((n) => formatAdsKeyword(n, "phrase")));
}

/** Titres ou descriptions d'annonce : une ligne par texte, vides retirés. */
export function formatAdsLines(lines: string[]): string {
  return uniqueLines(lines.map((l) => l.replace(/\s+/g, " ").trim()));
}

function uniqueLines(lines: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (line === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out.join("\n");
}
