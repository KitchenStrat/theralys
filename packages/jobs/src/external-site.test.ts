import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { Column, SQL, getTableColumns, getTableName, is, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type * as AiModule from "@theralys/ai";
import type { ExternalProfileExtractor, ExternalProfileInput } from "@theralys/ai";
import { externalSites, googleUsage, prospects, sites, type Database, type Site } from "@theralys/db";
import type { WebsiteReadOptions, WebsiteReader } from "@theralys/providers/website";
import {
  EMPTY_EXTERNAL_PROFILE,
  EXTERNAL_MEASURE_KEY,
  EXTERNAL_READ_ERRORS,
  EXTERNAL_READ_USAGE_KIND,
  EXTERNAL_SITE_LIMITS,
  EXTERNAL_URL_ERRORS,
  buildSocialBrief,
  cleanExternalProfile,
  externalBriefPages,
  type ExternalPageKind,
  type ExternalReadOutcome,
  type ExternalSiteFacts,
  type ExternalSitePage,
  type ExternalSiteProfile,
  type ExternalSiteSetting,
  type Section,
  type SiteTheme,
  type SocialBriefInput,
} from "@theralys/shared";
import { currentApiUsageContext, type ApiUsageContext } from "@theralys/shared/usage-runtime";
import { monthlyGoogleSpendUsd } from "./google-profile";
import {
  EXTERNAL_READ_DEADLINE_MS,
  EXTERNAL_REFRESH_BATCH,
  EXTERNAL_REFRESH_BUDGET_MS,
  beginExternalSiteRead,
  briefPagesFor,
  disconnectExternalSite,
  externalContentHash,
  externalReadsUsed,
  hostedHostsOf,
  loadExternalReference,
  loadExternalSite,
  newExternalMeasureKey,
  refreshExternalSites,
  runExternalSiteRead,
  saveExternalOverrides,
  selectDueExternalSites,
  setExternalSiteActive,
  submitExternalSiteText,
  type ExternalSiteView,
} from "./external-site";

// Le lecteur de site et l'extracteur de profil réels ne sont jamais appelés ici : leurs fabriques sont remplacées
const factories = vi.hoisted(() => ({
  createWebsiteReader: vi.fn(),
  pastedTextToPages: vi.fn(),
  createExternalProfileExtractor: vi.fn(),
}));
vi.mock("@theralys/providers/website", () => ({
  createWebsiteReader: factories.createWebsiteReader,
  pastedTextToPages: factories.pastedTextToPages,
}));
vi.mock("@theralys/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof AiModule>()),
  createExternalProfileExtractor: factories.createExternalProfileExtractor,
}));

// ─── Jeu de données ──────────────────────────────────────────────────────────

const NOW = new Date("2026-11-12T09:00:00Z");
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE_MS);

const SITE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SITE_ID = "99999999-9999-4999-8999-999999999999";
const PROSPECT_ID = "22222222-2222-4222-8222-222222222222";
const SITE_URL = "https://www.cabinet-dupont.fr";
const BARE_URL = "https://cabinet-dupont.fr";
const OTHER_URL = "https://www.sophrologie-albi.fr";
const MEASURE_KEY = "abcdefghijklmnopqrstuvwx";
const ENV = { SITES_BASE_URL: "https://demo.harmony-web.fr", DEMO_HOST: "sites.harmony-web.fr", STUDIO_BASE_URL: "https://app.harmony-web.fr/" } as NodeJS.ProcessEnv;

const THEME: SiteTheme = { preset: "terracotta", fontPreset: "chaleureux", logoUrl: "https://images.pexels.com/logo.png", disabledMotifs: ["sommeil"] };

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
  createdAt: daysAgo(200),
  updatedAt: daysAgo(200),
};

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
// Texte de page reconnaissable : il ne doit jamais se retrouver dans un journal
const PAGE_SECRET = "Texte confidentiel de la page d'accueil";
const HOME_TEXT = `${PAGE_SECRET}. ${"La sophrologie aide à retrouver un sommeil apaisé et à mieux vivre le stress du quotidien. ".repeat(4)}`;
const STRESS_TEXT = "Gestion du stress : des séances pour apprendre à relâcher les tensions, respirer et retrouver de l'énergie. ".repeat(3);

function page(path: string, kind: ExternalPageKind, title: string, text: string, base = SITE_URL): ExternalSitePage {
  return { url: `${base}${path}`, kind, title, headings: [title], text, hash: sha(text), fetchedAt: NOW.toISOString() };
}

const PAGES: ExternalSitePage[] = [page("/", "home", "Claire Dupont, sophrologue à Albi", HOME_TEXT), page("/gestion-du-stress", "specialty", "Gestion du stress", STRESS_TEXT)];

const FACTS: ExternalSiteFacts = {
  name: "Cabinet Dupont",
  phones: ["05 63 00 00 00"],
  emails: ["contact@cabinet-dupont.fr"],
  hours: [{ label: "Lundi", value: "9 h – 18 h" }],
  bookingLinks: [{ url: "https://www.doctolib.fr/sophrologue/albi/claire-dupont", platform: "doctolib" }],
  social: { instagram: "https://www.instagram.com/claire.sophro" },
  tags: { measureSnippet: true, googleAnalyticsId: "G-ABCDE12345" },
  cms: "wordpress",
};

const PROFILE: ExternalSiteProfile = cleanExternalProfile(
  {
    headline: "La sophrologie pour retrouver calme et énergie",
    intro: ["Claire Dupont vous accueille à Albi pour des séances de sophrologie."],
    highlights: [{ title: "Séances individuelles", text: "En cabinet ou à distance" }],
    specialties: [
      { title: "Gestion du stress", excerpt: "Relâcher les tensions et retrouver de l'énergie.", url: `${SITE_URL}/gestion-du-stress`, headings: ["Respirer", "Relâcher"], faq: [] },
      { title: "Sommeil", excerpt: "Retrouver un sommeil apaisé.", headings: [], faq: [] },
    ],
    about: { paragraphs: ["Sophrologue certifiée, j'accompagne adultes et adolescents."], credentials: ["Certification RNCP"] },
    practical: [{ title: "Durée", text: "Une heure" }],
    process: [],
    faq: [],
    contact: { address: "12 rue de la Paix, 81000 Albi", phone: "05 63 00 00 00", hours: [] },
    bookingUrl: "https://www.doctolib.fr/sophrologue/albi/claire-dupont",
    social: { instagram: "https://www.instagram.com/claire.sophro", facebook: "https://fb.com/cabinet.dupont", linkedin: "https://www.linkedin.com/in/claire-dupont" },
  },
  SITE_URL,
);

/** Profil lu incomplet : une présentation, aucune spécialité — inexploitable sans corrections. */
const PARTIAL: ExternalSiteProfile = { ...EMPTY_EXTERNAL_PROFILE, headline: "Sophrologie à Albi" };

const ACTIVE: ExternalSiteSetting = { url: SITE_URL, active: true };
const themeWith = (setting: ExternalSiteSetting | undefined, extra: Partial<SiteTheme> = {}): SiteTheme => ({ ...THEME, ...extra, ...(setting ? { externalSite: setting } : {}) });

type Row = Record<string, unknown>;

let rowSeq = 0;
const rowId = () => `00000000-0000-4000-8000-${String(++rowSeq).padStart(12, "0")}`;

const siteRow = (overrides: Row = {}): Row => ({ ...SITE, ...overrides });
const activeSiteRow = (overrides: Row = {}): Row => siteRow({ theme: themeWith(ACTIVE), ...overrides });

function prospectRow(overrides: Row = {}): Row {
  return { id: PROSPECT_ID, firstName: "Claire", lastName: "Dupont", profession: "Sophrologue", city: "Albi", gender: "feminin", googlePlaceId: null, googleBusinessName: null, googleAddress: null, googleRating: null, googleReviewCount: null, googlePhotoUrl: null, createdAt: daysAgo(200), ...overrides };
}

/** Site connecté, lu il y a trois jours, profil exploitable. */
function externalRow(overrides: Row = {}): Row {
  return {
    id: rowId(),
    siteId: SITE_ID,
    url: SITE_URL,
    status: "ready",
    source: "crawl",
    error: null,
    errorDetail: null,
    readStartedAt: daysAgo(3),
    readAt: daysAgo(3),
    checkedAt: null,
    pages: PAGES,
    facts: FACTS,
    profile: PROFILE,
    overrides: null,
    contentHash: externalContentHash(PAGES, FACTS),
    measureKey: MEASURE_KEY,
    measureSeenAt: daysAgo(2),
    consentAt: daysAgo(3),
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
    ...overrides,
  };
}

/** Site en cours de lecture depuis une minute (lecture lancée par `beginExternalSiteRead`), jamais lu auparavant. */
function readingRow(overrides: Row = {}): Row {
  return externalRow({ status: "reading", readStartedAt: minutesAgo(1), readAt: null, pages: [], facts: null, profile: null, contentHash: null, measureSeenAt: null, ...overrides });
}

/** Site déjà lu (profil exploitable enregistré) dont une relecture est en cours depuis une minute. */
function rereadingRow(overrides: Row = {}): Row {
  return externalRow({ status: "reading", readStartedAt: minutesAgo(1), ...overrides });
}

function usageRow(overrides: Row = {}): Row {
  return { id: rowId(), siteId: SITE_ID, month: "2026-11", kind: EXTERNAL_READ_USAGE_KIND, costUsd: 0, requests: 1, createdAt: NOW, ...overrides };
}

// ─── Lecteur et extracteur simulés ───────────────────────────────────────────

type OkRead = Extract<ExternalReadOutcome, { ok: true }>;
const okRead = (overrides: Partial<OkRead> = {}): OkRead => ({ ok: true, url: SITE_URL, pages: PAGES, facts: FACTS, skipped: { robots: 0, failed: 0 }, ...overrides });

function fakeReader(respond: (url: string, call: number) => ExternalReadOutcome | Promise<ExternalReadOutcome> = () => okRead()) {
  const calls: { url: string; opts: WebsiteReadOptions | undefined; context: ApiUsageContext }[] = [];
  const reader: WebsiteReader = {
    mode: "mock",
    read: async (url, opts) => {
      calls.push({ url, opts, context: currentApiUsageContext() });
      return respond(url, calls.length - 1);
    },
  };
  return { reader, calls };
}

function fakeExtractor(respond: (input: ExternalProfileInput, call: number) => ExternalSiteProfile | Promise<ExternalSiteProfile> = () => PROFILE) {
  const calls: { input: ExternalProfileInput; context: ApiUsageContext }[] = [];
  const extractor: ExternalProfileExtractor = {
    mode: "mock",
    extract: async (input) => {
      calls.push({ input, context: currentApiUsageContext() });
      return respond(input, calls.length - 1);
    },
  };
  return { extractor, calls };
}

/** Texte collé → une page par bloc de EXTERNAL_SITE_LIMITS.pageChars caractères (tient lieu de `pastedTextToPages`). */
function fakePastedPages(text: string, url: string, now: Date = NOW): ExternalSitePage[] {
  const pages: ExternalSitePage[] = [];
  for (let from = 0; from < text.length; from += EXTERNAL_SITE_LIMITS.pageChars) {
    const chunk = text.slice(from, from + EXTERNAL_SITE_LIMITS.pageChars);
    pages.push({ url, kind: pages.length === 0 ? "home" : "other", title: "Texte collé", headings: [], text: chunk, hash: sha(chunk), fetchedAt: now.toISOString() });
  }
  return pages;
}

// ─── Base simulée en mémoire ─────────────────────────────────────────────────

type DbOp = "select" | "insert" | "update" | "delete" | "execute";
type LogEntry = { op: DbOp; table: string; tx: boolean; forUpdate?: boolean };
type Seed = { external?: Row[]; sites?: Row[]; usage?: Row[]; prospects?: Row[] };

const DIALECT = new PgDialect();
/** Contraintes d'unicité */
const UNIQUE_KEYS = new Map<Table, string[]>([[externalSites, ["siteId", "measureKey"]]]);

const clone = <T>(value: T): T => structuredClone(value);

/** Nom SQL d'une colonne → clé de la ligne. */
function keysBySqlName(table: Table): Map<string, string> {
  return new Map(Object.entries(getTableColumns(table)).map(([key, column]) => [column.name, key]));
}

function keyOfColumn(table: Table, column: unknown): string {
  const found = Object.entries(getTableColumns(table)).find(([, candidate]) => candidate === column);
  if (!found) throw new Error(`Colonne étrangère à ${getTableName(table)}`);
  return found[0];
}

/** Valeur comparable : les dates (côté ligne) et leur forme ISO (côté paramètre) se comparent en millisecondes. */
function comparable(value: unknown, like: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  return like instanceof Date && typeof value === "string" ? Date.parse(value) : value;
}

/** Découpe `text` sur `separator` hors parenthèses. */
function splitTopLevel(text: string, separator: " and " | " or "): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (depth === 0 && text.startsWith(separator, i)) {
      parts.push(text.slice(from, i));
      from = i + separator.length;
      i = from - 1;
    }
  }
  parts.push(text.slice(from));
  return parts;
}

/** `text` est-il un seul groupe entre parenthèses ? */
function isWrapped(text: string): boolean {
  if (!text.startsWith("(") || !text.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0 && i < text.length - 1) return false;
  }
  return true;
}

/**
 * Condition drizzle → prédicat : la condition est rendue en SQL par le
 * dialecte PostgreSQL, puis relue (`=`, `>=`, `<=`, `<`, `in`, `not in`,
 * `is null` et `is not null` sur les colonnes de la table, reliés par `and`
 * et `or` avec leurs parenthèses). Toute autre forme lève : la base simulée
 * ne fait pas semblant de filtrer.
 */
function predicateOf(table: Table, condition: unknown): (row: Row) => boolean {
  if (condition === undefined) return () => true;
  const { sql: text, params } = DIALECT.sqlToQuery(condition as SQL);
  const name = getTableName(table);
  const keys = keysBySqlName(table);
  const atomOf = (atom: string): ((row: Row) => boolean) => {
    const match = /^"([^"]+)"\."([^"]+)" (?:(=|>=|<=|<) (\$\d+)|(in|not in) \((\$\d+(?:, \$\d+)*)\)|(is null|is not null))$/.exec(atom);
    const key = match && match[1] === name ? keys.get(match[2]!) : undefined;
    if (!match || !key) throw new Error(`Condition non simulée sur ${name} : ${atom}`);
    if (match[7]) return (row: Row) => (row[key] === null || row[key] === undefined) === (match[7] === "is null");
    const values = [...(match[4] ?? match[6]!).matchAll(/\$(\d+)/g)].map((param) => params[Number(param[1]) - 1]);
    // Une valeur NULL ne satisfait aucune comparaison
    const known = (row: Row) => row[key] !== null && row[key] !== undefined;
    if (match[3] === ">=") return (row: Row) => known(row) && (comparable(row[key], row[key]) as number) >= (comparable(values[0], row[key]) as number);
    if (match[3] === "<=") return (row: Row) => known(row) && (comparable(row[key], row[key]) as number) <= (comparable(values[0], row[key]) as number);
    if (match[3] === "<") return (row: Row) => known(row) && (comparable(row[key], row[key]) as number) < (comparable(values[0], row[key]) as number);
    const among = (row: Row) => values.some((value) => comparable(row[key], row[key]) === comparable(value, row[key]));
    return match[5] === "not in" ? (row: Row) => known(row) && !among(row) : among;
  };
  const parse = (expression: string): ((row: Row) => boolean) => {
    if (isWrapped(expression)) return parse(expression.slice(1, -1));
    const alternatives = splitTopLevel(expression, " or ");
    if (alternatives.length > 1) {
      const tests = alternatives.map(parse);
      return (row) => tests.some((test) => test(row));
    }
    const terms = splitTopLevel(expression, " and ");
    if (terms.length > 1) {
      const tests = terms.map(parse);
      return (row) => tests.every((test) => test(row));
    }
    return atomOf(expression);
  };
  return parse(text);
}

/** Projection d'un `select` ou d'un `returning` : ligne entière, colonnes nommées, ou agrégat (`count(*)`, `coalesce(sum(colonne), 0)`). */
function project(table: Table, fields: Record<string, unknown> | undefined, rows: Row[]): Row[] {
  if (!fields) return rows.map(clone);
  const entries = Object.entries(fields);
  if (entries.some(([, field]) => is(field, SQL) && !is(field, Column))) {
    const keys = keysBySqlName(table);
    return [
      Object.fromEntries(
        entries.map(([alias, field]) => {
          const text = DIALECT.sqlToQuery(field as SQL).sql;
          // PostgreSQL rend un décompte ou une somme d'entiers en bigint, que le pilote livre en texte
          if (text === "count(*)") return [alias, String(rows.length)];
          const match = /^coalesce\(sum\("([^"]+)"\."([^"]+)"\), 0\)$/.exec(text);
          const key = match && match[1] === getTableName(table) ? keys.get(match[2]!) : undefined;
          if (!key) throw new Error(`Agrégat non simulé : ${text}`);
          return [alias, String(rows.reduce((sum, row) => sum + Number(row[key]), 0))];
        }),
      ),
    ];
  }
  return rows.map((row) => Object.fromEntries(entries.map(([alias, column]) => [alias, clone(row[keyOfColumn(table, column)])])));
}

/** Ligne insérée telle que PostgreSQL l'enregistre : valeurs par défaut posées, colonnes absentes à NULL, NOT NULL vérifié. */
function inserted(table: Table, values: Row): Row {
  const row: Row = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (values[key] !== undefined) row[key] = clone(values[key]);
    else if (is(column.default, SQL)) row[key] = column.columnType === "PgUUID" ? rowId() : new Date();
    else if (column.default !== undefined) row[key] = clone(column.default);
    else row[key] = null;
    if (column.notNull && row[key] === null) {
      throw Object.assign(new Error(`null value in column "${column.name}" of relation "${getTableName(table)}" violates not-null constraint`), { code: "23502" });
    }
  }
  return row;
}

/** Erreur du pilote pour une table absente (migration non appliquée), enveloppée par drizzle dans `cause`. */
function missingTableError(table: Table): Error {
  const name = getTableName(table);
  return new Error(`Failed query: select from "${name}"`, { cause: Object.assign(new Error(`relation "${name}" does not exist`), { code: "42P01", severity: "ERROR" }) });
}

type Failure = (op: DbOp, table: Table | null) => Error | null;

/** Échec de toutes les requêtes sur ces tables : table absente. */
const missing =
  (...tables: Table[]): Failure =>
  (_op, table) =>
    table !== null && tables.includes(table) ? missingTableError(table) : null;

const connectionLost: Failure = () => Object.assign(new Error("connection terminated unexpectedly"), { code: "08006" });

/**
 * Base en mémoire qui exécute pour de bon les requêtes de `external-site.ts` :
 * `select` (projection, `where`, `limit`, `for("update")`), `insert` (valeurs
 * par défaut, unicité, `returning`), `update` et `delete` (`returning`),
 * `transaction` et verrou consultatif `pg_advisory_xact_lock` : deux
 * transactions qui prennent la même clé s'exécutent l'une après l'autre, le
 * verrou tombe à la fin de la transaction. Une transaction qui lève est
 * annulée : les tables retrouvent l'état de sa première écriture (suffisant
 * ici, les transactions du module étant sérialisées par le verrou). `fail`
 * injecte une erreur par opération et par table.
 */
