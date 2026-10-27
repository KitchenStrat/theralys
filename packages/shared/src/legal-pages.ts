import type { SiteLegal, SiteTracking } from "./content";

/**
 * Pages légales générées automatiquement à partir des informations du
 * praticien (Paramètres du studio → Informations légales) et des réglages du
 * site (outils de suivi, bandeau cookies, prise de rendez-vous). Rendues par
 * le site public sous /<slug> et liées depuis le pied de page. Fonctions
 * pures : testées sans base.
 */

export const LEGAL_PAGES = [
  { slug: "mentions-legales", title: "Mentions légales", nav: "Mentions légales" },
  { slug: "politique-de-confidentialite", title: "Politique de confidentialité", nav: "Confidentialité" },
  { slug: "politique-de-cookies", title: "Politique de cookies", nav: "Cookies" },
] as const;

export type LegalPageSlug = (typeof LEGAL_PAGES)[number]["slug"];

export function isLegalPageSlug(slug: string): slug is LegalPageSlug {
  return LEGAL_PAGES.some((p) => p.slug === slug);
}

/** Hébergeur du site public (apps/sites sur Vercel). */
export const HOSTING_PROVIDER = {
  name: "Vercel Inc.",
  address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
  url: "https://vercel.com",
} as const;

/** Plateforme qui édite le site (mention « site créé avec »). */
export const PLATFORM = {
  name: "Harmony",
  publisher: "Kitchen Strategy",
  url: "https://harmony-web.fr",
} as const;

/** Nom du cookie de consentement posé par le bandeau (apps/sites). */
export const CONSENT_COOKIE_NAME = "tl_consent";
/** Durée de mémorisation du choix (6 mois, recommandation CNIL). */
export const CONSENT_MAX_AGE_MONTHS = 6;

export type LegalPageInput = {
  siteName: string;
  /** URL publique du site (canonique) */
  siteUrl: string;
  practitioner: { firstName: string; lastName: string; profession: string };
  /** Adresse principale (fiche Google ou premier cabinet) */
  address?: string | null;
  phone?: string | null;
  /** E-mail de contact (section Contact) — `legal.email` prime */
  email?: string | null;
  legal?: SiteLegal | null;
  tracking?: SiteTracking | null;
  /** Lien de prise de rendez-vous (service tiers) ou `tel:` */
  bookingUrl?: string | null;
  /** Date de dernière mise à jour affichée */
  updatedAt: Date;
};

export type LegalPage = { slug: LegalPageSlug; title: string; body: string };

/** Outils de suivi tiers configurés (nom public + éditeur + finalité). */
export function configuredTrackers(tracking: SiteTracking | null | undefined): {
  name: string;
  vendor: string;
  purpose: string;
}[] {
  const list: { name: string; vendor: string; purpose: string }[] = [];
  if (tracking?.googleAnalyticsId) {
    list.push({ name: "Google Analytics 4", vendor: "Google Ireland Ltd", purpose: "mesure d'audience" });
  }
  if (tracking?.googleTagManagerId) {
    list.push({ name: "Google Tag Manager", vendor: "Google Ireland Ltd", purpose: "gestion des balises" });
  }
  if (tracking?.googleAdsId) {
    list.push({
      name: "Google Ads",
      vendor: "Google Ireland Ltd",
      purpose: "mesure des conversions publicitaires (clics sur la prise de rendez-vous, le téléphone et l'e-mail)",
    });
  }
  if (tracking?.metaPixelId) {
    list.push({ name: "Meta Pixel", vendor: "Meta Platforms Ireland Ltd", purpose: "mesure des conversions publicitaires" });
  }
  return list;
}

function formatDateFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(date);
}

