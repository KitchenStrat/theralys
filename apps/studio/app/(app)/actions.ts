"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  blogArticles,
  blogSettings,
  editorialCalendarEntries,
  getDb,
  googleConnections,
  googleReviews,
  motifPagesAllowance,
  onboardingTasks,
  pages,
  prospects,
  sites,
  canAddMotifPage,
  PLANS,
  type Page,
  type Prospect,
  type Site,
} from "@theralys/db";
import {
  createImageProvider,
  createSiteGenerator,
  createStockImageProvider,
  findStockOrGenerate,
  stockQueryFor,
  type GenerationInput,
} from "@theralys/ai";
import { createGooglePlacesProvider, type GooglePlaceResult } from "@theralys/providers/google";
import { ensureEditorialCalendars, syncGoogleData } from "@theralys/jobs";
import {
  signPreviewToken,
  THEME_PRESETS,
  FONT_PRESETS,
  THEME_INTENSITIES,
  THEME_CORNERS,
  THEME_AMBIANCES,
  TRACKING_ID_PATTERNS,
  DEFAULT_NOT_FOUND,
  FOOTER_SOCIAL_NETWORKS,
  SECTION_LIMITS,
  slugify,
  specialtyIconFor,
  uniqueSlug,
  type GeneratingMotif,
  type SiteTheme,
  type Section,
  type SiteLegal,
  type SiteNotFound,
  type SpecialtiesSection,
} from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { isGenerationStale } from "@/lib/editor/page-groups";
import { siteUrl } from "@/lib/data";
import { firstSocialError, normalizeSocialLinks } from "@/lib/editor/social-links";

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
  const previous = await db.query.prospects.findFirst({
    where: eq(prospects.id, site.prospectId),
    columns: { googlePlaceId: true },
  });
  // Même fiche reliée à nouveau : les avis déjà synchronisés (et leurs analyses) sont conservés
  const placeChanged = previous?.googlePlaceId !== parsed.data.placeId;

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
        if (placeChanged) await db.delete(googleReviews).where(eq(googleReviews.siteId, site.id));
        const existing = placeChanged
          ? new Set<string>()
          : new Set(
              (
                await db.query.googleReviews.findMany({
                  where: eq(googleReviews.siteId, site.id),
                  columns: { sourceReviewId: true },
                })
              )
                .map((r) => r.sourceReviewId)
                .filter((id): id is string => id !== null),
            );
        const fresh = details.reviews.filter((r) => !r.sourceReviewId || !existing.has(r.sourceReviewId));
        if (fresh.length > 0) {
          await db.insert(googleReviews).values(
            fresh.map((r) => ({
              siteId: site.id,
              sourceReviewId: r.sourceReviewId,
              authorName: r.authorName,
              authorPhotoUrl: r.authorPhotoUrl,
              rating: r.rating,
              text: r.text,
              reviewedAt: r.reviewedAt,
              source: "places",
            })),
          );
        }
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

/** Entrées de génération IA d'une page de spécialité, à partir du site et de sa fiche. */
function motifGenerationInput(site: Site, prospect: Prospect): GenerationInput {
  return {
    firstName: prospect.firstName,
    lastName: prospect.lastName,
    profession: prospect.profession,
    city: prospect.city,
    gender: prospect.gender,
    highlightedMotifs: site.highlightedMotifs ?? [],
    motifPageCount: motifPagesAllowance(site.plan),
    googleEnrichment: prospect.googleBusinessName
      ? {
          businessName: prospect.googleBusinessName ?? undefined,
          address: prospect.googleAddress ?? undefined,
          rating: prospect.googleRating ?? undefined,
          reviewCount: prospect.googleReviewCount ?? undefined,
        }
      : undefined,
  };
}

type GeneratedMotifContent = {
  title: string;
  metaTitle: string;
  metaDescription: string;
  sections: Section[];
  /** Résumé proposé pour la carte de l'accueil (premier paragraphe du hero) */
  excerpt: string;
};

/**
 * Génère le contenu d'une page de spécialité (texte IA + photo adaptée) sans
 * rien écrire en base — partagé par la régénération (synchrone) et la
 * création d'une page (asynchrone). Lève une erreur en cas d'échec.
 */
