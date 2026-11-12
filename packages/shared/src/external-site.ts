/**
 * Site internet du client (« site de référence »). Un praticien qui a déjà
 * son site peut le déclarer dans le studio : le site est lu (pages publiques
 * seulement, poliment, en s'identifiant), un profil en est tiré, que le
 * praticien relit et corrige, puis les outils (réseaux sociaux, fiche Google,
 * Google Ads, Meta Ads, sujets du blog, liens, statistiques) s'appuient sur
 * ce site plutôt que sur le site hébergé.
 *
 * Module pur : types, limites, validation de l'adresse, nettoyage du profil,
 * conversion du profil en pages « comme un site hébergé » pour le brief
 * (`buildSocialBrief`), pages d'atterrissage et contrat du code de mesure.
 * La lecture du site vit dans `@theralys/providers` (`website/`),
 * l'extraction du profil dans `@theralys/ai`, le service dans `@theralys/jobs`.
 *
 * Deux endroits de stockage :
 * - `sites.theme.externalSite` (`ExternalSiteSetting`) : l'adresse et
 *   l'interrupteur « les outils s'appuient sur ce site » — lus partout où un
 *   site est déjà chargé, sans requête de plus ;
 * - la table `external_sites` : pages lues, faits relevés, profil extrait,
 *   corrections du praticien, clé du code de mesure.
 */

import type { ExternalSiteSetting, Section, SiteSocialLinks, SiteTheme } from "./content";
import { slugify } from "./slug";
import type { SocialBriefInput } from "./social-brief";

// ─── Réglage porté par le site ───────────────────────────────────────────────

type ThemeWithExternal = Pick<SiteTheme, "externalSite"> | null | undefined;

/** Site du client quand il est la référence des outils (réglage présent, actif, adresse valide), sinon `null`. */
export function activeExternalSite(theme: ThemeWithExternal): ExternalSiteSetting | null {
  const setting = theme?.externalSite;
  if (!setting || setting.active !== true) return null;
  return normalizeExternalSiteUrl(setting.url).ok ? setting : null;
}

/**
 * Adresse publique de référence d'un site : celle du site du client s'il est
 * la référence, sinon `hostedUrl` (adresse du site hébergé). Sans barre
 * oblique finale. C'est l'adresse donnée aux outils (liens de bio, légendes,
 * pages d'atterrissage, boutons des posts Google) ; l'éditeur, l'aperçu et
 * les balises du site hébergé gardent l'adresse hébergée.
 */
export function referenceSiteUrl(hostedUrl: string, theme: ThemeWithExternal): string {
  const external = activeExternalSite(theme);
  return (external ? external.url : hostedUrl).replace(/\/+$/, "");
}

/**
 * Le site hébergé est-il masqué des moteurs de recherche ? Oui tant que le
 * site du client est la référence (deux sites pour un même cabinet se
 * concurrencent), sauf si le praticien a demandé à le garder visible.
 */
export function isHostedSiteHidden(theme: ThemeWithExternal): boolean {
  const external = activeExternalSite(theme);
  return external !== null && external.keepHostedIndexed !== true;
}

// ─── Adresse du site ─────────────────────────────────────────────────────────

/** Longueur maximale de l'adresse normalisée. */
export const EXTERNAL_URL_MAX = 200;

export const EXTERNAL_URL_ERRORS = {
  empty: "Indiquez l'adresse de votre site, par exemple www.mon-cabinet.fr.",
  invalid: "Cette adresse n'est pas reconnue. Exemple : www.mon-cabinet.fr.",
  scheme: "L'adresse doit commencer par https://.",
  host: "Indiquez l'adresse publique de votre site, par exemple www.mon-cabinet.fr.",
  credentials: "L'adresse ne doit contenir ni identifiant ni mot de passe.",
  port: "L'adresse ne doit pas contenir de numéro de port.",
  too_long: "Cette adresse est trop longue : indiquez seulement la page d'accueil de votre site.",
  own: "Cette adresse est celle du site déjà inclus dans votre formule. Indiquez l'adresse de votre propre site.",
  social: "Cette adresse est celle d'un réseau social. Indiquez l'adresse de votre site internet.",
  directory:
    "Cette adresse est celle d'une plateforme de rendez-vous ou d'un annuaire. Indiquez l'adresse de votre propre site internet ; votre lien de rendez-vous se règle à part.",
} as const;
export type ExternalUrlError = keyof typeof EXTERNAL_URL_ERRORS;

export type ExternalUrlCheck =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: ExternalUrlError; message: string };

/** Réseaux sociaux et services Google : ce ne sont pas des sites de praticien. */
const SOCIAL_HOSTS = [
  "facebook.com",
  "fb.com",
  "fb.me",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
  "pinterest.com",
  "pinterest.fr",
  "snapchat.com",
  "threads.net",
  "wa.me",
  "whatsapp.com",
  "t.me",
  "linktr.ee",
  "google.com",
  "google.fr",
  "g.page",
  "goo.gl",
];
/**
 * Sous-domaines de ces hôtes qui hébergent de vrais sites. Ce sont des hôtes
 * partagés : des sites sans rapport y vivent chacun sous son propre chemin
 * (« sites.google.com/view/<nom> »), l'hôte seul n'y désigne donc pas un site
 * (cf. `sharedHostSitePath`).
 */
const SOCIAL_HOST_EXCEPTIONS = ["sites.google.com"];

/**
 * Dossier d'un site hébergé sur un hôte partagé (« /view/cabinet-dupont ») ;
 * chaîne vide pour un site qui a son propre hôte, ou une adresse illisible.
 * Sert à vérifier qu'une visite mesurée vient bien d'une page de ce site, et
 * non d'un autre site du même hôte.
 */
