/**
 * Contexte de rendu d'un site : thème, marque (prospect), domaine, note
 * Google, adresse — et note de l'avis cité pour le template « avis ».
 * Seul module du rendu qui lit la base (hors cache Blob).
 */

import { and, eq } from "drizzle-orm";
import { getDb, googleReviews, type Prospect, type Site } from "@theralys/db";
import type { SocialPostContent } from "@theralys/shared";
import { getProspect, getSite, siteUrl } from "@/lib/data";
import type { BrandInfo } from "./chrome";
import type { RenderContext } from "./render";

/** Marque affichée sur les visuels : prospect, sinon le nom du site. */
export function brandOf(site: Pick<Site, "name">, prospect: Prospect | null): BrandInfo {
  if (prospect) {
    return {
      firstName: prospect.firstName,
      lastName: prospect.lastName,
      profession: prospect.profession,
      city: prospect.city,
    };
  }
  const [name = site.name] = site.name.split(",");
  return { firstName: name.trim(), lastName: "", profession: "", city: "" };
}

/** Domaine public sans protocole (« claire-dupont.harmony-web.fr »). */
export function domainOf(site: Site): string {
  return siteUrl(site).replace(/^https?:\/\//, "");
}

/** Adresse du cabinet : premier cabinet saisi, sinon adresse de la fiche Google. */
export function addressOf(site: Pick<Site, "theme">, prospect: Prospect | null): string | null {
  const cabinet = site.theme.cabinets?.[0];
  if (cabinet?.address) {
    return [cabinet.address, [cabinet.postalCode, cabinet.city].filter(Boolean).join(" ")]
      .filter((s) => s.trim() !== "")
      .join(", ");
  }
  return prospect?.googleAddress ?? null;
}

export function buildRenderContext(site: Site, prospect: Prospect | null): RenderContext {
  const google =
    prospect?.googleRating && prospect.googleReviewCount
      ? { rating: prospect.googleRating, reviewCount: prospect.googleReviewCount }
      : null;
  return {
    siteTheme: site.theme,
    brand: brandOf(site, prospect),
    domain: domainOf(site),
    google,
    address: addressOf(site, prospect),
  };
}

export async function loadRenderContext(siteId: string): Promise<RenderContext> {
  const site = await getSite(siteId);
  const prospect = await getProspect(site);
  return buildRenderContext(site, prospect);
}

/** Note (1..5) de l'avis cité par un contenu « avis », via `sourceRefs` ; null sinon. */
export async function loadReviewRating(
  siteId: string,
  content: SocialPostContent,
): Promise<number | null> {
  const ref = content.sourceRefs.find((r) => r.kind === "review" && r.id.startsWith("review:"));
  const reviewId = ref?.id.slice("review:".length);
  if (!reviewId || !/^[0-9a-f-]{36}$/i.test(reviewId)) return null;
  const db = getDb();
  const review = await db.query.googleReviews.findFirst({
    where: and(eq(googleReviews.id, reviewId), eq(googleReviews.siteId, siteId)),
    columns: { rating: true },
  });
  return review?.rating ?? null;
}
