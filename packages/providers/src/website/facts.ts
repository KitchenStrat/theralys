/**
 * Faits relevés dans le code des pages, sans IA : données structurées
 * (JSON-LD), balises meta, liens `tel:` et `mailto:`, liens de rendez-vous et
 * de réseaux sociaux, balises de mesure, outil de création du site. Module
 * pur : rien n'est exécuté, rien n'est chargé.
 *
 * Ces faits sont ce que le site déclare lui-même, mot pour mot : ils servent
 * de coordonnées de référence au profil (un modèle de langage peut se tromper
 * sur un numéro de téléphone, un lien `tel:` non).
 */

import type { CheerioAPI } from "cheerio/slim";
import {
  EXTERNAL_MEASURE_PATH,
  TRACKING_ID_PATTERNS,
  bareHost,
  bookingPlatformOf,
  cleanBookingUrl,
  cleanPhone,
  cleanSocialLinks,
  isSameSiteHost,
  type BookingPlatformId,
  type ExternalCms,
  type ExternalSiteFacts,
  type ExternalSiteTags,
  type SiteSocialLinks,
} from "@theralys/shared";
import { firstDescendant, textOf } from "./dom";
import { decodeEntities } from "./entities";
import { documentLanguage, metaContent } from "./extract";
import { cleanLine, cleanLineMax, foldText } from "./text";

type Hours = { label: string; value: string };
type BookingLink = { url: string; platform: BookingPlatformId | null };
type SocialNetwork = keyof SiteSocialLinks;

/** Ce qu'une entité des données structurées déclare (établissement, organisation, personne). */
type StructuredEntity = {
  /** 0 : établissement local · 1 : organisation · 2 : personne */
  rank: 0 | 1 | 2;
  name?: string;
  description?: string;
  phones: string[];
  emails: string[];
  address?: string;
  hours: Hours[];
  links: string[];
  logo?: string;
};

/** Faits relevés sur une page ; `mergeSiteFacts` les réunit pour le site. */
export type PageFacts = {
  url: string;
  description?: string;
  language?: string;
  /** `og:site_name` */
  siteName?: string;
  /** Nom du site selon les données structurées (`WebSite`) */
  websiteName?: string;
  entities: StructuredEntity[];
  phones: string[];
  emails: string[];
  bookingLinks: BookingLink[];
  social: { network: SocialNetwork; url: string }[];
  tags: ExternalSiteTags;
  cms?: ExternalCms;
  themeColor?: string;
};

const NAME_MAX = 120;
const DESCRIPTION_MAX = 320;
const ADDRESS_MAX = 160;
const PHONES_MAX = 3;
const EMAILS_MAX = 3;
const BOOKING_LINKS_MAX = 5;
/** Bloc JSON-LD analysé au plus (caractères) : au-delà, il est ignoré. */
const JSON_LD_MAX = 200_000;
/** Bornes de ce qui est examiné sur une page : une vraie page en est loin, une page piégée ne doit pas coûter plus. */
const JSON_LD_BLOCKS_MAX = 50;
const ANCHORS_MAX = 3_000;
const EMBEDS_MAX = 500;
const HREF_MAX = 2_048;
const LINK_RAW_TEXT_MAX = 2_000;
const STRUCTURED_TEXT_RAW_MAX = 20_000;
const LIST_MAX = 50;
const ENTITIES_MAX = 20;
const FOUND_PER_PAGE_MAX = 50;

// ─── Petits outils ───────────────────────────────────────────────────────────

/** Valeur ou liste de valeurs des données structurées → liste, bornée (une liste démesurée n'est pas lue en entier). */
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? (value.length > LIST_MAX ? value.slice(0, LIST_MAX) : value) : value === undefined || value === null ? [] : [value]);
const asRecord = (value: unknown): Record<string, unknown> | null => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** Chaîne des données structurées → texte : certains outils y laissent des entités HTML ou des balises. */
function plainText(value: unknown, max: number): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const raw = String(value).slice(0, STRUCTURED_TEXT_RAW_MAX);
  // Balises remplacées par des espaces, puis entités décodées
  return cleanLineMax(/[&<]/.test(raw) ? decodeEntities(raw.replace(/<[^>]{0,200}>/g, " ")) : raw, max);
}