async function generateMotifContent(
  site: Site,
  prospect: Prospect,
  motif: { slug: string; title: string; excerpt?: string },
): Promise<GeneratedMotifContent> {
  const generated = await createSiteGenerator().generateMotifPage(motifGenerationInput(site, prospect), {
    slug: motif.slug,
    title: motif.title,
    excerpt: motif.excerpt || motif.title,
  });
  // Photo adaptée au sujet (banque d'images, repli IA)
  const image = await findStockOrGenerate(createStockImageProvider(), createImageProvider(), {
    query: generated.imageQuery ?? stockQueryFor(motif.title, prospect.profession),
    subject: `wellness treatment scene evoking « ${motif.title} », soothing hands-on care details, cozy practice room`,
    seed: `${motif.slug}-${Date.now()}`,
    themeColor: site.theme.palette?.primary,
    width: 960,
    height: 1152,
  });
  const sections: Section[] = generated.sections
    .filter((s) => s.type !== "cta")
    .map((s) => (s.type === "hero" ? { ...s, imageUrl: image?.url ?? s.imageUrl } : s));
  const hero = sections.find((s): s is Extract<Section, { type: "hero" }> => s.type === "hero");
  const excerpt = (hero?.paragraphs[0] ?? generated.metaDescription ?? motif.title)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SECTION_LIMITS.excerpt);
  return {
    title: generated.title,
    metaTitle: generated.metaTitle,
    metaDescription: generated.metaDescription,
    sections,
    excerpt,
  };
}

/** Page d'accueil du site (ses sections portent les cartes de spécialité). */
async function homePageOf(siteId: string) {
  const db = getDb();
  return (
    (await db.query.pages.findFirst({
      where: and(eq(pages.siteId, siteId), eq(pages.type, "home")),
    })) ?? null
  );
}

/** Applique une transformation à la section Spécialités de l'accueil (si présente). */
async function updateHomeSpecialties(
  siteId: string,
  transform: (section: SpecialtiesSection) => SpecialtiesSection,
): Promise<void> {
  const home = await homePageOf(siteId);
  if (!home) return;
  let changed = false;
  const sections = home.sections.map((s) => {
    if (s.type !== "specialties") return s;
    changed = true;
    return transform(s);
  });
  if (!changed) return;
  const db = getDb();
  await db.update(pages).set({ sections, updatedAt: new Date() }).where(eq(pages.id, home.id));
}

/** Retire les sujets d'articles pas encore rédigés d'un motif (calendrier éditorial). */
async function dropPlannedEntries(siteId: string, slug: string): Promise<void> {
  const db = getDb();
  await db
    .delete(editorialCalendarEntries)
    .where(
      and(
        eq(editorialCalendarEntries.siteId, siteId),
        eq(editorialCalendarEntries.motifSlug, slug),
        eq(editorialCalendarEntries.status, "planned"),
      ),
    );
}

/**
 * Régénère une page de spécialité (IA) après modification de son titre :
 * nouveau contenu + nouvelle photo adaptée, le slug (URL) ne change pas.
 * Synchronise la carte correspondante de l'accueil et re-planifie les sujets
 * d'articles à venir de ce motif (les articles déjà rédigés restent).
 */
