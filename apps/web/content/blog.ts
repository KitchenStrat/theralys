/**
 * Le blog de la vitrine : des guides pratiques pour les praticiens (être
 * trouvé sur Google, tenir un site, obtenir des avis, publier). Les articles
 * sont des données (`content/articles/`) : en ajouter un, c'est ajouter un
 * fichier et l'inscrire dans `ARTICLES`.
 *
 * Règles d'écriture, les mêmes que sur le reste de la vitrine : rien
 * d'inventé (pas de chiffre de clientèle, pas de résultat promis), des
 * conseils qu'un praticien peut appliquer seul, et la prudence sur ce qui
 * relève de la déontologie de chaque métier.
 */

export const BLOG_CATEGORIES = [
  {
    slug: "referencement-et-visibilite",
    label: "Référencement et visibilité",
    title: "Référencement et visibilité pour les thérapeutes",
    description: "Fiche Google, recherches locales, contenus : ce qui fait remonter un cabinet quand on cherche un praticien près de chez soi.",
  },
  {
    slug: "site-internet",
    label: "Site internet",
    title: "Le site internet d'un cabinet",
    description: "Pages, textes, budget, prise de rendez-vous : ce qui fait d'un site un outil de travail plutôt qu'une carte de visite.",
  },
  {
    slug: "developper-sa-patientele",
    label: "Développer sa patientèle",
    title: "Développer sa patientèle",
    description: "Avis, bouche-à-oreille, agenda : les leviers concrets pour se faire connaître et remplir ses créneaux.",
  },
  {
    slug: "reseaux-sociaux-et-publicite",
    label: "Réseaux sociaux et publicité",
    title: "Réseaux sociaux et publicité pour un cabinet",
    description: "Instagram, Facebook, Google Ads, Meta Ads : quoi publier, quand payer, et quand s'en passer.",
  },
] as const;

export type BlogCategorySlug = (typeof BLOG_CATEGORIES)[number]["slug"];
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export function getCategory(slug: string): BlogCategory | undefined {
  return BLOG_CATEGORIES.find((category) => category.slug === slug);
}

/**
 * Un bloc de texte : un paragraphe (`**gras**` et `[lien](/adresse)`
 * acceptés), une liste, ou un encadré « à retenir ».
 */
export type Block = string | { list: string[]; ordered?: boolean } | { note: string };

export type ArticleSection = { title: string; blocks: Block[] };

export type Article = {
  slug: string;
  category: BlogCategorySlug;
  /** Titre de l'article (h1) */
  title: string;
  /** Description pour les moteurs de recherche (150 caractères au plus) */
  description: string;
  /** Deux phrases pour les cartes de la liste */
  excerpt: string;
  /** Dates `AAAA-MM-JJ` */
  published: string;
  updated?: string;
  intro: Block[];
  sections: ArticleSection[];
  faq: { q: string; a: string }[];
  /** Articles à lire ensuite (slugs) */
  related: string[];
};

const blockText = (block: Block): string => (typeof block === "string" ? block : "list" in block ? block.list.join(" ") : block.note);

/** Nombre de mots d'un article (texte courant, listes et questions comprises). */
export function wordCount(article: Article): number {
  const text = [article.title, ...article.intro.map(blockText), ...article.sections.flatMap((section) => [section.title, ...section.blocks.map(blockText)]), ...article.faq.flatMap((item) => [item.q, item.a])].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

/** Temps de lecture, à 220 mots par minute, une minute au moins. */
export function readingMinutes(article: Article): number {
  return Math.max(1, Math.round(wordCount(article) / 220));
}