export function sharedHostSitePath(siteUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(siteUrl);
  } catch {
    return "";
  }
  if (!SOCIAL_HOST_EXCEPTIONS.includes(parsed.hostname.toLowerCase())) return "";
  const segments = parsed.pathname.split("/").filter((segment) => segment !== "");
  // « /view/<nom> », « /site/<nom> », « /<domaine>/<nom> » ; « /a/<domaine>/<nom> » pour les anciens sites d'organisation
  const depth = segments[0] === "a" ? 3 : 2;
  return segments.length < depth ? "" : `/${segments.slice(0, depth).join("/")}`;
}

/** Le chemin d'une page est-il celui du site, ou d'une de ses pages ? `sitePath` vide : tout chemin convient. */
export function isUnderSitePath(path: string, sitePath: string): boolean {
  return sitePath === "" || path === sitePath || path.startsWith(`${sitePath}/`);
}

// Page d'accueil désignée par son nom (« /accueil », « /fr/index.php ») : c'est le dossier qui la contient qui est le site
const HOME_PAGE_SEGMENT = /^(?:index|default|home|accueil|bienvenue|welcome)(?:\.(?:html?|php|aspx?|jsp))?$/i;

/** Hôtes réservés ou locaux : jamais un site public. */
const RESERVED_SUFFIXES = [".local", ".localhost", ".internal", ".intranet", ".lan", ".home", ".corp", ".test", ".example", ".invalid", ".onion", ".arpa"];

const HOST_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

const failUrl = (reason: ExternalUrlError): ExternalUrlCheck => ({ ok: false, reason, message: EXTERNAL_URL_ERRORS[reason] });

const hostMatches = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`);

/** Hôte sans « www. » : `www.mon-cabinet.fr` et `mon-cabinet.fr` désignent le même site. */
export function bareHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

/** Hôtes d'un même site : avec et sans « www. ». */
export function externalHosts(url: string): string[] {
  try {
    const bare = bareHost(new URL(url).hostname);
    return [bare, `www.${bare}`];
  } catch {
    return [];
  }
}

/** Deux adresses désignent-elles le même site (même hôte, « www. » ignoré) ? */
export function isSameSiteHost(a: string, b: string): boolean {
  try {
    return bareHost(new URL(a).hostname) === bareHost(new URL(b).hostname);
  } catch {
    return false;
  }
}

/**
 * Adresse de site saisie par le praticien → adresse normalisée
 * (`https://hôte[/chemin]`, sans paramètre ni ancre ni barre finale, sans le
 * nom d'une page d'accueil en fin de chemin) ou motif de refus avec son
 * message. Refusés : autre protocole que le web,
 * identifiants, port, adresse IP, hôte local ou réservé, réseau social,
 * plateforme de rendez-vous ou annuaire, et les hôtes de `ownHosts` (le site
 * hébergé lui-même). Contrôle de forme seulement : la joignabilité et la
 * protection contre les adresses internes relèvent du lecteur.
 */
export function normalizeExternalSiteUrl(input: string | null | undefined, opts: { ownHosts?: readonly string[] } = {}): ExternalUrlCheck {
  const raw = (input ?? "").trim();
  if (raw === "") return failUrl("empty");
  if (raw.length > 500 || /\s/.test(raw)) return failUrl("invalid");
  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) return failUrl("scheme");
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return failUrl("invalid");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return failUrl("scheme");
  if (parsed.username !== "" || parsed.password !== "") return failUrl("credentials");
  if (parsed.port !== "") return failUrl("port");

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const labels = host.split(".");
  const tld = labels[labels.length - 1] ?? "";
  const validHost =
    host.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => HOST_LABEL.test(label)) &&
    // Le dernier libellé d'un nom de domaine n'est jamais numérique : une adresse IP est refusée ici
    (/^[a-z]{2,24}$/.test(tld) || /^xn--[a-z0-9-]{2,59}$/.test(tld));
  if (!validHost || host === "localhost" || RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return failUrl("host");

  const bare = bareHost(host);
  for (const own of opts.ownHosts ?? []) {
    const ownBare = bareHost(own.trim());
    if (ownBare !== "" && hostMatches(bare, ownBare)) return failUrl("own");
  }
  if (!SOCIAL_HOST_EXCEPTIONS.includes(host) && SOCIAL_HOSTS.some((domain) => hostMatches(bare, domain))) return failUrl("social");
  if (bookingPlatformOf(`https://${host}/`) !== null || DIRECTORY_HOSTS.some((domain) => hostMatches(bare, domain))) return failUrl("directory");

  let path = parsed.pathname.replace(/\/+$/, "");
  // Adresse copiée depuis la page d'accueil (« /accueil », « /fr/index.php ») : le site est le dossier qui la
  // contient — gardée telle quelle, elle réduirait la lecture, les liens et les pages d'atterrissage à cette seule page
  const lastSlash = path.lastIndexOf("/");
  if (HOME_PAGE_SEGMENT.test(path.slice(lastSlash + 1))) path = path.slice(0, lastSlash);
  const url = `https://${host}${path}`;
  if (url.length > EXTERNAL_URL_MAX) return failUrl("too_long");
  // Hôte partagé donné sans le dossier du site : ce n'est l'adresse d'aucun site
  if (SOCIAL_HOST_EXCEPTIONS.includes(host) && sharedHostSitePath(url) === "") return failUrl("invalid");
  return { ok: true, url, host };
}

// ─── Plateformes de rendez-vous ──────────────────────────────────────────────

