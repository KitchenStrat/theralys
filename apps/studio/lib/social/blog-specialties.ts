/**
 * Publications : libellé de spécialité des articles et des sujets du
 * calendrier quand le site du client est la référence des outils.
 *
 * Le blog tire alors ses sujets des spécialités du site du client
 * (`externalSpecialties`) : c'est leur titre qu'un article doit afficher, pas
 * celui d'une page du site hébergé qui porterait le même identifiant. Un
 * article ou un sujet prévu avant la connexion du site reste rattaché à une
 * page du site hébergé : son libellé ne change pas — la même règle que la
 * rédaction des articles (`generateDueArticles`, `@theralys/jobs`).
 *
 * Fonction pure, testée sans base.
 */

/** Identifiant de spécialité (`motif_slug`) des articles et des sujets planifiés d'un site, par identifiant de ligne. */
export type MotifSlugs = {
  articles: ReadonlyMap<string, string | null>;
  entries: ReadonlyMap<string, string | null>;
};

type CalendarLabel = { articleId?: string; entryId?: string; motifTitle?: string };

/**
 * Éléments du calendrier avec le titre de spécialité du site de référence.
 * `specialties` : spécialités du site du client. Un élément dont la
 * spécialité n'en fait pas partie (ou qui n'en a pas) est rendu tel quel.
 */
export function withReferenceSpecialties<T extends CalendarLabel>(
  items: readonly T[],
  slugs: MotifSlugs,
  specialties: readonly { slug: string; title: string }[],
): T[] {
  const titles = new Map(specialties.map((specialty) => [specialty.slug, specialty.title]));
  return items.map((item) => {
    const slug = item.articleId ? slugs.articles.get(item.articleId) : item.entryId ? slugs.entries.get(item.entryId) : undefined;
    const title = slug ? titles.get(slug) : undefined;
    return title === undefined || title === item.motifTitle ? item : { ...item, motifTitle: title };
  });
}
