"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  blogArticles,
  blogSettings,
  getDb,
  googleConnections,
  googleReviews,
  onboardingTasks,
  pages,
  prospects,
  sites,
} from "@theralys/db";
import {
  createImageProvider,
  createStockImageProvider,
  findStockOrGenerate,
  stockQueryFor,
} from "@theralys/ai";
import { createGooglePlacesProvider, type GooglePlaceResult } from "@theralys/providers/google";
import { syncGoogleData } from "@theralys/jobs";
import {
  signPreviewToken,
  THEME_PRESETS,
  FONT_PRESETS,
  THEME_INTENSITIES,
  THEME_CORNERS,
  THEME_AMBIANCES,
  type Section,
} from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { siteUrl } from "@/lib/data";

// ─── Onboarding ───────────────────────────────────────────────────────────────

export async function completeOnboardingTask(key: string): Promise<void> {
  const session = await requireClient();
  const db = getDb();
  await db
    .update(onboardingTasks)
    .set({ done: true, completedAt: new Date() })
    .where(
      and(
        eq(onboardingTasks.siteId, session.siteId),
        eq(onboardingTasks.key, key),
        eq(onboardingTasks.done, false),
      ),
    );
  revalidatePath("/");
}

// ─── Connexion Google (OAuth — mock tant que GOOGLE_CLIENT_ID est absent) ────

/** Recherche de fiche Google depuis l'éditeur (client ou accès agence). */
export async function searchGoogle(query: unknown): Promise<GooglePlaceResult[]> {
  await requireClient();
  const parsed = z.string().trim().min(3).max(120).safeParse(query);
  if (!parsed.success) return [];
  try {
    return await createGooglePlacesProvider().search(parsed.data);
  } catch {
    return [];
  }
}

/**
 * Relie la fiche Google du praticien à son site : met à jour la fiche
 * prospect (note, nombre d'avis) et récupère immédiatement les vrais avis
 * quand l'API Places est configurée.
 */
export async function connectGooglePlace(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = z
    .object({
      placeId: z.string().min(3),
      name: z.string(),
      address: z.string(),
      rating: z.number(),
      reviewCount: z.number(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Fiche invalide" };

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (!site?.prospectId) return { error: "Site sans fiche praticien" };

  await db
    .update(prospects)
    .set({
      googlePlaceId: parsed.data.placeId,
      googleBusinessName: parsed.data.name,
      googleAddress: parsed.data.address,
      googleRating: parsed.data.rating,
      googleReviewCount: parsed.data.reviewCount,
    })
    .where(eq(prospects.id, site.prospectId));

  // Vrais avis tout de suite (API réelle uniquement — best-effort)
  const places = createGooglePlacesProvider();
  if (places.mode === "google") {
    try {
      const details = await places.fetchDetails(parsed.data.placeId);
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
        if (details.rating !== null) {
          await db
            .update(prospects)
            .set({
              googleRating: details.rating,
              googleReviewCount: details.reviewCount,
              ...(details.photoUrl ? { googlePhotoUrl: details.photoUrl } : {}),
            })
            .where(eq(prospects.id, site.prospectId));
        }
      }
    } catch (err) {
      console.warn("[reviews] récupération des avis de la fiche impossible :", err);
    }
  }

  revalidatePath("/editor");
  return {};
}

export async function connectGoogle(): Promise<{ error?: string } | void> {
  const session = await requireClient();
  const db = getDb();

  if (process.env.GOOGLE_CLIENT_ID) {
    // Le flux OAuth réel (redirection Google, échange du code, chiffrement du
    // refresh token via @theralys/shared/crypto) se branche ici.
    return { error: "Flux OAuth Google réel à venir — retirer GOOGLE_CLIENT_ID pour le mode mock." };
  }

  const existing = await db.query.googleConnections.findFirst({
    where: eq(googleConnections.siteId, session.siteId),
  });
  if (!existing) {
    await db.insert(googleConnections).values({
      siteId: session.siteId,
      status: "connected",
      googleEmail: "compte.google@exemple.fr",
      searchConsoleSiteUrl: "sc-domain:exemple.fr",
      scopes: ["webmasters.readonly", "business.manage"],
    });
  }
  await syncGoogleData();
  await completeOnboardingTask("connect_google");
  revalidatePath("/");
}

// ─── Paramètres du blog ───────────────────────────────────────────────────────

const blogSettingsSchema = z.object({
  publicationMode: z.enum(["auto", "manual"]),
  voiceDesignation: z.enum(["nous", "je", "on"]),
  voiceAccord: z.enum(["feminin", "masculin"]),
  voiceReader: z.enum(["vous", "tu"]),
  voiceTone: z.enum(["chaleureux", "rassurant", "pose", "direct", "pedagogue"]),
  themes: z
    .array(
      z.object({
        label: z.string().trim().min(2).max(120),
        perMonth: z.number().int().min(0).max(30),
      }),
    )
    .max(12)
    .optional(),
});

export async function saveBlogSettings(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = blogSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: "Réglages invalides" };

  const db = getDb();
  const existing = await db.query.blogSettings.findFirst({
    where: eq(blogSettings.siteId, session.siteId),
  });
  if (existing) {
    await db
      .update(blogSettings)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(blogSettings.siteId, session.siteId));
  } else {
    await db.insert(blogSettings).values({ siteId: session.siteId, ...parsed.data });
  }
  await completeOnboardingTask("activate_blog");
  revalidatePath("/publications");
  return {};
}