/** Plateformes de prise de rendez-vous courantes chez les praticiens : un lien vers l'une d'elles compte comme un clic de rendez-vous. */
export const BOOKING_PLATFORMS = [
  { id: "doctolib", label: "Doctolib", hosts: ["doctolib.fr"] },
  { id: "resalib", label: "Resalib", hosts: ["resalib.fr"] },
  { id: "medoucine", label: "Médoucine", hosts: ["medoucine.com"] },
  { id: "calendly", label: "Calendly", hosts: ["calendly.com"] },
  { id: "calcom", label: "Cal.com", hosts: ["cal.com"] },
  { id: "planity", label: "Planity", hosts: ["planity.com"] },
  { id: "clicrdv", label: "ClicRDV", hosts: ["clicrdv.com"] },
  { id: "crenolib", label: "Crenolib", hosts: ["crenolib.fr"] },
  { id: "perfactive", label: "Perfactive", hosts: ["perfactive.fr"] },
  { id: "simplybook", label: "SimplyBook", hosts: ["simplybook.me", "simplybook.it"] },
  { id: "maiia", label: "Maiia", hosts: ["maiia.com"] },
  { id: "keldoc", label: "KelDoc", hosts: ["keldoc.com"] },
  { id: "agenda_ch", label: "Agenda.ch", hosts: ["agenda.ch"] },
] as const satisfies readonly { id: string; label: string; hosts: readonly string[] }[];
export type BookingPlatformId = (typeof BOOKING_PLATFORMS)[number]["id"];

/** Hôtes de toutes les plateformes de rendez-vous connues (pour le code de mesure). */
export const BOOKING_PLATFORM_HOSTS: readonly string[] = BOOKING_PLATFORMS.flatMap((platform) => [...platform.hosts]);

/** Annuaires de praticiens : une fiche d'annuaire n'est pas un site. */
const DIRECTORY_HOSTS = ["pagesjaunes.fr", "therapeutes.com", "psychologue.net", "annuaire-therapeutes.com", "mondocteur.fr"];

/** Plateforme de rendez-vous d'un lien, ou `null`. */
export function bookingPlatformOf(url: string | null | undefined): BookingPlatformId | null {
  if (!url) return null;
  let host: string;
  try {
    host = bareHost(new URL(url).hostname);
  } catch {
    return null;
  }
  for (const platform of BOOKING_PLATFORMS) {
    if (platform.hosts.some((domain) => hostMatches(host, domain))) return platform.id;
  }
  return null;
}

export function bookingPlatformLabel(id: BookingPlatformId): string {
  return BOOKING_PLATFORMS.find((platform) => platform.id === id)?.label ?? id;
}

// ─── Lecture du site ─────────────────────────────────────────────────────────

/** Nom sous lequel le lecteur se présente (User-Agent et règles robots.txt). */
export const EXTERNAL_BOT_NAME = "HarmonyBot";

export const EXTERNAL_SITE_LIMITS = {
  /** Pages lues au plus par lecture */
  maxPages: 12,
  /** Texte gardé par page (caractères) */
  pageChars: 6_000,
  /** Texte minimal, toutes pages confondues, pour tenter un profil */
  minChars: 400,
  /** Lectures lancées par le praticien, par site et par mois */
  readsPerMonth: 6,
  /** Texte collé à la main quand le site refuse la lecture : bornes */
  pastedMinChars: 300,
  pastedMaxChars: 30_000,
  /** Au-delà, une lecture « en cours » est tenue pour interrompue */
  readStaleMs: 6 * 60_000,
  /** Âge au-delà duquel un site connecté est relu automatiquement (jours) */
  refreshDays: 30,
} as const;

/** `kind` du registre des quotas (`google_usage`) pour une lecture lancée par le praticien. */
export const EXTERNAL_READ_USAGE_KIND = "site_read";

export const EXTERNAL_SITE_STATUSES = ["reading", "ready", "error"] as const;
export type ExternalSiteStatus = (typeof EXTERNAL_SITE_STATUSES)[number];

/** Origine du contenu : pages lues sur le site, ou texte collé par le praticien. */
export type ExternalSiteSource = "crawl" | "pasted";

/** Échecs de lecture, avec le message montré au praticien (ce qui se passe, puis quoi faire). */
export const EXTERNAL_READ_ERRORS = {
  unreachable: {
    title: "Votre site ne répond pas à cette adresse",
    hint: "Vérifiez l'adresse (avec ou sans « www »), puis relancez la lecture.",
  },
  timeout: {
    title: "Votre site met trop de temps à répondre",
    hint: "Réessayez dans quelques minutes.",
  },
  blocked: {
    title: "Votre site refuse la lecture automatique",
    hint: "Sa protection anti-robots bloque notre lecteur, et nous ne la contournons pas. Vous pouvez coller le texte de vos pages : le résultat sera le même.",
  },
  robots: {
    title: "Votre site demande aux robots de ne pas le lire",
    hint: `Son fichier robots.txt l'interdit, et nous le respectons. Collez le texte de vos pages, ou autorisez « ${EXTERNAL_BOT_NAME} » dans ce fichier.`,
  },
  not_html: {
    title: "Cette adresse ne mène pas à une page web",
    hint: "Indiquez l'adresse de la page d'accueil de votre site.",
  },
  empty: {
    title: "Nous n'avons pas trouvé assez de texte sur votre site",
    hint: "Ses pages sont très courtes, ou ne s'affichent qu'avec un navigateur. Collez le texte de vos pages : le résultat sera le même.",
  },
  redirect: {
    title: "Cette adresse renvoie vers un autre site",
    hint: "Indiquez directement l'adresse finale de votre site.",
  },
  unsafe: {
    title: "Cette adresse ne peut pas être lue",
    hint: "Indiquez l'adresse publique de votre site, par exemple www.mon-cabinet.fr.",
  },
  too_large: {
    title: "Les pages de votre site sont trop lourdes pour être lues",
    hint: "Collez le texte de vos pages : le résultat sera le même.",
  },
  quota: {
    title: "Vous avez atteint le nombre de lectures de ce mois",
    hint: "La prochaine lecture sera possible le mois prochain. Vos corrections restent modifiables.",
  },
  internal: {
    title: "La lecture n'a pas abouti",
    hint: "Réessayez dans quelques minutes.",
  },
} as const satisfies Record<string, { title: string; hint: string }>;
export type ExternalReadError = keyof typeof EXTERNAL_READ_ERRORS;

