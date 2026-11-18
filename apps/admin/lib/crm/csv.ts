/**
 * Lecture d'un fichier à colonnes (CSV, TSV, copier-coller depuis un
 * tableur). Le séparateur est deviné sur les premières lignes ; les guillemets
 * suivent la convention habituelle (champ entre guillemets, guillemet doublé
 * pour en écrire un, sauts de ligne permis à l'intérieur).
 */

const CANDIDATES = [";", ",", "\t", "|"] as const;
export type Delimiter = (typeof CANDIDATES)[number];

/** Nombre de séparateurs hors guillemets sur une ligne. */
function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) count++;
  }
  return count;
}

/**
 * Séparateur le plus plausible : celui qui découpe les premières lignes en
 * un même nombre de colonnes (au moins deux). À défaut, le plus fréquent sur
 * la première ligne ; un fichier d'une seule colonne garde la virgule.
 */
export function detectDelimiter(text: string): Delimiter {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim() !== "").slice(0, 12);
  if (lines.length === 0) return ",";
  let best: Delimiter = ",";
  let bestScore = 0;
  for (const candidate of CANDIDATES) {
    const counts = lines.map((line) => countOutsideQuotes(line, candidate));
    const first = counts[0] ?? 0;
    if (first === 0) continue;
    const consistent = counts.filter((count) => count === first).length;
    // La régularité prime, puis le nombre de colonnes
    const score = consistent * 1000 + first;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

export type ParseCsvOptions = { delimiter?: Delimiter; maxRows?: number };

/** Lignes d'un texte à colonnes ; les lignes entièrement vides sont ignorées. */
export function parseCsv(input: string, options: ParseCsvOptions = {}): string[][] {
  // Marque d'ordre des octets laissée par certains tableurs
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let wasQuoted = false;
  const endField = () => {
    row.push(wasQuoted ? field : field.trim());
    field = "";
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field.trim() === "") {
      quoted = true;
      wasQuoted = true;
      field = "";
    } else if (char === delimiter) endField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRow();
      if (rows.length >= maxRows) return rows;
    } else field += char;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/**
 * Texte d'un fichier : UTF-8 quand il est valide (avec ou sans marque d'ordre
 * des octets), UTF-16 si le fichier l'annonce, sinon Windows-1252 — l'encodage
 * des exports d'Excel en France.
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
