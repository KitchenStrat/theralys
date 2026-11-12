/**
 * Profil du site internet d'un client (« site de référence », cf.
 * `@theralys/shared` external-site.ts) : à partir des pages lues et des faits
 * relevés, ce que le studio a compris du site — accroche, présentation,
 * spécialités, à propos, infos pratiques, déroulement, questions, contact.
 *
 * Le texte des pages est écrit par des tiers : c'est une donnée, jamais une
 * consigne, et ce que le modèle en tire n'est pas cru sur parole. Le profil
 * sera relu par le praticien puis publié sous son nom par ses outils ; un
 * tarif, une adresse ou une spécialité inventés y seraient une faute. D'où
 * trois étages :
 * 1. le prompt (`external-site-prompt.ts`) : pages choisies sous un budget,
 *    transmises en JSON dans un bloc balisé, règle « rien d'inventé » ;
 * 2. un seul appel à `completeStructured` (effort « medium »), avec un schéma
 *    tolérant — le nettoyage vient après, on ne relance pas le modèle pour
 *    une rubrique mal formée ;
 * 3. `finalizeExternalProfile` : les garde-fous écrits en code, les mêmes
 *    pour le modèle et pour l'extracteur de démonstration
 *    (`external-site-mock.ts`, AI_MOCK=1 ou clé absente).
 */

import { AnthropicError } from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  cleanBookingUrl,
  cleanExternalProfile,
  cleanPhone,
  type ExternalSiteFacts,
  type ExternalSitePage,
  type ExternalSiteProfile,
  type ExternalSpecialty,
  type SiteSocialLinks,
} from "@theralys/shared";
import { completeStructured, type AnthropicClientOptions } from "./anthropic";
import { mockExternalProfile } from "./external-site-mock";
import { externalProfileSystemPrompt, externalProfileUserPrompt, selectProfilePages, type ProfilePromptPage } from "./external-site-prompt";
import {
  addressGrounded,
  emailAppears,
  factTexts,
  foldText,
  numbersGrounded,
  pageTexts,
  pageUrlKey,
  phoneAppears,
  readFacts,
  siteCorpus,
  titleGrounded,
  webAddressAppears,
  type SiteCorpus,
} from "./external-site-text";
import { resolveAiMode, type AiMode } from "./generate-site";
import { checkEthicalCompliance } from "./guardrails";

export { mockExternalProfile, type ExternalProfileDraft } from "./external-site-mock";
export { EXTERNAL_PROFILE_PROMPT_BUDGET, externalProfileSystemPrompt, externalProfileUserPrompt, selectProfilePages, type ProfilePromptPage } from "./external-site-prompt";

// ─── Contrat ─────────────────────────────────────────────────────────────────

/** Ce que l'extracteur reçoit du service : le site tel que le lecteur l'a rendu (`ExternalReadOutcome`), et la fiche du praticien. */
export type ExternalProfileInput = {
  /** Adresse d'accueil du site (normalisée) */
  url: string;
  pages: ExternalSitePage[];
  facts: ExternalSiteFacts;
  /** Ce que le studio sait déjà du praticien (fiche), pour lever les ambiguïtés — jamais pour inventer */
  practitioner?: { name?: string | null; profession?: string | null; city?: string | null } | null;
};

/** Extracteur du profil : réel (un appel au modèle) ou de démonstration, selon `mode`. */
export type ExternalProfileExtractor = {
  mode: AiMode;
  /**
   * Profil nettoyé (`cleanExternalProfile`) : rien qui ne figure sur le site.
   * Une réponse inexploitable du modèle ne lève pas — le profil se réduit
   * alors à ce qui passe les garde-fous, au pire aux coordonnées relevées
   * dans le code des pages. Seul un appel qui n'a pas abouti (réseau, quota,
   * clé) lève : l'appelant doit pouvoir distinguer « le site ne dit rien »
   * de « le modèle n'a pas répondu », et réessayer plus tard.
   */
  extract(input: ExternalProfileInput): Promise<ExternalSiteProfile>;
};