export function isExternalReadError(value: unknown): value is ExternalReadError {
  return typeof value === "string" && Object.hasOwn(EXTERNAL_READ_ERRORS, value);
}

/** Les échecs pour lesquels coller le texte des pages est la bonne suite. */
export const EXTERNAL_PASTE_FALLBACK_ERRORS: readonly ExternalReadError[] = ["blocked", "robots", "empty", "too_large"];

export const EXTERNAL_PAGE_KINDS = ["home", "about", "specialty", "services", "pricing", "contact", "booking", "faq", "blog", "article", "legal", "other"] as const;
export type ExternalPageKind = (typeof EXTERNAL_PAGE_KINDS)[number];

/** Une page lue : texte principal nettoyé et borné, jamais de HTML. */
export type ExternalSitePage = {
  /** Adresse absolue, sans ancre */
  url: string;
  kind: ExternalPageKind;
  title: string;
  description?: string;
  /** Titres de la page (h1 à h3), dans l'ordre */
  headings: string[];
  /** Texte principal (≤ EXTERNAL_SITE_LIMITS.pageChars) */
  text: string;
  /** Empreinte SHA-256 du texte (détection de changement) */
  hash: string;
  /** Date de lecture, ISO */
  fetchedAt: string;
  etag?: string;
  lastModified?: string;
};

/** Balises et outils repérés dans le code des pages (aucun n'est lu ni exécuté). */
export type ExternalSiteTags = {
  /** Google Analytics 4, ex. G-XXXXXXXXXX */
  googleAnalyticsId?: string;
  /** Google Tag Manager, ex. GTM-XXXXXXX */
  googleTagManagerId?: string;
  /** Google Ads, ex. AW-1234567890 */
  googleAdsId?: string;
  /** Pixel Meta (identifiant numérique) */
  metaPixelId?: string;
  /** Un bandeau de consentement connu est présent */
  consentBanner?: boolean;
  /** Le code de mesure du studio est installé */
  measureSnippet?: boolean;
};

export const EXTERNAL_CMS = ["wordpress", "wix", "squarespace", "jimdo", "webador", "webflow", "google_sites", "shopify"] as const;
export type ExternalCms = (typeof EXTERNAL_CMS)[number];

export const EXTERNAL_CMS_LABELS: Record<ExternalCms, string> = {
  wordpress: "WordPress",
  wix: "Wix",
  squarespace: "Squarespace",
  jimdo: "Jimdo",
  webador: "Webador",
  webflow: "Webflow",
  google_sites: "Google Sites",
  shopify: "Shopify",
};

/** Faits relevés sans IA dans le code des pages (données structurées, liens, balises). */
export type ExternalSiteFacts = {
  /** Nom du site (og:site_name, données structurées, sinon titre de l'accueil) */
  name?: string;
  description?: string;
  language?: string;
  phones: string[];
  emails: string[];
  /** Adresse postale (données structurées) */
  address?: string;
  hours: { label: string; value: string }[];
  bookingLinks: { url: string; platform: BookingPlatformId | null }[];
  social: SiteSocialLinks;
  tags: ExternalSiteTags;
  cms?: ExternalCms;
  logoUrl?: string;
  /** Couleur déclarée par le site (meta theme-color), #rrggbb */
  themeColor?: string;
};

export const EMPTY_EXTERNAL_FACTS: ExternalSiteFacts = { phones: [], emails: [], hours: [], bookingLinks: [], social: {}, tags: {} };

/** Issue d'une lecture du site par `WebsiteReader` (`@theralys/providers`). */
export type ExternalReadOutcome =
  | {
      ok: true;
      /** Adresse d'accueil réellement servie (après redirection vers « www » ou le même site) */
      url: string;
      pages: ExternalSitePage[];
      facts: ExternalSiteFacts;
      /** Pages écartées : interdites par robots.txt, en échec */
      skipped: { robots: number; failed: number };
    }
  | { ok: false; error: ExternalReadError; detail?: string };

// ─── Profil du site ──────────────────────────────────────────────────────────

export const EXTERNAL_PROFILE_LIMITS = {
  headline: 140,
  introParagraphs: 2,
  paragraph: 420,
  highlights: 4,
  specialties: 8,
  specialtyTitle: 70,
  specialtyExcerpt: 240,
  specialtySummary: 320,
  specialtyHeadings: 6,
  specialtyFaq: 3,
  aboutParagraphs: 3,
  credentials: 6,
  practical: 4,
  process: 4,
  faq: 7,
  hours: 7,
  shortText: 160,
  answer: 260,
} as const;

export type ExternalSpecialty = {
  /** Identifiant stable dérivé du titre, unique dans le profil */
  slug: string;
  title: string;
  /** Une ou deux phrases */
  excerpt: string;
  /** Page du site consacrée à cette spécialité (même site), si elle existe */
  url?: string;
  /** Résumé de cette page */
  summary?: string;
  /** Intertitres de cette page */
  headings: string[];
  faq: { question: string; answer: string }[];
};

/**
 * Ce que le studio a compris du site du client. Même matière que le contenu
 * d'un site hébergé (accueil, spécialités, à propos, infos pratiques,
 * déroulement, questions, contact) : `externalBriefPages` le convertit en
 * pages pour le brief.
 */
export type ExternalSiteProfile = {
  /** Phrase d'accroche du site */
  headline: string;
  /** Présentation de l'activité */
  intro: string[];
  highlights: { title: string; text?: string }[];
  specialties: ExternalSpecialty[];
  about: { paragraphs: string[]; credentials: string[] };
  /** Infos pratiques : durée d'une séance, tarifs, remboursement… */
  practical: { title: string; text: string }[];
  /** Déroulement d'une séance */
  process: { title: string; description: string }[];
  faq: { question: string; answer: string }[];
  contact: { address?: string; phone?: string; email?: string; hours: { label: string; value: string }[]; note?: string };
  /** Lien de prise de rendez-vous trouvé sur le site */
  bookingUrl?: string;
  social: SiteSocialLinks;
};

