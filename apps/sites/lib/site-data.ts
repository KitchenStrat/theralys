import { cache } from "react";
import { and, desc, eq } from "drizzle-orm";
import {
  blogArticles,
  getDb,
  googleReviews,
  hasBlog,
  hasSite,
  motifPagesAllowance,
  pages,
  prospects,
  sites,
  type BlogArticle,
  type Page,
  type Site,
} from "@theralys/db";

/**
 * Lectures d'un site public. Chaque lecture est mémorisée le temps d'une
 * requête (`cache` de React) : la mise en page, la page et ses métadonnées
 * demandent toutes le site, sa page d'accueil et ses pages de spécialités —
 * une seule requête SQL par donnée au lieu de trois ou quatre. Rien n'est
 * gardé d'une requête à l'autre : une modification publiée depuis l'éditeur
 * se voit tout de suite.
 */

/**
 * Blog visible sur le site public ? Les démos présentent toujours l'offre
 * complète ; pour un client, le blog fait partie de la formule Site.
 */
export function hasBlogAccess(site: Site): boolean {
  return site.type === "demo" || hasBlog(site.plan);
}

/**
 * Résout un site par clé de segment [site] :
 * - contient un point → domaine custom (Phase 3) ;
 * - sinon → slug (démos et dev).
 *
 * Le site hébergé fait partie de la formule Site : un client qui n'a que la
 * formule Scale n'a pas de site Harmony, rien n'est servi à son adresse (les
 * démos, elles, présentent toujours l'offre complète).
 */
export const getSiteByKey = cache(async (key: string): Promise<Site | null> => {
  const db = getDb();
  const decoded = decodeURIComponent(key);
  // www.<domaine> est redirigé vers le domaine nu par Vercel ; on résout
  // aussi sans le préfixe par sécurité (autres hébergements, mode local).
  const host = decoded.startsWith("www.") ? decoded.slice(4) : decoded;
  const site = decoded.includes(".")
    ? await db.query.sites.findFirst({ where: eq(sites.domain, host) })
    : await db.query.sites.findFirst({ where: eq(sites.slug, decoded) });
  if (!site || !isHostedSiteServed(site)) return null;
  return site;
});

/** Le site hébergé existe-t-il pour ce compte ? Démos : toujours ; clients : avec la formule Site. */
export function isHostedSiteServed(site: Pick<Site, "type" | "plan">): boolean {
  return site.type === "demo" || hasSite(site.plan);
}

export function isDemoExpired(site: Site): boolean {
  return (
    site.type === "demo" &&
    site.demoExpiresAt !== null &&
    site.demoExpiresAt.getTime() < Date.now()
  );
}

export const getHomePage = cache(async (siteId: string): Promise<Page | null> => {
  const db = getDb();
  const page = await db.query.pages.findFirst({
    where: and(eq(pages.siteId, siteId), eq(pages.type, "home")),
  });
  return page ?? null;
});

/**
 * Pages de motifs visibles — le nombre suit la formule (6 avec la formule
 * Site). Les pages restent en base : retrouver la formule Site les réactive
 * sans régénération.
 */
export const getMotifPages = cache(async (site: Site): Promise<Page[]> => {
  const db = getDb();
  const all = await db.query.pages.findMany({
    where: and(eq(pages.siteId, site.id), eq(pages.type, "motif")),
    orderBy: (p, { asc }) => [asc(p.position)],
  });
  // Pages désactivées par le praticien : retirées partout (y compris démos) ;
  // une page sans section (création en cours depuis le studio) n'est jamais servie
  const disabledSlugs = new Set(site.theme.disabledMotifs ?? []);
  const enabled = all.filter((p) => !disabledSlugs.has(p.slug) && p.sections.length > 0);
  // Les démos présentent toujours l'offre complète
  if (site.type === "demo") return enabled;
  return enabled.slice(0, motifPagesAllowance(site.plan));
});

export async function getMotifPage(
  site: Site,
  slug: string,
  options?: { includeDisabled?: boolean },
): Promise<Page | null> {
  const allowed = await getMotifPages(site);
  const found = allowed.find((p) => p.slug === slug);
  if (found) return found;
  if (options?.includeDisabled) {
    // Aperçu de l'éditeur : une page désactivée reste prévisualisable
    const db = getDb();
    const page = await db.query.pages.findFirst({
      where: and(eq(pages.siteId, site.id), eq(pages.type, "motif"), eq(pages.slug, slug)),
    });
    return page && page.sections.length > 0 ? page : null;
  }
  return null;
}

/**
 * Avis affichés sur le site public. Colonnes listées explicitement : la page
 * publique doit rester servie même si la base n'a pas encore reçu les
 * colonnes ajoutées par une migration (réponse du propriétaire, analyse…).
 */
export const getReviews = cache(async (siteId: string) => {
  const db = getDb();
  return db.query.googleReviews.findMany({
    where: eq(googleReviews.siteId, siteId),
    orderBy: [desc(googleReviews.syncedAt)],
    limit: 12,
    columns: {
      id: true,
      siteId: true,
      sourceReviewId: true,
      authorName: true,
      authorPhotoUrl: true,
      rating: true,
      text: true,
      reviewedAt: true,
      syncedAt: true,
    },
  });
});

/** Un article sans son texte : ce qu'il faut à une liste, à une carte ou au plan du site. */
export type ArticleSummary = Omit<BlogArticle, "content">;

/**
 * Articles publiés, du plus récent au plus ancien, SANS leur texte : la liste
 * du blog, les articles similaires et le plan du site n'en lisent que le
 * titre, l'extrait et l'image. Charger le texte de tous les articles pour en
 * afficher trois pesait de plus en plus lourd à chaque publication.
 */
export const getPublishedArticles = cache(async (siteId: string): Promise<ArticleSummary[]> => {
  const db = getDb();
  return db.query.blogArticles.findMany({
    where: and(eq(blogArticles.siteId, siteId), eq(blogArticles.status, "published")),
    orderBy: [desc(blogArticles.publishedAt)],
    columns: { content: false },
  });
});

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
): Promise<ArticleSummary[]> {
  const all = (await getPublishedArticles(siteId)).filter((a) => a.id !== excludeId);
  const sameMotif = motifSlug ? all.filter((a) => a.motifSlug === motifSlug) : [];
  const others = all.filter((a) => !sameMotif.includes(a));
  return [...sameMotif, ...others].slice(0, limit);
}

export const getProspect = cache(async (prospectId: string | null) => {
  if (!prospectId) return null;
  const db = getDb();
  const prospect = await db.query.prospects.findFirst({ where: eq(prospects.id, prospectId) });
  return prospect ?? null;
});

/**
 * URL publique canonique d'un site (domaine custom ou chemin de démo). Pour
 * les liens internes, voir `publicPathPrefix` (lib/site-paths.ts).
 */
export function siteBaseUrl(site: Site): string {
  if (site.domain) return `https://${site.domain}`;
  const base = process.env.SITES_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/${site.slug}`;
}