export async function regenerateMotifPage(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = z
    .object({
      slug: z.string().min(1),
      title: z.string().trim().min(3).max(120),
      excerpt: z.string().trim().max(400).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Titre invalide (3 caractères minimum)" };
  const { slug, title, excerpt } = parsed.data;

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (!site?.prospectId) return { error: "Site sans fiche praticien" };
  const prospect = await db.query.prospects.findFirst({
    where: eq(prospects.id, site.prospectId),
  });
  if (!prospect) return { error: "Fiche praticien introuvable" };
  const page = await db.query.pages.findFirst({
    where: and(eq(pages.siteId, site.id), eq(pages.type, "motif"), eq(pages.slug, slug)),
  });
  if (!page) return { error: "Page de spécialité introuvable" };
  if (generatingEntry(site.theme, slug)) return { error: PAGE_GENERATING };

  try {
    const generated = await generateMotifContent(site, prospect, { slug, title, excerpt });

    await db
      .update(pages)
      .set({
        title: generated.title,
        metaTitle: generated.metaTitle,
        metaDescription: generated.metaDescription,
        sections: generated.sections,
        updatedAt: new Date(),
      })
      .where(eq(pages.id, page.id));

    // Carte correspondante de l'accueil : titre (et résumé) synchronisés
    await updateHomeSpecialties(site.id, (s) => ({
      ...s,
      items: s.items.map((it) =>
        it.slug === slug ? { ...it, title, ...(excerpt ? { excerpt } : {}) } : it,
      ),
    }));

    // Blog : les sujets pas encore rédigés de ce motif sont re-planifiés avec
    // le nouveau titre (calendrier éditorial du back office)
    await dropPlannedEntries(site.id, slug);
    await ensureEditorialCalendars();
  } catch (err) {
    console.error("[motif] régénération impossible :", err);
    return { error: "La régénération a échoué — réessayez dans un instant." };
  }

  revalidatePath("/editor");
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
    const patch = { ...(incoming[i] as Partial<Section>) };
    if (patch.type !== section.type) return section;
    // Visibilité : un booléen strict, `true` seulement (absent = visible)
    if ("hidden" in patch) {
      if (patch.hidden === true) patch.hidden = true;
      else delete patch.hidden;
    }
    const next = { ...section, ...patch } as Section;
    if (!("hidden" in patch)) delete next.hidden;
    return next;
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

  const style = parsed.data;
  const updated = await updateSiteTheme(session.siteId, (theme) => ({ ...theme, ...style }));
  if (!updated) return { error: "Site introuvable" };
  revalidatePath("/editor");
  return {};
}

/**
 * Active/désactive une page de spécialité : désactivée, la page n'est plus
 * servie, sa carte d'accueil perd son lien et elle sort de la navigation.
 * L'état vit dans le JSONB `theme` du site (pas de migration de schéma).
 */
export async function setMotifPageEnabled(input: {
  slug: string;
  enabled: boolean;
}): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = z
    .object({ slug: z.string().trim().min(1), enabled: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { error: "Requête invalide" };
  const { slug, enabled } = parsed.data;

  const page = await ownedMotifPage(session.siteId, slug);
  if (!page) return { error: "Page de spécialité introuvable" };
  let refused: string | null = null;
  const updated = await updateSiteTheme(session.siteId, (theme) => {
    // Une page en préparation (ou sans contenu) ne peut pas être mise en ligne
    if (enabled && (generatingEntry(theme, slug) || page.sections.length === 0)) {
      refused = PAGE_GENERATING;
      return theme;
    }
    const disabled = new Set(theme.disabledMotifs ?? []);
    if (enabled) disabled.delete(slug);
    else disabled.add(slug);
    return { ...theme, disabledMotifs: [...disabled] };
  });
  if (!updated) return { error: "Site introuvable" };
  if (refused) return { error: refused };
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
      phone: z
        .string()
        .trim()
        .max(20)
        .regex(/^$|^\+?[0-9][0-9 .-]{5,}$/, "Numéro de téléphone invalide")
        .optional(),
      faviconUrl: z
        .string()
        .trim()
        .refine((v) => v === "" || /^(https?:\/\/|\/)/.test(v), "Icône invalide")
        .optional(),
      // Aperçu du lien : titre/description Google de l'accueil + image de partage
      seoTitle: z.string().trim().max(120, "Titre de l'aperçu trop long").optional(),
      seoDescription: z.string().trim().max(300, "Description de l'aperçu trop longue").optional(),
      seoImageUrl: z
        .string()
        .trim()
        .refine((v) => v === "" || /^(https?:\/\/|\/)/.test(v), "Image de partage invalide")
        .optional(),
      // Suivi (bandeau cookies + identifiants GA/GTM/Ads/Meta) — cf. SiteTracking
      tracking: z
        .object({
          cookieBanner: z.boolean(),
          googleAnalyticsId: z
            .string()
            .trim()
            .refine(
              (v) => v === "" || TRACKING_ID_PATTERNS.googleAnalyticsId.test(v),
              "Identifiant Google Analytics invalide. Exemple : G-XXXXXXXXXX.",
            ),
          googleTagManagerId: z
            .string()
            .trim()
            .refine(
              (v) => v === "" || TRACKING_ID_PATTERNS.googleTagManagerId.test(v),
              "Identifiant Google Tag Manager invalide. Exemple : GTM-XXXXXXX.",
            ),
          googleAdsId: z
            .string()
            .trim()
            .refine(
              (v) => v === "" || TRACKING_ID_PATTERNS.googleAdsId.test(v),
              "Identifiant Google Ads invalide. Exemple : AW-1234567890.",
            ),
          metaPixelId: z
            .string()
            .trim()
            .refine(
              (v) => v === "" || TRACKING_ID_PATTERNS.metaPixelId.test(v),
              "Identifiant Meta Pixel invalide (chiffres uniquement).",
            ),
        })
        .optional(),
      // Cabinets supplémentaires (multi-cabinets) — cf. SiteCabinet
      cabinets: z
        .array(
          z.object({
            name: z.string().trim().min(1, "Nom du cabinet manquant").max(120),
            address: z.string().trim().min(1, "Adresse du cabinet manquante").max(200),
            postalCode: z.string().trim().max(12),
            city: z.string().trim().min(1, "Ville du cabinet manquante").max(80),
            photoUrl: z
              .string()
              .trim()
              .refine((v) => v === "" || /^(https?:\/\/|\/)/.test(v), "Photo invalide")
              .optional(),
          }),
        )
        .max(8, "8 cabinets au maximum")
        .optional(),
      // Informations légales (pages Mentions légales / Confidentialité / Cookies) — cf. SiteLegal
      legal: z
        .object({
          legalForm: z.string().trim().max(80, "Forme juridique trop longue (80 caractères maximum)"),
          siret: z
            .string()
            .trim()
            .max(20)
            .refine(
              (v) => v === "" || /^(\d{9}|\d{14})$/.test(v.replace(/\s/g, "")),
              "SIRET invalide : 14 chiffres attendus (ou SIREN à 9 chiffres)",
            ),
          registration: z.string().trim().max(80, "Numéro d'enregistrement trop long (80 caractères maximum)"),
          email: z
            .string()
            .trim()
            .max(120, "E-mail trop long (120 caractères maximum)")
            .refine((v) => v === "" || z.string().email().safeParse(v).success, "E-mail invalide"),
          mediatorName: z.string().trim().max(120, "Nom du médiateur trop long (120 caractères maximum)"),
          mediatorUrl: z
            .string()
            .trim()
            .max(300)
            .refine(
              (v) => v === "" || /^https:\/\/[^\s/]+\.[^\s/]+/.test(v),
              "Le site du médiateur doit être une adresse https://",
            ),
          extra: z.string().trim().max(2000, "Mentions complémentaires trop longues (2000 caractères maximum)"),
        })
        .optional(),
      // Réseaux sociaux du pied de page : URL https:// sur le domaine du réseau — cf. FOOTER_SOCIAL_NETWORKS
      social: z
        .object(
          Object.fromEntries(
            FOOTER_SOCIAL_NETWORKS.map((n) => [n.key, z.string().trim().max(300, `Lien ${n.label} trop long`)]),
          ) as Record<(typeof FOOTER_SOCIAL_NETWORKS)[number]["key"], z.ZodString>,
        )
        .superRefine((links, ctx) => {
          const error = firstSocialError(links);
          if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
        })
        .optional(),
      // Pied de page : phrase d'accompagnement + informations complémentaires — cf. SiteFooterSettings
      footer: z
        .object({
          text: z.string().trim().max(300, "Texte du pied de page trop long (300 caractères maximum)"),
          details: z
            .string()
            .trim()
            .max(500, "Informations complémentaires trop longues (500 caractères maximum)"),
        })
        .optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Réglages invalides" };

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (!site) return { error: "Site introuvable" };
  const cabinets = (parsed.data.cabinets ?? site.theme.cabinets ?? []).map((c) => ({
    ...c,
    photoUrl: c.photoUrl || undefined,
  }));
  const faviconUrl =
    parsed.data.faviconUrl !== undefined
      ? parsed.data.faviconUrl || undefined
      : site.theme.faviconUrl;
  const shareImageUrl =
    parsed.data.seoImageUrl !== undefined
      ? parsed.data.seoImageUrl || undefined
      : site.theme.shareImageUrl;
  const tracking =
    parsed.data.tracking !== undefined
      ? {
          cookieBanner: parsed.data.tracking.cookieBanner,
          googleAnalyticsId: parsed.data.tracking.googleAnalyticsId || undefined,
          googleTagManagerId: parsed.data.tracking.googleTagManagerId || undefined,
          googleAdsId: parsed.data.tracking.googleAdsId || undefined,
          metaPixelId: parsed.data.tracking.metaPixelId || undefined,
        }
      : site.theme.tracking;
  const legal: SiteLegal | undefined =
    parsed.data.legal !== undefined
      ? compactRecord({
          legalForm: parsed.data.legal.legalForm,
          siret: parsed.data.legal.siret.replace(/\s/g, ""),
          registration: parsed.data.legal.registration,
          email: parsed.data.legal.email,
          mediatorName: parsed.data.legal.mediatorName,
          mediatorUrl: parsed.data.legal.mediatorUrl,
          extra: parsed.data.legal.extra,
        })
      : site.theme.legal;
  const social = parsed.data.social !== undefined ? normalizeSocialLinks(parsed.data.social) : site.theme.social;
  const footer =
    parsed.data.footer !== undefined
      ? compactRecord({ text: parsed.data.footer.text, details: parsed.data.footer.details })
      : site.theme.footer;
  await db
    .update(sites)
    .set({ name: parsed.data.name, bookingUrl: parsed.data.bookingUrl || null, updatedAt: new Date() })
    .where(eq(sites.id, session.siteId));
  // Thème écrit sous verrou : les champs non envoyés gardent leur valeur la
  // plus fraîche (pas celle lue en début d'action)
  const data = parsed.data;
  await updateSiteTheme(session.siteId, (fresh) => ({
    ...fresh,
    logoUrl: data.logoUrl || undefined,
    cabinets: data.cabinets !== undefined ? cabinets : fresh.cabinets,
    faviconUrl: data.faviconUrl !== undefined ? faviconUrl : fresh.faviconUrl,
    shareImageUrl: data.seoImageUrl !== undefined ? shareImageUrl : fresh.shareImageUrl,
    tracking: data.tracking !== undefined ? tracking : fresh.tracking,
    legal: data.legal !== undefined ? legal : fresh.legal,
    social: data.social !== undefined ? social : fresh.social,
    footer: data.footer !== undefined ? footer : fresh.footer,
  }));
  if (site.prospectId) {
    await db
      .update(prospects)
      .set({ city: parsed.data.city })
      .where(eq(prospects.id, site.prospectId));
  }
  // Vivent sur la page d'accueil : le numéro (section contact — source des
  // boutons « Appeler au … ») et le titre/description de l'aperçu du lien
  // (metaTitle/metaDescription, lus par le <head> du site public).
  if (
    parsed.data.phone !== undefined ||
    parsed.data.seoTitle !== undefined ||
    parsed.data.seoDescription !== undefined
  ) {
    const home = await db.query.pages.findFirst({
      where: and(eq(pages.siteId, session.siteId), eq(pages.type, "home")),
    });
    if (home) {
      const updated =
        parsed.data.phone !== undefined
          ? home.sections.map((s) =>
              s.type === "contact" ? { ...s, phone: parsed.data.phone || undefined } : s,
            )
          : home.sections;
      await db
        .update(pages)
        .set({
          sections: updated,
          metaTitle:
            parsed.data.seoTitle !== undefined ? parsed.data.seoTitle || null : home.metaTitle,
          metaDescription:
            parsed.data.seoDescription !== undefined
              ? parsed.data.seoDescription || null
              : home.metaDescription,
          updatedAt: new Date(),
        })
        .where(eq(pages.id, home.id));
    }
  }
  revalidatePath("/editor");
  return {};
}

/** Liste vide → `undefined` (clé retirée du JSONB). */
function emptyToUndefined<T>(list: T[]): T[] | undefined {
  return list.length > 0 ? list : undefined;
}

/** Objet sans ses chaînes vides ; `undefined` s'il ne reste rien (JSONB propre). */
function compactRecord<T extends Record<string, string>>(record: T): Partial<T> | undefined {
  const entries = Object.entries(record).filter(([, value]) => value !== "");
  return entries.length > 0 ? (Object.fromEntries(entries) as Partial<T>) : undefined;
}

// ─── Panneau Pages : pages de spécialité, page introuvable ───────────────────

/** Page de spécialité du site du client (par slug), ou null. */
async function ownedMotifPage(siteId: string, slug: string): Promise<Page | null> {
  const db = getDb();
  return (
    (await db.query.pages.findFirst({
      where: and(eq(pages.siteId, siteId), eq(pages.type, "motif"), eq(pages.slug, slug)),
    })) ?? null
  );
}

/**
 * Écriture du JSONB `theme` sous verrou de ligne (transaction + SELECT … FOR
 * UPDATE) : la transformation part toujours de l'état le plus frais, jamais
 * d'une lecture antérieure — deux écritures concurrentes (réglages, fin de
 * génération asynchrone, activation d'une page) ne s'écrasent plus.
 */
async function updateSiteTheme(
  siteId: string,
  transform: (theme: SiteTheme) => SiteTheme,
): Promise<SiteTheme | null> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ theme: sites.theme }).from(sites).where(eq(sites.id, siteId)).for("update");
    if (!row) return null;
    const next = transform(row.theme);
    await tx.update(sites).set({ theme: next, updatedAt: new Date() }).where(eq(sites.id, siteId));
    return next;
  });
}

