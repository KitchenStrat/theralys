import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type * as AiModule from "@theralys/ai";
import type { ArticleBrief } from "@theralys/ai";
import type * as DbModule from "@theralys/db";
import { blogArticles, editorialCalendarEntries, externalSites, type Database, type Site } from "@theralys/db";
import { cleanExternalProfile, externalSpecialties, type ExternalSiteProfile, type ExternalSiteSetting, type SiteTheme } from "@theralys/shared";
import { addDays, planEditorialTopics, startOfDayUtc } from "./editorial";
import type * as ExternalSiteModule from "./external-site";
import { refreshExternalSites } from "./external-site";
import { ALL_TICKS, TICK_DEADLINE_MS, ensureEditorialCalendars, generateDueArticles, refreshExternalSitesTick } from "./ticks";

// Base, rédaction et images simulées : ni PostgreSQL, ni modèle, ni banque d'images, ni lecteur de site
const state = vi.hoisted(() => ({ db: null as unknown, briefs: [] as unknown[] }));

vi.mock("@theralys/db", async (importOriginal) => ({
  ...(await importOriginal<typeof DbModule>()),
  getDb: () => state.db,
}));
vi.mock("@theralys/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof AiModule>()),
  createArticleGenerator: () => ({
    mode: "mock",
    generateArticle: async (brief: { topic: string }) => {
      state.briefs.push(brief);
      return { title: `Article : ${brief.topic}`, slug: "article-du-jour", excerpt: "Un extrait de l'article.", content: "## Titre\n\nLe texte de l'article." };
    },
  }),
  findStockOrGenerate: async () => ({ url: "https://images.pexels.com/photos/1/couverture.jpeg", aiGenerated: false }),
}));
vi.mock("@theralys/providers/website", () => ({
  createWebsiteReader: () => {
    throw new Error("Lecteur réel interdit dans les tests");
  },
  pastedTextToPages: () => {
    throw new Error("Lecteur réel interdit dans les tests");
  },
}));
vi.mock("./external-site", async (importOriginal) => {
  const original = await importOriginal<typeof ExternalSiteModule>();
  return { ...original, refreshExternalSites: vi.fn(original.refreshExternalSites) };
});

const NOW = new Date("2026-11-12T06:00:00Z"); // jeudi
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const PROSPECT_ID = "22222222-2222-4222-8222-222222222222";
const EXTERNAL_URL = "https://www.cabinet-dupont.fr";
const THEME: SiteTheme = { preset: "terracotta", fontPreset: "chaleureux" };
const ACTIVE: ExternalSiteSetting = { url: EXTERNAL_URL, active: true };

const SITE: Site = {
  id: SITE_ID,
  type: "client",
  status: "published",
  slug: "claire-dupont-sophrologue-albi",
  domain: null,
  name: "Claire Dupont, sophrologue à Albi",
  plan: "scale",
  language: "fr",
  bookingUrl: null,
  theme: THEME,
  prospectId: PROSPECT_ID,
  highlightedMotifs: [],
  demoExpiresAt: null,
  generationProgress: { home: true, motifs: true, reviews: true, articles: true },
  generationError: null,
  createdAt: NOW,
  updatedAt: NOW,
};
const connected = (setting: ExternalSiteSetting = ACTIVE): Site => ({ ...SITE, theme: { ...THEME, externalSite: setting } });

const PROSPECT = { id: PROSPECT_ID, firstName: "Claire", lastName: "Dupont", profession: "Sophrologue", city: "Albi", gender: "feminin" };
const BLOG_SETTINGS = { siteId: SITE_ID, publicationMode: "auto", voiceDesignation: "je", voiceAccord: "feminin", voiceReader: "vous", voiceTone: "chaleureux", themes: null };
/** Pages de spécialité du site hébergé, dans le désordre : la base les rend par position. */
const HOSTED_MOTIFS = [
  { id: "p2", siteId: SITE_ID, type: "motif", slug: "sommeil", title: "Troubles du sommeil", position: 2 },
  { id: "p1", siteId: SITE_ID, type: "motif", slug: "stress-au-travail", title: "Stress au travail", position: 1 },
];

