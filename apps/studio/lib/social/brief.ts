/**
 * Brief de site pour la génération des contenus réseaux sociaux : requêtes
 * drizzle (site, fiche praticien, pages accueil + motifs, articles en ligne ou
 * planifiés, avis Google des sites clients, voix du blog) puis
 * `buildSocialBrief` (fonction pure de `@theralys/shared`, testée sans base).
 */

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { blogArticles, blogSettings, getDb, googleReviews, pages } from "@theralys/db";
import { resolveProfession } from "@theralys/ai";
import { buildSocialBrief, type SocialBriefResult, type SocialVoice } from "@theralys/shared";
import { getProspect, getSite, siteUrl } from "@/lib/data";

/** Articles transmis au brief (il n'en garde que 8, triés par date de publication). */
const ARTICLES_LIMIT = 12;
/** Avis transmis au brief (il n'en garde que 6, après filtrage du texte). */
const REVIEWS_LIMIT = 20;

export async function loadSocialBrief(siteId: string): Promise<SocialBriefResult> {
  const db = getDb();
  const site = await getSite(siteId);
  const [prospect, sitePages, articles, reviews, settings] = await Promise.all([
    getProspect(site),
    db.query.pages.findMany({
      where: and(eq(pages.siteId, siteId), inArray(pages.type, ["home", "motif"])),
      columns: { id: true, type: true, slug: true, title: true, metaDescription: true, sections: true },
    }),
    db.query.blogArticles.findMany({
      where: and(
        eq(blogArticles.siteId, siteId),
        inArray(blogArticles.status, ["published", "scheduled"]),
      ),
      orderBy: [desc(blogArticles.publishAt)],
      limit: ARTICLES_LIMIT,
      columns: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        content: true,
        imageUrl: true,
        status: true,
        publishAt: true,
      },
    }),
    // Les avis ne servent qu'aux sites clients (jamais en démo) : on ne les lit pas sinon
    site.type === "client"
      ? db.query.googleReviews.findMany({
          where: and(eq(googleReviews.siteId, siteId), gte(googleReviews.rating, 4)),
          orderBy: [desc(googleReviews.reviewedAt)],
          limit: REVIEWS_LIMIT,
          columns: { id: true, authorName: true, rating: true, text: true },
        })
      : Promise.resolve([]),
    db.query.blogSettings.findFirst({
      where: eq(blogSettings.siteId, siteId),
      columns: { voiceDesignation: true, voiceAccord: true, voiceReader: true, voiceTone: true },
    }),
  ]);

  // Voix du blog ; sinon buildSocialBrief applique DEFAULT_SOCIAL_VOICE accordé au genre
  const voice: SocialVoice | null = settings
    ? {
        designation: settings.voiceDesignation,
        accord: settings.voiceAccord,
        reader: settings.voiceReader,
        tone: settings.voiceTone,
      }
    : null;

  return buildSocialBrief({
    site: {
      id: site.id,
      name: site.name,
      type: site.type,
      theme: site.theme,
      bookingUrl: site.bookingUrl,
      url: siteUrl(site),
    },
    prospect: prospect
      ? {
          firstName: prospect.firstName,
          lastName: prospect.lastName,
          profession: prospect.profession,
          city: prospect.city,
          gender: prospect.gender,
          googleRating: prospect.googleRating,
          googleReviewCount: prospect.googleReviewCount,
        }
      : null,
    pages: sitePages,
    articles,
    reviews,
    voice,
    practiceName: resolveProfession(prospect?.profession ?? site.name).practiceName,
  });
}
