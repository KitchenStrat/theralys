import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type * as AiModule from "@theralys/ai";
import type { ArticleBrief } from "@theralys/ai";
import type * as DbModule from "@theralys/db";
import { blogArticles, editorialCalendarEntries, externalSites, googleConnections, searchQueryStats, sites, type Database, type Site } from "@theralys/db";
import { cleanExternalProfile, externalSpecialties, type ExternalSiteProfile, type ExternalSiteSetting, type SiteTheme } from "@theralys/shared";
import { addDays, planEditorialTopics, startOfDayUtc } from "./editorial";
import type * as ExternalSiteModule from "./external-site";
import { refreshExternalSites } from "./external-site";
import type * as NotificationsModule from "./notifications";
import { sendMonthReminders, sendWeeklyContentDigests } from "./notifications";
import {
  ALL_TICKS,
  ARTICLE_CONCURRENCY,
  ARTICLE_FAILURE_BREAKER,
  ARTICLE_MAX_LATE_DAYS,
  ARTICLE_START_MARGIN_MS,
  REVIEWS_SYNC_INTERVAL_DAYS,
  TICK_DEADLINE_MS,
  TICK_GROUPS,
  ensureEditorialCalendarForSite,
  ensureEditorialCalendars,
  generateDueArticles,
  generateDueArticlesForSite,
  isTickGroup,
  publishCutoff,
  publishDueArticles,
  refreshExternalSitesTick,
  runAllTicks,
  runTicks,
  selectDueReviewSyncs,
  syncGoogleData,
  syncGoogleDataForSite,
} from "./ticks";
import { errorLabel, isServedSite, mapPool, proportionalBatch, tickError, tickOk } from "./tick-utils";

// Base, rédaction et images simulées : ni PostgreSQL, ni modèle, ni banque d'images, ni lecteur de site.
// Les requêtes elles-mêmes (périmètre des sites, verrous, transactions) sont exécutées pour de bon dans ticks.db.test.ts.
type GenerateHook = (brief: ArticleBrief) => Promise<void> | void;
const state = vi.hoisted(() => ({ db: null as unknown, briefs: [] as unknown[], onGenerate: null as unknown, inFlight: 0, maxInFlight: 0 }));

