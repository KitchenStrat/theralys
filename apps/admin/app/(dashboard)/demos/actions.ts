"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  blogArticles,
  blogSettings,
  getDb,
  googleReviews,
  leads,
  pages,
  prospects,
  sites,
} from "@theralys/db";
import { SignJWT } from "jose";
import { DEFAULT_THEME, THEME_PRESETS, slugify, uniqueSlug } from "@theralys/shared";
import { requireAdmin } from "@/lib/auth";
import { runGenerationJob } from "@/lib/generation";
import { getPlacesProvider, type PlaceResult } from "@/lib/places";

const demoFormSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis"),
  lastName: z.string().trim().min(1, "Nom requis"),
  profession: z.string().trim().min(2, "Métier requis"),
  city: z.string().trim().min(1, "Ville requise"),
  gender: z.enum(["feminin", "masculin"]),
  language: z.literal("fr").default("fr"),
  highlightedMotifs: z.array(z.string().trim().min(1)).max(12).default([]),
  bookingUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || /^(https?:\/\/|tel:)/.test(v), "Lien invalide (https:// ou tel:)")
    .default(""),
  validityDays: z.coerce.number().int().min(1).max(365).default(30),
  googlePlace: z
    .object({
      placeId: z.string(),
      name: z.string(),
      address: z.string(),
      rating: z.number(),
      reviewCount: z.number(),
    })
    .nullable()
    .default(null),
});

export type DemoFormState = { error?: string };

/**
 * Remplace les avis du site par les vrais avis Google de la fiche
 * (API Places réelle uniquement — le mock garde les avis existants).
 * Best-effort : un échec n'empêche pas l'enregistrement du formulaire.
 */
