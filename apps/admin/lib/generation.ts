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
  prospects,
  sites,
  type GenerationProgress,
  type Prospect,
  type Site,
} from "@theralys/db";
import { createGooglePlacesProvider } from "@theralys/providers/google";
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
  // Prompts en anglais (FLUX y répond bien mieux) ; qualité « high » (FLUX dev)
  // pour les trois photos principales — indispensable pour des visages crédibles.
  const practitioner =
    input.gender === "feminin"
      ? "a French woman in her thirties, a wellness practitioner"
      : "a French man in his thirties, a wellness practitioner";
  const [heroImage, aboutImage, futureImage] = await Promise.all([
    tryGenerateImage(imageProvider, {
      subject:
        "interior of an elegant wellness practitioner's consultation room in France, empty room, massage table or armchairs, plants and soft textiles",
      mood: "golden hour, warm sunlight streaming through a window, cozy and inviting, high-end interior photography, sharp focus",
      themeColor,
      width: 960,
      height: 1152,
      quality: "high",
    }),
    tryGenerateImage(imageProvider, {
      subject: `natural professional portrait of ${practitioner}, smiling warmly at the camera, standing in a bright consultation room`,
      mood: "soft window light, shallow depth of field, 85mm lens, candid editorial portrait, natural authentic skin texture, realistic proportions",
      themeColor,
      width: 896,
      height: 1120,
      quality: "high",
    }),
    tryGenerateImage(imageProvider, {
      subject: `${practitioner} during a one-on-one session with a relaxed client, caring attentive gesture, in a cozy consultation room`,
      mood: "warm natural light, calm trusting atmosphere, shallow depth of field, documentary editorial photography, natural authentic skin texture",
      themeColor,
      width: 896,
      height: 1120,
      quality: "high",
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
    generateReviewsStep(site, generator, input, prospect.googlePlaceId),
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
      subject: `wellness treatment scene evoking « ${motif.title} », soothing hands-on care details, cozy practice room`,
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
  googlePlaceId: string | null,
): Promise<void> {
  const db = getDb();

  // Fiche Google reliée + API configurée → les VRAIS avis de la fiche
  // (jusqu'à 5, limite de l'API Places). Repli sur les avis IA en cas d'échec.
  const places = createGooglePlacesProvider();
  if (googlePlaceId && places.mode === "google") {
    try {
      const details = await places.fetchDetails(googlePlaceId);
      if (details.reviews.length > 0) {
        await db.delete(googleReviews).where(eq(googleReviews.siteId, site.id));
        await db.insert(googleReviews).values(
          details.reviews.map((r) => ({
            siteId: site.id,
            sourceReviewId: r.sourceReviewId,
            authorName: r.authorName,
            authorPhotoUrl: r.authorPhotoUrl,
            rating: r.rating,
            text: r.text,
            reviewedAt: r.reviewedAt,
          })),
        );
        if (site.prospectId && details.rating !== null) {
          await db
            .update(prospects)
            .set({
              googleRating: details.rating,
              googleReviewCount: details.reviewCount,
              ...(details.photoUrl ? { googlePhotoUrl: details.photoUrl } : {}),
            })
            .where(eq(prospects.id, site.prospectId));
        }
        await setProgress(site.id, { reviews: true });
        return;
      }
    } catch (err) {
      console.warn("[reviews] fiche Google indisponible, repli sur les avis IA :", err);
    }
  }

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
  request: {
    subject: string;
    mood?: string;
    themeColor?: string;
    width: number;
    height: number;
    quality?: "standard" | "high";
  },
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