// ─── Articles ─────────────────────────────────────────────────────────────────

async function ownedArticle(siteId: string, articleId: string) {
  const db = getDb();
  const article = await db.query.blogArticles.findFirst({
    where: and(eq(blogArticles.id, articleId), eq(blogArticles.siteId, siteId)),
  });
  if (!article) throw new Error("Article introuvable");
  return article;
}

const articleUpdateSchema = z.object({
  articleId: z.string().uuid(),
  title: z.string().trim().min(5),
  excerpt: z.string().trim().max(500).default(""),
  content: z.string().trim().min(50),
  imageUrl: z.string().trim().default(""),
});

/** Édition du texte et de l'image d'un article. */
export async function updateArticle(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = articleUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Formulaire invalide" };
  const { articleId, title, excerpt, content, imageUrl } = parsed.data;
  const article = await ownedArticle(session.siteId, articleId);

  const db = getDb();
  await db
    .update(blogArticles)
    .set({
      title,
      excerpt: excerpt || null,
      content,
      imageUrl: imageUrl || null,
      imageAiGenerated: imageUrl === article.imageUrl ? article.imageAiGenerated : false,
      updatedAt: new Date(),
    })
    .where(eq(blogArticles.id, articleId));
  revalidatePath("/publications");
  return {};
}

/** Régénère l'image de couverture : nouvelle photo de banque d'images (repli IA). */
export async function regenerateArticleImage(articleId: string): Promise<{ imageUrl: string }> {
  const session = await requireClient();
  const article = await ownedArticle(session.siteId, articleId);
  const db = getDb();

  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  // La graine change à chaque clic → une photo différente à chaque régénération
  const image = await findStockOrGenerate(createStockImageProvider(), createImageProvider(), {
    query: stockQueryFor(article.title),
    subject: `${article.title} (variante ${Date.now() % 7})`,
    seed: `${article.id}-${Date.now()}`,
    themeColor: site?.theme.palette?.primary,
    width: 1024,
    height: 576,
  });
  if (!image) return { imageUrl: article.imageUrl ?? "" };

  await db
    .update(blogArticles)
    .set({ imageUrl: image.url, imageAiGenerated: image.aiGenerated, updatedAt: new Date() })
    .where(eq(blogArticles.id, articleId));
  revalidatePath("/publications");
  return { imageUrl: image.url };
}

/** Retirer un article (publié ou non) : il disparaît du site. */
export async function withdrawArticle(articleId: string): Promise<void> {
  const session = await requireClient();
  await ownedArticle(session.siteId, articleId);
  const db = getDb();
  await db
    .update(blogArticles)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(eq(blogArticles.id, articleId));
  revalidatePath("/publications");
}

/** Replanifier un article non publié. */
export async function rescheduleArticle(
  articleId: string,
  newDateIso: string,
): Promise<{ error?: string }> {
  const session = await requireClient();
  const article = await ownedArticle(session.siteId, articleId);
  if (article.status === "published") return { error: "Article déjà publié" };
  const date = new Date(`${newDateIso}T07:00:00Z`);
  if (Number.isNaN(date.getTime())) return { error: "Date invalide" };

  const db = getDb();
  await db
    .update(blogArticles)
    .set({ publishAt: date, updatedAt: new Date() })
    .where(eq(blogArticles.id, articleId));
  revalidatePath("/publications");
  return {};
}