/** Entrée de génération en cours (sans erreur) pour ce slug, sinon null. */
function generatingEntry(theme: SiteTheme, slug: string): GeneratingMotif | null {
  return (theme.generatingMotifs ?? []).find((g) => g.slug === slug && !g.error) ?? null;
}

const PAGE_GENERATING = "Cette page est en préparation : attendez la fin de la génération.";

/** Caractères de contrôle et de format (jamais dans un titre ou un sujet). */
const NO_CONTROL_CHARS = /^[^\p{Cc}\p{Cf}]*$/u;

/**
 * Intention « carte sur l'accueil » mémorisée avec l'entrée de génération
 * (relance après échec). Champ supplémentaire du JSONB, ignoré par le site.
 */

/** Lecture-modification-écriture de `theme.generatingMotifs` (état le plus frais). */
async function patchGeneratingMotifs(
  siteId: string,
  transform: (list: GeneratingMotif[]) => GeneratingMotif[],
): Promise<void> {
  await updateSiteTheme(siteId, (theme) => ({
    ...theme,
    generatingMotifs: emptyToUndefined(transform(theme.generatingMotifs ?? [])),
  }));
}

/**
 * Renomme une page de spécialité : titre de la page ET de sa carte sur
 * l'accueil ; l'adresse (slug) et le contenu ne changent pas.
 */
