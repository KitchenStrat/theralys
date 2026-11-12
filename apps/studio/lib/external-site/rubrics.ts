/**
 * Écran « Mon site » : les rubriques du profil du site du client (cf.
 * `@theralys/shared` external-site.ts), telles que le praticien les relit et
 * les corrige. Module pur, partagé par les formulaires (navigateur) et par
 * l'action d'enregistrement (serveur).
 *
 * Une rubrique de l'écran regroupe une ou plusieurs clés du profil
 * (`RUBRIC_KEYS`). Corriger une rubrique n'inscrit dans les corrections que
 * ce qui diffère de ce qui a été lu sur le site : le reste continue de suivre
 * les lectures suivantes. Une rubrique remise telle qu'elle a été lue n'est
 * donc plus « corrigée ».
 *
 * La validation des formulaires (`checkRubricDraft`) reprend les fonctions de
 * nettoyage du contrat : ce que le service écarterait sans le dire (numéro
 * illisible, lien d'un autre site, ligne incomplète) est signalé au praticien
 * avant l'envoi, sur le champ concerné.
 */

import {
  EMPTY_EXTERNAL_PROFILE,
  EXTERNAL_PROFILE_LIMITS,
  FOOTER_SOCIAL_NETWORKS,
  bookingPlatformLabel,
  bookingPlatformOf,
  cleanBookingUrl,
  cleanExternalProfile,
  cleanPhone,
  cleanSocialLinks,
  type ExternalProfileOverrides,
  type ExternalSiteProfile,
  type ExternalSpecialty,
  type SiteSocialLinks,
} from "@theralys/shared";

// ─── Rubriques ───────────────────────────────────────────────────────────────

export const RUBRICS = [
  { id: "presentation", title: "Présentation" },
  { id: "specialties", title: "Spécialités" },
  { id: "about", title: "À propos" },
  { id: "practical", title: "Infos pratiques" },
  { id: "process", title: "Déroulement d'une séance" },
  { id: "faq", title: "Questions fréquentes" },
  { id: "contact", title: "Contact" },
  { id: "booking", title: "Prise de rendez-vous" },
  { id: "social", title: "Réseaux sociaux" },
] as const;

export type RubricId = (typeof RUBRICS)[number]["id"];

export const RUBRIC_IDS = RUBRICS.map((rubric) => rubric.id) as [RubricId, ...RubricId[]];

export function isRubricId(value: unknown): value is RubricId {
  return typeof value === "string" && (RUBRIC_IDS as string[]).includes(value);
}

/** Clés du profil (et des corrections) portées par chaque rubrique. */
export const RUBRIC_KEYS = {
  presentation: ["headline", "intro", "highlights"],
  specialties: ["specialties"],
  about: ["about"],
  practical: ["practical"],
  process: ["process"],
  faq: ["faq"],
  contact: ["contact"],
  booking: ["bookingUrl"],
  social: ["social"],
} as const satisfies Record<RubricId, readonly (keyof ExternalProfileOverrides)[]>;

const CONTACT_TEXT_FIELDS = ["address", "phone", "email", "note"] as const;

export type SocialNetworkKey = keyof SiteSocialLinks;
export const SOCIAL_NETWORKS: readonly { key: SocialNetworkKey; label: string; host: string }[] = FOOTER_SOCIAL_NETWORKS;

const L = EXTERNAL_PROFILE_LIMITS;

/**
 * Longueurs de saisie. Celles que le contrat nomme viennent de
 * `EXTERNAL_PROFILE_LIMITS` ; les autres reprennent ce que
 * `cleanExternalProfile` applique sans le nommer (titres courts, diplômes,
 * horaires) — un test vérifie qu'un profil saisi à ces longueurs ressort du
 * nettoyage sans être raccourci.
 */
export const FIELD_MAX = {
  headline: L.headline,
  paragraph: L.paragraph,
  highlightTitle: 60,
  highlightText: L.shortText,
  specialtyTitle: L.specialtyTitle,
  specialtyExcerpt: L.specialtyExcerpt,
  credential: 120,
  pairTitle: 60,
  pairText: L.shortText,
  question: L.shortText,
  answer: L.answer,
  address: L.shortText,
  note: L.shortText,
  phone: 24,
  email: 120,
  hoursLabel: 40,
  hoursValue: 80,
  link: 400,
} as const;

