import type { GoogleAdsConversionLabels } from "./google-ads";
/**
 * Contenu des pages : sections typées (jamais de HTML libre).
 * Permet l'édition structurée (Phase 2) et la régénération partielle par IA.
 */

/**
 * Icônes disponibles pour les encarts (points forts, infos pratiques,
 * badges du hero). Dessinées côté sites — l'IA et l'éditeur choisissent un nom.
 */
export const SECTION_ICONS = [
  "medaille",
  "diplome",
  "coeur",
  "mains",
  "fleur",
  "feuille",
  "soleil",
  "etoile",
  "carte",
  "maison",
  "calendrier",
  "horloge",
  "euro",
  "document",
  "bouclier",
  "personnes",
  "colonne",
  "bebe",
  "lune",
  "eclair",
  "tete",
] as const;
export type SectionIconName = (typeof SECTION_ICONS)[number];

export const SECTION_ICON_LABELS: Record<SectionIconName, string> = {
  medaille: "Médaille",
  diplome: "Diplôme",
  coeur: "Cœur",
  mains: "Mains",
  fleur: "Fleur",
  feuille: "Feuille",
  soleil: "Soleil",
  etoile: "Étoile",
  carte: "Carte / plan",
  maison: "Maison",
  calendrier: "Calendrier",
  horloge: "Horloge",
  euro: "Euro",
  document: "Document",
  bouclier: "Bouclier",
  personnes: "Personnes",
  colonne: "Colonne vertébrale",
  bebe: "Bébé / maternité",
  lune: "Lune / sommeil",
  eclair: "Éclair / énergie",
  tete: "Tête / mental",
};

/**
 * Icône par défaut d'une carte de spécialité : choisie par mots-clés du titre
 * (dos → colonne, sommeil → lune…) ; sans correspondance, une rotation
 * d'icônes génériques évite que toutes les cartes se ressemblent.
 */
const SPECIALTY_ICON_RULES: [RegExp, SectionIconName][] = [
  [/dos|lombal|cervical|torticolis|vert[èe]br|scolios|posture|articul|sciatiq/, "colonne"],
  [/nourrisson|b[ée]b[ée]|enfant|p[ée]diatr|grossesse|maternit|post.?partum|p[ée]rinat/, "bebe"],
  [/sommeil|insomni|nuit|dormir/, "lune"],
  [/sport|performanc|r[ée]cup[ée]ration|effort|athl[èe]t/, "eclair"],
  [/t[êe]te|migrain|c[ée]phal|cr[âa]ne|m[âa]choire|stress|anxi[ée]t|charge mentale|[ée]motion|burn/, "tete"],
  [/digest|aliment|intestin|ventre|poids/, "feuille"],
  [/femme|cycle|m[ée]nopause|hormon/, "fleur"],
  [/[ée]nergie|fatigue|vitalit/, "soleil"],
  [/tabac|addiction|d[ée]pendan|protection/, "bouclier"],
  [/couple|famille|relation|social|accompagnement collectif/, "personnes"],
  [/confiance|estime|examen|r[ée]ussite/, "etoile"],
];

const SPECIALTY_ICON_FALLBACK: SectionIconName[] = [
  "mains",
  "coeur",
  "fleur",
  "feuille",
  "soleil",
  "etoile",
];

export function specialtyIconFor(title: string, index = 0): SectionIconName {
  const haystack = title.toLowerCase();
  for (const [pattern, icon] of SPECIALTY_ICON_RULES) {
    if (pattern.test(haystack)) return icon;
  }
  return SPECIALTY_ICON_FALLBACK[index % SPECIALTY_ICON_FALLBACK.length]!;
}

export type HeroSection = {
  type: "hero";
  hidden?: boolean;
  /** Badge local, ex. « Massages Bien-être à Clapiers (34) » */
  badge?: string;
  /** H1 orienté bénéfice */
  title: string;
  paragraphs: string[];
  imageUrl?: string;
  /** Affiche le badge note Google (« 5/5 avis google ») */
  showGoogleRating?: boolean;
  ctaLabel?: string;
  /** Badges chiffrés flottant sur la photo, ex. « +300 / Patients accompagnés » */
  stats?: { icon?: string; value: string; label: string }[];
};

/** Bandeau de points forts entre le hero et les spécialités. */
export type HighlightsSection = {
  type: "highlights";
  hidden?: boolean;
  items: { icon?: string; title: string; text?: string }[];
};

