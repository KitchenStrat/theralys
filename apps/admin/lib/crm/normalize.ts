/**
 * Mise au propre des données d'un prospect : espaces, e-mail, téléphone,
 * code postal, site, étiquettes, et la clé qui sert à repérer les doublons.
 */

import { CRM_STAGES, FIELD_MAX, MAX_EXTRA_FIELDS, MAX_EXTRA_VALUE, MAX_TAG_LENGTH, MAX_TAGS, STAGE_META, type ContactDraft, type CrmStage } from "./model";

const NBSP = /[\u00a0\u202f\u2007]/g;

/** Texte d'une cellule : espaces insécables et caractères de contrôle retirés, espaces resserrés. */
export function cleanText(value: unknown, max = 400): string {
  if (value === null || value === undefined) return "";
  const text = String(value)
    .replace(NBSP, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max).trim() : text;
}

/** Texte long (notes) : les sauts de ligne sont gardés. */
export function cleanMultiline(value: unknown, max: number): string {
  if (value === null || value === undefined) return "";
  const text = String(value)
    .replace(NBSP, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > max ? text.slice(0, max).trim() : text;
}

/** Forme de comparaison : minuscules, sans accents ni ponctuation. */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i;

/** E-mail en minuscules, ou chaîne vide s'il n'en a pas la forme. « Nom <a@b.fr> » et « mailto: » sont acceptés. */
export function normalizeEmail(value: unknown): string {
  let text = cleanText(value, 300).replace(/^mailto:/i, "");
  const bracketed = /<([^<>]+)>/.exec(text);
  if (bracketed) text = bracketed[1]!.trim();
  // Plusieurs adresses dans la cellule : on garde la première
  text = text.split(/[\s,;/]+/).find((part) => part.includes("@")) ?? text;
  text = text.replace(/[.,;]+$/, "").toLowerCase();
  return EMAIL.test(text) && text.length <= FIELD_MAX.email ? text : "";
}

/**
 * Téléphone au format international. Les numéros français sont reconnus sous
 * toutes leurs écritures (06 12 34 56 78, 0033…, +33 (0)6…, 612345678 quand un
 * tableur a mangé le zéro) ; un numéro étranger écrit avec son indicatif est
 * gardé tel quel. Chaîne vide si ce n'est pas un numéro.
 */
export function normalizePhone(value: unknown): string {
  let text = cleanText(value, 60).replace(/^tel:/i, "");
  if (!text) return "";
  // Plusieurs numéros dans la cellule : on garde le premier
  text = text.split(/\s*(?:[;|]|\/(?!\d{1,2}\b)|,\s|\bou\b)\s*/i)[0] ?? text;
  // « +33 (0)6 … » : le zéro entre parenthèses ne se compose pas
  text = text.replace(/\(0\)/g, "");
  const plus = text.trim().startsWith("+");
  let digits = text.replace(/\D/g, "");
  if (!digits) return "";
  if (!plus && digits.startsWith("00")) return finishInternational(digits.slice(2));
  if (plus) return finishInternational(digits);
  if (digits.length === 9 && /^[1-9]/.test(digits)) digits = `0${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+33${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("33")) return `+${digits}`;
  return "";
}

function finishInternational(digits: string): string {
  // +33 06… : zéro en trop après l'indicatif français
  if (digits.startsWith("330") && digits.length === 12) digits = `33${digits.slice(3)}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : "";
}

/** Téléphone tel qu'on le lit : « 06 12 34 56 78 » pour un numéro français, sinon le numéro international. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const french = /^\+33(\d{9})$/.exec(phone);
  if (!french) return phone;
  return `0${french[1]}`.replace(/(\d{2})(?=\d)/g, "$1 ");
}

/** Code postal : cinq chiffres pour la France (le zéro initial perdu par un tableur est remis), sinon le texte nettoyé. */
export function normalizePostalCode(value: unknown): string {
  const text = cleanText(value, 20).toUpperCase();
  if (!text) return "";
  const digits = text.replace(/\s/g, "");
  if (/^\d{4}$/.test(digits)) return `0${digits}`;
  if (/^\d{5}$/.test(digits)) return digits;
  // « 81000.0 » : nombre lu dans un tableur
  const numeric = /^(\d{4,5})\.0+$/.exec(digits);
  if (numeric) return numeric[1]!.padStart(5, "0");
  return text.slice(0, FIELD_MAX.postalCode);
}

/** Département d'un code postal français (« 2A », « 2B », « 971 »…), ou chaîne vide. */
export function departmentOf(postalCode: string | null | undefined): string {
  if (!postalCode || !/^\d{5}$/.test(postalCode)) return "";
  if (postalCode.startsWith("97") || postalCode.startsWith("98")) return postalCode.slice(0, 3);
  if (postalCode.startsWith("20")) return Number(postalCode) < 20200 ? "2A" : "2B";
  return postalCode.slice(0, 2);
}

/** Adresse de site : avec son protocole, sans espace ; chaîne vide si ce n'est pas une adresse. */
export function normalizeWebsite(value: unknown): string {
  let text = cleanText(value, 400);
  if (!text || /\s/.test(text) || text.includes("@")) return "";
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    if (!url.hostname.includes(".")) return "";
    const clean = `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname === "/" ? "" : url.pathname}${url.search}`;
    return clean.length <= FIELD_MAX.website ? clean : `${url.protocol}//${url.hostname.toLowerCase()}`;
  } catch {
    return "";
  }
}

