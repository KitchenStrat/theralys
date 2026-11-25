import type { Metadata } from "next";
import { SectionAction } from "@/components/pages/cta";
import { ArticleCard, CtaBand, JsonLd, PageHero, PageShell } from "@/components/pages/shell";
import { inline } from "@/components/pages/prose";
import { ARTICLES, articleCount, articlePath, articlesIn, categoryPath } from "@/content/articles";
import { BLOG_CATEGORIES } from "@/content/blog";
import { PROFESSIONS, professionPath } from "@/content/professions";
import { ORGANIZATION_JSON_LD, absoluteUrl, breadcrumbJsonLd, pageMetadata, plainText, type Crumb } from "@/lib/site";

const TITLE = "Le blog des thérapeutes qui veulent être trouvés";
const DESCRIPTION = "Fiche Google, site internet, avis, réseaux sociaux, publicité : des guides concrets pour faire connaître un cabinet, écrits pour les thérapeutes.";
const CRUMBS: Crumb[] = [
  { label: "Accueil", href: "/" },
  { label: "Blog", href: "/blog" },
];

export const metadata: Metadata = pageMetadata({ title: "Blog : faire connaître son cabinet de thérapeute", description: DESCRIPTION, path: "/blog" });

const H2 = "font-display text-3xl leading-[1.15] font-bold text-balance text-ink-900 sm:text-[2.35rem]";

/** Le blog de la vitrine : thématiques, article à la une, tous les articles, puis les guides par métier. */
export default function BlogPage() {
  const [featured] = ARTICLES;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Le blog Harmony",
      description: DESCRIPTION,
      url: absoluteUrl("/blog"),
      inLanguage: "fr-FR",
      publisher: ORGANIZATION_JSON_LD,
      blogPost: ARTICLES.map((article) => ({
        "@type": "BlogPosting",
        headline: plainText(article.title),
        url: absoluteUrl(articlePath(article)),
        datePublished: article.published,
        dateModified: article.updated ?? article.published,
      })),
    },
    breadcrumbJsonLd(CRUMBS),
  ];

  return (
    <PageShell>
      <JsonLd data={jsonLd} />
      <PageHero crumbs={CRUMBS} title={TITLE} lead="Des guides concrets pour faire connaître votre cabinet : **à appliquer seul**, ou à nous confier." />

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 md:py-16">
          <h2 className={H2}>Les thématiques du blog</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BLOG_CATEGORIES.map((category) => (
              <li key={category.slug}>
                <a
                  href={categoryPath(category.slug)}
                  className="focus-ring group flex h-full flex-col rounded-3xl border border-cream-200 bg-cream-50 p-6 transition-[border-color,background-color] hover:border-primary-300 hover:bg-white"
                >
                  <h3 className="font-title text-lg leading-snug font-bold text-ink-900 group-hover:text-primary-800">{category.label}</h3>
                  <p className="mt-2 flex-1 text-base leading-relaxed text-ink-700">{inline(category.description)}</p>
                  <p className="mt-4 text-sm font-semibold text-primary-700">{articleCount(articlesIn(category.slug).length)}</p>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {featured ? (
        <section className="bg-cream-100">
          <div className="mx-auto max-w-6xl px-5 py-14 md:py-16">
            <h2 className={H2}>À la une</h2>
            <div className="mt-8">
              <ArticleCard article={featured} featured />
            </div>
            <SectionAction text="Envie que ces conseils soient appliqués pour vous ?" />
          </div>
        </section>
      ) : null}

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 md:py-16">
          <h2 className={H2}>Tous les articles</h2>
          <ul className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {ARTICLES.map((article) => (
              <li key={article.slug}>
                <ArticleCard article={article} />
              </li>
            ))}
          </ul>
          <SectionAction text="Harmony écrit aussi les articles de votre cabinet." />
        </div>
      </section>

      <section className="bg-cream-100">
        <div className="mx-auto max-w-6xl px-5 py-14 md:py-16">
          <h2 className={H2}>Guides par métier</h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-700">Ce qu&apos;un site doit contenir, comment on vous cherche, le cadre à respecter : un guide pour chaque pratique.</p>
          <ul className="mt-7 flex flex-wrap gap-2.5">
            {PROFESSIONS.map((profession) => (
              <li key={profession.slug}>
                <a
                  href={professionPath(profession)}
                  className="focus-ring inline-flex min-h-11 items-center rounded-full border border-cream-300 bg-white px-5 py-2.5 text-base font-medium text-ink-900 transition-[border-color,color] hover:border-primary-400 hover:text-primary-700"
                >
                  Site internet {profession.of}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 md:py-16">
          <CtaBand
            title="Et si tout cela se faisait sans vous ?"
            text="Site, blog, fiche Google, réseaux sociaux : Harmony prépare le travail, **vous gardez la main**. Demandez une démo de votre futur site, gratuite et sans engagement."
            secondary={{ href: "/creation-site-internet", label: "Voir par métier" }}
          />
        </div>
      </section>
    </PageShell>
  );
}