export type SpecialtiesSection = {
  type: "specialties";
  hidden?: boolean;
  title: string;
  intro?: string;
  items: {
    /** slug de la page /motifs/[slug] correspondante */
    slug: string;
    title: string;
    excerpt: string;
    imageUrl?: string;
    /** Icône de la carte (SECTION_ICONS) — défaut : specialtyIconFor(title) */
    icon?: string;
  }[];
};

export type AboutSection = {
  type: "about";
  hidden?: boolean;
  title: string;
  paragraphs: string[];
  imageUrl?: string;
  /** Cartes infos pratiques (durée de séance, tarifs, remboursement…) */
  infoCards?: { icon?: string; title: string; text: string }[];
};

/** Projection positive vers l'avenir : liste à puces + photo de séance. */
export type FutureSection = {
  type: "future";
  hidden?: boolean;
  /** Badge pilule, ex. « Santé & Équilibre » */
  badge?: string;
  /** Titre projectif, ex. « Et si vous retrouviez enfin … ? » */
  title: string;
  /**
   * Zone de texte unique : phrase d'introduction, lignes « - » en puces,
   * **gras**… Remplace intro + bullets (conservés en lecture pour les
   * contenus existants — cf. futureBodyText).
   */
  body?: string;
  /** Héritage : phrase d'introduction de l'ancienne liste de bénéfices */
  intro?: string;
  /** Héritage : lignes de bénéfices (converties en puces à l'affichage) */
  bullets: string[];
  ctaLabel?: string;
  imageUrl?: string;
};

/**
 * Texte unique de la section « avenir » : `body`, sinon conversion de
 * l'ancien format (intro + bénéfices transformés en lignes à puces).
 */
export function futureBodyText(section: FutureSection): string {
  if (section.body !== undefined) return section.body;
  const bullets = section.bullets.map((b) =>
    /^([-•]|✅|\d{1,2}[.)])\s/.test(b) ? b : `- ${b}`,
  );
  return [section.intro, ...bullets].filter((s): s is string => Boolean(s)).join("\n");
}

/** Les avis eux-mêmes viennent de la table google_reviews (synchronisés). */
export type ReviewsSection = {
  type: "reviews";
  hidden?: boolean;
  title: string;
  intro?: string;
};

export type ProcessSection = {
  type: "process";
  hidden?: boolean;
  title: string;
  steps: { title: string; description: string }[];
};

export type FaqSection = {
  type: "faq";
  hidden?: boolean;
  title: string;
  items: { question: string; answer: string }[];
};

export type ContactSection = {
  type: "contact";
  hidden?: boolean;
  title: string;
  address?: string;
  phone?: string;
  email?: string;
  hours?: { label: string; value: string }[];
  note?: string; // ex. « Parking facile et gratuit »
  /** Cartes de rappel (expérience, accès…) affichées sous les boutons */
  infoCards?: { icon?: string; title: string; text: string }[];
};

/** Corps de texte markdown (pages de motifs, mentions légales…). */
export type RichTextSection = {
  type: "richText";
  hidden?: boolean;
  title?: string;
  body: string;
};

export type CtaSection = {
  type: "cta";
  hidden?: boolean;
  title: string;
  body?: string;
  buttonLabel: string;
};

export type Section =
  | HeroSection
  | HighlightsSection
  | SpecialtiesSection
  | FutureSection
  | AboutSection
  | ReviewsSection
  | ProcessSection
  | FaqSection
  | ContactSection
  | RichTextSection
  | CtaSection;

export type SectionType = Section["type"];
export type PageSections = Section[];

/**
 * Visibilité d'une section : `hidden: true` (interrupteur « Visible sur cette
 * page » du studio) la retire du site public sans perdre son contenu ; dans
 * l'aperçu de l'éditeur elle apparaît sous forme d'une barre « Section
 * masquée — Afficher ».
 */
export function isSectionVisible(section: { hidden?: boolean }): boolean {
  return section.hidden !== true;
}

/** Garde de type : `value` est-il un type de section connu ? */
export function isSectionType(value: unknown): value is SectionType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SECTION_LABELS, value);
}

/** Libellés des sections (accordéon du studio, étiquette de survol de l'aperçu). */
export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "En-tête",
  highlights: "Points forts",
  specialties: "Spécialités",
  future: "Projection vers l'avenir",
  about: "À propos",
  reviews: "Avis Google",
  process: "Déroulement d'une séance",
  faq: "Questions fréquentes",
  contact: "Contact",
  richText: "Contenu de la page",
  cta: "Bandeau d'appel à l'action",
};

/**
 * Longueurs conseillées des champs (compteurs du studio, `maxLength` des
 * champs) : des repères de lisibilité, pas des contraintes serveur.
 */
