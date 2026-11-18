/**
 * Lecture d'un classeur Excel (.xlsx) sans bibliothèque : le fichier est une
 * archive ZIP de documents XML. On lit le répertoire de l'archive, on
 * décompresse les quelques documents utiles avec `DecompressionStream`
 * (disponible dans les navigateurs récents et dans Node), puis on relève les
 * cellules de chaque feuille.
 *
 * Les valeurs sont rendues en texte, telles que stockées : un nombre reste le
 * nombre saisi (un téléphone « 612345678 » retrouve son zéro à la
 * normalisation). Les formules donnent leur dernier résultat enregistré.
 */

/** Taille décompressée maximale d'un document de l'archive : garde-fou contre une archive piégée. */
const MAX_ENTRY_BYTES = 80 * 1024 * 1024;

export class XlsxError extends Error {}

type ZipEntry = { name: string; method: number; compressedSize: number; size: number; offset: number };

function readEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Fin du répertoire central : dans les 64 Ko de la fin (commentaire éventuel)
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new XlsxError("Ce fichier n'est pas un classeur Excel (.xlsx).");
  const count = view.getUint16(end + 10, true);
  let pointer = view.getUint32(end + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (pointer + 46 > bytes.length || view.getUint32(pointer, true) !== 0x02014b50) throw new XlsxError("Le classeur est endommagé (répertoire illisible).");
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const size = view.getUint32(pointer + 24, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const offset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    entries.set(name, { name, method, compressedSize, size, offset });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new XlsxError("Ce navigateur ne sait pas ouvrir les fichiers Excel : enregistrez le fichier en CSV.");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_ENTRY_BYTES) {
      await reader.cancel();
      throw new XlsxError("Le classeur est trop volumineux pour être importé d'un coup : découpez-le.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (entry.offset + 30 > bytes.length || view.getUint32(entry.offset, true) !== 0x04034b50) throw new XlsxError("Le classeur est endommagé (document introuvable).");
  if (entry.size > MAX_ENTRY_BYTES) throw new XlsxError("Le classeur est trop volumineux pour être importé d'un coup : découpez-le.");
  const nameLength = view.getUint16(entry.offset + 26, true);
  const extraLength = view.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLength + extraLength;
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder("utf-8").decode(data);
  if (entry.method === 8) return new TextDecoder("utf-8").decode(await inflateRaw(data));
  throw new XlsxError("Le classeur utilise une compression que l'import ne connaît pas : enregistrez-le en CSV.");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Excel écrit certains caractères de contrôle sous la forme _x000D_. */
function decodeExcelEscapes(text: string): string {
  return text.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => {
    const point = parseInt(hex, 16);
    return point === 10 || point === 13 ? "\n" : point < 32 ? "" : String.fromCharCode(point);
  });
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
  return match ? decodeXml(match[1]!) : undefined;
}

/** Texte d'un élément `<si>` ou `<is>` : toutes ses portions `<t>`, hors lecture phonétique. */
function richText(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh[\s>][\s\S]*?<\/rPh>/g, "");
  let text = "";
  for (const match of withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) text += match[1] ?? "";
  return decodeExcelEscapes(decodeXml(text));
}

function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const match of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si(?:\s[^>]*)?\/>/g)) out.push(richText(match[1] ?? ""));
  return out;
}

/** Indice de colonne (0 pour A) d'une référence de cellule « BC12 ». */
export function columnIndex(reference: string): number {
  let index = 0;
  for (let i = 0; i < reference.length; i++) {
    const code = reference.charCodeAt(i);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

/** Nombre tel qu'on l'a saisi : « 81000 » plutôt que « 81000.0 », sans notation scientifique pour un entier. */
function numberText(raw: string): string {
  if (/^-?\d+$/.test(raw)) return raw;
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  return String(value);
}

function sheetRows(xml: string, strings: string[], maxRows: number): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    let next = 0;
    for (const cellMatch of rowMatch[1]!.matchAll(/<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1] ?? "";
      const inner = cellMatch[2] ?? "";
      const reference = attribute(attrs, "r");
      const column = reference ? columnIndex(reference) : next;
      next = column + 1;
      if (column < 0 || column > 500) continue;
      const type = attribute(attrs, "t");
      let value = "";
      if (type === "inlineStr") value = richText(inner);
      else {
        const raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (raw !== undefined) {
          const text = decodeXml(raw);
          if (type === "s") value = strings[Number(text)] ?? "";
          else if (type === "b") value = text === "1" ? "oui" : "non";
          else if (type === "e") value = "";
          else if (type === "str") value = decodeExcelEscapes(text);
          else value = numberText(text.trim());
        }
      }
      while (cells.length < column) cells.push("");
      cells[column] = value.replace(/\s+/g, " ").trim();
    }
    if (cells.some((cell) => cell !== "")) rows.push(cells);
    if (rows.length >= maxRows) break;
  }
  return rows;
}

export type XlsxSheet = { name: string; rows: string[][] };

/** Feuilles d'un classeur, dans l'ordre des onglets ; les feuilles vides sont écartées. */
export async function readXlsx(bytes: Uint8Array, options: { maxRows?: number } = {}): Promise<XlsxSheet[]> {
  const maxRows = options.maxRows ?? 50_000;
  const entries = readEntries(bytes);
  const workbookEntry = entries.get("xl/workbook.xml");
  if (!workbookEntry) throw new XlsxError("Ce fichier n'est pas un classeur Excel (.xlsx).");
  const workbook = await readEntry(bytes, workbookEntry);
  const relsEntry = entries.get("xl/_rels/workbook.xml.rels");
  const rels = relsEntry ? await readEntry(bytes, relsEntry) : "";
  const targets = new Map<string, string>();
  for (const match of rels.matchAll(/<Relationship(\s[^>]*?)\/?>/g)) {
    const id = attribute(match[1]!, "Id");
    const target = attribute(match[1]!, "Target");
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
  }
  const stringsEntry = entries.get("xl/sharedStrings.xml");
  const strings = stringsEntry ? sharedStrings(await readEntry(bytes, stringsEntry)) : [];
  const sheets: XlsxSheet[] = [];
  let position = 0;
  for (const match of workbook.matchAll(/<sheet(\s[^>]*?)\/?>/g)) {
    position++;
    const name = attribute(match[1]!, "name") ?? `Feuille ${position}`;
    const relation = attribute(match[1]!, "r:id");
    const path = (relation && targets.get(relation)) ?? `xl/worksheets/sheet${position}.xml`;
    const entry = entries.get(path);
    if (!entry) continue;
    const rows = sheetRows(await readEntry(bytes, entry), strings, maxRows);
    if (rows.length > 0) sheets.push({ name, rows });
  }
  if (sheets.length === 0) throw new XlsxError("Le classeur ne contient aucune ligne à importer.");
  return sheets;
}

/** Signature d'une archive ZIP (donc d'un .xlsx) en tête de fichier. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05) && (bytes[3] === 0x04 || bytes[3] === 0x06);
}

/** Signature d'un ancien classeur binaire (.xls), que l'import ne lit pas. */
export function looksLikeLegacyXls(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}
