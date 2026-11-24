import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Blocks, inline } from "@/components/pages/prose";
import { ArticleCard, CtaBand, FaqList, JsonLd, PageHero, PageShell } from "@/components/pages/shell";
import { ARTICLES, articlePath, categoryPath, getArticle, relatedArticles } from "@/content/articles";
import { getCategory, readingMinutes, wordCount } from "@/content/blog";
import { ORGANIZATION_JSON_LD, absoluteUrl, anchorId, breadcrumbJsonLd, faqJsonLd, longDate, pageMetadata, plainText, type Crumb } from "@/lib/site";

type Params = { params: Promise<{ slug: string }> };

// Les articles sont connus à la construction : toute autre adresse est une page introuvable
export const dynamicParams = false;

export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const article = getArticle((await params).slug);
  if (!article) return {};
  return pageMetadata({
    title: plainText(article.title),
    description: article.description,
    path: articlePath(article),
    article: { published: article.published, updated: article.updated, section: getCategory(article.category)?.label },
  });
}

const AUTHOR = "L'équipe Harmony";

/** Un article du blog : sommaire, sections, questions fréquentes, appel à la démo, articles liés. */
export default async function ArticlePage({ params }: Params) {
  const article = getArticle((await params).slug);
  if (!article) notFound();
  const category = getCategory(article.category);
  const related = relatedArticles(article);
  const url = absoluteUrl(articlePath(article));
  const crumbs: Crumb[] = [
    { label: "Accueil", href: "/" },
    { label: "Blog", href: "/blog" },
    ...(category ? [{ label: category.label, href: categoryPath(category.slug) }] : []),
    { label: plainText(article.title), href: articlePath(article) },
  ];
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: plainText(article.title),
      description: article.description,
      datePublished: article.published,
      dateModified: article.updated ?? article.published,
      inLanguage: "fr-FR",
      articleSection: category?.label,
      wordCount: wordCount(article),
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      url,
      author: { "@type": "Organization", name: ORGANIZATION_JSON_LD.name, url: ORGANIZATION_JSON_LD.url },
      publisher: ORGANIZATION_JSON_LD,
    },
    faqJsonLd(article.faq),
    breadcrumbJsonLd(crumbs),
  ];

  return (
    <PageShell>
      <JsonLd data={jsonLd} />
      <PageHero narrow crumbs={crumbs} title={article.title} titleInTrail={false}>
        <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-base text-white/80">
          {category ? (
            <a href={categoryPath(category.slug)} className="focus-ring-dark rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-white/25">
              {category.label}
            </a>
          ) : null}
          <span>{AUTHOR}</span>
          <span>
            Publié le <time dateTime={article.published}>{longDate(article.published)}</time>
          </span>
          {article.updated && article.updated !== article.published ? (
            <span>
              Mis à jour le <time dateTime={article.updated}>{longDate(article.updated)}</time>
            </span>
          ) : null}
          <span>{readingMinutes(article)} min de lecture</span>
        </p>
      </PageHero>

      <article className="bg-white">
        <div className="mx-auto max-w-3xl px-5 py-12 md:py-16">
          <div className="[&>p:first-child]:mt-0 [&>p:first-child]:text-xl [&>p:first-child]:leading-relaxed [&>p:first-child]:text-ink-900">
            <Blocks blocks={article.intro} />
          </div>

          <nav aria-label="Sommaire" className="mt-10 rounded-3xl border border-cream-200 bg-cream-100 px-6 py-6 sm:px-8">
            <h2 className="font-title text-lg font-bold text-ink-900">Sommaire</h2>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-[1.0625rem] marker:font-semibold marker:text-primary-700">
              {article.sections.map((section) => (
                <li key={section.title} className="pl-1">
                  <a href={`#${anchorId(section.title)}`} className="focus-ring inline-flex min-h-9 items-center rounded text-ink-900 underline decoration-cream-300 underline-offset-4 hover:text-primary-700 hover:decoration-primary-400">
                    {inline(section.title)}
                  </a>
                </li>
              ))}
              <li className="pl-1">
                <a href="#questions-frequentes" className="focus-ring inline-flex min-h-9 items-center rounded text-ink-900 underline decoration-cream-300 underline-offset-4 hover:text-primary-700 hover:decoration-primary-400">
                  Questions fréquentes
                </a>
              </li>
            </ol>
          </nav>

          {article.sections.map((section) => (
            <section key={section.title} aria-labelledby={anchorId(section.title)} className="mt-12">
              <h2 id={anchorId(section.title)} className="font-display text-[1.75rem] leading-tight font-bold text-balance text-ink-900 sm:text-[2rem]">
                {inline(section.title)}
              </h2>
              <Blocks blocks={section.blocks} />
            </section>
          ))}

          <section aria-labelledby="questions-frequentes" className="mt-14">
            <h2 id="questions-frequentes" className="font-display text-[1.75rem] leading-tight font-bold text-ink-900 sm:text-[2rem]">
              Questions fréquentes
            </h2>
            <div className="mt-6">
              <FaqList faq={article.faq} />
            </div>
          </section>

          <div className="mt-14">
            <CtaBand
              title="Vous préférez vous concentrer sur vos séances ?"
              text="Harmony prépare votre site, vos articles et vos contenus, et **vous gardez la main** sur tout ce qui paraît. La démo de votre futur site est gratuite."
              secondary={{ href: "/#tarifs", label: "Voir les tarifs" }}
            />
          </div>
        </div>
      </article>

      {related.length > 0 ? (
        <section className="bg-cream-100">
          <div className="mx-auto max-w-6xl px-5 py-14 md:py-16">
            <h2 className="font-display text-3xl leading-[1.15] font-bold text-ink-900 sm:text-[2.35rem]">Articles liés</h2>
            <ul className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <li key={item.slug}>
                  <ArticleCard article={item} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