export async function renameMotifPage(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = z
    .object({
      slug: z.string().trim().min(1),
      title: z
        .string()
        .trim()
        .min(3, "Titre trop court (3 caractères minimum)")
        .max(SECTION_LIMITS.title, `Titre trop long (${SECTION_LIMITS.title} caractères maximum)`)
        .regex(NO_CONTROL_CHARS, "Titre invalide (caractères non autorisés)"),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Titre invalide" };
  const { slug, title } = parsed.data;

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (!site) return { error: "Site introuvable" };
  if (generatingEntry(site.theme, slug)) return { error: PAGE_GENERATING };
  const page = await ownedMotifPage(session.siteId, slug);
  if (!page) return { error: "Page de spécialité introuvable" };

  await db.update(pages).set({ title, updatedAt: new Date() }).where(eq(pages.id, page.id));
  await updateHomeSpecialties(session.siteId, (s) => ({
    ...s,
    items: s.items.map((it) => (it.slug === slug ? { ...it, title } : it)),
  }));
  revalidatePath("/editor");
  return {};
}

/** Titre et description Google (balises meta) d'une page ; vide = valeur par défaut du site. */
export async function savePageSeo(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = z
    .object({
      pageId: z.string().uuid(),
      metaTitle: z.string().trim().max(120, "Titre SEO trop long (120 caractères maximum)"),
      metaDescription: z.string().trim().max(300, "Description trop longue (300 caractères maximum)"),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Référencement invalide" };

  const db = getDb();
  const page = await db.query.pages.findFirst({
    where: and(eq(pages.id, parsed.data.pageId), eq(pages.siteId, session.siteId)),
  });
  if (!page) return { error: "Page introuvable" };
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (site && page.type === "motif" && generatingEntry(site.theme, page.slug)) return { error: PAGE_GENERATING };
  await db
    .update(pages)
    .set({
      metaTitle: parsed.data.metaTitle || null,
      metaDescription: parsed.data.metaDescription || null,
      updatedAt: new Date(),
    })
    .where(eq(pages.id, page.id));
  revalidatePath("/editor");
  return {};
}

/**
 * Supprime une page de spécialité (irréversible) : ligne `pages`, carte de
 * l'accueil, état d'activation / de génération, sujets d'articles planifiés.
 * L'accueil ne peut pas être supprimé.
 */
export async function deleteMotifPage(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = z.object({ slug: z.string().trim().min(1) }).safeParse(input);
  if (!parsed.success) return { error: "La page d'accueil ne peut pas être supprimée" };
  const { slug } = parsed.data;

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (!site) return { error: "Site introuvable" };
  const page = await ownedMotifPage(site.id, slug);
  if (!page) return { error: "Page de spécialité introuvable" };
  if (page.type !== "motif") return { error: "Seules les pages de spécialité peuvent être supprimées" };

  await db.delete(pages).where(eq(pages.id, page.id));
  await updateSiteTheme(site.id, (theme) => ({
    ...theme,
    disabledMotifs: (theme.disabledMotifs ?? []).filter((s) => s !== slug),
    generatingMotifs: emptyToUndefined((theme.generatingMotifs ?? []).filter((g) => g.slug !== slug)),
  }));
  await updateHomeSpecialties(site.id, (s) => ({ ...s, items: s.items.filter((it) => it.slug !== slug) }));
  await dropPlannedEntries(site.id, slug);

  revalidatePath("/editor");
  revalidatePath("/publications");
  return {};
}

/**
 * Génération (asynchrone, via `after`) du contenu d'une page de spécialité
 * créée depuis le studio : la page existe déjà (désactivée, sans sections).
 * Succès → contenu écrit, carte ajoutée sur l'accueil si demandé et possible,
 * entrée retirée de `generatingMotifs` ; échec → `error` sur l'entrée.
 */
async function runMotifGeneration(siteId: string, slug: string): Promise<void> {
  const db = getDb();
  try {
    const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
    if (!site?.prospectId) throw new Error("Site sans fiche praticien");
    const prospect = await db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) });
    if (!prospect) throw new Error("Fiche praticien introuvable");
    const page = await ownedMotifPage(siteId, slug);
    if (!page) return; // supprimée entre-temps
    const entry = (site.theme.generatingMotifs ?? []).find((g) => g.slug === slug);
    const subject = entry?.subject ?? page.title;

    const generated = await generateMotifContent(site, prospect, { slug, title: subject });

    // La page a pu être supprimée pendant la génération (~1 min)
    if (!(await ownedMotifPage(siteId, slug))) return;
    await db
      .update(pages)
      .set({
        title: generated.title,
        metaTitle: generated.metaTitle,
        metaDescription: generated.metaDescription,
        sections: generated.sections,
        updatedAt: new Date(),
      })
      .where(eq(pages.id, page.id));

    if (entry?.showCard) {
      const max = PLANS[site.plan].homeSpecialties;
      await updateHomeSpecialties(siteId, (s) => {
        if (s.items.some((it) => it.slug === slug) || s.items.length >= max) return s;
        return {
          ...s,
          items: [
            ...s.items,
            {
              slug,
              title: generated.title,
              excerpt: generated.excerpt,
              icon: specialtyIconFor(generated.title, s.items.length),
            },
          ],
        };
      });
    }
    await patchGeneratingMotifs(siteId, (list) => list.filter((g) => g.slug !== slug));
    // Blog : sujets d'articles pour ce nouveau motif (best-effort)
    try {
      await ensureEditorialCalendars();
    } catch (err) {
      console.warn("[motif] calendrier éditorial non mis à jour :", err);
    }
  } catch (err) {
    console.error(`[motif] génération de « ${slug} » impossible :`, err);
    await patchGeneratingMotifs(siteId, (list) =>
      list.map((g) => (g.slug === slug ? { ...g, error: "La génération a échoué." } : g)),
    ).catch((e) => console.error("[motif] état d'erreur non enregistré :", e));
  }
}

/**
 * Crée une page de spécialité : la page apparaît tout de suite (désactivée,
 * « En préparation… ») et son contenu est généré en arrière-plan.
 */
export async function createMotifPage(input: unknown): Promise<{ error?: string; slug?: string }> {
  const session = await requireClient();
  const parsed = z
    .object({
      subject: z
        .string()
        .trim()
        .min(3, "Indiquez le sujet de la page (3 caractères minimum)")
        .max(SECTION_LIMITS.title, `Sujet trop long (${SECTION_LIMITS.title} caractères maximum)`)
        .regex(NO_CONTROL_CHARS, "Sujet invalide (caractères non autorisés)"),
      showCard: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Sujet invalide" };
  const { subject, showCard } = parsed.data;

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (!site) return { error: "Site introuvable" };
  if (!site.prospectId) return { error: "Site sans fiche praticien" };

  // Transaction sous verrou de la ligne du site : le plafond de la formule est
  // recompté après le verrou (deux créations simultanées ne le dépassent
  // pas) et la page n'existe jamais sans son état « désactivée + en préparation »
  let slug: string;
  try {
    const created = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ theme: sites.theme, plan: sites.plan })
        .from(sites)
        .where(eq(sites.id, site.id))
        .for("update");
      if (!locked) return { error: "Site introuvable" };
      const existing = await tx.query.pages.findMany({
        where: eq(pages.siteId, site.id),
        columns: { slug: true, type: true, position: true },
      });
      const motifCount = existing.filter((p) => p.type === "motif").length;
      if (!canAddMotifPage(locked.plan, motifCount)) {
        const max = PLANS[locked.plan].maxMotifPages;
        return {
          error: `Votre formule comprend ${max} page${max > 1 ? "s" : ""} de spécialité : pour changer de sujet, utilisez « Changer de spécialité » ou supprimez une page.`,
        };
      }
      const taken = new Set(existing.map((p) => p.slug));
      const nextSlug = uniqueSlug(slugify(subject) || "specialite", (candidate) => taken.has(candidate));
      const position = existing.reduce((max, p) => Math.max(max, p.position), 0) + 1;
      await tx.insert(pages).values({
        siteId: site.id,
        type: "motif",
        slug: nextSlug,
        title: subject,
        sections: [],
        position,
      });
      const entry: GeneratingMotif = { slug: nextSlug, subject, startedAt: new Date().toISOString(), showCard };
      await tx
        .update(sites)
        .set({
          theme: {
            ...locked.theme,
            disabledMotifs: [...new Set([...(locked.theme.disabledMotifs ?? []), nextSlug])],
            generatingMotifs: [...(locked.theme.generatingMotifs ?? []).filter((g) => g.slug !== nextSlug), entry],
          },
          updatedAt: new Date(),
        })
        .where(eq(sites.id, site.id));
      return { slug: nextSlug };
    });
    if ("error" in created) return { error: created.error };
    slug = created.slug;
  } catch (err) {
    console.error("[motif] création impossible :", err);
    return { error: "La création de la page a échoué — réessayez dans un instant." };
  }

  // Génération en arrière-plan : la réponse part tout de suite, le panneau
  // Pages affiche « En préparation… » puis la page prête (désactivée).
  after(() => runMotifGeneration(site.id, slug));

  revalidatePath("/editor");
  return { slug };
}

