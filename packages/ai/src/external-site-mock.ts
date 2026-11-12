/**
 * Extracteur de démonstration du profil d'un site de client
 * (`external-site.ts`, mode mock) : aucun appel au modèle, le profil est
 * composé à partir du type des pages, de leurs titres et intertitres, de
 * leurs premiers paragraphes et de quelques motifs simples (prix, durées,
 * horaires, questions).
 *
 * Tout ce qu'il rend est recopié du site, jamais rédigé : c'est moins fin
 * qu'un résumé du modèle, mais rien n'y est inventé, et la même entrée donne
 * toujours la même sortie. Sa sortie est un brouillon : elle passe ensuite
 * par `finalizeExternalProfile`, comme une réponse du modèle (mêmes
 * garde-fous, coordonnées relevées dans le code des pages comprises).
 */

import { EXTERNAL_PROFILE_LIMITS, type ExternalPageKind, type ExternalSitePage } from "@theralys/shared";
import type { ExternalProfileInput } from "./external-site";
import { foldText, readFacts, sanitizeSiteText } from "./external-site-text";
import { checkEthicalCompliance } from "./guardrails";

/** Brouillon de profil : la forme d'une réponse du modèle, avant les garde-fous. */
export type ExternalProfileDraft = {
  headline: string;
  intro: string[];
  highlights: { title: string; text?: string }[];
  specialties: { title: string; excerpt: string; url?: string; summary?: string; headings: string[]; faq: { question: string; answer: string }[] }[];
  about: { paragraphs: string[]; credentials: string[] };
  practical: { title: string; text: string }[];
  process: { title: string; description: string }[];
  faq: { question: string; answer: string }[];
  contact: { address?: string; phone?: string; email?: string; hours: { label: string; value: string }[]; note?: string };
};

const L = EXTERNAL_PROFILE_LIMITS;

// ─── Lecture d'une page ──────────────────────────────────────────────────────

type Block = { text: string; heading: boolean };
type Section = { heading: string; body: string[] };
type Outline = { page: ExternalSitePage; headings: string[]; blocks: Block[]; sections: Section[] };

/** Un texte recopié doit pouvoir être repris par les outils : une phrase que le marketing éthique refuse n'est pas choisie. */
const fair = (text: string): boolean => checkEthicalCompliance(text).ok;
const isQuestion = (text: string): boolean => /\?\s*$/.test(text);
const isPresent = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

/**
 * Page découpée en blocs (une ligne du texte = un bloc) et en rubriques (un
 * intertitre et ce qui le suit). Un bloc est un intertitre s'il est marqué
 * « # » ou s'il reprend l'un des intertitres relevés par le lecteur : les
 * deux écritures existent selon la façon dont le texte a été extrait.
 */
function outlineOf(page: ExternalSitePage): Outline {
  const headings = (Array.isArray(page.headings) ? page.headings : []).map((heading) => sanitizeSiteText(heading)).filter((heading) => heading !== "");
  const known = new Set(headings.map(foldText));
  const blocks: Block[] = [];
  for (const raw of sanitizeSiteText(page.text, { multiline: true }).split(/\n+/)) {
    const marked = /^#{1,6}\s/.test(raw);
    const text = raw
      .replace(/^#{1,6}\s+/, "")
      .replace(/^(?:[-*•–·▪◦‣]|\d{1,2}[.)])\s+/, "")
      .trim();
    if (text !== "") blocks.push({ text, heading: marked || known.has(foldText(text)) });
  }
  const sections: Section[] = [];
  let current: Section = { heading: "", body: [] };
  for (const block of blocks) {
    if (!block.heading) {
      current.body.push(block.text);
      continue;
    }
    if (current.heading !== "" || current.body.length > 0) sections.push(current);
    current = { heading: block.text, body: [] };
  }
  if (current.heading !== "" || current.body.length > 0) sections.push(current);
  return { page, headings, blocks, sections };
}

/** Phrases d'un texte (coupe après un point suivi d'une majuscule, d'un chiffre ou d'un guillemet : « 55.50 € » reste entier). */
function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+(?=[\p{Lu}\d«"“(])/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");
}

