import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateFr, verifyPreviewToken, type PageSections } from "@theralys/shared";
import { Markdown } from "@/components/markdown";
import { RdvButton } from "@/components/rdv-button";
import { splitArticleFaq } from "@/lib/article-faq";
import {
  getArticleBySlug,
  getHomePage,
  getProspect,
  getRelatedArticles,
  getSiteByKey,
  siteBaseUrl,
} from "@/lib/site-data";

type Props = {
  params: Promise<{ site: string; slug: string }>;
  searchParams: Promise<{ preview_token?: string }>;
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { site: siteKey, slug } = await params;
  const site = await getSiteByKey(siteKey);
  if (!site) return {};
  const article = await getArticleBySlug(site.id, slug);
  if (!article || article.status !== "published") return {};
  return {
    title: article.title,
    description: article.excerpt ?? undefined,
    alternates: { canonical: `${siteBaseUrl(site)}/blog/${slug}` },
    openGraph: {
      title: article.title,
      description: article.excerpt ?? undefined,
      type: "article",
      locale: "fr_FR",
    },
  };
}

/**
 * Article de blog — structure éditoriale uniforme : image d'en-tête, méta,
 * carte auteur, contenu, bannière « Vous vous reconnaissez ? », FAQ en
 * accordéons (extraite du markdown), articles similaires.
 * Les articles non publiés restent accessibles via `?preview_token=`.
 */
export default async function ArticlePage({ params, searchParams }: Props) {
  const { site: siteKey, slug } = await params;
  const { preview_token: previewToken } = await searchParams;

  const site = await getSiteByKey(siteKey);
  if (!site) notFound();
  const article = await getArticleBySlug(site.id, slug);
  if (!article) notFound();

  let isPreview = false;
  if (article.status !== "published") {
    const secret = process.env.AUTH_SECRET;
    if (!previewToken || !secret) notFound();
    const payload = await verifyPreviewToken(previewToken, secret);
    if (!payload || payload.articleId !== article.id || payload.siteId !== site.id) {
      notFound();
    }
    isPreview = true;
  }

  const [home, prospect, related] = await Promise.all([
    getHomePage(site.id),
    getProspect(site.prospectId),
    getRelatedArticles(site.id, article.id, article.motifSlug),
  ]);
  const about = (home?.sections as PageSections | undefined)?.find(
    (s): s is Extract<PageSections[number], { type: "about" }> => s.type === "about",
  );
  const authorPhoto = about?.imageUrl;
  const authorName = prospect ? `${prospect.firstName} ${prospect.lastName}` : site.name;
  const authorLine = [prospect?.profession, prospect?.city].filter(Boolean).join(" · ");

  const { body, faq } = splitArticleFaq(article.content);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      {isPreview ? (
        <p className="mb-8 rounded-[var(--r-md)] bg-[var(--site-soft)] px-5 py-3 text-sm">
          <strong>Prévisualisation</strong> — cet article n&apos;est pas encore publié. Ne partagez
          ce lien qu&apos;avec des personnes de confiance.
        </p>
      ) : null}

      {article.imageUrl ? (
        <figure>
          <img
            src={article.imageUrl}
            alt=""
            className="aspect-[16/9] w-full rounded-[var(--r-xl)] object-cover"
          />
          <figcaption className="mt-2 text-right text-xs opacity-50">
            Photo d&apos;illustration
          </figcaption>
        </figure>
      ) : null}

      <p className="mt-8 text-sm opacity-60">
        {article.publishedAt ? `${formatDateFr(article.publishedAt)} · ` : null}
        {article.readingTimeMin} min de lecture
      </p>
      <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-[2.9rem]">{article.title}</h1>

      <div className="mt-6 flex items-center gap-3 border-b border-[var(--site-primary)]/15 pb-6">
        {authorPhoto ? (
          <img src={authorPhoto} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : null}
        <div>
          <p className="font-semibold">{authorName}</p>
          {authorLine ? <p className="text-sm opacity-60">{authorLine}</p> : null}
        </div>
      </div>

      <article className="mt-8">
        <Markdown content={body} />
      </article>

      {faq.length > 0 ? (
        <section className="mt-12">
          <h2
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            Questions fréquentes
          </h2>
          <div className="mt-5 space-y-3">
            {faq.map((item, i) => (
              <details
                key={i}
                className="group overflow-hidden rounded-[var(--r-md)] open:bg-[var(--site-surface)] open:shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--r-md)] bg-[var(--site-primary)] px-6 py-4 font-medium text-white transition-colors group-open:rounded-b-none group-open:bg-[var(--site-soft)] group-open:text-[var(--site-text)] hover:bg-[var(--site-primary-dark)] group-open:hover:bg-[var(--site-soft)]">
                  {item.question}
                  <span aria-hidden className="shrink-0 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="whitespace-pre-line px-6 py-4 leading-relaxed opacity-80">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-12 rounded-[var(--r-lg)] bg-[var(--site-soft)]/60 p-8 text-center">
        <h2
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--site-font-heading)" }}
        >
          Vous vous reconnaissez dans cet article ?
        </h2>
        <div className="mx-auto mt-4 flex items-center justify-center gap-3">
          {authorPhoto ? (
            <img src={authorPhoto} alt="" className="h-11 w-11 rounded-full object-cover" />
          ) : null}
          <div className="text-left">
            <p className="text-sm font-semibold">{authorName}</p>
            {authorLine ? <p className="text-xs opacity-60">{authorLine}</p> : null}
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-md text-[0.95rem] opacity-80">
          Si cet article fait écho à votre situation, chaque consultation
          {prospect?.city ? ` au cabinet à ${prospect.city}` : ""} est adaptée à vos besoins.
        </p>
        <div className="mt-6">
          <RdvButton siteId={site.id} bookingUrl={site.bookingUrl} />
        </div>
      </section>

      {related.length > 0 ? (
        <section className="mt-14">
          <h2
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--site-font-heading)" }}
          >
            Articles similaires
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {related.map((item) => (
              <Link
                key={item.id}
                href={`/${siteKey}/blog/${item.slug}`}
                className="group overflow-hidden rounded-[var(--r-md)] bg-[var(--site-surface)] shadow-sm transition-transform hover:-translate-y-0.5"
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="aspect-[16/9] w-full object-cover"
                  />
                ) : (
                  <div className="aspect-[16/9] w-full bg-[var(--site-soft)]" />
                )}
                <p className="line-clamp-2 p-4 text-sm font-semibold group-hover:text-[var(--site-primary)]">
                  {item.title}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-10 text-sm">
        <Link href={`/${siteKey}/blog`} className="text-[var(--site-primary)] underline">
          ← Tous les articles
        </Link>
      </p>
    </main>
  );
}