export const SECTION_LIMITS = {
  badge: 60,
  title: 120,
  cardTitle: 60,
  cardText: 200,
  excerpt: 240,
  paragraph: 1000,
  body: 2500,
  faqQuestion: 160,
  faqAnswer: 1000,
  stepTitle: 80,
  stepDescription: 400,
  statValue: 20,
  statLabel: 55,
  buttonLabel: 40,
  hoursLabel: 30,
  hoursValue: 40,
  note: 160,
} as const;

// ─── Thème par site (palette, polices) ───────────────────────────────────────

export const THEME_PRESETS = [
  "terracotta",
  "sauge",
  "ocean",
  "lavande",
  "ambre",
  "rose",
  "prune",
  "caramel",
  "marine",
  "olive",
  "turquoise",
  "taupe",
] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

export const FONT_PRESETS = ["chaleureux", "classique", "moderne", "elegant"] as const;
export type FontPreset = (typeof FONT_PRESETS)[number];

/** Intensité de la palette : décline la couleur choisie en 3 forces. */
export const THEME_INTENSITIES = ["pastel", "naturel", "intense"] as const;
export type ThemeIntensity = (typeof THEME_INTENSITIES)[number];

/** Forme des coins (photos, cartes, boutons). */
export const THEME_CORNERS = ["rond", "adouci", "equilibre", "net"] as const;
export type ThemeCorners = (typeof THEME_CORNERS)[number];

/** Ambiance : courbes/textures organiques ou lignes droites. */
export const THEME_AMBIANCES = ["naturel", "structure"] as const;
export type ThemeAmbiance = (typeof THEME_AMBIANCES)[number];

/**
 * Outils de suivi configurés dans le studio (Paramètres → Tracking).
 * Un identifiant absent = outil désactivé. `cookieBanner: false` retire le
 * bandeau cookies : les traceurs se chargent alors dès l'arrivée (défaut :
 * bandeau affiché, traceurs chargés après « Accepter »).
 */
export type SiteTracking = {
  cookieBanner?: boolean;
  /** Google Analytics 4, ex. G-XXXXXXXXXX */
  googleAnalyticsId?: string;
  /** Google Tag Manager, ex. GTM-XXXXXXX */
  googleTagManagerId?: string;
  /** Google Ads (conversions/remarketing), ex. AW-1234567890 */
  googleAdsId?: string;
  /** Meta Pixel (identifiant numérique) */
  metaPixelId?: string;
  /**
   * Libellés de conversion Google Ads (clic RDV, appel, e-mail) : le site les
   * envoie à la balise gtag (googleAdsId requis), après consentement.
   */
  googleAdsConversions?: GoogleAdsConversionLabels;
};

/** Formats attendus des identifiants de suivi (validation studio + serveur). */
export const TRACKING_ID_PATTERNS = {
  googleAnalyticsId: /^G-[A-Z0-9]{4,14}$/i,
  googleTagManagerId: /^GTM-[A-Z0-9]{4,10}$/i,
  googleAdsId: /^AW-\d{8,12}$/,
  metaPixelId: /^\d{10,20}$/,
} as const;

/** Cabinet ajouté manuellement dans les paramètres du studio. */
export type SiteCabinet = {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  /** Photo du cabinet (téléversée), facultative */
  photoUrl?: string;
};

/** Page introuvable (404) personnalisable depuis le studio. */
export type SiteNotFound = {
  title?: string;
  /** Vide = masqué */
  message?: string;
  /** Bouton vers l'accueil */
  buttonLabel?: string;
  /** Liste de liens vers les pages de spécialité (4 premières) */
  showSpecialties?: boolean;
};

export const DEFAULT_NOT_FOUND = {
  title: "Cette page n'est plus disponible",
  message: "Retrouvez les informations et les coordonnées sur le site.",
  buttonLabel: "Retour à l'accueil",
  showSpecialties: true,
} as const satisfies Required<SiteNotFound>;

/** Nombre de spécialités proposées sur la page introuvable. */
export const NOT_FOUND_SPECIALTIES = 4;

/**
 * Informations légales saisies dans le studio (Paramètres → Informations
 * légales) : elles alimentent les pages Mentions légales / Confidentialité /
 * Cookies générées automatiquement (cf. legal-pages.ts).
 */
export type SiteLegal = {
  /** Forme juridique, ex. « Entrepreneur individuel », « SASU » */
  legalForm?: string;
  siret?: string;
  /** Numéro d'enregistrement professionnel (ADELI, RPPS, RCS…) */
  registration?: string;
  /** E-mail de contact publié dans les mentions légales (défaut : section Contact) */
  email?: string;
  /** Médiateur de la consommation désigné (nom + site) */
  mediatorName?: string;
  mediatorUrl?: string;
  /** Mentions complémentaires libres (assurance RC pro, diplômes…), markdown léger */
  extra?: string;
};

