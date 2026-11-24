import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard, CtaBand, JsonLd, PageHero, PageShell } from "@/components/pages/shell";
import { articlePath, articlesIn, categoryPath } from "@/content/articles";
import { BLOG_CATEGORIES, getCategory } from "@/content/blog";
import { absoluteUrl, breadcrumbJsonLd, pageMetadata, plainText, type Crumb } from "@/lib/site";

type Params = { params: Promise<{ slug: string }> };

// Les catégories sont connues à la construction : toute autre adresse est une page introuvable
export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_CATEGORIES.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const category = getCategory((await params).slug);
  if (!category) return {};
  return pageMetadata({ title: `${category.title} : nos guides`, description: category.description, path: categoryPath(category.slug) });
}

/** Une thématique du blog : ses articles, et le chemin vers les autres thématiques. */
export default async function CategoryPage({ params }: Params) {
  const category = getCategory((await params).slug);
  if (!category) notFound();
  const articles = articlesIn(category.slug);
  const crumbs: Crumb[] = [
    { label: "Accueil", href: "/" },
    { label: "Blog", href: "/blog" },
    { label: category.label, href: categoryPath(category.slug) },
  ];
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: category.title,
      description: category.description,
      url: absoluteUrl(categoryPath(category.slug)),
      inLanguage: "fr-FR",
      mainEntity: {
        "@type": "ItemList",
        itemListElement: articles.map((article, index) => ({ "@type": "ListItem", position: index + 1, name: plainText(article.title), url: absoluteUrl(articlePath(article)) })),
      },
    },
    breadcrumbJsonLd(crumbs),
  ];

  return (
    <PageShell>
      <JsonLd data={jsonLd} />
      <PageHero crumbs={crumbs} title={category.title} lead={category.description} />

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 md:py-16">
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <li key={article.slug}>
                <ArticleCard article={article} heading="h2" />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-cream-100">
        <div className="mx-auto max-w-6xl px-5 py-14 md:py-16">
          <h2 className="font-display text-3xl leading-[1.15] font-bold text-balance text-ink-900 sm:text-[2.35rem]">Les autres thématiques</h2>
          <ul className="mt-7 flex flex-wrap gap-2.5">
            {BLOG_CATEGORIES.filter((other) => other.slug !== category.slug).map((other) => (
              <li key={other.slug}>
                <a
                  href={categoryPath(other.slug)}
                  className="focus-ring inline-flex min-h-11 items-center rounded-full border border-cream-300 bg-white px-5 py-2.5 text-base font-medium text-ink-900 transition-[border-color,color] hover:border-primary-400 hover:text-primary-700"
                >
                  {other.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href="/blog"
                className="focus-ring inline-flex min-h-11 items-center rounded-full border border-primary-200 bg-primary-50 px-5 py-2.5 text-base font-semibold text-primary-800 transition-[border-color] hover:border-primary-400"
              >
                Tous les articles
              </a>
            </li>
          </ul>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 md:py-16">
          <CtaBand title="Vous préférez que ce soit fait pour vous ?" text="Harmony prépare votre site, vos articles et vos contenus. Demandez une démo de votre futur site, **gratuite et sans engagement**." />
        </div>
      </section>
    </PageShell>
  );
}