const PROFILE: ExternalSiteProfile = cleanExternalProfile(
  {
    headline: "La sophrologie pour retrouver calme et énergie",
    intro: ["Claire Dupont vous accueille à Albi."],
    specialties: [
      { title: "Préparation aux examens", excerpt: "Aborder les épreuves sereinement.", headings: [], faq: [] },
      { title: "Accompagnement de la grossesse", excerpt: "Vivre sa grossesse en confiance.", headings: [], faq: [] },
    ],
  },
  EXTERNAL_URL,
);
const externalRow = (overrides: Record<string, unknown> = {}) => ({ url: EXTERNAL_URL, status: "ready", profile: PROFILE, overrides: null, facts: null, ...overrides });

const DIALECT = new PgDialect();
type Entry = { id: string; siteId: string; scheduledFor: string; topic: string; motifSlug: string | null; status: string };
type Seed = { site?: Site; external?: unknown[]; entries?: Entry[]; articles?: { title: string; slug: string }[]; settings?: Record<string, unknown> | null; prospect?: Record<string, unknown> | null };

/**
 * Base minimale pour les ticks du blog : `db.query.<table>` rend les lignes
 * du test (seule la recherche d'une page de spécialité par son identifiant
 * est évaluée), les sites au blog actif viennent de la jointure
 * `sites ⨝ blog_settings`, et la lecture de `external_sites` rend la ligne du
 * site du client. Lectures et écritures sont journalisées.
 */
