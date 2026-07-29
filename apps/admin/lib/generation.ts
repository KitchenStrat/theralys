import { eq, sql } from "drizzle-orm";
import {
  createImageProvider,
  createSiteGenerator,
  type GenerationInput,
  type ImageProvider,
  type SiteGenerator,
} from "@theralys/ai";
import type { PageSections, ThemePreset } from "@theralys/shared";
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

  // Illustrations (fal.ai, ou SVG mock sans clé) : cabinet, portrait du
  // praticien (sexe des paramètres de la démo), séance avec un(e) patient(e).
  // Personnes fictives, remplaçables par de vraies photos dans le studio.
  // Un échec d'image ne bloque pas la démo.
  const imageProvider = createImageProvider();
  console.log(
    `[images] provider=${process.env.IMAGE_PROVIDER === "mock" || !process.env.FAL_API_KEY ? "mock" : "fal"}` +
      ` (FAL_API_KEY ${process.env.FAL_API_KEY ? "présente" : "absente"})`,
  );
  const themeColor = PRESET_COLORS[home.theme.preset];
  const feminin = input.gender === "feminin";
  const praticien = feminin ? "une praticienne" : "un praticien";
  const [heroImage, aboutImage, futureImage] = await Promise.all([
    tryGenerateImage(imageProvider, {
      subject: `intérieur d'un cabinet de ${input.profession}, salle de consultation soignée et apaisante`,
      mood: "lumière chaude et dorée de fin de journée, ambiance chaleureuse et accueillante, sans personne, photographie réaliste",
      themeColor,
      width: 960,
      height: 1152,
    }),
    tryGenerateImage(imageProvider, {
      subject: `portrait professionnel d'${praticien} (${input.profession}), ${feminin ? "souriante et confiante" : "souriant et confiant"}, dans son cabinet`,
      mood: "lumière naturelle douce, arrière-plan sobre du cabinet, photographie réaliste de qualité éditoriale",
      themeColor,
      width: 896,
      height: 1120,
    }),
    tryGenerateImage(imageProvider, {
      subject: `${praticien} (${input.profession}) en séance avec un patient ou une patiente, gestes de soin attentifs et bienveillants`,
      mood: "cadre chaleureux du cabinet, lumière naturelle douce, photographie réaliste de qualité éditoriale",
      themeColor,
      width: 896,
      height: 1120,
    }),
  ]);
  let homeSections = withSectionImage(home.sections, "hero", heroImage);
  homeSections = withSectionImage(homeSections, "about", aboutImage);
  homeSections = withSectionImage(homeSections, "future", futureImage);

  await db.delete(pages).where(eq(pages.siteId, site.id));
  await db.insert(pages).values({
    siteId: site.id,
    type: "home",
    slug: "",
    title: "Accueil",
    metaTitle: home.metaTitle,
    metaDescription: home.metaDescription,
    sections: homeSections,
    position: 0,
  });
  await db
    .update(sites)
    .set({ name: home.siteName, theme: home.theme, updatedAt: new Date() })
    .where(eq(sites.id, site.id));
  await setProgress(site.id, { home: true });

  // ── 2-4. Motifs, avis et articles en parallèle ─────────────────────────────
  // Les trois étapes ne dépendent que de l'accueil (motifsPlan). En série,
  // ~10 appels Claude dépassent la durée maximale d'une fonction Vercel
  // (300 s) avec les modèles les plus lents — en parallèle, on tient large.
  const results = await Promise.allSettled([
    generateMotifPagesStep(site, generator, input, home.motifsPlan, imageProvider, themeColor),
    generateReviewsStep(site, generator, input),
    generateArticlesStep(site, generator, input, home.motifsPlan, imageProvider, themeColor),
  ]);
  const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failure) throw failure.reason instanceof Error ? failure.reason : new Error(String(failure.reason));

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

