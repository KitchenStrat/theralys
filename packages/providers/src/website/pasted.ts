/**
 * Repli quand le site refuse la lecture automatique : le praticien colle le
 * texte de ses pages, qui tient alors lieu de pages lues. Module pur, aucun
 * accès réseau.
 *
 * Le texte collé suit le même chemin que le texte lu (mêmes bornes, même
 * nettoyage, même forme de page) pour que la suite — extraction du profil —
 * ne distingue pas les deux origines.
 */

import { EXTERNAL_SITE_LIMITS, type ExternalSitePage } from "@theralys/shared";
import { cleanLine, cleanLineMax, joinBlocks, sha256Hex } from "./text";

const TITLE_MAX = 80;
const HEADING_MAX = 70;
const HEADING_WORDS_MAX = 10;
const HEADINGS_MAX = 30;

/** Ligne de séparation tracée par le praticien entre deux pages (« ----- », « ===== »). */
const SEPARATOR = /^[-=_*#~]{3,}$/;
const BULLET = /^(?:[-•*–—·▪◦>]|\d{1,2}[.)])\s/u;

/**
 * Lignes nettoyées du texte collé : balises retirées (un copier-coller depuis
 * un éditeur de site en laisse parfois), caractères invisibles retirés,
 * espaces réduits. Une ligne vide marque un changement de paragraphe.
 */
function cleanLines(text: string): string[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/<[^>]{0,200}>/g, " ")
    .replace(/[<>]/g, " ")
    .split("\n")
    .map(cleanLine);
  // Jamais deux lignes vides de suite, ni au début, ni à la fin
  const out: string[] = [];
  for (const line of lines) {
    if (line === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(line);
  }
  while (out[out.length - 1] === "") out.pop();
  return out;
}

/** Une ligne courte, sans ponctuation de fin de phrase, qui introduit du texte : un intertitre probable. */
function headingOf(line: string, next: string | undefined): string | null {
  const markdown = /^#{1,6}\s+(.+)$/.exec(line);
  if (markdown) return cleanLineMax(markdown[1]!.replace(/\s+#+$/, ""), HEADING_MAX);
  if (next === undefined || next === "" || BULLET.test(line)) return null;
  const candidate = line.replace(/\s*:$/, "");
  if (candidate.length < 3 || candidate.length > HEADING_MAX || candidate.split(" ").length > HEADING_WORDS_MAX) return null;
  if (/[.,;…]$/.test(candidate) || !/^[\p{Lu}\p{N}«"“]/u.test(candidate)) return null;
  // Coordonnées et prix : des lignes courtes qui ne sont pas des titres
  if (/@|https?:|www\./i.test(candidate) || candidate.replace(/\D/g, "").length * 2 >= candidate.length) return null;
  return candidate;
}

/** Découpe une suite de lignes en morceaux d'au plus `max` caractères, de préférence entre deux paragraphes. */
function chunkLines(lines: readonly string[], max: number): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 0;
  // Dernière ligne vide du morceau en cours : là où couper proprement
  let lastBreak = -1;
  for (const line of lines) {
    const added = line.length + 1;
    while (size + added > max && current.length > 0) {
      const cut = lastBreak > 0 ? lastBreak : current.length;
      chunks.push(current.slice(0, cut));
      current = current.slice(cut).filter((kept, index) => !(index === 0 && kept === ""));
      size = current.reduce((sum, kept) => sum + kept.length + 1, 0);
      lastBreak = current.lastIndexOf("");
    }
    if (line === "" && current.length === 0) continue;
    if (line === "") lastBreak = current.length;
    current.push(line);
    size += added;
  }
  if (current.some((line) => line !== "")) chunks.push(current);
  return chunks;
}

/**
 * Texte collé → pages, comme si elles avaient été lues sur le site : une
 * page, ou plusieurs quand le texte dépasse la taille d'une page ou que le
 * praticien a tracé des séparations (« ----- »). Toutes sont de nature
 * `home` et portent l'adresse du site (le texte collé n'a pas d'adresse
 * propre). Les intertitres sont devinés aux lignes courtes.
 *
 * Bornes : moins de `pastedMinChars` caractères utiles → aucune page (trop
 * peu pour un profil) ; au-delà de `pastedMaxChars`, la suite est ignorée.
 */
export function pastedTextToPages(text: string, url: string, now: Date = new Date()): ExternalSitePage[] {
  const limits = EXTERNAL_SITE_LIMITS;
  const lines = cleanLines(typeof text === "string" ? text.slice(0, limits.pastedMaxChars * 4) : "");
  const useful = lines.filter((line) => line !== "" && !SEPARATOR.test(line)).join("\n");
  if (useful.length < limits.pastedMinChars) return [];

  // Borne haute : on garde le début du texte, coupé entre deux lignes
  const kept: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > limits.pastedMaxChars) break;
    kept.push(line);
    size += line.length + 1;
  }

  // Sections tracées par le praticien, puis morceaux à la taille d'une page
  const sections: string[][] = [[]];
  for (const line of kept) {
    if (SEPARATOR.test(line)) sections.push([]);
    else sections[sections.length - 1]!.push(line);
  }
  const chunks = sections.flatMap((section) => chunkLines(section, limits.pageChars)).slice(0, limits.maxPages);

  let address = url;
  let host = "";
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    address = parsed.href;
    host = parsed.hostname;
  } catch {
    host = "";
  }
  const fetchedAt = now.toISOString();

  return chunks.map((chunk, index) => {
    const blocks = chunk.filter((line) => line !== "");
    const headings: string[] = [];
    const body = chunk.map((line, position) => {
      const heading = line === "" ? null : headingOf(line, chunk[position + 1] === "" ? chunk[position + 2] : chunk[position + 1]);
      if (heading !== null && heading !== "" && headings.length < HEADINGS_MAX && !headings.includes(heading)) headings.push(heading);
      // Une ligne de titre « # Titre » est gardée sans son balisage
      return heading !== null && /^#{1,6}\s/.test(line) ? heading : line;
    });
    const pageText = joinBlocks(body, limits.pageChars);
    const fallback = chunks.length > 1 ? `Texte collé (${index + 1}/${chunks.length})` : host !== "" ? `Texte collé — ${host}` : "Texte collé";
    const title = cleanLineMax(headings[0] ?? (blocks[0] !== undefined && blocks[0].length <= TITLE_MAX ? blocks[0] : fallback), TITLE_MAX) || fallback;
    return { url: address, kind: "home" as const, title, headings, text: pageText, hash: sha256Hex(pageText), fetchedAt };
  });
}
