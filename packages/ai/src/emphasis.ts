/**
 * Mise en valeur des textes générés : chaque bloc descriptif (résumé de
 * spécialité, réponse de FAQ, paragraphe, étape…) doit contenir quelques
 * passages **gras** sur les mots pertinents, comme le hero ou le déroulement
 * de séance. Ce module mesure cette couverture sur une structure générée,
 * décide d'une relance du modèle, et fournit au mock une mise en gras
 * déterministe de ses propres textes.
 */

/** Clés de texte descriptif rendues en texte riche (Rich / Markdown). */
const RICH_TEXT_KEYS = new Set([
  "paragraphs",
  "excerpt",
  "text",
  "answer",
  "description",
  "intro",
  "note",
  "body",
  "bullets",
  "content",
]);
/** Sous-arbres jamais affichés (plan des pages transmis aux appels suivants). */
const IGNORED_KEYS = new Set(["motifsPlan"]);
/** En dessous, une ligne est trop courte pour justifier un passage en gras. */
const MIN_LENGTH = 60;
const EMPHASIS = /\*\*[^*\n]+?\*\*/;
/** Ligne de liste (✅, puce, numéro) : le gras n'y est pas exigé. */
const LIST_LINE = /^\s*(✅|[-*•]\s|\d+[.)]\s)/;

export type EmphasisGap = { path: string; excerpt: string };
export type EmphasisReport = { total: number; gaps: EmphasisGap[] };

export function hasEmphasis(text: string): boolean {
  return EMPHASIS.test(text);
}

function isListLike(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim());
  return lines.length > 0 && lines.every((l) => LIST_LINE.test(l));
}

/** Textes descriptifs assez longs pour mériter du gras, et ceux qui n'en ont pas. */
export function findEmphasisGaps(value: unknown): EmphasisReport {
  const report: EmphasisReport = { total: 0, gaps: [] };
  walk(value, "", report);
  return report;
}

function inspect(text: string, path: string, report: EmphasisReport): void {
  if (text.length < MIN_LENGTH || isListLike(text)) return;
  report.total += 1;
  if (!hasEmphasis(text)) report.gaps.push({ path, excerpt: text.slice(0, 80) });
}

function walk(value: unknown, path: string, report: EmphasisReport): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, report));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, v] of Object.entries(value)) {
    if (IGNORED_KEYS.has(key)) continue;
    const childPath = path ? `${path}.${key}` : key;
    if (!RICH_TEXT_KEYS.has(key)) {
      walk(v, childPath, report);
    } else if (typeof v === "string") {
      inspect(v, childPath, report);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) =>
        typeof item === "string"
          ? inspect(item, `${childPath}[${i}]`, report)
          : walk(item, `${childPath}[${i}]`, report),
      );
    } else {
      walk(v, childPath, report);
    }
  }
}

/**
 * Relance (une seule fois) quand l'oubli est systématique : plus d'un texte
 * sur six sans gras, et au moins trois — un oubli isolé ne vaut pas un
 * nouvel appel complet.
 */
export function needsEmphasisRetry(report: EmphasisReport): boolean {
  return report.gaps.length >= 3 && report.gaps.length / report.total >= 0.15;
}

export function emphasisFeedback(report: EmphasisReport): string {
  const list = report.gaps
    .slice(0, 8)
    .map((g) => `- ${g.path} : « ${g.excerpt}… »`)
    .join("\n");
  return `MISE EN FORME : ta précédente réponse manquait de passages en **gras** dans ${report.gaps.length} textes sur ${report.total}, par exemple :
${list}
Chaque texte descriptif (résumés de spécialités, réponses de FAQ, paragraphes, descriptions d'étapes, notes) doit contenir 1 à 3 passages **gras** courts (2 à 6 mots) sur les mots pertinents — jamais une phrase entière, jamais dans les titres. Recommence en respectant strictement le format.`;
}

/* ───────────── Mise en gras déterministe (générateur de secours) ───────────── */

const STOPWORDS = new Set([
  "de", "des", "du", "la", "le", "les", "et", "à", "a", "en", "pour", "un", "une",
  "vos", "votre", "qui", "que", "ou", "sur", "dans", "par", "au", "aux", "avec",
  "se", "ne", "est", "sont", "ce", "cette", "ces", "son", "sa", "ses", "plus",
  "sans", "vers", "chez", "entre", "comme", "très", "tout", "toute", "tous",
  "toutes", "mon", "ma", "mes", "nous", "vous", "je", "il", "elle", "on", "y",
  "ni", "puis", "donc", "car", "mais", "n'est", "d'un", "d'une",
  "assez", "trop", "peu", "bien", "si", "aussi", "encore", "souvent",
]);

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isStop(word: string): boolean {
  const w = word.toLowerCase().replace(/[.,;:!?«»()]/g, "");
  return STOPWORDS.has(w) || /['’]$/.test(w);
}

/** Début de la phrase retenue : on saute une première phrase de 1-2 mots (« Non. »). */
function leadStart(text: string): number {
  const first = /^\s*[^.!?\n]*[.!?]\s+/.exec(text);
  if (first && countWords(first[0]) <= 2) return first[0].length;
  return /^\s*/.exec(text)?.[0].length ?? 0;
}

/** Fin (index dans la phrase) du passage à mettre en gras. */
function leadEnd(sentence: string): number {
  // Première proposition entière si elle fait 3 à 6 mots (« Comptez environ une heure : »)
  const clause = /^[^,:;.!?\n]+/.exec(sentence)?.[0] ?? "";
  const clauseWords = countWords(clause);
  if (clauseWords >= 3 && clauseWords <= 6) return clause.trimEnd().length;
  // Énumération avant un deux-points (« Examens, prise de parole, compétition : »)
  const colon = sentence.search(/\s:/);
  if (colon > 0 && countWords(sentence.slice(0, colon)) <= 6) return colon;
  // Sinon 3 mots, prolongés tant que le dernier est un mot-outil (6 au plus)
  const words = [...sentence.matchAll(/\S+/g)];
  if (words.length < 2) return 0;
  let n = Math.min(3, words.length);
  while (n < words.length && n < 6 && isStop(words[n - 1]![0])) n += 1;
  while (n > 2 && isStop(words[n - 1]![0])) n -= 1;
  const last = words[n - 1]!;
  return last.index + last[0].length;
}

function emphasizeLine(line: string): string {
  if (!line.trim() || hasEmphasis(line) || LIST_LINE.test(line) || /^\s*(#|>|!\[)/.test(line)) {
    return line;
  }
  const start = leadStart(line);
  const sentence = line.slice(start);
  const end = leadEnd(sentence);
  const lead = sentence.slice(0, end).replace(/[\s.,;:!?]+$/, "");
  if (countWords(lead) < 2) return line;
  return `${line.slice(0, start)}**${lead}**${sentence.slice(lead.length)}`;
}

/**
 * Met en gras l'attaque de chaque paragraphe (première proposition ou
 * premiers mots porteurs). Titres, listes, citations et textes déjà mis en
 * forme sont laissés tels quels.
 */
export function emphasizeLead(text: string): string {
  if (!text.includes("\n")) return emphasizeLine(text);
  return text.split("\n").map(emphasizeLine).join("\n");
}
