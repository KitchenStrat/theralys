/**
 * Texte d'un site tiers, pour l'extraction du profil (`external-site.ts`).
 *
 * Deux usages, un seul texte :
 * - `sanitizeSiteText` : ce que le modèle reçoit, débarrassé des caractères
 *   invisibles (où une consigne peut se cacher) et des chevrons (qui
 *   pourraient refermer un bloc de données du prompt) ;
 * - `siteCorpus` et ses prédicats : l'« ancrage » d'une réponse dans ce qui a
 *   été lu. Un titre, un chiffre, un numéro ou une adresse proposés par le
 *   modèle ne sont gardés que s'ils se retrouvent dans les pages — un contrôle
 *   qui ne dépend pas de la bonne volonté du modèle.
 *
 * Les comparaisons portent sur le texte tel qu'il a été transmis (même
 * assainissement), sinon un caractère invisible au milieu d'un mot suffirait
 * à faire écarter une réponse juste.
 */

import { bareHost, type ExternalSitePage } from "@theralys/shared";

// ─── Assainissement ──────────────────────────────────────────────────────────

/** Classe de caractères écrite par ses codes : aucun caractère invisible ne figure dans ce fichier. */
const charClass = (ranges: readonly (readonly [number, number])[]): string => ranges.map(([from, to]) => `\\u{${from.toString(16)}}-\\u{${to.toString(16)}}`).join("");

// Caractères sans dessin : format (largeur nulle, sens d'écriture, bloc « tags »), usage privé (polices d'icônes),
// demi-codets isolés, codes non attribués, puis sélecteurs de variante et remplissages invisibles
const INVISIBLE = new RegExp(
  `[\\p{Cf}\\p{Co}\\p{Cs}\\p{Cn}${charClass([
    [0xfe00, 0xfe0f],
    [0xe0100, 0xe01ef],
    [0x034f, 0x034f],
    [0x115f, 0x1160],
    [0x17b4, 0x17b5],
    [0x3164, 0x3164],
    [0xffa0, 0xffa0],
  ])}]`,
  "gu",
);
// Fins de ligne : retour chariot, « ligne suivante » (NEL), séparateurs de ligne et de paragraphe
const LINE_BREAK = new RegExp(
  `\\r\\n?|[${charClass([
    [0x85, 0x85],
    [0x2028, 0x2029],
  ])}]`,
  "gu",
);
// Caractères de contrôle, retour à la ligne excepté
const CONTROL = /[^\P{Cc}\n]/gu;

/**
 * Texte venu d'un site tiers, prêt à être montré au modèle : forme Unicode
 * compatible (NFKC — les chevrons « pleine largeur » redeviennent des
 * chevrons avant d'être neutralisés), caractères invisibles et de contrôle
 * retirés, chevrons remplacés par ‹ › (aucune balise ne peut s'y écrire),
 * espaces resserrés. Sur une ligne, sauf `multiline` (paragraphes conservés).
 */
