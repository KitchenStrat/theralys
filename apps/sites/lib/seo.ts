import type { Site } from "@theralys/db";
import type { Prospect } from "@theralys/db";
import type { SiteSocialLinks } from "@theralys/shared";

/** URL de réseau social publiable : absolue en http(s), espaces retirés. */
function isPublicUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^https?:\/\/\S+$/i.test(value.trim());
}

/** URLs des réseaux sociaux renseignés dans le studio (`theme.social`). */
export function socialProfileUrls(social: SiteSocialLinks | null | undefined): string[] {
  if (!social) return [];
  return Object.values(social)
    .filter(isPublicUrl)
    .map((url) => url.trim());
}

/**
 * Données structurées LocalBusiness (schema.org) pour la page d'accueil.
 * `telephone`/`email` viennent de la section Contact de l'accueil ; `sameAs`
 * des réseaux sociaux du thème.
 */
export function localBusinessJsonLd(opts: {
  site: Site;
  prospect: Prospect | null;
  url: string;
  ratingValue?: number | null;
  reviewCount?: number | null;
  telephone?: string | null;
  email?: string | null;
}): Record<string, unknown> {
  const { site, prospect, url, ratingValue, reviewCount, telephone, email } = opts;
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
  if (telephone?.trim()) jsonLd.telephone = telephone.trim();
  if (email?.trim()) jsonLd.email = email.trim();
  const sameAs = socialProfileUrls(site.theme.social);
  if (sameAs.length > 0) jsonLd.sameAs = sameAs;
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
