/**
 * Brief de site pour la génération des contenus réseaux sociaux : requêtes
 * drizzle (site, fiche praticien, pages accueil + motifs, articles en ligne ou
 * planifiés, avis Google des sites clients, réglages « Paramétrage » : voix et
 * consignes) puis `buildSocialBrief` (fonction pure de `@theralys/shared`,
 * testée sans base).
 */

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { blogArticles, getDb, googleReviews, pages } from "@theralys/db";
import { resolveProfession } from "@theralys/ai";
import { buildSocialBrief, type SocialBriefResult } from "@theralys/shared";
import { getProspect, getSite, siteUrl } from "@/lib/data";
import { getSocialSettings, type SocialSettingsView } from "@/lib/social/settings";

/** Articles transmis au brief (il n'en garde que `BRIEF_ARTICLES_KEPT`, triés par date de publication). */
const ARTICLES_LIMIT = 12;
/** Articles conservés par `buildSocialBrief` (les plus récents) : les articles imposés y gardent leur place. */
const BRIEF_ARTICLES_KEPT = 8;
/** Avis transmis au brief (il n'en garde que 6, après filtrage du texte). */
const REVIEWS_LIMIT = 20;

const ARTICLE_COLUMNS = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  content: true,
  imageUrl: true,
  status: true,
  publishAt: true,
} as const;

export type LoadSocialBriefOptions = {
  /**
   * Articles à inclure d'office (ceux des créneaux « nouvel article » du mois
   * planifié) : sans eux, le générateur laisse ces créneaux libres.
   */
  includeArticleIds?: string[];
  /** Réglages déjà lus par l'appelant (évite une seconde lecture). */
  settings?: SocialSettingsView;
};

export async function loadSocialBrief(
  siteId: string,
  options: LoadSocialBriefOptions = {},
): Promise<SocialBriefResult> {
  const db = getDb();
  const site = await getSite(siteId);
  const requiredIds = [...new Set(options.includeArticleIds ?? [])];
  const [prospect, sitePages, recentArticles, requiredArticles, reviews, settings] = await Promise.all([
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
      columns: ARTICLE_COLUMNS,
    }),
    requiredIds.length > 0
      ? db.query.blogArticles.findMany({
          where: and(
            eq(blogArticles.siteId, siteId),
            inArray(blogArticles.id, requiredIds),
            inArray(blogArticles.status, ["published", "scheduled"]),
          ),
          columns: ARTICLE_COLUMNS,
        })
      : Promise.resolve([]),
    // Les avis ne servent qu'aux sites clients (jamais en démo) : on ne les lit pas sinon
    site.type === "client"
      ? db.query.googleReviews.findMany({
          where: and(eq(googleReviews.siteId, siteId), gte(googleReviews.rating, 4)),
          orderBy: [desc(googleReviews.reviewedAt)],
          limit: REVIEWS_LIMIT,
          columns: { id: true, authorName: true, rating: true, text: true },
        })
      : Promise.resolve([]),
    // Voix et consignes : social_settings, sinon voix du blog, sinon défaut accordé au genre
    options.settings ? Promise.resolve(options.settings) : getSocialSettings(siteId),
  ]);

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
    articles: mergeArticles(requiredArticles, recentArticles),
    reviews,
    voice: settings.voice,
    instructions: settings.instructions,
    practiceName: resolveProfession(prospect?.profession ?? site.name).practiceName,
  });
}

type BriefArticleRow = { id: string; content: string };

/**
 * Articles transmis au brief. Sans article imposé : les plus récents (le brief
 * en garde 8). Avec : les imposés, complétés des plus récents jusqu'à 8 au
 * total — `buildSocialBrief` ne tronque alors rien et les garde tous.
 */
export function mergeArticles<T extends BriefArticleRow>(required: T[], recent: T[]): T[] {
  if (required.length === 0) return recent;
  const requiredIds = new Set(required.map((a) => a.id));
  const others = recent
    .filter((a) => !requiredIds.has(a.id) && a.content.trim() !== "")
    .slice(0, Math.max(0, BRIEF_ARTICLES_KEPT - required.length));
  return [...required, ...others];
}
