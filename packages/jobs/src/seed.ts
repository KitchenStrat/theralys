/**
 * Seed de développement (idempotent) :
 * - compte admin + compte client de démonstration ;
 * - démo complète « Sophrologue à Albi » (pipeline mock de la Phase 1) ;
 * - données Phase 2 : tâches d'onboarding, historique d'articles du blog,
 *   calendrier éditorial à venir (via les vrais ticks), stats de visite sur
 *   60 jours, connexion Google mock + stats Search Console.
 */

import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import {
  createImageProvider,
  createSiteGenerator,
  mockVoicedArticle,
  type BlogVoice,
} from "@theralys/ai";
import { readingTimeMinutes } from "@theralys/shared";
import {
  analyticsEvents,
  blogArticles,
  blogSettings,
  editorialCalendarEntries,
  getDb,
  googleConnections,
  googleReviews,
  leads,
  motifPagesAllowance,
  onboardingTasks,
  pages,
  prospects,
  sites,
  users,
} from "@theralys/db";
import { addDays, planEditorialTopics, startOfDayUtc } from "./editorial";
import {
  ensureEditorialCalendars,
  generateDueArticles,
  publishDueArticles,
  syncGoogleData,
} from "./ticks";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

const DEMO_SLUG = "claire-dupont-sophrologue-albi";

async function main() {
  const db = getDb();
  const now = new Date();

  // ── Compte admin ────────────────────────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "contact@kitchenstrategy.fr";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin-change-me";
  if (!(await db.query.users.findFirst({ where: eq(users.email, adminEmail) }))) {
    await db.insert(users).values({
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      role: "admin",
      name: "Kitchen Strategy",
    });
    console.log(`✔ Admin créé : ${adminEmail}`);
  }

  // ── Démo « Sophrologue à Albi » ─────────────────────────────────────────────
  let site = await db.query.sites.findFirst({ where: eq(sites.slug, DEMO_SLUG) });
  if (!site) {
    site = await createDemoSite();
    console.log(`✔ Démo générée : ${DEMO_SLUG}`);
  }
  const siteId = site.id;

  // ── Compte client (accès au studio) ─────────────────────────────────────────
  const clientEmail = process.env.SEED_CLIENT_EMAIL ?? "claire@demo-theralys.fr";
  const clientPassword = process.env.SEED_CLIENT_PASSWORD ?? "client-demo";
  if (!(await db.query.users.findFirst({ where: eq(users.email, clientEmail) }))) {
    await db.insert(users).values({
      email: clientEmail,
      passwordHash: hashPassword(clientPassword),
      role: "client",
      name: "Claire Dupont",
      siteId,
    });
    console.log(`✔ Client créé : ${clientEmail}`);
  }

  // ── Tâches d'onboarding ─────────────────────────────────────────────────────
  const existingTasks = await db.query.onboardingTasks.findMany({
    where: eq(onboardingTasks.siteId, siteId),
  });
  if (existingTasks.length === 0) {
    const tasks = [
      { key: "guided_tour", done: false, position: 0 },
      { key: "connect_google", done: true, position: 1 },
      { key: "verify_pages", done: true, position: 2 },
      { key: "publish_site", done: false, position: 3 },
      { key: "activate_blog", done: true, position: 4 },
    ];
    await db.insert(onboardingTasks).values(
      tasks.map((t) => ({
        siteId,
        key: t.key,
        done: t.done,
        completedAt: t.done ? now : null,
        position: t.position,
      })),
    );
    console.log("✔ Tâches d'onboarding créées");
  }

  // ── Connexion Google (mock) ─────────────────────────────────────────────────
  if (
    !(await db.query.googleConnections.findFirst({
      where: eq(googleConnections.siteId, siteId),
    }))
  ) {
    await db.insert(googleConnections).values({
      siteId,
      status: "connected",
      googleEmail: "claire.dupont.sophro@gmail.com",
      searchConsoleSiteUrl: `sc-domain:${DEMO_SLUG}.fr`,
      scopes: ["webmasters.readonly", "business.manage"],
    });
    console.log("✔ Connexion Google (mock) créée");
  }

  // ── Historique du blog (5 semaines passées, voix par défaut) ────────────────
  const existingEntries = await db.query.editorialCalendarEntries.findMany({
    where: eq(editorialCalendarEntries.siteId, siteId),
  });
  if (existingEntries.length === 0) {
    await seedBlogHistory(siteId, now);
    console.log("✔ Historique du blog créé");
  }

  // ── Trafic : 60 jours de pageviews + clics RDV ──────────────────────────────
  const hasEvents = await db.query.analyticsEvents.findFirst({
    where: eq(analyticsEvents.siteId, siteId),
  });
  if (!hasEvents) {
    await seedTraffic(siteId, now);
    console.log("✔ Trafic de démonstration créé (60 jours)");
  }

  // ── Pipeline commercial (onglet Leads) ──────────────────────────────────────
  if (!(await db.query.leads.findFirst())) {
    await db.insert(leads).values([
      {
        name: "Claire Dupont",
        source: "demo",
        status: "demo_sent",
        prospectId: site.prospectId,
        notes: "Très intéressée, rappel prévu la semaine prochaine",
      },
      {
        name: "Sophie Bernard",
        email: "sophie.bernard@exemple.fr",
        source: "landing",
        status: "new",
        notes: "Naturopathe à Montpellier, formulaire de contact",
      },
      {
        name: "Marc Lefèvre",
        email: "marc.lefevre@exemple.fr",
        phone: "06 12 34 56 78",
        source: "referral",
        status: "lost",
        notes: "Parrainé par Claire — a choisi de refaire son site lui-même",
      },
    ]);
    console.log("✔ Leads de démonstration créés");
  }

  // ── Ticks réels : calendrier à venir, rédaction J-7, publication, sync GSC ──
  const reports = [
    await ensureEditorialCalendars(now),
    await generateDueArticles(now),
    await publishDueArticles(now),
    await syncGoogleData(now),
  ];
  for (const r of reports) console.log(`✔ tick ${r.task}: ${r.processed} traité(s)`);

  await shutdown();
}