/** Dépendances injectables de `createExternalProfileExtractor`. */
export type ExternalProfileExtractorDeps = {
  /** Appel au modèle (injectable pour les tests) */
  complete?: typeof completeStructured;
};

// ─── Schéma zod de la réponse du modèle ──────────────────────────────────────

/** Entrées lues au plus par liste : une réponse démesurée ne coûte pas un travail démesuré. */
const ENTRIES_MAX = 40;

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

/** Texte tolérant : un nombre est accepté, toute autre valeur donne un texte vide. */
const looseText = z.preprocess((value) => (typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : ""), z.string());

/** Liste tolérante : une valeur seule vaut une liste d'un élément, les entrées mal formées sont passées, la liste est bornée. */
function looseList<T>(item: z.ZodType<T, z.ZodTypeDef, unknown>) {
  return z
    .preprocess((value) => (Array.isArray(value) ? value : value === null || value === undefined || value === "" ? [] : [value]), z.array(z.unknown()))
    .transform((entries): T[] =>
      entries.slice(0, ENTRIES_MAX).flatMap((entry) => {
        const parsed = item.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      }),
    );
}

/** Objet tolérant : toute valeur qui n'en est pas un donne un objet vide. */
function looseObject<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.preprocess((value) => (isRecord(value) ? value : {}), z.object(shape));
}

/** Entrée à titre : un simple texte vaut son titre (« specialties": ["Sommeil"] »). */
function titled<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.preprocess((value) => (typeof value === "string" ? { title: value } : value), z.object(shape));
}

const questionSchema = z.object({ question: looseText, answer: looseText });

const PROFILE_KEYS = ["headline", "intro", "highlights", "specialties", "about", "practical", "process", "faq", "contact", "bookingUrl", "social"] as const;

/**
 * Réponse du modèle : le reflet d'`ExternalSiteProfile`, volontairement
 * tolérant (texte ou nombre, valeur seule ou liste, rubrique absente) — les
 * bornes et le tri sont l'affaire de `finalizeExternalProfile`. Une spécialité
 * désigne sa page par "page" (référence « p3 ») ; "url" reste accepté et sera
 * confronté aux pages lues.
 *
 * Seule exigence : un objet JSON qui porte au moins une rubrique du profil.
 * Une réponse qui n'y ressemble pas du tout vaut une relance du modèle par
 * `completeStructured` ; une rubrique mal formée, non.
 */
export const externalProfileSchema = z
  .record(z.unknown())
  .refine((answer) => PROFILE_KEYS.some((key) => Object.hasOwn(answer, key)), { message: "aucune rubrique du profil dans la réponse" })
  .pipe(
    z.object({
      headline: looseText,
      intro: looseList(looseText),
      highlights: looseList(titled({ title: looseText, text: looseText })),
      specialties: looseList(
        titled({ title: looseText, excerpt: looseText, page: looseText, url: looseText, summary: looseText, headings: looseList(looseText), faq: looseList(questionSchema) }),
      ),
      about: looseObject({ paragraphs: looseList(looseText), credentials: looseList(looseText) }),
      practical: looseList(z.object({ title: looseText, text: looseText })),
      process: looseList(z.object({ title: looseText, description: looseText })),
      faq: looseList(questionSchema),
      contact: looseObject({
        address: looseText,
        phone: looseText,
        email: looseText,
        hours: looseList(z.object({ label: looseText, value: looseText })),
        note: looseText,
      }),
      bookingUrl: looseText,
      social: looseObject({ instagram: looseText, facebook: looseText, linkedin: looseText, tiktok: looseText, youtube: looseText }),
    }),
  );

/** Réponse du modèle une fois lue par le schéma : toutes les rubriques présentes, textes et listes à leur place — pas encore triée ni bornée. */
export type ExternalProfileAnswer = z.output<typeof externalProfileSchema>;

// ─── Garde-fous ──────────────────────────────────────────────────────────────