/** Premières phrases d'un texte tant qu'elles tiennent dans `max` (au moins une), phrases refusées par le marketing éthique exclues. */
function lead(text: string, max: number): string {
  let out = "";
  for (const sentence of sentencesOf(text)) {
    if (!fair(sentence)) continue;
    const next = out === "" ? sentence : `${out} ${sentence}`;
    if (out !== "" && next.length > max) break;
    out = next;
  }
  return out;
}

/** Blocs de texte d'une page, intertitres exclus. */
const bodyOf = (outline: Outline): string[] => outline.blocks.filter((block) => !block.heading).map((block) => block.text);

/** Paragraphes : blocs de texte assez longs pour être de la prose (ni question, ni entrée de menu, ni ligne de liste). */
function paragraphsOf(bodies: readonly string[]): string[] {
  return bodies.filter((text) => text.length >= 80 && !isQuestion(text) && lead(text, L.paragraph) !== "");
}

/** Questions d'une page et leur réponse : un bloc qui finit par « ? », suivi d'un bloc de texte. */
function questionsOf(outline: Outline): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  outline.blocks.forEach((block, i) => {
    const next = outline.blocks[i + 1];
    if (!isQuestion(block.text) || block.text.length > L.shortText || !next || next.heading || isQuestion(next.text)) return;
    const answer = lead(next.text, L.answer);
    if (answer !== "" && fair(block.text)) out.push({ question: block.text, answer });
  });
  return out;
}