/** Publier immédiatement (mode manuel, ou pour avancer une publication). */
export async function publishArticleNow(articleId: string): Promise<void> {
  const session = await requireClient();
  const article = await ownedArticle(session.siteId, articleId);
  if (article.status === "published") return;
  const db = getDb();
  const now = new Date();
  await db
    .update(blogArticles)
    .set({ status: "published", publishedAt: now, publishAt: now, updatedAt: now })
    .where(eq(blogArticles.id, articleId));
  revalidatePath("/publications");
}

/** Lien « Voir sur le site » — avec preview token si l'article n'est pas publié. */
export async function getArticleViewUrl(articleId: string): Promise<{ url: string }> {
  const session = await requireClient();
  const article = await ownedArticle(session.siteId, articleId);
  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (!site) throw new Error("Site introuvable");

  const base = `${siteUrl(site)}/blog/${article.slug}`;
  if (article.status === "published") return { url: base };

  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET manquante");
  const token = await signPreviewToken({ articleId: article.id, siteId: site.id }, secret);
  return { url: `${base}?preview_token=${token}` };
}

// ─── Éditeur de site ──────────────────────────────────────────────────────────

const sectionsSchema = z.array(z.record(z.unknown()));

export async function savePageSections(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = z
    .object({ pageId: z.string().uuid(), sections: sectionsSchema })
    .safeParse(input);
  if (!parsed.success) return { error: "Contenu invalide" };

  const db = getDb();
  const page = await db.query.pages.findFirst({
    where: and(eq(pages.id, parsed.data.pageId), eq(pages.siteId, session.siteId)),
  });
  if (!page) return { error: "Page introuvable" };

  // Structure vérifiée : on ne remplace que les champs texte des sections
  // existantes (types et ordre inchangés — jamais de HTML libre).
  const current = page.sections;
  const incoming = parsed.data.sections;
  if (incoming.length !== current.length) return { error: "Structure de page inattendue" };
  const merged = current.map((section, i) => {
    const patch = incoming[i] as Partial<Section>;
    if (patch.type !== section.type) return section;
    return { ...section, ...patch } as Section;
  });

  await db
    .update(pages)
    .set({ sections: merged, updatedAt: new Date() })
    .where(eq(pages.id, page.id));

  await completeOnboardingTask("verify_pages");
  await completeOnboardingTask("publish_site");
  revalidatePath("/editor");
  return {};
}

export async function saveSiteStyle(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = z
    .object({
      preset: z.enum(THEME_PRESETS),
      fontPreset: z.enum(FONT_PRESETS),
      intensity: z.enum(THEME_INTENSITIES),
      corners: z.enum(THEME_CORNERS),
      ambiance: z.enum(THEME_AMBIANCES),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Style invalide" };

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (!site) return { error: "Site introuvable" };
  await db
    .update(sites)
    .set({
      theme: { ...site.theme, ...parsed.data },
      updatedAt: new Date(),
    })
    .where(eq(sites.id, session.siteId));
  revalidatePath("/editor");
  return {};
}

export async function saveSiteSettings(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = z
    .object({
      name: z.string().trim().min(2),
      bookingUrl: z
        .string()
        .trim()
        .refine((v) => v === "" || /^(https?:\/\/|tel:)/.test(v), "Lien invalide"),
      city: z.string().trim().min(1),
      logoUrl: z.string().trim().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Réglages invalides" };

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (!site) return { error: "Site introuvable" };
  await db
    .update(sites)
    .set({
      name: parsed.data.name,
      bookingUrl: parsed.data.bookingUrl || null,
      theme: { ...site.theme, logoUrl: parsed.data.logoUrl || undefined },
      updatedAt: new Date(),
    })
    .where(eq(sites.id, session.siteId));
  if (site.prospectId) {
    await db
      .update(prospects)
      .set({ city: parsed.data.city })
      .where(eq(prospects.id, site.prospectId));
  }
  revalidatePath("/editor");
  return {};
}
