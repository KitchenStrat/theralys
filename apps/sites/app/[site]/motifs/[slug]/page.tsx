import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Sections } from "@/components/sections";
import { getMotifPage, getReviews, getSiteByKey, siteBaseUrl } from "@/lib/site-data";

type Props = { params: Promise<{ site: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site: siteKey, slug } = await params;
  const site = await getSiteByKey(siteKey);
  if (!site) return {};
  const page = await getMotifPage(site, slug);
  if (!page) return {};
  return {
    title: { absolute: page.metaTitle ?? page.title },
    description: page.metaDescription ?? undefined,
    alternates: { canonical: `${siteBaseUrl(site)}/motifs/${slug}` },
    openGraph: {
      title: page.metaTitle ?? page.title,
      description: page.metaDescription ?? undefined,
      type: "website",
      locale: "fr_FR",
    },
  };
}

export default async function MotifPage({ params }: Props) {
  const { site: siteKey, slug } = await params;
  const site = await getSiteByKey(siteKey);
  if (!site) notFound();
  const page = await getMotifPage(site, slug);
  if (!page) notFound();

  const reviews = await getReviews(site.id);

  return (
    <main>
      <Sections
        sections={page.sections}
        ctx={{ site, prefix: `/${siteKey}`, reviews, googleRating: null, googleReviewCount: null }}
      />
    </main>
  );
}
