/**
 * Lecture d'une liste de prospects, quel que soit son format : CSV ou TSV,
 * classeur Excel (.xlsx), JSON, carnet d'adresses vCard, ou texte collé depuis
 * un tableur. Tout est ramené à un tableau de lignes, que l'écran d'import
 * fait ensuite correspondre aux champs d'un prospect.
 */

import { decodeText, parseCsv } from "./csv";
import { cleanText } from "./normalize";
import { parseVcard, VCARD_HEADERS } from "./vcard";
import { looksLikeLegacyXls, looksLikeZip, readXlsx } from "./xlsx";

export type ImportFormat = "csv" | "xlsx" | "json" | "vcard" | "paste";

export const FORMAT_LABELS: Record<ImportFormat, string> = {
  csv: "CSV",
  xlsx: "Excel",
  json: "JSON",
  vcard: "vCard",
  paste: "Copier-coller",
};

/** Extensions proposées dans le sélecteur de fichier. */
export const ACCEPTED_EXTENSIONS = ".csv,.tsv,.txt,.xlsx,.json,.vcf";

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Lignes lues au plus dans un fichier (au-delà, le fichier se découpe). */
export const MAX_IMPORT_ROWS = 20_000;

export type ParsedSheet = {
  name: string;
  /** Toutes les lignes, la première comprise */
  rows: string[][];
  /** La première ligne porte les titres des colonnes (deviné ; l'écran d'import laisse corriger) */
  hasHeader: boolean;
  /** Le fichier a été coupé à `MAX_IMPORT_ROWS` lignes */
  truncated: boolean;
};

export type ParsedImport = { format: ImportFormat; sheets: ParsedSheet[] };

export class ImportError extends Error {}

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_LIKE = /^\+?[\d\s().-]{9,}$/;

/**
 * Une première ligne est une ligne de titres si aucune de ses cases ne
 * ressemble à une donnée (e-mail, téléphone, nombre, adresse de site) et si
 * elle n'a pas de case vide au milieu des autres.
 */
export function looksLikeHeader(row: string[] | undefined): boolean {
  if (!row || row.length === 0) return false;
  const cells = row.map((cell) => cell.trim());
  const filled = cells.filter((cell) => cell !== "");
  if (filled.length === 0) return false;
  if (filled.some((cell) => EMAIL_LIKE.test(cell) || PHONE_LIKE.test(cell) || /^\d+([.,]\d+)?$/.test(cell) || /^https?:\/\//i.test(cell))) return false;
  return filled.every((cell) => cell.length <= 60);
}

function sheet(name: string, rows: string[][], hasHeader?: boolean): ParsedSheet {
  const truncated = rows.length > MAX_IMPORT_ROWS + 1;
  const kept = truncated ? rows.slice(0, MAX_IMPORT_ROWS + 1) : rows;
  return { name, rows: kept, hasHeader: hasHeader ?? looksLikeHeader(kept[0]), truncated };
}

/** Valeur JSON mise à plat en texte : les listes sont jointes, les objets ouverts sur un niveau. */
function jsonCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => (typeof item === "object" && item !== null ? "" : String(item))).filter(Boolean).join(", ");
  if (typeof value === "object") return "";
  return String(value);
}

/** Liste d'objets JSON → titres (réunion des clés, dans l'ordre de rencontre) et lignes. */
export function jsonToRows(data: unknown): string[][] {
  let list: unknown = data;
  if (list && typeof list === "object" && !Array.isArray(list)) {
    const record = list as Record<string, unknown>;
    const key = ["contacts", "prospects", "leads", "data", "items", "results", "records", "rows"].find((name) => Array.isArray(record[name])) ?? Object.keys(record).find((name) => Array.isArray(record[name]));
    list = key ? record[key] : [record];
  }
  if (!Array.isArray(list)) throw new ImportError("Ce fichier JSON ne contient pas de liste de prospects.");
  const headers: string[] = [];
  const index = new Map<string, number>();
  const flat: Record<string, string>[] = [];
  for (const item of list.slice(0, MAX_IMPORT_ROWS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        // Un niveau d'objet imbriqué : « address.city »
        for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) row[`${key}.${inner}`] = jsonCell(innerValue);
      } else row[key] = jsonCell(value);
    }
    for (const key of Object.keys(row)) {
      if (!index.has(key) && headers.length < 200) {
        index.set(key, headers.length);
        headers.push(key);
      }
    }
    flat.push(row);
  }
  if (headers.length === 0) throw new ImportError("Ce fichier JSON ne contient pas de liste de prospects.");
  return [headers, ...flat.map((row) => headers.map((header) => cleanText(row[header] ?? "", 2000)))];
}

