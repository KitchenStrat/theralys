/**
 * Brief de site pour l'IA de la fiche Google (analyse des avis, posts) —
 * copie minimale, côté jobs, de `apps/studio/lib/social/brief.ts` : requêtes
 * drizzle (site, fiche praticien, pages accueil + motifs, articles en ligne ou
 * planifiés, avis Google des sites clients, voix et consignes du
 * « Paramétrage ») puis `buildSocialBrief` (fonction pure de
 * `@theralys/shared`). Les jobs ne dépendent jamais du studio.
 *
 * Quand le site du client est la référence des outils, ce sont son profil et
 * son adresse qui alimentent le brief : la règle vit une seule fois, dans
 * `briefPagesFor` (`external-site.ts`), que le studio appelle aussi.
 */

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import {
  blogArticles,
  blogSettings,
  googleReviews,
  pages,
  prospects,
  sites,
  socialSettings,
  type Database,
  type Site,
} from "@theralys/db";
import { resolveProfession } from "@theralys/ai";
import {
  DEFAULT_SOCIAL_VOICE,
  buildSocialBrief,
  cleanSocialInstructions,
  referenceSiteUrl,
  type SocialBriefResult,
  type SocialVoice,
} from "@theralys/shared";
import { briefPagesFor } from "./external-site";

/** Articles transmis au brief (il n'en garde que 8, les plus récents). */
const ARTICLES_LIMIT = 12;
/** Avis transmis au brief (il n'en garde que 6, après filtrage du texte). */
const REVIEWS_LIMIT = 20;

/**
 * Adresse du site hébergé : domaine personnalisé, sinon SITES_BASE_URL + slug
 * (même règle que le studio). C'est là que vivent les pages et les articles
 * servis par la plateforme ; l'adresse donnée aux outils est `publicSiteUrl`.
 */
export function siteUrl(site: Pick<Site, "slug" | "domain">, env: NodeJS.ProcessEnv = process.env): string {
  if (site.domain) return `https://${site.domain}`;
  const base = env.SITES_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/${site.slug}`;
}

/**
 * Adresse publique de référence d'un site : celle du site du client quand il
 * est la référence des outils (`sites.theme.externalSite` actif), sinon celle
 * du site hébergé (`siteUrl`). C'est l'adresse à donner aux outils — liens,
 * légendes, pages d'atterrissage, audit de la fiche Google ; tout ce qui
 * désigne le site hébergé lui-même (aperçu, articles du blog) garde `siteUrl`.
 */
export function publicSiteUrl(site: Pick<Site, "slug" | "domain" | "theme">, env: NodeJS.ProcessEnv = process.env): string {
  return referenceSiteUrl(siteUrl(site, env), site.theme);
}

type VoiceColumns = {
  voiceDesignation: SocialVoice["designation"];
  voiceAccord: SocialVoice["accord"];
  voiceReader: SocialVoice["reader"];
  voiceTone: SocialVoice["tone"];
};

function voiceOf(row: VoiceColumns): SocialVoice {
  return {
    designation: row.voiceDesignation,
    accord: row.voiceAccord,
    reader: row.voiceReader,
    tone: row.voiceTone,
  };
}

/**
 * Brief d'un site : `social_settings` fait foi (voix + consignes), sinon la
 * voix du blog, sinon la voix par défaut accordée au genre du prospect.
 * Pages et adresse : celles du site du client quand il est la référence,
 * sinon celles du site hébergé (`briefPagesFor`) ; les articles et les avis
 * sont toujours ceux de la plateforme.
 */
export async function loadGoogleBrief(db: Database, siteId: string, now = new Date()): Promise<SocialBriefResult> {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error(`Site introuvable : ${siteId}`);
  const [prospect, sitePages, articles, reviews, social, blog] = await Promise.all([
    site.prospectId
      ? db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) })
      : Promise.resolve(undefined),
    db.query.pages.findMany({
      where: and(eq(pages.siteId, siteId), inArray(pages.type, ["home", "motif"])),
      columns: { id: true, type: true, slug: true, title: true, metaDescription: true, sections: true },
    }),
    db.query.blogArticles.findMany({
      where: and(eq(blogArticles.siteId, siteId), inArray(blogArticles.status, ["published", "scheduled"])),
      orderBy: [desc(blogArticles.publishAt)],
      limit: ARTICLES_LIMIT,
      columns: { id: true, slug: true, title: true, excerpt: true, content: true, imageUrl: true, status: true, publishAt: true },
    }),
    // Les avis ne servent qu'aux sites clients (jamais en démo)
    site.type === "client"
      ? db.query.googleReviews.findMany({
          where: and(eq(googleReviews.siteId, siteId), gte(googleReviews.rating, 4)),
          orderBy: [desc(googleReviews.reviewedAt)],
          limit: REVIEWS_LIMIT,
          columns: { id: true, authorName: true, rating: true, text: true },
        })
      : Promise.resolve([]),
    db.query.socialSettings.findFirst({ where: eq(socialSettings.siteId, siteId) }),
    db.query.blogSettings.findFirst({ where: eq(blogSettings.siteId, siteId) }),
  ]);

  const voice: SocialVoice = social
    ? voiceOf(social)
    : blog
      ? voiceOf(blog)
      : { ...DEFAULT_SOCIAL_VOICE, accord: prospect?.gender ?? DEFAULT_SOCIAL_VOICE.accord };

  const source = await briefPagesFor(db, site, sitePages, siteUrl(site));

  return buildSocialBrief({
    site: {
      id: site.id,
      name: site.name,
      type: site.type,
      theme: source.theme,
      bookingUrl: site.bookingUrl,
      url: source.url,
      hostedUrl: source.hostedUrl,
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
    pages: source.pages,
    articles,
    reviews,
    voice,
    instructions: social ? cleanSocialInstructions(social.instructions) : null,
    practiceName: resolveProfession(prospect?.profession ?? site.name).practiceName,
    now,
  });
}