/** Nombre d'éléments au plus par liste (toutes viennent du contrat). */
export const LIST_MAX = {
  intro: L.introParagraphs,
  highlights: L.highlights,
  specialties: L.specialties,
  aboutParagraphs: L.aboutParagraphs,
  credentials: L.credentials,
  practical: L.practical,
  process: L.process,
  faq: L.faq,
  hours: L.hours,
} as const;

// ─── État d'une rubrique ─────────────────────────────────────────────────────

/** La rubrique porte-t-elle une correction du praticien ? */
export function isRubricCorrected(overrides: ExternalProfileOverrides | null | undefined, rubric: RubricId): boolean {
  if (!overrides) return false;
  if (rubric === "contact") return overrides.contact !== undefined && Object.keys(overrides.contact).length > 0;
  return RUBRIC_KEYS[rubric].some((key) => Object.hasOwn(overrides, key));
}

/** La rubrique est-elle vide dans le profil (rien de lu, ou tout retiré par le praticien) ? */
export function isRubricEmpty(profile: ExternalSiteProfile, rubric: RubricId): boolean {
  switch (rubric) {
    case "presentation":
      return profile.headline === "" && profile.intro.length === 0 && profile.highlights.length === 0;
    case "specialties":
      return profile.specialties.length === 0;
    case "about":
      return profile.about.paragraphs.length === 0 && profile.about.credentials.length === 0;
    case "practical":
      return profile.practical.length === 0;
    case "process":
      return profile.process.length === 0;
    case "faq":
      return profile.faq.length === 0;
    case "contact": {
      const { address, phone, email, note, hours } = profile.contact;
      return !address && !phone && !email && !note && hours.length === 0;
    }
    case "booking":
      return !profile.bookingUrl;
    case "social":
      return SOCIAL_NETWORKS.every((network) => !profile.social[network.key]);
  }
}

/** Lien de rendez-vous tel qu'on le montre : un numéro à appeler, ou une page (avec le nom de la plateforme si elle est connue). */
export type BookingDisplay = { kind: "phone"; number: string; href: string } | { kind: "web"; platform: string | null; href: string };

export function bookingDisplay(bookingUrl: string | undefined): BookingDisplay | null {
  if (!bookingUrl) return null;
  if (/^tel:/i.test(bookingUrl)) return { kind: "phone", number: bookingUrl.slice(4), href: bookingUrl };
  const platform = bookingPlatformOf(bookingUrl);
  return { kind: "web", platform: platform ? bookingPlatformLabel(platform) : null, href: bookingUrl };
}

// ─── Corrections ─────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Forme canonique d'une valeur JSON : clés triées, champs absents ignorés (l'ordre des clés ne survit pas à un passage en base). */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

