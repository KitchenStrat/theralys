import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateFr } from "@theralys/shared";
import { getPublishedArticles, getSiteByKey, hasBlogAccess, siteBaseUrl } from "@/lib/site-data";

type Props = { params: Promise<{ site: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site: siteKey } = await params;
  const site = await getSiteByKey(siteKey);
  if (!site) return {};
  return {
    title: "Blog",
    description: `Les conseils bien-être de ${site.name}.`,
    alternates: { canonical: `${siteBaseUrl(site)}/blog` },
  };
}

export default async function BlogIndexPage({ params }: Props) {
  const { site: siteKey } = await params;
  const site = await getSiteByKey(siteKey);
  if (!site) notFound();
  // Formule sans blog (Starter) : la rubrique n'existe pas sur le site public
  if (!hasBlogAccess(site)) notFound();
  const articles = await getPublishedArticles(site.id);

  return (
    <main className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="text-4xl font-bold">Le blog</h1>
      <p className="mt-3 opacity-75">Conseils et repères bien-être, publiés régulièrement.</p>

      {articles.length === 0 ? (
        <p className="mt-10 opacity-70">Les premiers articles arrivent bientôt.</p>
      ) : (
        <div className="mt-10 space-y-5">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/${siteKey}/blog/${article.slug}`}
              className="flex gap-5 rounded-[var(--r-lg)] border border-black/5 bg-[var(--site-surface)] p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              {article.imageUrl ? (
                <img
                  src={article.imageUrl}
                  alt=""
                  className="hidden h-32 w-44 shrink-0 rounded-[var(--r-md)] object-cover sm:block"
                />
              ) : null}
              <span className="min-w-0">
                <p className="text-sm opacity-60">
                  {article.publishedAt ? formatDateFr(article.publishedAt) : null}
                  {" · "}
                  {article.readingTimeMin} min de lecture
                </p>
                <h2 className="mt-2 text-xl font-semibold hover:text-[var(--site-primary)]">
                  {article.title}
                </h2>
                {article.excerpt ? <p className="mt-2 text-sm opacity-75">{article.excerpt}</p> : null}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
