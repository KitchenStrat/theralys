/**
 * Correspondance entre les colonnes d'un fichier et les champs d'un prospect :
 * proposée d'après les titres des colonnes (français et anglais, y compris les
 * exports d'annuaires et de Google Maps), à défaut d'après les valeurs, puis
 * corrigée à la main dans l'écran d'import.
 */

import { emptyDraft, type ContactDraft, type ContactTextField } from "./model";
import { cleanText, fold, isUsableDraft, normalizeDraft, normalizeEmail, normalizePhone, normalizeTags, splitFullName, stageFromText } from "./normalize";

export type TargetField = ContactTextField | "fullName" | "tags" | "stage" | "source" | "extra" | "ignore";

export const TARGET_OPTIONS: { value: TargetField; label: string }[] = [
  { value: "ignore", label: "Ne pas importer" },
  { value: "extra", label: "Garder comme information annexe" },
  { value: "firstName", label: "Prénom" },
  { value: "lastName", label: "Nom" },
  { value: "fullName", label: "Nom complet (prénom et nom)" },
  { value: "company", label: "Cabinet / société" },
  { value: "profession", label: "Métier" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Téléphone" },
  { value: "website", label: "Site internet" },
  { value: "address", label: "Adresse" },
  { value: "postalCode", label: "Code postal" },
  { value: "city", label: "Ville" },
  { value: "notes", label: "Notes" },
  { value: "tags", label: "Étiquettes" },
  { value: "stage", label: "Étape du cycle de vente" },
  { value: "source", label: "Provenance" },
];

/** Champs qui acceptent plusieurs colonnes (leurs valeurs s'ajoutent). */
const MULTI: ReadonlySet<TargetField> = new Set<TargetField>(["notes", "tags", "address", "extra", "ignore", "phone"]);

type Rule = { field: TargetField; score: number; test: RegExp };

// Les titres sont comparés sans accents ni ponctuation (cf. `fold`). Le score départage deux colonnes
// qui visent le même champ : la mieux nommée le prend, l'autre devient une information annexe.
const RULES: Rule[] = [
  { field: "email", score: 100, test: /^(e ?mail|mail|courriel|adresse (e ?)?mail|email address|e mail address)$/ },
  { field: "email", score: 80, test: /\b(e ?mail|courriel)\b/ },
  { field: "firstName", score: 100, test: /^(prenom|first ?name|given ?name|firstname|prenom du contact)$/ },
  { field: "firstName", score: 80, test: /\b(prenom|first ?name|given ?name)\b/ },
  { field: "lastName", score: 100, test: /^(nom|nom de famille|last ?name|surname|family ?name|lastname|nom du contact)$/ },
  { field: "lastName", score: 80, test: /\b(nom de famille|last ?name|surname|family ?name)\b/ },
  { field: "fullName", score: 95, test: /^(nom complet|nom et prenom|nom prenom|prenom nom|prenom et nom|full ?name|name|contact|praticien|interlocuteur|nom du praticien|dirigeant)$/ },
  { field: "company", score: 100, test: /^(societe|entreprise|raison sociale|cabinet|company|company name|organisation|organization|etablissement|enseigne|nom du cabinet|nom de l entreprise|nom commercial|business name|denomination)$/ },
  { field: "company", score: 70, test: /^(title|titre|nom de l etablissement|place name)$/ },
  { field: "company", score: 60, test: /\b(societe|entreprise|raison sociale|cabinet|company|etablissement)\b/ },
  { field: "profession", score: 100, test: /^(metier|profession|specialite|activite|categorie|category|categoryname|category name|fonction|job title|poste|discipline|pratique)$/ },
  { field: "profession", score: 60, test: /\b(metier|profession|specialite|categor|activite)\b/ },
  { field: "phone", score: 100, test: /^(telephone|tel|phone|phone number|mobile|portable|gsm|numero de telephone|tel portable|tel mobile|telephone portable|telephone mobile|telephone fixe|tel fixe|n de telephone)$/ },
  { field: "phone", score: 80, test: /\b(telephone|tel|phone|mobile|portable)\b/ },
  { field: "website", score: 100, test: /^(site|site web|site internet|website|web|web site|site url|domaine|domain)$/ },
  { field: "website", score: 60, test: /\b(site web|site internet|website)\b/ },
  { field: "website", score: 30, test: /^(url|lien|link)$/ },
  { field: "postalCode", score: 100, test: /^(code postal|cp|zip|zip code|zipcode|postal code|postalcode|postcode|code post)$/ },
  { field: "postalCode", score: 80, test: /\b(code postal|postal ?code|zip)\b/ },
  { field: "city", score: 100, test: /^(ville|city|commune|localite|town|ville du cabinet)$/ },
  { field: "city", score: 70, test: /\b(ville|city|commune)\b/ },
  { field: "address", score: 100, test: /^(adresse|address|rue|street|voie|adresse postale|adresse du cabinet|street address|adresse 1|address 1|address line 1)$/ },
  { field: "address", score: 60, test: /\b(adresse|address|rue|street)\b/ },
  { field: "notes", score: 100, test: /^(notes?|commentaires?|remarques?|description|observations?|message|infos?|informations?)$/ },
  { field: "tags", score: 100, test: /^(tags?|etiquettes?|labels?|mots cles)$/ },
  { field: "stage", score: 100, test: /^(statut|etape|stage|status|pipeline|etat|avancement)$/ },
  { field: "source", score: 100, test: /^(source|origine|provenance|canal|lead source)$/ },
];

const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Champ deviné d'après les valeurs d'une colonne sans titre parlant, quand la majorité d'entre elles le confirme. */
function guessFromValues(values: string[]): TargetField | null {
  const filled = values.map((value) => value.trim()).filter(Boolean);
  if (filled.length === 0) return null;
  const share = (test: (value: string) => boolean) => filled.filter(test).length / filled.length;
  if (share((value) => EMAIL_VALUE.test(value)) >= 0.6) return "email";
  if (share((value) => /^https?:\/\/|^www\./i.test(value)) >= 0.6) return "website";
  if (share((value) => /^\d{5}$/.test(value)) >= 0.8) return "postalCode";
  if (share((value) => /^[+\d][\d\s().-]{8,}$/.test(value) && normalizePhone(value) !== "") >= 0.6) return "phone";
  return null;
}

/** Correspondance proposée, colonne par colonne. Une colonne non reconnue est gardée comme information annexe. */
export function guessMapping(headers: string[], sample: string[][]): TargetField[] {
  const candidates = headers.map((header, column) => {
    const title = fold(header);
    let best: { field: TargetField; score: number } | null = null;
    if (!/^colonne \d+$/.test(title)) {
      for (const rule of RULES) {
        if (rule.test.test(title) && (!best || rule.score > best.score)) best = { field: rule.field, score: rule.score };
      }
    }
    if (!best) {
      const guessed = guessFromValues(sample.map((row) => row[column] ?? ""));
      if (guessed) best = { field: guessed, score: 50 };
    }
    return best;
  });
  const mapping: TargetField[] = headers.map(() => "extra");
  const taken = new Map<TargetField, number>();
  // Les colonnes les mieux reconnues se servent d'abord
  const order = candidates.map((candidate, column) => ({ candidate, column })).sort((a, b) => (b.candidate?.score ?? 0) - (a.candidate?.score ?? 0));
  for (const { candidate, column } of order) {
    if (!candidate) {
      const empty = sample.length > 0 && sample.every((row) => (row[column] ?? "").trim() === "");
      mapping[column] = empty ? "ignore" : "extra";
      continue;
    }
    if (!MULTI.has(candidate.field) && taken.has(candidate.field)) {
      mapping[column] = "extra";
      continue;
    }
    taken.set(candidate.field, column);
    mapping[column] = candidate.field;
  }
  // Un nom complet ne sert à rien quand prénom et nom ont chacun leur colonne
  if (taken.has("firstName") && taken.has("lastName") && taken.has("fullName")) mapping[taken.get("fullName")!] = "ignore";
  return mapping;
}

export type MappedRows = {
  drafts: ContactDraft[];
  /** Lignes sans nom ni moyen de contact, écartées */
  rejected: number;
};

/** Prospects lus dans les lignes d'un fichier, selon la correspondance choisie. */
export function applyMapping(headers: string[], rows: string[][], mapping: TargetField[]): MappedRows {
  const drafts: ContactDraft[] = [];
  let rejected = 0;
  for (const row of rows) {
    const draft = emptyDraft();
    let fullName = "";
    const notes: string[] = [];
    const addresses: string[] = [];
    const tags: string[] = [];
    for (let column = 0; column < headers.length; column++) {
      const field = mapping[column] ?? "ignore";
      const raw = (row[column] ?? "").trim();
      if (field === "ignore" || raw === "") continue;
      const header = headers[column] ?? `Colonne ${column + 1}`;
      if (field === "extra") draft.extra[header] = raw;
      else if (field === "fullName") fullName ||= raw;
      else if (field === "notes") notes.push(raw);
      else if (field === "address") addresses.push(raw);
      else if (field === "tags") tags.push(...normalizeTags(raw));
      else if (field === "stage") draft.stage ??= stageFromText(raw);
      else if (field === "source") draft.source ||= cleanText(raw, 60);
      else if (field === "phone") {
        // Plusieurs colonnes de téléphone : le premier numéro valable est gardé, les autres restent en annexe
        if (!draft.phone && normalizePhone(raw)) draft.phone = raw;
        else draft.extra[header] = raw;
      } else if (field === "email") {
        if (!draft.email && normalizeEmail(raw)) draft.email = raw;
        else if (!normalizeEmail(raw)) draft.extra[header] = raw;
      } else if (!draft[field]) draft[field] = raw;
    }
    if (fullName && !draft.firstName && !draft.lastName) Object.assign(draft, splitFullName(fullName));
    draft.notes = notes.join("\n");
    draft.address = addresses.join(", ");
    draft.tags = tags;
    const clean = normalizeDraft(draft);
    if (isUsableDraft(clean)) drafts.push(clean);
    else rejected++;
  }
  return { drafts, rejected };
}
