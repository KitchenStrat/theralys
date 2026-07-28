/**
 * Contenu des pages : sections typées (jamais de HTML libre).
 * Permet l'édition structurée (Phase 2) et la régénération partielle par IA.
 */

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
  }[];
};

export type AboutSection = {
  type: "about";
  title: string;
  paragraphs: string[];
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
  | SpecialtiesSection
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

export const FONT_PRESETS = ["classique", "moderne", "elegant"] as const;
export type FontPreset = (typeof FONT_PRESETS)[number];

export type SiteTheme = {
  preset: ThemePreset;
  fontPreset: FontPreset;
  /** Overrides ponctuels de la palette du preset */
  palette?: Partial<{
    primary: string;
    primaryDark: string;
    background: string;
    surface: string;
    text: string;
  }>;
};

export const DEFAULT_THEME: SiteTheme = { preset: "terracotta", fontPreset: "classique" };