async function refreshReviewsFromPlace(
  siteId: string,
  prospectId: string,
  placeId: string,
): Promise<void> {
  const places = getPlacesProvider();
  if (places.mode !== "google") return;
  try {
    const db = getDb();
    const details = await places.fetchDetails(placeId);
    if (details.reviews.length === 0) return;
    await db.delete(googleReviews).where(eq(googleReviews.siteId, siteId));
    await db.insert(googleReviews).values(
      details.reviews.map((r) => ({
        siteId,
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
        .where(eq(prospects.id, prospectId));
    }
  } catch (err) {
    console.warn("[reviews] rafraîchissement depuis la fiche Google impossible :", err);
  }
}

/** Création d'une démo : prospect + site puis job de génération asynchrone. */
export async function createDemo(input: unknown): Promise<DemoFormState> {
  await requireAdmin();
  const parsed = demoFormSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Formulaire invalide" };
  }
  const data = parsed.data;
  const db = getDb();

  const [prospect] = await db
    .insert(prospects)
    .values({
      firstName: data.firstName,
      lastName: data.lastName,
      profession: data.profession,
      city: data.city,
      gender: data.gender,
      googlePlaceId: data.googlePlace?.placeId ?? null,
      googleBusinessName: data.googlePlace?.name ?? null,
      googleAddress: data.googlePlace?.address ?? null,
      googleRating: data.googlePlace?.rating ?? null,
      googleReviewCount: data.googlePlace?.reviewCount ?? null,
    })
    .returning();

  const slug = await availableSlug(
    `${data.firstName} ${data.lastName} ${data.profession} ${data.city}`,
  );

  const [site] = await db
    .insert(sites)
    .values({
      type: "demo",
      status: "generating",
      slug,
      name: `${data.firstName} ${data.lastName}`,
      plan: "boost", // les démos présentent l'offre complète (équivalent Boost)
      language: data.language,
      bookingUrl: data.bookingUrl || null,
      theme: DEFAULT_THEME,
      prospectId: prospect!.id,
      highlightedMotifs: data.highlightedMotifs,
      demoExpiresAt: new Date(Date.now() + data.validityDays * 86_400_000),
    })
    .returning();

  // Chaque démo alimente le pipeline commercial (onglet Leads)
  await db.insert(leads).values({
    name: `${data.firstName} ${data.lastName}`,
    source: "demo",
    status: "demo_sent",
    prospectId: prospect!.id,
  });

  // Job asynchrone : la réponse part tout de suite, la liste affiche
  // « En préparation » puis « Prête à vérifier ».
  after(() => runGenerationJob(site!.id));

  revalidatePath("/demos");
  return {};
}

/** Duplication d'une démo : copie du prospect, du site et de tout le contenu. */
export async function duplicateDemo(siteId: string): Promise<void> {
  await requireAdmin();
  const db = getDb();
  const source = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!source || source.type !== "demo") throw new Error("Démo introuvable");

  const sourceProspect = source.prospectId
    ? await db.query.prospects.findFirst({ where: eq(prospects.id, source.prospectId) })
    : null;

  let newProspectId: string | null = null;
  if (sourceProspect) {
    const { id: _id, createdAt: _c, ...prospectData } = sourceProspect;
    const [copy] = await db.insert(prospects).values(prospectData).returning();
    newProspectId = copy!.id;
  }

  const slug = await availableSlug(`${source.slug}-copie`);
  const {
    id: _sid,
    createdAt: _sc,
    updatedAt: _su,
    ...siteData
  } = source;
  const [copy] = await db
    .insert(sites)
    .values({
      ...siteData,
      slug,
      name: `${source.name} (copie)`,
      domain: null,
      prospectId: newProspectId,
      demoExpiresAt: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  const newSiteId = copy!.id;

  // Copie du contenu (pages, avis, articles, réglages du blog)
  const [sourcePages, sourceReviews, sourceArticles, sourceSettings] = await Promise.all([
    db.query.pages.findMany({ where: eq(pages.siteId, siteId) }),
    db.query.googleReviews.findMany({ where: eq(googleReviews.siteId, siteId) }),
    db.query.blogArticles.findMany({ where: eq(blogArticles.siteId, siteId) }),
    db.query.blogSettings.findFirst({ where: eq(blogSettings.siteId, siteId) }),
  ]);

  if (sourcePages.length > 0) {
    await db.insert(pages).values(
      sourcePages.map(({ id: _i, createdAt: _cr, updatedAt: _up, ...page }) => ({
        ...page,
        siteId: newSiteId,
      })),
    );
  }
  if (sourceReviews.length > 0) {
    await db.insert(googleReviews).values(
      sourceReviews.map(({ id: _i, syncedAt: _s, ...review }) => ({
        ...review,
        siteId: newSiteId,
      })),
    );
  }
  if (sourceArticles.length > 0) {
    await db.insert(blogArticles).values(
      sourceArticles.map(({ id: _i, createdAt: _cr, updatedAt: _up, ...article }) => ({
        ...article,
        siteId: newSiteId,
      })),
    );
  }
  if (sourceSettings) {
    const { id: _i, updatedAt: _u, ...settings } = sourceSettings;
    await db.insert(blogSettings).values({ ...settings, siteId: newSiteId });
  }

  revalidatePath("/demos");
  redirect(`/demos/${newSiteId}/edit`);
}

const updateDemoSchema = demoFormSchema.extend({
  siteId: z.string().uuid(),
  themePreset: z.enum(THEME_PRESETS),
});

/** Édition d'une démo existante (fiche prospect + réglages du site). */
export async function updateDemo(input: unknown): Promise<DemoFormState> {
  await requireAdmin();
  const parsed = updateDemoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Formulaire invalide" };
  }
  const data = parsed.data;
  const db = getDb();

  const site = await db.query.sites.findFirst({ where: eq(sites.id, data.siteId) });
  if (!site || site.type !== "demo") return { error: "Démo introuvable" };

  if (site.prospectId) {
    await db
      .update(prospects)
      .set({
        firstName: data.firstName,
        lastName: data.lastName,
        profession: data.profession,
        city: data.city,
        gender: data.gender,
        // Fiche Google : uniquement si une nouvelle fiche a été sélectionnée
        ...(data.googlePlace
          ? {
              googlePlaceId: data.googlePlace.placeId,
              googleBusinessName: data.googlePlace.name,
              googleAddress: data.googlePlace.address,
              googleRating: data.googlePlace.rating,
              googleReviewCount: data.googlePlace.reviewCount,
            }
          : {}),
      })
      .where(eq(prospects.id, site.prospectId));

    // Récupération immédiate des vrais avis de la nouvelle fiche (best-effort)
    if (data.googlePlace) {
      await refreshReviewsFromPlace(site.id, site.prospectId, data.googlePlace.placeId);
    }
  }

  await db
    .update(sites)
    .set({
      bookingUrl: data.bookingUrl || null,
      highlightedMotifs: data.highlightedMotifs,
      demoExpiresAt: new Date(Date.now() + data.validityDays * 86_400_000),
      theme: { ...site.theme, preset: data.themePreset },
      updatedAt: new Date(),
    })
    .where(eq(sites.id, data.siteId));

  revalidatePath("/demos");
  revalidatePath(`/demos/${data.siteId}/edit`);
  return {};
}

/** Relance la génération complète du contenu (après édition ou erreur). */
export async function regenerateDemo(siteId: string): Promise<void> {
  await requireAdmin();
  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site || site.type !== "demo") throw new Error("Démo introuvable");

  await db
    .update(sites)
    .set({
      status: "generating",
      generationError: null,
      generationProgress: { home: false, motifs: false, reviews: false, articles: false },
      updatedAt: new Date(),
    })
    .where(eq(sites.id, siteId));

  after(() => runGenerationJob(siteId));

  revalidatePath("/demos");
  revalidatePath(`/demos/${siteId}/edit`);
}

/** Recherche de fiche Google (mock tant que la clé Places n'existe pas). */
export async function searchGooglePlaces(query: string): Promise<PlaceResult[]> {
  await requireAdmin();
  return getPlacesProvider().search(query);
}

async function availableSlug(base: string): Promise<string> {
  const db = getDb();
  const existing = await db.select({ slug: sites.slug }).from(sites);
  const taken = new Set(existing.map((r) => r.slug));
  return uniqueSlug(slugify(base), (candidate) => taken.has(candidate));
}

/**
 * Éditeur visuel d'un site (démo ou client) : URL signée courte durée ouvrant
 * l'éditeur du studio en session « agence » — fonctionne même sans compte
 * client (démos).
 */
export async function getSiteEditorUrl(
  siteId: string,
): Promise<{ url: string } | { error: string }> {
  await requireAdmin();
  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) return { error: "Site introuvable" };

  const secret = process.env.AUTH_SECRET;
  if (!secret) return { error: "AUTH_SECRET manquante" };

  const token = await new SignJWT({
    purpose: "studio-impersonation",
    agency: true,
    siteId: site.id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 120)
    .sign(new TextEncoder().encode(secret));

  const base = (process.env.STUDIO_BASE_URL ?? "http://localhost:3002").replace(/\/$/, "");
  return { url: `${base}/impersonate?token=${encodeURIComponent(token)}&next=/editor` };
}
