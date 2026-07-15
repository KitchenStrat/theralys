import { and, desc, eq } from "drizzle-orm";
import {
  blogArticles,
  getDb,
  googleReviews,
  pages,
  prospects,
  sites,
  type BlogArticle,
  type Page,
  type Site,
} from "@theralys/db";

/**
 * Résout un site par clé de segment [site] :
 * - contient un point → domaine custom (Phase 3) ;
 * - sinon → slug (démos et dev).
 */
export async function getSiteByKey(key: string): Promise<Site | null> {
  const db = getDb();
  const decoded = decodeURIComponent(key);
  const site = decoded.includes(".")
    ? await db.query.sites.findFirst({ where: eq(sites.domain, decoded) })
    : await db.query.sites.findFirst({ where: eq(sites.slug, decoded) });
  return site ?? null;
}

export function isDemoExpired(site: Site): boolean {
  return (
    site.type === "demo" &&
    site.demoExpiresAt !== null &&
    site.demoExpiresAt.getTime() < Date.now()
  );
}

export async function getHomePage(siteId: string): Promise<Page | null> {
  const db = getDb();
  const page = await db.query.pages.findFirst({
    where: and(eq(pages.siteId, siteId), eq(pages.type, "home")),
  });
  return page ?? null;
}

export async function getMotifPages(siteId: string): Promise<Page[]> {
  const db = getDb();
  return db.query.pages.findMany({
    where: and(eq(pages.siteId, siteId), eq(pages.type, "motif")),
    orderBy: (p, { asc }) => [asc(p.position)],
  });
}

export async function getMotifPage(siteId: string, slug: string): Promise<Page | null> {
  const db = getDb();
  const page = await db.query.pages.findFirst({
    where: and(eq(pages.siteId, siteId), eq(pages.type, "motif"), eq(pages.slug, slug)),
  });
  return page ?? null;
}

export async function getReviews(siteId: string) {
  const db = getDb();
  return db.query.googleReviews.findMany({
    where: eq(googleReviews.siteId, siteId),
    orderBy: [desc(googleReviews.syncedAt)],
    limit: 12,
  });
}

export async function getPublishedArticles(siteId: string): Promise<BlogArticle[]> {
  const db = getDb();
  return db.query.blogArticles.findMany({
    where: and(eq(blogArticles.siteId, siteId), eq(blogArticles.status, "published")),
    orderBy: [desc(blogArticles.publishedAt)],
  });
}

export async function getArticleBySlug(siteId: string, slug: string): Promise<BlogArticle | null> {
  const db = getDb();
  const article = await db.query.blogArticles.findFirst({
    where: and(eq(blogArticles.siteId, siteId), eq(blogArticles.slug, slug)),
  });
  return article ?? null;
}

export async function getProspect(prospectId: string | null) {
  if (!prospectId) return null;
  const db = getDb();
  const prospect = await db.query.prospects.findFirst({ where: eq(prospects.id, prospectId) });
  return prospect ?? null;
}

/** URL publique canonique d'un site (domaine custom ou chemin de démo). */
export function siteBaseUrl(site: Site): string {
  if (site.domain) return `https://${site.domain}`;
  const base = process.env.SITES_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/${site.slug}`;
}

/** Préfixe des liens internes relatifs au segment [site]. */
export function sitePathPrefix(site: Site, siteKey: string): string {
  void site;
  return `/${siteKey}`;
}
