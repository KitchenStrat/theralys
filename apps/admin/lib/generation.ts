import { eq } from "drizzle-orm";
import { createSiteGenerator, type GenerationInput } from "@theralys/ai";
import {
  blogArticles,
  blogSettings,
  getDb,
  googleReviews,
  motifPagesAllowance,
  pages,
  sites,
  type GenerationProgress,
  type Prospect,
  type Site,
} from "@theralys/db";
import { readingTimeMinutes, slugify } from "@theralys/shared";

/**
 * Pipeline de génération d'une démo (job asynchrone) :
 * accueil → pages de motifs → avis → exemples d'articles.
 * Chaque étape met à jour generation_progress (les 4 pastilles de la liste),
 * puis le statut passe de « En préparation » à « Prête à vérifier ».
 */
export async function runGenerationJob(siteId: string): Promise<void> {
  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error(`Site introuvable : ${siteId}`);

  try {
    await generate(site);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(sites)
      .set({ status: "error", generationError: message.slice(0, 1000), updatedAt: new Date() })
      .where(eq(sites.id, siteId));
    console.error(`Génération en échec pour ${siteId}:`, err);
  }
}

async function generate(site: Site): Promise<void> {
  const db = getDb();
  const prospect = site.prospectId
    ? ((await db.query.prospects.findFirst({
        where: (p, { eq: eqOp }) => eqOp(p.id, site.prospectId!),
      })) ?? null)
    : null;
  if (!prospect) throw new Error("Démo sans prospect rattaché");

  const generator = createSiteGenerator();
  const input = buildGenerationInput(site, prospect);

  // Remise à zéro (utile en régénération)
  await db
    .update(sites)
    .set({
      status: "generating",
      generationError: null,
      generationProgress: { home: false, motifs: false, reviews: false, articles: false },
      updatedAt: new Date(),
    })
    .where(eq(sites.id, site.id));

  // ── 1. Accueil ──────────────────────────────────────────────────────────────
  const home = await generator.generateHome(input);
  await db.delete(pages).where(eq(pages.siteId, site.id));
  await db.insert(pages).values({
    siteId: site.id,
    type: "home",
    slug: "",
    title: "Accueil",
    metaTitle: home.metaTitle,
    metaDescription: home.metaDescription,
    sections: home.sections,
    position: 0,
  });
  await db
    .update(sites)
    .set({ name: home.siteName, theme: home.theme, updatedAt: new Date() })
    .where(eq(sites.id, site.id));
  await setProgress(site.id, { home: true });

  // ── 2. Pages de motifs (gating par formule) ────────────────────────────────
  for (const [i, motif] of home.motifsPlan.entries()) {
    const page = await generator.generateMotifPage(input, motif);
    await db.insert(pages).values({
      siteId: site.id,
      type: "motif",
      slug: page.slug,
      title: page.title,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      sections: page.sections,
      position: i + 1,
    });
  }
  await setProgress(site.id, { motifs: true });

  // ── 3. Avis ─────────────────────────────────────────────────────────────────
  const reviews = await generator.generateReviews(input);
  await db.delete(googleReviews).where(eq(googleReviews.siteId, site.id));
  await db.insert(googleReviews).values(
    reviews.map((r) => ({
      siteId: site.id,
      authorName: r.authorName,
      rating: r.rating,
      text: r.text,
    })),
  );
  await setProgress(site.id, { reviews: true });

  // ── 4. Exemples d'articles ──────────────────────────────────────────────────
  const articles = await generator.generateArticles(input, home.motifsPlan);
  await db.delete(blogArticles).where(eq(blogArticles.siteId, site.id));
  const now = Date.now();
  await db.insert(blogArticles).values(
    articles.map((a, i) => ({
      siteId: site.id,
      title: a.title,
      slug: a.slug || slugify(a.title),
      excerpt: a.excerpt,
      content: a.content,
      status: (i < articles.length - 1 ? "published" : "draft") as "published" | "draft",
      aiGenerated: true,
      motifSlug: a.motifSlug,
      publishAt: new Date(now - (articles.length - 1 - i) * 7 * 86_400_000),
      publishedAt: i < articles.length - 1 ? new Date(now - (articles.length - 1 - i) * 7 * 86_400_000) : null,
      readingTimeMin: readingTimeMinutes(a.content),
    })),
  );
  await setProgress(site.id, { articles: true });

  // Réglages de blog par défaut (voix accordée au genre du prospect)
  const existingSettings = await db.query.blogSettings.findFirst({
    where: eq(blogSettings.siteId, site.id),
  });
  if (!existingSettings) {
    await db.insert(blogSettings).values({
      siteId: site.id,
      voiceAccord: prospect.gender,
    });
  }

  await db
    .update(sites)
    .set({ status: "ready", updatedAt: new Date() })
    .where(eq(sites.id, site.id));
}

function buildGenerationInput(site: Site, prospect: Prospect): GenerationInput {
  return {
    firstName: prospect.firstName,
    lastName: prospect.lastName,
    profession: prospect.profession,
    city: prospect.city,
    gender: prospect.gender,
    highlightedMotifs: site.highlightedMotifs,
    motifPageCount: motifPagesAllowance(site.plan),
    googleEnrichment: prospect.googlePlaceId
      ? {
          businessName: prospect.googleBusinessName ?? undefined,
          address: prospect.googleAddress ?? undefined,
          rating: prospect.googleRating ?? undefined,
          reviewCount: prospect.googleReviewCount ?? undefined,
        }
      : undefined,
  };
}

async function setProgress(siteId: string, patch: Partial<GenerationProgress>): Promise<void> {
  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) return;
  await db
    .update(sites)
    .set({ generationProgress: { ...site.generationProgress, ...patch }, updatedAt: new Date() })
    .where(eq(sites.id, siteId));
}