/** Un texte que le marketing éthique refuse ne peut pas être repris par les outils : il ne reste pas dans le profil. */
const fair = (text: string): boolean => checkEthicalCompliance(text).ok;

/**
 * Références de pages (« p3 ») → adresses des pages transmises. Une adresse
 * écrite en toutes lettres par le modèle est laissée telle quelle : le
 * contrôle des pages lues en décide ensuite.
 */
function withPageAddresses(answer: Record<string, unknown>, promptPages: readonly ProfilePromptPage[]): Record<string, unknown> {
  const addresses = new Map(promptPages.map((page) => [page.ref, page.url] as const));
  const referred = (value: unknown): string | undefined => (typeof value === "string" ? addresses.get(value.trim().toLowerCase()) : undefined);
  const written = (value: unknown): string | undefined => (typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value : undefined);
  return {
    ...answer,
    specialties: list(answer.specialties).map((entry) => (isRecord(entry) ? { ...entry, url: referred(entry.page) ?? referred(entry.url) ?? written(entry.url) ?? written(entry.page) } : entry)),
  };
}

/** Lien de rendez-vous écrit sur le site : un numéro (`tel:`) s'y lit comme un téléphone, une adresse web comme une adresse. */
function bookingAppears(url: string, corpus: SiteCorpus): boolean {
  return /^tel:/i.test(url) ? phoneAppears(url.slice(4), corpus) : webAddressAppears(url, corpus);
}

/**
 * Réponse du modèle (ou brouillon de l'extracteur de démonstration) → profil
 * stocké. Ne lève jamais : une valeur inexploitable donne un profil réduit
 * aux coordonnées relevées dans le code des pages.
 *
 * Chaque entrée est d'abord nettoyée seule par `cleanExternalProfile`, puis
 * jugée, et les plafonds du contrat ne s'appliquent qu'à ce qui reste : une
 * entrée écartée ne prend pas la place d'une bonne. Les garde-fous :
 * 1. spécialités : la page ("page" → adresse, ou "url") n'est gardée que si
 *    c'est une page lue ; une spécialité dont le titre ne se retrouve pas
 *    dans le texte des pages est écartée (mots significatifs, sans égard aux
 *    accents, à la casse, au pluriel) ; un même titre n'est gardé qu'une fois ;
 * 2. infos pratiques : une entrée dont un nombre ne figure dans aucune page
 *    est écartée (prix ou durée inventés) ; diplômes et formations : un
 *    intitulé dont les mots ou l'année ne se lisent pas sur le site est écarté ;
 * 3. coordonnées : celles relevées dans le code des pages priment (téléphone,
 *    e-mail, adresse, horaires, lien de rendez-vous, réseaux sociaux) ; à
 *    défaut, celles du modèle ne sont gardées que si elles se lisent sur le
 *    site — téléphone et e-mail dans les pages ou les faits, adresses web
 *    écrites en toutes lettres, adresse postale dont les nombres et les noms
 *    y figurent, horaires et précision sans nombre étranger aux pages ;
 * 4. formulations, au fil des rubriques : un texte que le marketing éthique
 *    refuse est retiré — `completeStructured` l'exige déjà du modèle, la
 *    règle vaut ici pour le brouillon de démonstration et pour une réponse
 *    refusée dont on garde les parties conformes ;
 * 5. `cleanExternalProfile` une dernière fois : plafonds, identifiants
 *    uniques, mêmes bornes pour les valeurs venues des faits.
 *
 * `promptPages` : les pages telles qu'elles ont été transmises (références
 * « p1 »…) ; recalculées à l'identique si elles ne sont pas fournies.
 */
