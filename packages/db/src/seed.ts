/**
 * Seed de développement :
 * - un compte admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) ;
 * - une démo complète « Sophrologue à Albi » générée en mode mock
 *   (la definition of done de la Phase 1).
 *
 * Idempotent : relançable sans dupliquer les données.
 */

import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createSiteGenerator } from "@theralys/ai";
import { readingTimeMinutes, slugify } from "@theralys/shared";
import { getDb } from "./client";
import { motifPagesAllowance } from "./plans";
import {
  blogArticles,
  blogSettings,
  googleReviews,
  pages,
  prospects,
  sites,
  users,
} from "./schema";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function main() {
  const db = getDb();

  // ── Compte admin ────────────────────────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "contact@kitchenstrategy.fr";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin-change-me";
  const existingAdmin = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
  if (!existingAdmin) {
    await db.insert(users).values({
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      role: "admin",
      name: "Kitchen Strategy",
    });
    console.log(`✔ Admin créé : ${adminEmail}`);
  } else {
    console.log(`• Admin déjà présent : ${adminEmail}`);
  }

  // ── Démo « Sophrologue à Albi » ─────────────────────────────────────────────
  const demoSlug = "claire-dupont-sophrologue-albi";
  const existingSite = await db.query.sites.findFirst({ where: eq(sites.slug, demoSlug) });
  if (existingSite) {
    console.log(`• Démo déjà présente : ${demoSlug}`);
    return shutdown();
  }

  const generator = createSiteGenerator({ ...process.env, AI_MOCK: "1" });
  const input = {
    firstName: "Claire",
    lastName: "Dupont",
    profession: "Sophrologue",
    city: "Albi",
    gender: "feminin" as const,
    highlightedMotifs: ["Gestion du stress"],
    motifPageCount: motifPagesAllowance("scale"),
  };

  const [prospect] = await db
    .insert(prospects)
    .values({
      firstName: input.firstName,
      lastName: input.lastName,
      profession: input.profession,
      city: input.city,
      gender: input.gender,
    })
    .returning();

  const home = await generator.generateHome(input);

  const [site] = await db
    .insert(sites)
    .values({
      type: "demo",
      status: "generating",
      slug: demoSlug,
      name: home.siteName,
      plan: "scale",
      theme: home.theme,
      prospectId: prospect!.id,
      highlightedMotifs: input.highlightedMotifs,
      bookingUrl: "https://calendly.com/demo-theralys",
      demoExpiresAt: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  const siteId = site!.id;

  await db.insert(pages).values({
    siteId,
    type: "home",
    slug: "",
    title: "Accueil",
    metaTitle: home.metaTitle,
    metaDescription: home.metaDescription,
    sections: home.sections,
    position: 0,
  });

  for (const [i, motif] of home.motifsPlan.entries()) {
    const page = await generator.generateMotifPage(input, motif);
    await db.insert(pages).values({
      siteId,
      type: "motif",
      slug: page.slug,
      title: page.title,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      sections: page.sections,
      position: i + 1,
    });
  }

  const reviews = await generator.generateReviews(input);
  await db.insert(googleReviews).values(
    reviews.map((r) => ({
      siteId,
      authorName: r.authorName,
      rating: r.rating,
      text: r.text,
    })),
  );

  const articles = await generator.generateArticles(input, home.motifsPlan);
  const now = Date.now();
  await db.insert(blogArticles).values(
    articles.map((a, i) => ({
      siteId,
      title: a.title,
      slug: a.slug || slugify(a.title),
      excerpt: a.excerpt,
      content: a.content,
      status: (i < 2 ? "published" : "draft") as "published" | "draft",
      aiGenerated: true,
      motifSlug: a.motifSlug,
      publishAt: new Date(now - (2 - i) * 7 * 86_400_000),
      publishedAt: i < 2 ? new Date(now - (2 - i) * 7 * 86_400_000) : null,
      readingTimeMin: readingTimeMinutes(a.content),
    })),
  );

  await db.insert(blogSettings).values({ siteId });

  await db
    .update(sites)
    .set({
      status: "ready",
      generationProgress: { home: true, motifs: true, reviews: true, articles: true },
      updatedAt: new Date(),
    })
    .where(eq(sites.id, siteId));

  console.log(`✔ Démo générée : ${demoSlug} (${home.motifsPlan.length} pages de motifs, ${reviews.length} avis, ${articles.length} articles)`);
  return shutdown();
}

async function shutdown() {
  await globalThis.__theralysPool?.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