/** Deux valeurs JSON portent-elles le même contenu (ordre des clés indifférent, ordre des listes compté) ? */
export function sameContent(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** Ce sur quoi une correction s'applique : l'adresse du site, ce qui y a été lu, les corrections déjà enregistrées. */
export type CorrectionBase = {
  url: string;
  extracted: ExternalSiteProfile | null;
  overrides: ExternalProfileOverrides | null;
};

/**
 * Corrections complètes après la saisie d'une rubrique, à donner telles
 * quelles à `saveExternalOverrides`. `value` est ce que le formulaire envoie :
 * seules les clés de la rubrique y sont lues, puis nettoyées par le contrat.
 * Pour chaque clé fournie : identique à ce qui a été lu, sa correction est
 * retirée ; différente, elle remplace ce qui a été lu (pour le contact, champ
 * par champ ; un champ vidé reste vide). Les autres rubriques ne bougent pas.
 */
export function applyRubricCorrection(base: CorrectionBase, rubric: RubricId, value: unknown): ExternalProfileOverrides {
  const read = base.extracted ?? EMPTY_EXTERNAL_PROFILE;
  const given = isRecord(value) ? value : {};
  const next: ExternalProfileOverrides = { ...(base.overrides ?? {}) };

  if (rubric === "contact") {
    if (!isRecord(given.contact)) return next;
    const cleaned = cleanExternalProfile({ contact: given.contact }, base.url).contact;
    const contact: NonNullable<ExternalProfileOverrides["contact"]> = { ...(next.contact ?? {}) };
    for (const field of CONTACT_TEXT_FIELDS) {
      if (!Object.hasOwn(given.contact, field)) continue;
      const text = cleaned[field] ?? "";
      if (text === (read.contact[field] ?? "")) delete contact[field];
      else contact[field] = text;
    }
    if (Object.hasOwn(given.contact, "hours")) {
      if (sameContent(cleaned.hours, read.contact.hours)) delete contact.hours;
      else contact.hours = cleaned.hours;
    }
    if (Object.keys(contact).length > 0) next.contact = contact;
    else delete next.contact;
    return next;
  }

  if (rubric === "booking") {
    if (!Object.hasOwn(given, "bookingUrl")) return next;
    const link = cleanBookingUrl(given.bookingUrl) ?? "";
    if (link === (read.bookingUrl ?? "")) delete next.bookingUrl;
    else next.bookingUrl = link;
    return next;
  }

  const keys: readonly ("headline" | "intro" | "highlights" | "specialties" | "about" | "practical" | "process" | "faq" | "social")[] = RUBRIC_KEYS[rubric];
  const provided = keys.filter((key) => Object.hasOwn(given, key));
  const cleaned = cleanExternalProfile(Object.fromEntries(provided.map((key) => [key, given[key]])), base.url);
  for (const key of provided) {
    if (sameContent(cleaned[key], read[key])) delete next[key];
    else Object.assign(next, { [key]: cleaned[key] });
  }
  return next;
}

/** Corrections complètes une fois la rubrique rétablie telle qu'elle a été lue : ses clés sont retirées, les autres restent. */
export function restoreRubric(overrides: ExternalProfileOverrides | null | undefined, rubric: RubricId): ExternalProfileOverrides {
  const next: ExternalProfileOverrides = { ...(overrides ?? {}) };
  for (const key of RUBRIC_KEYS[rubric]) delete next[key];
  return next;
}

// ─── Formulaires ─────────────────────────────────────────────────────────────

/** Un texte d'une liste (paragraphe, diplôme). `uid` : repère stable de la ligne dans le formulaire. */
export type TextDraft = { uid: string; text: string };
/** Une ligne à deux champs (titre et texte, question et réponse, jours et horaires). */
export type PairDraft = { uid: string; first: string; second: string };
/** Une spécialité. `kept` : la spécialité déjà au profil, dont l'identifiant et ce qui a été lu sur sa page sont conservés. */
export type SpecialtyDraft = { uid: string; title: string; excerpt: string; url: string; kept: ExternalSpecialty | null };

export type RubricDrafts = {
  presentation: { headline: string; intro: TextDraft[]; highlights: PairDraft[] };
  specialties: { items: SpecialtyDraft[] };
  about: { paragraphs: TextDraft[]; credentials: TextDraft[] };
  practical: { items: PairDraft[] };
  process: { items: PairDraft[] };
  faq: { items: PairDraft[] };
  contact: { address: string; phone: string; email: string; note: string; hours: PairDraft[] };
  booking: { link: string };
  social: { links: Record<SocialNetworkKey, string> };
};

const texts = (prefix: string, values: readonly string[]): TextDraft[] => values.map((text, index) => ({ uid: `${prefix}${index}`, text }));

const DRAFTS: { [R in RubricId]: (profile: ExternalSiteProfile) => RubricDrafts[R] } = {
  presentation: (profile) => ({
    headline: profile.headline,
    intro: texts("i", profile.intro),
    highlights: profile.highlights.map((item, index) => ({ uid: `h${index}`, first: item.title, second: item.text ?? "" })),
  }),
  specialties: (profile) => ({
    items: profile.specialties.map((item, index) => ({ uid: `s${index}`, title: item.title, excerpt: item.excerpt, url: item.url ?? "", kept: item })),
  }),
  about: (profile) => ({ paragraphs: texts("p", profile.about.paragraphs), credentials: texts("c", profile.about.credentials) }),
  practical: (profile) => ({ items: profile.practical.map((item, index) => ({ uid: `e${index}`, first: item.title, second: item.text })) }),
  process: (profile) => ({ items: profile.process.map((item, index) => ({ uid: `e${index}`, first: item.title, second: item.description })) }),
  faq: (profile) => ({ items: profile.faq.map((item, index) => ({ uid: `e${index}`, first: item.question, second: item.answer })) }),
  contact: (profile) => ({
    address: profile.contact.address ?? "",
    phone: profile.contact.phone ?? "",
    email: profile.contact.email ?? "",
    note: profile.contact.note ?? "",
    hours: profile.contact.hours.map((item, index) => ({ uid: `o${index}`, first: item.label, second: item.value })),
  }),
  booking: (profile) => ({ link: /^tel:/i.test(profile.bookingUrl ?? "") ? (profile.bookingUrl ?? "").slice(4) : (profile.bookingUrl ?? "") }),
  social: (profile) => ({
    links: Object.fromEntries(SOCIAL_NETWORKS.map((network) => [network.key, profile.social[network.key] ?? ""])) as Record<SocialNetworkKey, string>,
  }),
};

/** Formulaire d'une rubrique, prérempli avec le profil effectif (lu, puis corrigé). */
export function rubricDraft<R extends RubricId>(rubric: R, profile: ExternalSiteProfile): RubricDrafts[R] {
  return DRAFTS[rubric](profile);
}

/**
 * Issue du contrôle d'un formulaire : la valeur à envoyer (les clés de la
 * rubrique, à donner à `applyRubricCorrection`), ou les erreurs par champ.
 * Clés d'erreur : le nom du champ, précédé pour une ligne de liste du nom de
 * la liste et du repère de la ligne (`faq.e2.second`).
 */
export type DraftCheck = { ok: true; value: ExternalProfileOverrides } | { ok: false; errors: Record<string, string> };

export const DRAFT_ERRORS = {
  incomplete: "Complétez ce champ, ou retirez la ligne.",
  highlightTitle: "Donnez un titre à ce point fort, ou retirez-le.",
  specialtyTitle: "Donnez un nom à cette spécialité, ou retirez-la.",
  specialtyUrl: "Indiquez l'adresse d'une page de votre site, ou laissez ce champ vide.",
  phone: "Ce numéro n'est pas reconnu. Exemple : 05 55 01 02 03.",
  email: "Cette adresse e-mail n'est pas reconnue. Exemple : contact@mon-cabinet.fr.",
  booking: "Ce lien n'est pas reconnu. Indiquez l'adresse complète de votre page de rendez-vous, ou un numéro de téléphone.",
  social: (label: string, host: string) => `Ce lien n'est pas celui d'une page ${label}. Exemple : https://www.${host}/mon-cabinet.`,
} as const;

/** Texte sur une ligne, sans espaces superflus : ce que le nettoyage du contrat en gardera. */
const oneLine = (value: string): string => value.replace(/\s+/g, " ").trim();

/** Adresse web saisie sans son protocole (`www.exemple.fr/page`) → avec `https://`. */
function withScheme(value: string): string {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
}

/** Lien de rendez-vous saisi : un numéro de téléphone devient un lien `tel:`, une adresse web reçoit son protocole. */
export function bookingLinkFromInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || /^tel:/i.test(trimmed)) return trimmed;
  if (/^[\d\s.()+-]+$/.test(trimmed) && trimmed.replace(/\D/g, "").length >= 6) return `tel:${trimmed.replace(/[^\d+]/g, "")}`;
  return withScheme(trimmed);
}