/** Étiquettes : découpées sur virgule, point-virgule ou barre, dédoublonnées sans tenir compte de la casse. */
export function normalizeTags(value: unknown): string[] {
  const parts = Array.isArray(value) ? value.map((item) => cleanText(item, 80)) : cleanText(value, 600).split(/[,;|]+/);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of parts) {
    const tag = part.trim().replace(/^#/, "").slice(0, MAX_TAG_LENGTH).trim();
    const key = fold(tag);
    if (!tag || !key || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

/** Mise en forme d'un nom propre écrit tout en capitales ou tout en minuscules (« DUPONT » → « Dupont »). */
export function tidyName(value: string): string {
  const text = cleanText(value, 160);
  if (!text) return "";
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (!letters || (text !== text.toUpperCase() && text !== text.toLowerCase())) return text;
  return text.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

const PLACE_PARTICLES = new Set(["de", "du", "des", "la", "le", "les", "en", "sur", "sous", "et", "aux", "au", "lès", "lez", "près"]);

/** Nom de ville écrit tout en capitales ou tout en minuscules : « BOURG-EN-BRESSE » → « Bourg-en-Bresse ». */
export function tidyPlace(value: string): string {
  const tidy = tidyName(value);
  if (tidy === cleanText(value, 160)) return tidy;
  return tidy.replace(/([\s-])(\p{L}+)(?=[\s-])/gu, (whole, sep: string, word: string) => (PLACE_PARTICLES.has(word.toLowerCase()) ? sep + word.toLowerCase() : whole));
}

/** « Prénom Nom » ou « NOM Prénom » découpé en deux ; un seul mot va dans le nom. */
export function splitFullName(value: string): { firstName: string; lastName: string } {
  const text = cleanText(value, 200).replace(/^(m\.|mme|mlle|mr|dr|docteur|madame|monsieur)\s+/i, "");
  if (!text) return { firstName: "", lastName: "" };
  if (text.includes(",")) {
    const [last, first] = text.split(",").map((part) => part.trim());
    return { firstName: tidyName(first ?? ""), lastName: tidyName(last ?? "") };
  }
  const words = text.split(" ");
  if (words.length === 1) return { firstName: "", lastName: tidyName(text) };
  // « DUPONT Claire » : le nom en capitales est devant
  const upper = (word: string) => word.length > 1 && word === word.toUpperCase() && /\p{L}/u.test(word);
  if (upper(words[0]!) && !upper(words[words.length - 1]!)) {
    const lastCount = words.findIndex((word) => !upper(word));
    return { firstName: tidyName(words.slice(lastCount).join(" ")), lastName: tidyName(words.slice(0, lastCount).join(" ")) };
  }
  return { firstName: tidyName(words[0]!), lastName: tidyName(words.slice(1).join(" ")) };
}

const STAGE_WORDS: [CrmStage, string[]][] = [
  ["won", ["client", "gagne", "won", "signe", "converti", "customer"]],
  ["lost", ["perdu", "lost", "refus", "pas interesse", "abandon"]],
  ["proposal", ["proposition", "devis", "proposal", "negociation", "offre"]],
  ["meeting", ["rendez vous", "rdv", "meeting", "entretien"]],
  ["demo", ["demo"]],
  ["qualified", ["interesse", "qualifie", "qualified", "chaud", "hot"]],
  ["contacted", ["contacte", "contacted", "relance", "appele", "en cours"]],
  ["new", ["nouveau", "a contacter", "new", "froid", "cold", "lead"]],
];

/** Étape lue dans une colonne de fichier (« RDV », « Gagné », « contacted »…), si on la reconnaît. */
export function stageFromText(value: unknown): CrmStage | undefined {
  const text = fold(cleanText(value, 60));
  if (!text) return undefined;
  for (const stage of CRM_STAGES) {
    if (text === stage || text === fold(STAGE_META[stage].label)) return stage;
  }
  for (const [stage, words] of STAGE_WORDS) {
    if (words.some((word) => text === word || text.startsWith(`${word} `) || text.includes(` ${word}`) || text.startsWith(word))) return stage;
  }
  return undefined;
}

/** Colonnes annexes gardées avec le prospect : libellés et valeurs bornés. */
export function normalizeExtra(extra: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(extra)) {
    const label = cleanText(key, 60);
    const text = cleanText(value, MAX_EXTRA_VALUE);
    if (!label || !text) continue;
    out[label] = text;
    if (Object.keys(out).length >= MAX_EXTRA_FIELDS) break;
  }
  return out;
}

/** Brouillon remis au propre, champ par champ. */
export function normalizeDraft(input: Partial<ContactDraft>): ContactDraft {
  return {
    firstName: tidyName(cleanText(input.firstName, FIELD_MAX.firstName)),
    lastName: tidyName(cleanText(input.lastName, FIELD_MAX.lastName)),
    company: cleanText(input.company, FIELD_MAX.company),
    profession: cleanText(input.profession, FIELD_MAX.profession),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    website: normalizeWebsite(input.website),
    address: cleanText(input.address, FIELD_MAX.address),
    postalCode: normalizePostalCode(input.postalCode),
    city: tidyPlace(cleanText(input.city, FIELD_MAX.city)),
    notes: cleanMultiline(input.notes, FIELD_MAX.notes),
    tags: normalizeTags(input.tags ?? []),
    ...(input.stage ? { stage: input.stage } : {}),
    ...(input.source ? { source: cleanText(input.source, 60) } : {}),
    extra: normalizeExtra(input.extra ?? {}),
  };
}

/** Un prospect est exploitable s'il a un nom (personne ou cabinet) ou un moyen de le joindre. */
export function isUsableDraft(draft: ContactDraft): boolean {
  return Boolean(draft.firstName || draft.lastName || draft.company || draft.email || draft.phone);
}

/**
 * Clés de doublon d'un prospect, de la plus sûre à la moins sûre : son
 * e-mail, son téléphone, puis son nom dans sa ville. Deux prospects sont le
 * même dès qu'ils partagent une clé.
 */
export function dedupeKeys(contact: { firstName: string; lastName: string; company: string; city: string; email?: string | null; phone?: string | null }): string[] {
  const keys: string[] = [];
  if (contact.email) keys.push(`e:${contact.email.toLowerCase()}`);
  if (contact.phone) keys.push(`p:${contact.phone}`);
  const name = fold([contact.firstName, contact.lastName].filter(Boolean).join(" ")) || fold(contact.company);
  const city = fold(contact.city);
  if (name && city && name.includes(" ")) keys.push(`n:${name}|${city}`);
  return keys;
}