export const EMPTY_EXTERNAL_PROFILE: ExternalSiteProfile = {
  headline: "",
  intro: [],
  highlights: [],
  specialties: [],
  about: { paragraphs: [], credentials: [] },
  practical: [],
  process: [],
  faq: [],
  contact: { hours: [] },
  social: {},
};

/**
 * Corrections du praticien : chaque rubrique présente remplace celle du
 * profil extrait (pour `contact`, champ par champ). Une nouvelle lecture du
 * site ne les écrase jamais.
 */
export type ExternalProfileOverrides = Partial<Omit<ExternalSiteProfile, "contact">> & { contact?: Partial<ExternalSiteProfile["contact"]> };

/*
 * Caractères qu'un lecteur ne voit pas, retirés de tout texte venu d'un site
 * tiers ou du modèle : contrôles, largeur nulle, marques de sens d'écriture,
 * césure conditionnelle, sélecteurs de variante, « étiquettes » Unicode (elles
 * servent à dissimuler des consignes dans un texte d'apparence anodine). Même
 * liste que le lecteur de sites ; plages écrites par leurs codes, pour
 * qu'aucun caractère invisible ne figure dans ce fichier.
 */
const INVISIBLE_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x0008], // contrôles C0 (hors tabulation et sauts de ligne)
  [0x000b, 0x000c],
  [0x000e, 0x001f],
  [0x007f, 0x009f], // DEL et contrôles C1
  [0x00ad, 0x00ad], // césure conditionnelle
  [0x034f, 0x034f], // liant de graphèmes
  [0x061c, 0x061c], // marque de sens d'écriture arabe
  [0x180e, 0x180e], // séparateur mongol
  [0x200b, 0x200f], // largeur nulle, marques gauche-droite
  [0x2028, 0x202e], // séparateurs de ligne Unicode, changements de sens d'écriture
  [0x2060, 0x206f], // liant de mots, opérateurs invisibles, isolats
  [0xd800, 0xdfff], // demi-codets isolés (avec le drapeau « u », une paire complète n'est pas concernée) : la base les refuse
  [0xfe00, 0xfe0f], // sélecteurs de variante
  [0xfeff, 0xfeff], // marque d'ordre des octets
  [0xfff9, 0xfffc], // annotations interlinéaires, objet de remplacement
  [0xe0000, 0xe007f], // étiquettes Unicode
  [0xe0100, 0xe01ef], // sélecteurs de variante supplémentaires
];
const codePointEscape = (code: number): string => `\\u{${code.toString(16)}}`;
const INVISIBLE_CHARS = new RegExp(`[${INVISIBLE_RANGES.map(([from, to]) => (from === to ? codePointEscape(from) : `${codePointEscape(from)}-${codePointEscape(to)}`)).join("")}]`, "gu");

// Texte libre venu d'un site tiers : une ligne (ou un paragraphe), sans balise ni caractère de contrôle
function cleanText(value: unknown, max: number, opts: { multiline?: boolean } = {}): string {
  if (typeof value !== "string") return "";
  // Seul ce qui a la forme d'une balise est retiré (« < » suivi d'une lettre, de « / » ou de « ! ») : dans
  // « Enfant (<12 ans) : 40 €, adulte (>12 ans) : 60 € », rien ne doit disparaître. Les chevrons restants
  // deviennent ‹ › : aucune balise ne peut s'écrire dans un texte du profil.
  let text = value
    .replace(INVISIBLE_CHARS, "")
    .replace(/<[a-z/!][^<>]{0,200}>/gi, " ")
    .replace(/</g, "‹")
    .replace(/>/g, "›");
  // Plusieurs lignes : chacune nettoyée, les lignes vides retirées (ligne par ligne : une expression qui chercherait
  // les sauts de ligne au milieu des espaces passerait un temps quadratique sur une longue suite d'espaces)
  text = opts.multiline
    ? text
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter((line) => line !== "")
        .join("\n")
    : text.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  let kept = (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–—-]+$/, "");
  // Les points de suspension comptent dans la borne (un mot plus long que la borne ne se coupe sur aucune espace)
  if (kept.length >= max) kept = kept.slice(0, Math.max(0, max - 1));
  // Jamais de demi-paire de substitution en fin de coupe (emoji coupé en deux) : la base refuserait le texte
  const last = kept.charCodeAt(kept.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) kept = kept.slice(0, -1);
  return `${kept}…`;
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

function cleanTexts(value: unknown, max: number, count: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list(value)) {
    const text = cleanText(item, max);
    const key = text.toLowerCase();
    if (text === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= count) break;
  }
  return out;
}

function cleanPairs<K1 extends string, K2 extends string>(value: unknown, first: K1, second: K2, max1: number, max2: number, count: number, secondRequired: boolean): ({ [P in K1]: string } & { [P in K2]: string })[] {
  const out: ({ [P in K1]: string } & { [P in K2]: string })[] = [];
  for (const item of list(value)) {
    const row = record(item);
    const a = cleanText(row[first], max1);
    const b = cleanText(row[second], max2);
    if (a === "" || (secondRequired && b === "")) continue;
    out.push({ [first]: a, [second]: b } as { [P in K1]: string } & { [P in K2]: string });
    if (out.length >= count) break;
  }
  return out;
}

/** Adresse web absolue (https, ou http converti), sans ancre, bornée ; sinon `undefined`. */
function cleanHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 500) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
  if (parsed.username !== "" || parsed.password !== "") return undefined;
  parsed.protocol = "https:";
  parsed.hash = "";
  const url = parsed.toString();
  return url.length <= 400 ? url : undefined;
}

/** Lien de rendez-vous : adresse web, ou numéro en `tel:`. */
export function cleanBookingUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (/^tel:/i.test(trimmed)) {
    const number = trimmed.slice(4).replace(/[^\d+]/g, "");
    return /^\+?\d{6,15}$/.test(number) ? `tel:${number}` : undefined;
  }
  return cleanHttpUrl(trimmed);
}