function checkTexts(list: readonly TextDraft[]): string[] {
  return list.map((item) => oneLine(item.text)).filter((text) => text !== "");
}

/** Lignes à deux champs : une ligne entièrement vide est ignorée, une ligne à moitié remplie est signalée. */
function checkPairs(name: string, list: readonly PairDraft[], errors: Record<string, string>, opts: { secondRequired: boolean; firstError?: string }): { first: string; second: string }[] {
  const out: { first: string; second: string }[] = [];
  for (const item of list) {
    const first = oneLine(item.first);
    const second = oneLine(item.second);
    if (first === "" && second === "") continue;
    if (first === "") errors[`${name}.${item.uid}.first`] = opts.firstError ?? DRAFT_ERRORS.incomplete;
    else if (second === "" && opts.secondRequired) errors[`${name}.${item.uid}.second`] = DRAFT_ERRORS.incomplete;
    else out.push({ first, second });
  }
  return out;
}

const CHECKS: { [R in RubricId]: (draft: RubricDrafts[R], siteUrl: string, errors: Record<string, string>) => ExternalProfileOverrides } = {
  presentation: (draft, _siteUrl, errors) => ({
    headline: oneLine(draft.headline),
    intro: checkTexts(draft.intro),
    highlights: checkPairs("highlights", draft.highlights, errors, { secondRequired: false, firstError: DRAFT_ERRORS.highlightTitle }).map((item) =>
      item.second === "" ? { title: item.first } : { title: item.first, text: item.second },
    ),
  }),
  specialties: (draft, siteUrl, errors) => {
    const specialties: ExternalSpecialty[] = [];
    for (const item of draft.items) {
      const title = oneLine(item.title);
      const excerpt = oneLine(item.excerpt);
      const typedUrl = item.url.trim();
      if (title === "" && excerpt === "" && typedUrl === "" && item.kept === null) continue;
      if (title === "") {
        errors[`items.${item.uid}.title`] = DRAFT_ERRORS.specialtyTitle;
        continue;
      }
      let url: string | undefined;
      if (typedUrl !== "") {
        // Le contrat ne garde que les pages du site du client : la même règle, appliquée avant l'envoi
        url = cleanExternalProfile({ specialties: [{ title, url: withScheme(typedUrl) }] }, siteUrl).specialties[0]?.url;
        if (url === undefined) {
          errors[`items.${item.uid}.url`] = DRAFT_ERRORS.specialtyUrl;
          continue;
        }
      }
      const kept = item.kept;
      // Résumé, intertitres et questions viennent de la page de la spécialité : ils ne valent plus pour une autre page
      const samePage = kept !== null && (url === undefined || kept.url === undefined || sameContent(url, kept.url));
      specialties.push({
        slug: kept?.slug ?? "",
        title,
        excerpt,
        ...(url !== undefined ? { url } : {}),
        ...(samePage && kept.summary !== undefined ? { summary: kept.summary } : {}),
        headings: samePage ? kept.headings : [],
        faq: samePage ? kept.faq : [],
      });
    }
    return { specialties };
  },
  about: (draft) => ({ about: { paragraphs: checkTexts(draft.paragraphs), credentials: checkTexts(draft.credentials) } }),
  practical: (draft, _siteUrl, errors) => ({
    practical: checkPairs("items", draft.items, errors, { secondRequired: true }).map((item) => ({ title: item.first, text: item.second })),
  }),
  process: (draft, _siteUrl, errors) => ({
    process: checkPairs("items", draft.items, errors, { secondRequired: true }).map((item) => ({ title: item.first, description: item.second })),
  }),
  faq: (draft, _siteUrl, errors) => ({
    faq: checkPairs("items", draft.items, errors, { secondRequired: true }).map((item) => ({ question: item.first, answer: item.second })),
  }),
  contact: (draft, siteUrl, errors) => {
    const phone = draft.phone.trim();
    const email = draft.email.trim();
    if (phone !== "" && cleanPhone(phone) === undefined) errors.phone = DRAFT_ERRORS.phone;
    if (email !== "" && cleanExternalProfile({ contact: { email } }, siteUrl).contact.email === undefined) errors.email = DRAFT_ERRORS.email;
    return {
      contact: {
        address: oneLine(draft.address),
        phone,
        email,
        note: oneLine(draft.note),
        hours: checkPairs("hours", draft.hours, errors, { secondRequired: true }).map((item) => ({ label: item.first, value: item.second })),
      },
    };
  },
  booking: (draft, _siteUrl, errors) => {
    const typed = draft.link.trim();
    if (typed === "") return { bookingUrl: "" };
    const link = cleanBookingUrl(bookingLinkFromInput(typed));
    if (link === undefined) errors.link = DRAFT_ERRORS.booking;
    return { bookingUrl: link ?? "" };
  },
  social: (draft, _siteUrl, errors) => {
    const social: SiteSocialLinks = {};
    for (const network of SOCIAL_NETWORKS) {
      const typed = draft.links[network.key].trim();
      if (typed === "") continue;
      const link = cleanSocialLinks({ [network.key]: withScheme(typed) })[network.key];
      if (link === undefined) errors[`links.${network.key}`] = DRAFT_ERRORS.social(network.label, network.host);
      else social[network.key] = link;
    }
    return { social };
  },
};

/** Contrôle le formulaire d'une rubrique et prépare ce qui sera envoyé. */
export function checkRubricDraft<R extends RubricId>(rubric: R, draft: RubricDrafts[R], siteUrl: string): DraftCheck {
  const errors: Record<string, string> = {};
  const value = CHECKS[rubric](draft, siteUrl, errors);
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}
