import { and, desc, eq } from "drizzle-orm";
import {
  blogArticles,
  getDb,
  googleReviews,
  motifPagesAllowance,
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

/**
 * Pages de motifs visibles — le gating suit la formule (Starter 0, Boost 3,
 * Scale 6). Les pages excédentaires restent en base : un passage à la formule
 * supérieure les réactive sans régénération.
 */
export async function getMotifPages(site: Site): Promise<Page[]> {
  const db = getDb();
  const all = await db.query.pages.findMany({
    where: and(eq(pages.siteId, site.id), eq(pages.type, "motif")),
    orderBy: (p, { asc }) => [asc(p.position)],
  });
  // Les démos présentent toujours l'offre complète
  if (site.type === "demo") return all;
  return all.slice(0, motifPagesAllowance(site.plan));
}

export async function getMotifPage(site: Site, slug: string): Promise<Page | null> {
  const allowed = await getMotifPages(site);
  return allowed.find((p) => p.slug === slug) ?? null;
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

/** Articles similaires : même motif d'abord, puis les plus récents. */
export async function getRelatedArticles(
  siteId: string,
  excludeId: string,
  motifSlug: string | null,
  limit = 3,
): Promise<BlogArticle[]> {
  const all = (await getPublishedArticles(siteId)).filter((a) => a.id !== excludeId);
  const sameMotif = motifSlug ? all.filter((a) => a.motifSlug === motifSlug) : [];
  const others = all.filter((a) => !sameMotif.includes(a));
  return [...sameMotif, ...others].slice(0, limit);
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