vi.mock("@theralys/db", async (importOriginal) => ({
  ...(await importOriginal<typeof DbModule>()),
  getDb: () => state.db,
}));
vi.mock("@theralys/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof AiModule>()),
  createArticleGenerator: () => ({
    mode: "mock",
    generateArticle: async (brief: ArticleBrief) => {
      state.briefs.push(brief);
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      try {
        await (state.onGenerate as GenerateHook | null)?.(brief);
        return { title: `Article : ${brief.topic}`, slug: "article-du-jour", excerpt: "Un extrait de l'article.", content: "## Titre\n\nLe texte de l'article." };
      } finally {
        state.inFlight -= 1;
      }
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
vi.mock("./notifications", async (importOriginal) => {
  const original = await importOriginal<typeof NotificationsModule>();
  return { ...original, sendWeeklyContentDigests: vi.fn(original.sendWeeklyContentDigests), sendMonthReminders: vi.fn(original.sendMonthReminders) };
});

const NOW = new Date("2026-11-12T06:00:00Z"); // jeudi
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SITE_ID = "33333333-3333-4333-8333-333333333333";
const PROSPECT_ID = "22222222-2222-4222-8222-222222222222";
const EXTERNAL_URL = "https://www.cabinet-dupont.fr";
const THEME: SiteTheme = { preset: "terracotta", fontPreset: "chaleureux" };
const ACTIVE: ExternalSiteSetting = { url: EXTERNAL_URL, active: true };
/** Aléa qui laisse la file dans l'ordre de la requête (aucun échange dans le mélange). */
const KEEP_ORDER = () => 0.999999;
/** Rédaction une à une, dans l'ordre de la file : les journaux se lisent sans entrelacement. */
const ONE_BY_ONE = { concurrency: 1, random: KEEP_ORDER };

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
const BLOG_SETTINGS = { publicationMode: "auto", voiceDesignation: "je", voiceAccord: "feminin", voiceReader: "vous", voiceTone: "chaleureux", themes: null };
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
const render = (condition: unknown) => DIALECT.sqlToQuery(condition as SQL);
type Entry = { id: string; siteId: string; scheduledFor: string; topic: string; motifSlug: string | null; status: string; articleId?: string | null };
type Article = Record<string, unknown> & { id: string; siteId: string; slug: string; title: string };
type Seed = {
  /** Site des sujets et du calendrier quand rien d'autre n'est précisé */
  site?: Site;
  /** Sites dont le calendrier est tenu (défaut : `site`) */
  calendar?: Site[];
  /** Thèmes des sites, pour les sujets d'autres sites que `site` */
  themes?: Record<string, SiteTheme>;
  external?: unknown[];
  entries?: Entry[];
  articles?: { siteId?: string; title: string; slug: string }[];
  settings?: Record<string, unknown>;
  prospect?: Record<string, unknown> | null;
  /** Démos connectées à Google (statistiques Search Console simulées) */
  connections?: { siteId: string; profession: string | null; city: string | null }[];
  /** Articles que la publication rend comme publiés */
  publishable?: { id: string }[];
  /** Verrous consultatifs déjà tenus par un autre passage (`pg_try_advisory_xact_lock` rend faux) */
  heldLocks?: string[];
  /** Erreur à lever par opération (`select sites`, `update blog_articles`, `insert blog_articles`…) */
  fail?: (op: string) => Error | null;
};

/**
 * Base simulée des ticks du blog et de Search Console. Les lignes sont celles
 * du test ; les conditions des requêtes sont gardées telles que le code les a
 * écrites (`wheres`, rendues en SQL) pour vérifier le périmètre demandé.
 * Sujets et articles ont un état : un sujet marqué rédigé ne revient plus
 * dans la file, un article inscrit prend son adresse. `transaction` annule ses
 * écritures si elle lève ; les verrous consultatifs se comportent comme ceux
 * de PostgreSQL — `pg_advisory_xact_lock` attend la fin de la transaction qui
 * tient la clé, `pg_try_advisory_xact_lock` rend faux si elle est tenue.
 */
function fakeDb(seed: Seed = {}) {
  const site = seed.site ?? SITE;
  const settings = { ...BLOG_SETTINGS, ...(seed.settings ?? {}) };
  const prospect = seed.prospect === undefined ? PROSPECT : seed.prospect;
  let entries: Entry[] = (seed.entries ?? []).map((entry) => ({ ...entry }));
  let articles: Article[] = (seed.articles ?? []).map((article, i) => ({ id: `existing-${i}`, siteId: article.siteId ?? site.id, ...article }));
  let stats: Record<string, unknown>[] = [];
  const log: string[] = [];
  const wheres: { op: string; sql: string; params: unknown[] }[] = [];
  const locks: string[] = [];
  const held = new Set<string>(seed.heldLocks ?? []);
  const queues = new Map<string, Promise<void>>();
  let nextArticle = 1;

  type Scope = { release: (() => void)[]; keys: string[]; snapshot: { entries: Entry[]; articles: Article[]; stats: Record<string, unknown>[] } | null } | null;
  const note = (op: string, scope: Scope, condition?: unknown) => {
    log.push(scope ? `tx ${op}` : op);
    if (condition !== undefined) wheres.push({ op, ...render(condition) });
    const failure = seed.fail?.(op);
    if (failure) throw failure;
  };
  const writing = (scope: Scope) => {
    if (scope && !scope.snapshot) scope.snapshot = { entries: entries.map((e) => ({ ...e })), articles: articles.map((a) => ({ ...a })), stats: [...stats] };
  };
  /** Sujet désigné par une condition `id = $n` */
  const entryOf = (condition: unknown) => {
    const params = render(condition).params;
    return entries.find((entry) => params.includes(entry.id));
  };
  const queueRow = (entry: Entry) => ({
    id: entry.id,
    siteId: entry.siteId,
    scheduledFor: entry.scheduledFor,
    topic: entry.topic,
    motifSlug: entry.motifSlug,
    theme: seed.themes?.[entry.siteId] ?? site.theme,
    publicationMode: settings.publicationMode,
    designation: settings.voiceDesignation,
    accord: settings.voiceAccord,
    reader: settings.voiceReader,
    tone: settings.voiceTone,
    profession: (prospect?.profession as string | undefined) ?? null,
    city: (prospect?.city as string | undefined) ?? null,
    firstName: (prospect?.firstName as string | undefined) ?? null,
  });

  const executor = (scope: Scope) => {
    const select = (fields?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        const query: { joined: boolean; condition: unknown; limit: number | null } = { joined: false, condition: undefined, limit: null };
        const run = async (): Promise<unknown[]> => {
          if (table === sites) {
            note("select sites ⨝ blog_settings", scope, query.condition);
            return (seed.calendar ?? [site]).map((row) => ({ site: row, themes: settings.themes, city: (prospect?.city as string | undefined) ?? null }));
          }
          if (table === editorialCalendarEntries && query.joined) {
            note("select file des sujets", scope, query.condition);
            const due = entries.filter((entry) => entry.status === "planned").sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
            return (query.limit === null ? due : due.slice(0, query.limit)).map(queueRow);
          }
          if (table === editorialCalendarEntries && fields && "status" in fields) {
            note("select sujet", scope);
            const entry = entryOf(query.condition);
            return entry ? [{ status: entry.status }] : [];
          }
          if (table === editorialCalendarEntries) {
            note("select sujets du site", scope);
            const params = render(query.condition).params;
            return entries.filter((entry) => params.includes(entry.siteId)).map((entry) => ({ scheduledFor: entry.scheduledFor, topic: entry.topic }));
          }
          if (table === blogArticles) {
            note(fields && "slug" in fields ? "select adresses des articles" : "select titres des articles", scope);
            const params = render(query.condition).params;
            return articles.filter((article) => params.includes(article.siteId)).map((article) => ({ slug: article.slug, title: article.title }));
          }
          if (table === externalSites) {
            note("select external_sites", scope);
            return seed.external ?? [];
          }
          if (table === googleConnections) {
            note("select démos connectées", scope, query.condition);
            return seed.connections ?? [];
          }
          throw new Error("Requête non simulée");
        };
        const chain = {
          innerJoin: () => ((query.joined = true), chain),
          leftJoin: () => chain,
          where: (condition: unknown) => ((query.condition = condition), chain),
          orderBy: () => chain,
          limit: (count: number) => ((query.limit = count), chain),
          for: (strength: string) => {
            if (strength !== "update" || !scope) throw new Error("Verrou de ligne hors transaction");
            return chain;
          },
          then: <R>(resolve: (rows: unknown[]) => R, reject?: (reason: unknown) => R) => run().then(resolve, reject),
        };
        return chain;
      },
    });
    const tables: Record<string, { findFirst: (config?: { where?: unknown }) => Promise<unknown>; findMany: () => Promise<unknown[]> }> = {
      pages: {
        findMany: async () => [...HOSTED_MOTIFS].sort((a, b) => a.position - b.position),
        findFirst: async (config) => {
          // where : site, type « motif », identifiant — le dernier paramètre est l'identifiant de la page cherchée
          const slug = render(config!.where).params.at(-1);
          return HOSTED_MOTIFS.find((p) => p.slug === slug);
        },
      },
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
            findFirst: (config?: { where?: unknown }) => (note(`query ${label}.findFirst`, scope), table.findFirst(config)),
            findMany: () => (note(`query ${label}.findMany`, scope), table.findMany()),
          };
        },
      },
    );
    return {
      query,
      select,
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          const run = async (): Promise<{ id: string }[]> => {
            if (table === editorialCalendarEntries) {
              note("insert sujets", scope);
              writing(scope);
              for (const value of values as Omit<Entry, "id" | "status">[]) entries.push({ id: `entry-${entries.length + 1}`, status: "planned", ...value });
              return [];
            }
            if (table === blogArticles) {
              note("insert blog_articles", scope);
              writing(scope);
              const value = values as Omit<Article, "id">;
              if (articles.some((article) => article.siteId === value.siteId && article.slug === value.slug)) {
                throw Object.assign(new Error("duplicate key value violates unique constraint \"blog_articles_site_slug_idx\""), { code: "23505" });
              }
              const article = { ...value, id: `article-${nextArticle++}` } as Article;
              articles.push(article);
              return [{ id: article.id }];
            }
            if (table === searchQueryStats) {
              note("insert search_query_stats", scope);
              writing(scope);
              stats.push(...(values as Record<string, unknown>[]));
              return [];
            }
            throw new Error("Écriture non simulée");
          };
          return { then: <R>(resolve: (rows: { id: string }[]) => R, reject?: (reason: unknown) => R) => run().then(resolve, reject), returning: () => run() };
        },
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: (condition: unknown) => {
            const run = async (): Promise<{ id: string }[]> => {
              if (table === blogArticles) {
                note("update blog_articles", scope, condition);
                return seed.publishable ?? [];
              }
              if (table === editorialCalendarEntries && values.status === "skipped") {
                note("update sujets retirés", scope, condition);
                return [];
              }
              if (table === editorialCalendarEntries) {
                note("update sujet", scope);
                writing(scope);
                const entry = entryOf(condition);
                if (entry) Object.assign(entry, values);
                return entry ? [{ id: entry.id }] : [];
              }
              throw new Error("Mise à jour non simulée");
            };
            return { then: <R>(resolve: (rows: { id: string }[]) => R, reject?: (reason: unknown) => R) => run().then(resolve, reject), returning: () => run() };
          },
        }),
      }),
      delete: (table: unknown) => ({
        where: async (condition: unknown) => {
          // Sujets hérités de l'ancien planificateur (suffixés d'une date), pas encore rédigés : retirés avant de replanifier
          if (table === editorialCalendarEntries) {
            if (!scope) throw new Error("Retrait des sujets hérités hors transaction");
            writing(scope);
            const params = render(condition).params;
            const from = String(params.find((param) => typeof param === "string" && /^\d{4}-\d{2}-\d{2}$/.test(param)) ?? "");
            entries = entries.filter((entry) => !(params.includes(entry.siteId) && entry.status === "planned" && entry.scheduledFor >= from && / \(\d{4}-\d{2}-\d{2}\)$/.test(entry.topic)));
            return;
          }
          if (table !== searchQueryStats) throw new Error("Suppression non simulée");
          note("delete search_query_stats", scope);
          writing(scope);
          const params = render(condition).params;
          stats = stats.filter((row) => !params.includes(row.siteId));
        },
      }),
      execute: async (statement: unknown) => {
        const { sql: text, params } = render(statement);
        const key = String(params[0]);
        if (!scope) throw new Error(`Verrou consultatif hors transaction : ${text}`);
        if (text === "select pg_try_advisory_xact_lock(hashtext($1)) as locked") {
          if (held.has(key)) return { rows: [{ locked: false }] };
          held.add(key);
          scope.keys.push(key);
          locks.push(key);
          return { rows: [{ locked: true }] };
        }
        if (text === "select pg_advisory_xact_lock(hashtext($1))") {
          const previous = queues.get(key) ?? Promise.resolve();
          let release!: () => void;
          const current = new Promise<void>((resolve) => {
            release = resolve;
          });
          queues.set(
            key,
            previous.then(() => current),
          );
          await previous;
          locks.push(key);
          scope.release.push(release);
          return { rows: [] };
        }
        throw new Error(`Instruction non simulée : ${text}`);
      },
    };
  };
  const db = {
    ...executor(null),
    transaction: async <T>(run: (tx: ReturnType<typeof executor>) => Promise<T>): Promise<T> => {
      const scope: NonNullable<Scope> = { release: [], keys: [], snapshot: null };
      try {
        return await run(executor(scope));
      } catch (err) {
        if (scope.snapshot) ({ entries, articles, stats } = scope.snapshot);
        throw err;
      } finally {
        for (const key of scope.keys) held.delete(key);
        for (const release of scope.release) release();
      }
    },
  };
  state.db = db;
  return {
    db: db as unknown as Database,
    log,
    wheres,
    locks,
    entries: () => entries,
    articles: () => articles,
    stats: () => stats,
    /** Condition (rendue en SQL) de la première requête de ce nom */
    where: (op: string) => wheres.find((entry) => entry.op === op),
  };
}