/** Une même question posée sur deux pages (accueil et page des questions) n'est gardée qu'une fois. */
function uniqueQuestions(items: { question: string; answer: string }[]): { question: string; answer: string }[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = foldText(item.question);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Titre d'une page sans le nom du site qui le suit souvent (« Sommeil | Cabinet … » → « Sommeil »). */
function titleHead(title: unknown): string {
  return (sanitizeSiteText(title).split(/\s+[|–—·•-]\s+/)[0] ?? "").trim();
}

// ─── Rubriques ───────────────────────────────────────────────────────────────

// Intertitres (pliés) qui ouvrent une rubrique générale du site : ce ne sont pas des spécialités
const SECTION_RE =
  /propos|qui suis|parcours|formation|tarif|prix|honoraire|contact|horaire|acces|adresse|deroule|comment se passe|premiere seance|premiere consultation|question|faq|avis|temoignage|blog|actualite|article|rendez|rdv|reserv|cabinet|bienvenue|newsletter|mentions|infos? pratique|ou me trouver|pourquoi|points forts|engagements|valeurs/;
// Intertitres qui annoncent la liste des spécialités (« Mes accompagnements », « Prestations », « Motifs de consultation ») —
// pas une spécialité qui en porte le mot (« Accompagnement de la grossesse », « Soins énergétiques »)
const SPECIALTIES_RE =
  /^(?:mes|nos|les|vos) (?:specialites|accompagnements|prestations|soins|seances|consultations|domaines|approches|pratiques)\b|^(?:specialites|accompagnements|prestations|consultations|soins|seances)$|motifs? de consultation|domaines? d (?:intervention|accompagnement|expertise|application)|pour qui|indications|je vous (?:accompagne|aide|recois|propose)|je peux vous (?:aider|accompagner)|ce que je propose/;
const ABOUT_RE = /propos|qui suis|parcours|presentation/;
const PROCESS_RE = /deroule|comment se passe|se passe une seance|premiere seance|premiere consultation|premier rendez vous|etapes/;
const HIGHLIGHTS_RE = /pourquoi|points forts|atouts|engagements|valeurs|mes plus|en bref/;
const CREDENTIAL_RE = /\b(?:diplom\w*|certifi\w*|formations?|formee?|titulaire|agree\w*|membre|ecole|institut|universit\w*|rncp|federation|syndicat)\b/;

const isSpecialtyTitle = (text: string): boolean => text.length >= 3 && text.length <= L.specialtyTitle && !isQuestion(text) && !SECTION_RE.test(foldText(text));

/** Spécialité d'une page qui lui est consacrée : son titre principal, ses premières phrases, ses intertitres et ses questions. */
function specialtyOfPage(outline: Outline): ExternalProfileDraft["specialties"][number] | null {
  const { page, headings } = outline;
  const title = headings[0] ?? titleHead(page.title);
  if (title === "") return null;
  const paragraphs = paragraphsOf(bodyOf(outline));
  const description = sanitizeSiteText(page.description);
  const excerpt = lead(paragraphs[0] ?? description, L.specialtyExcerpt);
  const summary = lead(description !== "" ? description : paragraphs.slice(0, 2).join(" "), L.specialtySummary);
  return {
    title,
    excerpt,
    url: page.url,
    ...(summary !== "" && summary !== excerpt ? { summary } : {}),
    headings: headings.slice(1).filter((heading) => !isQuestion(heading)),
    faq: questionsOf(outline).slice(0, L.specialtyFaq),
  };
}

/**
 * Spécialités lues dans les intertitres d'une page qui les énumère (accueil,
 * prestations) : ceux qui suivent l'intertitre « Mes spécialités » (ou son
 * équivalent) jusqu'à la rubrique suivante ; faute d'un tel repère, tous les
 * intertitres qui ne nomment pas une rubrique générale. Sans intertitre
 * utilisable, les lignes courtes de la rubrique « spécialités » (une liste).
 */
function specialtiesOfHeadings(outline: Outline): ExternalProfileDraft["specialties"] {
  const { headings, sections } = outline;
  const marker = headings.findIndex((heading) => SPECIALTIES_RE.test(foldText(heading)));
  let titles: string[] = [];
  if (marker >= 0) {
    for (const heading of headings.slice(marker + 1)) {
      if (!isSpecialtyTitle(heading)) break;
      titles.push(heading);
    }
    if (titles.length === 0) {
      const listed = sections.find((section) => SPECIALTIES_RE.test(foldText(section.heading)));
      titles = (listed?.body ?? []).filter((text) => isSpecialtyTitle(text) && !/[.!:]$/.test(text));
    }
  } else {
    titles = headings.slice(1).filter(isSpecialtyTitle);
  }
  return titles.map((title) => {
    const own = sections.find((section) => foldText(section.heading) === foldText(title));
    return { title, excerpt: lead(own?.body[0] ?? "", L.specialtyExcerpt), headings: [], faq: [] };
  });
}

/** Diplômes et formations : lignes courtes qui en ont le vocabulaire, sinon les phrases courtes qui en parlent. */
function credentialsOf(bodies: readonly string[]): string[] {
  const max = 120;
  const matches = (text: string): boolean => text.length <= max && CREDENTIAL_RE.test(foldText(text)) && fair(text);
  const lines = bodies.filter(matches);
  return lines.length > 0 ? lines : bodies.flatMap(sentencesOf).filter(matches);
}

const PRICE_RE = /\d+(?:[.,]\d{1,2})?\s?(?:€|euros?\b)/i;
const DURATION_RE = /\b\d+\s?(?:min(?:utes?)?\b|h(?:eures?)?(?:\s?\d{2})?\b)|\bune heure\b|\bune demi-heure\b/i;
const DAY_RE = /\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i;

/** Infos pratiques : la durée d'une séance, les tarifs, le remboursement et les moyens de paiement, recopiés des lignes qui les donnent. */
function practicalOf(outlines: readonly Outline[]): ExternalProfileDraft["practical"] {
  const lines = outlines.flatMap((outline) => outline.blocks.flatMap((block) => (block.text.length <= L.shortText ? [block.text] : sentencesOf(block.text)))).filter((text) => text.length <= L.shortText && fair(text));
  const used = new Set<string>();
  const take = (test: (text: string, folded: string) => boolean): string | undefined => {
    const found = lines.find((text) => !used.has(text) && test(text, foldText(text)));
    if (found !== undefined) used.add(found);
    return found;
  };
  // Tarifs d'abord : une ligne « Séance (1 h) : 60 € » dit le prix avant de dire la durée
  let prices = "";
  for (const text of lines.filter((candidate) => PRICE_RE.test(candidate) && !DAY_RE.test(candidate))) {
    const next = prices === "" ? text : `${prices} · ${text}`;
    if (next.length > L.shortText) break;
    prices = next;
    used.add(text);
  }
  const duration = take((text, folded) => DURATION_RE.test(text) && /seance|consultation|duree|\bdure\b/.test(folded) && !/ouvert|horaire/.test(folded) && !DAY_RE.test(text));
  const refund = take((_text, folded) => /mutuelle|rembours|prise en charge/.test(folded));
  const payment = take((_text, folded) => /cheque|espece|carte bancaire|\bcb\b|virement|paiement|reglement/.test(folded));
  return [
    duration !== undefined ? { title: "Durée d'une séance", text: duration } : null,
    prices !== "" ? { title: "Tarifs", text: prices } : null,
    refund !== undefined ? { title: "Remboursement", text: refund } : null,
    payment !== undefined ? { title: "Moyens de paiement", text: payment } : null,
  ].filter(isPresent);
}

/**
 * Déroulement d'une séance : la rubrique qui l'annonce. Ses lignes sont les
 * étapes (« Titre : description », sinon « Étape n ») ; si elle n'a pas de
 * texte, ce sont les rubriques qui la suivent (étapes écrites en intertitres).
 */
function processOf(outlines: readonly Outline[]): ExternalProfileDraft["process"] {
  for (const { sections } of outlines) {
    const at = sections.findIndex((section) => PROCESS_RE.test(foldText(section.heading)));
    const section = sections[at];
    if (!section) continue;
    const steps: ExternalProfileDraft["process"] = [];
    if (section.body.length > 0) {
      const lines = section.body.length > 1 ? section.body : sentencesOf(section.body[0] ?? "");
      for (const text of lines) {
        const titled = /^([^:.!?]{3,60}?)\s*:\s+(\S.{9,})$/.exec(text);
        const description = lead(titled?.[2] ?? text, L.shortText);
        if (description !== "") steps.push({ title: titled?.[1] ?? `Étape ${steps.length + 1}`, description });
      }
    } else {
      for (const next of sections.slice(at + 1)) {
        const description = lead(next.body[0] ?? "", L.shortText);
        if (description === "" || isQuestion(next.heading) || SECTION_RE.test(foldText(next.heading))) break;
        steps.push({ title: next.heading, description });
      }
    }
    if (steps.length > 0) return steps.slice(0, L.process);
  }
  return [];
}

const PHONE_RE = /(?<!\d)(?:\+33|0033|0)\s?[1-9](?:[\s.-]?\d{2}){4}\b/;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i;
const STREET_RE = /\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|boulevard|bd|place|chemin|all[ée]e|impasse|route|quai|cours|square|faubourg|passage)\b[^\n]{2,90}?\b\d{5}\s+\p{L}[\p{L}' -]{1,40}/iu;

/**
 * Coordonnées écrites dans le texte des pages (contact, puis accueil…), pour
 * les sites dont le code n'en livre aucune. Les mentions légales et le blog
 * ne sont jamais consultés : on y lit l'adresse de l'hébergeur ou d'un tiers.
 */
function contactOf(outlines: readonly Outline[]): ExternalProfileDraft["contact"] {
  const blocks = outlines.flatMap((outline) => outline.blocks.map((block) => block.text));
  const first = (pattern: RegExp): string | undefined => {
    for (const text of blocks) {
      const match = pattern.exec(text);
      if (match) return match[0].trim();
    }
    return undefined;
  };
  const hours: { label: string; value: string }[] = [];
  for (const text of blocks) {
    if (text.length > 120 || !DAY_RE.test(text) || !/\d{1,2}\s?h/i.test(text)) continue;
    // « Horaires : lundi au vendredi 9h – 19h » : l'annonce n'est pas le jour
    const line = text.replace(/^(?:horaires?(?:\s+d['’]ouverture)?|ouvertures?)\s*:\s*/i, "");
    const split = /^(\D*?)\s*:\s+(.+)$/.exec(line) ?? /^(\D+?)[\s,]*(\d.*)$/.exec(line);
    const label = (split?.[1] ?? "").trim();
    const value = (split?.[2] ?? "").trim();
    if (label !== "" && value !== "" && DAY_RE.test(label)) hours.push({ label, value });
  }
  const note = blocks
    .flatMap(sentencesOf)
    .find((sentence) => sentence.length <= L.shortText && /sur rendez vous/.test(foldText(sentence)) && !DAY_RE.test(sentence) && fair(sentence));
  const address = first(STREET_RE);
  const phone = first(PHONE_RE);
  const email = first(EMAIL_RE);
  return {
    ...(address !== undefined ? { address } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(email !== undefined ? { email: email.toLowerCase() } : {}),
    hours,
    ...(note !== undefined ? { note } : {}),
  };
}

// ─── Profil ──────────────────────────────────────────────────────────────────

/**
 * Brouillon de profil déterministe (même entrée → même sortie), sans appel au
 * modèle : accroche et présentation tirées de l'accueil, spécialités des
 * pages de type « spécialité » (à défaut, des intertitres de l'accueil, puis
 * de la page des prestations), à propos, infos pratiques, déroulement,
 * questions et coordonnées recopiés des pages qui les portent.
 */
export function mockExternalProfile(input: ExternalProfileInput): ExternalProfileDraft {
  const outlines = (Array.isArray(input.pages) ? input.pages : []).map(outlineOf);
  const facts = readFacts(input.facts);
  /** Pages de ces types, dans l'ordre des types demandés puis dans l'ordre de lecture */
  const ofKind = (...kinds: ExternalPageKind[]): Outline[] => kinds.flatMap((kind) => outlines.filter((outline) => outline.page.kind === kind));
  const home = ofKind("home")[0] ?? outlines[0];

  const headline = [home?.headings[0], sanitizeSiteText(home?.page.title), sanitizeSiteText(facts.name)].find((text): text is string => typeof text === "string" && text !== "" && fair(text)) ?? "";

  const homeParagraphs = home ? paragraphsOf(bodyOf(home)) : [];
  const described = lead(sanitizeSiteText(home?.page.description) || sanitizeSiteText(facts.description), L.paragraph);
  const intro = homeParagraphs.length > 0 ? homeParagraphs.slice(0, L.introParagraphs).map((text) => lead(text, L.paragraph)) : described !== "" ? [described] : [];

  const fromPages = ofKind("specialty").map(specialtyOfPage).filter(isPresent);
  const fromHome = fromPages.length === 0 && home ? specialtiesOfHeadings(home) : [];
  const services = ofKind("services")[0];
  const specialties = fromPages.length > 0 ? fromPages : fromHome.length > 0 ? fromHome : services ? specialtiesOfHeadings(services) : [];

  // À propos : la page qui lui est consacrée, à défaut la rubrique de l'accueil qui en tient lieu
  const aboutPage = ofKind("about")[0];
  const aboutBodies = aboutPage ? bodyOf(aboutPage) : (home?.sections.find((section) => ABOUT_RE.test(foldText(section.heading)))?.body ?? []);
  const credentials = credentialsOf(aboutBodies);
  const aboutParagraphs = paragraphsOf(aboutBodies).filter((text) => !credentials.includes(text));

  const strengths = home?.sections.find((section) => HIGHLIGHTS_RE.test(foldText(section.heading)))?.body ?? [];
  const highlights = strengths.flatMap((text): ExternalProfileDraft["highlights"] => {
    const titled = /^([^:.!?]{3,60}?)\s*:\s+(\S.{9,})$/.exec(text);
    if (titled) return [{ title: titled[1] ?? "", text: lead(titled[2] ?? "", L.shortText) }];
    return text.length <= 60 && fair(text) ? [{ title: text }] : [];
  });

  return {
    headline,
    intro,
    highlights,
    specialties,
    about: { paragraphs: aboutParagraphs.slice(0, L.aboutParagraphs).map((text) => lead(text, L.paragraph)), credentials },
    practical: practicalOf(ofKind("pricing", "services", "booking", "home", "faq", "about", "contact", "other", "specialty")),
    process: processOf(ofKind("home", "services", "about", "faq", "other", "specialty", "booking", "pricing")),
    faq: uniqueQuestions(ofKind("faq", "home", "services", "pricing", "about", "contact", "booking", "other").flatMap(questionsOf)),
    contact: contactOf(ofKind("contact", "home", "booking", "about", "pricing", "other")),
  };
}
