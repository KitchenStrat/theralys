import type { MetadataRoute } from "next";
import { ARTICLES, articlePath, categoryPath } from "@/content/articles";
import { BLOG_CATEGORIES } from "@/content/blog";
import { PROFESSIONS, professionPath } from "@/content/professions";
import { absoluteUrl } from "@/lib/site";

const day = (isoDay: string) => new Date(`${isoDay}T12:00:00Z`);

/**
 * Plan du site pour les moteurs de recherche : l'accueil, la page « Création
 * de site internet » et celle de chaque métier, le blog, ses thématiques et
 * ses articles. Une date n'est donnée que là où elle est connue (les
 * articles) : une date de construction ferait croire à une mise à jour à
 * chaque déploiement.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const latest = ARTICLES.map((article) => article.updated ?? article.published).sort().at(-1);
  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/creation-site-internet"), changeFrequency: "monthly", priority: 0.9 },
    ...PROFESSIONS.map((profession) => ({ url: absoluteUrl(professionPath(profession)), changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: absoluteUrl("/blog"), changeFrequency: "weekly", priority: 0.8, ...(latest ? { lastModified: day(latest) } : {}) },
    ...BLOG_CATEGORIES.map((category) => ({ url: absoluteUrl(categoryPath(category.slug)), changeFrequency: "weekly" as const, priority: 0.5 })),
    ...ARTICLES.map((article) => ({ url: absoluteUrl(articlePath(article)), lastModified: day(article.updated ?? article.published), changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: absoluteUrl("/robot"), changeFrequency: "yearly", priority: 0.2 },
  ];
}