/** Sujets inscrits au calendrier par le tick. */
const planned = (handle: ReturnType<typeof fakeDb>) => handle.entries().map(({ siteId, scheduledFor, topic, motifSlug }) => ({ siteId, scheduledFor, topic, motifSlug }));
const briefs = () => state.briefs as ArticleBrief[];
const entry = (id: string, topic: string, motifSlug: string | null = null, overrides: Partial<Entry> = {}): Entry => ({ id, siteId: SITE_ID, scheduledFor: "2026-11-16", topic, motifSlug, status: "planned", ...overrides });

beforeEach(() => {
  state.briefs = [];
  state.onGenerate = null;
  state.inFlight = 0;
  state.maxInFlight = 0;
  vi.mocked(refreshExternalSites).mockClear();
  vi.mocked(sendWeeklyContentDigests).mockClear();
  vi.mocked(sendMonthReminders).mockClear();
});

afterEach(() => {
  state.db = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("outils des tâches", () => {
  it("mapPool : au plus `limit` promesses en vol, résultats dans l'ordre des éléments", async () => {
    let inFlight = 0;
    let max = 0;
    const results = await mapPool([5, 1, 4, 2, 3, 6, 0], 3, async (delay, index) => {
      inFlight += 1;
      max = Math.max(max, inFlight);
      await new Promise((resolve) => setTimeout(resolve, delay));
      inFlight -= 1;
      return `${index}:${delay}`;
    });
    expect(max).toBe(3);
    expect(results).toEqual(["0:5", "1:1", "2:4", "3:2", "4:3", "5:6", "6:0"]);
    expect(await mapPool([], 4, async () => 1)).toEqual([]);
  });

  it("proportionalBatch : le lot suit le parc, jamais sous le rythme d'avant", () => {
    // Petit parc : le lot d'avant (25 fiches, 8 mots-clés, 5 relectures)
    expect(proportionalBatch(100, 30, 25)).toBe(25);
    expect(proportionalBatch(0, 14, 8)).toBe(8);
    // Parc dix à cent fois plus grand : un trentième des fiches, un quatorzième des mots-clés par passage
    expect(proportionalBatch(3_000, 30, 25)).toBe(100);
    expect(proportionalBatch(3_001, 30, 25)).toBe(101);
    expect(proportionalBatch(9_000, 14, 8)).toBe(643);
    expect(proportionalBatch(1_000, 30, 5)).toBe(34);
  });

  it("errorLabel : code ou type de l'erreur, statut HTTP s'il y en a un — jamais le message", () => {
    const secret = "claire@exemple.fr a écrit « texte de l'article »";
    expect(errorLabel(new Error(secret))).toBe("Error");
    expect(errorLabel(Object.assign(new Error(secret), { status: 429 }))).toBe("Error 429");
    expect(errorLabel(new TypeError(secret))).toBe("TypeError");
    expect(errorLabel(Object.assign(new Error(secret), { code: "23505" }))).toBe("23505");
    // Erreur de la base enveloppée par drizzle : le code est dans la cause
    expect(errorLabel(new Error(`Failed query: ${secret}`, { cause: Object.assign(new Error("connexion perdue"), { code: "ECONNRESET" }) }))).toBe("ECONNRESET");
    expect(errorLabel("texte")).toBe("string");
    for (const value of [new Error(secret), Object.assign(new Error(secret), { status: 500 })]) expect(errorLabel(value)).not.toContain("claire");
  });

  it("rapports : état explicite, `failed` seulement s'il y a des échecs", () => {
    expect(tickOk("t", 3)).toEqual({ task: "t", processed: 3, status: "ok" });
    expect(tickOk("t", 3, 2)).toEqual({ task: "t", processed: 3, status: "ok", failed: 2 });
    expect(tickError("t", "Error 429")).toEqual({ task: "t", processed: 0, status: "error", error: "Error 429" });
    expect(tickError("t", "ECONNRESET", 1, 4)).toEqual({ task: "t", processed: 1, status: "error", failed: 4, error: "ECONNRESET" });
  });

  it("sites servis : clients et démos en cours ; ni site archivé, ni démo au lien expiré", () => {
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    const yesterday = new Date(NOW.getTime() - 86_400_000);
    expect(isServedSite({ type: "client", status: "published", demoExpiresAt: null }, NOW)).toBe(true);
    expect(isServedSite({ type: "client", status: "archived", demoExpiresAt: null }, NOW)).toBe(false);
    expect(isServedSite({ type: "demo", status: "ready", demoExpiresAt: null }, NOW)).toBe(true);
    expect(isServedSite({ type: "demo", status: "ready", demoExpiresAt: tomorrow }, NOW)).toBe(true);
    expect(isServedSite({ type: "demo", status: "ready", demoExpiresAt: yesterday }, NOW)).toBe(false);
    expect(isServedSite({ type: "demo", status: "archived", demoExpiresAt: tomorrow }, NOW)).toBe(false);
  });
});

describe("passages : groupes, ordre, échéances, erreurs", () => {
  it("ordre d'un passage complet : la publication avant la rédaction, les appels fournisseur longs à la fin", () => {
    expect(ALL_TICKS.map((tick) => tick.task)).toEqual([
      "publish-articles",
      "editorial-calendar",
      "month-reminders",
      "weekly-content-digests",
      "generate-articles",
      "sync-google",
      "sync-google-reviews",
      "sync-google-profiles",
      "collect-google-reviews",
      "scheduled-google-scans",
      "refresh-external-sites",
    ]);
    const tasks = ALL_TICKS.map((tick) => tick.task);
    expect(tasks.indexOf("publish-articles")).toBeLessThan(tasks.indexOf("generate-articles"));
    expect(ALL_TICKS.at(-1)!.run).toBe(refreshExternalSitesTick);
    expect(new Set(tasks).size).toBe(ALL_TICKS.length);
  });

  it("un groupe par entrée du cron : chaque tâche appartient à un groupe connu, aucun groupe n'est vide", () => {
    expect(TICK_GROUPS).toEqual(["emails", "publication", "redaction", "google", "google-scans", "sites-clients"]);
    const byGroup = (group: string) => ALL_TICKS.filter((tick) => tick.group === group).map((tick) => tick.task);
    expect(byGroup("publication")).toEqual(["publish-articles", "editorial-calendar"]);
    expect(byGroup("redaction")).toEqual(["generate-articles"]);
    expect(byGroup("emails")).toEqual(["month-reminders", "weekly-content-digests"]);
    expect(byGroup("google")).toEqual(["sync-google", "sync-google-reviews", "sync-google-profiles", "collect-google-reviews"]);
    expect(byGroup("google-scans")).toEqual(["scheduled-google-scans"]);
    expect(byGroup("sites-clients")).toEqual(["refresh-external-sites"]);
    for (const tick of ALL_TICKS) expect(tick.weight).toBeGreaterThan(0);
    // Liste blanche de la route cron
    for (const group of TICK_GROUPS) expect(isTickGroup(group)).toBe(true);
    for (const value of ["", "tout", "generate-articles", "Redaction", null, undefined, 3]) expect(isTickGroup(value)).toBe(false);
  });

  it("un groupe seul reçoit toute l'échéance du passage ; dans un groupe, chaque tâche reçoit sa part du temps restant", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-23T06:00:00Z"));
    const started = Date.now();
    fakeDb();
    vi.mocked(refreshExternalSites).mockResolvedValueOnce({ checked: 2, changed: 0, failed: 0 });
    expect(await runTicks("sites-clients", NOW)).toEqual([{ task: "refresh-external-sites", processed: 2, status: "ok" }]);
    expect(vi.mocked(refreshExternalSites).mock.calls[0]![1]).toEqual({ now: NOW, deadline: new Date(started + TICK_DEADLINE_MS) });

    // E-mails : le rappel du 25 (poids 1) reçoit un quart du temps ; il rend la main au bout de 10 s, l'hebdomadaire (poids 3) reçoit tout ce qui reste
    vi.mocked(sendMonthReminders).mockImplementationOnce(async () => {
      vi.setSystemTime(new Date(Date.now() + 10_000));
      return tickOk("month-reminders", 0);
    });
    vi.mocked(sendWeeklyContentDigests).mockResolvedValueOnce(tickOk("weekly-content-digests", 4));
    const before = Date.now();
    expect((await runTicks("emails", NOW)).map((report) => report.task)).toEqual(["month-reminders", "weekly-content-digests"]);
    expect(vi.mocked(sendMonthReminders).mock.calls[0]).toEqual([NOW, { deadline: new Date(before + TICK_DEADLINE_MS * 0.25) }]);
    expect(vi.mocked(sendWeeklyContentDigests).mock.calls[0]).toEqual([NOW, { deadline: new Date(before + TICK_DEADLINE_MS) }]);
  });

  it("une tâche qui lève est rapportée en erreur (type de l'erreur, jamais son message) et n'arrête pas les suivantes", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const handle = fakeDb({ fail: (op) => (op === "update blog_articles" ? Object.assign(new Error("Failed query: update … params: claire@exemple.fr"), { cause: Object.assign(new Error("terminated"), { code: "08006" }) }) : null) });
    const reports = await runTicks("publication", NOW);
    expect(reports).toEqual([
      { task: "publish-articles", processed: 0, status: "error", error: "08006" },
      { task: "editorial-calendar", processed: 24, status: "ok" },
    ]);
    expect(handle.entries()).toHaveLength(24);
    const logged = error.mock.calls.flat().join("\n");
    expect(logged).toContain("[ticks] publish-articles en échec (08006)");
    expect(logged).not.toContain("claire@exemple.fr");
  });

  it("passage complet (lancement à la main) : toutes les tâches, chacune avec un état, même quand la base est injoignable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.db = null;
    vi.mocked(sendWeeklyContentDigests).mockResolvedValueOnce(tickOk("weekly-content-digests", 0));
    vi.mocked(sendMonthReminders).mockResolvedValueOnce(tickOk("month-reminders", 0));
    vi.mocked(refreshExternalSites).mockResolvedValueOnce({ checked: 0, changed: 0, failed: 0 });
    const reports = await runAllTicks(NOW);
    expect(reports.map((report) => report.task)).toEqual(ALL_TICKS.map((tick) => tick.task));
    for (const report of reports) expect(["ok", "error"]).toContain(report.status);
    expect(reports.find((report) => report.task === "publish-articles")).toEqual({ task: "publish-articles", processed: 0, status: "error", error: "TypeError" });
    expect(reports.find((report) => report.task === "weekly-content-digests")!.status).toBe("ok");
  });
});

