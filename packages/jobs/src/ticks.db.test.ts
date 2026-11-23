/**
 * Tests d'intégration des tâches planifiées sur une vraie base PostgreSQL :
 * périmètre des sites servis, verrous consultatifs, transactions — ce qu'une
 * base simulée ne peut pas prouver. Ignorés sans JOBS_TEST_DATABASE_URL (la CI
 * n'a pas de base) :
 *
 *   createdb theralys_jobs_test
 *   pg_dump --schema-only --no-owner theralys | psql theralys_jobs_test
 *   JOBS_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/theralys_jobs_test \
 *     pnpm --filter @theralys/jobs exec vitest run src/ticks.db.test.ts
 *
 * La base désignée est VIDÉE de ses sites à chaque test : son nom doit finir
 * par « _test », jamais celle de développement. Rédaction et images en mock.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type * as DbModule from "@theralys/db";
import type * as GoogleModule from "@theralys/providers/google";
import type * as TicksModule from "./ticks";

const URL = process.env.JOBS_TEST_DATABASE_URL ?? "";
const enabled = /_test(\?|$)/.test(URL);

// Fiche Google : fournisseur Places simulé en mode réel (aucun appel réseau), piloté par les tests
const places = vi.hoisted(() => ({ mode: "mock" as "google" | "mock", calls: [] as string[], fail: new Set<string>() }));
vi.mock("@theralys/providers/google", async (importOriginal) => {
  const original = await importOriginal<typeof GoogleModule>();
  return {
    ...original,
    createGooglePlacesProvider: () => ({
      mode: places.mode,
      search: async () => [],
      fetchDetails: async (placeId: string) => {
        places.calls.push(placeId);
        if (places.fail.has(placeId)) throw new original.GooglePlacesError("Places details 404: introuvable", 404);
        return {
          rating: 4.8,
          reviewCount: 12,
          photoUrl: null,
          reviews: [{ sourceReviewId: `${placeId}/avis/1`, authorName: "Camille D.", authorPhotoUrl: null, rating: 5, text: "Un accueil chaleureux.", reviewedAt: new Date("2026-10-01T00:00:00Z") }],
          location: null,
          website: null,
          phone: null,
          hasHours: null,
          primaryType: null,
          photoCount: null,
        };
      },
    }),
  };
});

const NOW = new Date("2026-11-16T06:00:00Z"); // lundi
const DAY = 86_400_000;
const THEME = { preset: "terracotta", fontPreset: "chaleureux" } as const;

let db: DbModule.Database;
let schema: typeof DbModule;
let ticks: typeof TicksModule;
let counter = 0;

type SiteSeed = {
  type?: "demo" | "client";
  status?: "ready" | "published" | "archived";
  plan?: "starter" | "boost" | "scale";
  demoExpiresAt?: Date | null;
  placeId?: string | null;
  blog?: boolean;
};

/** Site avec son prospect, deux pages de spécialité et (sauf `blog: false`) ses réglages de blog. */
async function createSite(seed: SiteSeed = {}): Promise<string> {
  const n = ++counter;
  const [prospect] = await db
    .insert(schema.prospects)
    .values({ firstName: "Claire", lastName: `Dupont ${n}`, profession: "Sophrologue", city: "Albi", gender: "feminin", googlePlaceId: seed.placeId ?? null })
    .returning({ id: schema.prospects.id });
  const type = seed.type ?? "client";
  const [site] = await db
    .insert(schema.sites)
    .values({
      type,
      status: seed.status ?? (type === "client" ? "published" : "ready"),
      slug: `site-test-${n}`,
      name: `Site de test ${n}`,
      plan: seed.plan ?? "scale",
      theme: THEME,
      prospectId: prospect!.id,
      demoExpiresAt: seed.demoExpiresAt ?? null,
    })
    .returning({ id: schema.sites.id });
  const siteId = site!.id;
  await db.insert(schema.pages).values([
    { siteId, type: "motif", slug: "stress-au-travail", title: "Stress au travail", position: 1 },
    { siteId, type: "motif", slug: "sommeil", title: "Troubles du sommeil", position: 2 },
  ]);
  if (seed.blog !== false) await db.insert(schema.blogSettings).values({ siteId });
  return siteId;
}

