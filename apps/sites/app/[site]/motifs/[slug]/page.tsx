import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Section } from "@theralys/shared";
import { Sections } from "@/components/sections";
import {
  getHomePage,
  getMotifPage,
  getProspect,
  getReviews,
  getSiteByKey,
  siteBaseUrl,
} from "@/lib/site-data";

type Props = {
  params: Promise<{ site: string; slug: string }>;
  searchParams?: Promise<{ apercu?: string }>;
};

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

export default async function MotifPage({ params, searchParams }: Props) {
  const { site: siteKey, slug } = await params;
  const site = await getSiteByKey(siteKey);
  if (!site) notFound();
  // ?apercu=1 : l'éditeur du studio prévisualise aussi les pages désactivées
  const preview = (await searchParams)?.apercu === "1";
  const page = await getMotifPage(site, slug, { includeDisabled: preview });
  if (!page) notFound();

  const [reviews, prospect, home] = await Promise.all([
    getReviews(site.id),
    getProspect(site.prospectId),
    getHomePage(site.id),
  ]);

  const googleRating =
    prospect?.googleRating ?? (reviews.length > 0 ? averageRating(reviews) : null);
  const googleReviewCount = prospect?.googleReviewCount ?? (reviews.length || null);

  // Avis Google et contact hérités de la page d'accueil (une seule source de
  // vérité, éditée une fois pour tout) ; les avis s'insèrent AVANT la FAQ
  // (preuve sociale d'abord, questions ensuite), le contact reste en bas.
  // Le bandeau CTA des anciennes générations est retiré : redondant ici.
  const homeReviews = home?.sections.find((s): s is Extract<Section, { type: "reviews" }> => s.type === "reviews");
  const homeContact = home?.sections.find((s): s is Extract<Section, { type: "contact" }> => s.type === "contact");
  const pageSections = page.sections.filter((s) => s.type !== "cta");
  const reviewsSection: Section = homeReviews ?? { type: "reviews", title: "Ils me font confiance" };
  const faqIndex = pageSections.findIndex((s) => s.type === "faq");
  const sections: Section[] = [
    ...(faqIndex === -1 ? pageSections : pageSections.slice(0, faqIndex)),
    reviewsSection,
    ...(faqIndex === -1 ? [] : pageSections.slice(faqIndex)),
    ...(homeContact ? [homeContact] : []),
  ];

  return (
    <main>
      <Sections
        sections={sections}
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
        }}
      />
    </main>
  );
}

function averageRating(reviews: { rating: number }[]): number {
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return Math.round(avg * 10) / 10;
}