async function generateMotifPagesStep(
  site: Site,
  generator: SiteGenerator,
  input: GenerationInput,
  motifsPlan: Awaited<ReturnType<SiteGenerator["generateHome"]>>["motifsPlan"],
  imageProvider: ImageProvider,
  themeColor: string | undefined,
): Promise<void> {
  const db = getDb();
  // 2 générations de front : bon compromis vitesse / limites de débit API
  const generated = await mapPool(motifsPlan, 2, async (motif) => {
    const page = await generator.generateMotifPage(input, motif);
    const image = await tryGenerateImage(imageProvider, {
      subject: `${motif.title} — séance de ${input.profession}, ambiance apaisante`,
      themeColor,
      width: 960,
      height: 1152,
    });
    return { ...page, sections: withSectionImage(page.sections, "hero", image) };
  });
  for (const [i, page] of generated.entries()) {
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
}

async function generateReviewsStep(
  site: Site,
  generator: SiteGenerator,
  input: GenerationInput,
): Promise<void> {
  const db = getDb();
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
}

async function generateArticlesStep(
  site: Site,
  generator: SiteGenerator,
  input: GenerationInput,
  motifsPlan: Awaited<ReturnType<SiteGenerator["generateHome"]>>["motifsPlan"],
  imageProvider: ImageProvider,
  themeColor: string | undefined,
): Promise<void> {
  const db = getDb();
  const articles = await generator.generateArticles(input, motifsPlan);
  // Une illustration par article — comme celles du robot éditorial (J-7)
  const images = await mapPool(articles, 2, (a) =>
    tryGenerateImage(imageProvider, {
      subject: a.title,
      themeColor,
      width: 1024,
      height: 576,
    }),
  );
  await db.delete(blogArticles).where(eq(blogArticles.siteId, site.id));
  const now = Date.now();
  await db.insert(blogArticles).values(
    articles.map((a, i) => ({
      siteId: site.id,
      title: a.title,
      slug: a.slug || slugify(a.title),
      excerpt: a.excerpt,
      content: a.content,
      imageUrl: images[i] ?? null,
      imageAiGenerated: Boolean(images[i]),
      status: (i < articles.length - 1 ? "published" : "draft") as "published" | "draft",
      aiGenerated: true,
      motifSlug: a.motifSlug,
      publishAt: new Date(now - (articles.length - 1 - i) * 7 * 86_400_000),
      publishedAt: i < articles.length - 1 ? new Date(now - (articles.length - 1 - i) * 7 * 86_400_000) : null,
      readingTimeMin: readingTimeMinutes(a.content),
    })),
  );
  await setProgress(site.id, { articles: true });
}

/** Couleur d'accent par preset — sert au SVG mock pour rester accordé au thème. */
const PRESET_COLORS: Record<ThemePreset, string> = {
  terracotta: "#b05038",
  sauge: "#587c5e",
  ocean: "#33658a",
  lavande: "#6f5b9c",
  ambre: "#a8762b",
  rose: "#c26a7d",
  prune: "#8a5273",
  caramel: "#9a6b3f",
  marine: "#3f5873",
  olive: "#75793f",
};

/** Génère une image d'ambiance ; en cas d'échec la démo continue sans image. */
async function tryGenerateImage(
  provider: ImageProvider,
  request: { subject: string; mood?: string; themeColor?: string; width: number; height: number },
): Promise<string | undefined> {
  try {
    const image = await provider.generate(request);
    return image.url;
  } catch (err) {
    console.error(`Image non générée (« ${request.subject} »):`, err);
    return undefined;
  }
}

/**
 * Renseigne imageUrl sur les sections du type donné. Écrase toujours la
 * valeur issue de la génération de texte : le modèle invente parfois une
 * URL factice, qui afficherait une image cassée. (Les photos posées par le
 * praticien ne sont pas concernées : une régénération complète repart de
 * toute façon d'un contenu neuf.)
 */
function withSectionImage(
  sections: PageSections,
  type: "hero" | "about" | "future",
  url: string | undefined,
): PageSections {
  return sections.map((section) =>
    section.type === type ? { ...section, imageUrl: url } : section,
  );
}

/** Exécute `fn` sur chaque élément avec au plus `limit` promesses en vol. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
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
  // Fusion jsonb côté SQL : atomique même quand plusieurs étapes parallèles
  // terminent en même temps (un read-modify-write perdrait des pastilles).
  await db
    .update(sites)
    .set({
      generationProgress: sql`${sites.generationProgress} || ${JSON.stringify(patch)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(sites.id, siteId));
}