/** Réseaux sociaux affichés dans le pied de page (URL complètes). */
export type SiteSocialLinks = {
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  tiktok?: string;
  youtube?: string;
};

export const FOOTER_SOCIAL_NETWORKS: { key: keyof SiteSocialLinks; label: string; host: string }[] = [
  { key: "instagram", label: "Instagram", host: "instagram.com" },
  { key: "facebook", label: "Facebook", host: "facebook.com" },
  { key: "linkedin", label: "LinkedIn", host: "linkedin.com" },
  { key: "tiktok", label: "TikTok", host: "tiktok.com" },
  { key: "youtube", label: "YouTube", host: "youtube.com" },
];

/** Pied de page : texte d'accompagnement et informations complémentaires. */
export type SiteFooterSettings = {
  /** Phrase d'accompagnement sous le nom (≤ 300 caractères) */
  text?: string;
  /** Informations complémentaires : SIRET, diplômes, adhésions… (≤ 500 caractères) */
  details?: string;
};

/**
 * Page de spécialité en cours de préparation par l'IA (création depuis le
 * studio, asynchrone) : la page existe en base (désactivée, sans sections)
 * jusqu'à la fin de la génération ; `error` = échec à relancer ou supprimer.
 */
export type GeneratingMotif = {
  slug: string;
  subject: string;
  /** ISO 8601 */
  startedAt: string;
  /** Intention « afficher une carte sur l'accueil » (mémorisée pour une relance) */
  showCard?: boolean;
  error?: string;
};

export type SiteTheme = {
  /** Logo du praticien (remplace le nom dans l'en-tête du site) */
  logoUrl?: string;
  /**
   * Icône du navigateur (favicon) : "/favicons/<picto>.svg" pour une
   * suggestion, une URL téléversée pour une icône personnalisée ;
   * absent = logo Harmony ("/favicons/harmony.svg").
   */
  faviconUrl?: string;
  /**
   * Image de l'aperçu du lien (og:image — résultat Google, partages
   * WhatsApp/réseaux) ; absente = photo du hero de l'accueil. Le titre et la
   * description de l'aperçu vivent sur la page d'accueil (metaTitle /
   * metaDescription). Stockée ici (JSONB du site) — pas de migration.
   */
  shareImageUrl?: string;
  /**
   * Slugs des pages de spécialité désactivées par le praticien : la page
   * n'est plus servie (404), la carte de l'accueil perd son lien et la page
   * sort de la navigation et du sitemap. Stocké ici (JSONB du site) pour
   * éviter une migration de schéma ; absent = tout est activé.
   */
  disabledMotifs?: string[];
  /**
   * Cabinets supplémentaires saisis à la main (praticiens multi-cabinets) :
   * affichés sous le hero et dans la section Contact, avec un lien Google
   * Maps construit sur l'adresse. La fiche Google reliée reste le cabinet
   * « principal ». Stocké ici (JSONB du site) — pas de migration de schéma.
   */
  cabinets?: SiteCabinet[];
  /**
   * Suivi (bandeau cookies + GA/GTM/Ads/Meta) — cf. SiteTracking. Stocké ici
   * (JSONB du site) — pas de migration de schéma.
   */
  tracking?: SiteTracking;
  /** Page introuvable personnalisée (défaut : DEFAULT_NOT_FOUND). JSONB — pas de migration. */
  notFound?: SiteNotFound;
  /** Informations légales (mentions, confidentialité, cookies). JSONB — pas de migration. */
  legal?: SiteLegal;
  /** Réseaux sociaux du pied de page. JSONB — pas de migration. */
  social?: SiteSocialLinks;
  /** Pied de page (texte, informations complémentaires). JSONB — pas de migration. */
  footer?: SiteFooterSettings;
  /** Pages de spécialité en cours de génération (création depuis le studio). */
  generatingMotifs?: GeneratingMotif[];
  preset: ThemePreset;
  fontPreset: FontPreset;
  /** Défauts (sites existants inclus) : naturel / rond / naturel */
  intensity?: ThemeIntensity;
  corners?: ThemeCorners;
  ambiance?: ThemeAmbiance;
  /** Overrides ponctuels de la palette du preset */
  palette?: Partial<{
    primary: string;
    primaryDark: string;
    background: string;
    surface: string;
    text: string;
  }>;
};

export const DEFAULT_THEME: SiteTheme = { preset: "terracotta", fontPreset: "chaleureux" };
