import type { Article, BlogCategorySlug } from "../blog";
import { agenda, coutSite, googleAds, pagesSite, reseauxSociaux } from "./site-et-publicite";
import { avisGoogle, ficheGoogle, referencementLocal, sujetsBlog } from "./visibilite";

/**
 * Tous les articles du blog, dans l'ordre d'affichage : le premier est « à la
 * une ». Ajouter un article, c'est l'écrire dans l'un des fichiers voisins et
 * l'inscrire ici — le sitemap, les listes et les catégories suivent.
 */
export const ARTICLES: readonly Article[] = [referencementLocal, ficheGoogle, coutSite, agenda, pagesSite, avisGoogle, reseauxSociaux, googleAds, sujetsBlog];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((article) => article.slug === slug);
}

export function articlesIn(category: BlogCategorySlug): Article[] {
  return ARTICLES.filter((article) => article.category === category);
}

/** Les articles « à lire ensuite » d'un article ; un slug inconnu est ignoré, jamais un lien mort. */
export function relatedArticles(article: Article): Article[] {
  return article.related.map(getArticle).filter((related): related is Article => Boolean(related) && related?.slug !== article.slug);
}

/** Adresse d'un article. */
export function articlePath(article: Pick<Article, "slug">): string {
  return `/blog/${article.slug}`;
}

/** Adresse d'une catégorie du blog. */
export function categoryPath(slug: BlogCategorySlug): string {
  return `/blog/categorie/${slug}`;
}

/** « 1 article », « 3 articles ». */
export function articleCount(count: number): string {
  return `${count} article${count > 1 ? "s" : ""}`;
}
