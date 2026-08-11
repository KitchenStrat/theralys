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
  items: { icon?: string; title: string; text?: string }[];
};

export type SpecialtiesSection = {
  type: "specialties";
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
  title: string;
  paragraphs: string[];
  imageUrl?: string;
  /** Cartes infos pratiques (durée de séance, tarifs, remboursement…) */
  infoCards?: { icon?: string; title: string; text: string }[];
};

/** Projection positive vers l'avenir : bénéfices ✅ + photo de séance. */
export type FutureSection = {
  type: "future";
  /** Badge pilule, ex. « Santé & Équilibre » */
  badge?: string;
  /** Titre projectif, ex. « Et si vous retrouviez enfin … ? » */
  title: string;
  /** Phrase d'introduction de la liste, avec **gras** */
  intro?: string;
  /** Lignes de bénéfices (rendues avec une coche ✅) */
  bullets: string[];
  ctaLabel?: string;
  imageUrl?: string;
};

/** Les avis eux-mêmes viennent de la table google_reviews (synchronisés). */
export type ReviewsSection = {
  type: "reviews";
  title: string;
  intro?: string;
};

export type ProcessSection = {
  type: "process";
  title: string;
  steps: { title: string; description: string }[];
};

export type FaqSection = {
  type: "faq";
  title: string;
  items: { question: string; answer: string }[];
};

export type ContactSection = {
  type: "contact";
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
  title?: string;
  body: string;
};

export type CtaSection = {
  type: "cta";
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

export type SiteTheme = {
  /** Logo du praticien (remplace le nom dans l'en-tête du site) */
  logoUrl?: string;
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