export function finalizeExternalProfile(raw: unknown, input: ExternalProfileInput, promptPages?: readonly ProfilePromptPage[]): ExternalSiteProfile {
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const clean = (value: unknown): ExternalSiteProfile => cleanExternalProfile(value, input.url);
  /** Entrées d'une liste, nettoyées une à une */
  const each = <T>(value: unknown, cleanOne: (entry: unknown) => T[]): T[] => list(value).slice(0, ENTRIES_MAX).flatMap(cleanOne);

  // Même tolérance que pour une réponse du modèle, d'où que vienne la valeur
  const parsed = externalProfileSchema.safeParse(raw);
  const answer = withPageAddresses(parsed.success ? parsed.data : record(raw), promptPages ?? selectProfilePages(pages));
  const about = record(answer.about);

  const found = readFacts(input.facts);
  const texts = pageTexts(pages);
  const read = siteCorpus(texts);
  const readOrFound = siteCorpus([...texts, ...factTexts(found)]);
  const readPages = new Set(pages.map((page) => pageUrlKey(page.url)).filter((key): key is string => key !== null));

  // 1. Spécialités
  const titles = new Set<string>();
  const specialties = each(answer.specialties, (entry) => clean({ specialties: [entry] }).specialties).flatMap((specialty): ExternalSpecialty[] => {
    const title = foldText(specialty.title);
    if (titles.has(title) || !fair(specialty.title) || !titleGrounded(specialty.title, read)) return [];
    titles.add(title);
    const { url, summary, ...rest } = specialty;
    const pageKey = pageUrlKey(url);
    return [
      {
        ...rest,
        excerpt: fair(specialty.excerpt) ? specialty.excerpt : "",
        ...(url !== undefined && pageKey !== null && readPages.has(pageKey) ? { url } : {}),
        ...(summary !== undefined && fair(summary) ? { summary } : {}),
        headings: specialty.headings.filter(fair),
        faq: specialty.faq.filter((item) => fair(item.question) && fair(item.answer)),
      },
    ];
  });

  // 2. Infos pratiques, diplômes et formations
  const practical = each(answer.practical, (entry) => clean({ practical: [entry] }).practical).filter((item) => fair(item.title) && fair(item.text) && numbersGrounded(`${item.title} ${item.text}`, read));
  const credentials = each(about.credentials, (entry) => clean({ about: { credentials: [entry] } }).about.credentials).filter((line) => fair(line) && titleGrounded(line, read) && numbersGrounded(line, read));

  // 3. Coordonnées : les faits d'abord, sinon ce qui se lit sur le site
  const base = clean(answer);
  const fromFacts = clean({ contact: { address: found.address, hours: found.hours }, social: found.social });
  const factPhone = found.phones.map((phone) => cleanPhone(phone)).find((phone) => phone !== undefined);
  const factEmail = found.emails.map((email) => clean({ contact: { email } }).contact.email).find((email) => email !== undefined);
  const factBooking = found.bookingUrls.map((url) => cleanBookingUrl(url)).find((url) => url !== undefined);
  const proposed = base.contact;
  const phone = factPhone ?? (proposed.phone !== undefined && phoneAppears(proposed.phone, readOrFound) ? proposed.phone : undefined);
  const email = factEmail ?? (proposed.email !== undefined && emailAppears(proposed.email, readOrFound) ? proposed.email : undefined);
  const address = fromFacts.contact.address ?? (proposed.address !== undefined && addressGrounded(proposed.address, read) ? proposed.address : undefined);
  const hours =
    fromFacts.contact.hours.length > 0
      ? fromFacts.contact.hours
      : each(record(answer.contact).hours, (entry) => clean({ contact: { hours: [entry] } }).contact.hours).filter((line) => numbersGrounded(`${line.label} ${line.value}`, read));
  const note = proposed.note !== undefined && fair(proposed.note) && numbersGrounded(proposed.note, read) ? proposed.note : undefined;
  const bookingUrl = factBooking ?? (base.bookingUrl !== undefined && bookingAppears(base.bookingUrl, read) ? base.bookingUrl : undefined);
  const social: SiteSocialLinks = { ...fromFacts.social };
  for (const network of Object.keys(base.social) as (keyof SiteSocialLinks)[]) {
    const link = base.social[network];
    if (social[network] === undefined && link !== undefined && webAddressAppears(link, read)) social[network] = link;
  }

  // 4 et 5. Formulations refusées retirées, puis le contrat (plafonds, identifiants) sur ce qui a passé les garde-fous
  return clean({
    headline: fair(base.headline) ? base.headline : "",
    intro: each(answer.intro, (entry) => clean({ intro: [entry] }).intro).filter(fair),
    highlights: each(answer.highlights, (entry) => clean({ highlights: [entry] }).highlights)
      .filter((item) => fair(item.title))
      .map((item) => (item.text !== undefined && !fair(item.text) ? { title: item.title } : item)),
    specialties,
    about: { paragraphs: each(about.paragraphs, (entry) => clean({ about: { paragraphs: [entry] } }).about.paragraphs).filter(fair), credentials },
    practical,
    process: each(answer.process, (entry) => clean({ process: [entry] }).process).filter((item) => fair(item.title) && fair(item.description)),
    faq: each(answer.faq, (entry) => clean({ faq: [entry] }).faq).filter((item) => fair(item.question) && fair(item.answer)),
    contact: { address, phone, email, hours, note },
    bookingUrl,
    social,
  });
}