function hostOf(url: string | null | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** SIRET (14 chiffres) ou SIREN (9) stocké sans espace → affiché par groupes (123 456 789 00012). */
export function formatSiret(value: string | null | undefined): string {
  const digits = clean(value).replace(/\s/g, "");
  if (/^\d{14}$/.test(digits)) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  if (/^\d{9}$/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return clean(value);
}

export function buildLegalPage(slug: LegalPageSlug, input: LegalPageInput): LegalPage {
  const meta = LEGAL_PAGES.find((p) => p.slug === slug)!;
  const body =
    slug === "mentions-legales"
      ? mentionsLegales(input)
      : slug === "politique-de-confidentialite"
        ? confidentialite(input)
        : cookies(input);
  return { slug, title: meta.title, body };
}

export function buildLegalPages(input: LegalPageInput): LegalPage[] {
  return LEGAL_PAGES.map((p) => buildLegalPage(p.slug, input));
}

// ─── Mentions légales ────────────────────────────────────────────────────────

function mentionsLegales(input: LegalPageInput): string {
  const { practitioner: p, legal } = input;
  const fullName = `${clean(p.firstName)} ${clean(p.lastName)}`.trim();
  const email = clean(legal?.email) || clean(input.email);
  const editor: string[] = [
    `- **Éditeur :** ${fullName}, ${clean(p.profession).toLowerCase()}`,
    ...(clean(legal?.legalForm) ? [`- **Forme juridique :** ${clean(legal?.legalForm)}`] : []),
    ...(clean(legal?.siret) ? [`- **SIRET :** ${formatSiret(legal?.siret)}`] : []),
    ...(clean(legal?.registration) ? [`- **Numéro d'enregistrement professionnel :** ${clean(legal?.registration)}`] : []),
    ...(clean(input.address) ? [`- **Adresse :** ${clean(input.address)}`] : []),
    ...(clean(input.phone) ? [`- **Téléphone :** ${clean(input.phone)}`] : []),
    ...(email ? [`- **E-mail :** ${email}`] : []),
    `- **Directeur de la publication :** ${fullName}`,
  ];
  const bookingHost = hostOf(input.bookingUrl);
  const mediator = clean(legal?.mediatorName)
    ? `Médiateur désigné : **${clean(legal?.mediatorName)}**${clean(legal?.mediatorUrl) ? ` — ${clean(legal?.mediatorUrl)}` : ""}.`
    : "Les coordonnées du médiateur de la consommation désigné par le praticien sont communiquées sur simple demande, par e-mail ou par téléphone.";

  return [
    `## Éditeur du site`,
    editor.join("\n"),
    `## Hébergement`,
    `Ce site est hébergé par **${HOSTING_PROVIDER.name}**, ${HOSTING_PROVIDER.address} — ${HOSTING_PROVIDER.url}.`,
    `Les images téléversées par le praticien sont stockées sur l'infrastructure de l'hébergeur. Certaines photos d'illustration proviennent de la banque d'images Pexels (pexels.com) et sont utilisées conformément à sa licence.`,
    `Ce site est édité à l'aide de la plateforme **${PLATFORM.name}** (${PLATFORM.url}), proposée par ${PLATFORM.publisher}.`,
    ...(bookingHost
      ? [
          `## Prise de rendez-vous`,
          `La prise de rendez-vous en ligne est assurée par un service tiers (${bookingHost}), soumis à ses propres conditions d'utilisation et à sa propre politique de confidentialité.`,
        ]
      : []),
    `## Propriété intellectuelle`,
    `L'ensemble des contenus de ce site (textes, photographies, logo) est la propriété de ${fullName} ou de ses ayants droit, sauf mention contraire. Toute reproduction, même partielle, sans autorisation préalable est interdite.`,
    `## Médiation de la consommation`,
    `Conformément aux articles L. 616-1 et R. 616-1 du Code de la consommation, tout consommateur a le droit de recourir gratuitement à un médiateur de la consommation en vue de la résolution amiable d'un litige. ${mediator}`,
    `## Avertissement`,
    `Les informations publiées sur ce site présentent une activité de bien-être et ne se substituent ni à un avis médical, ni à un diagnostic, ni à un suivi par un professionnel de santé. En cas de doute, consultez votre médecin.`,
    ...(clean(legal?.extra) ? [`## Informations complémentaires`, clean(legal?.extra)] : []),
    `*Dernière mise à jour : ${formatDateFr(input.updatedAt)}.*`,
  ].join("\n\n");
}

// ─── Politique de confidentialité ────────────────────────────────────────────

function confidentialite(input: LegalPageInput): string {
  const { practitioner: p, legal } = input;
  const fullName = `${clean(p.firstName)} ${clean(p.lastName)}`.trim();
  const email = clean(legal?.email) || clean(input.email);
  const contact = [email ? `par e-mail (${email})` : null, clean(input.phone) ? `par téléphone (${clean(input.phone)})` : null]
    .filter(Boolean)
    .join(" ou ");
  const trackers = configuredTrackers(input.tracking);
  const bookingHost = hostOf(input.bookingUrl);

  return [
    `## Responsable du traitement`,
    `Le responsable du traitement des données collectées sur ce site est ${fullName}, ${clean(p.profession).toLowerCase()}${clean(input.address) ? `, ${clean(input.address)}` : ""}.`,
    `## Données collectées et finalités`,
    [
      `- **Mesure d'audience intégrée au site :** pages consultées, clics sur le bouton de prise de rendez-vous et sur le numéro de téléphone, sans donnée nominative. Un identifiant de visite anonyme n'est enregistré qu'après votre acceptation dans le bandeau cookies.`,
      ...(bookingHost
        ? [
            `- **Prise de rendez-vous :** les informations que vous saisissez pour réserver sont traitées par le service ${bookingHost}, selon sa propre politique de confidentialité.`,
          ]
        : []),
      `- **Contact :** lorsque vous écrivez ou appelez le praticien, vos coordonnées servent uniquement à vous répondre et à organiser votre accompagnement.`,
      ...(trackers.length > 0
        ? [
            `- **Outils tiers :** ${trackers.map((t) => `${t.name} (${t.vendor}, ${t.purpose})`).join(", ")}. Ces outils ne sont actifs qu'après votre consentement (voir la Politique de cookies).`,
          ]
        : []),
    ].join("\n"),
    `## Base légale et durée de conservation`,
    `La mesure d'audience et les outils tiers reposent sur votre consentement (article 6.1.a du RGPD), conservé ${CONSENT_MAX_AGE_MONTHS} mois. Les échanges avec le praticien reposent sur l'exécution de la prestation demandée et sont conservés le temps nécessaire à votre accompagnement, puis archivés selon les obligations légales applicables à la profession.`,
    `## Destinataires`,
    `Vos données sont destinées au praticien. Elles sont hébergées par ${HOSTING_PROVIDER.name} (${HOSTING_PROVIDER.address})${trackers.length > 0 ? ` et, avec votre consentement, transmises aux éditeurs des outils tiers listés ci-dessus` : ""}. Elles ne sont ni vendues ni cédées.`,
    `## Vos droits`,
    `Conformément au Règlement général sur la protection des données (RGPD) et à la loi Informatique et Libertés, vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de vos données${contact ? `, que vous pouvez exercer ${contact}` : ""}. Vous pouvez également introduire une réclamation auprès de la CNIL (cnil.fr).`,
    `*Dernière mise à jour : ${formatDateFr(input.updatedAt)}.*`,
  ].join("\n\n");
}

// ─── Politique de cookies ────────────────────────────────────────────────────

function cookies(input: LegalPageInput): string {
  const trackers = configuredTrackers(input.tracking);
  const bannerOn = input.tracking?.cookieBanner !== false;
  return [
    `## Qu'est-ce qu'un cookie ?`,
    `Un cookie est un petit fichier déposé sur votre appareil lors de la consultation d'un site. Il permet de mémoriser un choix ou de mesurer la fréquentation.`,
    `## Cookies utilisés sur ce site`,
    [
      `- **${CONSENT_COOKIE_NAME}** — mémorise votre choix dans le bandeau cookies (accepté ou refusé) pendant ${CONSENT_MAX_AGE_MONTHS} mois.`,
      `- **Mesure d'audience intégrée** — identifiant de visite anonyme, enregistré uniquement après acceptation, pour compter les visites, les clics sur « Prendre rendez-vous » et sur le numéro de téléphone. Aucune donnée nominative.`,
      ...trackers.map((t) => `- **${t.name}** (${t.vendor}) — ${t.purpose}. Dépose ses propres cookies, décrits dans la politique de confidentialité de son éditeur.`),
    ].join("\n"),
    `## Votre consentement`,
    bannerOn
      ? `À votre première visite, un bandeau vous propose d'accepter ou de continuer sans accepter. ${
          trackers.length > 0 ? "Les outils tiers ne sont chargés qu'après votre acceptation. " : ""
        }Vous pouvez modifier votre choix à tout moment depuis le lien « Gérer les cookies » du pied de page.`
      : `Le bandeau de consentement est désactivé sur ce site : seule la mesure d'audience anonyme est active${
          trackers.length > 0 ? ", et les outils tiers listés ci-dessus sont chargés dès votre arrivée" : ""
        }. Vous pouvez à tout moment bloquer les cookies dans les réglages de votre navigateur.`,
    `*Dernière mise à jour : ${formatDateFr(input.updatedAt)}.*`,
  ].join("\n\n");
}