/** Numéro de téléphone tel qu'affiché (chiffres, espaces, points, « + ») ; sinon `undefined`. */
export function cleanPhone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const phone = value.replace(/[^\d+ .()-]/g, "").replace(/\s+/g, " ").trim();
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15 && phone.length <= 24 ? phone : undefined;
}

function cleanEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const email = value.trim().toLowerCase();
  return email.length <= 120 && /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email) ? email : undefined;
}

const SOCIAL_NETWORK_HOSTS: Record<keyof SiteSocialLinks, readonly string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  linkedin: ["linkedin.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
};

/** Liens de réseaux sociaux : https, sur l'hôte du réseau attendu, page de profil (pas un bouton de partage). */
export function cleanSocialLinks(value: unknown): SiteSocialLinks {
  const row = record(value);
  const out: SiteSocialLinks = {};
  for (const network of Object.keys(SOCIAL_NETWORK_HOSTS) as (keyof SiteSocialLinks)[]) {
    const url = cleanHttpUrl(row[network]);
    if (!url) continue;
    const parsed = new URL(url);
    const host = bareHost(parsed.hostname);
    if (!SOCIAL_NETWORK_HOSTS[network].some((domain) => hostMatches(host, domain))) continue;
    if (parsed.pathname === "/" || /\/(sharer|share|intent|dialog|plugins)\b/i.test(parsed.pathname)) continue;
    out[network] = url;
  }
  return out;
}

/**
 * Profil nettoyé à partir d'une valeur quelconque (sortie du modèle, texte
 * saisi) : textes sur une ligne, sans balise, bornés ; listes bornées et
 * dédoublonnées ; identifiants de spécialité dérivés du titre et uniques ;
 * pages de spécialité gardées seulement si elles sont sur le site du client.
 * Ne lève jamais : une valeur inexploitable donne un profil vide.
 */
export function cleanExternalProfile(raw: unknown, siteUrl: string): ExternalSiteProfile {
  const L = EXTERNAL_PROFILE_LIMITS;
  const input = record(raw);
  const about = record(input.about);
  const contact = record(input.contact);

  const slugs = new Set<string>();
  const specialties: ExternalSpecialty[] = [];
  for (const item of list(input.specialties)) {
    const row = record(item);
    const title = cleanText(row.title, L.specialtyTitle);
    if (title === "") continue;
    const base = slugify(typeof row.slug === "string" && row.slug.trim() !== "" ? row.slug : title).slice(0, 60).replace(/-+$/, "") || "specialite";
    let slug = base;
    for (let i = 2; slugs.has(slug); i++) slug = `${base}-${i}`;
    slugs.add(slug);
    const pageUrl = cleanHttpUrl(row.url);
    const summary = cleanText(row.summary, L.specialtySummary);
    specialties.push({
      slug,
      title,
      excerpt: cleanText(row.excerpt, L.specialtyExcerpt),
      ...(pageUrl && isSameSiteHost(pageUrl, siteUrl) ? { url: pageUrl } : {}),
      ...(summary !== "" ? { summary } : {}),
      headings: cleanTexts(row.headings, 90, L.specialtyHeadings),
      faq: cleanPairs(row.faq, "question", "answer", L.shortText, L.answer, L.specialtyFaq, true),
    });
    if (specialties.length >= L.specialties) break;
  }

  const address = cleanText(contact.address, L.shortText);
  const note = cleanText(contact.note, L.shortText);
  const phone = cleanPhone(contact.phone);
  const email = cleanEmail(contact.email);
  const bookingUrl = cleanBookingUrl(input.bookingUrl);

  return {
    headline: cleanText(input.headline, L.headline),
    intro: cleanTexts(input.intro, L.paragraph, L.introParagraphs),
    highlights: cleanPairs(input.highlights, "title", "text", 60, L.shortText, L.highlights, false).map((it) => (it.text === "" ? { title: it.title } : it)),
    specialties,
    about: {
      paragraphs: cleanTexts(about.paragraphs, L.paragraph, L.aboutParagraphs),
      credentials: cleanTexts(about.credentials, 120, L.credentials),
    },
    practical: cleanPairs(input.practical, "title", "text", 60, L.shortText, L.practical, true),
    process: cleanPairs(input.process, "title", "description", 60, L.shortText, L.process, true),
    faq: cleanPairs(input.faq, "question", "answer", L.shortText, L.answer, L.faq, true),
    contact: {
      ...(address !== "" ? { address } : {}),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      hours: cleanPairs(contact.hours, "label", "value", 40, 80, L.hours, true),
      ...(note !== "" ? { note } : {}),
    },
    ...(bookingUrl ? { bookingUrl } : {}),
    social: cleanSocialLinks(input.social),
  };
}

/** Corrections nettoyées : seules les rubriques réellement fournies sont gardées. */
export function cleanExternalOverrides(raw: unknown, siteUrl: string): ExternalProfileOverrides {
  const input = record(raw);
  const cleaned = cleanExternalProfile(input, siteUrl);
  const out: ExternalProfileOverrides = {};
  const keys = ["headline", "intro", "highlights", "specialties", "about", "practical", "process", "faq", "social"] as const;
  for (const key of keys) {
    if (Object.hasOwn(input, key)) Object.assign(out, { [key]: cleaned[key] });
  }
  if (Object.hasOwn(input, "bookingUrl")) out.bookingUrl = cleaned.bookingUrl ?? "";
  if (Object.hasOwn(input, "contact")) {
    const given = record(input.contact);
    const contact: Partial<ExternalSiteProfile["contact"]> = {};
    // Un champ vidé par le praticien reste vide : la valeur lue sur le site ne revient pas
    if (Object.hasOwn(given, "address")) contact.address = cleaned.contact.address ?? "";
    if (Object.hasOwn(given, "phone")) contact.phone = cleaned.contact.phone ?? "";
    if (Object.hasOwn(given, "email")) contact.email = cleaned.contact.email ?? "";
    if (Object.hasOwn(given, "note")) contact.note = cleaned.contact.note ?? "";
    if (Object.hasOwn(given, "hours")) contact.hours = cleaned.contact.hours;
    out.contact = contact;
  }
  return out;
}