// ─── createExternalProfileExtractor ──────────────────────────────────────────

/**
 * Extracteur du profil : mode choisi par `resolveAiMode(env)` (AI_MOCK=1 ou
 * clé absente → démonstration, sans appel au modèle). Dans les deux modes le
 * résultat passe par `finalizeExternalProfile`.
 *
 * Mode réel : un seul appel à completeStructured({ apiKey, model, effort:
 * "medium" }, externalProfileSystemPrompt(), externalProfileUserPrompt(…),
 * externalProfileSchema). `completeStructured` ajoute les règles de marketing
 * éthique au prompt système, relit toute la réponse et relance une fois le
 * modèle ; s'il lève quand même :
 * - le modèle a répondu, mais sa réponse est refusée (formulation proscrite
 *   deux fois de suite) : on finalise la dernière réponse lue — les
 *   garde-fous en retirent ce qui est refusé ;
 * - le modèle n'a rien rendu d'exploitable (JSON invalide, refus, réponse
 *   tronquée) : profil réduit aux faits relevés ;
 * - l'appel lui-même a échoué (erreur du SDK : réseau, quota, clé) : l'erreur
 *   est relancée telle quelle.
 * Sans aucun texte de page, le modèle n'est pas appelé.
 */
export function createExternalProfileExtractor(env: NodeJS.ProcessEnv = process.env, deps: ExternalProfileExtractorDeps = {}): ExternalProfileExtractor {
  const mode = resolveAiMode(env);
  if (mode === "mock") {
    return { mode, extract: async (input) => finalizeExternalProfile(mockExternalProfile(input), input) };
  }
  const complete = deps.complete ?? completeStructured;
  const options: AnthropicClientOptions = {
    apiKey: env.ANTHROPIC_API_KEY!,
    model: env.ANTHROPIC_MODEL,
    effort: "medium",
  };
  return {
    mode,
    extract: async (input) => {
      const pages = selectProfilePages(input.pages);
      if (pages.every((page) => page.text === "")) return finalizeExternalProfile({}, input, pages);

      // `completeStructured` ne rend pas la réponse qu'il refuse : le schéma la retient au passage
      let lastRead: ExternalProfileAnswer | undefined;
      const schema = externalProfileSchema.transform((answer) => {
        lastRead = answer;
        return answer;
      });
      let answer: unknown;
      try {
        answer = await complete(options, externalProfileSystemPrompt(), externalProfileUserPrompt(input, pages), schema);
      } catch (err) {
        if (lastRead === undefined && err instanceof AnthropicError) throw err;
        const reason = (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, 200);
        console.warn(
          `[external-site] ${lastRead === undefined ? "réponse du modèle inexploitable, profil réduit aux faits relevés" : "réponse du modèle refusée, seules ses parties conformes sont gardées"} : ${reason}`,
        );
        answer = lastRead;
      }
      return finalizeExternalProfile(answer, input, pages);
    },
  };
}
