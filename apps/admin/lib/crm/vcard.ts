/**
 * Lecture d'un carnet d'adresses au format vCard (.vcf), tel que l'exportent
 * un téléphone, Google Contacts ou Outlook. Chaque fiche devient une ligne de
 * tableau, pour passer par le même écran de correspondance que les autres
 * formats.
 */

export const VCARD_HEADERS = ["Prénom", "Nom", "Société", "Fonction", "E-mail", "Téléphone", "Adresse", "Code postal", "Ville", "Site web", "Notes"] as const;

type Property = { name: string; params: string; value: string };

/** Lignes logiques : une ligne qui commence par une espace prolonge la précédente. */
function unfold(text: string): string[] {
  const lines: string[] = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  // Quoted-printable : un « = » en fin de ligne prolonge aussi la valeur
  const joined: string[] = [];
  for (const line of lines) {
    const previous = joined[joined.length - 1];
    if (previous !== undefined && previous.endsWith("=") && /ENCODING=QUOTED-PRINTABLE/i.test(previous.split(":")[0] ?? "")) joined[joined.length - 1] = previous.slice(0, -1) + line;
    else joined.push(line);
  }
  return joined;
}

function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    const hex = value.slice(i + 1, i + 3);
    if (char === "=" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else bytes.push(...new TextEncoder().encode(char));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("windows-1252").decode(new Uint8Array(bytes));
  }
}

/** Valeur d'une propriété : séquences d'échappement de la vCard remises en clair. */
function unescapeValue(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, char: string) => (char === "n" || char === "N" ? "\n" : char));
}

/** Découpe sur les points-virgules non échappés (champs composés : N, ADR, ORG). */
function splitComponents(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\" && i + 1 < value.length) {
      current += value[i]! + value[i + 1]!;
      i++;
    } else if (value[i] === ";") {
      parts.push(current);
      current = "";
    } else current += value[i]!;
  }
  parts.push(current);
  return parts.map((part) => unescapeValue(part).trim());
}

function parseProperty(line: string): Property | null {
  const colon = line.indexOf(":");
  if (colon <= 0) return null;
  const head = line.slice(0, colon);
  let value = line.slice(colon + 1);
  const [rawName = "", ...params] = head.split(";");
  // « item1.EMAIL » : préfixe de groupe d'Apple
  const name = rawName.includes(".") ? rawName.slice(rawName.lastIndexOf(".") + 1) : rawName;
  const paramText = params.join(";");
  if (/ENCODING=QUOTED-PRINTABLE/i.test(paramText)) value = decodeQuotedPrintable(value);
  return { name: name.toUpperCase(), params: paramText.toUpperCase(), value };
}

/** Première valeur d'une propriété, en préférant celle qui porte l'un des types donnés. */
function pick(properties: Property[], name: string, preferred: string[] = []): string {
  const matches = properties.filter((property) => property.name === name && property.value.trim() !== "");
  // Les types sont essayés dans l'ordre donné : un mobile passe avant un fixe professionnel
  for (const type of preferred) {
    const match = matches.find((property) => property.params.includes(type));
    if (match) return match.value.trim();
  }
  return matches[0] ? matches[0].value.trim() : "";
}

/** Fiches d'un fichier vCard, sous forme de lignes dans l'ordre de `VCARD_HEADERS`. */
export function parseVcard(text: string, options: { maxRows?: number } = {}): string[][] {
  const maxRows = options.maxRows ?? 50_000;
  const rows: string[][] = [];
  let current: Property[] | null = null;
  for (const line of unfold(text)) {
    const trimmed = line.trim();
    if (/^BEGIN:VCARD$/i.test(trimmed)) {
      current = [];
      continue;
    }
    if (/^END:VCARD$/i.test(trimmed)) {
      if (current) {
        const row = cardRow(current);
        if (row.some((cell) => cell !== "")) rows.push(row);
        if (rows.length >= maxRows) break;
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const property = parseProperty(line);
    if (property) current.push(property);
  }
  return rows;
}

function cardRow(properties: Property[]): string[] {
  const [last = "", first = ""] = splitComponents(pick(properties, "N"));
  let firstName = first;
  let lastName = last;
  const fullName = unescapeValue(pick(properties, "FN"));
  if (!firstName && !lastName && fullName) {
    const words = fullName.split(/\s+/);
    firstName = words.length > 1 ? words[0]! : "";
    lastName = words.length > 1 ? words.slice(1).join(" ") : fullName;
  }
  const company = splitComponents(pick(properties, "ORG"))[0] ?? "";
  const title = unescapeValue(pick(properties, "TITLE") || pick(properties, "ROLE"));
  const email = pick(properties, "EMAIL", ["PREF", "WORK"]);
  const phone = pick(properties, "TEL", ["CELL", "MOBILE", "PREF", "WORK"]);
  // ADR : boîte postale ; complément ; rue ; ville ; région ; code postal ; pays
  const address = splitComponents(pick(properties, "ADR", ["WORK", "PREF"]));
  const street = [address[2], address[1]].filter(Boolean).join(", ");
  const url = pick(properties, "URL");
  const note = unescapeValue(pick(properties, "NOTE"));
  return [firstName, lastName, company, title, email, phone, street, address[5] ?? "", address[3] ?? "", url, note].map((cell) => cell.replace(/\s+/g, " ").trim());
}