describe("ticks : relecture mensuelle des sites des clients", () => {
  it("transmet l'instant du passage et son échéance ; `processed` = sites relus, `failed` = relectures en échec", async () => {
    const { db } = fakeDb();
    const deadline = new Date(NOW.getTime() + TICK_DEADLINE_MS);
    vi.mocked(refreshExternalSites).mockResolvedValueOnce({ checked: 3, changed: 1, failed: 1 });
    expect(await refreshExternalSitesTick(NOW, { deadline })).toEqual({ task: "refresh-external-sites", processed: 3, status: "ok", failed: 1 });
    expect(refreshExternalSites).toHaveBeenCalledExactlyOnceWith(db, { now: NOW, deadline });
    // Sans échéance (lancement direct) : seul le budget propre à la relecture borne le passage
    vi.mocked(refreshExternalSites).mockResolvedValueOnce({ checked: 0, changed: 0, failed: 0 });
    expect(await refreshExternalSitesTick(NOW)).toEqual({ task: "refresh-external-sites", processed: 0, status: "ok" });
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
    expect(await ensureEditorialCalendars(NOW)).toEqual({ task: "editorial-calendar", processed: 24, status: "ok" });
    const hosted = [
      { slug: "stress-au-travail", title: "Stress au travail" },
      { slug: "sommeil", title: "Troubles du sommeil" },
    ];
    expect(planned(handle)).toEqual(expected(hosted));
    expect(new Set(planned(handle).map((t) => t.motifSlug))).toEqual(new Set(["stress-au-travail", "sommeil"]));
    expect(handle.log).not.toContain("select external_sites");
    // Une requête pour les sites, leurs thématiques et leur ville ; les spécialités ; puis, sous verrou, les sujets pris et l'inscription
    expect(handle.log).toEqual(["select sites ⨝ blog_settings", "query pages.findMany", "tx select sujets du site", "tx select titres des articles", "tx insert sujets"]);
  });

  it("site du client en référence : ses spécialités à la place, les pages du site hébergé ne sont pas lues", async () => {
    const handle = fakeDb({ site: connected(), external: [externalRow()] });
    expect(await ensureEditorialCalendars(NOW)).toMatchObject({ task: "editorial-calendar", processed: 24 });
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
    expect(await ensureEditorialCalendars(NOW)).toEqual({ task: "editorial-calendar", processed: 14, status: "ok" });
    const taken = new Set(before.map((t) => t.scheduledFor));
    for (const topic of planned(handle).slice(10)) {
      expect(taken.has(topic.scheduledFor)).toBe(false);
      expect(["preparation-aux-examens", "accompagnement-de-la-grossesse"]).toContain(topic.motifSlug);
    }
  });

  it("un sujet à venir suffixé d'une date (répétition de l'ancien planificateur) est remplacé par un vrai sujet, à la même date", async () => {
    const before = expected([{ slug: "stress-au-travail", title: "Stress au travail" }]).slice(0, 6);
    const legacy = new Set([before[1]!.scheduledFor, before[4]!.scheduledFor]);
    const entries: Entry[] = before.map((t, i) => ({ id: `e${i}`, siteId: SITE_ID, scheduledFor: t.scheduledFor, topic: legacy.has(t.scheduledFor) ? `${before[0]!.topic} (${t.scheduledFor})` : t.topic, motifSlug: t.motifSlug, status: "planned" }));
    // Un sujet daté déjà rédigé, et un sujet daté du passé : on n'y touche pas
    entries.push({ id: "fait", siteId: SITE_ID, scheduledFor: "2026-11-21", topic: "Ancien sujet (2026-11-21)", motifSlug: null, status: "generated" });
    entries.push({ id: "passé", siteId: SITE_ID, scheduledFor: "2026-11-10", topic: "Sujet en retard (2026-11-10)", motifSlug: null, status: "planned" });
    const handle = fakeDb({ site: connected(), external: [externalRow()], entries });
    await ensureEditorialCalendars(NOW);
    const after = handle.entries();
    // Plus aucun sujet à venir non rédigé ne porte de date entre parenthèses…
    expect(after.filter((e) => e.status === "planned" && e.scheduledFor > "2026-11-12" && / \(\d{4}-\d{2}-\d{2}\)$/.test(e.topic))).toEqual([]);
    // … leurs dates sont toujours servies, par un autre sujet
    for (const date of legacy) expect(after.filter((e) => e.scheduledFor === date && e.status === "planned")).toHaveLength(1);
    expect(new Set(after.filter((e) => e.status === "planned").map((e) => e.topic)).size).toBe(after.filter((e) => e.status === "planned").length);
    expect(after.find((e) => e.id === "fait")?.topic).toBe("Ancien sujet (2026-11-21)");
    expect(after.find((e) => e.id === "passé")?.topic).toBe("Sujet en retard (2026-11-10)");
  });
});