/** Relance la génération d'une page de spécialité en erreur. */
export async function retryMotifGeneration(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = z.object({ slug: z.string().trim().min(1) }).safeParse(input);
  if (!parsed.success) return { error: "Requête invalide" };
  const { slug } = parsed.data;

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, session.siteId) });
  if (!site) return { error: "Site introuvable" };
  const entry = (site.theme.generatingMotifs ?? []).find((g) => g.slug === slug);
  if (!entry) return { error: "Aucune génération à relancer pour cette page" };
  if (!entry.error && !isGenerationStale(entry)) {
    return { error: "La génération de cette page est déjà en cours" };
  }
  if (!(await ownedMotifPage(site.id, slug))) return { error: "Page de spécialité introuvable" };

  await patchGeneratingMotifs(site.id, (list) =>
    list.map((g) =>
      g.slug === slug ? { ...g, startedAt: new Date().toISOString(), error: undefined } : g,
    ),
  );
  after(() => runMotifGeneration(site.id, slug));
  revalidatePath("/editor");
  return {};
}

/**
 * Page introuvable (404) personnalisée : titre, message (vide = masqué),
 * texte du bouton et liste des spécialités. Valeurs par défaut → entrée
 * retirée du JSONB.
 */
export async function saveNotFoundSettings(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = z
    .object({
      title: z.string().trim().max(SECTION_LIMITS.title, `Titre trop long (${SECTION_LIMITS.title} caractères maximum)`),
      message: z.string().trim().max(300, "Message trop long (300 caractères maximum)"),
      buttonLabel: z
        .string()
        .trim()
        .max(SECTION_LIMITS.buttonLabel, `Texte du bouton trop long (${SECTION_LIMITS.buttonLabel} caractères maximum)`),
      showSpecialties: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Réglages invalides" };

  const title = parsed.data.title || DEFAULT_NOT_FOUND.title;
  const buttonLabel = parsed.data.buttonLabel || DEFAULT_NOT_FOUND.buttonLabel;
  const isDefault =
    title === DEFAULT_NOT_FOUND.title &&
    parsed.data.message === DEFAULT_NOT_FOUND.message &&
    buttonLabel === DEFAULT_NOT_FOUND.buttonLabel &&
    parsed.data.showSpecialties === DEFAULT_NOT_FOUND.showSpecialties;
  const notFound: SiteNotFound | undefined = isDefault
    ? undefined
    : { title, message: parsed.data.message, buttonLabel, showSpecialties: parsed.data.showSpecialties };

  const updated = await updateSiteTheme(session.siteId, (theme) => ({ ...theme, notFound }));
  if (!updated) return { error: "Site introuvable" };
  revalidatePath("/editor");
  return {};
}
