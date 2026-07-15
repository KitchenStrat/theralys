import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateFr, verifyPreviewToken } from "@theralys/shared";
import { Markdown } from "@/components/markdown";
import { RdvButton } from "@/components/rdv-button";
import { getArticleBySlug, getSiteByKey, siteBaseUrl } from "@/lib/site-data";

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
 * Article de blog. Les articles non publiés (brouillon/planifié/retiré) sont
 * accessibles uniquement avec un `?preview_token=` valide (JWT signé
 * contenant articleId, siteId et expiration).
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-14">
      {isPreview ? (
        <p className="mb-8 rounded-2xl bg-[var(--site-soft)] px-5 py-3 text-sm">
          <strong>Prévisualisation</strong> — cet article n&apos;est pas encore publié. Ne partagez
          ce lien qu&apos;avec des personnes de confiance.
        </p>
      ) : null}

      <p className="text-sm opacity-60">
        {article.publishedAt ? `${formatDateFr(article.publishedAt)} · ` : null}
        {article.readingTimeMin} min de lecture
      </p>
      <h1 className="mt-3 text-4xl font-bold leading-tight">{article.title}</h1>

      <article className="mt-8">
        <Markdown content={article.content} />
      </article>

      <div className="mt-12 rounded-3xl bg-[var(--site-soft)]/60 p-6 text-center">
        <p className="font-medium">Envie de passer à la pratique ?</p>
        <div className="mt-4">
          <RdvButton siteId={site.id} bookingUrl={site.bookingUrl} />
        </div>
      </div>

      <p className="mt-10 text-sm">
        <Link href={`/${siteKey}/blog`} className="text-[var(--site-primary)] underline">
          ← Tous les articles
        </Link>
      </p>
    </main>
  );
}