describe("ensureEditorialCalendars : sites servis, passages simultanés, erreurs", () => {
  it("périmètre demandé à la base : formule avec blog, ni site archivé ni démo au lien expiré", async () => {
    const handle = fakeDb();
    await ensureEditorialCalendars(NOW);
    const where = handle.where("select sites ⨝ blog_settings")!;
    expect(where.sql).toBe('(("sites"."status" <> $1 and ("sites"."type" = $2 or ("sites"."type" = $3 and ("sites"."demo_expires_at" is null or "sites"."demo_expires_at" > $4)))) and "sites"."plan" in ($5, $6))');
    expect(where.params).toEqual(["archived", "client", "demo", NOW.toISOString(), "starter", "scale"]);
  });

  it("deux passages simultanés : le second attend le verrou du site, relit les dates et n'ajoute rien", async () => {
    const handle = fakeDb();
    const reports = await Promise.all([ensureEditorialCalendars(NOW), ensureEditorialCalendars(NOW), ensureEditorialCalendarForSite(SITE_ID, NOW)]);
    expect(reports.map((report) => report.processed).sort()).toEqual([0, 0, 24]);
    expect(handle.entries()).toHaveLength(24);
    expect(new Set(handle.entries().map((e) => e.scheduledFor)).size).toBe(24);
    expect(handle.locks).toEqual(Array(3).fill(`${SITE_ID}:editorial-calendar`));
    // Lectures des dates et inscription : toujours dans la transaction qui tient le verrou
    expect(handle.log.filter((line) => /sujets du site|insert sujets/.test(line)).every((line) => line.startsWith("tx "))).toBe(true);
  });

  it("variante par site : même requête, restreinte à ce site", async () => {
    const handle = fakeDb();
    expect(await ensureEditorialCalendarForSite(SITE_ID, NOW)).toEqual({ task: "editorial-calendar", processed: 24, status: "ok" });
    const where = handle.where("select sites ⨝ blog_settings")!;
    expect(where.sql).toContain('"sites"."plan" in ($5, $6)) and "sites"."id" = $7');
    expect(where.params.at(-1)).toBe(SITE_ID);
  });

  it("un site en erreur n'arrête pas les autres ; le journal donne le site et le type d'erreur", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const other: Site = { ...SITE, id: OTHER_SITE_ID, slug: "autre-site" };
    let reads = 0;
    const handle = fakeDb({ calendar: [SITE, other], fail: (op) => (op === "select sujets du site" && ++reads === 1 ? Object.assign(new Error("deadlock detected"), { code: "40P01" }) : null) });
    expect(await ensureEditorialCalendars(NOW)).toEqual({ task: "editorial-calendar", processed: 24, status: "ok", failed: 1 });
    expect(new Set(handle.entries().map((e) => e.siteId)).size).toBe(1);
    expect(error.mock.calls.flat().join("\n")).toMatch(/\[calendrier\] site [0-9a-f-]{36} : calendrier non complété \(40P01\)/);
  });

  it("tous les sites en erreur : la tâche est en erreur", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeDb({ fail: (op) => (op === "insert sujets" ? Object.assign(new Error("disk full"), { code: "53100" }) : null) });
    expect(await ensureEditorialCalendars(NOW)).toEqual({ task: "editorial-calendar", processed: 0, status: "error", failed: 1, error: "53100" });
  });

  it("échéance dépassée : aucun site n'est entamé", async () => {
    const handle = fakeDb();
    expect(await ensureEditorialCalendars(NOW, { deadline: new Date(Date.now() - 1) })).toEqual({ task: "editorial-calendar", processed: 0, status: "ok" });
    expect(handle.entries()).toEqual([]);
  });
});

describe("generateDueArticles : spécialité rattachée à l'article", () => {
  it("sans site du client : le titre de la page de spécialité du site hébergé, comme avant", async () => {
    const handle = fakeDb({ entries: [entry("e1", "Sommeil léger : ce que la sophrologie peut changer", "sommeil"), entry("e2", "Un sujet libre", null), entry("e3", "Page disparue", "page-supprimee")] });
    expect(await generateDueArticles(NOW, ONE_BY_ONE)).toEqual({ task: "generate-articles", processed: 3, status: "ok" });
    expect(briefs().map((b) => [b.motifSlug, b.motifTitle])).toEqual([
      ["sommeil", "Troubles du sommeil"],
      [null, null],
      ["page-supprimee", null],
    ]);
    expect(briefs()[0]).toEqual({ topic: "Sommeil léger : ce que la sophrologie peut changer", motifSlug: "sommeil", motifTitle: "Troubles du sommeil", profession: "Sophrologue", city: "Albi", firstName: "Claire" });
    expect(handle.log).not.toContain("select external_sites");
    expect(handle.log.filter((line) => line === "query pages.findFirst")).toHaveLength(2);
  });

  it("site du client en référence : le titre de sa spécialité, sans lire les pages du site hébergé", async () => {
    const handle = fakeDb({ site: connected(), external: [externalRow()], entries: [entry("e1", "Préparation aux examens à Albi : ce qu'il faut savoir avant de venir", "preparation-aux-examens"), entry("e2", "Un sujet libre", null), entry("e3", "Autre sujet", "accompagnement-de-la-grossesse")] });
    expect(await generateDueArticles(NOW, ONE_BY_ONE)).toMatchObject({ task: "generate-articles", processed: 3 });
    expect(briefs().map((b) => [b.motifSlug, b.motifTitle])).toEqual([
      ["preparation-aux-examens", "Préparation aux examens"],
      [null, null],
      ["accompagnement-de-la-grossesse", "Accompagnement de la grossesse"],
    ]);
    // La référence est lue une fois par site, pas une fois par article
    expect(handle.log.filter((line) => line === "select external_sites")).toHaveLength(1);
    expect(handle.log).not.toContain("query pages.findFirst");
  });

  it("sujet planifié avant la connexion du site (spécialité du site hébergé) : son titre reste celui de la page hébergée", async () => {
    const handle = fakeDb({ site: connected(), external: [externalRow()], entries: [entry("e1", "Sommeil léger : ce que la sophrologie peut changer", "sommeil"), entry("e2", "Sujet d'une page disparue", "page-supprimee")] });
    await generateDueArticles(NOW, ONE_BY_ONE);
    expect(briefs().map((b) => [b.motifSlug, b.motifTitle])).toEqual([
      ["sommeil", "Troubles du sommeil"],
      ["page-supprimee", null],
    ]);
    expect(handle.log.filter((line) => line === "query pages.findFirst")).toHaveLength(2);
  });

  it("la publication ne change pas : l'article est enregistré pour le blog hébergé, le sujet marqué rédigé, dans la même transaction", async () => {
    const handle = fakeDb({ site: connected(), external: [externalRow()], entries: [entry("e1", "Préparation aux examens à Albi : une pause qui change la semaine", "preparation-aux-examens")] });
    await generateDueArticles(NOW, ONE_BY_ONE);
    expect(handle.articles()).toHaveLength(1);
    expect(handle.articles()[0]).toMatchObject({
      siteId: SITE_ID,
      title: "Article : Préparation aux examens à Albi : une pause qui change la semaine",
      slug: "article-du-jour",
      status: "scheduled",
      aiGenerated: true,
      motifSlug: "preparation-aux-examens",
      imageUrl: "https://images.pexels.com/photos/1/couverture.jpeg",
      // Jour prévu, 07:00 UTC : l'heure que le studio inscrit aussi quand le praticien replanifie
      publishAt: new Date("2026-11-16T07:00:00Z"),
    });
    expect(handle.entries()[0]).toMatchObject({ status: "generated", articleId: "article-1" });
    // Verrou du sujet, relecture, verrou du blog du site, adresse libre, article, sujet : tout dans la transaction
    expect(handle.log.slice(-4)).toEqual(["tx select sujet", "tx select adresses des articles", "tx insert blog_articles", "tx update sujet"]);
    expect(handle.locks).toEqual(["editorial-entry:e1", `${SITE_ID}:blog-slug`]);
  });

  it("publication manuelle : l'article attend en brouillon", async () => {
    const handle = fakeDb({ settings: { publicationMode: "manual" }, entries: [entry("e1", "Un sujet")] });
    await generateDueArticles(NOW, ONE_BY_ONE);
    expect(handle.articles()[0]).toMatchObject({ status: "draft", publishAt: new Date("2026-11-16T07:00:00Z") });
  });

  it("rien à rédiger : ni générateur, ni référence du site du client", async () => {
    const handle = fakeDb({ site: connected(), external: [externalRow()], entries: [] });
    expect(await generateDueArticles(NOW)).toEqual({ task: "generate-articles", processed: 0, status: "ok" });
    expect(handle.log).not.toContain("select external_sites");
    expect(briefs()).toEqual([]);
  });

  it("ancien sujet suffixé d'une date : la date n'est pas envoyée à l'IA", async () => {
    fakeDb({ entries: [entry("e1", "Nuque bloquée au réveil : ce que le massage peut changer (2026-12-15)")] });
    await generateDueArticles(NOW, ONE_BY_ONE);
    expect(briefs()[0]!.topic).toBe("Nuque bloquée au réveil : ce que le massage peut changer");
  });
});