export function sanitizeSiteText(value: unknown, opts: { multiline?: boolean } = {}): string {
  if (typeof value !== "string") return "";
  const text = value
    .normalize("NFKC")
    .replace(LINE_BREAK, "\n")
    .replace(INVISIBLE, "")
    .replace(CONTROL, " ")
    .replace(/</g, "‹")
    .replace(/>/g, "›");
  if (!opts.multiline) return text.replace(/\s+/g, " ").trim();
  return text
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Début d'un texte, sans jamais couper un caractère codé sur deux demi-codets. */
export function clipChars(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(0, max));
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

// ─── Faits relevés dans le code des pages ────────────────────────────────────

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const strings = (value: unknown): string[] => list(value).filter((item): item is string => typeof item === "string");

/** Les faits utiles au profil, lus sans rien supposer de leur forme. */
export type FoundFacts = {
  name: string;
  description: string;
  address: string;
  phones: string[];
  emails: string[];
  hours: { label: string; value: string }[];
  bookingUrls: string[];
  social: Record<string, unknown>;
};

/**
 * Faits du lecteur (`ExternalSiteFacts`) relus prudemment : ils viennent du
 * code de pages tierces et, après stockage, d'une colonne JSON — un champ
 * absent ou d'un autre type donne une valeur vide plutôt qu'une exception.
 */
export function readFacts(facts: unknown): FoundFacts {
  const row = record(facts);
  const text = (value: unknown): string => (typeof value === "string" ? value : "");
  return {
    name: text(row.name),
    description: text(row.description),
    address: text(row.address),
    phones: strings(row.phones),
    emails: strings(row.emails),
    hours: list(row.hours).map((item) => ({ label: text(record(item).label), value: text(record(item).value) })),
    bookingUrls: list(row.bookingLinks).map((item) => text(record(item).url)).filter((url) => url !== ""),
    social: record(row.social),
  };
}

/** Pages du lecteur, relues avec la même prudence que les faits : une liste absente donne une liste vide, une entrée qui n'est pas une page est passée. */
export function readPages(pages: unknown): ExternalSitePage[] {
  return list(pages).filter((page): page is ExternalSitePage => page !== null && typeof page === "object" && !Array.isArray(page));
}

/** Textes d'une page tels que le modèle les reçoit : titre, description, intertitres, texte. */
export function pageTexts(pages: readonly ExternalSitePage[]): string[] {
  return pages.flatMap((page) =>
    [page.title, page.description, ...strings(page.headings), page.text].map((part) => sanitizeSiteText(part, { multiline: true })).filter((part) => part !== ""),
  );
}

/** Textes des faits : un numéro ou une adresse e-mail peut n'apparaître que là (description, adresse postale). */
export function factTexts(facts: FoundFacts): string[] {
  return [facts.name, facts.description, facts.address, ...facts.phones, ...facts.emails, ...facts.hours.flatMap((line) => [line.label, line.value])]
    .map((part) => sanitizeSiteText(part))
    .filter((part) => part !== "");
}

// ─── Comparaison ─────────────────────────────────────────────────────────────

/** Forme comparable d'un texte : minuscules, sans accent ni ponctuation, mots séparés par une espace. */
export function foldText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const wordsOf = (text: string): string[] => foldText(text).split(" ").filter((word) => word !== "");

/**
 * Mot ramené à une forme qui ne distingue ni le pluriel ni le féminin
 * (« sportives » et « sportif », « diplômée » et « diplômé »). Ce n'est pas
 * une racine : « gestion » et « gérer » restent deux mots, pour qu'un sujet
 * absent du site ne passe pas à la faveur d'un mot voisin.
 */
export function wordForm(word: string): string {
  let form = word;
  if (form.length > 3) form = form.replace(/[sx]$/, "");
  if (form.length > 4) {
    form = form
      .replace(/ive$/, "if")
      .replace(/euse$/, "eu")
      .replace(/elle$/, "el")
      .replace(/([ei])nne$/, "$1n")
      .replace(/e+$/, "");
  }
  return form;
}

// Mots-outils d'au moins trois lettres (les plus courts sont écartés par leur longueur)
const STOP_WORDS = new Set(
  "les des une aux dans pour par sur sous avec sans chez vers entre votre vos notre nos mon mes ton tes son ses leur leurs cet cette ces qui que quoi dont plus moins tres est sont pas elle elles ils nous vous comme mais donc car tout tous toute toutes quand lors ainsi aussi afin".split(" "),
);
// Mots de cadrage qu'un résumé place volontiers devant le vrai sujet (« gestion du stress », « troubles du sommeil ») :
// leur absence du site ne dit rien, c'est le sujet qui doit s'y trouver
const FRAMING_WORDS = new Set("accompagnement accompagnements gestion trouble troubles seance seances consultation consultations suivi soin soins prise charge aide".split(" "));

/**
 * Ce qui a été lu sur le site, sous les formes utiles aux contrôles : formes
 * de mots (titres), nombres (prix, durées), texte sans séparateur de numéro
 * (téléphones) et texte en minuscules (adresses e-mail et web).
 */
export type SiteCorpus = {
  forms: ReadonlySet<string>;
  /** Suites de chiffres lues hors numéros de téléphone, zéros de tête retirés */
  numbers: ReadonlySet<string>;
  /** Texte en minuscules, sans espace, point, tiret, barre ni parenthèse */
  compact: string;
  lower: string;
};

/**
 * Suites de chiffres d'un texte (« 1 h 30 » → 1 et 30, « 55,50 € » → 55 et
 * 50), zéros de tête retirés. Des décimales nulles ne comptent pas : « 60,00 € »
 * et « 60 € » disent le même prix.
 */
export function numbersOf(text: string): string[] {
  const plain = text.normalize("NFKD").replace(/(\d)[.,]0{1,2}(?!\d)/g, "$1");
  return (plain.match(/\d+/g) ?? []).map((digits) => digits.replace(/^0+(?=\d)/, ""));
}

// Numéro de téléphone écrit dans un texte : français (dix chiffres), ou international (« + » ou « 00 », puis l'indicatif)
const PHONE_IN_TEXT = /(?<!\d)(?:(?:\+|00)\d{1,3}[\s.()-]*(?:\(0\)[\s.-]*)?\d(?:[\s.-]*\d){7,11}|0[1-9](?:[\s.-]?\d{2}){4})(?!\d)/g;

/**
 * Sépare les numéros de téléphone du reste d'un texte. Les paires de chiffres
 * d'un numéro ne doivent pas servir d'alibi à un prix : sans cela, le
 * « 05 36 49 12 34 » du cabinet ferait accepter un « 49 € » inventé.
 */
function splitPhones(text: string): { phones: string[]; rest: string } {
  const phones = text.match(PHONE_IN_TEXT) ?? [];
  return { phones, rest: phones.length > 0 ? text.replace(PHONE_IN_TEXT, " ") : text };
}

/** Corpus de comparaison construit sur des textes déjà assainis (`pageTexts`, `factTexts`). */
export function siteCorpus(texts: readonly string[]): SiteCorpus {
  const forms = new Set<string>();
  const numbers = new Set<string>();
  for (const text of texts) {
    for (const word of wordsOf(text)) forms.add(wordForm(word));
    for (const number of numbersOf(splitPhones(text).rest)) numbers.add(number);
  }
  const lower = texts.join("\n").toLowerCase();
  return { forms, numbers, compact: lower.replace(/[\s.()/·-]+/g, ""), lower };
}

/**
 * Un titre est-il tiré du site ? Oui si chacun de ses mots significatifs
 * (ni mot-outil, ni mot de cadrage) s'y lit, sans égard aux accents, à la
 * casse, au pluriel ni au féminin. Un titre fait seulement de mots non
 * significatifs est jugé sur tous ses mots ; un titre sans aucun mot lisible
 * n'est pas vérifiable, donc pas retenu.
 */
export function titleGrounded(title: string, corpus: SiteCorpus): boolean {
  const words = wordsOf(title);
  const significant = words.filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !FRAMING_WORDS.has(word));
  const required = significant.length > 0 ? significant : words.filter((word) => word.length >= 2);
  return required.length > 0 && required.every((word) => corpus.forms.has(wordForm(word)));
}

