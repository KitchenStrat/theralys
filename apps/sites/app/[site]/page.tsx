import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Sections } from "@/components/sections";
import {
  getHomePage,
  getMotifPages,
  getProspect,
  getReviews,
  getSiteByKey,
  siteBaseUrl,
} from "@/lib/site-data";
import { localBusinessJsonLd } from "@/lib/seo";

type Props = { params: Promise<{ site: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site: siteKey } = await params;
  const site = await getSiteByKey(siteKey);
  if (!site) return {};
  const home = await getHomePage(site.id);
  const title = home?.metaTitle ?? site.name;
  const description = home?.metaDescription ?? undefined;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: siteBaseUrl(site) },
    openGraph: {
      title,
      description,
      type: "website",
      url: siteBaseUrl(site),
      siteName: site.name,
      locale: "fr_FR",
    },
  };
}

export default async function HomePage({ params }: Props) {
  const { site: siteKey } = await params;
  const site = await getSiteByKey(siteKey);
  if (!site) notFound();
  const home = await getHomePage(site.id);
  if (!home) notFound();

  const [reviews, prospect, motifPages] = await Promise.all([
    getReviews(site.id),
    getProspect(site.prospectId),
    getMotifPages(site),
  ]);

  const googleRating =
    prospect?.googleRating ?? (reviews.length > 0 ? averageRating(reviews) : null);
  const googleReviewCount = prospect?.googleReviewCount ?? (reviews.length || null);

  const jsonLd = localBusinessJsonLd({
    site,
    prospect,
    url: siteBaseUrl(site),
    ratingValue: googleRating,
    reviewCount: googleReviewCount,
  });

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Sections
        sections={home.sections}
        ctx={{
          site,
          prefix: `/${siteKey}`,
          reviews,
          googleRating,
          googleReviewCount,
          googlePlaceId: prospect?.googlePlaceId ?? null,
          googleBusinessName: prospect?.googleBusinessName ?? null,
          googleAddress: prospect?.googleAddress ?? null,
          googlePhotoUrl: prospect?.googlePhotoUrl ?? null,
          allowedMotifSlugs: motifPages.map((p) => p.slug),
        }}
      />
    </main>
  );
}

function averageRating(reviews: { rating: number }[]): number {
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return Math.round(avg * 10) / 10;
}
