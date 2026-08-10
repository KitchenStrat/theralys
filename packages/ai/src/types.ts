import type { PageSections, SiteTheme } from "@theralys/shared";

/** Entrées du pipeline de génération d'une démo. */
export type GenerationInput = {
  firstName: string;
  lastName: string;
  /** ex. « Sophrologue », « Masseuse bien-être » */
  profession: string;
  /** ex. « Albi » */
  city: string;
  /** Pour les accords grammaticaux */
  gender: "feminin" | "masculin";
  /** Motifs à mettre en avant (tags libres, ex. « Gestion du stress ») */
  highlightedMotifs: string[];
  /** Nombre de pages de spécialités à générer (gating par formule) */
  motifPageCount: number;
  /** Enrichissement fiche Google, si le prospect en a une */
  googleEnrichment?: {
    businessName?: string;
    address?: string;
    rating?: number;
    reviewCount?: number;
  };
};

/** Plan des spécialités, décidé en premier (nav + section spécialités + pages). */
export type MotifPlan = {
  slug: string;
  title: string;
  /** Résumé courte carte sur l'accueil */
  excerpt: string;
};

export type GeneratedHome = {
  siteName: string;
  metaTitle: string;
  metaDescription: string;
  sections: PageSections;
  motifsPlan: MotifPlan[];
  theme: SiteTheme;
};

export type GeneratedMotifPage = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  sections: PageSections;
  /** Requête (anglais) pour la photo de banque d'images de la page */
  imageQuery?: string;
};

export type GeneratedReview = {
  authorName: string;
  rating: number;
  text: string;
};

export type GeneratedArticle = {
  title: string;
  slug: string;
  excerpt: string;
  /** markdown */
  content: string;
  motifSlug: string | null;
  /** Requête (anglais) pour la photo de banque d'images de couverture */
  imageQuery?: string;
};