describe("generateDueArticles : file, échéance, simultanéité", () => {
  it("une seule requête pour la file : sujets « planned » des clients non archivés, dus à J+7, retard borné, les plus urgents d'abord", async () => {
    const handle = fakeDb({ entries: [entry("e1", "Un sujet")] });
    await generateDueArticles(NOW, ONE_BY_ONE);
    expect(handle.log.filter((line) => line === "select file des sujets")).toHaveLength(1);
    const where = handle.where("select file des sujets")!;
    expect(where.sql).toBe(
      '("editorial_calendar_entries"."status" = $1 and "editorial_calendar_entries"."scheduled_for" <= $2 and "editorial_calendar_entries"."scheduled_for" >= $3 and ("sites"."type" = $4 and "sites"."status" <> $5 and "sites"."plan" in ($6, $7)))',
    );
    expect(where.params).toEqual(["planned", "2026-11-19", "2026-10-29", "client", "archived", "starter", "scale"]);
    expect(ARTICLE_MAX_LATE_DAYS).toBe(14);
  });

  it("avant la file : les sujets qui ne seront jamais rédigés sont retirés (blog non rédigé et date passée, ou retard de plus de 14 jours)", async () => {
    const handle = fakeDb({ entries: [] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await generateDueArticles(NOW);
    const where = handle.where("update sujets retirés")!;
    expect(where.sql).toBe(
      '("editorial_calendar_entries"."status" = $1 and ("editorial_calendar_entries"."scheduled_for" < $2 or ("editorial_calendar_entries"."scheduled_for" < $3 and "editorial_calendar_entries"."site_id" not in (select "sites"."id" from "sites" where ("sites"."type" = $4 and "sites"."status" <> $5 and "sites"."plan" in ($6, $7))))))',
    );
    expect(where.params).toEqual(["planned", "2026-10-29", "2026-11-12", "client", "archived", "starter", "scale"]);
    expect(handle.log[0]).toBe("update sujets retirés");
  });

  it("les plus urgents d'abord, quel que soit le site ; l'ordre est tiré au sort entre sujets d'une même date", async () => {
    const entries = [
      entry("a", "Site 1, vendredi", null, { scheduledFor: "2026-11-13" }),
      entry("b", "Site 2, en retard", null, { siteId: OTHER_SITE_ID, scheduledFor: "2026-11-10" }),
      entry("c", "Site 1, lundi", null, { scheduledFor: "2026-11-16" }),
      entry("d", "Site 2, vendredi", null, { siteId: OTHER_SITE_ID, scheduledFor: "2026-11-13" }),
      entry("e", "Site 2, lundi", null, { siteId: OTHER_SITE_ID, scheduledFor: "2026-11-16" }),
    ];
    fakeDb({ entries });
    await generateDueArticles(NOW, ONE_BY_ONE);
    expect(briefs().map((b) => b.topic)).toEqual(["Site 2, en retard", "Site 1, vendredi", "Site 2, vendredi", "Site 1, lundi", "Site 2, lundi"]);

    // Autre tirage : les dates restent dans l'ordre, les sujets d'une même date sont permutés
    state.briefs = [];
    fakeDb({ entries });
    await generateDueArticles(NOW, { concurrency: 1, random: () => 0 });
    expect(briefs().map((b) => b.topic)).toEqual(["Site 2, en retard", "Site 2, vendredi", "Site 1, vendredi", "Site 2, lundi", "Site 1, lundi"]);
  });

  it(`au plus ${ARTICLE_CONCURRENCY} rédactions en vol, par défaut`, async () => {
    state.onGenerate = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
    const handle = fakeDb({ entries: Array.from({ length: 14 }, (_, i) => entry(`e${i}`, `Sujet ${i}`, null, { siteId: `site-${i}` })) });
    expect(await generateDueArticles(NOW)).toEqual({ task: "generate-articles", processed: 14, status: "ok" });
    expect(state.maxInFlight).toBe(ARTICLE_CONCURRENCY);
    expect(ARTICLE_CONCURRENCY).toBeGreaterThanOrEqual(4);
    expect(ARTICLE_CONCURRENCY).toBeLessThanOrEqual(5);
    expect(handle.articles()).toHaveLength(14);
  });

  it("l'échéance est relue avant chaque sujet : aucune rédaction n'est entamée s'il ne reste pas le temps de la finir", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-23T07:20:00Z"));
    // Dernier départ possible : 150 s après le début (l'échéance moins le temps laissé à une rédaction entamée)
    const deadline = new Date(Date.now() + 150_000 + ARTICLE_START_MARGIN_MS);
    // Chaque rédaction dure 60 s : la troisième commence à 120 s, la quatrième trouverait le dernier départ dépassé
    state.onGenerate = () => void vi.setSystemTime(new Date(Date.now() + 60_000));
    const handle = fakeDb({ entries: Array.from({ length: 6 }, (_, i) => entry(`e${i}`, `Sujet ${i}`, null, { siteId: `site-${i}` })) });
    expect(await generateDueArticles(NOW, { ...ONE_BY_ONE, deadline })).toEqual({ task: "generate-articles", processed: 3, status: "ok" });
    expect(briefs()).toHaveLength(3);
    expect(handle.entries().filter((e) => e.status === "planned").map((e) => e.id)).toEqual(["e3", "e4", "e5"]);
    expect(ARTICLE_START_MARGIN_MS).toBe(120_000);

    // Échéance trop proche pour finir une rédaction, ou déjà passée : rien n'est entamé
    for (const late of [new Date(Date.now() + ARTICLE_START_MARGIN_MS - 1), new Date(Date.now() - 1)]) {
      state.briefs = [];
      fakeDb({ entries: [entry("e1", "Un sujet")] });
      expect(await generateDueArticles(NOW, { deadline: late })).toEqual({ task: "generate-articles", processed: 0, status: "ok" });
      expect(briefs()).toEqual([]);
    }
  });
});

describe("generateDueArticles : échecs", () => {
  it("un sujet en échec n'arrête pas les sites suivants ; il reste planifié, le journal donne le site et le type d'erreur, pas le contenu", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    state.onGenerate = (brief: ArticleBrief) => {
      if (brief.topic.includes("refusé")) throw Object.assign(new Error(`Requête déclinée : « ${brief.topic} » de Claire Dupont`), { status: 400 });
    };
    const handle = fakeDb({
      entries: [
        entry("e1", "Sujet refusé par le modèle", null, { scheduledFor: "2026-11-13" }),
        entry("e2", "Sujet du deuxième site", null, { siteId: OTHER_SITE_ID, scheduledFor: "2026-11-13" }),
        entry("e3", "Sujet du troisième site", null, { siteId: "site-3", scheduledFor: "2026-11-16" }),
      ],
    });
    expect(await generateDueArticles(NOW, ONE_BY_ONE)).toEqual({ task: "generate-articles", processed: 2, status: "ok", failed: 1 });
    expect(handle.entries().map((e) => e.status)).toEqual(["planned", "generated", "generated"]);
    expect(handle.articles().map((a) => a.siteId)).toEqual([OTHER_SITE_ID, "site-3"]);
    const logged = error.mock.calls.flat().join("\n");
    expect(logged).toBe(`[articles] site ${SITE_ID} : rédaction en échec (Error 400)`);
    expect(logged).not.toMatch(/refusé|Claire|Dupont/);
  });

  it("un site en échec ne repasse pas en tête du même passage : ses autres sujets attendent le suivant, chaque sujet n'est tenté qu'une fois", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.onGenerate = (brief: ArticleBrief) => {
      if (brief.topic.startsWith("Site en panne")) throw new Error("JSON invalide");
    };
    const late = (id: string, day: string) => entry(id, `Site en panne, sujet ${id}`, null, { scheduledFor: day });
    // Le site en panne a les six sujets les plus urgents de la file
    const handle = fakeDb({
      entries: [late("p1", "2026-11-02"), late("p2", "2026-11-03"), late("p3", "2026-11-05"), late("p4", "2026-11-06"), late("p5", "2026-11-09"), late("p6", "2026-11-10"), entry("ok1", "Site sain, sujet 1", null, { siteId: OTHER_SITE_ID }), entry("ok2", "Site sain, sujet 2", null, { siteId: OTHER_SITE_ID, scheduledFor: "2026-11-17" })],
    });
    expect(await generateDueArticles(NOW, ONE_BY_ONE)).toEqual({ task: "generate-articles", processed: 2, status: "ok", failed: 1 });
    // Un seul appel pour le site en panne, puis les sujets des autres sites
    expect(briefs().map((b) => b.topic)).toEqual(["Site en panne, sujet p1", "Site sain, sujet 1", "Site sain, sujet 2"]);
    expect(handle.entries().filter((e) => e.status === "planned").map((e) => e.id)).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
  });

  it("fournisseur en panne : le passage s'arrête après quelques échecs d'affilée et la tâche est en erreur", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    state.onGenerate = () => {
      throw Object.assign(new Error("credit balance is too low"), { status: 400 });
    };
    const handle = fakeDb({ entries: Array.from({ length: 40 }, (_, i) => entry(`e${i}`, `Sujet ${i}`, null, { siteId: `site-${i}` })) });
    expect(await generateDueArticles(NOW, ONE_BY_ONE)).toEqual({ task: "generate-articles", processed: 0, status: "error", failed: ARTICLE_FAILURE_BREAKER, error: "Error 400" });
    expect(briefs()).toHaveLength(ARTICLE_FAILURE_BREAKER);
    expect(handle.articles()).toEqual([]);
    expect(error.mock.calls.flat().join("\n")).toContain(`${ARTICLE_FAILURE_BREAKER} échecs d'affilée : passage arrêté`);
  });

  it("rien d'écrit et un échec : la tâche est en erreur (la route cron répond 500), pas « rien à faire »", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.onGenerate = () => {
      throw new TypeError("fetch failed");
    };
    fakeDb({ entries: [entry("e1", "Un sujet")] });
    expect(await generateDueArticles(NOW, ONE_BY_ONE)).toEqual({ task: "generate-articles", processed: 0, status: "error", failed: 1, error: "TypeError" });
  });

  it("échec à l'inscription : rien n'est écrit à moitié (l'article est annulé avec la transaction), le sujet reste planifié", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handle = fakeDb({ entries: [entry("e1", "Un sujet")], fail: (op) => (op === "update sujet" ? Object.assign(new Error("connection terminated"), { code: "08006" }) : null) });
    expect(await generateDueArticles(NOW, ONE_BY_ONE)).toEqual({ task: "generate-articles", processed: 0, status: "error", failed: 1, error: "08006" });
    expect(handle.articles()).toEqual([]);
    expect(handle.entries()[0]).toMatchObject({ status: "planned" });
  });
});