/** Profil effectif : ce qui a été lu sur le site, corrigé par le praticien. */
export function mergeExternalProfile(extracted: ExternalSiteProfile | null | undefined, overrides: ExternalProfileOverrides | null | undefined): ExternalSiteProfile {
  const base = extracted ?? EMPTY_EXTERNAL_PROFILE;
  if (!overrides) return base;
  const { contact: contactOverrides, bookingUrl, ...rest } = overrides;
  const contact = { ...base.contact, ...(contactOverrides ?? {}) };
  for (const key of ["address", "phone", "email", "note"] as const) {
    if (contact[key] === "") delete contact[key];
  }
  const merged: ExternalSiteProfile = { ...base, ...rest, contact: { ...contact, hours: contact.hours ?? [] } };
  if (bookingUrl !== undefined) {
    if (bookingUrl === "") delete merged.bookingUrl;
    else merged.bookingUrl = bookingUrl;
  }
  return merged;
}

/** Le profil suffit-il pour que les outils s'appuient dessus ? Il faut une présentation et au moins une spécialité. */
export function isExternalProfileUsable(profile: ExternalSiteProfile | null | undefined): boolean {
  if (!profile) return false;
  const hasPresentation = profile.headline !== "" || profile.intro.length > 0 || profile.about.paragraphs.length > 0;
  return hasPresentation && profile.specialties.length > 0;
}

/** Ce qui manque au profil pour être utilisable, dit au praticien. */
export function externalProfileGaps(profile: ExternalSiteProfile | null | undefined): string[] {
  const gaps: string[] = [];
  if (!profile || (profile.headline === "" && profile.intro.length === 0 && profile.about.paragraphs.length === 0)) gaps.push("une présentation de votre activité");
  if (!profile || profile.specialties.length === 0) gaps.push("au moins une spécialité");
  return gaps;
}

// ─── Du profil aux outils ────────────────────────────────────────────────────

/** Spécialités du site du client, comme les pages de spécialité d'un site hébergé (sujets du blog, groupes d'annonces). */
export function externalSpecialties(profile: ExternalSiteProfile): { slug: string; title: string }[] {
  return profile.specialties.map((specialty) => ({ slug: specialty.slug, title: specialty.title }));
}

/** Identifiant de la pseudo-page d'une spécialité dans le brief. */
export const externalPageId = (slug: string): string => `ext-${slug}`;

/**
 * Le profil sous forme de pages d'un site hébergé (accueil + une page par
 * spécialité), pour `buildSocialBrief` : mêmes sections typées, mêmes
 * plafonds, mêmes références. `siteUrl` : adresse du site du client, donnée
 * comme source aux spécialités qui n'y ont pas de page. `images` : photos
 * déjà admises par le studio (banque d'images, photos téléversées) à garder
 * dans le catalogue du brief — les images du site du client ne sont pas
 * reprises.
 */
export function externalBriefPages(profile: ExternalSiteProfile, opts: { siteUrl?: string; images?: { hero?: string | null; about?: string | null } } = {}): SocialBriefInput["pages"] {
  const sections: Section[] = [];
  if (profile.headline !== "" || profile.intro.length > 0) {
    sections.push({
      type: "hero",
      title: profile.headline !== "" ? profile.headline : (profile.intro[0] ?? ""),
      paragraphs: profile.headline !== "" ? profile.intro : profile.intro.slice(1),
      ...(opts.images?.hero ? { imageUrl: opts.images.hero } : {}),
    });
  }
  if (profile.highlights.length > 0) sections.push({ type: "highlights", items: profile.highlights });
  if (profile.specialties.length > 0) {
    sections.push({
      type: "specialties",
      title: "Spécialités",
      items: profile.specialties.map((specialty) => ({ slug: specialty.slug, title: specialty.title, excerpt: specialty.excerpt || specialty.summary || "" })),
    });
  }
  if (profile.about.paragraphs.length > 0 || profile.about.credentials.length > 0 || profile.practical.length > 0) {
    sections.push({
      type: "about",
      title: "À propos",
      // Les diplômes et formations sont reconnus par le brief aux lignes « - »
      paragraphs: [...profile.about.paragraphs, ...(profile.about.credentials.length > 0 ? [profile.about.credentials.map((line) => `- ${line}`).join("\n")] : [])],
      infoCards: profile.practical,
      ...(opts.images?.about ? { imageUrl: opts.images.about } : {}),
    });
  }
  if (profile.process.length > 0) sections.push({ type: "process", title: "Déroulement d'une séance", steps: profile.process });
  if (profile.faq.length > 0) sections.push({ type: "faq", title: "Questions fréquentes", items: profile.faq });
  const { address, phone, email, hours, note } = profile.contact;
  if (address || phone || email || note || hours.length > 0) {
    sections.push({
      type: "contact",
      title: "Contact",
      ...(address ? { address } : {}),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(hours.length > 0 ? { hours } : {}),
      ...(note ? { note } : {}),
    });
  }

  const home: SocialBriefInput["pages"][number] = {
    id: "ext-accueil",
    type: "home",
    slug: "",
    title: profile.headline,
    metaDescription: profile.intro[0] ?? null,
    sections,
  };
  const motifs = profile.specialties.map((specialty): SocialBriefInput["pages"][number] => ({
    id: externalPageId(specialty.slug),
    type: "motif",
    slug: specialty.slug,
    title: specialty.title,
    metaDescription: specialty.summary || specialty.excerpt || null,
    sections: [
      ...(specialty.headings.length > 0 ? [{ type: "richText" as const, body: specialty.headings.map((heading) => `## ${heading}`).join("\n\n") }] : []),
      ...(specialty.faq.length > 0 ? [{ type: "faq" as const, title: "Questions fréquentes", items: specialty.faq }] : []),
    ],
    // Une spécialité sans page à elle renvoie à l'accueil du site du client (jamais à une page « /motifs/… » qui n'y existe pas)
    ...(specialty.url ? { href: specialty.url } : opts.siteUrl ? { href: opts.siteUrl } : {}),
  }));
  return [home, ...motifs];
}

