import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Sections } from "@/components/sections";
import { composeMotifSections } from "@/lib/editor-refs";
import { NOT_FOUND_METADATA } from "@/lib/not-found";
import {
  getHomePage,
  getMotifPage,
  getProspect,
  getReviews,
  getSiteByKey,
  siteBaseUrl,
} from "@/lib/site-data";

type Props = { params: Promise<{ site: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site: siteKey, slug } = await params;
  const site = await getSiteByKey(siteKey);
  if (!site) return {};
  const preview = (await headers()).get("x-hy-preview") === site.id;
  const page = await getMotifPage(site, slug, { includeDisabled: preview });
  // Page inconnue ou désactivée (hors aperçu) : métadonnées de la 404
  if (!page) return NOT_FOUND_METADATA;
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
  // Aperçu depuis l'éditeur du studio (jeton signé `?apercu=`, vérifié par le
  // middleware) : les pages désactivées restent prévisualisables et les
  // sections masquées s'affichent en barre « Section masquée »
  const preview = (await headers()).get("x-hy-preview") === site.id;
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
  // vérité, éditée une fois pour tout), CTA retirés — cf. composeMotifSections.
  // Les refs transmises à l'éditeur gardent l'index d'origine de chaque section
  // propre (dans page.sections) et marquent reviews/contact comme hérités.
  const { sections, refs } = composeMotifSections(page.sections, home?.sections);

  return (
    <main>
      <Sections
        sections={sections}
        editorRefs={refs}
        preview={preview}
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