const entriesOf = (siteId: string) => db.select().from(schema.editorialCalendarEntries).where(eq(schema.editorialCalendarEntries.siteId, siteId));
const articlesOf = (siteId: string) => db.select().from(schema.blogArticles).where(eq(schema.blogArticles.siteId, siteId));
const iso = (date: Date) => date.toISOString().slice(0, 10);

async function plan(siteId: string, scheduledFor: string, topic: string, status: "planned" | "generated" | "skipped" = "planned"): Promise<string> {
  const [entry] = await db.insert(schema.editorialCalendarEntries).values({ siteId, scheduledFor, topic, motifSlug: "sommeil", status }).returning({ id: schema.editorialCalendarEntries.id });
  return entry!.id;
}

describe.skipIf(!enabled)("tâches planifiées sur une vraie base", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.AI_MOCK = "1";
    process.env.IMAGE_PROVIDER = "mock";
    process.env.STOCK_IMAGE_PROVIDER = "mock";
    delete process.env.DATAFORSEO_LOGIN;
    schema = await import("@theralys/db");
    ticks = await import("./ticks");
    db = schema.getDb();
  });

  beforeEach(async () => {
    places.mode = "mock";
    places.calls.length = 0;
    places.fail.clear();
    await db.execute(sql`truncate table sites, prospects, users restart identity cascade`);
  });

  afterAll(async () => {
    await globalThis.__theralysPool?.end();
    globalThis.__theralysPool = undefined;
  });

  describe("calendrier éditorial", () => {
    it("clients non archivés et démos en cours seulement ; ni archivé, ni démo expirée, ni formule sans blog", async () => {
      const client = await createSite();
      const liveDemo = await createSite({ type: "demo", demoExpiresAt: new Date(NOW.getTime() + 10 * DAY) });
      const openDemo = await createSite({ type: "demo", demoExpiresAt: null });
      const expiredDemo = await createSite({ type: "demo", demoExpiresAt: new Date(NOW.getTime() - DAY) });
      const archived = await createSite({ status: "archived" });
      const scaleOnly = await createSite({ plan: "boost" });

      expect(await ticks.ensureEditorialCalendars(NOW)).toEqual({ task: "editorial-calendar", processed: 72, status: "ok" });
      for (const siteId of [client, liveDemo, openDemo]) expect(await entriesOf(siteId)).toHaveLength(24);
      for (const siteId of [expiredDemo, archived, scaleOnly]) expect(await entriesOf(siteId)).toHaveLength(0);
      // Idempotent : un second passage n'ajoute rien
      expect(await ticks.ensureEditorialCalendars(NOW)).toMatchObject({ processed: 0, status: "ok" });
    });

    it("passages simultanés (cron, lancement à la main, action du studio) : jamais deux sujets le même jour", async () => {
      const client = await createSite();
      const reports = await Promise.all([
        ticks.ensureEditorialCalendars(NOW),
        ticks.ensureEditorialCalendars(NOW),
        ticks.ensureEditorialCalendarForSite(client, NOW),
        ticks.ensureEditorialCalendarForSite(client, NOW),
      ]);
      expect(reports.reduce((sum, report) => sum + report.processed, 0)).toBe(24);
      const entries = await entriesOf(client);
      expect(entries).toHaveLength(24);
      expect(new Set(entries.map((entry) => entry.scheduledFor)).size).toBe(24);
      expect(new Set(entries.map((entry) => entry.topic)).size).toBe(24);
    });

    it("nettoyage proposé au propriétaire : les sujets à venir suffixés d'une date sont retirés, le passage suivant replanifie leurs dates sans date dans le titre", async () => {
      // L'instruction compare à CURRENT_DATE : ce test part de l'horloge réelle, pas de NOW
      const today = new Date();
      const client = await createSite();
      await ticks.ensureEditorialCalendars(today);
      // Ancien format : deux sujets à venir et un sujet du jour portent une date entre parenthèses
      const dated = (await entriesOf(client)).filter((entry) => entry.scheduledFor > iso(today)).slice(3, 5);
      expect(dated).toHaveLength(2);
      for (const entry of dated) await db.update(schema.editorialCalendarEntries).set({ topic: `${entry.topic} (${entry.scheduledFor})` }).where(eq(schema.editorialCalendarEntries.id, entry.id));
      const current = await plan(client, iso(today), `Sujet du jour (${iso(today)})`);

      await db.execute(sql`
        DELETE FROM editorial_calendar_entries
         WHERE status = 'planned'
           AND scheduled_for > CURRENT_DATE
           AND topic ~ ' \\(\\d{4}-\\d{2}-\\d{2}\\)$'`);
      const remaining = await entriesOf(client);
      for (const entry of dated) expect(remaining.some((row) => row.id === entry.id)).toBe(false);
      // Le sujet du jour reste : il est rédigé tel quel, la date n'est pas envoyée à l'IA
      expect(remaining.some((row) => row.id === current)).toBe(true);
      expect(remaining).toHaveLength(24 + 1 - 2);

      expect(await ticks.ensureEditorialCalendars(today)).toEqual({ task: "editorial-calendar", processed: 2, status: "ok" });
      const after = await entriesOf(client);
      for (const entry of dated) {
        const replanned = after.filter((row) => row.scheduledFor === entry.scheduledFor);
        expect(replanned).toHaveLength(1);
        expect(replanned[0]!.topic).not.toMatch(/\(\d{4}-\d{2}-\d{2}\)/);
      }
    });

    it("variante par site : ce site seulement, mêmes règles d'accès", async () => {
      const client = await createSite();
      const other = await createSite();
      const archived = await createSite({ status: "archived" });
      expect(await ticks.ensureEditorialCalendarForSite(client, NOW)).toEqual({ task: "editorial-calendar", processed: 24, status: "ok" });
      expect(await entriesOf(other)).toHaveLength(0);
      expect(await ticks.ensureEditorialCalendarForSite(archived, NOW)).toMatchObject({ processed: 0 });
      expect(await entriesOf(archived)).toHaveLength(0);
    });
  });

  describe("rédaction des articles", () => {
    it("clients non archivés seulement : aucune rédaction pour une démo, un site archivé ou une formule sans blog", async () => {
      const client = await createSite();
      const demo = await createSite({ type: "demo", demoExpiresAt: new Date(NOW.getTime() + 10 * DAY) });
      const archived = await createSite({ status: "archived" });
      const scaleOnly = await createSite({ plan: "boost" });
      const due = iso(new Date(NOW.getTime() + 3 * DAY));
      for (const siteId of [client, demo, archived, scaleOnly]) await plan(siteId, due, `Sujet du site ${siteId}`);

      expect(await ticks.generateDueArticles(NOW)).toEqual({ task: "generate-articles", processed: 1, status: "ok" });
      expect(await articlesOf(client)).toHaveLength(1);
      for (const siteId of [demo, archived, scaleOnly]) {
        expect(await articlesOf(siteId)).toHaveLength(0);
        // Date à venir : le sujet reste planifié (la démo le montre dans son calendrier)
        expect((await entriesOf(siteId)).map((entry) => entry.status)).toEqual(["planned"]);
      }
      const [article] = await articlesOf(client);
      expect(article).toMatchObject({ status: "scheduled", aiGenerated: true, motifSlug: "sommeil", publishAt: new Date(`${due}T07:00:00Z`) });
      const [entry] = await entriesOf(client);
      expect(entry).toMatchObject({ status: "generated", articleId: article!.id });
    });

    it("deux passages simultanés : un seul article par sujet, aucune adresse en « -2 »", async () => {
      const client = await createSite();
      const second = await createSite();
      await ticks.ensureEditorialCalendars(NOW);
      const dueCount = async (siteId: string) => (await entriesOf(siteId)).filter((entry) => entry.scheduledFor <= iso(new Date(NOW.getTime() + 7 * DAY))).length;
      const expected = (await dueCount(client)) + (await dueCount(second));
      expect(expected).toBeGreaterThan(4);

      const reports = await Promise.all([ticks.generateDueArticles(NOW), ticks.generateDueArticles(NOW), ticks.generateDueArticles(NOW)]);
      expect(reports.every((report) => report.status === "ok")).toBe(true);
      expect(reports.reduce((sum, report) => sum + report.processed, 0)).toBe(expected);
      for (const siteId of [client, second]) {
        const articles = await articlesOf(siteId);
        const written = (await entriesOf(siteId)).filter((entry) => entry.status === "generated");
        expect(articles).toHaveLength(written.length);
        expect(new Set(written.map((entry) => entry.articleId)).size).toBe(written.length);
        expect(articles.filter((article) => /-\d+$/.test(article.slug))).toEqual([]);
      }
      // Passage suivant : plus rien à rédiger
      expect(await ticks.generateDueArticles(NOW)).toMatchObject({ processed: 0, status: "ok" });
    });

    it("deux sujets du même site donnant la même adresse : la seconde est suffixée, sous verrou du blog du site", async () => {
      const client = await createSite();
      const due = iso(new Date(NOW.getTime() + 2 * DAY));
      await plan(client, due, "Sommeil léger : ce que la sophrologie peut changer");
      await plan(client, iso(new Date(NOW.getTime() + 3 * DAY)), "Sommeil léger : ce que la sophrologie peut changer");
      expect(await ticks.generateDueArticles(NOW)).toMatchObject({ processed: 2, status: "ok" });
      const slugs = (await articlesOf(client)).map((article) => article.slug).sort();
      expect(slugs).toHaveLength(2);
      expect(slugs[1]).toBe(`${slugs[0]}-2`);
    });

    it("sujets qui ne seront jamais rédigés : retirés (« skipped ») — date passée d'un blog non rédigé, retard de plus de 14 jours", async () => {
      const client = await createSite();
      const demo = await createSite({ type: "demo", demoExpiresAt: new Date(NOW.getTime() + 10 * DAY) });
      const archived = await createSite({ status: "archived" });
      const yesterday = iso(new Date(NOW.getTime() - DAY));
      const tooLate = iso(new Date(NOW.getTime() - (ticks.ARTICLE_MAX_LATE_DAYS + 1) * DAY));
      const late = await plan(client, yesterday, "Sujet en retard d'un jour");
      const abandoned = await plan(client, tooLate, "Sujet en échec depuis trois semaines");
      const demoPast = await plan(demo, yesterday, "Sujet passé d'une démo");
      const demoNext = await plan(demo, iso(new Date(NOW.getTime() + DAY)), "Sujet à venir d'une démo");
      const archivedPast = await plan(archived, yesterday, "Sujet passé d'un site archivé");

      expect(await ticks.generateDueArticles(NOW)).toMatchObject({ processed: 1, status: "ok" });
      const statusOf = async (id: string) => (await db.select({ status: schema.editorialCalendarEntries.status }).from(schema.editorialCalendarEntries).where(eq(schema.editorialCalendarEntries.id, id)))[0]?.status;
      expect(await statusOf(late)).toBe("generated");
      expect(await statusOf(abandoned)).toBe("skipped");
      expect(await statusOf(demoPast)).toBe("skipped");
      expect(await statusOf(demoNext)).toBe("planned");
      expect(await statusOf(archivedPast)).toBe("skipped");
      // L'article en retard d'un jour est publié au passage de publication suivant
      expect(await ticks.publishDueArticles(NOW)).toEqual({ task: "publish-articles", processed: 1, status: "ok" });
    });

    it("variante par site : ce site seulement, une démo aussi (à la demande), jamais un site archivé", async () => {
      const demo = await createSite({ type: "demo", demoExpiresAt: new Date(NOW.getTime() + 10 * DAY) });
      const client = await createSite();
      const archived = await createSite({ status: "archived" });
      const due = iso(new Date(NOW.getTime() + DAY));
      for (const siteId of [demo, client, archived]) await plan(siteId, due, `Sujet du site ${siteId}`);
      expect(await ticks.generateDueArticlesForSite(demo, NOW)).toEqual({ task: "generate-articles", processed: 1, status: "ok" });
      expect(await articlesOf(demo)).toHaveLength(1);
      expect(await articlesOf(client)).toHaveLength(0);
      expect(await ticks.generateDueArticlesForSite(archived, NOW)).toMatchObject({ processed: 0 });
      expect(await articlesOf(archived)).toHaveLength(0);
    });
  });

  describe("publication", () => {
    it("un article planifié pour le jour J (07:00 UTC) sort au passage du jour J, même à 6 h ; celui du lendemain attend", async () => {
      const client = await createSite();
      const article = (publishAt: Date, slug: string) => ({ siteId: client, title: `Article ${slug}`, slug, content: "Texte.", status: "scheduled" as const, publishAt });
      await db.insert(schema.blogArticles).values([
        article(new Date("2026-11-16T07:00:00Z"), "aujourd-hui"),
        article(new Date("2026-11-13T07:00:00Z"), "en-retard"),
        article(new Date("2026-11-17T07:00:00Z"), "demain"),
        { ...article(new Date("2026-11-16T07:00:00Z"), "brouillon"), status: "draft" as const },
      ]);
      // La veille au soir : rien du jour J
      expect(await ticks.publishDueArticles(new Date("2026-11-15T23:59:00Z"))).toMatchObject({ processed: 1 });
      expect(await ticks.publishDueArticles(NOW)).toEqual({ task: "publish-articles", processed: 1, status: "ok" });
      const bySlug = Object.fromEntries((await articlesOf(client)).map((a) => [a.slug, a]));
      expect(bySlug["aujourd-hui"]).toMatchObject({ status: "published", publishedAt: NOW });
      expect(bySlug["en-retard"]!.status).toBe("published");
      expect(bySlug["demain"]).toMatchObject({ status: "scheduled", publishedAt: null });
      expect(bySlug["brouillon"]!.status).toBe("draft");
      expect(await ticks.publishDueArticles(NOW)).toMatchObject({ processed: 0 });
    });
  });

  describe("statistiques Search Console simulées", () => {
    const connect = (siteId: string) => db.insert(schema.googleConnections).values({ siteId, status: "connected", googleEmail: "compte.google@exemple.fr", searchConsoleSiteUrl: "sc-domain:exemple.fr" });
    const statsOf = (siteId: string) => db.select().from(schema.searchQueryStats).where(eq(schema.searchQueryStats.siteId, siteId));

    it("démos en cours seulement : rien d'écrit ni de supprimé sur un site client, une démo expirée ou archivée", async () => {
      const demo = await createSite({ type: "demo", demoExpiresAt: new Date(NOW.getTime() + 10 * DAY) });
      const client = await createSite();
      const expired = await createSite({ type: "demo", demoExpiresAt: new Date(NOW.getTime() - DAY) });
      const disconnected = await createSite({ type: "demo", demoExpiresAt: null });
      for (const siteId of [demo, client, expired]) await connect(siteId);
      // Vraies statistiques d'un client (le jour où l'OAuth sera branché) : elles ne doivent pas disparaître
      await db.insert(schema.searchQueryStats).values({ siteId: client, day: "2026-11-01", query: "sophrologue albi", impressions: 12, clicks: 2 });

      const report = await ticks.syncGoogleData(NOW);
      expect(report).toMatchObject({ task: "sync-google", status: "ok" });
      expect(report.processed).toBeGreaterThan(500);
      expect(await statsOf(demo)).toHaveLength(report.processed);
      expect(await statsOf(client)).toEqual([expect.objectContaining({ day: "2026-11-01", query: "sophrologue albi", impressions: 12 })]);
      expect(await statsOf(expired)).toHaveLength(0);
      expect(await statsOf(disconnected)).toHaveLength(0);
    });

    it("passages simultanés : les 90 jours sont remplacés en une transaction, sans doublon ni erreur d'unicité", async () => {
      const demo = await createSite({ type: "demo", demoExpiresAt: null });
      await connect(demo);
      const reports = await Promise.all([ticks.syncGoogleData(NOW), ticks.syncGoogleData(NOW), ticks.syncGoogleDataForSite(demo, NOW)]);
      expect(reports.map((report) => report.status)).toEqual(["ok", "ok", "ok"]);
      expect(await statsOf(demo)).toHaveLength(reports[0]!.processed);
    });

    it("variante par site : rien pour un site client, les statistiques de la démo pour une démo", async () => {
      const demo = await createSite({ type: "demo", demoExpiresAt: null });
      const other = await createSite({ type: "demo", demoExpiresAt: null });
      const client = await createSite();
      for (const siteId of [demo, other, client]) await connect(siteId);
      expect(await ticks.syncGoogleDataForSite(client, NOW)).toEqual({ task: "sync-google", processed: 0, status: "ok" });
      expect(await statsOf(client)).toHaveLength(0);
      expect((await ticks.syncGoogleDataForSite(demo, NOW)).processed).toBeGreaterThan(500);
      expect(await statsOf(other)).toHaveLength(0);
    });

    it("nettoyage proposé au propriétaire : retire connexions et statistiques factices des sites clients, garde celles des démos", async () => {
      const demo = await createSite({ type: "demo", demoExpiresAt: null });
      const client = await createSite();
      const orphan = await createSite();
      const real = await createSite();
      for (const siteId of [demo, client]) await connect(siteId);
      // Connexion réelle (jeton OAuth, le jour où le flux sera branché) : ni elle ni ses statistiques ne sont touchées
      await db.insert(schema.googleConnections).values({ siteId: real, status: "connected", googleEmail: "cabinet@exemple.fr", encryptedRefreshToken: "v1:chiffre" });
      await ticks.syncGoogleData(NOW);
      const fake = (siteId: string) => ({ siteId, day: "2026-11-01", query: "massage albi", impressions: 7, clicks: 1 });
      // Statistiques factices d'un client connecté en mode simulé, d'un client sans connexion (restes), et vraies statistiques
      await db.insert(schema.searchQueryStats).values([fake(client), fake(orphan), fake(real)]);
      await db.insert(schema.onboardingTasks).values([
        { siteId: client, key: "connect_google", done: true, completedAt: NOW },
        { siteId: demo, key: "connect_google", done: true, completedAt: NOW },
        { siteId: real, key: "connect_google", done: true, completedAt: NOW },
      ]);

      // Les trois instructions du rapport, dans l'ordre, dans une transaction
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          DELETE FROM search_query_stats s
           USING sites t
           WHERE t.id = s.site_id
             AND t.type = 'client'
             AND NOT EXISTS (SELECT 1 FROM google_connections c WHERE c.site_id = t.id AND c.encrypted_refresh_token IS NOT NULL)`);
        await tx.execute(sql`
          UPDATE onboarding_tasks o
             SET done = false, completed_at = NULL
            FROM sites t, google_connections c
           WHERE t.id = o.site_id AND c.site_id = t.id
             AND t.type = 'client' AND o.key = 'connect_google'
             AND c.encrypted_refresh_token IS NULL`);
        await tx.execute(sql`
          DELETE FROM google_connections c
           USING sites t
           WHERE t.id = c.site_id
             AND t.type = 'client'
             AND c.encrypted_refresh_token IS NULL`);
      });

      expect(await statsOf(client)).toHaveLength(0);
      expect(await statsOf(orphan)).toHaveLength(0);
      expect(await statsOf(real)).toHaveLength(1);
      expect((await statsOf(demo)).length).toBeGreaterThan(500);
      const connections = await db.select({ siteId: schema.googleConnections.siteId }).from(schema.googleConnections);
      expect(connections.map((c) => c.siteId).sort()).toEqual([demo, real].sort());
      const tasks = await db.select().from(schema.onboardingTasks).where(eq(schema.onboardingTasks.key, "connect_google"));
      expect(tasks.find((task) => task.siteId === client)).toMatchObject({ done: false, completedAt: null });
      expect(tasks.find((task) => task.siteId === demo)).toMatchObject({ done: true });
      expect(tasks.find((task) => task.siteId === real)).toMatchObject({ done: true });
    });
  });

  describe("avis Google (Places)", () => {
    const markers = (siteId: string) => db.select().from(schema.googleUsage).where(and(eq(schema.googleUsage.siteId, siteId), eq(schema.googleUsage.kind, "places_reviews")));

    it("sites clients non archivés dont la fiche est reliée ; une fois tous les 7 jours, même après un échec", async () => {
      places.mode = "google";
      const client = await createSite({ placeId: "places/client" });
      const failing = await createSite({ placeId: "places/introuvable" });
      await createSite({ placeId: "places/demo", type: "demo", demoExpiresAt: null });
      await createSite({ placeId: "places/archive", status: "archived" });
      await createSite({ placeId: "mock-fiche-factice" });
      await createSite({ placeId: null });
      places.fail.add("places/introuvable");

      const first = await ticks.syncGoogleReviews(NOW);
      expect(first).toEqual({ task: "sync-google-reviews", processed: 1, status: "ok", failed: 1 });
      expect([...places.calls].sort()).toEqual(["places/client", "places/introuvable"]);
      expect(await markers(client)).toHaveLength(1);
      expect(await markers(failing)).toHaveLength(1);
      const reviews = await db.select().from(schema.googleReviews).where(eq(schema.googleReviews.siteId, client));
      expect(reviews).toEqual([expect.objectContaining({ source: "places", authorName: "Camille D.", syncedAt: NOW })]);

      // Le lendemain, puis six jours après : personne n'est rappelé
      for (const days of [1, 6]) {
        places.calls.length = 0;
        expect(await ticks.syncGoogleReviews(new Date(NOW.getTime() + days * DAY))).toEqual({ task: "sync-google-reviews", processed: 0, status: "ok" });
        expect(places.calls).toEqual([]);
      }
      // Sept jours après : les deux sont dus de nouveau, l'avis connu est mis à jour (pas de doublon)
      places.fail.clear();
      expect(await ticks.syncGoogleReviews(new Date(NOW.getTime() + 7 * DAY))).toEqual({ task: "sync-google-reviews", processed: 2, status: "ok" });
      expect([...places.calls].sort()).toEqual(["places/client", "places/introuvable"]);
      expect(await db.select().from(schema.googleReviews).where(eq(schema.googleReviews.siteId, client))).toHaveLength(1);
    });

    it("avis déjà reçus de Places il y a moins de 7 jours (synchronisation d'avant ce repère) : pas de rappel", async () => {
      places.mode = "google";
      const client = await createSite({ placeId: "places/client" });
      await db.insert(schema.googleReviews).values({ siteId: client, sourceReviewId: "places/client/avis/1", authorName: "Camille D.", rating: 5, text: "Très bien.", source: "places", syncedAt: new Date(NOW.getTime() - 2 * DAY) });
      expect(await ticks.syncGoogleReviews(NOW)).toMatchObject({ processed: 0 });
      expect(places.calls).toEqual([]);
      expect(await ticks.syncGoogleReviews(new Date(NOW.getTime() + 5 * DAY))).toMatchObject({ processed: 1 });
    });

    it("deux passages simultanés : les avis d'un site ne sont inscrits qu'une fois", async () => {
      places.mode = "google";
      const client = await createSite({ placeId: "places/client" });
      const reports = await Promise.all([ticks.syncGoogleReviews(NOW), ticks.syncGoogleReviews(NOW), ticks.syncGoogleReviews(NOW)]);
      expect(reports.map((report) => report.status)).toEqual(["ok", "ok", "ok"]);
      expect(await db.select().from(schema.googleReviews).where(eq(schema.googleReviews.siteId, client))).toHaveLength(1);
    });

    it("échéance dépassée : aucun appel", async () => {
      places.mode = "google";
      await createSite({ placeId: "places/client" });
      expect(await ticks.syncGoogleReviews(NOW, { deadline: new Date(Date.now() - 1) })).toMatchObject({ processed: 0, status: "ok" });
      expect(places.calls).toEqual([]);
    });

    it("sans fournisseur réel : avis factices pour les démos en cours seulement, jamais sur un site client", async () => {
      const demo = await createSite({ placeId: "mock-demo", type: "demo", demoExpiresAt: null });
      const expired = await createSite({ placeId: "mock-expiree", type: "demo", demoExpiresAt: new Date(NOW.getTime() - DAY) });
      const client = await createSite({ placeId: "mock-client" });
      const report = await ticks.syncGoogleReviews(NOW);
      expect(report.processed).toBeGreaterThan(0);
      const count = async (siteId: string) => (await db.select().from(schema.googleReviews).where(eq(schema.googleReviews.siteId, siteId))).length;
      expect(await count(demo)).toBe(report.processed);
      expect(await count(expired)).toBe(0);
      expect(await count(client)).toBe(0);
    });
  });

  describe("fiche Google : sites servis", () => {
    it("syncGoogleProfiles (mock, démos) : la démo en cours est synchronisée, pas la démo expirée ni le site archivé", async () => {
      const live = await createSite({ placeId: "mock-en-cours", type: "demo", demoExpiresAt: new Date(NOW.getTime() + 10 * DAY) });
      const expired = await createSite({ placeId: "mock-expiree", type: "demo", demoExpiresAt: new Date(NOW.getTime() - DAY) });
      const archived = await createSite({ placeId: "mock-archivee", type: "demo", status: "archived", demoExpiresAt: null });
      const { syncGoogleProfiles } = await import("./google-profile");
      expect(await syncGoogleProfiles(NOW)).toEqual({ task: "sync-google-profiles", processed: 1, status: "ok" });
      const audited = await db.select({ siteId: schema.googleProfileAudits.siteId }).from(schema.googleProfileAudits);
      expect(audited.map((row) => row.siteId)).toEqual([live]);
      expect(audited.map((row) => row.siteId)).not.toContain(expired);
      expect(audited.map((row) => row.siteId)).not.toContain(archived);
    });

    it("runScheduledGoogleScans : les mots-clés d'une démo ne sont plus relevés une fois son lien expiré", async () => {
      const demo = await createSite({ placeId: "mock-en-cours", type: "demo", demoExpiresAt: new Date(NOW.getTime() + 10 * DAY) });
      const { runScheduledGoogleScans, syncGoogleProfiles } = await import("./google-profile");
      // La fiche est synchronisée (position connue), un mot-clé est suivi
      await syncGoogleProfiles(NOW);
      await db.insert(schema.googleKeywords).values({ siteId: demo, keyword: "sophrologue albi", position: 0 });
      const scans = () => db.select({ id: schema.googleRankScans.id }).from(schema.googleRankScans);

      await db.update(schema.sites).set({ demoExpiresAt: new Date(NOW.getTime() - DAY) }).where(eq(schema.sites.id, demo));
      expect(await runScheduledGoogleScans(NOW)).toEqual({ task: "scheduled-google-scans", processed: 0, status: "ok" });
      expect(await scans()).toHaveLength(0);

      await db.update(schema.sites).set({ demoExpiresAt: new Date(NOW.getTime() + 10 * DAY) }).where(eq(schema.sites.id, demo));
      expect(await runScheduledGoogleScans(NOW)).toEqual({ task: "scheduled-google-scans", processed: 1, status: "ok" });
      expect(await scans()).toHaveLength(1);
    });
  });

  describe("index proposés au propriétaire", () => {
    it("les instructions du rapport s'exécutent telles quelles, et deux fois de suite (IF NOT EXISTS)", async () => {
      const statements = [
        sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS editorial_entries_planned_date_idx ON editorial_calendar_entries (scheduled_for) WHERE status = 'planned'`,
        sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS blog_articles_scheduled_publish_idx ON blog_articles (publish_at) WHERE status = 'scheduled'`,
        sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS google_usage_kind_site_created_idx ON google_usage (kind, site_id, created_at DESC)`,
        sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS google_reviews_places_synced_idx ON google_reviews (site_id, synced_at DESC) WHERE source = 'places'`,
        sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS notification_log_kind_period_idx ON notification_log (kind, period_key)`,
      ];
      for (const statement of [...statements, ...statements]) await db.execute(statement);
      const indexes = await db.execute(sql`select indexname from pg_indexes where schemaname = 'public'`);
      const names = indexes.rows.map((row) => row.indexname);
      for (const name of ["editorial_entries_planned_date_idx", "blog_articles_scheduled_publish_idx", "google_usage_kind_site_created_idx", "google_reviews_places_synced_idx", "notification_log_kind_period_idx"]) expect(names).toContain(name);
      // Avec ces index, les tâches tournent comme sans
      const client = await createSite();
      expect(await ticks.ensureEditorialCalendars(NOW)).toMatchObject({ processed: 24, status: "ok" });
      expect((await ticks.generateDueArticles(NOW)).status).toBe("ok");
      expect(await articlesOf(client)).not.toHaveLength(0);
    });
  });
});