export type ExternalLandingPage = { path: string; title: string; kind: "home" | "motif" };

/**
 * Chemin d'une page du site du client, relatif à l'adresse de référence
 * (`siteUrl`), ou `null` si la page est hors de ce site. Les outils composent
 * ensuite l'adresse complète en `adresse de référence + chemin`.
 */
export function externalLandingPath(siteUrl: string, pageUrl: string): string | null {
  let base: URL;
  let page: URL;
  try {
    base = new URL(siteUrl);
    page = new URL(pageUrl);
  } catch {
    return null;
  }
  if (bareHost(base.hostname) !== bareHost(page.hostname)) return null;
  const prefix = base.pathname.replace(/\/+$/, "");
  const path = page.pathname.replace(/\/+$/, "");
  if (prefix !== "" && path !== prefix && !path.startsWith(`${prefix}/`)) return null;
  const relative = path.slice(prefix.length);
  return `${relative === "" ? "/" : relative}${page.search}`.slice(0, 200);
}

/** Pages d'atterrissage du site du client : l'accueil, puis les pages de spécialité qui existent sur ce site. */
export function externalLandingPages(profile: ExternalSiteProfile, siteUrl: string): ExternalLandingPage[] {
  const pages: ExternalLandingPage[] = [{ path: "/", title: "Accueil", kind: "home" }];
  const seen = new Set(["/"]);
  for (const specialty of profile.specialties) {
    if (!specialty.url) continue;
    const path = externalLandingPath(siteUrl, specialty.url);
    if (path === null || seen.has(path)) continue;
    seen.add(path);
    pages.push({ path, title: specialty.title, kind: "motif" });
  }
  return pages;
}

// ─── Code de mesure installé sur le site du client ───────────────────────────

/** Valeur de `analytics_events.origin` pour une visite mesurée sur le site du client (absente : site hébergé). */
export const ANALYTICS_ORIGIN_EXTERNAL = "external";

/** Chemin, sur l'hôte des sites, du script de mesure (GET) et de la réception des visites (POST). */
export const EXTERNAL_MEASURE_PATH = "/api/m";

/** Clé publique du code de mesure : 24 caractères, minuscules et chiffres. */
export const EXTERNAL_MEASURE_KEY = /^[a-z0-9]{24}$/;

export function isExternalMeasureKey(value: unknown): value is string {
  return typeof value === "string" && EXTERNAL_MEASURE_KEY.test(value);
}

/** Balise à coller sur le site du client. `sitesBaseUrl` : adresse de base des sites hébergés. */
export function externalMeasureTag(sitesBaseUrl: string, key: string): string {
  const base = sitesBaseUrl.replace(/\/+$/, "");
  return `<script async src="${base}${EXTERNAL_MEASURE_PATH}?k=${key}"></script>`;
}

/**
 * Refus de la mesure par un visiteur : ouvrir n'importe quelle page du site
 * avec l'ancre `off` l'enregistre dans son navigateur (`storageKey`), l'ancre
 * `on` le lève. Le code de mesure respecte aussi le signal « Global Privacy
 * Control » et « Do Not Track ».
 */
export const EXTERNAL_MEASURE_OPTOUT = { off: "#mesure-off", on: "#mesure-on", storageKey: "mesure_off" } as const;

export const EXTERNAL_MEASURE_EVENTS = { p: "pageview", r: "rdv_click", c: "call_click" } as const;
export type ExternalMeasureEventCode = keyof typeof EXTERNAL_MEASURE_EVENTS;

/**
 * Visite envoyée par le code de mesure : `k` clé du site, `t` type, `p`
 * chemin de la page, `r` hôte du site d'où vient le visiteur (jamais
 * l'adresse entière, jamais de paramètre de campagne : la mesure reste une
 * simple mesure d'audience).
 */
export type ExternalMeasurePayload = { k: string; t: ExternalMeasureEventCode; p: string; r?: string };

// Contrôles C0, DEL et contrôles C1, écrits par leurs codes
const CONTROL_CHARS = new RegExp(`[${codePointEscape(0x00)}-${codePointEscape(0x1f)}${codePointEscape(0x7f)}-${codePointEscape(0x9f)}]`, "u");

/** Corps d'une requête du code de mesure → visite validée, ou `null`. */
export function parseExternalMeasure(body: string | null | undefined): ExternalMeasurePayload | null {
  if (!body || body.length > 1_000) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  const row = record(raw);
  if (!isExternalMeasureKey(row.k)) return null;
  if (typeof row.t !== "string" || !Object.hasOwn(EXTERNAL_MEASURE_EVENTS, row.t)) return null;
  const rawPath = typeof row.p === "string" ? row.p : "/";
  // Le chemin seul : ni paramètres (ils peuvent porter des identifiants de campagne), ni ancre
  const path = (rawPath.split(/[?#]/)[0] ?? "/").slice(0, 300);
  // Un navigateur n'envoie jamais de caractère de contrôle dans un chemin (ils y sont encodés) ; la base refuserait le caractère nul
  if (CONTROL_CHARS.test(path)) return null;
  const referrer = typeof row.r === "string" ? row.r.trim().toLowerCase().slice(0, 120) : "";
  return {
    k: row.k,
    t: row.t as ExternalMeasureEventCode,
    p: path.startsWith("/") ? path : "/",
    ...(/^[a-z0-9.-]+$/.test(referrer) ? { r: referrer } : {}),
  };
}