/**
 * Tous les nombres du texte se lisent-ils sur le site ? (Vrai pour un texte
 * sans chiffre.) Un numéro de téléphone est jugé en entier, comme un numéro,
 * et non groupe de chiffres par groupe de chiffres.
 */
export function numbersGrounded(text: string, corpus: SiteCorpus): boolean {
  const { phones, rest } = splitPhones(text);
  return phones.every((phone) => phoneAppears(phone, corpus)) && numbersOf(rest).every((number) => corpus.numbers.has(number));
}

// Mots d'une adresse qu'on abrège ou développe sans rien y changer (« bd » pour « boulevard », « St » pour « Saint »)
const ADDRESS_WORDS = new Set("rue avenue boulevard place chemin allee impasse route quai cours square faubourg passage residence batiment etage cedex bis ter saint sainte france".split(" "));

/**
 * Une adresse postale se lit-elle sur le site ? Ses nombres (numéro, code
 * postal) et ses noms (voie, commune) doivent tous y figurer : une commune que
 * le site ne nomme pas — celle de la fiche du praticien, par exemple — ne
 * fait pas une adresse.
 */
export function addressGrounded(address: string, corpus: SiteCorpus): boolean {
  const names = wordsOf(address).filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !STOP_WORDS.has(word) && !ADDRESS_WORDS.has(word));
  return numbersGrounded(address, corpus) && names.every((word) => corpus.forms.has(wordForm(word)));
}

/**
 * Le numéro se lit-il sur le site, quelle que soit son écriture (« 05 36 49 12 34 »,
 * « 05.36.49.12.34 », « +33 5 36 49 12 34 ») ? La comparaison porte sur ses
 * neuf derniers chiffres : l'indicatif du pays et le zéro initial n'y changent rien.
 */
export function phoneAppears(phone: string, corpus: SiteCorpus): boolean {
  const digits = phone.replace(/\D/g, "");
  const key = digits.length > 9 ? digits.slice(-9) : digits;
  return key.length >= 6 && corpus.compact.includes(key);
}

/** L'adresse e-mail est-elle écrite telle quelle sur le site ? (Une adresse masquée — « contact [at] … » — n'est pas reconstituée.) */
export function emailAppears(email: string, corpus: SiteCorpus): boolean {
  const key = email.trim().toLowerCase();
  return key.includes("@") && corpus.lower.includes(key);
}

/** L'adresse web (hôte et chemin) est-elle écrite en toutes lettres sur le site ? Un hôte seul ne suffit pas : ce n'est pas un lien vers une page précise. */
export function webAddressAppears(url: string, corpus: SiteCorpus): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  if (path === "") return false;
  const key = `${bareHost(parsed.hostname)}${path}`.toLowerCase();
  let decoded = key;
  try {
    decoded = decodeURI(key);
  } catch {
    // Séquence « % » invalide : la forme encodée est comparée telle quelle
  }
  return corpus.lower.includes(key) || corpus.lower.includes(decoded);
}

/**
 * Clé d'une page : hôte sans « www. », chemin sans barre finale, paramètres.
 * Deux écritures d'une même adresse (http ou https, avec ou sans « www. » ou
 * barre finale) se rejoignent ; `null` si l'adresse est illisible.
 */
export function pageUrlKey(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return `${bareHost(parsed.hostname)}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return null;
  }
}