function memoryDb(seed: Seed = {}, options: { fail?: Failure } = {}) {
  const tables = new Map<Table, Row[]>([
    [externalSites, clone(seed.external ?? [])],
    [sites, clone(seed.sites ?? [siteRow()])],
    [googleUsage, clone(seed.usage ?? [])],
    [prospects, clone(seed.prospects ?? [prospectRow()])],
  ]);
  const log: LogEntry[] = [];
  /** Clés des verrous consultatifs pris, dans l'ordre */
  const locks: string[] = [];
  const lockQueues = new Map<string, Promise<void>>();
  let fail = options.fail;
  const rowsOf = (table: Table): Row[] => {
    const rows = tables.get(table);
    if (!rows) throw new Error(`Table non simulée : ${getTableName(table)}`);
    return rows;
  };
  type Scope = { held: (() => void)[]; snapshot: Map<Table, Row[]> | null } | null;
  type Thenable<T> = { then: <R>(resolve: (value: T) => R, reject?: (reason: unknown) => R) => Promise<R> };
  const lazy = <T>(run: () => Promise<T>): Thenable<T> => ({ then: (resolve, reject) => run().then(resolve, reject) });

  /** Connexion (`scope` null) ou transaction (`scope` : verrous à relâcher, état à rétablir si elle lève). */
  const executor = (scope: Scope) => {
    const exec = async <T>(op: DbOp, table: Table, run: () => T, extra: Partial<LogEntry> = {}): Promise<T> => {
      log.push({ op, table: getTableName(table), tx: scope !== null, ...extra });
      const failure = fail?.(op, table);
      if (failure) throw failure;
      if (op !== "select" && scope && !scope.snapshot) scope.snapshot = new Map([...tables].map(([key, rows]) => [key, clone(rows)]));
      return run();
    };
    const unique = (table: Table, candidate: Row, self?: Row) => {
      for (const key of UNIQUE_KEYS.get(table) ?? []) {
        if (rowsOf(table).some((row) => row !== self && row[key] === candidate[key])) {
          throw Object.assign(new Error(`duplicate key value violates unique constraint on "${getTableName(table)}" (${key})`), { code: "23505" });
        }
      }
    };
    return {
      select: (fields?: Record<string, unknown>) => ({
        from: (table: Table) => {
          const state: { condition: unknown; limit: number | null; forUpdate: boolean } = { condition: undefined, limit: null, forUpdate: false };
          const chain = {
            where: (condition: unknown) => {
              state.condition = condition;
              return chain;
            },
            limit: (count: number) => {
              state.limit = count;
              return chain;
            },
            for: (strength: string) => {
              if (strength !== "update" || scope === null) throw new Error(`Verrou de ligne non simulé${scope === null ? " hors transaction" : ""} : ${strength}`);
              state.forUpdate = true;
              return chain;
            },
            ...lazy(() =>
              exec(
                "select",
                table,
                () => {
                  let rows = rowsOf(table).filter(predicateOf(table, state.condition));
                  if (state.limit !== null) rows = rows.slice(0, state.limit);
                  return project(table, fields, rows);
                },
                state.forUpdate ? { forUpdate: true } : {},
              ),
            ),
          };
          return chain;
        },
      }),
      insert: (table: Table) => ({
        values: (values: Row) => {
          const run = (returning: Record<string, unknown> | null) =>
            exec("insert", table, () => {
              const row = inserted(table, values);
              unique(table, row);
              rowsOf(table).push(row);
              return returning ? project(table, returning, [row]) : ([] as Row[]);
            });
          return { ...lazy(() => run(null)), returning: (fields: Record<string, unknown>) => lazy(() => run(fields)) };
        },
      }),
      update: (table: Table) => ({
        set: (values: Row) => ({
          where: (condition: unknown) => {
            const run = (returning: Record<string, unknown> | null) =>
              exec("update", table, () => {
                const matches = predicateOf(table, condition);
                const changed: Row[] = [];
                for (const row of rowsOf(table)) {
                  if (!matches(row)) continue;
                  const next = { ...row, ...clone(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))) };
                  unique(table, next, row);
                  Object.assign(row, next);
                  changed.push(row);
                }
                return returning ? project(table, returning, changed) : ([] as Row[]);
              });
            return { ...lazy(() => run(null)), returning: (fields: Record<string, unknown>) => lazy(() => run(fields)) };
          },
        }),
      }),
      delete: (table: Table) => ({
        where: (condition: unknown) => {
          const run = (fields?: Record<string, unknown>) =>
            exec("delete", table, () => {
              const matches = predicateOf(table, condition);
              const rows = rowsOf(table);
              const removed = rows.filter(matches);
              tables.set(
                table,
                rows.filter((row) => !matches(row)),
              );
              return fields ? project(table, fields, removed) : ([] as Row[]);
            });
          return { ...lazy(() => run()), returning: (fields?: Record<string, unknown>) => lazy(() => run(fields)) };
        },
      }),
      execute: async (query: unknown) => {
        const { sql: text, params } = DIALECT.sqlToQuery(query as SQL);
        log.push({ op: "execute", table: text, tx: scope !== null });
        const failure = fail?.("execute", null);
        if (failure) throw failure;
        if (text !== "select pg_advisory_xact_lock(hashtext($1))" || scope === null) throw new Error(`Instruction non simulée${scope === null ? " hors transaction" : ""} : ${text}`);
        const key = String(params[0]);
        const previous = lockQueues.get(key) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
          release = resolve;
        });
        lockQueues.set(
          key,
          previous.then(() => current),
        );
        await previous;
        locks.push(key);
        scope.held.push(release);
        return { rows: [] };
      },
    };
  };
  const db = {
    ...executor(null),
    transaction: async <T>(run: (tx: ReturnType<typeof executor>) => Promise<T>): Promise<T> => {
      const scope: NonNullable<Scope> = { held: [], snapshot: null };
      try {
        return await run(executor(scope));
      } catch (err) {
        if (scope.snapshot) for (const [table, rows] of scope.snapshot) tables.set(table, rows);
        throw err;
      } finally {
        for (const release of scope.held) release();
      }
    },
  };
  return {
    db: db as unknown as Database,
    /** Lignes actuelles d'une table (copie) */
    rows: (table: Table): Row[] => clone(rowsOf(table)),
    /** Modifie les lignes d'une table en cours de test (une autre opération survenue entre-temps) */
    patch: (table: Table, values: Row, where: (row: Row) => boolean = () => true) => {
      for (const row of rowsOf(table)) if (where(row)) Object.assign(row, clone(values));
    },
    clear: (table: Table) => tables.set(table, []),
    log,
    locks,
    /** Requêtes d'un type donné sur une table */
    count: (op: DbOp, table: Table) => log.filter((entry) => entry.op === op && entry.table === getTableName(table)).length,
    /** Change l'injection d'erreurs en cours de test */
    failWith: (next: Failure | undefined) => {
      fail = next;
    },
  };
}

type MemoryDb = ReturnType<typeof memoryDb>;

/** La ligne `external_sites` du site (il n'y en a qu'une par site). */
const external = (handle: MemoryDb, siteId = SITE_ID): Row | undefined => handle.rows(externalSites).find((row) => row.siteId === siteId);
/** Le thème du site, tel qu'il est enregistré. */
const themeOf = (handle: MemoryDb, siteId = SITE_ID): SiteTheme => handle.rows(sites).find((row) => row.id === siteId)!.theme as SiteTheme;
const siteOf = (handle: MemoryDb, siteId = SITE_ID): Row => handle.rows(sites).find((row) => row.id === siteId)!;
/** Écritures faites hors transaction (aucune ne doit toucher le thème du site). */
const writesOutsideTx = (handle: MemoryDb, table: Table) => handle.log.filter((entry) => entry.table === getTableName(table) && entry.op !== "select" && !entry.tx);

const LOCK_KEY = `${SITE_ID}:external-site`;

/** Journaux muets pendant les tests (et consultables). */
let logs: { warn: MockInstance; error: MockInstance; info: MockInstance; log: MockInstance };
/** Tout ce qui a été écrit dans les journaux, en un seul texte. */
const logged = () => [logs.warn, logs.error, logs.info, logs.log].flatMap((spy) => spy.mock.calls.flat().map((part) => (part instanceof Error ? `${part.message} ${part.stack}` : String(part)))).join("\n");