/** Texte collé depuis un tableur ou une liste. */
export function parsePasted(text: string): ParsedImport {
  const rows = parseCsv(text, { maxRows: MAX_IMPORT_ROWS + 1 });
  if (rows.length === 0) throw new ImportError("Rien à importer : collez au moins une ligne.");
  return { format: "paste", sheets: [sheet("Texte collé", rows)] };
}

/** Lecture d'un fichier d'après son contenu d'abord, son extension ensuite. */
export async function parseImportFile(filename: string, bytes: Uint8Array): Promise<ParsedImport> {
  if (bytes.length === 0) throw new ImportError("Ce fichier est vide.");
  if (bytes.length > MAX_FILE_BYTES) throw new ImportError("Ce fichier dépasse 15 Mo : découpez-le en plusieurs listes.");
  const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase() ?? "";
  if (looksLikeLegacyXls(bytes)) throw new ImportError("Les anciens classeurs .xls ne sont pas lus : dans Excel, enregistrez-le en .xlsx ou en .csv.");
  if (looksLikeZip(bytes)) {
    try {
      const sheets = await readXlsx(bytes, { maxRows: MAX_IMPORT_ROWS + 1 });
      return { format: "xlsx", sheets: sheets.map((entry) => sheet(entry.name, entry.rows)) };
    } catch (error) {
      throw new ImportError(error instanceof Error ? error.message : "Ce classeur n'a pas pu être lu.");
    }
  }
  if (["xlsx", "xlsm", "ods", "numbers"].includes(extension)) throw new ImportError("Ce classeur n'a pas pu être lu : enregistrez-le en .xlsx ou en .csv.");
  const text = decodeText(bytes);
  const start = text.trimStart();
  if (extension === "vcf" || /^BEGIN:VCARD/i.test(start)) {
    const rows = parseVcard(text, { maxRows: MAX_IMPORT_ROWS });
    if (rows.length === 0) throw new ImportError("Aucune fiche de contact dans ce fichier vCard.");
    return { format: "vcard", sheets: [sheet("Contacts", [[...VCARD_HEADERS], ...rows], true)] };
  }
  if (extension === "json" || start.startsWith("{") || start.startsWith("[")) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      if (extension === "json") throw new ImportError("Ce fichier JSON est mal formé.");
      data = undefined;
    }
    if (data !== undefined) return { format: "json", sheets: [sheet("Données", jsonToRows(data), true)] };
  }
  const rows = parseCsv(text, { maxRows: MAX_IMPORT_ROWS + 1 });
  if (rows.length === 0) throw new ImportError("Ce fichier ne contient aucune ligne.");
  return { format: "csv", sheets: [sheet(filename, rows)] };
}

/** Titres et lignes de données d'une feuille, selon que sa première ligne porte les titres. */
export function tableOf(parsed: ParsedSheet, hasHeader: boolean): { headers: string[]; rows: string[][] } {
  const width = parsed.rows.reduce((max, row) => Math.max(max, row.length), 0);
  const first = parsed.rows[0] ?? [];
  const headers = Array.from({ length: width }, (_, column) => {
    const title = hasHeader ? cleanText(first[column] ?? "", 60) : "";
    return title || `Colonne ${column + 1}`;
  });
  return { headers, rows: hasHeader ? parsed.rows.slice(1) : parsed.rows };
}