describe("generateDueArticles : doublons", () => {
  it("deux passages simultanés : chaque sujet n'est inscrit qu'une fois, aucune adresse en « -2 », l'article en trop est jeté", async () => {
    state.onGenerate = () => new Promise<void>((resolve) => setTimeout(resolve, 2));
    const handle = fakeDb({ entries: Array.from({ length: 6 }, (_, i) => entry(`e${i}`, `Sujet ${i}`, null, { siteId: `site-${i}` })) });
    const reports = await Promise.all([generateDueArticles(NOW, { random: KEEP_ORDER }), generateDueArticles(NOW, { random: KEEP_ORDER })]);
    expect(reports.map((report) => report.status)).toEqual(["ok", "ok"]);
    expect(reports[0]!.processed + reports[1]!.processed).toBe(6);
    expect(handle.articles()).toHaveLength(6);
    expect(handle.articles().map((a) => a.slug)).toEqual(Array(6).fill("article-du-jour"));
    expect(new Set(handle.entries().map((e) => e.articleId)).size).toBe(6);
  });

  it("sujet déjà rédigé par un autre passage depuis la lecture de la file : l'IA n'est pas appelée", async () => {
    const handle = fakeDb({ entries: [entry("e1", "Sujet 1"), entry("e2", "Sujet 2", null, { siteId: OTHER_SITE_ID })] });
    state.onGenerate = (brief: ArticleBrief) => {
      // Pendant la rédaction du premier sujet, un autre passage termine le second
      if (brief.topic === "Sujet 1") Object.assign(handle.entries()[1]!, { status: "generated", articleId: "ailleurs" });
    };
    expect(await generateDueArticles(NOW, ONE_BY_ONE)).toEqual({ task: "generate-articles", processed: 1, status: "ok" });
    expect(briefs().map((b) => b.topic)).toEqual(["Sujet 1"]);
    expect(handle.articles()).toHaveLength(1);
  });

  it("sujet rédigé par un autre passage pendant l'appel à l'IA : relu sous verrou, rien n'est inscrit", async () => {
    const handle = fakeDb({ entries: [entry("e1", "Sujet 1")] });
    state.onGenerate = () => void Object.assign(handle.entries()[0]!, { status: "generated", articleId: "ailleurs" });
    expect(await generateDueArticles(NOW, ONE_BY_ONE)).toEqual({ task: "generate-articles", processed: 0, status: "ok" });
    expect(briefs()).toHaveLength(1);
    expect(handle.articles()).toEqual([]);
    expect(handle.entries()[0]).toMatchObject({ status: "generated", articleId: "ailleurs" });
  });

  it("un autre passage est en train d'inscrire ce sujet (verrou tenu) : on lui laisse la place", async () => {
    const handle = fakeDb({ entries: [entry("e1", "Sujet 1")], heldLocks: ["editorial-entry:e1"] });
    expect(await generateDueArticles(NOW, ONE_BY_ONE)).toEqual({ task: "generate-articles", processed: 0, status: "ok" });
    expect(handle.articles()).toEqual([]);
    expect(handle.log).not.toContain("tx insert blog_articles");
  });

  it("deux sujets différents du même site donnant la même adresse : la seconde est suffixée, jamais d'erreur d'unicité", async () => {
    state.onGenerate = () => new Promise<void>((resolve) => setTimeout(resolve, 2));
    const handle = fakeDb({ entries: [entry("e1", "Sujet 1"), entry("e2", "Sujet 2"), entry("e3", "Sujet 3")], articles: [{ title: "Ancien article", slug: "article-du-jour-2" }] });
    expect(await generateDueArticles(NOW, { concurrency: 3, random: KEEP_ORDER })).toEqual({ task: "generate-articles", processed: 3, status: "ok" });
    expect(handle.articles().map((a) => a.slug).sort()).toEqual(["article-du-jour", "article-du-jour-2", "article-du-jour-3", "article-du-jour-4"]);
  });
});

