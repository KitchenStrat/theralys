import type { Site } from "@theralys/db";
import type { Prospect } from "@theralys/db";

/**
 * Données structurées LocalBusiness (schema.org) pour la page d'accueil.
 */
export function localBusinessJsonLd(opts: {
  site: Site;
  prospect: Prospect | null;
  url: string;
  ratingValue?: number | null;
  reviewCount?: number | null;
}): Record<string, unknown> {
  const { site, prospect, url, ratingValue, reviewCount } = opts;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    name: site.name,
    url,
    ...(prospect
      ? {
          address: {
            "@type": "PostalAddress",
            addressLocality: prospect.city,
            addressCountry: "FR",
          },
        }
      : {}),
  };
  if (ratingValue && reviewCount) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue,
      reviewCount,
      bestRating: 5,
    };
  }
  if (site.bookingUrl) {
    jsonLd.potentialAction = {
      "@type": "ReserveAction",
      target: site.bookingUrl,
    };
  }
  return jsonLd;
}