async function createDemoSite() {
  const db = getDb();
  const generator = createSiteGenerator({ ...process.env, AI_MOCK: "1" });
  const input = {
    firstName: "Claire",
    lastName: "Dupont",
    profession: "Sophrologue",
    city: "Albi",
    gender: "feminin" as const,
    highlightedMotifs: ["Gestion du stress"],
    motifPageCount: motifPagesAllowance("scale"),
    googleEnrichment: {
      businessName: "Claire Dupont Sophrologie",
      address: "14 rue de la Berbie, 81000 Albi",
      rating: 4.9,
      reviewCount: 27,
    },
  };

  const [prospect] = await db
    .insert(prospects)
    .values({
      firstName: input.firstName,
      lastName: input.lastName,
      profession: input.profession,
      city: input.city,
      gender: input.gender,
      googlePlaceId: "mock-claire-dupont-albi",
      googleBusinessName: input.googleEnrichment.businessName,
      googleAddress: input.googleEnrichment.address,
      googleRating: input.googleEnrichment.rating,
      googleReviewCount: input.googleEnrichment.reviewCount,
    })
    .returning();

  const home = await generator.generateHome(input);
  const [site] = await db
    .insert(sites)
    .values({
      type: "demo",
      status: "ready",
      slug: DEMO_SLUG,
      name: home.siteName,
      plan: "scale",
      theme: home.theme,
      prospectId: prospect!.id,
      highlightedMotifs: input.highlightedMotifs,
      bookingUrl: "https://calendly.com/demo-theralys",
      demoExpiresAt: new Date(Date.now() + 90 * 86_400_000),
      generationProgress: { home: true, motifs: true, reviews: true, articles: true },
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
    reviews.map((r) => ({ siteId, authorName: r.authorName, rating: r.rating, text: r.text })),
  );
  await db.insert(blogSettings).values({ siteId, voiceAccord: "feminin" });
  return site!;
}

/** 5 semaines d'articles déjà publiés (comme un blog qui tourne depuis un mois). */
async function seedBlogHistory(siteId: string, now: Date) {
  const db = getDb();
  const imageProvider = createImageProvider({ IMAGE_PROVIDER: "mock" } as NodeJS.ProcessEnv);
  const voice: BlogVoice = { designation: "je", accord: "feminin", reader: "vous", tone: "chaleureux" };

  const motifs = await db.query.pages.findMany({
    where: (p, { and: andOp, eq: eqOp }) => andOp(eqOp(p.siteId, siteId), eqOp(p.type, "motif")),
    orderBy: (p, { asc }) => [asc(p.position)],
  });

  const past = planEditorialTopics({
    motifs: motifs.map((m) => ({ slug: m.slug, title: m.title })),
    city: "Albi",
    plan: "scale",
    from: addDays(startOfDayUtc(now), -35),
    horizonWeeks: 5,
    existingDates: new Set(),
  }).filter((t) => t.scheduledFor < now.toISOString().slice(0, 10));

  for (const topic of past) {
    const article = mockVoicedArticle(
      {
        topic: topic.topic,
        motifSlug: topic.motifSlug,
        motifTitle: motifs.find((m) => m.slug === topic.motifSlug)?.title ?? null,
        profession: "Sophrologue",
        city: "Albi",
        firstName: "Claire",
      },
      voice,
    );
    const image = await imageProvider.generate({ subject: article.title, themeColor: "#6f5b9c" });
    const publishAt = new Date(`${topic.scheduledFor}T07:00:00Z`);

    const [inserted] = await db
      .insert(blogArticles)
      .values({
        siteId,
        title: article.title,
        slug: `${article.slug}`.slice(0, 200),
        excerpt: article.excerpt,
        content: article.content,
        imageUrl: image.url,
        imageAiGenerated: true,
        status: "published",
        aiGenerated: true,
        motifSlug: topic.motifSlug,
        publishAt,
        publishedAt: publishAt,
        readingTimeMin: readingTimeMinutes(article.content),
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      await db.insert(editorialCalendarEntries).values({
        siteId,
        scheduledFor: topic.scheduledFor,
        topic: topic.topic,
        motifSlug: topic.motifSlug,
        status: "generated",
        articleId: inserted.id,
      });
    }
  }
}

/** Trafic plausible : tendance à la hausse, creux le week-end, ~30 % de clics RDV. */
async function seedTraffic(siteId: string, now: Date) {
  const db = getDb();
  const rows: (typeof analyticsEvents.$inferInsert)[] = [];
  let visitorCounter = 0;

  for (let i = 60; i >= 1; i--) {
    const day = addDays(startOfDayUtc(now), -i);
    const weekend = [0, 6].includes(day.getUTCDay());
    const trend = 3 + Math.round(((60 - i) / 60) * 7);
    const visitors = Math.max(1, Math.round(trend * (weekend ? 0.5 : 1) + ((i * 7) % 3)));

    for (let v = 0; v < visitors; v++) {
      const visitorId = `seed-visitor-${++visitorCounter}`;
      const at = new Date(day.getTime() + ((v * 137) % 12) * 3_600_000 + 8 * 3_600_000);
      rows.push({ siteId, type: "pageview", visitorId, path: "/", occurredAt: at });
      if ((v + i) % 3 === 0) {
        rows.push({
          siteId,
          type: "pageview",
          visitorId,
          path: "/motifs/gestion-du-stress",
          occurredAt: new Date(at.getTime() + 90_000),
        });
      }
      if ((v + i) % 4 === 0) {
        rows.push({
          siteId,
          type: "rdv_click",
          visitorId,
          path: "/",
          occurredAt: new Date(at.getTime() + 150_000),
        });
      }
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(analyticsEvents).values(rows.slice(i, i + 500));
  }
}

async function shutdown() {
  await globalThis.__theralysPool?.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