function fakeDb(seed: Seed = {}) {
  const site = seed.site ?? SITE;
  const log: string[] = [];
  const inserts: { table: unknown; values: unknown }[] = [];
  const updates: { table: unknown; values: unknown }[] = [];
  const tables: Record<string, { findFirst: (config?: { where?: unknown }) => Promise<unknown>; findMany: () => Promise<unknown[]> }> = {
    pages: {
      findMany: async () => [...HOSTED_MOTIFS].sort((a, b) => a.position - b.position),
      findFirst: async (config) => {
        // where : site, type « motif », identifiant — le dernier paramètre est l'identifiant de la page cherchée
        const slug = DIALECT.sqlToQuery(config!.where as SQL).params.at(-1);
        return HOSTED_MOTIFS.find((p) => p.slug === slug);
      },
    },
    prospects: { findFirst: async () => (seed.prospect === undefined ? PROSPECT : (seed.prospect ?? undefined)), findMany: async () => [] },
    editorialCalendarEntries: { findFirst: async () => undefined, findMany: async () => seed.entries ?? [] },
    blogArticles: { findFirst: async () => undefined, findMany: async () => seed.articles ?? [] },
    blogSettings: { findFirst: async () => (seed.settings === undefined ? BLOG_SETTINGS : (seed.settings ?? undefined)), findMany: async () => [] },
  };
  const query = new Proxy(
    {},
    {
      get: (_target, name: string | symbol) => {
        // Table non simulée (ou propriété inspectée par l'outil de test) : rien
        const table = typeof name === "string" ? tables[name] : undefined;
        if (!table) return undefined;
        const label = String(name);
        return {
          findFirst: (config?: { where?: unknown }) => (log.push(`query ${label}.findFirst`), table.findFirst(config)),
          findMany: () => (log.push(`query ${label}.findMany`), table.findMany()),
        };
      },
    },
  );
  const db = {
    query,
    select: () => ({
      from: (table: unknown) => ({
        // Sites dont le blog est actif
        innerJoin: async () => (log.push("select sites ⨝ blog_settings"), [{ site }]),
        where: () => ({
          limit: async () => {
            if (table !== externalSites) throw new Error("Requête non simulée");
            log.push("select external_sites");
            return seed.external ?? [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        const done = Promise.resolve([{ id: "article-1" }]);
        return { then: done.then.bind(done), returning: () => done };
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({ where: async () => void updates.push({ table, values }) }),
    }),
  };
  state.db = db;
  return { db: db as unknown as Database, log, inserts, updates };
}

/** Sujets inscrits au calendrier par le tick. */
const planned = (handle: ReturnType<typeof fakeDb>) => handle.inserts.filter((i) => i.table === editorialCalendarEntries).flatMap((i) => i.values as { siteId: string; scheduledFor: string; topic: string; motifSlug: string | null }[]);
const briefs = () => state.briefs as ArticleBrief[];

beforeEach(() => {
  state.briefs = [];
  vi.mocked(refreshExternalSites).mockClear();
});

afterEach(() => {
  state.db = null;
});

describe("ticks : relecture mensuelle des sites des clients", () => {
  it("inscrite en dernier dans ALL_TICKS, après les ticks existants dont l'ordre ne change pas", () => {
    expect(ALL_TICKS.map((tick) => tick.task)).toEqual([
      "weekly-content-digests",
      "month-reminders",
      "editorial-calendar",
      "generate-articles",
      "publish-articles",
      "sync-google",
      "sync-google-reviews",
      "sync-google-profiles",
      "collect-google-reviews",
      "scheduled-google-scans",
      "refresh-external-sites",
    ]);
    expect(ALL_TICKS.at(-1)!.run).toBe(refreshExternalSitesTick);
    expect(new Set(ALL_TICKS.map((tick) => tick.task)).size).toBe(ALL_TICKS.length);
  });

  it("transmet l'instant du passage et l'échéance commune ; `processed` = sites relus", async () => {
    const { db } = fakeDb();
    const deadline = new Date(NOW.getTime() + TICK_DEADLINE_MS);
    vi.mocked(refreshExternalSites).mockResolvedValueOnce({ checked: 3, changed: 1, failed: 1 });
    expect(await refreshExternalSitesTick(NOW, { deadline })).toEqual({ task: "refresh-external-sites", processed: 3 });
    expect(refreshExternalSites).toHaveBeenCalledExactlyOnceWith(db, { now: NOW, deadline });
    // Sans échéance (lancement à la main) : seul le budget propre à la relecture borne le passage
    vi.mocked(refreshExternalSites).mockResolvedValueOnce({ checked: 0, changed: 0, failed: 0 });
    expect(await refreshExternalSitesTick(NOW)).toEqual({ task: "refresh-external-sites", processed: 0 });
    expect(refreshExternalSites).toHaveBeenLastCalledWith(db, { now: NOW });
  });

  it("le rapport du tick porte le même nom que son inscription", async () => {
    fakeDb();
    vi.mocked(refreshExternalSites).mockResolvedValueOnce({ checked: 1, changed: 0, failed: 0 });
    const tick = ALL_TICKS.at(-1)!;
    expect((await tick.run(NOW, {})).task).toBe(tick.task);
  });
});

describe("ensureEditorialCalendars : d'où viennent les sujets du blog", () => {
  const expected = (motifs: { slug: string; title: string }[]) =>
    planEditorialTopics({ motifs, city: "Albi", plan: "scale", from: addDays(startOfDayUtc(NOW), 1), horizonWeeks: 6, existingDates: new Set(), existingTopics: new Set() }).map((t) => ({ siteId: SITE_ID, ...t }));

  it("sans site du client : les pages de spécialité du site hébergé, dans leur ordre, sans aucune lecture de plus", async () => {
    const handle = fakeDb();
    expect(await ensureEditorialCalendars(NOW)).toEqual({ task: "editorial-calendar", processed: 24 });
    const hosted = [
      { slug: "stress-au-travail", title: "Stress au travail" },
      { slug: "sommeil", title: "Troubles du sommeil" },
    ];
    expect(planned(handle)).toEqual(expected(hosted));
    expect(new Set(planned(handle).map((t) => t.motifSlug))).toEqual(new Set(["stress-au-travail", "sommeil"]));
    expect(handle.log).not.toContain("select external_sites");
    expect(handle.log).toEqual(["select sites ⨝ blog_settings", "query pages.findMany", "query prospects.findFirst", "query editorialCalendarEntries.findMany", "query blogArticles.findMany", "query blogSettings.findFirst"]);
  });

  it("site du client en référence : ses spécialités à la place, les pages du site hébergé ne sont pas lues", async () => {
    const handle = fakeDb({ site: connected(), external: [externalRow()] });
    expect(await ensureEditorialCalendars(NOW)).toEqual({ task: "editorial-calendar", processed: 24 });
    const topics = planned(handle);
    expect(topics).toEqual(expected(externalSpecialties(PROFILE)));
    expect(new Set(topics.map((t) => t.motifSlug))).toEqual(new Set(["preparation-aux-examens", "accompagnement-de-la-grossesse"]));
    for (const topic of topics) expect(topic.topic.toLowerCase()).toMatch(/préparation aux examens|accompagnement de la grossesse/);
    expect(topics.some((t) => /stress au travail|troubles du sommeil/i.test(t.topic))).toBe(false);
    expect(handle.log).toContain("select external_sites");
    expect(handle.log).not.toContain("query pages.findMany");
  });

  it("les corrections du praticien comptent : ce sont les spécialités du profil effectif", async () => {
    const overrides = { specialties: [{ slug: "gestion-des-emotions", title: "Gestion des émotions", excerpt: "", headings: [], faq: [] }] };
    const handle = fakeDb({ site: connected(), external: [externalRow({ overrides })] });
    await ensureEditorialCalendars(NOW);
    expect(new Set(planned(handle).map((t) => t.motifSlug))).toEqual(new Set(["gestion-des-emotions"]));
  });

  it("relecture en cours ou en échec : les sujets viennent toujours du site du client (dernière lecture aboutie)", async () => {
    for (const row of [externalRow({ status: "reading" }), externalRow({ status: "ready", error: "timeout" })]) {
      const handle = fakeDb({ site: connected(), external: [row] });
      await ensureEditorialCalendars(NOW);
      expect(planned(handle)).toEqual(expected(externalSpecialties(PROFILE)));
    }
  });

  it("réglage actif mais rien d'exploitable enregistré, ou réglage éteint : les pages du site hébergé, comme avant", async () => {
    for (const seed of [
      { site: connected(), external: [] },
      { site: connected(), external: [externalRow({ status: "reading", profile: null })] },
      { site: connected(), external: [externalRow({ status: "error", profile: null })] },
      { site: connected(), external: [externalRow({ profile: null })] },
      { site: connected({ url: EXTERNAL_URL, active: false }), external: [externalRow()] },
    ]) {
      const handle = fakeDb(seed);
      await ensureEditorialCalendars(NOW);
      expect(new Set(planned(handle).map((t) => t.motifSlug))).toEqual(new Set(["stress-au-travail", "sommeil"]));
    }
  });

  it("les dates déjà planifiées restent : seuls les créneaux libres reçoivent des sujets du site du client", async () => {
    const before = expected([{ slug: "stress-au-travail", title: "Stress au travail" }]).slice(0, 10);
    const entries: Entry[] = before.map((t, i) => ({ id: `e${i}`, siteId: SITE_ID, scheduledFor: t.scheduledFor, topic: t.topic, motifSlug: t.motifSlug, status: "planned" }));
    const handle = fakeDb({ site: connected(), external: [externalRow()], entries });
    expect(await ensureEditorialCalendars(NOW)).toEqual({ task: "editorial-calendar", processed: 14 });
    const taken = new Set(before.map((t) => t.scheduledFor));
    for (const topic of planned(handle)) {
      expect(taken.has(topic.scheduledFor)).toBe(false);
      expect(["preparation-aux-examens", "accompagnement-de-la-grossesse"]).toContain(topic.motifSlug);
    }
  });
});

describe("generateDueArticles : spécialité rattachée à l'article", () => {
  const entry = (id: string, topic: string, motifSlug: string | null): Entry => ({ id, siteId: SITE_ID, scheduledFor: "2026-11-16", topic, motifSlug, status: "planned" });

  it("sans site du client : le titre de la page de spécialité du site hébergé, comme avant", async () => {
    const handle = fakeDb({ entries: [entry("e1", "Sommeil léger : ce que la sophrologie peut changer", "sommeil"), entry("e2", "Un sujet libre", null), entry("e3", "Page disparue", "page-supprimee")] });
    expect(await generateDueArticles(NOW)).toEqual({ task: "generate-articles", processed: 3 });
    expect(briefs().map((b) => [b.motifSlug, b.motifTitle])).toEqual([
      ["sommeil", "Troubles du sommeil"],
      [null, null],
      ["page-supprimee", null],
    ]);
    expect(briefs()[0]).toEqual({ topic: "Sommeil léger : ce que la sophrologie peut changer", motifSlug: "sommeil", motifTitle: "Troubles du sommeil", profession: "Sophrologue", city: "Albi", firstName: "Claire" });
    expect(handle.log).not.toContain("select external_sites");
    expect(handle.log.filter((entry) => entry === "query pages.findFirst")).toHaveLength(2);
  });

  it("site du client en référence : le titre de sa spécialité, sans lire les pages du site hébergé", async () => {
    const handle = fakeDb({ site: connected(), external: [externalRow()], entries: [entry("e1", "Préparation aux examens à Albi : ce qu'il faut savoir avant de venir", "preparation-aux-examens"), entry("e2", "Un sujet libre", null)] });
    expect(await generateDueArticles(NOW)).toEqual({ task: "generate-articles", processed: 2 });
    expect(briefs().map((b) => [b.motifSlug, b.motifTitle])).toEqual([
      ["preparation-aux-examens", "Préparation aux examens"],
      [null, null],
    ]);
    // La référence est lue une fois par site, pas une fois par article
    expect(handle.log.filter((entry) => entry === "select external_sites")).toHaveLength(1);
    expect(handle.log).not.toContain("query pages.findFirst");
  });

  it("sujet planifié avant la connexion du site (spécialité du site hébergé) : son titre reste celui de la page hébergée", async () => {
    const handle = fakeDb({ site: connected(), external: [externalRow()], entries: [entry("e1", "Sommeil léger : ce que la sophrologie peut changer", "sommeil"), entry("e2", "Sujet d'une page disparue", "page-supprimee")] });
    await generateDueArticles(NOW);
    expect(briefs().map((b) => [b.motifSlug, b.motifTitle])).toEqual([
      ["sommeil", "Troubles du sommeil"],
      ["page-supprimee", null],
    ]);
    expect(handle.log.filter((entry) => entry === "query pages.findFirst")).toHaveLength(2);
  });

  it("la publication ne change pas : l'article est enregistré pour le blog hébergé, le sujet marqué rédigé", async () => {
    const handle = fakeDb({ site: connected(), external: [externalRow()], entries: [entry("e1", "Préparation aux examens à Albi : une pause qui change la semaine", "preparation-aux-examens")] });
    await generateDueArticles(NOW);
    const article = handle.inserts.find((i) => i.table === blogArticles)!.values as Record<string, unknown>;
    expect(article).toMatchObject({
      siteId: SITE_ID,
      title: "Article : Préparation aux examens à Albi : une pause qui change la semaine",
      slug: "article-du-jour",
      status: "scheduled",
      aiGenerated: true,
      motifSlug: "preparation-aux-examens",
      imageUrl: "https://images.pexels.com/photos/1/couverture.jpeg",
      publishAt: new Date("2026-11-16T07:00:00Z"),
    });
    expect(handle.updates).toEqual([{ table: editorialCalendarEntries, values: { status: "generated", articleId: "article-1" } }]);
  });

  it("rien à rédiger : la référence du site du client n'est même pas lue", async () => {
    const handle = fakeDb({ site: connected(), external: [externalRow()], entries: [] });
    expect(await generateDueArticles(NOW)).toEqual({ task: "generate-articles", processed: 0 });
    expect(handle.log).not.toContain("select external_sites");
    expect(briefs()).toEqual([]);
  });
});