function unique<T>(values: readonly T[], keyOf: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyOf(value);
    if (key === "" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function absoluteUrl(href: string | undefined, base: string): URL | null {
  if (!href) return null;
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

// ─── Téléphones et courriels ─────────────────────────────────────────────────

/** Chiffres d'un numéro, la forme internationale française ramenée à la forme nationale (clé de dédoublonnage). */
function phoneDigits(raw: string): string {
  const compact = raw.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
  const national = compact.replace(/^(?:\+|00)33/, "0");
  return national.replace(/\D/g, "");
}

/**
 * Numéro tel qu'on l'écrit en France (« 04 72 00 00 00 ») quand c'en est
 * un ; un numéro étranger est gardé tel qu'affiché. `undefined` si ce n'est
 * pas un numéro plausible.
 */
export function displayPhone(raw: string): string | undefined {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const digits = phoneDigits(decoded);
  if (/^0[1-9]\d{8}$/.test(digits)) return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
  return cleanPhone(decoded.replace(/\(0\)/g, ""));
}

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

/** Adresse de courriel d'un lien `mailto:` ou des données structurées, en minuscules ; `undefined` si elle n'en est pas une. */
export function cleanEmail(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  let value = raw.trim().replace(/^mailto:/i, "").split("?")[0] ?? "";
  try {
    value = decodeURIComponent(value);
  } catch {
    // Encodage illisible : valeur gardée telle quelle
  }
  const email = (value.split(/[,;]/)[0] ?? "").trim().toLowerCase();
  return email.length <= 120 && EMAIL.test(email) ? email : undefined;
}

// ─── Horaires ────────────────────────────────────────────────────────────────

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;
const DAY_INDEX: Record<string, number> = { monday: 0, mo: 0, tuesday: 1, tu: 1, wednesday: 2, we: 2, thursday: 3, th: 3, friday: 4, fr: 4, saturday: 5, sa: 5, sunday: 6, su: 6 };
const HOURS_MAX = 7;

function dayIndex(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const key = (value.split(/[/#:]/).pop() ?? "").trim().toLowerCase();
  return DAY_INDEX[key] ?? null;
}

/** « 09:00 », « 9:30:00 » → minutes depuis minuit ; `null` si illisible. */
function minutesOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^\s*(\d{1,2})[:h.](\d{2})(?::\d{2})?\s*$/i.exec(value) ?? /^\s*(\d{1,2})()\s*h?\s*$/i.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  return hours <= 24 && minutes < 60 ? hours * 60 + minutes : null;
}

const formatTime = (minutes: number): string => `${Math.floor(minutes / 60) % 24}h${minutes % 60 === 0 ? "" : String(minutes % 60).padStart(2, "0")}`;

type DayRanges = [number, number][];

function addRange(week: DayRanges[], day: number, opens: number, closes: number): void {
  const ranges = week[day];
  if (ranges && !ranges.some(([from, to]) => from === opens && to === closes)) ranges.push([opens, closes]);
}

/** « Mo-Fr 09:00-19:00 », « Mo,We 9:00-12:00 14:00-18:00 » (propriété `openingHours`). */
function readOpeningHoursText(week: DayRanges[], value: string): void {
  const match = /^\s*((?:mo|tu|we|th|fr|sa|su)(?:\s*[-,]\s*(?:mo|tu|we|th|fr|sa|su))*)\s+(.+)$/i.exec(value);
  if (!match) return;
  const days = new Set<number>();
  for (const part of match[1]!.split(",")) {
    const [from, to] = part.split("-").map((name) => dayIndex(name.trim()));
    if (from === null || from === undefined) continue;
    days.add(from);
    // « Sa-Mo » : l'intervalle passe par dimanche
    for (let day = from; to !== null && to !== undefined && day !== to; ) {
      day = (day + 1) % 7;
      days.add(day);
    }
  }
  for (const range of match[2]!.matchAll(/(\d{1,2}[:h.]\d{2})\s*[-–]\s*(\d{1,2}[:h.]\d{2})/gi)) {
    const opens = minutesOf(range[1]);
    const closes = minutesOf(range[2]);
    if (opens === null || closes === null) continue;
    for (const day of days) addRange(week, day, opens, closes);
  }
}

/**
 * Horaires des données structurées (`openingHoursSpecification`,
 * `openingHours`) → lignes en français, les jours consécutifs aux mêmes
 * horaires regroupés (« Lundi au vendredi » · « 9h – 12h30, 14h – 19h »).
 * Les horaires exceptionnels (bornés par des dates) sont ignorés.
 */
export function openingHoursLabels(specification: unknown, openingHours: unknown): Hours[] {
  const week: DayRanges[] = DAYS.map(() => []);
  for (const item of asList(specification)) {
    const spec = asRecord(item);
    if (!spec || spec.validFrom !== undefined || spec.validThrough !== undefined) continue;
    const opens = minutesOf(spec.opens);
    const closes = minutesOf(spec.closes);
    if (opens === null || closes === null) continue;
    for (const name of asList(spec.dayOfWeek)) {
      const day = dayIndex(name);
      if (day !== null) addRange(week, day, opens, closes);
    }
  }
  for (const item of asList(openingHours)) {
    if (typeof item !== "string") continue;
    for (const part of item.split(/[;\n]/)) readOpeningHoursText(week, part);
  }

  const values = week.map((ranges) => {
    if (ranges.length === 0) return "";
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    // Convention des données structurées : ouverture et fermeture à minuit = fermé ; 00:00–23:59 = toute la journée
    if (sorted.every(([from, to]) => from === 0 && to === 0)) return "Fermé";
    if (sorted.some(([from, to]) => from === 0 && to >= 23 * 60 + 59)) return "24h/24";
    return sorted.map(([from, to]) => `${formatTime(from)} – ${formatTime(to)}`).join(", ");
  });
  if (values.every((value) => value !== "" && value === values[0])) return [{ label: "Tous les jours", value: values[0]! }];

  const out: Hours[] = [];
  for (let start = 0; start < 7; ) {
    const value = values[start]!;
    let end = start;
    while (end + 1 < 7 && values[end + 1] === value) end += 1;
    if (value !== "") {
      const first = DAYS[start]!;
      const last = DAYS[end]!.toLowerCase();
      out.push({ label: end === start ? first : end === start + 1 ? `${first} et ${last}` : `${first} au ${last}`, value: value.slice(0, 80) });
    }
    start = end + 1;
  }
  return out.slice(0, HOURS_MAX);
}

// ─── Données structurées (JSON-LD) ───────────────────────────────────────────

const typesOf = (node: Record<string, unknown>): string[] =>
  asList(node["@type"])
    .filter((type): type is string => typeof type === "string")
    .map((type) => type.split(/[/#:]/).pop() ?? "");

const LOCAL_BUSINESS_TYPE = /^(?:LocalBusiness|ProfessionalService|Physician|IndividualPhysician|PhysiciansOffice|Dentist|Optician|Pharmacy|Hospital|Physiotherapy|HealthClub|ExerciseGym|SportsActivityLocation|VeterinaryCare|MedicalOrganization|.*(?:Business|Clinic|Salon|Spa|Store|Practice))$/;
const ORGANIZATION_TYPE = /^(?:Organization|Corporation|NGO|EducationalOrganization)$/;
/** Types qui décrivent une page ou un contenu, jamais le praticien. */
const CONTENT_TYPE = /^(?:WebSite|WebPage|.*Page|BreadcrumbList|ItemList|ListItem|Article|BlogPosting|NewsArticle|Blog|ImageObject|VideoObject|Review|AggregateRating|Rating|Product|Offer|Service|Question|Answer|SearchAction|ReadAction|PostalAddress|Place|Event|HowTo|Thing)$/;

function entityRank(node: Record<string, unknown>): 0 | 1 | 2 | null {
  const types = typesOf(node);
  if (types.some((type) => LOCAL_BUSINESS_TYPE.test(type))) return 0;
  if (types.some((type) => ORGANIZATION_TYPE.test(type))) return 1;
  if (types.includes("Person")) return 2;
  if (types.length === 0 || types.some((type) => CONTENT_TYPE.test(type))) return null;
  // Sous-type d'établissement inconnu de cette liste (« Osteopathic », « Midwifery »…) : reconnu à ses coordonnées
  return node.address !== undefined && (node.telephone !== undefined || node.openingHoursSpecification !== undefined || node.openingHours !== undefined) ? 0 : null;
}

/** Adresse postale des données structurées, sur une ligne (« 12 rue Tronchet, 69006 Lyon »). */
export function postalAddressLine(value: unknown): string | undefined {
  const first = asList(value)[0];
  if (typeof first === "string") return plainText(first, ADDRESS_MAX) || undefined;
  const address = asRecord(first);
  if (!address) return undefined;
  const part = (key: string): string => plainText(asRecord(address[key])?.name ?? address[key], 80);
  const street = part("streetAddress");
  const city = [part("postalCode"), part("addressLocality")].filter((item) => item !== "").join(" ");
  const country = part("addressCountry");
  const abroad = country !== "" && !/^(?:fr|fra|france)$/i.test(country) ? country : "";
  const line = [street, city, abroad].filter((item) => item !== "").join(", ");
  // Une rue seule ou un pays seul ne fait pas une adresse
  return city !== "" || (street !== "" && abroad !== "") ? cleanLineMax(line, ADDRESS_MAX) : undefined;
}

function imageUrl(value: unknown, base: string): string | undefined {
  const first = asList(value)[0];
  const raw = typeof first === "string" ? first : (asRecord(first)?.url ?? asRecord(first)?.contentUrl);
  const url = typeof raw === "string" ? absoluteUrl(raw, base) : null;
  if (!url || url.username !== "" || url.password !== "" || url.href.length > 400) return undefined;
  url.protocol = "https:";
  url.hash = "";
  return url.href;
}

function readEntity(node: Record<string, unknown>, rank: 0 | 1 | 2, pageUrl: string): StructuredEntity {
  const contacts = asList(node.contactPoint)
    .map(asRecord)
    .filter((contact): contact is Record<string, unknown> => contact !== null);
  const phones = [...asList(node.telephone), ...contacts.flatMap((contact) => asList(contact.telephone))].map((phone) => (typeof phone === "string" ? displayPhone(phone) : undefined));
  const emails = [...asList(node.email), ...contacts.flatMap((contact) => asList(contact.email))].map(cleanEmail);
  // Lien de réservation déclaré comme action (`ReserveAction`, `ScheduleAction`)
  const actions = asList(node.potentialAction)
    .map(asRecord)
    .filter((action): action is Record<string, unknown> => action !== null && typesOf(action).some((type) => /^(?:Reserve|Schedule)Action$/.test(type)))
    .flatMap((action) => asList(action.target).map((target) => asRecord(target)?.urlTemplate ?? asRecord(target)?.url ?? target));
  const name = plainText(asList(node.name)[0], NAME_MAX);
  const description = plainText(asList(node.description)[0], DESCRIPTION_MAX);
  const address = postalAddressLine(node.address);
  const logo = imageUrl(node.logo, pageUrl);
  return {
    rank,
    ...(name !== "" ? { name } : {}),
    ...(description !== "" ? { description } : {}),
    phones: phones.filter((phone): phone is string => phone !== undefined),
    emails: emails.filter((email): email is string => email !== undefined),
    ...(address ? { address } : {}),
    hours: openingHoursLabels(node.openingHoursSpecification, node.openingHours),
    links: [...asList(node.sameAs), ...actions].filter((link): link is string => typeof link === "string" && link.length <= HREF_MAX),
    ...(logo ? { logo } : {}),
  };
}

/** Clés sous lesquelles l'entité décrite par une page ou un site est rangée. Les auteurs d'avis et d'articles n'en font pas partie. */
const NESTED_ENTITY_KEYS = ["@graph", "mainEntity", "about", "publisher", "provider"];

/** Entités (établissement, organisation, personne) et nom du site déclarés en JSON-LD. Un bloc illisible est ignoré. */
export function readJsonLd($: CheerioAPI, pageUrl: string): { entities: StructuredEntity[]; websiteName?: string } {
  const entities: StructuredEntity[] = [];
  let websiteName: string | undefined;
  const visit = (value: unknown, depth: number): void => {
    if (depth > 4 || entities.length >= ENTITIES_MAX) return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 200)) visit(item, depth);
      return;
    }
    const node = asRecord(value);
    if (!node) return;
    const rank = entityRank(node);
    if (rank !== null) entities.push(readEntity(node, rank, pageUrl));
    else if (typesOf(node).includes("WebSite") && websiteName === undefined) websiteName = plainText(asList(node.name)[0], NAME_MAX) || undefined;
    for (const key of NESTED_ENTITY_KEYS) if (node[key] !== undefined) visit(node[key], depth + 1);
  };
  for (const element of $("script[type='application/ld+json' i]").toArray().slice(0, JSON_LD_BLOCKS_MAX)) {
    const text = textOf(element, JSON_LD_MAX + 1);
    if (text.length > JSON_LD_MAX) continue;
    const raw = text
      .trim()
      .replace(/^(?:\/\/\s*)?<!\[CDATA\[|(?:\/\/\s*)?\]\]>$/g, "")
      .replace(/^<!--|-->$/g, "");
    if (raw === "") continue;
    try {
      visit(JSON.parse(raw), 0);
    } catch {
      // JSON invalide : bloc ignoré
    }
  }
  return { entities, ...(websiteName ? { websiteName } : {}) };
}

// ─── Liens : rendez-vous et réseaux sociaux ──────────────────────────────────

const TRACKING_PARAMETER = /^(?:utm_|mc_|pk_|mtm_)|^(?:gclid|fbclid|msclkid|dclid|gbraid|wbraid|igshid)$/i;

/** Lien de rendez-vous propre : https, sans ancre ni paramètre de suivi. */
function bookingUrl(url: URL): string | undefined {
  const copy = new URL(url.href);
  for (const name of [...copy.searchParams.keys()]) if (TRACKING_PARAMETER.test(name)) copy.searchParams.delete(name);
  return cleanBookingUrl(copy.href);
}

/** Le libellé d'un lien parle-t-il de prendre rendez-vous ? (forme repliée : minuscules, sans accents, mots séparés par « - ») */
const BOOKING_TEXT = /(?:^|-)(?:rdv|rendez-vous|reserver|reservez|reservation|reservations|je-reserve|booking|book|appointment|appointments|prise-de-rdv|consultation-en-ligne)(?:-|$)/;

const SOCIAL_NETWORKS: readonly SocialNetwork[] = ["instagram", "facebook", "linkedin", "tiktok", "youtube"];

/** Chemins qui ne sont pas une page de profil (contenus, boutons de partage, connexion). */
const NOT_A_PROFILE: Record<SocialNetwork, RegExp> = {
  instagram: /^\/(?:p|reel|reels|tv|explore|stories|accounts|share|direct|about|developer|legal)(?:\/|$)/i,
  facebook: /^\/(?:sharer|share|dialog|plugins|tr|login|l\.php|watch|events|hashtag|help|policies|privacy|legal|marketplace|gaming|photo|photos|story\.php|permalink\.php|v\d)(?:[/.]|$)/i,
  linkedin: /^\/(?:share|sharing|shareArticle|feed|posts|pulse|jobs|login|signup|legal|help|cws)(?:\/|$)/i,
  tiktok: /^\/(?!@)/,
  youtube: /^\/(?:watch|embed|playlist|shorts|results|feed|live|hashtag|t\/|redirect)/i,
};

/** Réseau social dont l'adresse est une page de profil, selon les règles de `cleanSocialLinks` (hôte du réseau, pas un bouton de partage). */
export function socialProfileOf(href: string): { network: SocialNetwork; url: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }
  // Une adresse « youtu.be » est une vidéo, jamais une chaîne
  if (bareHost(parsed.hostname) === "youtu.be") return null;
  // Paramètres retirés (suivi, langue), sauf l'identifiant d'un profil Facebook sans nom (« profile.php?id=… »)
  const profileId = parsed.pathname === "/profile.php" ? parsed.searchParams.get("id") : null;
  parsed.search = profileId !== null && /^\d{5,20}$/.test(profileId) ? `?id=${profileId}` : "";
  if (parsed.pathname === "/profile.php" && parsed.search === "") return null;
  for (const network of SOCIAL_NETWORKS) {
    const url = cleanSocialLinks({ [network]: parsed.href })[network];
    if (!url) continue;
    const path = new URL(url).pathname;
    if (NOT_A_PROFILE[network].test(path) || path.replace(/\/+$/, "") === "") return null;
    return { network, url: url.replace(/\/+$/, "") };
  }
  return null;
}

function readLinks($: CheerioAPI, pageUrl: string): { phones: string[]; emails: string[]; bookingLinks: BookingLink[]; social: { network: SocialNetwork; url: string }[] } {
  const phones: string[] = [];
  const emails: string[] = [];
  const bookingLinks: BookingLink[] = [];
  const social: { network: SocialNetwork; url: string }[] = [];

  const addBooking = (url: URL | null, label: string): void => {
    if (!url || isSameSiteHost(url.href, pageUrl)) return;
    const platform = bookingPlatformOf(url.href);
    if (platform === null && (!BOOKING_TEXT.test(foldText(label)) || socialProfileOf(url.href) !== null)) return;
    const clean = bookingUrl(url);
    if (clean && bookingLinks.length < FOUND_PER_PAGE_MAX) bookingLinks.push({ url: clean, platform });
  };

  for (const element of $("a[href]").toArray().slice(0, ANCHORS_MAX)) {
    const rawHref = element.attribs.href ?? "";
    if (rawHref.length > HREF_MAX) continue;
    const href = rawHref.trim();
    if (/^tel:/i.test(href)) {
      const phone = displayPhone(href.replace(/^tel:(?:\/\/)?/i, ""));
      if (phone && phones.length < FOUND_PER_PAGE_MAX) phones.push(phone);
      continue;
    }
    if (/^mailto:/i.test(href)) {
      const email = cleanEmail(href);
      if (email && emails.length < FOUND_PER_PAGE_MAX) emails.push(email);
      continue;
    }
    const url = absoluteUrl(href, pageUrl);
    if (!url) continue;
    const profile = socialProfileOf(url.href);
    if (profile && social.length < FOUND_PER_PAGE_MAX) social.push(profile);
    // Libellé du lien : son texte, sinon son intitulé accessible ou le texte de remplacement de son image
    const label =
      cleanLine(textOf(element, LINK_RAW_TEXT_MAX)) || element.attribs["aria-label"] || element.attribs.title || firstDescendant(element, (child) => child.name === "img" && child.attribs.alt !== undefined)?.attribs.alt || "";
    addBooking(url, label);
  }
  // Agendas intégrés : cadre d'une plateforme connue, bloc Calendly
  for (const element of $("iframe[src], [data-url]").toArray().slice(0, EMBEDS_MAX)) {
    const target = element.attribs.src ?? element.attribs["data-url"] ?? "";
    if (target.length > HREF_MAX) continue;
    const url = absoluteUrl(target, pageUrl);
    if (url && bookingPlatformOf(url.href) !== null) addBooking(url, "");
  }
  return { phones, emails, bookingLinks, social };
}

// ─── Balises de mesure, outil de création, couleur ───────────────────────────

const CONSENT_BANNER =
  /tarteaucitron|axept\.io|axeptio|privacy-center\.org|didomi|cookielaw\.org|otSDKStub|onetrust|cookiebot\.com|cookieyes|cookie-law-info|complianz|cmplz|iubenda\.com|quantcast|usercentrics|osano\.com|klaro|cookie-notice|borlabs-cookie|moove_gdpr|sddan\.com|sirdata|termly\.io|cookiefirst|orejime|cookie-script\.com|fundingchoicesmessages|cookie-?consent|sqs-cookie-banner/i;

/**
 * Balises repérées dans le code brut de la page. Rien n'est exécuté : ce sont
 * des motifs cherchés dans le texte du document, scripts compris.
 */
export function detectTags($: CheerioAPI, html: string): ExternalSiteTags {
  const tags: ExternalSiteTags = {};
  const analytics = /googletagmanager\.com\/gtag\/js\?id=(G-[A-Z0-9]{4,14})\b/i.exec(html)?.[1] ?? /["'](G-[A-Z0-9]{8,12})["']/.exec(html)?.[1];
  if (analytics && TRACKING_ID_PATTERNS.googleAnalyticsId.test(analytics)) tags.googleAnalyticsId = analytics.toUpperCase();
  const tagManager = /\b(GTM-[A-Z0-9]{4,10})\b/.exec(html)?.[1];
  if (tagManager && TRACKING_ID_PATTERNS.googleTagManagerId.test(tagManager)) tags.googleTagManagerId = tagManager;
  const ads = /\b(AW-\d{8,12})\b/.exec(html)?.[1];
  if (ads && TRACKING_ID_PATTERNS.googleAdsId.test(ads)) tags.googleAdsId = ads;
  const pixel = /fbq\(\s*["']init["']\s*,\s*["']?(\d{10,20})["']?/.exec(html)?.[1] ?? /facebook\.com\/tr\/?\?(?:[^"'\s<>]{0,200}?(?:&|&amp;))?id=(\d{10,20})\b/.exec(html)?.[1];
  if (pixel && TRACKING_ID_PATTERNS.metaPixelId.test(pixel)) tags.metaPixelId = pixel;

  const scripts = $("script").toArray();
  const sources = scripts.map((script) => script.attribs.src ?? "");
  if (sources.some((src) => CONSENT_BANNER.test(src)) || scripts.some((script) => !script.attribs.src && CONSENT_BANNER.test(textOf(script, 20_000)))) tags.consentBanner = true;
  // Le code de mesure du studio : un script servi par `EXTERNAL_MEASURE_PATH`, avec sa clé publique
  if (sources.some((src) => src.includes(`${EXTERNAL_MEASURE_PATH}?k=`))) tags.measureSnippet = true;
  return tags;
}

const CMS_GENERATORS: readonly [RegExp, ExternalCms][] = [
  [/wordpress/i, "wordpress"],
  [/wix\.com/i, "wix"],
  [/squarespace/i, "squarespace"],
  [/jimdo/i, "jimdo"],
  [/webador|jouwweb/i, "webador"],
  [/webflow/i, "webflow"],
  [/google sites/i, "google_sites"],
  [/shopify/i, "shopify"],
];

/** Hôtes de fichiers et marques de fabrique propres à chaque outil. */
const CMS_ASSETS: readonly [RegExp, ExternalCms][] = [
  [/\/wp-(?:content|includes)\//i, "wordpress"],
  [/static\.wixstatic\.com|static\.parastorage\.com/i, "wix"],
  [/static1\.squarespace\.com|squarespace-cdn\.com|assets\.squarespace\.com|<!-- This is Squarespace\. -->/i, "squarespace"],
  [/jimstatic\.com|jimcdn\.com/i, "jimdo"],
  [/\.jwwb\.nl\//i, "webador"],
  [/website-files\.com|uploads-ssl\.webflow\.com|data-wf-site=/i, "webflow"],
  [/gstatic\.com\/_\/atari|ssl\.gstatic\.com\/atari/i, "google_sites"],
  [/cdn\.shopify\.com|Shopify\.theme/i, "shopify"],
];

/** Outil avec lequel le site est fait : balise `generator`, sinon hôtes de fichiers connus. */
export function detectCms($: CheerioAPI, html: string, pageUrl: string): ExternalCms | undefined {
  // Plusieurs balises « generator » coexistent souvent (l'outil, puis ses extensions)
  const generators = $("meta[name='generator' i]")
    .toArray()
    .map((meta) => meta.attribs.content ?? "");
  const declared = CMS_GENERATORS.find(([pattern]) => generators.some((generator) => pattern.test(generator)))?.[1];
  if (declared) return declared;
  try {
    if (new URL(pageUrl).hostname === "sites.google.com") return "google_sites";
  } catch {
    // Adresse illisible : on s'en tient au code de la page
  }
  return CMS_ASSETS.find(([pattern]) => pattern.test(html))?.[1];
}

/** Couleur CSS simple (#rgb, #rrggbb, #rrggbbaa, rgb()) → #rrggbb ; `undefined` sinon. */
export function normalizeColor(value: string | undefined): string | undefined {
  const raw = (value ?? "").trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(raw);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const long = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(raw);
  if (long) return `#${long[1]}`;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(raw);
  if (!rgb) return undefined;
  const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
  return channels.every((channel) => channel <= 255) ? `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}` : undefined;
}

function themeColor($: CheerioAPI): string | undefined {
  const metas = $("meta[name='theme-color' i]").toArray();
  // Plusieurs déclarations (clair, sombre) : celle sans condition, sinon la claire, sinon la première
  const preferred = metas.find((meta) => !meta.attribs.media) ?? metas.find((meta) => /light/i.test(meta.attribs.media ?? "")) ?? metas[0];
  return normalizeColor(preferred?.attribs.content);
}

// ─── Page, puis site ─────────────────────────────────────────────────────────

/** Faits d'une page : ce que son code déclare, en nombre borné (une page piégée ne fait pas travailler plus qu'une vraie). */
export function collectPageFacts($: CheerioAPI, html: string, pageUrl: string): PageFacts {
  const structured = readJsonLd($, pageUrl);
  const links = readLinks($, pageUrl);
  const description = cleanLineMax(metaContent($, "description", "og:description"), DESCRIPTION_MAX);
  const siteName = cleanLineMax(metaContent($, "og:site_name"), NAME_MAX);
  const language = documentLanguage($);
  const cms = detectCms($, html, pageUrl);
  const color = themeColor($);
  return {
    url: pageUrl,
    ...(description !== "" ? { description } : {}),
    ...(language ? { language } : {}),
    ...(siteName !== "" ? { siteName } : {}),
    ...(structured.websiteName ? { websiteName: structured.websiteName } : {}),
    entities: structured.entities,
    ...links,
    tags: detectTags($, html),
    ...(cms ? { cms } : {}),
    ...(color ? { themeColor: color } : {}),
  };
}

/** Valeurs classées par nombre de pages où elles figurent, puis par ordre de rencontre. */
function ranked<T>(perPage: readonly (readonly T[])[], keyOf: (value: T) => string): T[] {
  const stats = new Map<string, { value: T; pages: number; order: number }>();
  let order = 0;
  for (const values of perPage) {
    for (const value of unique(values, keyOf)) {
      const key = keyOf(value);
      const known = stats.get(key);
      if (known) known.pages += 1;
      else stats.set(key, { value, pages: 1, order: order++ });
    }
  }
  return [...stats.values()].sort((a, b) => b.pages - a.pages || a.order - b.order).map((entry) => entry.value);
}

/**
 * Faits du site à partir de ceux de ses pages (la page d'accueil en premier).
 * Les données structurées priment sur les liens ; entre plusieurs valeurs,
 * celle qui revient sur le plus de pages (le pied de page se répète) passe
 * devant. `homeTitle` : titre de la page d'accueil, dernier recours pour le nom.
 */
export function mergeSiteFacts(pages: readonly PageFacts[], homeTitle = ""): ExternalSiteFacts {
  const home = pages[0];
  const entities = pages.flatMap((page) => page.entities).sort((a, b) => a.rank - b.rank);
  const named = (rank: number): string | undefined => entities.find((entity) => entity.rank === rank && entity.name)?.name;
  const first = <K extends keyof PageFacts>(key: K): PageFacts[K] | undefined => pages.find((page) => page[key] !== undefined)?.[key];

  const name = named(0) ?? named(1) ?? first("siteName") ?? first("websiteName") ?? named(2) ?? (cleanLineMax(homeTitle, NAME_MAX) || undefined);
  const description = home?.description ?? entities.find((entity) => entity.description)?.description;
  const language = first("language");
  const address = entities.find((entity) => entity.address)?.address;
  const hours = entities.find((entity) => entity.hours.length > 0)?.hours ?? [];
  const logoUrl = entities.find((entity) => entity.logo)?.logo;

  // Coordonnées : celles des données structurées d'abord, puis celles des liens
  const structuredPhones = entities.flatMap((entity) => entity.phones);
  const structuredEmails = entities.flatMap((entity) => entity.emails);
  const phones = unique([...structuredPhones, ...ranked(pages.map((page) => page.phones), phoneDigits)], phoneDigits).slice(0, PHONES_MAX);
  const emails = unique([...structuredEmails, ...ranked(pages.map((page) => page.emails), (email) => email)], (email) => email).slice(0, EMAILS_MAX);

  // Liens déclarés (« sameAs », action de réservation) : profils sociaux et plateformes de rendez-vous
  const declared = entities.flatMap((entity) => entity.links);
  const declaredBooking = declared.flatMap((link): BookingLink[] => {
    const platform = bookingPlatformOf(link);
    const url = platform === null ? undefined : cleanBookingUrl(link);
    return url ? [{ url, platform }] : [];
  });
  const bookingKey = (link: BookingLink): string => {
    const url = new URL(link.url);
    return `${bareHost(url.hostname)}${url.pathname.replace(/\/+$/, "")}`;
  };
  const allBooking = ranked([declaredBooking, ...pages.map((page) => page.bookingLinks)], bookingKey);
  const bookingLinks = [...allBooking.filter((link) => link.platform !== null), ...allBooking.filter((link) => link.platform === null)].slice(0, BOOKING_LINKS_MAX);

  const declaredSocial = declared.map(socialProfileOf).filter((profile): profile is { network: SocialNetwork; url: string } => profile !== null);
  const social: SiteSocialLinks = {};
  for (const profile of [...declaredSocial, ...ranked(pages.map((page) => page.social), (item) => item.url.toLowerCase())]) {
    if (social[profile.network] === undefined) social[profile.network] = profile.url;
  }

  const tags: ExternalSiteTags = {};
  for (const page of pages) {
    tags.googleAnalyticsId ??= page.tags.googleAnalyticsId;
    tags.googleTagManagerId ??= page.tags.googleTagManagerId;
    tags.googleAdsId ??= page.tags.googleAdsId;
    tags.metaPixelId ??= page.tags.metaPixelId;
    if (page.tags.consentBanner) tags.consentBanner = true;
    if (page.tags.measureSnippet) tags.measureSnippet = true;
  }
  for (const key of Object.keys(tags) as (keyof ExternalSiteTags)[]) if (tags[key] === undefined) delete tags[key];

  const cms = home?.cms ?? ranked(pages.map((page) => (page.cms ? [page.cms] : [])), (value) => value)[0];
  const themeColorValue = first("themeColor");

  return {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(language ? { language } : {}),
    phones,
    emails,
    ...(address ? { address } : {}),
    hours,
    bookingLinks,
    social,
    tags,
    ...(cms ? { cms } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    ...(themeColorValue ? { themeColor: themeColorValue } : {}),
  };
}