describe("generateDueArticlesForSite : un seul site, à la demande", () => {
  it("même file et mêmes verrous, pour ce site quel que soit son type (jamais archivé) ; ne retire aucun sujet", async () => {
    const handle = fakeDb({ entries: [entry("e1", "Un sujet")] });
    expect(await generateDueArticlesForSite(SITE_ID, NOW, ONE_BY_ONE)).toEqual({ task: "generate-articles", processed: 1, status: "ok" });
    const where = handle.where("select file des sujets")!;
    expect(where.sql).toContain('("sites"."id" = $4 and "sites"."status" <> $5 and "sites"."plan" in ($6, $7))');
    expect(where.params.slice(3)).toEqual([SITE_ID, "archived", "starter", "scale"]);
    expect(handle.log).not.toContain("update sujets retirés");
    expect(handle.locks).toEqual(["editorial-entry:e1", `${SITE_ID}:blog-slug`]);
  });
});

describe("publishDueArticles : le jour prévu", () => {
  it("borne : la fin du jour UTC du passage — un article prévu à 07:00 sort au passage de 6 h, pas le lendemain", () => {
    expect(publishCutoff(new Date("2026-11-16T06:00:00Z"))).toEqual(new Date("2026-11-17T00:00:00Z"));
    expect(publishCutoff(new Date("2026-11-16T07:05:00Z"))).toEqual(new Date("2026-11-17T00:00:00Z"));
    expect(publishCutoff(new Date("2026-11-16T00:00:00Z"))).toEqual(new Date("2026-11-17T00:00:00Z"));
    expect(publishCutoff(new Date("2026-11-15T23:59:59Z"))).toEqual(new Date("2026-11-16T00:00:00Z"));
    // L'article du jour J (07:00 UTC) est sous la borne dès le passage de 6 h ; celui de J+1 ne l'est pas
    const cutoff = publishCutoff(new Date("2026-11-16T06:00:00Z")).getTime();
    expect(new Date("2026-11-16T07:00:00Z").getTime()).toBeLessThan(cutoff);
    expect(new Date("2026-11-17T07:00:00Z").getTime()).toBeGreaterThanOrEqual(cutoff);
  });

  it("un seul UPDATE … RETURNING id : articles planifiés dont le jour est arrivé, aucun texte chargé", async () => {
    const now = new Date("2026-11-16T06:00:00Z");
    const handle = fakeDb({ publishable: [{ id: "a1" }, { id: "a2" }] });
    expect(await publishDueArticles(now)).toEqual({ task: "publish-articles", processed: 2, status: "ok" });
    expect(handle.log).toEqual(["update blog_articles"]);
    const where = handle.where("update blog_articles")!;
    expect(where.sql).toBe('("blog_articles"."status" = $1 and "blog_articles"."publish_at" < $2)');
    expect(where.params).toEqual(["scheduled", "2026-11-17T00:00:00.000Z"]);
  });
});

describe("syncGoogleData : statistiques simulées des démos seulement", () => {
  const DEMO_ID = "44444444-4444-4444-8444-444444444444";

  it("périmètre demandé à la base : connexions actives de démos en cours — jamais un site client", async () => {
    const handle = fakeDb({ connections: [] });
    expect(await syncGoogleData(NOW)).toEqual({ task: "sync-google", processed: 0, status: "ok" });
    const where = handle.where("select démos connectées")!;
    expect(where.sql).toBe('("google_connections"."status" = $1 and "sites"."status" <> $2 and ("sites"."type" = $3 and ("sites"."demo_expires_at" is null or "sites"."demo_expires_at" > $4)))');
    expect(where.params).toEqual(["connected", "archived", "demo", NOW.toISOString()]);
    // Aucune démo connectée : rien n'est supprimé, rien n'est écrit
    expect(handle.log).toEqual(["select démos connectées"]);
  });

  it("suppression et réinsertion dans une même transaction, sous verrou du site", async () => {
    const handle = fakeDb({ connections: [{ siteId: DEMO_ID, profession: "Sophrologue", city: "Albi" }] });
    const report = await syncGoogleData(NOW);
    expect(report).toMatchObject({ task: "sync-google", status: "ok" });
    expect(report.processed).toBeGreaterThan(500);
    expect(handle.stats()).toHaveLength(report.processed);
    expect(handle.locks).toEqual([`${DEMO_ID}:search-stats`]);
    expect(handle.log[1]).toBe("tx delete search_query_stats");
    expect(handle.log.slice(1).every((line) => line.startsWith("tx "))).toBe(true);
  });

  it("échec en cours de réinsertion : la transaction est annulée, les statistiques précédentes restent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let failing = false;
    let inserts = 0;
    const handle = fakeDb({
      connections: [{ siteId: DEMO_ID, profession: "Sophrologue", city: "Albi" }],
      fail: (op) => (failing && op === "insert search_query_stats" && ++inserts === 2 ? Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }) : null),
    });
    // Passage de la veille : les statistiques en place
    const yesterday = await syncGoogleData(new Date(NOW.getTime() - 86_400_000));
    const before = handle.stats().map((row) => row.day);
    expect(before).toHaveLength(yesterday.processed);
    // Le second lot d'insertions échoue : la suppression et le premier lot sont annulés avec la transaction
    failing = true;
    expect(await syncGoogleData(NOW)).toEqual({ task: "sync-google", processed: 0, status: "error", failed: 1, error: "57014" });
    expect(handle.stats().map((row) => row.day)).toEqual(before);
  });

  it("variante par site : même requête restreinte à ce site (un site client n'y figure jamais : rien n'est écrit)", async () => {
    const handle = fakeDb({ connections: [] });
    expect(await syncGoogleDataForSite(SITE_ID, NOW)).toEqual({ task: "sync-google", processed: 0, status: "ok" });
    const where = handle.where("select démos connectées")!;
    expect(where.sql).toContain('"sites"."demo_expires_at" > $4)) and "sites"."id" = $5');
    expect(where.params.at(-1)).toBe(SITE_ID);
  });
});

describe("syncGoogleReviews : fraîcheur", () => {
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

  it("un site n'est dû que 7 jours après sa dernière synchronisation ; jamais synchronisés d'abord, puis les plus anciens", () => {
    expect(REVIEWS_SYNC_INTERVAL_DAYS).toBe(7);
    const rows = [
      { id: "hier", syncedAt: daysAgo(1) },
      { id: "ancien", syncedAt: daysAgo(30) },
      { id: "jamais", syncedAt: null },
      { id: "limite", syncedAt: daysAgo(7) },
      { id: "presque", syncedAt: new Date(daysAgo(7).getTime() + 1) },
      { id: "semaine", syncedAt: daysAgo(9) },
    ];
    expect(selectDueReviewSyncs(rows, NOW, 25).map((row) => row.id)).toEqual(["jamais", "ancien", "semaine", "limite"]);
    expect(selectDueReviewSyncs(rows, NOW, 2).map((row) => row.id)).toEqual(["jamais", "ancien"]);
    expect(selectDueReviewSyncs(rows, NOW, 0)).toEqual([]);
  });

  it("lot proportionnel au parc : un septième des sites par passage, 25 au moins", () => {
    expect(proportionalBatch(40, REVIEWS_SYNC_INTERVAL_DAYS, 25)).toBe(25);
    expect(proportionalBatch(700, REVIEWS_SYNC_INTERVAL_DAYS, 25)).toBe(100);
    expect(proportionalBatch(5_000, REVIEWS_SYNC_INTERVAL_DAYS, 25)).toBe(715);
  });
});