beforeEach(() => {
  // Seule l'horloge est simulée : `new Date()` et `Date.now()` valent NOW, les promesses et minuteries restent réelles
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  logs = {
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
  };
  factories.createWebsiteReader.mockReset().mockImplementation(() => {
    throw new Error("Lecteur réel interdit dans les tests");
  });
  factories.createExternalProfileExtractor.mockReset().mockImplementation(() => {
    throw new Error("Extracteur réel interdit dans les tests");
  });
  factories.pastedTextToPages.mockReset().mockImplementation(fakePastedPages);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Hôtes du site hébergé ───────────────────────────────────────────────────

describe("hostedHostsOf", () => {
  it("domaine du site, hôtes de SITES_BASE_URL, DEMO_HOST et STUDIO_BASE_URL, sans doublon", () => {
    expect(hostedHostsOf({ domain: "Claire-Dupont.fr" }, ENV)).toEqual(["claire-dupont.fr", "demo.harmony-web.fr", "sites.harmony-web.fr", "app.harmony-web.fr"]);
    expect(hostedHostsOf({ domain: null }, { SITES_BASE_URL: "https://demo.harmony-web.fr/", DEMO_HOST: "demo.harmony-web.fr" } as NodeJS.ProcessEnv)).toEqual(["demo.harmony-web.fr"]);
  });

  it("valeurs de configuration tolérées : adresse avec port ou chemin, hôte nu, liste, valeur vide ou illisible", () => {
    expect(hostedHostsOf({ domain: null }, { SITES_BASE_URL: "http://localhost:3000", STUDIO_BASE_URL: "localhost:3002" } as NodeJS.ProcessEnv)).toEqual(["localhost"]);
    expect(hostedHostsOf({ domain: null }, { DEMO_HOST: "a.exemple.fr, b.exemple.fr" } as NodeJS.ProcessEnv)).toEqual(["a.exemple.fr", "b.exemple.fr"]);
    expect(hostedHostsOf({ domain: "" }, { SITES_BASE_URL: "", DEMO_HOST: "   ", STUDIO_BASE_URL: "https://" } as NodeJS.ProcessEnv)).toEqual([]);
    expect(hostedHostsOf({ domain: null }, {} as NodeJS.ProcessEnv)).toEqual([]);
  });
});

describe("newExternalMeasureKey", () => {
  it("24 caractères, minuscules et chiffres, différents à chaque tirage", () => {
    const keys = Array.from({ length: 200 }, () => newExternalMeasureKey());
    for (const key of keys) expect(key).toMatch(EXTERNAL_MEASURE_KEY);
    expect(new Set(keys).size).toBe(keys.length);
    // Tout l'alphabet sert : lettres et chiffres
    const seen = new Set(keys.join(""));
    expect(seen.size).toBe(36);
  });
});

describe("externalContentHash", () => {
  it("même contenu, même empreinte : ni l'ordre des pages, ni celui des faits, ni les dates de lecture ne comptent", () => {
    const base = externalContentHash(PAGES, FACTS);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    const later = [...PAGES].reverse().map((p) => ({ ...p, fetchedAt: "2027-01-01T00:00:00.000Z", etag: "W/\"autre\"" }));
    const shuffled: ExternalSiteFacts = { tags: { googleAnalyticsId: "G-ABCDE12345", measureSnippet: true }, cms: "wordpress", social: FACTS.social, bookingLinks: FACTS.bookingLinks, hours: FACTS.hours, emails: FACTS.emails, phones: FACTS.phones, name: FACTS.name };
    expect(externalContentHash(later, shuffled)).toBe(base);
    expect(externalContentHash(PAGES, { ...FACTS, phones: [...FACTS.phones, "06 00 00 00 00"].reverse() })).toBe(externalContentHash(PAGES, { ...FACTS, phones: [...FACTS.phones, "06 00 00 00 00"] }));
  });

  it("un texte modifié, une page en plus ou en moins, un fait modifié : l'empreinte change", () => {
    const base = externalContentHash(PAGES, FACTS);
    const edited = [PAGES[0]!, page("/gestion-du-stress", "specialty", "Gestion du stress", `${STRESS_TEXT} Nouveau tarif.`)];
    expect(externalContentHash(edited, FACTS)).not.toBe(base);
    expect(externalContentHash(PAGES.slice(0, 1), FACTS)).not.toBe(base);
    expect(externalContentHash([...PAGES, page("/tarifs", "pricing", "Tarifs", "Séance : 60 €")], FACTS)).not.toBe(base);
    expect(externalContentHash(PAGES, { ...FACTS, tags: { ...FACTS.tags, measureSnippet: false } })).not.toBe(base);
    expect(externalContentHash(PAGES, { ...FACTS, phones: [] })).not.toBe(base);
  });

  it("page sans empreinte : celle de son texte est calculée", () => {
    const bare = PAGES.map((p) => ({ ...p, hash: "" }));
    expect(externalContentHash(bare, FACTS)).toBe(externalContentHash(PAGES, FACTS));
  });
});

// ─── Écran « Mon site » ──────────────────────────────────────────────────────

describe("loadExternalSite", () => {
  const view = async (handle: MemoryDb, site: Pick<Site, "id" | "theme"> = SITE, now = NOW): Promise<ExternalSiteView> => {
    const state = await loadExternalSite(handle.db, site, now);
    if (!state.available || !state.site) throw new Error("Site connecté attendu");
    return state.site;
  };

  it("table absente (migration 0009 non appliquée) : indisponible, sans erreur ; toute autre erreur de base est levée", async () => {
    expect(await loadExternalSite(memoryDb({}, { fail: missing(externalSites) }).db, SITE, NOW)).toEqual({ available: false });
    await expect(loadExternalSite(memoryDb({}, { fail: connectionLost }).db, SITE, NOW)).rejects.toThrow("connection terminated");
  });

  it("aucun site connecté : disponible, `site: null`", async () => {
    expect(await loadExternalSite(memoryDb().db, SITE, NOW)).toEqual({ available: true, site: null });
    // La ligne d'un autre site ne compte pas
    expect(await loadExternalSite(memoryDb({ external: [externalRow({ siteId: OTHER_SITE_ID })] }).db, SITE, NOW)).toEqual({ available: true, site: null });
  });

  it("site lu : adresse, pages résumées, faits, profil lu, corrections, profil effectif, code de mesure", async () => {
    const overrides = { headline: "Retrouver le calme, à Albi", contact: { phone: "06 11 22 33 44" } };
    const handle = memoryDb({ external: [externalRow({ overrides })] });
    const site = await view(handle, { id: SITE_ID, theme: themeWith({ ...ACTIVE, keepHostedIndexed: true }) });
    expect(site).toMatchObject({ url: SITE_URL, status: "ready", reading: false, source: "crawl", error: null, readAt: daysAgo(3), active: true, keepHostedIndexed: true, usable: true, gaps: [] });
    expect(site.pages).toEqual([
      { url: `${SITE_URL}/`, kind: "home", title: "Claire Dupont, sophrologue à Albi" },
      { url: `${SITE_URL}/gestion-du-stress`, kind: "specialty", title: "Gestion du stress" },
    ]);
    expect(site.facts).toEqual(FACTS);
    expect(site.extracted).toEqual(PROFILE);
    expect(site.overrides).toEqual(overrides);
    // Profil effectif : la correction l'emporte, le reste vient de la lecture
    expect(site.profile.headline).toBe("Retrouver le calme, à Albi");
    expect(site.profile.contact).toEqual({ ...PROFILE.contact, phone: "06 11 22 33 44" });
    expect(site.profile.specialties).toEqual(PROFILE.specialties);
    expect(site.measure).toEqual({ key: MEASURE_KEY, seenAt: daysAgo(2), detectedOnSite: true });
  });

  it("interrupteur lu dans le thème du site : absent, éteint, ou adresse invalide → inactif", async () => {
    const handle = memoryDb({ external: [externalRow()] });
    expect((await view(handle)).active).toBe(false);
    expect((await view(handle)).keepHostedIndexed).toBe(false);
    expect((await view(handle, { id: SITE_ID, theme: themeWith({ url: SITE_URL, active: false }) })).active).toBe(false);
    expect((await view(handle, { id: SITE_ID, theme: themeWith({ url: "pas une adresse", active: true }) })).active).toBe(false);
    expect((await view(handle, { id: SITE_ID, theme: themeWith(ACTIVE) })).active).toBe(true);
  });

  it("profil incomplet : `usable: false` et ce qui manque, dit au praticien", async () => {
    const empty = await view(memoryDb({ external: [externalRow({ profile: EMPTY_EXTERNAL_PROFILE })] }));
    expect(empty.usable).toBe(false);
    expect(empty.gaps).toEqual(["une présentation de votre activité", "au moins une spécialité"]);
    // Les corrections du praticien suffisent à le rendre exploitable
    const completed = await view(memoryDb({ external: [externalRow({ profile: EMPTY_EXTERNAL_PROFILE, overrides: { headline: "Sophrologie à Albi", specialties: PROFILE.specialties } })] }));
    expect(completed).toMatchObject({ usable: true, gaps: [] });
  });

  it("première lecture en cours depuis moins de EXTERNAL_SITE_LIMITS.readStaleMs : `reading` ; au-delà, elle compte comme un échec `internal`", async () => {
    const stale = EXTERNAL_SITE_LIMITS.readStaleMs;
    const at = (ms: number) => memoryDb({ external: [readingRow({ readStartedAt: new Date(NOW.getTime() - ms) })] });
    expect(await view(at(MINUTE_MS))).toMatchObject({ status: "reading", reading: true, error: null });
    expect(await view(at(stale - 1))).toMatchObject({ status: "reading", reading: true, error: null });
    expect(await view(at(stale))).toMatchObject({ status: "error", reading: false, error: "internal" });
    expect(await view(at(stale + 10 * MINUTE_MS))).toMatchObject({ status: "error", reading: false, error: "internal" });
    // Début de lecture inconnu : rien ne dit qu'elle tourne encore
    expect(await view(memoryDb({ external: [readingRow({ readStartedAt: null })] }))).toMatchObject({ status: "error", reading: false, error: "internal" });
  });

  it("relecture d'un site déjà lu : `reading` le temps de la lecture, le profil précédent toujours montré ; interrompue, le site reste « prêt » avec l'échec `internal`", async () => {
    const stale = EXTERNAL_SITE_LIMITS.readStaleMs;
    const at = (ms: number) => memoryDb({ external: [rereadingRow({ readStartedAt: new Date(NOW.getTime() - ms) })] });
    const kept = { readAt: daysAgo(3), profile: PROFILE, usable: true, source: "crawl" };
    expect(await view(at(MINUTE_MS))).toMatchObject({ status: "reading", reading: true, error: null, ...kept });
    expect(await view(at(stale - 1))).toMatchObject({ status: "reading", reading: true, error: null, ...kept });
    expect(await view(at(stale))).toMatchObject({ status: "ready", reading: false, error: "internal", ...kept });
    expect(await view(at(stale + 10 * MINUTE_MS))).toMatchObject({ status: "ready", reading: false, error: "internal", ...kept });
    expect((await view(at(stale))).pages).toHaveLength(2);
  });

  it("première lecture en échec : site en « erreur » avec le code du contrat ; un code inconnu ou absent devient `internal`", async () => {
    const failed = (error: unknown) => memoryDb({ external: [readingRow({ status: "error", error, errorDetail: "HTTP 403" })] });
    expect(await view(failed("blocked"))).toMatchObject({ status: "error", reading: false, error: "blocked", readAt: null, extracted: null });
    expect(await view(failed("robots"))).toMatchObject({ status: "error", error: "robots" });
    expect(await view(failed("code-inconnu"))).toMatchObject({ status: "error", error: "internal" });
    expect(await view(failed(null))).toMatchObject({ status: "error", error: "internal" });
  });

  it("relecture en échec : le site reste « prêt », l'échec est exposé et le profil précédent conservé", async () => {
    const failed = (error: unknown) => memoryDb({ external: [externalRow({ error, errorDetail: "HTTP 403", overrides: { headline: "Corrigé" } })] });
    const site = await view(failed("blocked"));
    expect(site).toMatchObject({ status: "ready", reading: false, error: "blocked", readAt: daysAgo(3), extracted: PROFILE, usable: true, gaps: [] });
    expect(site.profile.headline).toBe("Corrigé");
    expect(site.pages).toHaveLength(2);
    expect(await view(failed("timeout"))).toMatchObject({ status: "ready", error: "timeout" });
    expect(await view(failed("code-inconnu"))).toMatchObject({ status: "ready", error: "internal" });
    // Aucun échec en mémoire : rien à dire
    expect(await view(failed(null))).toMatchObject({ status: "ready", error: null });
  });

  it("rien n'a encore été lu : faits vides, profil vide, code de mesure non repéré", async () => {
    const site = await view(memoryDb({ external: [readingRow()] }));
    expect(site.facts).toEqual({ phones: [], emails: [], hours: [], bookingLinks: [], social: {}, tags: {} });
    expect(site.extracted).toBeNull();
    expect(site.overrides).toBeNull();
    expect(site.profile).toEqual(EMPTY_EXTERNAL_PROFILE);
    expect(site.pages).toEqual([]);
    expect(site.measure).toEqual({ key: MEASURE_KEY, seenAt: null, detectedOnSite: false });
    expect(site.source).toBe("crawl");
    expect((await view(memoryDb({ external: [externalRow({ source: "pasted", facts: { ...FACTS, tags: {} } })] }))).source).toBe("pasted");
    expect((await view(memoryDb({ external: [externalRow({ facts: { ...FACTS, tags: {} } })] }))).measure.detectedOnSite).toBe(false);
  });

  it("lectures du mois : celles du site, de ce mois et de ce type seulement, avec le plafond", async () => {
    const handle = memoryDb({
      external: [externalRow()],
      usage: [
        usageRow(),
        usageRow(),
        usageRow({ month: "2026-10" }),
        usageRow({ siteId: OTHER_SITE_ID }),
        usageRow({ kind: "scan", costUsd: 0.1 }),
        usageRow({ kind: "meta_media", requests: 40 }),
      ],
    });
    expect((await view(handle)).reads).toEqual({ used: 2, limit: EXTERNAL_SITE_LIMITS.readsPerMonth });
    expect(await externalReadsUsed(handle.db, SITE_ID, NOW)).toBe(2);
    expect(await externalReadsUsed(handle.db, SITE_ID, new Date("2026-10-31T23:00:00Z"))).toBe(1);
    expect(await externalReadsUsed(handle.db, SITE_ID, new Date("2026-12-01T00:00:00Z"))).toBe(0);
    expect((await view(memoryDb({ external: [externalRow()] }))).reads).toEqual({ used: 0, limit: 6 });
  });
});

// ─── Lecture lancée par le praticien ─────────────────────────────────────────

describe("beginExternalSiteRead", () => {
  const begin = (handle: MemoryDb, input: Partial<{ url: string; consent: boolean }> = {}, site: Site = SITE) =>
    beginExternalSiteRead(handle.db, site, { url: "www.cabinet-dupont.fr", consent: true, ...input }, { now: NOW, env: ENV });

  it("première connexion : ligne créée en « lecture en cours » avec sa clé de mesure, lecture comptée au quota", async () => {
    const handle = memoryDb();
    expect(await begin(handle)).toEqual({ ok: true });
    const row = external(handle)!;
    expect(row).toMatchObject({ siteId: SITE_ID, url: SITE_URL, status: "reading", source: "crawl", readStartedAt: NOW, consentAt: NOW, readAt: null, checkedAt: null, pages: [], facts: null, profile: null, overrides: null, contentHash: null, error: null, measureSeenAt: null });
    expect(row.measureKey).toMatch(EXTERNAL_MEASURE_KEY);
    expect(handle.rows(googleUsage)).toEqual([expect.objectContaining({ siteId: SITE_ID, month: "2026-11", kind: EXTERNAL_READ_USAGE_KIND, costUsd: 0, requests: 1, createdAt: NOW })]);
    // Le réglage du site naît à l'activation, pas à la lecture
    expect(themeOf(handle)).toEqual(THEME);
  });

  it("tout se joue dans une transaction ouverte par le verrou du site : vérifications puis écritures", async () => {
    const handle = memoryDb();
    await begin(handle);
    expect(handle.locks).toEqual([LOCK_KEY]);
    expect(handle.log[0]).toMatchObject({ op: "execute", tx: true });
    expect(handle.log.every((entry) => entry.tx)).toBe(true);
    const ops = handle.log.map((entry) => `${entry.op} ${entry.table}`);
    expect(ops.indexOf("select external_sites")).toBeLessThan(ops.indexOf("select google_usage"));
    expect(ops.indexOf("select google_usage")).toBeLessThan(ops.indexOf("insert external_sites"));
    expect(ops.at(-1)).toBe("insert google_usage");
  });

  it("adresse refusée : le motif et le message du contrat, rien n'est écrit ni compté", async () => {
    const handle = memoryDb();
    const refused = async (url: string, reason: keyof typeof EXTERNAL_URL_ERRORS, site: Site = SITE) => {
      expect(await begin(handle, { url }, site)).toEqual({ ok: false, reason: "url", message: EXTERNAL_URL_ERRORS[reason] });
    };
    await refused("", "empty");
    await refused("pas une adresse", "invalid");
    await refused("ftp://cabinet-dupont.fr", "scheme");
    await refused("192.168.1.10", "host");
    await refused("https://www.instagram.com/claire.sophro", "social");
    await refused("https://www.doctolib.fr/sophrologue/albi/claire-dupont", "directory");
    // Le site hébergé lui-même : hôte de base des sites, hôte de démonstration, studio, domaine du site
    await refused("https://demo.harmony-web.fr/claire-dupont-sophrologue-albi", "own");
    await refused("sites.harmony-web.fr", "own");
    await refused("app.harmony-web.fr", "own");
    await refused("www.claire-dupont.fr", "own", { ...SITE, domain: "claire-dupont.fr" });
    expect(handle.log).toEqual([]);
    // Le domaine d'un autre site hébergé n'est pas celui de ce site
    expect(await begin(handle, { url: "www.claire-dupont.fr" })).toEqual({ ok: true });
  });

  it("consentement exigé : sans lui, rien n'est écrit ; l'adresse est vérifiée d'abord", async () => {
    const handle = memoryDb();
    const refusal = await begin(handle, { consent: false });
    expect(refusal).toMatchObject({ ok: false, reason: "consent" });
    expect(refusal.ok === false && refusal.message).toMatch(/autorisez sa lecture/);
    expect(await beginExternalSiteRead(handle.db, SITE, { url: "www.cabinet-dupont.fr", consent: "oui" as unknown as boolean }, { now: NOW, env: ENV })).toMatchObject({ ok: false, reason: "consent" });
    expect(await begin(handle, { url: "", consent: false })).toMatchObject({ ok: false, reason: "url" });
    expect(handle.log).toEqual([]);
  });

  it("lecture déjà en cours : `busy`, rien ne change ni n'est compté — même quota atteint", async () => {
    const reading = readingRow();
    const handle = memoryDb({ external: [reading], usage: Array.from({ length: 6 }, () => usageRow()) });
    const refusal = await begin(handle);
    expect(refusal).toMatchObject({ ok: false, reason: "busy" });
    expect(refusal.ok === false && refusal.message).toMatch(/déjà en cours/);
    expect(external(handle)).toEqual(reading);
    expect(handle.rows(googleUsage)).toHaveLength(6);
  });

  it("lecture interrompue (commencée depuis plus de readStaleMs) : elle n'empêche pas de recommencer", async () => {
    const handle = memoryDb({ external: [readingRow({ readStartedAt: new Date(NOW.getTime() - EXTERNAL_SITE_LIMITS.readStaleMs) })] });
    expect(await begin(handle)).toEqual({ ok: true });
    expect(external(handle)).toMatchObject({ status: "reading", readStartedAt: NOW });
    expect(handle.rows(googleUsage)).toHaveLength(1);
  });

  it("quota mensuel atteint : `quota` et le message du contrat, rien ne change ; le mois suivant, la lecture repart", async () => {
    const ready = externalRow();
    const handle = memoryDb({ external: [ready], usage: Array.from({ length: EXTERNAL_SITE_LIMITS.readsPerMonth }, () => usageRow()) });
    expect(await begin(handle)).toEqual({ ok: false, reason: "quota", message: `${EXTERNAL_READ_ERRORS.quota.title}. ${EXTERNAL_READ_ERRORS.quota.hint}` });
    expect(external(handle)).toEqual(ready);
    expect(handle.rows(googleUsage)).toHaveLength(6);
    expect(await beginExternalSiteRead(handle.db, SITE, { url: SITE_URL, consent: true }, { now: new Date("2026-12-01T08:00:00Z"), env: ENV })).toEqual({ ok: true });
  });

  it("quota : la dernière lecture du mois passe ; celles d'un autre mois, d'un autre site ou d'un autre type ne comptent pas", async () => {
    const others = [usageRow({ month: "2026-10" }), usageRow({ siteId: OTHER_SITE_ID }), usageRow({ kind: "scan", costUsd: 0.1 }), usageRow({ kind: "social_regen" })];
    const handle = memoryDb({ usage: [...Array.from({ length: 5 }, () => usageRow()), ...others] });
    expect(await begin(handle)).toEqual({ ok: true });
    expect(await externalReadsUsed(handle.db, SITE_ID, NOW)).toBe(6);
    handle.patch(externalSites, { status: "ready" });
    expect(await begin(handle)).toMatchObject({ ok: false, reason: "quota" });
  });

  it("les lectures ne pèsent jamais sur le budget Google du site (coût nul)", async () => {
    const handle = memoryDb({ usage: [usageRow({ kind: "scan", costUsd: 0.25 })] });
    for (let i = 0; i < 3; i++) {
      expect(await begin(handle)).toEqual({ ok: true });
      handle.patch(externalSites, { status: "ready" });
    }
    expect(handle.rows(googleUsage).filter((row) => row.kind === EXTERNAL_READ_USAGE_KIND).map((row) => row.costUsd)).toEqual([0, 0, 0]);
    expect(await monthlyGoogleSpendUsd(handle.db, SITE_ID, NOW)).toBe(0.25);
  });

  it("deux envois simultanés : un seul passe, l'autre répond `busy`, une seule lecture est comptée", async () => {
    const handle = memoryDb();
    const results = await Promise.all([begin(handle), begin(handle)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ reason: "busy" });
    expect(handle.rows(externalSites)).toHaveLength(1);
    expect(handle.rows(googleUsage)).toHaveLength(1);
    expect(handle.locks).toEqual([LOCK_KEY, LOCK_KEY]);
  });

  it("relire le même site : ce qui a été lu, son origine, les corrections et la clé de mesure restent ; l'échec précédent est effacé", async () => {
    const overrides = { headline: "Ma présentation corrigée" };
    // Site prêt dont la dernière relecture avait échoué ; son contenu vient d'un texte collé
    const before = externalRow({ source: "pasted", error: "timeout", errorDetail: "délai dépassé", overrides, checkedAt: daysAgo(1) });
    const handle = memoryDb({ external: [before] });
    expect(await begin(handle)).toEqual({ ok: true });
    // `source` dit toujours d'où vient ce qui est enregistré : elle ne change que lorsqu'une lecture aboutit
    expect(external(handle)).toEqual({ ...before, status: "reading", readStartedAt: NOW, consentAt: NOW, error: null, errorDetail: null, updatedAt: NOW });
  });

  it("pendant la relecture d'un site actif, les outils gardent le profil précédent comme référence", async () => {
    const overrides = { headline: "Ma présentation corrigée" };
    const handle = memoryDb({ external: [externalRow({ overrides })], sites: [activeSiteRow()] });
    const site = { id: SITE_ID, theme: themeWith(ACTIVE) };
    const before = await loadExternalReference(handle.db, site);
    expect(before).toMatchObject({ profile: { ...PROFILE, ...overrides }, facts: FACTS });
    expect(await begin(handle)).toEqual({ ok: true });
    expect(external(handle)).toMatchObject({ status: "reading", readStartedAt: NOW });
    expect(await loadExternalReference(handle.db, site)).toEqual(before);
    expect(themeOf(handle)).toEqual(themeWith(ACTIVE));
    const state = await loadExternalSite(handle.db, site, NOW);
    expect(state.available && state.site).toMatchObject({ status: "reading", reading: true, active: true, usable: true, readAt: daysAgo(3) });
  });

  it("variante « www. » de la même adresse : le même site — rien n'est effacé, l'adresse saisie est retenue et le réglage la suit sans s'éteindre", async () => {
    const overrides = { headline: "Ma présentation corrigée" };
    const handle = memoryDb({ external: [externalRow({ overrides })], sites: [activeSiteRow()] });
    expect(await begin(handle, { url: "cabinet-dupont.fr" })).toEqual({ ok: true });
    expect(external(handle)).toMatchObject({ url: BARE_URL, status: "reading", pages: PAGES, profile: PROFILE, overrides, readAt: daysAgo(3), measureKey: MEASURE_KEY, measureSeenAt: daysAgo(2) });
    expect(themeOf(handle)).toEqual(themeWith({ url: BARE_URL, active: true }));
  });

  it("changement de site : pages, faits, profil, corrections et dates effacés ; la clé de mesure reste", async () => {
    const handle = memoryDb({ external: [externalRow({ overrides: { headline: "Corrigé" }, checkedAt: daysAgo(1), source: "pasted" })] });
    expect(await begin(handle, { url: "www.sophrologie-albi.fr" })).toEqual({ ok: true });
    expect(external(handle)).toMatchObject({
      url: OTHER_URL,
      status: "reading",
      source: "crawl",
      readStartedAt: NOW,
      consentAt: NOW,
      pages: [],
      facts: null,
      profile: null,
      overrides: null,
      contentHash: null,
      readAt: null,
      checkedAt: null,
      measureSeenAt: null,
      measureKey: MEASURE_KEY,
    });
    expect(handle.rows(externalSites)).toHaveLength(1);
    // Sans réglage, aucun n'est créé
    expect(themeOf(handle)).toEqual(THEME);
  });

  it("changement de chemin sur le même hôte : un autre site (plateformes où chaque site vit sous un chemin)", async () => {
    const handle = memoryDb({ external: [externalRow({ url: "https://sites.google.com/view/cabinet-dupont", overrides: { headline: "Corrigé" } })] });
    expect(await begin(handle, { url: "https://sites.google.com/view/autre-cabinet/" })).toEqual({ ok: true });
    expect(external(handle)).toMatchObject({ url: "https://sites.google.com/view/autre-cabinet", profile: null, overrides: null, measureKey: MEASURE_KEY });
  });

  it("changement de site alors que les outils s'appuyaient sur l'ancien : le réglage suit l'adresse et s'éteint, sous verrou de la ligne du site", async () => {
    const theme = themeWith({ ...ACTIVE, keepHostedIndexed: true }, { social: { instagram: "https://www.instagram.com/claire" } });
    const handle = memoryDb({ external: [externalRow()], sites: [siteRow({ theme })] });
    expect(await begin(handle, { url: OTHER_URL })).toEqual({ ok: true });
    // Les autres réglages du thème, et le choix « garder le site hébergé visible », sont conservés
    expect(themeOf(handle)).toEqual({ ...theme, externalSite: { url: OTHER_URL, active: false, keepHostedIndexed: true } });
    expect(siteOf(handle).updatedAt).toEqual(NOW);
    const locked = handle.log.findIndex((entry) => entry.op === "select" && entry.table === "sites" && entry.forUpdate);
    const written = handle.log.findIndex((entry) => entry.op === "update" && entry.table === "sites");
    expect(locked).toBeGreaterThan(-1);
    expect(written).toBeGreaterThan(locked);
    expect(writesOutsideTx(handle, sites)).toEqual([]);
  });

  it("première lecture alors qu'un réglage subsiste d'une connexion antérieure : il suit l'adresse et attend une nouvelle activation", async () => {
    const handle = memoryDb({ sites: [activeSiteRow()] });
    expect(await begin(handle, { url: OTHER_URL })).toEqual({ ok: true });
    expect(themeOf(handle)).toEqual(themeWith({ url: OTHER_URL, active: false }));
  });

  it("table absente : `unavailable`, sans erreur ; toute autre erreur de base est levée", async () => {
    const refusal = await begin(memoryDb({}, { fail: missing(externalSites) }));
    expect(refusal).toMatchObject({ ok: false, reason: "unavailable" });
    expect(refusal.ok === false && refusal.message).toMatch(/en cours d'activation/);
    await expect(begin(memoryDb({}, { fail: connectionLost }))).rejects.toThrow("connection terminated");
  });

  it("le quota ne peut pas être inscrit : la transaction est annulée, le site ne reste pas en « lecture en cours »", async () => {
    const before = externalRow({ overrides: { headline: "Corrigé" } });
    const handle = memoryDb({ external: [before], sites: [activeSiteRow()] }, { fail: (op, table) => (op === "insert" && table === googleUsage ? new Error("disque plein") : null) });
    await expect(begin(handle, { url: OTHER_URL })).rejects.toThrow("disque plein");
    expect(external(handle)).toEqual(before);
    expect(themeOf(handle)).toEqual(themeWith(ACTIVE));
    expect(handle.rows(googleUsage)).toEqual([]);
  });
});

describe("runExternalSiteRead", () => {
  const run = (handle: MemoryDb, reader: WebsiteReader, extractor: ExternalProfileExtractor, siteId = SITE_ID) => runExternalSiteRead(handle.db, siteId, { reader, extractor, now: NOW, env: ENV });

  it("lecture aboutie : pages, faits, profil, empreinte et date enregistrés, site « prêt »", async () => {
    const handle = memoryDb({ external: [readingRow()] });
    const { reader, calls: reads } = fakeReader();
    const { extractor, calls: extractions } = fakeExtractor();
    await expect(run(handle, reader, extractor)).resolves.toBeUndefined();
    expect(reads.map((call) => [call.url, call.opts])).toEqual([[SITE_URL, { deadlineMs: EXTERNAL_READ_DEADLINE_MS }]]);
    expect(extractions.map((call) => call.input)).toEqual([{ url: SITE_URL, pages: PAGES, facts: FACTS, practitioner: { name: "Claire Dupont", profession: "Sophrologue", city: "Albi" } }]);
    expect(external(handle)).toMatchObject({
      url: SITE_URL,
      status: "ready",
      source: "crawl",
      error: null,
      errorDetail: null,
      pages: PAGES,
      facts: FACTS,
      profile: PROFILE,
      contentHash: externalContentHash(PAGES, FACTS),
      readAt: NOW,
      updatedAt: NOW,
      readStartedAt: minutesAgo(1),
      measureKey: MEASURE_KEY,
    });
    // La lecture elle-même ne compte rien : le quota a été inscrit au lancement
    expect(handle.rows(googleUsage)).toEqual([]);
    expect(themeOf(handle)).toEqual(THEME);
  });

  it("la lecture et l'extraction sont rattachées à { feature: \"client_site\", siteId } au registre des appels, puis le contexte d'origine revient", async () => {
    const handle = memoryDb({ external: [readingRow()] });
    const { reader, calls: reads } = fakeReader();
    const { extractor, calls: extractions } = fakeExtractor();
    await run(handle, reader, extractor);
    expect(reads.map((call) => call.context)).toEqual([{ feature: "client_site", siteId: SITE_ID }]);
    expect(extractions.map((call) => call.context)).toEqual([{ feature: "client_site", siteId: SITE_ID }]);
    expect(currentApiUsageContext()).toEqual({});
  });

  it("sans lecteur ni extracteur injectés : ceux de l'environnement donné sont créés", async () => {
    const handle = memoryDb({ external: [readingRow()] });
    const { reader, calls: reads } = fakeReader();
    const { extractor, calls: extractions } = fakeExtractor();
    factories.createWebsiteReader.mockReturnValueOnce(reader);
    factories.createExternalProfileExtractor.mockReturnValueOnce(extractor);
    await runExternalSiteRead(handle.db, SITE_ID, { now: NOW, env: ENV });
    expect(factories.createWebsiteReader).toHaveBeenCalledExactlyOnceWith(ENV);
    expect(factories.createExternalProfileExtractor).toHaveBeenCalledExactlyOnceWith(ENV);
    expect(reads).toHaveLength(1);
    expect(extractions).toHaveLength(1);
    expect(external(handle)).toMatchObject({ status: "ready", profile: PROFILE });
  });

  it("relecture du même site : ce qui avait été lu est remplacé, les corrections du praticien ne sont pas touchées", async () => {
    const overrides = { headline: "Ma présentation corrigée", specialties: [PROFILE.specialties[1]!] };
    // Le contenu précédent venait d'un texte collé : une lecture du site aboutie en change l'origine
    const handle = memoryDb({ external: [rereadingRow({ overrides, source: "pasted" })] });
    const pages = [page("/", "home", "Accueil", `${HOME_TEXT} Nouveau paragraphe.`)];
    const facts = { ...FACTS, tags: {} };
    const profile = { ...PROFILE, headline: "Nouvelle accroche du site" };
    await run(handle, fakeReader(() => okRead({ pages, facts })).reader, fakeExtractor(() => profile).extractor);
    expect(external(handle)).toMatchObject({ status: "ready", source: "crawl", error: null, pages, facts, profile, overrides, contentHash: externalContentHash(pages, facts), readAt: NOW });
  });

  it("première lecture au profil encore incomplet : enregistrée « prêt » quand même, le praticien le complète à la main", async () => {
    const handle = memoryDb({ external: [readingRow()] });
    await run(handle, fakeReader().reader, fakeExtractor(() => EMPTY_EXTERNAL_PROFILE).extractor);
    expect(external(handle)).toMatchObject({ status: "ready", error: null, profile: EMPTY_EXTERNAL_PROFILE, pages: PAGES, readAt: NOW });
    // De même après une première lecture en échec : rien d'exploitable n'était enregistré
    const retried = memoryDb({ external: [readingRow({ error: null })] });
    await run(retried, fakeReader().reader, fakeExtractor(() => PARTIAL).extractor);
    expect(external(retried)).toMatchObject({ status: "ready", error: null, profile: PARTIAL });
  });

  it("relecture qui ramène un profil inexploitable alors que le précédent l'était : écartée comme un échec `empty`, la lecture précédente reste", async () => {
    for (const thin of [EMPTY_EXTERNAL_PROFILE, PARTIAL, { ...PROFILE, headline: "", intro: [], about: { paragraphs: [], credentials: [] } }]) {
      const before = rereadingRow();
      const handle = memoryDb({ external: [before], sites: [activeSiteRow()] });
      const { extractor, calls } = fakeExtractor(() => thin);
      const newPages = [page("/", "home", "Site en travaux", HOME_TEXT.repeat(2))];
      await expect(run(handle, fakeReader(() => okRead({ url: BARE_URL, pages: newPages, facts: { ...FACTS, tags: {} } })).reader, extractor)).resolves.toBeUndefined();
      expect(calls).toHaveLength(1);
      // Pages, faits, profil, adresse et empreinte : ceux de la lecture précédente
      expect(external(handle)).toEqual({ ...before, status: "ready", error: "empty", errorDetail: expect.stringMatching(/^Profil lu inexploitable, il manque : /), updatedAt: NOW });
      expect(themeOf(handle)).toEqual(themeWith(ACTIVE));
      const site = { id: SITE_ID, theme: themeOf(handle) };
      expect(await loadExternalReference(handle.db, site)).toMatchObject({ profile: PROFILE, facts: FACTS });
      const state = await loadExternalSite(handle.db, site, NOW);
      expect(state.available && state.site).toMatchObject({ status: "ready", error: "empty", readAt: daysAgo(3), usable: true, extracted: PROFILE });
    }
    expect(logs.warn).toHaveBeenCalledWith(`[site-client] lecture du site ${SITE_ID} en échec : empty (lecture précédente conservée)`);
  });

  it("le profil précédent n'était pas exploitable non plus : la relecture est enregistrée, comme une première lecture", async () => {
    const handle = memoryDb({ external: [rereadingRow({ profile: PARTIAL })] });
    await run(handle, fakeReader().reader, fakeExtractor(() => EMPTY_EXTERNAL_PROFILE).extractor);
    expect(external(handle)).toMatchObject({ status: "ready", error: null, profile: EMPTY_EXTERNAL_PROFILE, readAt: NOW });
    // Avec des corrections qui suffisent à elles seules, rien d'exploitable n'est perdu non plus
    const overrides = { headline: "Sophrologie à Albi", specialties: PROFILE.specialties };
    const corrected = memoryDb({ external: [rereadingRow({ profile: PARTIAL, overrides })], sites: [activeSiteRow()] });
    await run(corrected, fakeReader().reader, fakeExtractor(() => EMPTY_EXTERNAL_PROFILE).extractor);
    expect(external(corrected)).toMatchObject({ status: "ready", error: null, profile: EMPTY_EXTERNAL_PROFILE, overrides, readAt: NOW });
    expect(await loadExternalReference(corrected.db, { id: SITE_ID, theme: themeOf(corrected) })).not.toBeNull();
  });

  it("le profil effectif (lu puis corrigé) ne doit pas cesser d'être exploitable : la relecture qui le ferait est écartée aussi", async () => {
    // Présentation lue sur le site, spécialités saisies par le praticien : ensemble, un profil exploitable
    const overrides = { specialties: PROFILE.specialties };
    const before = rereadingRow({ profile: PARTIAL, overrides });
    const handle = memoryDb({ external: [before], sites: [activeSiteRow()] });
    await run(handle, fakeReader().reader, fakeExtractor(() => EMPTY_EXTERNAL_PROFILE).extractor);
    expect(external(handle)).toEqual({ ...before, status: "ready", error: "empty", errorDetail: "Profil lu inexploitable, il manque : une présentation de votre activité, au moins une spécialité", updatedAt: NOW });
    expect(await loadExternalReference(handle.db, { id: SITE_ID, theme: themeOf(handle) })).toMatchObject({ profile: { ...PARTIAL, ...overrides } });
    // Corrections qui suffisent à elles seules : le profil lu sur le site, exploitable, n'est pas remplacé par un profil vide pour autant
    const rich = rereadingRow({ overrides: { headline: "Sophrologie à Albi", specialties: PROFILE.specialties } });
    const kept = memoryDb({ external: [rich] });
    await run(kept, fakeReader().reader, fakeExtractor(() => EMPTY_EXTERNAL_PROFILE).extractor);
    expect(external(kept)).toMatchObject({ status: "ready", error: "empty", profile: PROFILE, readAt: daysAgo(3) });
  });

  it("le profil est nettoyé avant d'être enregistré, quel que soit l'extracteur", async () => {
    const handle = memoryDb({ external: [readingRow()] });
    const dirty = {
      ...PROFILE,
      // Balises, espaces multiples, caractère invisible (U+200B) et longueur hors bornes
      headline: `<b>Sophrologie</b>   à Albi${String.fromCharCode(0x200b)} ${"très ".repeat(60)}`,
      specialties: [
        { ...PROFILE.specialties[0]!, slug: "Gestion du Stress !", url: "https://autre-site.fr/stress" },
        { ...PROFILE.specialties[1]!, title: "<script>alert(1)</script>Sommeil" },
      ],
      bookingUrl: "javascript:alert(1)",
      inconnu: "champ en trop",
    } as unknown as ExternalSiteProfile;
    await run(handle, fakeReader().reader, fakeExtractor(() => dirty).extractor);
    const stored = external(handle)!.profile as ExternalSiteProfile;
    expect(stored).toEqual(cleanExternalProfile(dirty, SITE_URL));
    expect(stored.headline.startsWith("Sophrologie à Albi très")).toBe(true);
    expect(stored.headline.length).toBeLessThanOrEqual(141);
    expect(stored.specialties.map((s) => [s.slug, s.title, s.url])).toEqual([
      ["gestion-du-stress", "Gestion du stress", undefined],
      ["sommeil", "alert(1) Sommeil", undefined],
    ]);
    expect(stored.bookingUrl).toBeUndefined();
    expect(stored).not.toHaveProperty("inconnu");
  });

  it("échec de lecture : état « erreur », code du contrat et détail technique court ; l'extracteur n'est pas appelé", async () => {
    for (const error of ["unreachable", "timeout", "blocked", "robots", "not_html", "empty", "redirect", "unsafe", "too_large"] as const) {
      const handle = memoryDb({ external: [readingRow()] });
      const { extractor, calls } = fakeExtractor();
      await expect(run(handle, fakeReader(() => ({ ok: false, error, detail: "HTTP 403\n  (Cloudflare)" })).reader, extractor)).resolves.toBeUndefined();
      expect(external(handle)).toMatchObject({ status: "error", error, errorDetail: "HTTP 403 (Cloudflare)", updatedAt: NOW, readAt: null, profile: null });
      expect(calls).toEqual([]);
    }
  });

  it("échec sans détail, détail trop long, code inconnu du contrat", async () => {
    const bare = memoryDb({ external: [readingRow()] });
    await run(bare, fakeReader(() => ({ ok: false, error: "timeout" })).reader, fakeExtractor().extractor);
    expect(external(bare)).toMatchObject({ status: "error", error: "timeout", errorDetail: null });

    const long = memoryDb({ external: [readingRow()] });
    await run(long, fakeReader(() => ({ ok: false, error: "blocked", detail: "x".repeat(2_000) })).reader, fakeExtractor().extractor);
    expect((external(long)!.errorDetail as string).length).toBe(300);

    const unknown = memoryDb({ external: [readingRow()] });
    await run(unknown, fakeReader(() => ({ ok: false, error: "captcha" }) as unknown as ExternalReadOutcome).reader, fakeExtractor().extractor);
    expect(external(unknown)).toMatchObject({ status: "error", error: "internal" });
  });

  it("relecture en échec d'un site déjà lu : pages, faits, profil et corrections restent, le site redevient « prêt » et l'échec est gardé pour l'écran", async () => {
    const before = rereadingRow({ overrides: { headline: "Corrigé" } });
    const handle = memoryDb({ external: [before], sites: [activeSiteRow()] });
    const { extractor, calls } = fakeExtractor();
    await expect(run(handle, fakeReader(() => ({ ok: false, error: "unreachable", detail: "ENOTFOUND" })).reader, extractor)).resolves.toBeUndefined();
    expect(external(handle)).toEqual({ ...before, status: "ready", error: "unreachable", errorDetail: "ENOTFOUND", updatedAt: NOW });
    expect(calls).toEqual([]);
    // Les outils n'ont rien perdu : la lecture précédente reste leur référence
    const site = { id: SITE_ID, theme: themeOf(handle) };
    expect(await loadExternalReference(handle.db, site)).toMatchObject({ profile: { ...PROFILE, headline: "Corrigé" }, facts: FACTS });
    const state = await loadExternalSite(handle.db, site, NOW);
    expect(state.available && state.site).toMatchObject({ status: "ready", reading: false, error: "unreachable", readAt: daysAgo(3), active: true, usable: true });
    expect(logs.warn).toHaveBeenCalledWith(`[site-client] lecture du site ${SITE_ID} en échec : unreachable (lecture précédente conservée)`);
  });

  it("relecture en échec, quelle qu'en soit la cause (trop peu de texte, lecteur ou extracteur qui lève) : toujours « prêt », l'origine du contenu ne change pas", async () => {
    const cases: [WebsiteReader, ExternalProfileExtractor, string, string | null][] = [
      [fakeReader(() => okRead({ pages: [page("/", "home", "Maintenance", "Site en maintenance.")] })).reader, fakeExtractor().extractor, "empty", "1 page(s), 20 caractère(s)"],
      [{ mode: "live", read: () => Promise.reject(new TypeError("fetch failed")) }, fakeExtractor().extractor, "internal", "fetch failed"],
      [fakeReader().reader, fakeExtractor(() => Promise.reject(new Error("529 overloaded"))).extractor, "internal", "529 overloaded"],
      [fakeReader(() => ({ ok: false, error: "captcha" }) as unknown as ExternalReadOutcome).reader, fakeExtractor().extractor, "internal", null],
    ];
    for (const [reader, extractor, error, errorDetail] of cases) {
      // Contenu précédent venu d'un texte collé : une lecture du site ratée ne le fait pas passer pour des pages lues
      const before = rereadingRow({ source: "pasted", overrides: { headline: "Corrigé" } });
      const handle = memoryDb({ external: [before] });
      await expect(run(handle, reader, extractor)).resolves.toBeUndefined();
      expect(external(handle)).toEqual({ ...before, status: "ready", source: "pasted", error, errorDetail, updatedAt: NOW });
    }
  });

  it("une relecture aboutie efface l'échec de la précédente", async () => {
    const handle = memoryDb({ external: [rereadingRow()], sites: [activeSiteRow()] });
    await run(handle, fakeReader(() => ({ ok: false, error: "timeout", detail: "délai dépassé" })).reader, fakeExtractor().extractor);
    expect(external(handle)).toMatchObject({ status: "ready", error: "timeout", errorDetail: "délai dépassé", readAt: daysAgo(3) });
    // Nouvelle tentative du praticien, qui aboutit
    expect(await beginExternalSiteRead(handle.db, SITE, { url: SITE_URL, consent: true }, { now: NOW, env: ENV })).toEqual({ ok: true });
    const profile = { ...PROFILE, headline: "Nouvelle accroche du site" };
    await run(handle, fakeReader().reader, fakeExtractor(() => profile).extractor);
    expect(external(handle)).toMatchObject({ status: "ready", error: null, errorDetail: null, profile, readAt: NOW });
    const state = await loadExternalSite(handle.db, { id: SITE_ID, theme: themeOf(handle) }, NOW);
    expect(state.available && state.site).toMatchObject({ status: "ready", error: null, readAt: NOW });
  });

  it("trop peu de texte pour tenter un profil : `empty`, sans appel à l'extracteur", async () => {
    const short = [page("/", "home", "Accueil", "Bienvenue sur mon site.")];
    const handle = memoryDb({ external: [readingRow()] });
    const { extractor, calls } = fakeExtractor();
    await run(handle, fakeReader(() => okRead({ pages: short })).reader, extractor);
    expect(external(handle)).toMatchObject({ status: "error", error: "empty", errorDetail: "1 page(s), 23 caractère(s)", pages: [] });
    expect(calls).toEqual([]);
    const none = memoryDb({ external: [readingRow()] });
    await run(none, fakeReader(() => okRead({ pages: [] })).reader, extractor);
    expect(external(none)).toMatchObject({ status: "error", error: "empty" });
    // Juste assez de texte, toutes pages confondues : le profil est tenté
    const enough = memoryDb({ external: [readingRow()] });
    const half = "a".repeat(EXTERNAL_SITE_LIMITS.minChars / 2);
    await run(enough, fakeReader(() => okRead({ pages: [page("/", "home", "Accueil", half), page("/a", "about", "À propos", half)] })).reader, extractor);
    expect(external(enough)).toMatchObject({ status: "ready" });
  });

  it("le lecteur ou l'extracteur lève : `internal`, jamais d'exception, jamais de site laissé en « lecture en cours »", async () => {
    const thrown = memoryDb({ external: [readingRow()] });
    const failing: WebsiteReader = { mode: "live", read: async () => Promise.reject(new TypeError("fetch failed pour contact@cabinet-dupont.fr")) };
    await expect(run(thrown, failing, fakeExtractor().extractor)).resolves.toBeUndefined();
    expect(external(thrown)).toMatchObject({ status: "error", error: "internal", errorDetail: "fetch failed pour [adresse masquée]" });

    const extraction = memoryDb({ external: [readingRow()] });
    await expect(run(extraction, fakeReader().reader, fakeExtractor(() => Promise.reject(new Error("529 overloaded"))).extractor)).resolves.toBeUndefined();
    expect(external(extraction)).toMatchObject({ status: "error", error: "internal", errorDetail: "529 overloaded", pages: [], profile: null });

    // Fabriques indisponibles (clé absente, module en panne) : même issue
    const noReader = memoryDb({ external: [readingRow()] });
    await expect(runExternalSiteRead(noReader.db, SITE_ID, { now: NOW, env: ENV })).resolves.toBeUndefined();
    expect(external(noReader)).toMatchObject({ status: "error", error: "internal", errorDetail: "Lecteur réel interdit dans les tests" });
    const noExtractor = memoryDb({ external: [readingRow()] });
    await expect(runExternalSiteRead(noExtractor.db, SITE_ID, { reader: fakeReader().reader, now: NOW, env: ENV })).resolves.toBeUndefined();
    expect(external(noExtractor)).toMatchObject({ status: "error", error: "internal", errorDetail: "Extracteur réel interdit dans les tests" });
  });

  it("l'enregistrement du résultat échoue : l'échec est inscrit ; si la base ne répond plus du tout, rien n'est levé", async () => {
    const handle = memoryDb({ external: [readingRow()] });
    let failed = false;
    // La première écriture du résultat échoue, la suivante (l'inscription de l'échec) passe
    handle.failWith((op, table) => {
      if (op !== "update" || table !== externalSites || failed) return null;
      failed = true;
      return new Error("deadlock detected");
    });
    await expect(run(handle, fakeReader().reader, fakeExtractor().extractor)).resolves.toBeUndefined();
    expect(external(handle)).toMatchObject({ status: "error", error: "internal", errorDetail: "deadlock detected", pages: [] });

    const down = memoryDb({ external: [readingRow()] });
    const { reader } = fakeReader(() => {
      down.failWith(connectionLost);
      return okRead();
    });
    await expect(run(down, reader, fakeExtractor().extractor)).resolves.toBeUndefined();
    down.failWith(undefined);
    expect(external(down)).toMatchObject({ status: "reading" });
    expect(logs.error).toHaveBeenCalled();
  });

  it("rien à lire : pas de ligne, site déjà prêt ou en erreur, début de lecture inconnu — le lecteur n'est pas appelé", async () => {
    for (const seed of [[], [externalRow()], [externalRow({ error: "timeout" })], [readingRow({ status: "error", error: "blocked" })], [readingRow({ readStartedAt: null })], [readingRow({ siteId: OTHER_SITE_ID })]]) {
      const handle = memoryDb({ external: seed });
      const { reader, calls } = fakeReader();
      await expect(run(handle, reader, fakeExtractor().extractor)).resolves.toBeUndefined();
      expect(calls).toEqual([]);
      expect(handle.rows(externalSites)).toEqual(seed);
    }
  });

  it("table absente ou base injoignable dès la première requête : rien n'est levé", async () => {
    const { reader, calls } = fakeReader();
    await expect(run(memoryDb({}, { fail: missing(externalSites) }), reader, fakeExtractor().extractor)).resolves.toBeUndefined();
    await expect(run(memoryDb({}, { fail: connectionLost }), reader, fakeExtractor().extractor)).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("le site répond sur l'autre variante « www. » : l'adresse servie est retenue, le réglage du site la suit s'il existe", async () => {
    const handle = memoryDb({ external: [readingRow()], sites: [siteRow({ theme: themeWith({ url: SITE_URL, active: false, keepHostedIndexed: true }) })] });
    const { extractor, calls } = fakeExtractor();
    await run(handle, fakeReader(() => okRead({ url: `${BARE_URL}/` })).reader, extractor);
    expect(external(handle)).toMatchObject({ url: BARE_URL, status: "ready" });
    expect(calls[0]!.input.url).toBe(BARE_URL);
    expect(themeOf(handle)).toEqual(themeWith({ url: BARE_URL, active: false, keepHostedIndexed: true }));
    expect(handle.log.some((entry) => entry.table === "sites" && entry.forUpdate && entry.tx)).toBe(true);
    expect(writesOutsideTx(handle, sites)).toEqual([]);

    // Sans réglage : aucun n'est créé
    const bare = memoryDb({ external: [readingRow({ url: BARE_URL })] });
    await run(bare, fakeReader(() => okRead({ url: SITE_URL })).reader, fakeExtractor().extractor);
    expect(external(bare)).toMatchObject({ url: SITE_URL, status: "ready" });
    expect(themeOf(bare)).toEqual(THEME);
    // Adresse servie identique : la ligne du site n'est même pas verrouillée
    const same = memoryDb({ external: [readingRow()], sites: [activeSiteRow()] });
    await run(same, fakeReader().reader, fakeExtractor().extractor);
    expect(same.count("select", sites)).toBe(1);
    expect(same.log.some((entry) => entry.forUpdate)).toBe(false);
  });

  it("adresse servie : le chemin donné par le praticien est gardé ; une redirection interne, un autre hôte ou le site hébergé ne changent rien", async () => {
    const final = async (rowUrl: string, served: string) => {
      const handle = memoryDb({ external: [readingRow({ url: rowUrl })] });
      await run(handle, fakeReader(() => okRead({ url: served })).reader, fakeExtractor().extractor);
      expect(external(handle)).toMatchObject({ status: "ready" });
      return external(handle)!.url;
    };
    expect(await final(`${BARE_URL}/sophrologie`, `${SITE_URL}/sophrologie/`)).toBe(`${SITE_URL}/sophrologie`);
    expect(await final(BARE_URL, `${SITE_URL}/accueil`)).toBe(SITE_URL);
    expect(await final(SITE_URL, `${SITE_URL}/fr/`)).toBe(SITE_URL);
    expect(await final("https://sites.google.com/view/cabinet-dupont", "https://sites.google.com/view/cabinet-dupont/accueil")).toBe("https://sites.google.com/view/cabinet-dupont");
    expect(await final(SITE_URL, "https://autre-site.fr/")).toBe(SITE_URL);
    expect(await final(SITE_URL, "https://demo.harmony-web.fr/claire-dupont-sophrologue-albi")).toBe(SITE_URL);
    expect(await final(SITE_URL, "")).toBe(SITE_URL);
  });

  it("une autre lecture a commencé pendant celle-ci (adresse changée) : son résultat n'est pas inscrit", async () => {
    const handle = memoryDb({ external: [readingRow()] });
    const restarted = { url: OTHER_URL, readStartedAt: NOW, pages: [], profile: null };
    const { reader } = fakeReader(() => {
      handle.patch(externalSites, restarted);
      return okRead();
    });
    await expect(run(handle, reader, fakeExtractor().extractor)).resolves.toBeUndefined();
    expect(external(handle)).toMatchObject({ ...restarted, status: "reading", readAt: null, facts: null });

    // De même pour un échec tardif : il ne marque pas la nouvelle lecture
    const failed = memoryDb({ external: [readingRow()] });
    const late = fakeReader(() => {
      failed.patch(externalSites, restarted);
      return { ok: false, error: "timeout" };
    });
    await run(failed, late.reader, fakeExtractor().extractor);
    expect(external(failed)).toMatchObject({ status: "reading", error: null, readStartedAt: NOW });
  });

  it("le site a été déconnecté ou est déjà prêt quand la lecture s'achève : rien n'est écrit", async () => {
    const gone = memoryDb({ external: [readingRow()], sites: [activeSiteRow()] });
    const { reader } = fakeReader(() => {
      gone.clear(externalSites);
      return okRead({ url: BARE_URL });
    });
    await expect(run(gone, reader, fakeExtractor().extractor)).resolves.toBeUndefined();
    expect(gone.rows(externalSites)).toEqual([]);
    expect(themeOf(gone)).toEqual(themeWith(ACTIVE));

    const ready = memoryDb({ external: [readingRow()] });
    const done = { status: "ready", profile: PROFILE, readAt: minutesAgo(0) };
    await run(ready, fakeReader(() => (ready.patch(externalSites, done), okRead({ pages: [page("/", "home", "Autre", HOME_TEXT.repeat(2))] }))).reader, fakeExtractor(() => EMPTY_EXTERNAL_PROFILE).extractor);
    expect(external(ready)).toMatchObject({ ...done, pages: [] });
  });

  it("site sans fiche praticien : l'extracteur ne reçoit rien à son sujet", async () => {
    const handle = memoryDb({ external: [readingRow()], sites: [siteRow({ prospectId: null })] });
    const { extractor, calls } = fakeExtractor();
    await run(handle, fakeReader().reader, extractor);
    expect(calls[0]!.input.practitioner).toBeNull();
    expect(handle.count("select", prospects)).toBe(0);
  });

  it("journaux : l'identifiant du site et le code d'échec, jamais le contenu des pages, une adresse ou un message d'erreur", async () => {
    const handle = memoryDb({ external: [readingRow()] });
    await run(handle, fakeReader(() => ({ ok: false, error: "blocked", detail: `refus pour contact@cabinet-dupont.fr — ${PAGE_SECRET}` })).reader, fakeExtractor().extractor);
    const extraction = memoryDb({ external: [readingRow()] });
    await run(extraction, fakeReader().reader, fakeExtractor(() => Promise.reject(new Error(`réponse illisible : ${PAGE_SECRET} contact@cabinet-dupont.fr`))).extractor);
    expect(logs.warn).toHaveBeenCalledWith(`[site-client] lecture du site ${SITE_ID} en échec : blocked`);
    const text = logged();
    expect(text).toContain(SITE_ID);
    expect(text).not.toContain(PAGE_SECRET);
    expect(text).not.toContain("cabinet-dupont");
    expect(text).not.toContain("Claire");
  });
});

describe("submitExternalSiteText", () => {
  const TEXT = `Je suis sophrologue à Albi. ${"J'accompagne le stress, le sommeil et la préparation aux examens. ".repeat(8)}`;
  const submit = (handle: MemoryDb, input: Partial<{ url: string; text: string; consent: boolean }> = {}, extractor = fakeExtractor().extractor, site: Site = SITE) =>
    submitExternalSiteText(handle.db, site, { url: "www.cabinet-dupont.fr", text: TEXT, consent: true, ...input }, { extractor, now: NOW, env: ENV });

  it("texte collé : pages construites, profil extrait et enregistré dans la foulée, source « pasted », sans quota", async () => {
    const handle = memoryDb();
    const { extractor, calls } = fakeExtractor();
    expect(await submit(handle, { text: `  ${TEXT}\n\n` }, extractor)).toEqual({ ok: true });
    const pages = fakePastedPages(TEXT.trim(), SITE_URL, NOW);
    expect(factories.pastedTextToPages).toHaveBeenCalledExactlyOnceWith(TEXT.trim(), SITE_URL, NOW);
    const facts = { phones: [], emails: [], hours: [], bookingLinks: [], social: {}, tags: {} };
    expect(calls.map((call) => call.input)).toEqual([{ url: SITE_URL, pages, facts, practitioner: { name: "Claire Dupont", profession: "Sophrologue", city: "Albi" } }]);
    expect(calls[0]!.context).toEqual({ feature: "client_site", siteId: SITE_ID });
    const row = external(handle)!;
    expect(row).toMatchObject({ url: SITE_URL, status: "ready", source: "pasted", pages, facts, profile: PROFILE, contentHash: externalContentHash(pages, facts), readAt: NOW, readStartedAt: NOW, consentAt: NOW, error: null });
    expect(row.measureKey).toMatch(EXTERNAL_MEASURE_KEY);
    expect(handle.rows(googleUsage)).toEqual([]);
    // Aucune page n'est demandée au site
    expect(factories.createWebsiteReader).not.toHaveBeenCalled();
    expect(currentApiUsageContext()).toEqual({});
  });

  it("quota de lectures atteint : le texte collé passe quand même", async () => {
    const handle = memoryDb({ external: [externalRow({ status: "error", error: "blocked" })], usage: Array.from({ length: 6 }, () => usageRow()) });
    expect(await submit(handle)).toEqual({ ok: true });
    expect(external(handle)).toMatchObject({ status: "ready", source: "pasted", error: null, errorDetail: null });
    expect(handle.rows(googleUsage)).toHaveLength(6);
  });

  it("refus : adresse, consentement, texte trop court ou trop long — dans cet ordre, sans rien écrire", async () => {
    const handle = memoryDb();
    expect(await submit(handle, { url: "https://www.facebook.com/cabinet" })).toEqual({ ok: false, reason: "url", message: EXTERNAL_URL_ERRORS.social });
    expect(await submit(handle, { url: "", consent: false, text: "" })).toMatchObject({ ok: false, reason: "url" });
    expect(await submit(handle, { consent: false, text: "" })).toMatchObject({ ok: false, reason: "consent" });
    const short = await submit(handle, { text: `${"a".repeat(EXTERNAL_SITE_LIMITS.pastedMinChars - 1)}   \n` });
    expect(short).toMatchObject({ ok: false, reason: "text" });
    expect(short.ok === false && short.message).toMatch(/trop court.*300 caractères/);
    const long = await submit(handle, { text: "a".repeat(EXTERNAL_SITE_LIMITS.pastedMaxChars + 1) });
    expect(long).toMatchObject({ ok: false, reason: "text" });
    expect(long.ok === false && long.message).toMatch(/trop long.*30\s000 caractères/);
    expect(await submit(handle, { text: undefined as unknown as string })).toMatchObject({ ok: false, reason: "text" });
    expect(handle.log).toEqual([]);
    expect(factories.pastedTextToPages).not.toHaveBeenCalled();
  });

  it("bornes du texte : 300 et 30 000 caractères sont acceptés", async () => {
    expect(await submit(memoryDb(), { text: "a".repeat(EXTERNAL_SITE_LIMITS.pastedMinChars) })).toEqual({ ok: true });
    expect(await submit(memoryDb(), { text: "a".repeat(EXTERNAL_SITE_LIMITS.pastedMaxChars) })).toEqual({ ok: true });
  });

  it("texte dont rien d'exploitable ne sort : `text`, l'état du site ne change pas", async () => {
    const before = externalRow();
    const handle = memoryDb({ external: [before] });
    factories.pastedTextToPages.mockReturnValueOnce([]);
    const refusal = await submit(handle);
    expect(refusal).toMatchObject({ ok: false, reason: "text" });
    expect(refusal.ok === false && refusal.message).toMatch(/pas trouvé assez de texte/);
    expect(external(handle)).toEqual(before);
    // La mise en pages elle-même échoue : indisponible, rien ne change non plus
    factories.pastedTextToPages.mockImplementationOnce(() => {
      throw new Error("Lecteur de site : implémentation à venir");
    });
    expect(await submit(handle)).toMatchObject({ ok: false, reason: "unavailable" });
    expect(external(handle)).toEqual(before);
    expect(handle.log.every((entry) => entry.op === "select" || entry.op === "execute")).toBe(true);
  });

  it("lecture en cours : `busy`, rien ne change ; une lecture interrompue n'empêche pas de coller", async () => {
    const reading = readingRow();
    const handle = memoryDb({ external: [reading] });
    const { extractor, calls } = fakeExtractor();
    expect(await submit(handle, {}, extractor)).toMatchObject({ ok: false, reason: "busy" });
    expect(external(handle)).toEqual(reading);
    expect(calls).toEqual([]);
    const stale = memoryDb({ external: [readingRow({ readStartedAt: minutesAgo(7) })] });
    expect(await submit(stale)).toEqual({ ok: true });
    expect(external(stale)).toMatchObject({ status: "ready", source: "pasted" });
  });

  it("deux envois simultanés : un seul est traité", async () => {
    const handle = memoryDb();
    const { extractor, calls } = fakeExtractor();
    const results = await Promise.all([submit(handle, {}, extractor), submit(handle, {}, extractor)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ reason: "busy" });
    expect(calls).toHaveLength(1);
    expect(handle.rows(externalSites)).toHaveLength(1);
    expect(handle.locks.every((key) => key === LOCK_KEY)).toBe(true);
  });

  it("même site : les corrections restent ; autre site : tout repart de zéro, le réglage s'éteint, la clé de mesure reste", async () => {
    const overrides = { headline: "Corrigé" };
    const same = memoryDb({ external: [externalRow({ overrides })], sites: [activeSiteRow()] });
    expect(await submit(same, { url: "cabinet-dupont.fr" })).toEqual({ ok: true });
    expect(external(same)).toMatchObject({ url: BARE_URL, source: "pasted", overrides, measureKey: MEASURE_KEY, measureSeenAt: daysAgo(2) });
    expect(themeOf(same)).toEqual(themeWith({ url: BARE_URL, active: true }));

    const other = memoryDb({ external: [externalRow({ overrides, checkedAt: daysAgo(1) })], sites: [activeSiteRow()] });
    expect(await submit(other, { url: OTHER_URL })).toEqual({ ok: true });
    expect(external(other)).toMatchObject({ url: OTHER_URL, source: "pasted", status: "ready", overrides: null, checkedAt: null, measureSeenAt: null, measureKey: MEASURE_KEY, readAt: NOW });
    expect(themeOf(other)).toEqual(themeWith({ url: OTHER_URL, active: false }));
  });

  it("premier texte au profil incomplet : enregistré « prêt » quand même", async () => {
    const handle = memoryDb();
    expect(await submit(handle, {}, fakeExtractor(() => EMPTY_EXTERNAL_PROFILE).extractor)).toEqual({ ok: true });
    expect(external(handle)).toMatchObject({ status: "ready", profile: EMPTY_EXTERNAL_PROFILE });
    // Site déjà lu mais au profil resté incomplet : le texte le remplace, même incomplet lui aussi
    const partial = memoryDb({ external: [externalRow({ profile: PARTIAL })] });
    expect(await submit(partial, {}, fakeExtractor(() => EMPTY_EXTERNAL_PROFILE).extractor)).toEqual({ ok: true });
    expect(external(partial)).toMatchObject({ status: "ready", source: "pasted", error: null, profile: EMPTY_EXTERNAL_PROFILE, readAt: NOW });
  });

  it("texte collé sur un site déjà lu, trop mince pour un profil exploitable : il ne remplace pas la lecture précédente, l'issue le dit", async () => {
    const before = externalRow({ overrides: { headline: "Corrigé" } });
    const handle = memoryDb({ external: [before], sites: [activeSiteRow()] });
    const refusal = await submit(handle, {}, fakeExtractor(() => PARTIAL).extractor);
    expect(refusal).toMatchObject({ ok: false, reason: "text" });
    expect(refusal.ok === false && refusal.message).toMatch(/votre profil précédent est conservé/);
    // Lecture précédente intacte, toujours lue sur le site ; l'échec `empty` est gardé pour l'écran
    expect(external(handle)).toEqual({ ...before, status: "ready", error: "empty", errorDetail: "Profil lu inexploitable, il manque : au moins une spécialité", readStartedAt: NOW, consentAt: NOW, updatedAt: NOW });
    const site = { id: SITE_ID, theme: themeOf(handle) };
    expect(await loadExternalReference(handle.db, site)).toMatchObject({ profile: { ...PROFILE, headline: "Corrigé" }, facts: FACTS });
    const state = await loadExternalSite(handle.db, site, NOW);
    expect(state.available && state.site).toMatchObject({ status: "ready", error: "empty", source: "crawl", usable: true });
    expect(handle.rows(googleUsage)).toEqual([]);
  });

  it("l'extraction échoue alors que le site avait déjà été lu : l'issue le dit, la lecture précédente et son origine restent, le site reste « prêt »", async () => {
    const before = externalRow({ overrides: { headline: "Corrigé" } });
    const handle = memoryDb({ external: [before], sites: [activeSiteRow()] });
    const refusal = await submit(handle, {}, fakeExtractor(() => Promise.reject(new Error("529 overloaded"))).extractor);
    expect(refusal).toEqual({ ok: false, reason: "unavailable", message: `${EXTERNAL_READ_ERRORS.internal.title}. ${EXTERNAL_READ_ERRORS.internal.hint}` });
    // Contenu lu sur le site : il ne passe pas pour un texte collé parce qu'un collage a échoué
    expect(external(handle)).toEqual({ ...before, status: "ready", error: "internal", errorDetail: "529 overloaded", readStartedAt: NOW, consentAt: NOW, updatedAt: NOW });
    expect(await loadExternalReference(handle.db, { id: SITE_ID, theme: themeOf(handle) })).toMatchObject({ profile: { ...PROFILE, headline: "Corrigé" } });
  });

  it("première tentative, l'extraction échoue : le site passe en erreur `internal` et l'issue le dit au praticien", async () => {
    const handle = memoryDb();
    const refusal = await submit(handle, {}, fakeExtractor(() => Promise.reject(new Error(`réponse illisible : ${PAGE_SECRET}`))).extractor);
    expect(refusal).toEqual({ ok: false, reason: "unavailable", message: `${EXTERNAL_READ_ERRORS.internal.title}. ${EXTERNAL_READ_ERRORS.internal.hint}` });
    expect(external(handle)).toMatchObject({ status: "error", error: "internal", source: "pasted", pages: [], profile: null });
    expect(logged()).not.toContain(PAGE_SECRET);
    // Sans extracteur injecté ni fabrique disponible : même issue
    const noExtractor = memoryDb();
    expect(await submitExternalSiteText(noExtractor.db, SITE, { url: SITE_URL, text: TEXT, consent: true }, { now: NOW, env: ENV })).toMatchObject({ ok: false, reason: "unavailable" });
    expect(external(noExtractor)).toMatchObject({ status: "error", error: "internal" });
  });

  it("le site a changé pendant l'extraction (autre lecture, déconnexion) : rien n'est inscrit, l'issue le signale", async () => {
    const handle = memoryDb();
    const { extractor } = fakeExtractor(() => {
      handle.patch(externalSites, { readStartedAt: new Date(NOW.getTime() + 5_000) });
      return PROFILE;
    });
    expect(await submit(handle, {}, extractor)).toMatchObject({ ok: false, reason: "busy" });
    expect(external(handle)).toMatchObject({ status: "reading", profile: null });
  });

  it("table absente : `unavailable` ; toute autre erreur de base est levée", async () => {
    expect(await submit(memoryDb({}, { fail: missing(externalSites) }))).toMatchObject({ ok: false, reason: "unavailable" });
    await expect(submit(memoryDb({}, { fail: connectionLost }))).rejects.toThrow("connection terminated");
  });
});

// ─── Corrections, activation, déconnexion ────────────────────────────────────

describe("saveExternalOverrides", () => {
  it("corrections nettoyées et enregistrées, sans toucher au profil lu ni au reste de la ligne", async () => {
    const before = externalRow();
    const handle = memoryDb({ external: [before] });
    const raw = {
      headline: "  <i>Retrouver le calme</i>,\nà Albi  ",
      specialties: [{ title: "Préparation aux examens", excerpt: "Aborder les épreuves sereinement.", url: "https://autre-site.fr/examens" }],
      contact: { phone: "06 11 22 33 44", email: "pas un e-mail" },
      bookingUrl: "",
      inconnu: "ignoré",
    };
    expect(await saveExternalOverrides(handle.db, SITE_ID, raw)).toEqual({ ok: true });
    const overrides = {
      headline: "Retrouver le calme , à Albi",
      specialties: [{ slug: "preparation-aux-examens", title: "Préparation aux examens", excerpt: "Aborder les épreuves sereinement.", headings: [], faq: [] }],
      contact: { phone: "06 11 22 33 44", email: "" },
      bookingUrl: "",
    };
    expect(external(handle)).toEqual({ ...before, overrides, updatedAt: NOW });
    expect(handle.locks).toEqual([LOCK_KEY]);
    expect(handle.log.every((entry) => entry.tx)).toBe(true);
  });

  it("corrections vides ou inexploitables : plus aucune correction", async () => {
    for (const raw of [{}, null, "texte", [], { inconnu: 1 }]) {
      const handle = memoryDb({ external: [externalRow({ overrides: { headline: "Corrigé" } })] });
      expect(await saveExternalOverrides(handle.db, SITE_ID, raw)).toEqual({ ok: true });
      expect(external(handle)).toMatchObject({ overrides: null, profile: PROFILE });
    }
  });

  it("possible aussi après une lecture en échec ou interrompue : le praticien peut tout saisir à la main", async () => {
    for (const row of [externalRow({ status: "error", error: "blocked" }), readingRow({ readStartedAt: minutesAgo(7) })]) {
      const handle = memoryDb({ external: [row] });
      expect(await saveExternalOverrides(handle.db, SITE_ID, { headline: "Sophrologie à Albi" })).toEqual({ ok: true });
      expect(external(handle)).toMatchObject({ overrides: { headline: "Sophrologie à Albi" }, status: row.status });
    }
  });

  it("refus : aucun site connecté, lecture en cours, table absente — rien n'est écrit", async () => {
    const empty = memoryDb();
    const none = await saveExternalOverrides(empty.db, SITE_ID, { headline: "Corrigé" });
    expect(none).toMatchObject({ ok: false, reason: "unavailable" });
    expect(none.ok === false && none.message).toMatch(/Aucun site n'est connecté/);
    expect(empty.rows(externalSites)).toEqual([]);

    const reading = readingRow();
    const busy = memoryDb({ external: [reading] });
    expect(await saveExternalOverrides(busy.db, SITE_ID, { headline: "Corrigé" })).toMatchObject({ ok: false, reason: "busy" });
    expect(external(busy)).toEqual(reading);

    const absent = await saveExternalOverrides(memoryDb({}, { fail: missing(externalSites) }).db, SITE_ID, { headline: "Corrigé" });
    expect(absent).toMatchObject({ ok: false, reason: "unavailable" });
    expect(absent.ok === false && absent.message).toMatch(/en cours d'activation/);
    await expect(saveExternalOverrides(memoryDb({}, { fail: connectionLost }).db, SITE_ID, {})).rejects.toThrow("connection terminated");
  });
});

describe("setExternalSiteActive", () => {
  it("activation : réglage écrit (adresse, interrupteur) sous verrou de la ligne du site, le reste du thème conservé", async () => {
    const handle = memoryDb({ external: [externalRow()] });
    expect(await setExternalSiteActive(handle.db, SITE_ID, { active: true })).toEqual({ ok: true });
    expect(themeOf(handle)).toMatchObject({ ...THEME, externalSite: { url: SITE_URL, active: true } });
    expect(themeOf(handle).externalSite).toEqual({ url: SITE_URL, active: true });
    expect(siteOf(handle).updatedAt).toEqual(NOW);
    // La ligne du site du client n'est pas modifiée
    expect(external(handle)).toMatchObject({ status: "ready", updatedAt: daysAgo(3) });
    expect(handle.locks).toEqual([LOCK_KEY]);
    const ops = handle.log.map((entry) => `${entry.op} ${entry.table}${entry.forUpdate ? " for update" : ""}`);
    expect(ops.indexOf("select sites for update")).toBeGreaterThan(-1);
    expect(ops.indexOf("select sites for update")).toBeLessThan(ops.indexOf("update sites"));
    expect(handle.log.every((entry) => entry.tx)).toBe(true);
    expect(await loadExternalReference(handle.db, { id: SITE_ID, theme: themeOf(handle) })).not.toBeNull();
  });

  it("`keepHostedIndexed` : enregistré quand il est donné, conservé sinon", async () => {
    const handle = memoryDb({ external: [externalRow()] });
    await setExternalSiteActive(handle.db, SITE_ID, { active: true, keepHostedIndexed: true });
    expect(themeOf(handle).externalSite).toEqual({ url: SITE_URL, active: true, keepHostedIndexed: true });
    await setExternalSiteActive(handle.db, SITE_ID, { active: true });
    expect(themeOf(handle).externalSite).toEqual({ url: SITE_URL, active: true, keepHostedIndexed: true });
    await setExternalSiteActive(handle.db, SITE_ID, { active: false });
    expect(themeOf(handle).externalSite).toEqual({ url: SITE_URL, active: false, keepHostedIndexed: true });
    await setExternalSiteActive(handle.db, SITE_ID, { active: true, keepHostedIndexed: false });
    expect(themeOf(handle).externalSite).toEqual({ url: SITE_URL, active: true });
  });

  it("activation : le lien de rendez-vous et les réseaux trouvés sur le site complètent les réglages restés vides", async () => {
    const handle = memoryDb({ external: [externalRow()] });
    expect(await setExternalSiteActive(handle.db, SITE_ID, { active: true })).toEqual({ ok: true });
    expect(siteOf(handle).bookingUrl).toBe("https://www.doctolib.fr/sophrologue/albi/claire-dupont");
    // Le lien fb.com ne passerait pas la validation des réglages du site (hôte facebook.com attendu) : il n'est pas recopié
    expect(themeOf(handle).social).toEqual({ instagram: "https://www.instagram.com/claire.sophro", linkedin: "https://www.linkedin.com/in/claire-dupont" });
  });

  it("activation : jamais d'écrasement — lien de rendez-vous et réseaux déjà réglés restent tels quels", async () => {
    const social = { instagram: "https://www.instagram.com/mon-compte", facebook: "  " };
    const handle = memoryDb({ external: [externalRow()], sites: [siteRow({ bookingUrl: "tel:+33563000000", theme: themeWith(undefined, { social }) })] });
    expect(await setExternalSiteActive(handle.db, SITE_ID, { active: true })).toEqual({ ok: true });
    expect(siteOf(handle).bookingUrl).toBe("tel:+33563000000");
    expect(themeOf(handle).social).toEqual({ instagram: "https://www.instagram.com/mon-compte", facebook: "  ", linkedin: "https://www.linkedin.com/in/claire-dupont" });

    // Rien à compléter : les réglages ne bougent pas, et aucun bloc « réseaux » vide n'est créé
    const bare = memoryDb({ external: [externalRow({ profile: { ...PROFILE, bookingUrl: undefined, social: {} } })], sites: [siteRow({ bookingUrl: "   " })] });
    expect(await setExternalSiteActive(bare.db, SITE_ID, { active: true })).toEqual({ ok: true });
    expect(siteOf(bare).bookingUrl).toBe("   ");
    expect(themeOf(bare)).not.toHaveProperty("social");
  });

  it("activation : ce sont les valeurs corrigées par le praticien qui sont recopiées, pas celles lues", async () => {
    const overrides = { bookingUrl: "", social: { youtube: "https://www.youtube.com/@claire-sophro" } };
    const handle = memoryDb({ external: [externalRow({ overrides })] });
    expect(await setExternalSiteActive(handle.db, SITE_ID, { active: true })).toEqual({ ok: true });
    // Lien de rendez-vous retiré par le praticien : rien n'est recopié
    expect(siteOf(handle).bookingUrl).toBeNull();
    expect(themeOf(handle).social).toEqual({ youtube: "https://www.youtube.com/@claire-sophro" });
  });

  it("activation refusée (`not_ready`) : rien de connecté, lecture en cours, première lecture interrompue ou en échec — rien n'est écrit", async () => {
    const refused = async (seed: Row[], pattern: RegExp) => {
      const handle = memoryDb({ external: seed });
      const refusal = await setExternalSiteActive(handle.db, SITE_ID, { active: true });
      expect(refusal).toMatchObject({ ok: false, reason: "not_ready" });
      expect(refusal.ok === false && refusal.message).toMatch(pattern);
      expect(themeOf(handle)).toEqual(THEME);
      expect(handle.log.filter((entry) => entry.op !== "select" && entry.op !== "execute")).toEqual([]);
    };
    await refused([], /Indiquez d'abord l'adresse de votre site/);
    await refused([readingRow()], /lecture de votre site est en cours/);
    await refused([readingRow({ readStartedAt: minutesAgo(7) })], /n'a pas abouti/);
    await refused([readingRow({ status: "error", error: "blocked" })], /n'a pas abouti/);
    // Relecture en cours d'un site déjà lu : l'activation attend sa fin (une minute au plus)
    await refused([rereadingRow()], /lecture de votre site est en cours/);
  });

  it("activation possible sur la dernière lecture aboutie : après une relecture en échec, ou interrompue", async () => {
    for (const row of [externalRow({ error: "timeout", errorDetail: "délai dépassé" }), rereadingRow({ readStartedAt: minutesAgo(7) })]) {
      const handle = memoryDb({ external: [row] });
      expect(await setExternalSiteActive(handle.db, SITE_ID, { active: true })).toEqual({ ok: true });
      expect(themeOf(handle).externalSite).toEqual({ url: SITE_URL, active: true });
      // L'activation ne touche pas à la ligne : l'échec de la dernière lecture reste visible
      expect(external(handle)).toEqual(row);
      expect(await loadExternalReference(handle.db, { id: SITE_ID, theme: themeOf(handle) })).toMatchObject({ profile: PROFILE });
    }
  });

  it("activation refusée tant que le profil n'est pas exploitable : le message dit ce qui manque", async () => {
    const refusalFor = async (profile: ExternalSiteProfile, overrides: unknown = null) => {
      const handle = memoryDb({ external: [externalRow({ profile, overrides })] });
      const refusal = await setExternalSiteActive(handle.db, SITE_ID, { active: true });
      expect(themeOf(handle)).toEqual(THEME);
      return refusal;
    };
    expect(await refusalFor(EMPTY_EXTERNAL_PROFILE)).toEqual({
      ok: false,
      reason: "not_ready",
      message: "Vos outils ne peuvent pas encore s'appuyer sur votre site : il manque une présentation de votre activité et au moins une spécialité. Complétez le profil, puis réessayez.",
    });
    expect(await refusalFor({ ...PROFILE, specialties: [] })).toMatchObject({ reason: "not_ready", message: expect.stringMatching(/il manque au moins une spécialité\./) });
    // Les corrections comptent : un profil vidé par le praticien n'est plus exploitable, un profil complété le devient
    expect(await refusalFor(PROFILE, { specialties: [] })).toMatchObject({ ok: false, reason: "not_ready" });
    const completed = memoryDb({ external: [externalRow({ profile: EMPTY_EXTERNAL_PROFILE, overrides: { headline: "Sophrologie à Albi", specialties: PROFILE.specialties } })] });
    expect(await setExternalSiteActive(completed.db, SITE_ID, { active: true })).toEqual({ ok: true });
  });

  it("renoncer : l'interrupteur s'éteint, la lecture et les corrections restent — même pendant une lecture ou après un échec", async () => {
    for (const row of [externalRow({ overrides: { headline: "Corrigé" } }), readingRow(), externalRow({ status: "error", error: "timeout" })]) {
      const handle = memoryDb({ external: [row], sites: [activeSiteRow({ bookingUrl: "tel:+33563000000" })] });
      expect(await setExternalSiteActive(handle.db, SITE_ID, { active: false })).toEqual({ ok: true });
      expect(themeOf(handle)).toEqual(themeWith({ url: SITE_URL, active: false }));
      expect(external(handle)).toEqual(row);
      expect(siteOf(handle).bookingUrl).toBe("tel:+33563000000");
      expect(await loadExternalReference(handle.db, { id: SITE_ID, theme: themeOf(handle) })).toBeNull();
    }
  });

  it("renoncer quand rien n'est connecté : sans effet ; site introuvable ou table absente : `unavailable`", async () => {
    const handle = memoryDb();
    expect(await setExternalSiteActive(handle.db, SITE_ID, { active: false })).toEqual({ ok: true });
    expect(themeOf(handle)).toEqual(THEME);
    expect(handle.count("update", sites)).toBe(0);

    expect(await setExternalSiteActive(memoryDb({ sites: [] }).db, SITE_ID, { active: true })).toMatchObject({ ok: false, reason: "unavailable" });
    const absent = memoryDb({}, { fail: missing(externalSites) });
    expect(await setExternalSiteActive(absent.db, SITE_ID, { active: true })).toMatchObject({ ok: false, reason: "unavailable" });
    expect(await setExternalSiteActive(absent.db, SITE_ID, { active: false })).toMatchObject({ ok: false, reason: "unavailable" });
    expect(themeOf(absent)).toEqual(THEME);
    await expect(setExternalSiteActive(memoryDb({}, { fail: connectionLost }).db, SITE_ID, { active: true })).rejects.toThrow("connection terminated");
  });

  it("l'écriture du thème échoue : la transaction est annulée, rien n'est à moitié fait", async () => {
    const handle = memoryDb({ external: [externalRow()] }, { fail: (op, table) => (op === "update" && table === sites ? new Error("serialization failure") : null) });
    await expect(setExternalSiteActive(handle.db, SITE_ID, { active: true })).rejects.toThrow("serialization failure");
    expect(themeOf(handle)).toEqual(THEME);
    expect(siteOf(handle).bookingUrl).toBeNull();
  });
});

describe("disconnectExternalSite", () => {
  it("réglage retiré (le reste du thème conservé), lecture et corrections supprimées ; les lectures du mois restent comptées", async () => {
    const theme = themeWith({ ...ACTIVE, keepHostedIndexed: true }, { social: { instagram: "https://www.instagram.com/claire" } });
    const handle = memoryDb({
      external: [externalRow({ overrides: { headline: "Corrigé" } }), externalRow({ siteId: OTHER_SITE_ID, measureKey: "zzzzzzzzzzzzzzzzzzzzzzzz" })],
      sites: [siteRow({ theme, bookingUrl: "tel:+33563000000" }), siteRow({ id: OTHER_SITE_ID, slug: "autre", theme: themeWith(ACTIVE) })],
      usage: [usageRow(), usageRow()],
    });
    expect(await disconnectExternalSite(handle.db, SITE_ID)).toEqual({ ok: true });
    expect(external(handle)).toBeUndefined();
    const { externalSite: _removed, ...rest } = theme;
    expect(themeOf(handle)).toEqual(rest);
    expect(themeOf(handle)).not.toHaveProperty("externalSite");
    expect(siteOf(handle)).toMatchObject({ bookingUrl: "tel:+33563000000", updatedAt: NOW });
    expect(handle.rows(googleUsage)).toHaveLength(2);
    // L'autre site n'est pas touché
    expect(external(handle, OTHER_SITE_ID)).toBeDefined();
    expect(themeOf(handle, OTHER_SITE_ID)).toEqual(themeWith(ACTIVE));
    expect(handle.locks).toEqual([LOCK_KEY]);
    expect(handle.log.some((entry) => entry.table === "sites" && entry.forUpdate)).toBe(true);
    expect(handle.log.every((entry) => entry.tx)).toBe(true);
    expect(await loadExternalSite(handle.db, { id: SITE_ID, theme: themeOf(handle) }, NOW)).toEqual({ available: true, site: null });
  });

  it("pendant une lecture : la ligne disparaît quand même ; rien de connecté : sans effet", async () => {
    const reading = memoryDb({ external: [readingRow()] });
    expect(await disconnectExternalSite(reading.db, SITE_ID)).toEqual({ ok: true });
    expect(reading.rows(externalSites)).toEqual([]);
    expect(reading.count("update", sites)).toBe(0);

    const nothing = memoryDb();
    expect(await disconnectExternalSite(nothing.db, SITE_ID)).toEqual({ ok: true });
    expect(themeOf(nothing)).toEqual(THEME);
    // Réglage resté seul : il est retiré aussi
    const orphan = memoryDb({ sites: [activeSiteRow()] });
    expect(await disconnectExternalSite(orphan.db, SITE_ID)).toEqual({ ok: true });
    expect(themeOf(orphan)).toEqual(THEME);
  });

  it("table absente : `unavailable`, le thème n'est pas touché ; toute autre erreur de base est levée", async () => {
    const absent = memoryDb({ sites: [activeSiteRow()] }, { fail: missing(externalSites) });
    expect(await disconnectExternalSite(absent.db, SITE_ID)).toMatchObject({ ok: false, reason: "unavailable" });
    expect(themeOf(absent)).toEqual(themeWith(ACTIVE));
    await expect(disconnectExternalSite(memoryDb({}, { fail: connectionLost }).db, SITE_ID)).rejects.toThrow("connection terminated");
    // Le thème ne peut pas être réécrit : la suppression est annulée avec lui
    const before = externalRow();
    const failing = memoryDb({ external: [before], sites: [activeSiteRow()] }, { fail: (op, table) => (op === "update" && table === sites ? new Error("serialization failure") : null) });
    await expect(disconnectExternalSite(failing.db, SITE_ID)).rejects.toThrow("serialization failure");
    expect(external(failing)).toEqual(before);
  });
});

// ─── Ce que lisent les outils ────────────────────────────────────────────────

describe("loadExternalReference", () => {
  /** `setting` null : site sans réglage. */
  const reference = (handle: MemoryDb, setting: ExternalSiteSetting | null = ACTIVE) => loadExternalReference(handle.db, { id: SITE_ID, theme: themeWith(setting ?? undefined) });

  it("site actif, lu et exploitable : le réglage, le profil effectif (lu puis corrigé) et les faits", async () => {
    const overrides = { headline: "Retrouver le calme, à Albi", specialties: [PROFILE.specialties[1]!] };
    const handle = memoryDb({ external: [externalRow({ overrides })] });
    const setting = { ...ACTIVE, keepHostedIndexed: true };
    expect(await reference(handle, setting)).toEqual({ setting, profile: { ...PROFILE, ...overrides }, facts: FACTS, source: "crawl", measureSeenAt: daysAgo(2) });
    // Une seule requête, sur la seule table du site du client
    expect(handle.log).toEqual([{ op: "select", table: "external_sites", tx: false }]);
    // Texte collé : les faits sont vides et l'origine le dit — le code des pages n'a jamais été lu, rien ne peut être dit de ses balises
    expect(await reference(memoryDb({ external: [externalRow({ source: "pasted", facts: null })] }))).toMatchObject({ profile: PROFILE, source: "pasted", facts: { phones: [], emails: [], hours: [], bookingLinks: [], social: {}, tags: {} } });
    // Première visite reçue du code de mesure : les outils savent que la mesure est en place, quoi qu'ait vu la lecture du code ; `null` tant qu'il n'a rien envoyé
    const seenAt = minutesAgo(90);
    expect(await reference(memoryDb({ external: [externalRow({ measureSeenAt: seenAt })] }))).toMatchObject({ source: "crawl", measureSeenAt: seenAt });
    expect(await reference(memoryDb({ external: [externalRow({ measureSeenAt: null })] }))).toMatchObject({ measureSeenAt: null });
  });

  it("adresse enregistrée sous une forme que la règle ne produit plus (page d'accueil, barre finale) : toujours le même site, la référence est rendue", async () => {
    for (const stored of [`${SITE_URL}/accueil`, `${SITE_URL}/index.html`, `${SITE_URL}/`]) {
      const handle = memoryDb({ external: [externalRow({ url: stored })] });
      const found = await reference(handle, { url: stored, active: true });
      expect([stored, found?.setting.url, found?.profile.headline]).toEqual([stored, SITE_URL, PROFILE.headline]);
    }
    // Ligne normalisée, réglage ancien — et l'inverse
    expect(await reference(memoryDb({ external: [externalRow()] }), { url: `${SITE_URL}/accueil`, active: true })).not.toBeNull();
    expect(await reference(memoryDb({ external: [externalRow({ url: `${SITE_URL}/accueil` })] }), ACTIVE)).not.toBeNull();
    // Un autre site reste un autre site
    expect(await reference(memoryDb({ external: [externalRow({ url: "https://www.autre-cabinet.fr/accueil" })] }), ACTIVE)).toBeNull();
  });

  it("sans réglage actif : `null` sans aucune requête", async () => {
    const handle = memoryDb({ external: [externalRow()] });
    expect(await reference(handle, null)).toBeNull();
    expect(await reference(handle, { url: SITE_URL, active: false })).toBeNull();
    expect(await reference(handle, { url: "pas une adresse", active: true })).toBeNull();
    expect(handle.log).toEqual([]);
  });

  it("`null` tant que rien d'exploitable n'est enregistré : pas de ligne, première lecture en cours, interrompue ou en échec", async () => {
    expect(await reference(memoryDb())).toBeNull();
    expect(await reference(memoryDb({ external: [externalRow({ siteId: OTHER_SITE_ID })] }))).toBeNull();
    expect(await reference(memoryDb({ external: [readingRow()] }))).toBeNull();
    expect(await reference(memoryDb({ external: [readingRow({ readStartedAt: minutesAgo(7) })] }))).toBeNull();
    expect(await reference(memoryDb({ external: [readingRow({ status: "error", error: "timeout" })] }))).toBeNull();
  });

  it("l'état de la dernière tentative ne compte pas : relecture en cours, interrompue ou en échec, la dernière lecture aboutie reste la référence", async () => {
    const overrides = { headline: "Retrouver le calme, à Albi" };
    const expected = { setting: ACTIVE, profile: { ...PROFILE, ...overrides }, facts: FACTS, measureSeenAt: daysAgo(2) };
    for (const row of [
      rereadingRow({ overrides }),
      rereadingRow({ overrides, readStartedAt: minutesAgo(7) }),
      externalRow({ overrides, error: "timeout", errorDetail: "délai dépassé" }),
      externalRow({ overrides, source: "pasted", error: "blocked" }),
      // État que le service n'inscrit plus (site en « erreur » avec un profil) : le profil enregistré compte quand même
      externalRow({ overrides, status: "error", error: "unreachable" }),
    ]) {
      expect(await reference(memoryDb({ external: [row] }))).toEqual({ ...expected, source: row.source });
    }
  });

  it("`null` quand le profil effectif n'est pas exploitable, ou que la ligne ne décrit pas le site du réglage", async () => {
    expect(await reference(memoryDb({ external: [externalRow({ profile: EMPTY_EXTERNAL_PROFILE })] }))).toBeNull();
    expect(await reference(memoryDb({ external: [externalRow({ profile: null })] }))).toBeNull();
    expect(await reference(memoryDb({ external: [externalRow({ overrides: { specialties: [] } })] }))).toBeNull();
    expect(await reference(memoryDb({ external: [externalRow({ url: OTHER_URL })] }))).toBeNull();
    // La variante « www. » désigne le même site
    expect(await reference(memoryDb({ external: [externalRow({ url: BARE_URL })] }))).not.toBeNull();
    // Profil rendu exploitable par les corrections
    expect(await reference(memoryDb({ external: [externalRow({ profile: EMPTY_EXTERNAL_PROFILE, overrides: { headline: "Sophrologie à Albi", specialties: PROFILE.specialties } })] }))).not.toBeNull();
  });

  it("table absente : `null`, jamais d'erreur ; toute autre erreur de base est levée", async () => {
    expect(await reference(memoryDb({}, { fail: missing(externalSites) }))).toBeNull();
    await expect(reference(memoryDb({}, { fail: connectionLost }))).rejects.toThrow("connection terminated");
  });
});

describe("briefPagesFor", () => {
  const HERO_IMAGE = "https://images.pexels.com/photos/1/hero.jpeg";
  const ABOUT_IMAGE = "https://abc.public.blob.vercel-storage.com/portrait.jpg";
  const HOSTED_URL = "https://demo.harmony-web.fr/claire-dupont-sophrologue-albi";
  const homeSections: Section[] = [
    { type: "hero", title: "Sophrologie à Albi", paragraphs: ["Un accompagnement sur mesure."], imageUrl: HERO_IMAGE },
    { type: "specialties", title: "Spécialités", items: [{ slug: "sommeil", title: "Sommeil", excerpt: "Mieux dormir." }] },
    { type: "about", title: "À propos", paragraphs: ["Sophrologue depuis dix ans."], imageUrl: ABOUT_IMAGE },
  ];
  const HOSTED: SocialBriefInput["pages"] = [
    { id: "p-home", type: "home", slug: "", title: "Accueil", metaDescription: null, sections: homeSections },
    { id: "p-sommeil", type: "motif", slug: "sommeil", title: "Sommeil", metaDescription: "Mieux dormir.", sections: [] },
  ];
  const site = (setting?: ExternalSiteSetting) => ({ id: SITE_ID, theme: themeWith(setting) });

  it("sans site du client : les pages, l'adresse et le thème du site hébergé, tels quels et sans aucune requête", async () => {
    const handle = memoryDb({ external: [externalRow()] });
    const plain = site();
    const source = await briefPagesFor(handle.db, plain, HOSTED, HOSTED_URL);
    // Les mêmes objets, pas des copies : rien n'est transformé en chemin
    expect(source.pages).toBe(HOSTED);
    expect(source.theme).toBe(plain.theme);
    expect(source).toEqual({ pages: HOSTED, url: HOSTED_URL, hostedUrl: HOSTED_URL, theme: THEME, reference: null });
    expect(handle.log).toEqual([]);
    // Réglage présent mais éteint : pareil
    const off = site({ url: SITE_URL, active: false });
    expect(await briefPagesFor(handle.db, off, HOSTED, HOSTED_URL)).toEqual({ pages: HOSTED, url: HOSTED_URL, hostedUrl: HOSTED_URL, theme: off.theme, reference: null });
    expect(handle.log).toEqual([]);
  });

  it("réglage actif mais rien d'exploitable enregistré (première lecture en cours ou en échec, profil incomplet) ou table absente : le site hébergé, avec son adresse", async () => {
    for (const handle of [
      memoryDb(),
      memoryDb({ external: [readingRow()] }),
      memoryDb({ external: [readingRow({ status: "error", error: "blocked" })] }),
      memoryDb({ external: [externalRow({ profile: EMPTY_EXTERNAL_PROFILE })] }),
      memoryDb({}, { fail: missing(externalSites) }),
    ]) {
      const active = site(ACTIVE);
      expect(await briefPagesFor(handle.db, active, HOSTED, HOSTED_URL)).toEqual({ pages: HOSTED, url: HOSTED_URL, hostedUrl: HOSTED_URL, theme: active.theme, reference: null });
    }
  });

  it("relecture en cours ou en échec : le brief reste celui du site du client, avec la dernière lecture aboutie", async () => {
    const expected = externalBriefPages(PROFILE, { siteUrl: SITE_URL, images: { hero: HERO_IMAGE, about: ABOUT_IMAGE } });
    for (const row of [rereadingRow(), rereadingRow({ readStartedAt: minutesAgo(7) }), externalRow({ error: "timeout" })]) {
      const source = await briefPagesFor(memoryDb({ external: [row] }).db, site(ACTIVE), HOSTED, HOSTED_URL);
      expect(source).toMatchObject({ pages: expected, url: SITE_URL, hostedUrl: HOSTED_URL, reference: { profile: PROFILE } });
    }
  });

  it("site du client en référence : son profil converti en pages, les photos d'accueil et « à propos » du site hébergé gardées, son adresse", async () => {
    const handle = memoryDb({ external: [externalRow()] });
    const active = site({ url: `${SITE_URL}/`, active: true });
    const source = await briefPagesFor(handle.db, active, HOSTED, HOSTED_URL);
    // L'adresse du site du client est donnée comme source aux spécialités sans page à elles — sous sa forme normalisée,
    // même quand le réglage a été enregistré avec une barre finale
    expect(source.pages).toEqual(externalBriefPages(PROFILE, { siteUrl: SITE_URL, images: { hero: HERO_IMAGE, about: ABOUT_IMAGE } }));
    expect(source.pages.map((p) => p.href)).toEqual([undefined, `${SITE_URL}/gestion-du-stress`, SITE_URL]);
    expect(source.url).toBe(SITE_URL);
    expect(source.hostedUrl).toBe(HOSTED_URL);
    expect(source.reference).toEqual({ setting: { url: SITE_URL, active: true }, profile: PROFILE, facts: FACTS, source: "crawl", measureSeenAt: daysAgo(2) });
    // Les pages désactivées du site hébergé ne filtrent pas les spécialités du site du client
    expect(source.theme).toEqual({ ...active.theme, disabledMotifs: [] });
    expect(source.pages.map((p) => [p.id, p.type, p.slug])).toEqual([
      ["ext-accueil", "home", ""],
      ["ext-gestion-du-stress", "motif", "gestion-du-stress"],
      ["ext-sommeil", "motif", "sommeil"],
    ]);
    const home = source.pages[0]!.sections;
    expect(home.find((s) => s.type === "hero")).toMatchObject({ title: PROFILE.headline, imageUrl: HERO_IMAGE });
    expect(home.find((s) => s.type === "about")).toMatchObject({ imageUrl: ABOUT_IMAGE });
  });

  it("site hébergé sans photo ou sans page d'accueil : le profil du client seul", async () => {
    const handle = memoryDb({ external: [externalRow()] });
    const noImages: SocialBriefInput["pages"] = [{ ...HOSTED[0]!, sections: [{ type: "hero", title: "Accueil", paragraphs: [] }] }];
    expect((await briefPagesFor(handle.db, site(ACTIVE), noImages, HOSTED_URL)).pages).toEqual(externalBriefPages(PROFILE, { siteUrl: SITE_URL }));
    expect((await briefPagesFor(handle.db, site(ACTIVE), [], HOSTED_URL)).pages).toEqual(externalBriefPages(PROFILE, { siteUrl: SITE_URL }));
  });

  it("dans le brief : domaine et spécialités du site du client, photos déjà admises au catalogue, articles toujours sur le blog hébergé", async () => {
    const handle = memoryDb({ external: [externalRow()] });
    const active = site(ACTIVE);
    const source = await briefPagesFor(handle.db, active, HOSTED, HOSTED_URL);
    const { brief, photosById, refsById } = buildSocialBrief({
      site: { id: SITE_ID, name: SITE.name, type: "client", bookingUrl: null, theme: source.theme, url: source.url, hostedUrl: source.hostedUrl },
      prospect: null,
      pages: source.pages,
      articles: [{ id: "a1", slug: "bien-dormir", title: "Bien dormir", excerpt: "Conseils.", content: "## Pourquoi\n\nTexte de l'article.", imageUrl: null, status: "published", publishAt: daysAgo(10) }],
      reviews: [],
      voice: null,
      practiceName: "la sophrologie",
      now: NOW,
    });
    expect(brief.domain).toBe("www.cabinet-dupont.fr");
    expect(brief.home.hero?.title).toBe(PROFILE.headline);
    // « sommeil » est désactivé sur le site hébergé (THEME.disabledMotifs) : la spécialité du site du client reste
    expect(brief.home.specialties.map((s) => s.slug)).toEqual(["gestion-du-stress", "sommeil"]);
    expect(brief.motifPages.map((p) => p.slug)).toEqual(["gestion-du-stress", "sommeil"]);
    expect(Object.values(photosById)).toEqual([HERO_IMAGE, ABOUT_IMAGE]);
    expect(refsById["section:home:hero"]?.href).toBe(SITE_URL);
    expect(refsById["page:ext-gestion-du-stress"]?.href).toBe(`${SITE_URL}/gestion-du-stress`);
    // « Sommeil » n'a pas de page à elle sur le site du client : sa source est l'accueil de ce site, pas une page « /motifs/… » qui n'y existe pas
    expect(refsById["page:ext-sommeil"]?.href).toBe(SITE_URL);
    expect(Object.values(refsById).some((ref) => ref.href?.includes("/motifs/"))).toBe(false);
    expect(refsById["article:a1"]).toMatchObject({ href: "/publications/a1", publicHref: `${HOSTED_URL}/blog/bien-dormir` });
  });
});

// ─── Relecture mensuelle ─────────────────────────────────────────────────────

describe("selectDueExternalSites", () => {
  it("dû : dernière lecture et dernier contrôle vieux de 30 jours ou plus (ou jamais) ; les plus anciens d'abord, au plus 5", () => {
    const row = (id: string, readAt: Date | null, checkedAt: Date | null = null) => ({ id, readAt, checkedAt });
    const rows = [
      row("récent", daysAgo(29)),
      row("limite", daysAgo(EXTERNAL_SITE_LIMITS.refreshDays)),
      row("ancien", daysAgo(90)),
      row("contrôlé", daysAgo(200), daysAgo(2)),
      row("contrôle ancien", daysAgo(200), daysAgo(45)),
      row("jamais", null),
      row("presque", new Date(daysAgo(30).getTime() + 1)),
    ];
    expect(selectDueExternalSites(rows, NOW).map((r) => r.id)).toEqual(["jamais", "ancien", "contrôle ancien", "limite"]);
    expect(selectDueExternalSites(rows, NOW, 2).map((r) => r.id)).toEqual(["jamais", "ancien"]);
    expect(selectDueExternalSites(rows, NOW, 0)).toEqual([]);
    expect(selectDueExternalSites([], NOW)).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => row(`s${i}`, daysAgo(40 + i)));
    expect(selectDueExternalSites(many, NOW).map((r) => r.id)).toEqual(["s8", "s7", "s6", "s5", "s4"]);
    expect(EXTERNAL_REFRESH_BATCH).toBe(5);
  });
});

describe("refreshExternalSites", () => {
  const due = (overrides: Row = {}): Row => externalRow({ readStartedAt: daysAgo(40), readAt: daysAgo(40), consentAt: daysAgo(40), createdAt: daysAgo(40), updatedAt: daysAgo(40), ...overrides });
  const refresh = (handle: MemoryDb, reader: WebsiteReader, extractor: ExternalProfileExtractor, deadline?: Date) =>
    refreshExternalSites(handle.db, { reader, extractor, now: NOW, env: ENV, ...(deadline ? { deadline } : {}) });
  const NEW_PAGES = [page("/", "home", "Claire Dupont, sophrologue à Albi", `${HOME_TEXT} Nouveau : séances de groupe le samedi.`), PAGES[1]!];
  const NEW_PROFILE: ExternalSiteProfile = { ...PROFILE, headline: "Séances individuelles et de groupe à Albi" };

  it("site inchangé (même empreinte) : seule la date du contrôle est inscrite, le profil n'est pas extrait de nouveau", async () => {
    const before = due();
    const handle = memoryDb({ external: [before], sites: [activeSiteRow()] });
    const { reader, calls: reads } = fakeReader(() => okRead({ pages: [...PAGES].reverse().map((p) => ({ ...p, fetchedAt: NOW.toISOString() })) }));
    const { extractor, calls: extractions } = fakeExtractor();
    expect(await refresh(handle, reader, extractor)).toEqual({ checked: 1, changed: 0, failed: 0 });
    expect(reads.map((call) => [call.url, call.opts])).toEqual([[SITE_URL, { deadlineMs: EXTERNAL_READ_DEADLINE_MS }]]);
    expect(extractions).toEqual([]);
    expect(external(handle)).toEqual({ ...before, checkedAt: NOW, updatedAt: NOW });
    // Pas compté dans le quota du praticien
    expect(handle.rows(googleUsage)).toEqual([]);
    expect(themeOf(handle)).toEqual(themeWith(ACTIVE));
  });

  it("site modifié (empreinte différente) : profil extrait de nouveau et enregistré, corrections intactes, toujours « prêt », hors quota", async () => {
    const overrides = { headline: "Ma présentation corrigée" };
    const before = due({ overrides });
    const handle = memoryDb({ external: [before], sites: [activeSiteRow()] });
    const facts = { ...FACTS, phones: ["05 63 11 11 11"] };
    const { reader, calls: reads } = fakeReader(() => okRead({ pages: NEW_PAGES, facts }));
    const { extractor, calls: extractions } = fakeExtractor(() => NEW_PROFILE);
    expect(await refresh(handle, reader, extractor)).toEqual({ checked: 1, changed: 1, failed: 0 });
    expect(extractions.map((call) => call.input)).toEqual([{ url: SITE_URL, pages: NEW_PAGES, facts, practitioner: { name: "Claire Dupont", profession: "Sophrologue", city: "Albi" } }]);
    expect(external(handle)).toEqual({ ...before, pages: NEW_PAGES, facts, profile: NEW_PROFILE, contentHash: externalContentHash(NEW_PAGES, facts), readAt: NOW, checkedAt: NOW, updatedAt: NOW });
    expect(external(handle)).toMatchObject({ status: "ready", overrides, error: null });
    expect(handle.rows(googleUsage)).toEqual([]);
    // Rattachement au registre des appels, site par site
    expect(reads[0]!.context).toEqual({ feature: "client_site", siteId: SITE_ID });
    expect(extractions[0]!.context).toEqual({ feature: "client_site", siteId: SITE_ID });
    expect(currentApiUsageContext()).toEqual({});
    // Le site reste la référence des outils, avec le nouveau profil corrigé
    expect(await loadExternalReference(handle.db, { id: SITE_ID, theme: themeOf(handle) })).toMatchObject({ profile: { ...NEW_PROFILE, ...overrides } });
  });

  it("seul un fait relevé a changé (code de mesure installé) : le site est tenu pour modifié", async () => {
    const before = due({ facts: { ...FACTS, tags: {} }, contentHash: externalContentHash(PAGES, { ...FACTS, tags: {} }) });
    const handle = memoryDb({ external: [before], sites: [activeSiteRow()] });
    expect(await refresh(handle, fakeReader().reader, fakeExtractor().extractor)).toEqual({ checked: 1, changed: 1, failed: 0 });
    expect(external(handle)).toMatchObject({ facts: FACTS, contentHash: externalContentHash(PAGES, FACTS), readAt: NOW });
  });

  it("relecture en échec : la lecture précédente reste, le site reste « prêt », le contrôle est daté et le code d'échec journalisé", async () => {
    const before = due({ overrides: { headline: "Corrigé" } });
    const handle = memoryDb({ external: [before], sites: [activeSiteRow()] });
    const { extractor, calls } = fakeExtractor();
    expect(await refresh(handle, fakeReader(() => ({ ok: false, error: "unreachable", detail: `ENOTFOUND www.cabinet-dupont.fr ${PAGE_SECRET}` })).reader, extractor)).toEqual({ checked: 1, changed: 0, failed: 1 });
    expect(external(handle)).toEqual({ ...before, checkedAt: NOW, updatedAt: NOW });
    expect(calls).toEqual([]);
    expect(logs.warn).toHaveBeenCalledWith(`[site-client] relecture du site ${SITE_ID} en échec : unreachable (lecture précédente conservée)`);
    expect(logged()).not.toContain("cabinet-dupont");
    expect(logged()).not.toContain(PAGE_SECRET);
    // Le site reste la référence des outils
    expect(await loadExternalReference(handle.db, { id: SITE_ID, theme: themeOf(handle) })).toMatchObject({ profile: { ...PROFILE, headline: "Corrigé" } });
    // Et il n'est pas relu le lendemain : le contrôle en échec compte
    const again = fakeReader();
    vi.setSystemTime(new Date(NOW.getTime() + DAY_MS));
    expect(await refreshExternalSites(handle.db, { reader: again.reader, extractor, now: new Date(NOW.getTime() + DAY_MS), env: ENV })).toEqual({ checked: 0, changed: 0, failed: 0 });
    expect(again.calls).toEqual([]);
  });

  it("le contrôle est daté avant la lecture : un site dont la relecture ne rend jamais la main ne reste pas en tête de file", async () => {
    // Pendant la lecture, le contrôle est déjà inscrit
    const handle = memoryDb({ external: [due()], sites: [activeSiteRow()] });
    let checkedDuringRead: unknown = "non lu";
    const watching = fakeReader(() => {
      checkedDuringRead = external(handle)?.checkedAt;
      return okRead();
    });
    expect(await refresh(handle, watching.reader, fakeExtractor().extractor)).toEqual({ checked: 1, changed: 0, failed: 0 });
    expect(checkedDuringRead).toEqual(NOW);

    // Lecture qui ne se termine pas (page qui fige le calcul, processus arrêté par la plateforme) : rien d'autre n'est écrit…
    const before = due();
    const frozen = memoryDb({ external: [before], sites: [activeSiteRow()] });
    const stuck = fakeReader(() => new Promise<ExternalReadOutcome>(() => {}));
    void refresh(frozen, stuck.reader, fakeExtractor().extractor);
    await vi.waitFor(() => expect(stuck.calls).toHaveLength(1));
    expect(external(frozen)).toEqual({ ...before, checkedAt: NOW, updatedAt: NOW });
    // … et au passage du lendemain le site n'est plus dû : les autres sites ne sont pas retenus derrière lui
    const next = fakeReader();
    const tomorrow = new Date(NOW.getTime() + DAY_MS);
    expect(await refreshExternalSites(frozen.db, { reader: next.reader, extractor: fakeExtractor().extractor, now: tomorrow, env: ENV })).toEqual({ checked: 0, changed: 0, failed: 0 });
    expect(next.calls).toEqual([]);
    // La lecture précédente reste la référence des outils
    expect(external(frozen)).toMatchObject({ status: "ready", profile: before.profile, readAt: before.readAt });
  });

  it("échecs en route : lecteur ou extracteur qui lève, trop peu de texte, code inconnu — toujours la lecture précédente", async () => {
    const cases: [WebsiteReader, ExternalProfileExtractor, RegExp][] = [
      [{ mode: "live", read: () => Promise.reject(new TypeError(`fetch failed ${PAGE_SECRET}`)) }, fakeExtractor().extractor, /interrompue \(TypeError\)/],
      [fakeReader(() => okRead({ pages: NEW_PAGES })).reader, fakeExtractor(() => Promise.reject(new Error(`529 ${PAGE_SECRET}`))).extractor, /interrompue \(Error\)/],
      [fakeReader(() => okRead({ pages: [page("/", "home", "Maintenance", "Site en maintenance.")] })).reader, fakeExtractor().extractor, /en échec : empty/],
      [fakeReader(() => ({ ok: false, error: "captcha" }) as unknown as ExternalReadOutcome).reader, fakeExtractor().extractor, /en échec : internal/],
    ];
    for (const [reader, extractor, pattern] of cases) {
      const before = due();
      const handle = memoryDb({ external: [before], sites: [activeSiteRow()] });
      await expect(refresh(handle, reader, extractor)).resolves.toEqual({ checked: 1, changed: 0, failed: 1 });
      expect(external(handle)).toEqual({ ...before, checkedAt: NOW, updatedAt: NOW });
      expect(logged()).toMatch(pattern);
      expect(logged()).not.toContain(PAGE_SECRET);
    }
  });

  it("le nouveau profil ne serait plus exploitable (site en maintenance) : la lecture précédente reste la référence", async () => {
    const before = due();
    const handle = memoryDb({ external: [before], sites: [activeSiteRow()] });
    expect(await refresh(handle, fakeReader(() => okRead({ pages: NEW_PAGES })).reader, fakeExtractor(() => EMPTY_EXTERNAL_PROFILE).extractor)).toEqual({ checked: 1, changed: 0, failed: 1 });
    expect(external(handle)).toEqual({ ...before, checkedAt: NOW, updatedAt: NOW });
    expect(logged()).toMatch(/profil inexploitable/);
    // Même règle que pour une lecture du praticien — même si les corrections suffiraient à elles seules, un profil lu exploitable n'est pas remplacé par un profil vide
    const overrides = { headline: "Sophrologie à Albi", specialties: PROFILE.specialties };
    const rich = due({ overrides });
    const kept = memoryDb({ external: [rich], sites: [activeSiteRow()] });
    expect(await refresh(kept, fakeReader(() => okRead({ pages: NEW_PAGES })).reader, fakeExtractor(() => EMPTY_EXTERNAL_PROFILE).extractor)).toEqual({ checked: 1, changed: 0, failed: 1 });
    expect(external(kept)).toEqual({ ...rich, checkedAt: NOW, updatedAt: NOW });
    // Profil effectif tenu par une présentation lue et des spécialités corrigées : la relecture qui le rendrait inexploitable est écartée
    const mixed = due({ profile: PARTIAL, overrides: { specialties: PROFILE.specialties } });
    const guarded = memoryDb({ external: [mixed], sites: [activeSiteRow()] });
    expect(await refresh(guarded, fakeReader(() => okRead({ pages: NEW_PAGES })).reader, fakeExtractor(() => EMPTY_EXTERNAL_PROFILE).extractor)).toEqual({ checked: 1, changed: 0, failed: 1 });
    expect(external(guarded)).toEqual({ ...mixed, checkedAt: NOW, updatedAt: NOW });
    // Rien d'exploitable à perdre (profil lu déjà incomplet, corrections suffisantes à elles seules) : la relecture est enregistrée
    const corrected = memoryDb({ external: [due({ profile: PARTIAL, overrides })], sites: [activeSiteRow()] });
    expect(await refresh(corrected, fakeReader(() => okRead({ pages: NEW_PAGES })).reader, fakeExtractor(() => EMPTY_EXTERNAL_PROFILE).extractor)).toEqual({ checked: 1, changed: 1, failed: 0 });
    expect(external(corrected)).toMatchObject({ profile: EMPTY_EXTERNAL_PROFILE, overrides, readAt: NOW });
  });

  it("l'échec laissé par une relecture du praticien : effacé dès qu'une relecture automatique aboutit, gardé si elle échoue aussi", async () => {
    const failure = { error: "timeout", errorDetail: "délai dépassé" };
    // Site inchangé : la lecture a abouti, l'échec n'a plus lieu d'être montré
    const same = memoryDb({ external: [due(failure)], sites: [activeSiteRow()] });
    expect(await refresh(same, fakeReader().reader, fakeExtractor().extractor)).toEqual({ checked: 1, changed: 0, failed: 0 });
    expect(external(same)).toMatchObject({ status: "ready", error: null, errorDetail: null, checkedAt: NOW, readAt: daysAgo(40), profile: PROFILE });
    // Site modifié : idem, avec le nouveau profil
    const changed = memoryDb({ external: [due(failure)], sites: [activeSiteRow()] });
    expect(await refresh(changed, fakeReader(() => okRead({ pages: NEW_PAGES })).reader, fakeExtractor(() => NEW_PROFILE).extractor)).toEqual({ checked: 1, changed: 1, failed: 0 });
    expect(external(changed)).toMatchObject({ status: "ready", error: null, errorDetail: null, readAt: NOW, profile: NEW_PROFILE });
    // Relecture automatique en échec : elle n'inscrit rien d'autre que la date du contrôle, l'échec du praticien reste tel quel
    const before = due(failure);
    const failed = memoryDb({ external: [before], sites: [activeSiteRow()] });
    expect(await refresh(failed, fakeReader(() => ({ ok: false, error: "blocked", detail: "HTTP 403" })).reader, fakeExtractor().extractor)).toEqual({ checked: 1, changed: 0, failed: 1 });
    expect(external(failed)).toEqual({ ...before, checkedAt: NOW, updatedAt: NOW });
  });

  it("lectures interrompues : soldées en début de passage — « prêt » avec la lecture précédente, « erreur » si rien n'avait été lu ; une lecture encore en cours n'est pas touchée", async () => {
    const stale = minutesAgo(7);
    const ids = { reread: SITE_ID, first: "d0000000-0000-4000-8000-000000000001", running: "d0000000-0000-4000-8000-000000000002", unknown: "d0000000-0000-4000-8000-000000000003", limit: "d0000000-0000-4000-8000-000000000004" };
    const key = (index: number) => String(index).padStart(24, "s");
    const rows = {
      // Relecture interrompue d'un site déjà lu (il y a trois jours) : son profil reste la référence
      reread: rereadingRow({ readStartedAt: stale, overrides: { headline: "Corrigé" }, source: "pasted" }),
      // Première lecture interrompue : rien n'a jamais été lu
      first: readingRow({ siteId: ids.first, measureKey: key(1), readStartedAt: stale }),
      // Lecture en cours depuis une minute : elle tourne peut-être encore
      running: rereadingRow({ siteId: ids.running, measureKey: key(2) }),
      // Début de lecture inconnu : tenue pour interrompue
      unknown: readingRow({ siteId: ids.unknown, measureKey: key(3), readStartedAt: null }),
      // Juste à la limite : interrompue, comme pour l'écran
      limit: rereadingRow({ siteId: ids.limit, measureKey: key(4), readStartedAt: new Date(NOW.getTime() - EXTERNAL_SITE_LIMITS.readStaleMs) }),
    };
    const handle = memoryDb({ external: Object.values(rows) });
    const { reader, calls } = fakeReader();
    expect(await refresh(handle, reader, fakeExtractor().extractor)).toEqual({ checked: 0, changed: 0, failed: 0 });
    expect(calls).toEqual([]);
    const settled = { error: "internal", errorDetail: "Lecture interrompue avant la fin", updatedAt: NOW };
    expect(external(handle, ids.reread)).toEqual({ ...rows.reread, status: "ready", ...settled });
    expect(external(handle, ids.first)).toEqual({ ...rows.first, status: "error", ...settled });
    expect(external(handle, ids.running)).toEqual(rows.running);
    expect(external(handle, ids.unknown)).toEqual({ ...rows.unknown, status: "error", ...settled });
    expect(external(handle, ids.limit)).toEqual({ ...rows.limit, status: "ready", ...settled });
    expect(logs.warn).toHaveBeenCalledWith(`[site-client] lecture du site ${SITE_ID} interrompue : soldée en échec (lecture précédente conservée)`);
    expect(logs.warn).toHaveBeenCalledWith(`[site-client] lecture du site ${ids.first} interrompue : soldée en échec`);
    // L'état inscrit est celui que l'écran montrait déjà
    const state = await loadExternalSite(handle.db, { id: SITE_ID, theme: THEME }, NOW);
    expect(state.available && state.site).toMatchObject({ status: "ready", reading: false, error: "internal", source: "pasted", usable: true });
    // Passage suivant : plus rien à solder
    logs.warn.mockClear();
    expect(await refresh(handle, reader, fakeExtractor().extractor)).toEqual({ checked: 0, changed: 0, failed: 0 });
    expect(logs.warn).not.toHaveBeenCalled();
  });

  it("une relecture interrompue ne sort pas le site de la relecture mensuelle : soldé, il est relu au même passage s'il est dû", async () => {
    const before = due({ status: "reading", readStartedAt: minutesAgo(30) });
    const handle = memoryDb({ external: [before], sites: [activeSiteRow()] });
    const { reader, calls } = fakeReader(() => okRead({ pages: NEW_PAGES }));
    expect(await refresh(handle, reader, fakeExtractor(() => NEW_PROFILE).extractor)).toEqual({ checked: 1, changed: 1, failed: 0 });
    expect(calls).toHaveLength(1);
    expect(external(handle)).toMatchObject({ status: "ready", error: null, errorDetail: null, profile: NEW_PROFILE, readAt: NOW, checkedAt: NOW });
  });

  it("ne relit que les sites actifs, prêts, lus sur le site lui-même et dus", async () => {
    const ids = { active: SITE_ID, inactive: "a0000000-0000-4000-8000-000000000001", off: "a0000000-0000-4000-8000-000000000002", pasted: "a0000000-0000-4000-8000-000000000003", recent: "a0000000-0000-4000-8000-000000000004", checked: "a0000000-0000-4000-8000-000000000005", error: "a0000000-0000-4000-8000-000000000006", reading: "a0000000-0000-4000-8000-000000000007", archived: "a0000000-0000-4000-8000-000000000008", moved: "a0000000-0000-4000-8000-000000000009" };
    const key = (index: number) => String(index).padStart(24, "k");
    const urlOf = (name: string) => `https://www.${name}.fr`;
    const row = (name: keyof typeof ids, index: number, overrides: Row = {}) => due({ siteId: ids[name], url: urlOf(name), measureKey: key(index), ...overrides });
    const owner = (name: keyof typeof ids, setting: ExternalSiteSetting | undefined, overrides: Row = {}) => siteRow({ id: ids[name], slug: name, theme: themeWith(setting), ...overrides });
    const on = (name: string): ExternalSiteSetting => ({ url: urlOf(name), active: true });
    const handle = memoryDb({
      external: [
        row("active", 1),
        row("inactive", 2),
        row("off", 3),
        row("pasted", 4, { source: "pasted" }),
        row("recent", 5, { readAt: daysAgo(10) }),
        row("checked", 6, { checkedAt: daysAgo(5) }),
        row("error", 7, { status: "error", error: "blocked" }),
        row("reading", 8, { status: "reading", readStartedAt: minutesAgo(1) }),
        row("archived", 9),
        row("moved", 10),
      ],
      sites: [
        owner("active", on("active")),
        owner("inactive", undefined),
        owner("off", { url: urlOf("off"), active: false }),
        owner("pasted", on("pasted")),
        owner("recent", on("recent")),
        owner("checked", on("checked")),
        owner("error", on("error")),
        owner("reading", on("reading")),
        owner("archived", on("archived"), { status: "archived" }),
        // Réglage resté sur une autre adresse que la ligne : état douteux, on ne relit pas
        owner("moved", on("ailleurs")),
      ],
    });
    const { reader, calls } = fakeReader((url) => okRead({ url, pages: PAGES }));
    expect(await refresh(handle, reader, fakeExtractor().extractor)).toEqual({ checked: 1, changed: 0, failed: 0 });
    expect(calls.map((call) => call.url)).toEqual([urlOf("active")]);
    expect(handle.rows(externalSites).filter((r) => r.checkedAt !== null && (r.checkedAt as Date).getTime() === NOW.getTime()).map((r) => r.siteId)).toEqual([SITE_ID]);
  });

  it("au plus 5 sites par passage, les plus anciens d'abord ; les suivants attendent le passage suivant", async () => {
    const siteIds = Array.from({ length: 8 }, (_, i) => `b0000000-0000-4000-8000-00000000000${i}`);
    const ages = [35, 80, 50, 31, 120, 60, 45, 33];
    const urlOf = (i: number) => `https://www.cabinet-${i}.fr`;
    const handle = memoryDb({
      external: siteIds.map((siteId, i) => due({ siteId, url: urlOf(i), measureKey: String(i).padStart(24, "m"), readAt: daysAgo(ages[i]!) })),
      sites: siteIds.map((id, i) => siteRow({ id, slug: `site-${i}`, theme: themeWith({ url: urlOf(i), active: true }) })),
    });
    const { reader, calls } = fakeReader((url) => okRead({ url }));
    const { extractor } = fakeExtractor();
    expect(await refresh(handle, reader, extractor)).toEqual({ checked: 5, changed: 0, failed: 0 });
    expect(calls.map((call) => call.url)).toEqual([4, 1, 5, 2, 6].map(urlOf));
    expect(calls.map((call) => call.context.siteId)).toEqual([4, 1, 5, 2, 6].map((i) => siteIds[i]));
    // Passage suivant : les trois restants
    calls.length = 0;
    expect(await refresh(handle, reader, extractor)).toEqual({ checked: 3, changed: 0, failed: 0 });
    expect(calls.map((call) => call.url)).toEqual([0, 7, 3].map(urlOf));
    expect(await refresh(handle, reader, extractor)).toEqual({ checked: 0, changed: 0, failed: 0 });
  });

  it("budget de temps : un site n'est entamé que s'il reste le temps d'une lecture complète", async () => {
    const siteIds = Array.from({ length: 4 }, (_, i) => `c0000000-0000-4000-8000-00000000000${i}`);
    const urlOf = (i: number) => `https://www.cabinet-${i}.fr`;
    const seed = (): Seed => ({
      external: siteIds.map((siteId, i) => due({ siteId, url: urlOf(i), measureKey: String(i).padStart(24, "t"), readAt: daysAgo(90 - i) })),
      sites: siteIds.map((id, i) => siteRow({ id, slug: `site-${i}`, theme: themeWith({ url: urlOf(i), active: true }) })),
    });
    // Chaque relecture prend 80 s : après la troisième, il ne reste plus EXTERNAL_READ_DEADLINE_MS avant la fin du budget
    const slow = (ms: number) =>
      fakeReader((url) => {
        vi.setSystemTime(new Date(Date.now() + ms));
        return okRead({ url });
      });
    const first = slow(80_000);
    expect(EXTERNAL_REFRESH_BUDGET_MS - 3 * 80_000).toBeLessThan(EXTERNAL_READ_DEADLINE_MS);
    expect(await refresh(memoryDb(seed()), first.reader, fakeExtractor().extractor)).toEqual({ checked: 3, changed: 0, failed: 0 });
    expect(first.calls.map((call) => call.url)).toEqual([0, 1, 2].map(urlOf));

    // Échéance commune du cron : passée ou trop proche, aucun site n'est entamé ; plus lointaine que le budget, c'est le budget qui borne
    vi.setSystemTime(NOW);
    for (const deadline of [new Date(NOW.getTime() - 1), new Date(NOW.getTime() + EXTERNAL_READ_DEADLINE_MS - 1)]) {
      const none = slow(1_000);
      const handle = memoryDb(seed());
      expect(await refresh(handle, none.reader, fakeExtractor().extractor, deadline)).toEqual({ checked: 0, changed: 0, failed: 0 });
      expect(none.calls).toEqual([]);
      expect(handle.rows(externalSites).every((r) => r.checkedAt === null)).toBe(true);
    }
    vi.setSystemTime(NOW);
    const two = slow(60_000);
    expect(await refresh(memoryDb(seed()), two.reader, fakeExtractor().extractor, new Date(NOW.getTime() + EXTERNAL_READ_DEADLINE_MS + 60_000))).toEqual({ checked: 2, changed: 0, failed: 0 });
    vi.setSystemTime(NOW);
    const all = slow(1_000);
    expect(await refresh(memoryDb(seed()), all.reader, fakeExtractor().extractor, new Date(NOW.getTime() + 3_600_000))).toEqual({ checked: 4, changed: 0, failed: 0 });
  });

  it("le site répond sur l'autre variante « www. » : adresse et réglage mis à jour avec le nouveau profil", async () => {
    const handle = memoryDb({ external: [due()], sites: [activeSiteRow()] });
    expect(await refresh(handle, fakeReader(() => okRead({ url: BARE_URL, pages: NEW_PAGES })).reader, fakeExtractor(() => NEW_PROFILE).extractor)).toEqual({ checked: 1, changed: 1, failed: 0 });
    expect(external(handle)).toMatchObject({ url: BARE_URL, profile: NEW_PROFILE });
    expect(themeOf(handle)).toEqual(themeWith({ url: BARE_URL, active: true }));
    expect(handle.locks).toEqual([LOCK_KEY]);
    expect(writesOutsideTx(handle, sites)).toEqual([]);
  });

  it("le praticien a relancé une lecture pendant la relecture : son résultat l'emporte, rien n'est écrasé", async () => {
    const restarted = memoryDb({ external: [due()], sites: [activeSiteRow()] });
    const during = fakeReader(() => {
      restarted.patch(externalSites, { status: "reading", readStartedAt: NOW });
      return okRead({ pages: NEW_PAGES });
    });
    expect(await refresh(restarted, during.reader, fakeExtractor(() => NEW_PROFILE).extractor)).toEqual({ checked: 0, changed: 0, failed: 0 });
    // Seule la date du contrôle, inscrite avant la lecture, a été écrite
    expect(external(restarted)).toMatchObject({ status: "reading", pages: PAGES, profile: PROFILE, checkedAt: NOW });

    // Lecture du praticien terminée entre-temps : la relecture, partie d'un état plus ancien, n'est pas inscrite
    const finished = memoryDb({ external: [due()], sites: [activeSiteRow()] });
    const fresh = { readAt: new Date(NOW.getTime() - 1_000), profile: { ...PROFILE, headline: "Lu à l'instant" } };
    const after = fakeReader(() => {
      finished.patch(externalSites, fresh);
      return okRead({ pages: NEW_PAGES });
    });
    expect(await refresh(finished, after.reader, fakeExtractor(() => NEW_PROFILE).extractor)).toEqual({ checked: 0, changed: 0, failed: 0 });
    expect(external(finished)).toMatchObject({ ...fresh, pages: PAGES, checkedAt: NOW });
  });

  it("site déconnecté ou passé en texte collé depuis la sélection : ignoré", async () => {
    const siteIds = [SITE_ID, OTHER_SITE_ID];
    const handle = memoryDb({
      external: siteIds.map((siteId, i) => due({ siteId, measureKey: String(i).padStart(24, "d"), readAt: daysAgo(90 - i) })),
      sites: siteIds.map((id, i) => siteRow({ id, slug: `site-${i}`, theme: themeWith(ACTIVE) })),
    });
    const { reader, calls } = fakeReader(() => {
      // Pendant la relecture du premier, le second colle un texte
      handle.patch(externalSites, { source: "pasted" }, (row) => row.siteId === OTHER_SITE_ID);
      return okRead();
    });
    expect(await refresh(handle, reader, fakeExtractor().extractor)).toEqual({ checked: 1, changed: 0, failed: 0 });
    expect(calls).toHaveLength(1);
  });

  it("rien à relire : ni lecteur ni extracteur ne sont créés ; à relire sans eux : le passage échoue en entier, sans repousser les sites", async () => {
    expect(await refreshExternalSites(memoryDb({ external: [externalRow()], sites: [activeSiteRow()] }).db, { now: NOW, env: ENV })).toEqual({ checked: 0, changed: 0, failed: 0 });
    expect(await refreshExternalSites(memoryDb().db, { now: NOW, env: ENV })).toEqual({ checked: 0, changed: 0, failed: 0 });
    expect(factories.createWebsiteReader).not.toHaveBeenCalled();
    expect(factories.createExternalProfileExtractor).not.toHaveBeenCalled();

    const before = due();
    const handle = memoryDb({ external: [before], sites: [activeSiteRow()] });
    await expect(refreshExternalSites(handle.db, { now: NOW, env: ENV })).rejects.toThrow("Lecteur réel interdit");
    await expect(refreshExternalSites(handle.db, { reader: fakeReader().reader, now: NOW, env: ENV })).rejects.toThrow("Extracteur réel interdit");
    expect(external(handle)).toEqual(before);

    // Fabriques de l'environnement donné, créées une seule fois pour le passage
    const { reader, calls } = fakeReader();
    factories.createWebsiteReader.mockReturnValueOnce(reader);
    factories.createExternalProfileExtractor.mockReturnValueOnce(fakeExtractor().extractor);
    expect(await refreshExternalSites(handle.db, { now: NOW, env: ENV })).toEqual({ checked: 1, changed: 0, failed: 0 });
    expect(factories.createWebsiteReader).toHaveBeenLastCalledWith(ENV);
    expect(factories.createExternalProfileExtractor).toHaveBeenLastCalledWith(ENV);
    expect(calls).toHaveLength(1);
  });

  it("table absente : rien à faire, sans erreur ; toute autre erreur de base est levée", async () => {
    expect(await refresh(memoryDb({}, { fail: missing(externalSites) }), fakeReader().reader, fakeExtractor().extractor)).toEqual({ checked: 0, changed: 0, failed: 0 });
    await expect(refresh(memoryDb({}, { fail: connectionLost }), fakeReader().reader, fakeExtractor().extractor)).rejects.toThrow("connection terminated");
  });

  it("la base lâche pendant la relecture d'un site : compté en échec, rien n'est levé", async () => {
    const handle = memoryDb({ external: [due()], sites: [activeSiteRow()] });
    const { reader } = fakeReader(() => {
      handle.failWith(connectionLost);
      return okRead({ pages: NEW_PAGES });
    });
    await expect(refresh(handle, reader, fakeExtractor().extractor)).resolves.toEqual({ checked: 1, changed: 0, failed: 1 });
    handle.failWith(undefined);
    // Le contrôle était déjà daté quand la base a lâché : le site ne repassera pas en tête de file au prochain passage
    expect(external(handle)).toMatchObject({ profile: PROFILE, checkedAt: NOW });
    // Le journal porte le code de l'erreur, jamais son message (une erreur de base recopie la requête et ses paramètres)
    expect(logged()).toMatch(/relecture du site .* interrompue \(08006\)/);
    expect(logged()).not.toContain("connection terminated");
  });
});
