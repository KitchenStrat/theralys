import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { Column, SQL, getTableColumns, getTableName, is, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  META_LIBRARY_BULK_MAX,
  META_LIBRARY_KEPT_MAX,
  META_LIBRARY_VIDEO_MAX_BYTES,
  META_MEDIA_LOOKUPS_PER_MONTH,
  META_MEDIA_LOOKUP_COST_USD,
  META_MEDIA_POSTER_WIDTH,
  type MetaAdMedia,
  type MetaAdsMarket,
  type MetaMarketAd,
} from "@theralys/shared";
import { googleUsage, metaAdMedia, metaAdsAnalyses, metaAdsLibrary, type Database } from "@theralys/db";
import { AdMediaError, MockAdMediaProvider, type AdMediaLookup, type AdMediaProvider } from "@theralys/providers/meta/media";
import {
  META_LIBRARY_COPY_DEADLINE_MS,
  META_MEDIA_AVATAR_WIDTH,
  META_MEDIA_CONCURRENCY,
  META_MEDIA_IMAGE_MAX_BYTES,
  META_MEDIA_MISSING_RETRY_DAYS,
  cachedMediaUsable,
  currentMarketAds,
  dismissMetaAds,
  downloadMetaCdn,
  enrichAdsMedia,
  isMetaLibrarySchemaMissing,
  keepMetaAds,
  libraryForAnalysis,
  libraryVideoUrls,
  loadMetaLibrary,
  loadMetaMedia,
  materializeMedia,
  mediaLookupsRemaining,
  mediaLookupsUsed,
  mediaProviderFor,
  metaAdVideoSource,
  recordMediaUsage,
  restoreMetaAds,
  type MediaEnrichmentDeps,
  type MetaMediaStore,
} from "./meta-library";

const NOW = new Date("2026-10-26T06:00:00Z");
const DAY_MS = 86_400_000;
/** Expiration des liens d'origine : encore servis / plus servis à NOW */
const FRESH = new Date("2026-11-20T00:00:00Z");
const EXPIRED = new Date("2026-10-20T00:00:00Z");
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SITE_ID = "99999999-9999-4999-8999-999999999999";
const SITE = { id: SITE_ID };

/** Identifiants d'annonces (chiffres seulement, comme dans la bibliothèque Meta) */
const A = "700000000000001";
const B = "700000000000002";
const C = "700000000000003";
const D = "700000000000004";
const UNKNOWN = "799999999999999";

// ─── Liens du CDN de Meta et réponses de téléchargement ──────────────────────

/** Paramètre `oe` d'un lien du CDN : secondes Unix en hexadécimal. */
const oe = (expires: Date) => Math.floor(expires.getTime() / 1000).toString(16).toUpperCase();
const cdnImage = (name: string, expires: Date = FRESH) => `https://scontent-cdg4-2.xx.fbcdn.net/v/t39.35426-6/${name}.jpg?stp=dst-jpg_s600x600&ccb=1-7&oe=${oe(expires)}`;
const cdnVideo = (name: string, expires: Date = FRESH) => `https://video-cdg4-1.xx.fbcdn.net/v/t42.1790-2/${name}.mp4?ccb=1-7&oe=${oe(expires)}`;

const IMAGE_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const VIDEO_BYTES = Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);

function bytesResponse(bytes: Uint8Array, contentType: string | null, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(bytes, { status: init.status ?? 200, headers: { ...(contentType ? { "content-type": contentType } : {}), ...init.headers } });
}

/** Réponse en flux, sans taille déclarée ; `cancelled()` dit si la lecture a été abandonnée. */
function streamResponse(chunks: Uint8Array[], contentType: string) {
  let cancelled = false;
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { response: new Response(body, { status: 200, headers: { "content-type": contentType } }), cancelled: () => cancelled, pulled: () => index };
}

type FetchCall = { url: string; init: RequestInit | undefined };

/** `fetch` simulé : appels enregistrés, réponse (ou erreur) choisie par URL. */
function stubFetch(respond: (url: string, call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return respond(call.url, call);
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

/** CDN de Meta simulé : octets d'image ou de vidéo selon l'extension du lien. */
function cdn(overrides: { image?: (url: string) => Response; video?: (url: string) => Response } = {}) {
  return stubFetch((url) => (new URL(url).pathname.endsWith(".mp4") ? (overrides.video?.(url) ?? bytesResponse(VIDEO_BYTES, "video/mp4")) : (overrides.image?.(url) ?? bytesResponse(IMAGE_BYTES, "image/jpeg"))));
}

// ─── Fournisseur et stockage simulés ─────────────────────────────────────────

function imageLookup(adId: string, overrides: Partial<AdMediaLookup> = {}): AdMediaLookup {
  return {
    adId,
    format: "image",
    variants: false,
    items: [{ kind: "image", imageUrl: cdnImage(`${adId}-0`), videoUrl: null }],
    avatarUrl: cdnImage(`${adId}-avatar`),
    ctaText: "En savoir plus",
    linkUrl: "https://cabinet-martin.fr/rendez-vous",
    pageCategories: ["Osteopathic Doctor"],
    pageLikes: 412,
    expiresAt: FRESH.toISOString(),
    ...overrides,
  };
}

function videoLookup(adId: string, overrides: Partial<AdMediaLookup> = {}): AdMediaLookup {
  return imageLookup(adId, { format: "video", items: [{ kind: "video", imageUrl: cdnImage(`${adId}-affiche`), videoUrl: cdnVideo(`${adId}-0`) }], ...overrides });
}

/** Fournisseur de visuels simulé : appels enregistrés, pic de recherches simultanées mesuré. */
function fakeMediaProvider(respond: (adId: string, index: number) => AdMediaLookup | null = (adId) => imageLookup(adId), mode: AdMediaProvider["mode"] = "scrapecreators") {
  const calls: string[] = [];
  let active = 0;
  let peak = 0;
  const provider: AdMediaProvider = {
    mode,
    lookup: async (adId) => {
      const index = calls.push(adId) - 1;
      active++;
      peak = Math.max(peak, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return respond(adId, index);
      } finally {
        active--;
      }
    },
  };
  return { provider, calls, peak: () => peak };
}

/** Stockage simulé : copies enregistrées, URL publique dérivée de la clé ; échecs au choix. */
function fakeStore(options: { putImage?: (key: string) => string | null; putFile?: (key: string) => string | null; remove?: () => Promise<void> } = {}) {
  const images: { key: string; bytes: Uint8Array; maxWidth: number }[] = [];
  const files: { key: string; bytes: Uint8Array; contentType: string }[] = [];
  const removed: string[][] = [];
  const store: MetaMediaStore = {
    putImage: async (key, bytes, opts) => {
      images.push({ key, bytes, maxWidth: opts.maxWidth });
      return options.putImage ? options.putImage(key) : `https://blob.test/${key}`;
    },
    putFile: async (key, bytes, contentType) => {
      files.push({ key, bytes, contentType });
      return options.putFile ? options.putFile(key) : `https://blob.test/${key}`;
    },
    remove: async (urls) => {
      removed.push([...urls]);
      if (options.remove) await options.remove();
    },
  };
  return { store, images, files, removed };
}

// ─── Lignes des tables ───────────────────────────────────────────────────────

function imageMedia(adId: string, overrides: Partial<MetaAdMedia> = {}): MetaAdMedia {
  return {
    version: 1,
    format: "image",
    variants: false,
    items: [{ kind: "image", posterUrl: `https://blob.test/meta-media/${adId}/0.jpg`, sourceImageUrl: cdnImage(`${adId}-0`), sourceVideoUrl: null }],
    avatarUrl: `https://blob.test/meta-media/${adId}/avatar.jpg`,
    ctaText: "En savoir plus",
    linkUrl: "https://cabinet-martin.fr/rendez-vous",
    pageCategories: ["Osteopathic Doctor"],
    pageLikes: 412,
    sourceExpiresAt: FRESH.toISOString(),
    fetchedAt: NOW.toISOString(),
    source: "scrapecreators",
    ...overrides,
  };
}

function videoMedia(adId: string, overrides: Partial<MetaAdMedia> = {}): MetaAdMedia {
  return imageMedia(adId, { format: "video", items: [{ kind: "video", posterUrl: `https://blob.test/meta-media/${adId}/0.jpg`, sourceImageUrl: cdnImage(`${adId}-affiche`), sourceVideoUrl: cdnVideo(`${adId}-0`) }], ...overrides });
}

function marketAd(id: string, overrides: Partial<MetaMarketAd> = {}): MetaMarketAd {
  return {
    id,
    pageId: `9${id}`,
    pageName: `Cabinet ${id.slice(-3)}`,
    bodies: ["Une séance pour souffler."],
    titles: ["Sophrologie à Albi"],
    descriptions: [],
    captions: [],
    libraryUrl: `https://www.facebook.com/ads/library/?id=${id}`,
    startedAt: "2026-09-01T00:00:00.000Z",
    stoppedAt: null,
    platforms: ["facebook"],
    languages: ["fr"],
    euTotalReach: 5_000,
    targetAges: null,
    targetGender: null,
    targetLocations: [{ name: "Albi", type: "city", excluded: false }],
    payer: null,
    scope: "ville",
    active: true,
    runningDays: 55,
    signal: "moyen",
    score: 6.03,
    matchedTerms: ["sophrologue"],
    rank: 1,
    rankTotal: 3,
    ...overrides,
  };
}

type Row = Record<string, unknown>;

let rowSeq = 0;
const rowId = () => `00000000-0000-4000-8000-${String(++rowSeq).padStart(12, "0")}`;

function mediaRow(adId: string, media: MetaAdMedia | null, overrides: Row = {}): Row {
  return { adId, status: media === null ? "missing" : media.items.length > 0 ? "ok" : "empty", media, provider: "scrapecreators", fetchedAt: NOW, updatedAt: NOW, ...overrides };
}

function libraryRow(adId: string, status: "kept" | "dismissed", overrides: Row = {}): Row {
  const ad = status === "kept" ? marketAd(adId) : null;
  return { id: rowId(), siteId: SITE_ID, adId, status, pageName: `Cabinet ${adId.slice(-3)}`, ad, media: null, createdAt: NOW, updatedAt: NOW, ...overrides };
}

function usageRow(requests: number, overrides: Row = {}): Row {
  return { id: rowId(), siteId: SITE_ID, month: "2026-10", kind: "meta_media", costUsd: 0, requests, createdAt: NOW, ...overrides };
}

/** Analyse du site avec sa veille (`ads` null : veille indisponible). */
function analysisRow(ads: MetaMarketAd[] | null, overrides: Row = {}): Row {
  const market: MetaAdsMarket | null = ads && {
    version: 1,
    source: "meta",
    fetchedAt: NOW.toISOString(),
    country: "FR",
    terms: ["sophrologue"],
    scopeUsed: "ville",
    counts: { ville: ads.length, departement: 0, region: 0, france: 0 },
    ads,
    calls: 1,
    truncated: false,
    insights: null,
  };
  return { id: rowId(), siteId: SITE_ID, status: "done", market, createdAt: NOW, updatedAt: NOW, ...overrides };
}

// ─── Base simulée en mémoire ─────────────────────────────────────────────────

type DbOp = "select" | "insert" | "delete";
type Seed = { media?: Row[]; library?: Row[]; usage?: Row[]; analyses?: Row[] };

const DIALECT = new PgDialect();
/** Contraintes d'unicité (cibles acceptées par ON CONFLICT) */
const UNIQUE_KEYS = new Map<Table, string[]>([
  [metaAdMedia, ["adId"]],
  [metaAdsLibrary, ["siteId", "adId"]],
]);

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

/**
 * Condition drizzle → prédicat : la condition est rendue en SQL par le
 * dialecte PostgreSQL, puis relue (égalités et `in` reliés par `and` sur les
 * colonnes de la table). Toute autre forme lève : la base simulée ne fait pas
 * semblant de filtrer.
 */
function predicateOf(table: Table, condition: unknown): (row: Row) => boolean {
  if (condition === undefined) return () => true;
  const { sql: text, params } = DIALECT.sqlToQuery(condition as SQL);
  const name = getTableName(table);
  const keys = keysBySqlName(table);
  const inner = text.startsWith("(") && text.endsWith(")") ? text.slice(1, -1) : text;
  const tests = inner.split(" and ").map((atom) => {
    const match = /^"([^"]+)"\."([^"]+)" (?:= (\$\d+)|in \((\$\d+(?:, \$\d+)*)\))$/.exec(atom);
    const key = match && match[1] === name ? keys.get(match[2]!) : undefined;
    if (!match || !key) throw new Error(`Condition non simulée sur ${name} : ${atom}`);
    const values = [...(match[3] ?? match[4]!).matchAll(/\$(\d+)/g)].map((param) => params[Number(param[1]) - 1]);
    return (row: Row) => values.includes(row[key]);
  });
  return (row) => tests.every((test) => test(row));
}

function compareValues(a: unknown, b: unknown): number {
  const left = a instanceof Date ? a.getTime() : a;
  const right = b instanceof Date ? b.getTime() : b;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

/** Clauses `orderBy` (colonne, `asc`, `desc`) → comparateur. */
function orderOf(table: Table, clauses: unknown[]): (a: Row, b: Row) => number {
  const name = getTableName(table);
  const keys = keysBySqlName(table);
  const sorters = clauses.map((clause) => {
    const text = is(clause, Column) ? `"${name}"."${clause.name}"` : DIALECT.sqlToQuery(clause as SQL).sql;
    const match = /^"([^"]+)"\."([^"]+)"(?: (asc|desc))?$/.exec(text);
    const key = match && match[1] === name ? keys.get(match[2]!) : undefined;
    if (!match || !key) throw new Error(`Tri non simulé sur ${name} : ${text}`);
    const direction = match[3] === "desc" ? -1 : 1;
    return (a: Row, b: Row) => direction * compareValues(a[key], b[key]);
  });
  return (a, b) => {
    for (const sorter of sorters) {
      const order = sorter(a, b);
      if (order !== 0) return order;
    }
    return 0;
  };
}

/** Projection d'un `select` : ligne entière, colonnes nommées, ou somme `coalesce(sum(colonne), 0)`. */
function project(table: Table, fields: Record<string, unknown> | undefined, rows: Row[]): Row[] {
  if (!fields) return rows.map(clone);
  const entries = Object.entries(fields);
  if (entries.some(([, field]) => is(field, SQL))) {
    const keys = keysBySqlName(table);
    return [
      Object.fromEntries(
        entries.map(([alias, field]) => {
          const text = DIALECT.sqlToQuery(field as SQL).sql;
          const match = /^coalesce\(sum\("([^"]+)"\."([^"]+)"\), 0\)$/.exec(text);
          const key = match && match[1] === getTableName(table) ? keys.get(match[2]!) : undefined;
          if (!key) throw new Error(`Agrégat non simulé : ${text}`);
          // PostgreSQL rend la somme d'entiers en bigint, que le pilote livre en texte
          return [alias, String(rows.reduce((sum, row) => sum + Number(row[key]), 0))];
        }),
      ),
    ];
  }
  return rows.map((row) => Object.fromEntries(entries.map(([alias, column]) => [alias, clone(row[keyOfColumn(table, column)])])));
}

/** Erreur du pilote pour une table absente (migration non appliquée), enveloppée par drizzle dans `cause`. */
function missingTableError(table: Table): Error {
  const name = getTableName(table);
  return new Error(`Failed query: select from "${name}"`, { cause: Object.assign(new Error(`relation "${name}" does not exist`), { code: "42P01", severity: "ERROR" }) });
}

/** Échec de toutes les requêtes sur ces tables : table absente. */
const missing =
  (...tables: Table[]) =>
  (_op: DbOp, table: Table): Error | null =>
    tables.includes(table) ? missingTableError(table) : null;

/**
 * Base en mémoire qui exécute pour de bon les requêtes de `meta-library.ts` :
 * `select` (projection, `where`, `orderBy`, `limit`), `insert` (avec ou sans
 * `onConflictDoUpdate`, contraintes d'unicité respectées) et `delete`
 * (`returning`). `fail` injecte une erreur par opération et par table.
 */
function memoryDb(seed: Seed = {}, options: { fail?: (op: DbOp, table: Table) => Error | null } = {}) {
  const tables = new Map<Table, Row[]>([
    [metaAdMedia, clone(seed.media ?? [])],
    [metaAdsLibrary, clone(seed.library ?? [])],
    [googleUsage, clone(seed.usage ?? [])],
    [metaAdsAnalyses, clone(seed.analyses ?? [])],
  ]);
  const log: { op: DbOp; table: string }[] = [];
  const rowsOf = (table: Table): Row[] => {
    const rows = tables.get(table);
    if (!rows) throw new Error(`Table non simulée : ${getTableName(table)}`);
    return rows;
  };
  const exec = async <T>(op: DbOp, table: Table, run: () => T): Promise<T> => {
    log.push({ op, table: getTableName(table) });
    const failure = options.fail?.(op, table);
    if (failure) throw failure;
    return run();
  };
  type Thenable<T> = { then: <R>(resolve: (value: T) => R, reject?: (reason: unknown) => R) => Promise<R> };
  const lazy = <T>(run: () => Promise<T>): Thenable<T> => ({ then: (resolve, reject) => run().then(resolve, reject) });

  const db = {
    select: (fields?: Record<string, unknown>) => ({
      from: (table: Table) => {
        const state: { condition: unknown; order: unknown[]; limit: number | null } = { condition: undefined, order: [], limit: null };
        const chain = {
          where: (condition: unknown) => {
            state.condition = condition;
            return chain;
          },
          orderBy: (...clauses: unknown[]) => {
            state.order = clauses;
            return chain;
          },
          limit: (count: number) => {
            state.limit = count;
            return chain;
          },
          ...lazy(() =>
            exec("select", table, () => {
              let rows = rowsOf(table).filter(predicateOf(table, state.condition));
              if (state.order.length > 0) rows = [...rows].sort(orderOf(table, state.order));
              if (state.limit !== null) rows = rows.slice(0, state.limit);
              return project(table, fields, rows);
            }),
          ),
        };
        return chain;
      },
    }),
    insert: (table: Table) => ({
      values: (values: Row) => {
        const run = (conflict?: { target: unknown; set: Row }) =>
          exec("insert", table, () => {
            const rows = rowsOf(table);
            const unique = UNIQUE_KEYS.get(table);
            if (conflict) {
              const target = (Array.isArray(conflict.target) ? conflict.target : [conflict.target]).map((column) => keyOfColumn(table, column));
              if (!unique || [...target].sort().join() !== [...unique].sort().join()) {
                throw Object.assign(new Error("there is no unique or exclusion constraint matching the ON CONFLICT specification"), { code: "42P10" });
              }
            }
            const existing = unique ? rows.find((row) => unique.every((key) => row[key] === values[key])) : undefined;
            if (existing && !conflict) throw Object.assign(new Error(`duplicate key value violates unique constraint on "${getTableName(table)}"`), { code: "23505" });
            if (existing && conflict) Object.assign(existing, clone(conflict.set));
            else rows.push({ ...("id" in getTableColumns(table) ? { id: rowId() } : {}), ...clone(values) });
            return [] as Row[];
          });
        return { ...lazy(() => run()), onConflictDoUpdate: (conflict: { target: unknown; set: Row }) => lazy(() => run(conflict)) };
      },
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
  };
  return {
    db: db as unknown as Database,
    /** Lignes actuelles d'une table (copie) */
    rows: (table: Table): Row[] => clone(rowsOf(table)),
    log,
    /** Requêtes d'un type donné sur une table */
    count: (op: DbOp, table: Table) => log.filter((entry) => entry.op === op && entry.table === getTableName(table)).length,
  };
}

const enrichDeps = (overrides: Partial<MediaEnrichmentDeps> = {}): MediaEnrichmentDeps => ({ provider: null, store: null, now: NOW, budget: 100, ...overrides });

/** Journaux `[meta-ads]` muets pendant les tests (et consultables). */
let logs: { warn: MockInstance; error: MockInstance };
beforeEach(() => {
  logs = { warn: vi.spyOn(console, "warn").mockImplementation(() => {}), error: vi.spyOn(console, "error").mockImplementation(() => {}) };
});
afterEach(() => {
  logs.warn.mockRestore();
  logs.error.mockRestore();
});

// ─── Schéma absent ───────────────────────────────────────────────────────────

describe("isMetaLibrarySchemaMissing", () => {
  const pgError = (code: unknown, message = 'relation "meta_ad_media" does not exist') => Object.assign(new Error(message), { code });

  it("code 42P01 (table absente) ou 42703 (colonne absente) porté par l'erreur elle-même", () => {
    expect(isMetaLibrarySchemaMissing(pgError("42P01"))).toBe(true);
    expect(isMetaLibrarySchemaMissing(pgError("42703", 'column "media" does not exist'))).toBe(true);
  });

  it("code enveloppé dans `cause` par le pilote ou par drizzle, sur plusieurs niveaux", () => {
    expect(isMetaLibrarySchemaMissing(new Error("Failed query: select …", { cause: pgError("42P01") }))).toBe(true);
    expect(isMetaLibrarySchemaMissing(new Error("action", { cause: new Error("Failed query", { cause: pgError("42P01") }) }))).toBe(true);
    expect(isMetaLibrarySchemaMissing(missingTableError(metaAdsLibrary))).toBe(true);
  });

  it("autres erreurs → false : autre code, pas de code, message seul, valeurs qui ne sont pas des erreurs, chaîne de causes circulaire", () => {
    expect(isMetaLibrarySchemaMissing(pgError("23505", "duplicate key value"))).toBe(false);
    expect(isMetaLibrarySchemaMissing(pgError("08006", "connection failure"))).toBe(false);
    expect(isMetaLibrarySchemaMissing(pgError(42))).toBe(false);
    expect(isMetaLibrarySchemaMissing(new Error('relation "meta_ad_media" does not exist (42P01)'))).toBe(false);
    expect(isMetaLibrarySchemaMissing(new Error("Failed query", { cause: pgError("23505") }))).toBe(false);
    expect(isMetaLibrarySchemaMissing(null)).toBe(false);
    expect(isMetaLibrarySchemaMissing(undefined)).toBe(false);
    expect(isMetaLibrarySchemaMissing("42P01")).toBe(false);
    const first = new Error("a");
    const second = new Error("b", { cause: first });
    first.cause = second;
    expect(isMetaLibrarySchemaMissing(first)).toBe(false);
  });
});

// ─── Téléchargement ──────────────────────────────────────────────────────────

describe("downloadMetaCdn", () => {
  const image = cdnImage("visuel");
  const options = (overrides: Partial<Parameters<typeof downloadMetaCdn>[1]> = {}) => ({ accept: "image" as const, maxBytes: 1_000, ...overrides });

  it("succès : octets et type de contenu rendus ; un GET sans redirection (`redirect: \"error\"`), annulable", async () => {
    const { calls, impl } = stubFetch(() => bytesResponse(IMAGE_BYTES, "image/jpeg"));
    const file = await downloadMetaCdn(image, options({ fetchImpl: impl }));
    expect(file).not.toBeNull();
    expect([...file!.bytes]).toEqual([...IMAGE_BYTES]);
    expect(file!.contentType).toBe("image/jpeg");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(image);
    expect(calls[0]!.init).toMatchObject({ method: "GET", redirect: "error" });
    expect(calls[0]!.init!.signal).toBeInstanceOf(AbortSignal);
    // Aucun en-tête ajouté (ni clé ni cookie vers le CDN)
    expect(calls[0]!.init!.headers).toBeUndefined();
  });

  it("type de contenu normalisé (minuscules, sans paramètres) ; flux en plusieurs morceaux réassemblé dans l'ordre ; vidéo acceptée quand elle est attendue", async () => {
    const mixed = stubFetch(() => bytesResponse(IMAGE_BYTES, "Image/JPEG; charset=binary"));
    expect((await downloadMetaCdn(image, options({ fetchImpl: mixed.impl })))!.contentType).toBe("image/jpeg");
    const stream = streamResponse([Uint8Array.from([1, 2, 3]), Uint8Array.from([4]), Uint8Array.from([5, 6])], "image/webp");
    const chunked = await downloadMetaCdn(image, options({ fetchImpl: stubFetch(() => stream.response).impl }));
    expect([...chunked!.bytes]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(chunked!.contentType).toBe("image/webp");
    const clip = await downloadMetaCdn(cdnVideo("clip"), { accept: "video", maxBytes: 1_000, fetchImpl: stubFetch(() => bytesResponse(VIDEO_BYTES, "video/mp4")).impl });
    expect(clip).toMatchObject({ contentType: "video/mp4" });
    expect([...clip!.bytes]).toEqual([...VIDEO_BYTES]);
  });

  it("refuse les hôtes hors CDN de Meta, le http et les adresses vides : null sans aucun appel", async () => {
    const { calls, impl } = stubFetch(() => bytesResponse(IMAGE_BYTES, "image/jpeg"));
    for (const url of [
      "https://cdn.exemple.fr/visuel.jpg",
      "https://scontent.xx.fbcdn.net.exemple.fr/visuel.jpg",
      "https://faux-fbcdn.net/visuel.jpg",
      image.replace("https://", "http://"),
      "https://127.0.0.1/visuel.jpg",
      "https://localhost/visuel.jpg",
      "file:///etc/passwd",
      "data:image/svg+xml;utf8,%3Csvg%2F%3E",
      "pas une adresse",
      "",
      null,
      undefined,
    ]) {
      expect(await downloadMetaCdn(url, options({ fetchImpl: impl }))).toBeNull();
    }
    expect(calls).toHaveLength(0);
    // Instagram partage le CDN de Meta
    expect(await downloadMetaCdn("https://scontent-cdg4-1.cdninstagram.com/v/t51.2885-15/insta.jpg", options({ fetchImpl: impl }))).not.toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("mauvais type de contenu → null (page HTML, vidéo à la place d'une image, image à la place d'une vidéo, type absent)", async () => {
    const respond = (contentType: string | null) => stubFetch(() => bytesResponse(IMAGE_BYTES, contentType)).impl;
    expect(await downloadMetaCdn(image, options({ fetchImpl: respond("text/html; charset=utf-8") }))).toBeNull();
    expect(await downloadMetaCdn(image, options({ fetchImpl: respond("video/mp4") }))).toBeNull();
    expect(await downloadMetaCdn(image, options({ fetchImpl: respond("application/octet-stream") }))).toBeNull();
    expect(await downloadMetaCdn(image, options({ fetchImpl: respond(null) }))).toBeNull();
    expect(await downloadMetaCdn(cdnVideo("clip"), options({ accept: "video", fetchImpl: respond("image/jpeg") }))).toBeNull();
  });

  it("taille déclarée au-dessus du plafond → null sans lire le corps ; à la limite → accepté", async () => {
    const big = streamResponse([IMAGE_BYTES], "image/jpeg");
    big.response.headers.set("content-length", "1001");
    expect(await downloadMetaCdn(image, options({ fetchImpl: stubFetch(() => big.response).impl }))).toBeNull();
    expect(big.pulled()).toBeLessThanOrEqual(1);
    const exact = stubFetch(() => bytesResponse(IMAGE_BYTES, "image/jpeg"));
    const file = await downloadMetaCdn(image, options({ maxBytes: IMAGE_BYTES.byteLength, fetchImpl: exact.impl }));
    expect(file!.bytes.byteLength).toBe(IMAGE_BYTES.byteLength);
  });

  it("taille réelle au-dessus du plafond (flux sans taille déclarée, ou taille déclarée mensongère) → null, lecture abandonnée", async () => {
    const chunk = new Uint8Array(6);
    const endless = streamResponse([chunk, chunk, chunk, chunk], "image/jpeg");
    expect(await downloadMetaCdn(image, options({ maxBytes: 10, fetchImpl: stubFetch(() => endless.response).impl }))).toBeNull();
    expect(endless.cancelled()).toBe(true);
    const lying = streamResponse([chunk, chunk], "image/jpeg");
    lying.response.headers.set("content-length", "4");
    expect(await downloadMetaCdn(image, options({ maxBytes: 10, fetchImpl: stubFetch(() => lying.response).impl }))).toBeNull();
    // Un octet de trop suffit
    const over = stubFetch(() => bytesResponse(new Uint8Array(11), "image/jpeg"));
    expect(await downloadMetaCdn(image, options({ maxBytes: 10, fetchImpl: over.impl }))).toBeNull();
  });

  it("statut non-OK → null (403 du lien expiré, 404, 500, redirection non suivie)", async () => {
    for (const status of [403, 404, 500]) {
      const { calls, impl } = stubFetch(() => bytesResponse(IMAGE_BYTES, "image/jpeg", { status }));
      expect(await downloadMetaCdn(image, options({ fetchImpl: impl }))).toBeNull();
      expect(calls).toHaveLength(1);
    }
    const redirect = stubFetch(() => new Response(null, { status: 302, headers: { location: "https://cdn.exemple.fr/visuel.jpg" } }));
    expect(await downloadMetaCdn(image, options({ fetchImpl: redirect.impl }))).toBeNull();
    expect(redirect.calls).toHaveLength(1);
  });

  it("erreur réseau, délai dépassé, corps vide ou absent → null, jamais d'exception", async () => {
    const network = stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await downloadMetaCdn(image, options({ fetchImpl: network.impl }))).toBeNull();
    const hanging = stubFetch(
      (_url, call) =>
        new Promise<Response>((_resolve, reject) => {
          call.init?.signal?.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")));
        }),
    );
    expect(await downloadMetaCdn(image, options({ fetchImpl: hanging.impl, timeoutMs: 5 }))).toBeNull();
    expect(hanging.calls[0]!.init!.signal!.aborted).toBe(true);
    expect(await downloadMetaCdn(image, options({ fetchImpl: stubFetch(() => bytesResponse(new Uint8Array(0), "image/jpeg")).impl }))).toBeNull();
    expect(await downloadMetaCdn(image, options({ fetchImpl: stubFetch(() => new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } })).impl }))).toBeNull();
    // Flux interrompu en cours de lecture
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("connexion coupée"));
      },
    });
    expect(await downloadMetaCdn(image, options({ fetchImpl: stubFetch(() => new Response(broken, { headers: { "content-type": "image/jpeg" } })).impl }))).toBeNull();
  });
});

// ─── Cache, fournisseur, quota ───────────────────────────────────────────────

describe("cachedMediaUsable", () => {
  const bare = (sourceExpiresAt: string | null): MetaAdMedia => imageMedia(A, { items: [{ kind: "image", posterUrl: null, sourceImageUrl: cdnImage("a"), sourceVideoUrl: null }], sourceExpiresAt });

  it("annonce sans visuel : rien à afficher, donc utilisable (même liens expirés)", () => {
    expect(cachedMediaUsable(imageMedia(A, { items: [], sourceExpiresAt: EXPIRED.toISOString() }), NOW)).toBe(true);
  });

  it("au moins une image copiée : utilisable même quand les liens d'origine ont expiré", () => {
    expect(cachedMediaUsable(imageMedia(A, { sourceExpiresAt: EXPIRED.toISOString() }), NOW)).toBe(true);
    const mixed = imageMedia(A, {
      sourceExpiresAt: EXPIRED.toISOString(),
      items: [
        { kind: "image", posterUrl: null, sourceImageUrl: cdnImage("a"), sourceVideoUrl: null },
        { kind: "image", posterUrl: "https://blob.test/meta-media/a/1.jpg", sourceImageUrl: cdnImage("b"), sourceVideoUrl: null },
      ],
    });
    expect(cachedMediaUsable(mixed, NOW)).toBe(true);
  });

  it("aucune copie : utilisable tant que les liens d'origine vivent (marge d'une heure), inutilisable ensuite", () => {
    expect(cachedMediaUsable(bare(FRESH.toISOString()), NOW)).toBe(true);
    expect(cachedMediaUsable(bare(null), NOW)).toBe(true);
    expect(cachedMediaUsable(bare(EXPIRED.toISOString()), NOW)).toBe(false);
    expect(cachedMediaUsable(bare(new Date(NOW.getTime() + 2 * 3_600_000).toISOString()), NOW)).toBe(true);
    expect(cachedMediaUsable(bare(new Date(NOW.getTime() + 30 * 60_000).toISOString()), NOW)).toBe(false);
  });
});

describe("mediaProviderFor", () => {
  const KEY = "sc-cle-secrete-0123456789";
  const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv;

  it("veille simulée → visuels de démonstration, même sans clé (et même avec)", () => {
    expect(mediaProviderFor(env({}), "mock")).toBeInstanceOf(MockAdMediaProvider);
    expect(mediaProviderFor(env({ SCRAPECREATORS_API_KEY: KEY }), "mock")?.mode).toBe("mock");
  });

  it("vraie veille → fournisseur réel seulement avec SCRAPECREATORS_API_KEY ; jamais de visuels simulés, même sous META_ADS_MOCK=1", () => {
    expect(mediaProviderFor(env({ SCRAPECREATORS_API_KEY: KEY }), "meta")?.mode).toBe("scrapecreators");
    expect(mediaProviderFor(env({ SCRAPECREATORS_API_KEY: KEY, META_ADS_MOCK: "1" }), "meta")?.mode).toBe("scrapecreators");
    expect(mediaProviderFor(env({ SCRAPECREATORS_API_KEY: KEY, META_ADS_MOCK: "true" }), "meta")?.mode).toBe("scrapecreators");
    expect(mediaProviderFor(env({}), "meta")).toBeNull();
    expect(mediaProviderFor(env({ META_ADS_MOCK: "1" }), "meta")).toBeNull();
    expect(mediaProviderFor(env({ META_ADS_MOCK: "true", SCRAPECREATORS_API_KEY: "  " }), "meta")).toBeNull();
  });

  it("sans veille (« none ») ou mode inconnu → null ; l'environnement reçu n'est pas modifié", () => {
    const full = env({ SCRAPECREATORS_API_KEY: KEY, META_ADS_MOCK: "1" });
    expect(mediaProviderFor(full, "none")).toBeNull();
    expect(mediaProviderFor(full, "")).toBeNull();
    expect(mediaProviderFor(full, "autre")).toBeNull();
    mediaProviderFor(full, "meta");
    expect(full).toEqual({ SCRAPECREATORS_API_KEY: KEY, META_ADS_MOCK: "1" });
  });
});

describe("usage des recherches de visuels (google_usage, kind meta_media)", () => {
  it("mediaLookupsUsed : somme des `requests` du site pour le mois (UTC) et le kind meta_media seulement", async () => {
    const { db } = memoryDb({
      usage: [
        usageRow(12),
        usageRow(30),
        usageRow(500, { kind: "meta_analysis" }),
        usageRow(500, { kind: "meta_regen" }),
        usageRow(500, { siteId: OTHER_SITE_ID }),
        usageRow(500, { month: "2026-09" }),
        usageRow(7, { month: "2026-11" }),
      ],
    });
    const used = await mediaLookupsUsed(db, SITE_ID, NOW);
    expect(used).toBe(42);
    expect(typeof used).toBe("number");
    expect(await mediaLookupsUsed(db, SITE_ID, new Date("2026-10-31T23:59:59Z"))).toBe(42);
    expect(await mediaLookupsUsed(db, SITE_ID, new Date("2026-11-01T00:00:00Z"))).toBe(7);
    expect(await mediaLookupsUsed(db, SITE_ID, new Date("2026-12-15T00:00:00Z"))).toBe(0);
    expect(await mediaLookupsUsed(db, OTHER_SITE_ID, NOW)).toBe(500);
  });

  it("mediaLookupsRemaining : quota mensuel moins l'usage, jamais négatif", async () => {
    expect(await mediaLookupsRemaining(memoryDb().db, SITE_ID, NOW)).toBe(META_MEDIA_LOOKUPS_PER_MONTH);
    expect(await mediaLookupsRemaining(memoryDb({ usage: [usageRow(150)] }).db, SITE_ID, NOW)).toBe(META_MEDIA_LOOKUPS_PER_MONTH - 150);
    expect(await mediaLookupsRemaining(memoryDb({ usage: [usageRow(META_MEDIA_LOOKUPS_PER_MONTH)] }).db, SITE_ID, NOW)).toBe(0);
    expect(await mediaLookupsRemaining(memoryDb({ usage: [usageRow(META_MEDIA_LOOKUPS_PER_MONTH), usageRow(25)] }).db, SITE_ID, NOW)).toBe(0);
  });

  it("recordMediaUsage : une ligne par lot (coût réel pour scrapecreators, nul en démonstration), rien pour zéro recherche", async () => {
    const handle = memoryDb();
    await recordMediaUsage(handle.db, SITE_ID, 0, "scrapecreators", NOW);
    await recordMediaUsage(handle.db, SITE_ID, -2, "scrapecreators", NOW);
    expect(handle.rows(googleUsage)).toEqual([]);
    expect(handle.log).toEqual([]);
    await recordMediaUsage(handle.db, SITE_ID, 37, "scrapecreators", NOW);
    await recordMediaUsage(handle.db, SITE_ID, 5, "mock", NOW);
    const rows = handle.rows(googleUsage);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ siteId: SITE_ID, month: "2026-10", kind: "meta_media", requests: 37, createdAt: NOW });
    // 37 × 0,002 $ arrondi au millième
    expect(rows[0]!.costUsd).toBeCloseTo(37 * META_MEDIA_LOOKUP_COST_USD, 10);
    expect(rows[0]!.costUsd).toBe(0.074);
    expect(rows[1]).toMatchObject({ siteId: SITE_ID, month: "2026-10", kind: "meta_media", requests: 5, costUsd: 0, createdAt: NOW });
    // Ce qui est inscrit est aussitôt décompté du quota
    expect(await mediaLookupsUsed(handle.db, SITE_ID, NOW)).toBe(42);
    expect(await mediaLookupsRemaining(handle.db, SITE_ID, NOW)).toBe(META_MEDIA_LOOKUPS_PER_MONTH - 42);
  });
});

// ─── Visuels enregistrés ─────────────────────────────────────────────────────

describe("materializeMedia", () => {
  it("visuel prêt à afficher (posterUrl fourni, démonstration) : gardé tel quel, sans téléchargement ni copie", async () => {
    const lookup = (await new MockAdMediaProvider().lookup(A))!;
    const { calls, impl } = cdn();
    const { store, images } = fakeStore();
    const media = await materializeMedia(lookup, { store, now: NOW, fetchImpl: impl, source: "mock" });
    expect(calls).toHaveLength(0);
    expect(images).toHaveLength(0);
    expect(media.items).toHaveLength(lookup.items.length);
    media.items.forEach((item, index) => {
      expect(item.posterUrl).toBe(lookup.items[index]!.posterUrl);
      expect(item.posterUrl).toMatch(/^data:image\/svg\+xml/);
      expect(item).toMatchObject({ kind: lookup.items[index]!.kind, sourceImageUrl: null, sourceVideoUrl: null });
    });
    expect(media).toMatchObject({ version: 1, source: "mock", format: lookup.format, variants: lookup.variants, avatarUrl: null, sourceExpiresAt: null, fetchedAt: NOW.toISOString() });
  });

  it("images copiées sur le stockage sous meta-media/<adId>/<index>.jpg (largeur META_MEDIA_POSTER_WIDTH), avatar sous meta-media/<adId>/avatar.jpg", async () => {
    const lookup = imageLookup(A, {
      format: "carousel",
      items: [
        { kind: "image", imageUrl: cdnImage("diapo-0"), videoUrl: null },
        { kind: "video", imageUrl: cdnImage("affiche-1"), videoUrl: cdnVideo("clip-1") },
        { kind: "image", imageUrl: cdnImage("diapo-2"), videoUrl: null },
      ],
    });
    const { calls, impl } = cdn();
    const { store, images, files } = fakeStore();
    const media = await materializeMedia(lookup, { store, now: NOW, fetchImpl: impl, source: "scrapecreators" });
    // Seules les images sont téléchargées (affiche de la vidéo comprise), jamais la vidéo
    expect(calls.map((call) => call.url)).toEqual([cdnImage("diapo-0"), cdnImage("affiche-1"), cdnImage("diapo-2"), cdnImage(`${A}-avatar`)]);
    expect(calls.every((call) => call.init?.redirect === "error")).toBe(true);
    expect(files).toHaveLength(0);
    expect(images.map((image) => [image.key, image.maxWidth])).toEqual([
      [`meta-media/${A}/0.jpg`, META_MEDIA_POSTER_WIDTH],
      [`meta-media/${A}/1.jpg`, META_MEDIA_POSTER_WIDTH],
      [`meta-media/${A}/2.jpg`, META_MEDIA_POSTER_WIDTH],
      [`meta-media/${A}/avatar.jpg`, META_MEDIA_AVATAR_WIDTH],
    ]);
    expect(images.every((image) => [...image.bytes].join() === [...IMAGE_BYTES].join())).toBe(true);
    expect(media).toEqual({
      version: 1,
      format: "carousel",
      variants: false,
      items: [
        { kind: "image", posterUrl: `https://blob.test/meta-media/${A}/0.jpg`, sourceImageUrl: cdnImage("diapo-0"), sourceVideoUrl: null },
        { kind: "video", posterUrl: `https://blob.test/meta-media/${A}/1.jpg`, sourceImageUrl: cdnImage("affiche-1"), sourceVideoUrl: cdnVideo("clip-1") },
        { kind: "image", posterUrl: `https://blob.test/meta-media/${A}/2.jpg`, sourceImageUrl: cdnImage("diapo-2"), sourceVideoUrl: null },
      ],
      avatarUrl: `https://blob.test/meta-media/${A}/avatar.jpg`,
      ctaText: "En savoir plus",
      linkUrl: "https://cabinet-martin.fr/rendez-vous",
      pageCategories: ["Osteopathic Doctor"],
      pageLikes: 412,
      sourceExpiresAt: FRESH.toISOString(),
      fetchedAt: NOW.toISOString(),
      source: "scrapecreators",
    });
    expect(META_MEDIA_POSTER_WIDTH).toBe(1080);
    expect(META_MEDIA_AVATAR_WIDTH).toBe(160);
    expect(META_MEDIA_IMAGE_MAX_BYTES).toBe(12 * 1024 * 1024);
  });

  it("copie de l'avatar en échec (stockage ou téléchargement) : repli sur l'avatar d'origine ; sans avatar : null", async () => {
    const lookup = imageLookup(A);
    const refused = fakeStore({ putImage: (key) => (key.endsWith("avatar.jpg") ? null : `https://blob.test/${key}`) });
    const viaStore = await materializeMedia(lookup, { store: refused.store, now: NOW, fetchImpl: cdn().impl, source: "scrapecreators" });
    expect(refused.images.map((image) => image.key)).toContain(`meta-media/${A}/avatar.jpg`);
    expect(viaStore.avatarUrl).toBe(lookup.avatarUrl);
    expect(viaStore.items[0]!.posterUrl).toBe(`https://blob.test/meta-media/${A}/0.jpg`);
    const forbidden = cdn({ image: (url) => (url.includes("avatar") ? bytesResponse(IMAGE_BYTES, "image/jpeg", { status: 403 }) : bytesResponse(IMAGE_BYTES, "image/jpeg")) });
    const ok = fakeStore();
    const viaDownload = await materializeMedia(lookup, { store: ok.store, now: NOW, fetchImpl: forbidden.impl, source: "scrapecreators" });
    expect(viaDownload.avatarUrl).toBe(lookup.avatarUrl);
    expect(ok.images.map((image) => image.key)).toEqual([`meta-media/${A}/0.jpg`]);
    const none = await materializeMedia(imageLookup(A, { avatarUrl: null }), { store: fakeStore().store, now: NOW, fetchImpl: cdn().impl, source: "scrapecreators" });
    expect(none.avatarUrl).toBeNull();
  });

  it("stockage qui lève : posterUrl null, avatar d'origine, aucune exception (les liens d'origine restent)", async () => {
    const store: MetaMediaStore = {
      putImage: async () => {
        throw new Error("Blob indisponible");
      },
      putFile: async () => null,
      remove: async () => undefined,
    };
    const lookup = videoLookup(A);
    const media = await materializeMedia(lookup, { store, now: NOW, fetchImpl: cdn().impl, source: "scrapecreators" });
    expect(media.items).toEqual([{ kind: "video", posterUrl: null, sourceImageUrl: cdnImage(`${A}-affiche`), sourceVideoUrl: cdnVideo(`${A}-0`) }]);
    expect(media.avatarUrl).toBe(lookup.avatarUrl);
    expect(logs.warn).toHaveBeenCalled();
  });

  it("sans stockage, image introuvable ou visuel sans image : posterUrl null, rien n'est téléchargé pour rien", async () => {
    const offline = cdn();
    const withoutStore = await materializeMedia(imageLookup(A), { store: null, now: NOW, fetchImpl: offline.impl, source: "scrapecreators" });
    expect(offline.calls).toHaveLength(0);
    expect(withoutStore.items[0]).toEqual({ kind: "image", posterUrl: null, sourceImageUrl: cdnImage(`${A}-0`), sourceVideoUrl: null });
    expect(withoutStore.avatarUrl).toBe(cdnImage(`${A}-avatar`));
    const gone = cdn({ image: () => bytesResponse(IMAGE_BYTES, "image/jpeg", { status: 403 }) });
    const { store, images } = fakeStore();
    const expired = await materializeMedia(imageLookup(A), { store, now: NOW, fetchImpl: gone.impl, source: "scrapecreators" });
    expect(expired.items[0]!.posterUrl).toBeNull();
    expect(images).toHaveLength(0);
    const silent = cdn();
    const noPreview = await materializeMedia(imageLookup(A, { format: "video", avatarUrl: null, items: [{ kind: "video", imageUrl: null, videoUrl: cdnVideo("clip") }] }), { store: fakeStore().store, now: NOW, fetchImpl: silent.impl, source: "scrapecreators" });
    expect(silent.calls).toHaveLength(0);
    expect(noPreview.items).toEqual([{ kind: "video", posterUrl: null, sourceImageUrl: null, sourceVideoUrl: cdnVideo("clip") }]);
  });
});

describe("libraryVideoUrls", () => {
  it("URL des vidéos durables, dans l'ordre des visuels ; visuels sans copie ignorés ; sans visuels → liste vide", () => {
    const media = imageMedia(A, {
      format: "carousel",
      items: [
        { kind: "video", posterUrl: null, sourceImageUrl: null, sourceVideoUrl: cdnVideo("a"), videoUrl: "https://blob.test/meta-library/s/a/video-0.mp4" },
        { kind: "image", posterUrl: "https://blob.test/p.jpg", sourceImageUrl: null, sourceVideoUrl: null },
        { kind: "video", posterUrl: null, sourceImageUrl: null, sourceVideoUrl: cdnVideo("b"), videoUrl: null },
        { kind: "video", posterUrl: null, sourceImageUrl: null, sourceVideoUrl: cdnVideo("c"), videoUrl: "" },
        { kind: "video", posterUrl: null, sourceImageUrl: null, sourceVideoUrl: null, videoUrl: "https://blob.test/meta-library/s/a/video-4.mp4" },
      ],
    });
    // Les liens d'origine (CDN de Meta) ne sont jamais à supprimer
    expect(libraryVideoUrls(media)).toEqual(["https://blob.test/meta-library/s/a/video-0.mp4", "https://blob.test/meta-library/s/a/video-4.mp4"]);
    expect(libraryVideoUrls(imageMedia(A))).toEqual([]);
    expect(libraryVideoUrls(imageMedia(A, { items: [] }))).toEqual([]);
    expect(libraryVideoUrls(null)).toEqual([]);
    expect(libraryVideoUrls(undefined)).toEqual([]);
  });
});

// ─── Enrichissement ──────────────────────────────────────────────────────────

describe("enrichAdsMedia", () => {
  it("réutilise le cache : aucune recherche pour les annonces déjà connues (visuels utilisables ou annonce sans visuel)", async () => {
    const cachedA = imageMedia(A);
    const cachedB = imageMedia(B, { items: [] });
    const handle = memoryDb({ media: [mediaRow(A, cachedA), mediaRow(B, cachedB), mediaRow(D, imageMedia(D))] });
    const { provider, calls } = fakeMediaProvider();
    const result = await enrichAdsMedia(handle.db, [A, B], enrichDeps({ provider }));
    expect(result).toEqual({ mediaByAdId: { [A]: cachedA, [B]: cachedB }, lookups: 0, blocked: false, unavailable: false });
    expect(calls).toEqual([]);
    expect(handle.count("insert", metaAdMedia)).toBe(0);
    expect(handle.count("select", metaAdMedia)).toBe(1);
  });

  it("cherche ce qui manque et l'enregistre dans meta_ad_media ; l'appel suivant est servi par le cache", async () => {
    const cachedA = imageMedia(A);
    const handle = memoryDb({ media: [mediaRow(A, cachedA)] });
    const { provider, calls } = fakeMediaProvider((adId) => videoLookup(adId));
    const { store, images } = fakeStore();
    const first = await enrichAdsMedia(handle.db, [A, C], enrichDeps({ provider, store, fetchImpl: cdn().impl }));
    expect(calls).toEqual([C]);
    expect(first).toMatchObject({ lookups: 1, blocked: false, unavailable: false });
    expect(Object.keys(first.mediaByAdId).sort()).toEqual([A, C]);
    expect(first.mediaByAdId[A]).toEqual(cachedA);
    // Visuels enregistrés : source = mode du fournisseur, affiche copiée par le stockage reçu, liens d'origine gardés
    expect(first.mediaByAdId[C]).toMatchObject({
      source: "scrapecreators",
      format: "video",
      fetchedAt: NOW.toISOString(),
      sourceExpiresAt: FRESH.toISOString(),
      items: [{ kind: "video", posterUrl: `https://blob.test/meta-media/${C}/0.jpg`, sourceImageUrl: cdnImage(`${C}-affiche`), sourceVideoUrl: cdnVideo(`${C}-0`) }],
    });
    expect(images.map((image) => image.key)).toEqual([`meta-media/${C}/0.jpg`, `meta-media/${C}/avatar.jpg`]);
    const row = handle.rows(metaAdMedia).find((r) => r.adId === C);
    expect(row).toEqual({ adId: C, status: "ok", media: first.mediaByAdId[C], provider: "scrapecreators", fetchedAt: NOW, updatedAt: NOW });
    const second = await enrichAdsMedia(handle.db, [A, C], enrichDeps({ provider, store, fetchImpl: cdn().impl }));
    expect(calls).toEqual([C]);
    expect(second).toEqual({ mediaByAdId: first.mediaByAdId, lookups: 0, blocked: false, unavailable: false });
  });

  it("identifiants invalides écartés, doublons recherchés une seule fois ; rien de valable → aucune requête", async () => {
    const handle = memoryDb();
    const { provider, calls } = fakeMediaProvider();
    const result = await enrichAdsMedia(handle.db, ["abc", A, "1234", A, "", `${A}x`, B, A], enrichDeps({ provider }));
    expect(calls).toEqual([A, B]);
    expect(result.lookups).toBe(2);
    expect(Object.keys(result.mediaByAdId).sort()).toEqual([A, B]);
    expect(handle.rows(metaAdMedia)).toHaveLength(2);
    const idle = memoryDb();
    expect(await enrichAdsMedia(idle.db, ["abc", "12", ""], enrichDeps({ provider }))).toEqual({ mediaByAdId: {}, lookups: 0, blocked: false, unavailable: false });
    expect(await enrichAdsMedia(idle.db, [], enrichDeps({ provider }))).toEqual({ mediaByAdId: {}, lookups: 0, blocked: false, unavailable: false });
    expect(idle.log).toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it("respecte le budget : au plus `budget` recherches, dans l'ordre demandé ; le cache ne coûte rien", async () => {
    const ids = [A, B, C, D, "700000000000005"];
    const handle = memoryDb({ media: [mediaRow(B, imageMedia(B))] });
    const { provider, calls } = fakeMediaProvider();
    const result = await enrichAdsMedia(handle.db, ids, enrichDeps({ provider, budget: 2, concurrency: 1 }));
    expect(calls).toEqual([A, C]);
    expect(result.lookups).toBe(2);
    expect(Object.keys(result.mediaByAdId).sort()).toEqual([A, B, C]);
    for (const budget of [0, -5, 0.9]) {
      const none = fakeMediaProvider();
      const fresh = memoryDb({ media: [mediaRow(B, imageMedia(B))] });
      const out = await enrichAdsMedia(fresh.db, ids, enrichDeps({ provider: none.provider, budget }));
      expect(none.calls).toEqual([]);
      expect(out).toMatchObject({ lookups: 0, blocked: false });
      expect(Object.keys(out.mediaByAdId)).toEqual([B]);
    }
    // Budget fractionnaire : arrondi à la recherche entière inférieure
    const partial = fakeMediaProvider();
    expect((await enrichAdsMedia(memoryDb().db, ids, enrichDeps({ provider: partial.provider, budget: 3.9 }))).lookups).toBe(3);
    expect(partial.calls).toHaveLength(3);
  });

  it(`respecte la concurrence : jamais plus de \`concurrency\` recherches de front (défaut META_MEDIA_CONCURRENCY = ${META_MEDIA_CONCURRENCY}), chaque annonce une seule fois`, async () => {
    const ids = Array.from({ length: 14 }, (_, i) => String(710_000_000_000_000 + i));
    const three = fakeMediaProvider();
    const limited = await enrichAdsMedia(memoryDb().db, ids, enrichDeps({ provider: three.provider, concurrency: 3 }));
    expect(three.peak()).toBe(3);
    expect([...three.calls].sort()).toEqual(ids);
    expect(limited.lookups).toBe(ids.length);
    expect(Object.keys(limited.mediaByAdId).sort()).toEqual(ids);
    const byDefault = fakeMediaProvider();
    await enrichAdsMedia(memoryDb().db, ids, enrichDeps({ provider: byDefault.provider }));
    expect(byDefault.peak()).toBe(META_MEDIA_CONCURRENCY);
    expect(byDefault.calls).toHaveLength(ids.length);
    const sequential = fakeMediaProvider();
    await enrichAdsMedia(memoryDb().db, ids, enrichDeps({ provider: sequential.provider, concurrency: 1 }));
    expect(sequential.peak()).toBe(1);
    expect(sequential.calls).toEqual(ids);
    // Moins d'annonces que de recherches permises de front
    const few = fakeMediaProvider();
    await enrichAdsMedia(memoryDb().db, ids.slice(0, 2), enrichDeps({ provider: few.provider, concurrency: 5 }));
    expect(few.peak()).toBe(2);
  });

  it("annonce introuvable chez le fournisseur (null) : enregistrée « missing », absente du résultat, pas recherchée à nouveau avant META_MEDIA_MISSING_RETRY_DAYS jours", async () => {
    const handle = memoryDb();
    const { provider, calls } = fakeMediaProvider((adId) => (adId === B ? null : imageLookup(adId)));
    const first = await enrichAdsMedia(handle.db, [A, B], enrichDeps({ provider }));
    expect(first.lookups).toBe(2);
    expect(Object.keys(first.mediaByAdId)).toEqual([A]);
    expect(handle.rows(metaAdMedia).find((r) => r.adId === B)).toEqual({ adId: B, status: "missing", media: null, provider: "scrapecreators", fetchedAt: NOW, updatedAt: NOW });
    // Le lendemain puis juste avant l'échéance : aucune nouvelle recherche
    for (const later of [new Date(NOW.getTime() + DAY_MS), new Date(NOW.getTime() + META_MEDIA_MISSING_RETRY_DAYS * DAY_MS - 1)]) {
      const again = await enrichAdsMedia(handle.db, [A, B], enrichDeps({ provider, now: later }));
      expect(again.lookups).toBe(0);
      expect(Object.keys(again.mediaByAdId)).toEqual([A]);
    }
    expect(calls).toEqual([A, B]);
    // Passé le délai : nouvelle tentative, la ligne est mise à jour (toujours une seule ligne par annonce)
    const afterDelay = new Date(NOW.getTime() + META_MEDIA_MISSING_RETRY_DAYS * DAY_MS + 1);
    const retried = await enrichAdsMedia(handle.db, [A, B], enrichDeps({ provider, now: afterDelay }));
    expect(retried.lookups).toBe(1);
    expect(calls).toEqual([A, B, B]);
    expect(handle.rows(metaAdMedia).filter((r) => r.adId === B)).toEqual([{ adId: B, status: "missing", media: null, provider: "scrapecreators", fetchedAt: afterDelay, updatedAt: afterDelay }]);
    expect(META_MEDIA_MISSING_RETRY_DAYS).toBe(7);
  });

  it("annonce sans visuel exploitable (items vide) : enregistrée « empty », rendue telle quelle, plus jamais recherchée", async () => {
    const handle = memoryDb();
    const { provider, calls } = fakeMediaProvider((adId) => imageLookup(adId, { items: [], avatarUrl: null, expiresAt: null }));
    const first = await enrichAdsMedia(handle.db, [A], enrichDeps({ provider }));
    expect(first.mediaByAdId[A]).toMatchObject({ items: [], pageCategories: ["Osteopathic Doctor"] });
    expect(handle.rows(metaAdMedia)[0]).toMatchObject({ adId: A, status: "empty" });
    const later = await enrichAdsMedia(handle.db, [A], enrichDeps({ provider, now: new Date(NOW.getTime() + 60 * DAY_MS) }));
    expect(later.mediaByAdId[A]).toEqual(first.mediaByAdId[A]);
    expect(calls).toEqual([A]);
  });

  it("erreur bloquante du fournisseur (clé refusée, crédits épuisés) : le lot s'arrête, `blocked: true`, ce qui a abouti est gardé", async () => {
    for (const blocking of [new AdMediaError("ScrapeCreators HTTP 401 : clé refusée", { status: 401, kind: "auth" }), new AdMediaError("ScrapeCreators HTTP 402 : crédits épuisés", { status: 402, kind: "credits" })]) {
      const handle = memoryDb();
      const { provider, calls } = fakeMediaProvider((adId) => {
        if (adId === B) throw blocking;
        return imageLookup(adId);
      });
      const result = await enrichAdsMedia(handle.db, [A, B, C, D], enrichDeps({ provider, concurrency: 1 }));
      expect(result.blocked).toBe(true);
      expect(result.unavailable).toBe(false);
      expect(calls).toEqual([A, B]);
      expect(result.lookups).toBe(2);
      expect(Object.keys(result.mediaByAdId)).toEqual([A]);
      // Rien n'est enregistré pour l'annonce en échec : elle sera recherchée une fois le fournisseur rétabli
      expect(handle.rows(metaAdMedia).map((r) => r.adId)).toEqual([A]);
      expect(logs.error).toHaveBeenCalled();
    }
  });

  it("erreur bloquante avec des recherches de front : celles déjà parties aboutissent, aucune nouvelle n'est lancée", async () => {
    const ids = Array.from({ length: 14 }, (_, i) => String(710_000_000_000_000 + i));
    const handle = memoryDb();
    const { provider, calls } = fakeMediaProvider((adId, index) => {
      if (index === 0) throw new AdMediaError("ScrapeCreators HTTP 402", { status: 402, kind: "credits" });
      return imageLookup(adId);
    });
    const result = await enrichAdsMedia(handle.db, ids, enrichDeps({ provider }));
    expect(result.blocked).toBe(true);
    expect(calls).toEqual(ids.slice(0, META_MEDIA_CONCURRENCY));
    expect(result.lookups).toBe(META_MEDIA_CONCURRENCY);
    expect(Object.keys(result.mediaByAdId).sort()).toEqual(ids.slice(1, META_MEDIA_CONCURRENCY));
  });

  it("erreur sur une annonce (débit, transitoire, erreur quelconque) : ignorée, le lot continue, rien n'est enregistré pour elle", async () => {
    const failures: Record<string, Error> = {
      [A]: new AdMediaError("ScrapeCreators HTTP 429", { status: 429, kind: "rate" }),
      [C]: new AdMediaError("ScrapeCreators réseau : fetch failed", { kind: "transient" }),
      [D]: new TypeError("réponse inattendue"),
    };
    const handle = memoryDb();
    const { provider, calls } = fakeMediaProvider((adId) => {
      const failure = failures[adId];
      if (failure) throw failure;
      return imageLookup(adId);
    });
    const last = "700000000000005";
    const result = await enrichAdsMedia(handle.db, [A, B, C, D, last], enrichDeps({ provider, concurrency: 1 }));
    expect(calls).toEqual([A, B, C, D, last]);
    expect(result).toMatchObject({ lookups: 5, blocked: false, unavailable: false });
    expect(Object.keys(result.mediaByAdId).sort()).toEqual([B, last]);
    expect(handle.rows(metaAdMedia).map((r) => r.adId).sort()).toEqual([B, last]);
    expect(logs.warn).toHaveBeenCalledTimes(3);
  });

  it("table meta_ad_media absente (42P01) : `unavailable: true`, aucune recherche ; toute autre erreur de base est levée", async () => {
    const { provider, calls } = fakeMediaProvider();
    const absent = memoryDb({}, { fail: missing(metaAdMedia) });
    expect(await enrichAdsMedia(absent.db, [A, B], enrichDeps({ provider }))).toEqual({ mediaByAdId: {}, lookups: 0, blocked: false, unavailable: true });
    expect(calls).toEqual([]);
    expect(logs.warn).toHaveBeenCalled();
    const down = memoryDb({}, { fail: () => Object.assign(new Error("connection terminated unexpectedly"), { code: "08006" }) });
    await expect(enrichAdsMedia(down.db, [A], enrichDeps({ provider }))).rejects.toThrow("connection terminated unexpectedly");
    expect(calls).toEqual([]);
  });

  it("`force` : recherche même ce qui est en cache (visuels utilisables, annonce introuvable récente) et remplace la ligne", async () => {
    const stale = imageMedia(A, { ctaText: "Ancien bouton" });
    const handle = memoryDb({ media: [mediaRow(A, stale), mediaRow(B, null)] });
    const { provider, calls } = fakeMediaProvider((adId) => imageLookup(adId, { ctaText: "Nouveau bouton" }));
    const result = await enrichAdsMedia(handle.db, [A, B], enrichDeps({ provider, force: true, concurrency: 1 }));
    expect(calls).toEqual([A, B]);
    expect(result.lookups).toBe(2);
    expect(result.mediaByAdId[A]!.ctaText).toBe("Nouveau bouton");
    expect(result.mediaByAdId[B]!.ctaText).toBe("Nouveau bouton");
    const rows = handle.rows(metaAdMedia);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.adId === A)).toMatchObject({ status: "ok", media: { ctaText: "Nouveau bouton" } });
    expect(rows.find((r) => r.adId === B)).toMatchObject({ status: "ok", media: { ctaText: "Nouveau bouton" } });
    // `force` reste soumis au budget
    const capped = fakeMediaProvider();
    const out = await enrichAdsMedia(memoryDb({ media: [mediaRow(A, stale), mediaRow(B, imageMedia(B))] }).db, [A, B], enrichDeps({ provider: capped.provider, force: true, budget: 1 }));
    expect(capped.calls).toEqual([A]);
    expect(out.lookups).toBe(1);
  });

  it("cache périmé (aucune image copiée et liens d'origine expirés) : recherché à nouveau ; avec une image copiée : gardé", async () => {
    const dead = imageMedia(A, { items: [{ kind: "image", posterUrl: null, sourceImageUrl: cdnImage("a", EXPIRED), sourceVideoUrl: null }], sourceExpiresAt: EXPIRED.toISOString() });
    const copied = imageMedia(B, { sourceExpiresAt: EXPIRED.toISOString() });
    const alive = imageMedia(C, { items: [{ kind: "image", posterUrl: null, sourceImageUrl: cdnImage("c"), sourceVideoUrl: null }] });
    const handle = memoryDb({ media: [mediaRow(A, dead), mediaRow(B, copied), mediaRow(C, alive)] });
    const { provider, calls } = fakeMediaProvider();
    const result = await enrichAdsMedia(handle.db, [A, B, C], enrichDeps({ provider }));
    expect(calls).toEqual([A]);
    expect(result.mediaByAdId[B]).toEqual(copied);
    expect(result.mediaByAdId[C]).toEqual(alive);
    expect(result.mediaByAdId[A]!.sourceExpiresAt).toBe(FRESH.toISOString());
    expect(handle.rows(metaAdMedia)).toHaveLength(3);
  });

  it("sans fournisseur : le cache seul, aucune écriture", async () => {
    const cachedA = imageMedia(A);
    const handle = memoryDb({ media: [mediaRow(A, cachedA), mediaRow(B, null)] });
    expect(await enrichAdsMedia(handle.db, [A, B, C], enrichDeps({ provider: null }))).toEqual({ mediaByAdId: { [A]: cachedA }, lookups: 0, blocked: false, unavailable: false });
    expect(handle.count("insert", metaAdMedia)).toBe(0);
  });

  it("visuels de démonstration : enregistrés avec la source et le fournisseur « mock », sans téléchargement", async () => {
    const handle = memoryDb();
    const { calls, impl } = cdn();
    const { store, images } = fakeStore();
    const result = await enrichAdsMedia(handle.db, [A, B], enrichDeps({ provider: new MockAdMediaProvider(), store, fetchImpl: impl }));
    expect(result.lookups).toBe(2);
    expect(calls).toHaveLength(0);
    expect(images).toHaveLength(0);
    for (const row of handle.rows(metaAdMedia)) {
      expect(row).toMatchObject({ provider: "mock", status: "ok", media: { source: "mock" } });
      expect((row.media as MetaAdMedia).items.every((item) => item.posterUrl?.startsWith("data:image/svg+xml"))).toBe(true);
    }
  });
});

describe("loadMetaMedia", () => {
  it("visuels en cache par identifiant (lecture seule) ; annonces introuvables, inconnues ou invalides absentes", async () => {
    const cachedA = imageMedia(A);
    const cachedB = videoMedia(B);
    const handle = memoryDb({ media: [mediaRow(A, cachedA), mediaRow(B, cachedB), mediaRow(C, null), mediaRow(D, imageMedia(D))] });
    expect(await loadMetaMedia(handle.db, [A, B, C, UNKNOWN, "abc", A])).toEqual({ [A]: cachedA, [B]: cachedB });
    expect(handle.log).toEqual([{ op: "select", table: "meta_ad_media" }]);
    const idle = memoryDb({ media: [mediaRow(A, cachedA)] });
    expect(await loadMetaMedia(idle.db, [])).toEqual({});
    expect(await loadMetaMedia(idle.db, ["abc", "12"])).toEqual({});
    expect(idle.log).toEqual([]);
  });

  it("table absente → vide ; autre erreur → levée", async () => {
    expect(await loadMetaMedia(memoryDb({}, { fail: missing(metaAdMedia) }).db, [A])).toEqual({});
    const down = memoryDb({}, { fail: () => new Error("connexion perdue") });
    await expect(loadMetaMedia(down.db, [A])).rejects.toThrow("connexion perdue");
  });
});

// ─── Bibliothèque ────────────────────────────────────────────────────────────

describe("loadMetaLibrary et libraryForAnalysis", () => {
  const older = new Date(NOW.getTime() - 3 * DAY_MS);
  const oldest = new Date(NOW.getTime() - 10 * DAY_MS);
  const keptMedia = videoMedia(B);
  const seed = (): Seed => ({
    library: [
      libraryRow(A, "kept", { createdAt: oldest, updatedAt: oldest }),
      libraryRow(B, "kept", { createdAt: older, updatedAt: NOW, media: keptMedia }),
      libraryRow(C, "dismissed", { updatedAt: older }),
      libraryRow(D, "dismissed", { updatedAt: NOW }),
      libraryRow(UNKNOWN, "kept", { siteId: OTHER_SITE_ID }),
      libraryRow("700000000000009", "dismissed", { siteId: OTHER_SITE_ID }),
    ],
  });

  it("exemples gardés (annonce, analyse, visuels, date de garde) du plus récent au plus ancien, et identifiants des annonces supprimées ; le site seulement", async () => {
    const library = await loadMetaLibrary(memoryDb(seed()).db, SITE_ID);
    expect(library.available).toBe(true);
    expect(library.kept).toEqual([
      { adId: B, status: "kept", pageName: "Cabinet 002", ad: marketAd(B), media: keptMedia, savedAt: older.toISOString() },
      { adId: A, status: "kept", pageName: "Cabinet 001", ad: marketAd(A), media: null, savedAt: oldest.toISOString() },
    ]);
    expect(library.dismissedIds).toEqual([D, C]);
    expect(await loadMetaLibrary(memoryDb(seed()).db, OTHER_SITE_ID)).toMatchObject({ available: true, kept: [{ adId: UNKNOWN }], dismissedIds: ["700000000000009"] });
    expect(await loadMetaLibrary(memoryDb().db, SITE_ID)).toEqual({ available: true, kept: [], dismissedIds: [] });
  });

  it("libraryForAnalysis : annonces supprimées et annonces des exemples gardés (pour l'analyse suivante)", async () => {
    expect(await libraryForAnalysis(memoryDb(seed()).db, SITE_ID)).toEqual({ dismissedIds: [D, C], favorites: [marketAd(B), marketAd(A)] });
    expect(await libraryForAnalysis(memoryDb().db, SITE_ID)).toEqual({ dismissedIds: [], favorites: [] });
  });

  it("table absente (migration 0007) : bibliothèque indisponible et vide, sans lever ; autre erreur → levée", async () => {
    const absent = memoryDb(seed(), { fail: missing(metaAdsLibrary) });
    expect(await loadMetaLibrary(absent.db, SITE_ID)).toEqual({ available: false, kept: [], dismissedIds: [] });
    expect(await libraryForAnalysis(absent.db, SITE_ID)).toEqual({ dismissedIds: [], favorites: [] });
    expect(logs.warn).toHaveBeenCalled();
    const down = memoryDb(seed(), { fail: () => new Error("connexion perdue") });
    await expect(loadMetaLibrary(down.db, SITE_ID)).rejects.toThrow("connexion perdue");
    await expect(libraryForAnalysis(down.db, SITE_ID)).rejects.toThrow("connexion perdue");
  });
});

describe("currentMarketAds", () => {
  it("annonces de la dernière analyse aboutie du site, par identifiant (analyses en cours, en erreur ou d'un autre site ignorées)", async () => {
    const before = new Date(NOW.getTime() - 5 * DAY_MS);
    const after = new Date(NOW.getTime() + 60_000);
    const handle = memoryDb({
      analyses: [
        analysisRow([marketAd(D)], { createdAt: before }),
        analysisRow([marketAd(A), marketAd(B)]),
        analysisRow([marketAd(C)], { status: "running", createdAt: after }),
        analysisRow(null, { status: "error", createdAt: after }),
        analysisRow([marketAd(UNKNOWN)], { siteId: OTHER_SITE_ID, createdAt: after }),
      ],
    });
    const ads = await currentMarketAds(handle.db, SITE_ID);
    expect([...ads.keys()]).toEqual([A, B]);
    expect(ads.get(A)).toEqual(marketAd(A));
    expect([...(await currentMarketAds(handle.db, OTHER_SITE_ID)).keys()]).toEqual([UNKNOWN]);
    expect((await currentMarketAds(memoryDb().db, SITE_ID)).size).toBe(0);
    // Dernière analyse aboutie sans veille (fournisseur indisponible) : aucune annonce courante
    const noMarket = memoryDb({ analyses: [analysisRow([marketAd(A)], { createdAt: before }), analysisRow(null)] });
    expect((await currentMarketAds(noMarket.db, SITE_ID)).size).toBe(0);
  });
});

describe("keepMetaAds", () => {
  const market = () => [analysisRow([marketAd(A), marketAd(B), marketAd(C)])];
  const keepDeps = (overrides: Partial<Parameters<typeof keepMetaAds>[3]> = {}) => ({ provider: null, store: null, now: NOW, ...overrides });
  const keptRow = (handle: ReturnType<typeof memoryDb>, adId: string) => handle.rows(metaAdsLibrary).find((row) => row.siteId === SITE_ID && row.adId === adId);

  it("garde une annonce de la veille courante : annonce et analyse figées, visuels du cache, date de garde", async () => {
    const cached = imageMedia(A);
    const handle = memoryDb({ analyses: market(), media: [mediaRow(A, cached)] });
    expect(await keepMetaAds(handle.db, SITE_ID, [A], keepDeps())).toEqual({ status: "done", count: 1 });
    const rows = handle.rows(metaAdsLibrary);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ siteId: SITE_ID, adId: A, status: "kept", pageName: "Cabinet 001", ad: marketAd(A), media: cached, createdAt: NOW, updatedAt: NOW });
    const library = await loadMetaLibrary(handle.db, SITE_ID);
    expect(library.kept).toEqual([{ adId: A, status: "kept", pageName: "Cabinet 001", ad: marketAd(A), media: cached, savedAt: NOW.toISOString() }]);
    // Annonce sans visuels en cache : gardée quand même, sans visuels
    expect(await keepMetaAds(handle.db, SITE_ID, [C], keepDeps())).toEqual({ status: "done", count: 1 });
    expect(keptRow(handle, C)).toMatchObject({ status: "kept", media: null, ad: marketAd(C) });
  });

  it("refuse les annonces inconnues (ni dans la veille courante ni déjà gardées) : `unknown_ad`, rien n'est gardé du lot", async () => {
    const handle = memoryDb({ analyses: [...market(), analysisRow([marketAd(UNKNOWN)], { siteId: OTHER_SITE_ID }), analysisRow([marketAd(D)], { createdAt: new Date(NOW.getTime() - DAY_MS) })] });
    // Annonce de la veille d'un autre site
    expect(await keepMetaAds(handle.db, SITE_ID, [A, UNKNOWN], keepDeps())).toEqual({ status: "skipped", reason: "unknown_ad" });
    // Annonce d'une veille précédente du site, remplacée depuis
    expect(await keepMetaAds(handle.db, SITE_ID, [D], keepDeps())).toEqual({ status: "skipped", reason: "unknown_ad" });
    expect(handle.rows(metaAdsLibrary)).toEqual([]);
    // Sans aucune analyse aboutie
    expect(await keepMetaAds(memoryDb().db, SITE_ID, [A], keepDeps())).toEqual({ status: "skipped", reason: "unknown_ad" });
    // Une annonce supprimée qui n'est plus dans la veille n'a plus de contenu à garder
    const dismissed = memoryDb({ analyses: market(), library: [libraryRow(D, "dismissed")] });
    expect(await keepMetaAds(dismissed.db, SITE_ID, [D], keepDeps())).toEqual({ status: "skipped", reason: "unknown_ad" });
    expect(keptRow(dismissed, D)).toMatchObject({ status: "dismissed", ad: null });
  });

  it("aucun identifiant valable → `empty`, sans requête", async () => {
    const handle = memoryDb({ analyses: market() });
    expect(await keepMetaAds(handle.db, SITE_ID, [], keepDeps())).toEqual({ status: "skipped", reason: "empty" });
    expect(await keepMetaAds(handle.db, SITE_ID, ["abc", "", "12"], keepDeps())).toEqual({ status: "skipped", reason: "empty" });
    expect(handle.log).toEqual([]);
  });

  it("idempotent : une annonce déjà gardée n'est pas regardée ni comptée à nouveau (même sortie de la veille), sa date de garde ne change pas", async () => {
    const store = fakeStore();
    const fetched = cdn();
    const handle = memoryDb({ analyses: market(), media: [mediaRow(B, videoMedia(B))] });
    expect(await keepMetaAds(handle.db, SITE_ID, [B], keepDeps({ store: store.store, fetchImpl: fetched.impl }))).toEqual({ status: "done", count: 1 });
    const first = keptRow(handle, B);
    expect(store.files).toHaveLength(1);
    const later = new Date(NOW.getTime() + DAY_MS);
    expect(await keepMetaAds(handle.db, SITE_ID, [B], keepDeps({ store: store.store, fetchImpl: fetched.impl, now: later }))).toEqual({ status: "done", count: 0 });
    expect(await keepMetaAds(handle.db, SITE_ID, [B, B, A], keepDeps({ store: store.store, fetchImpl: fetched.impl, now: later }))).toEqual({ status: "done", count: 1 });
    expect(keptRow(handle, B)).toEqual(first);
    expect(store.files).toHaveLength(1);
    expect(handle.rows(metaAdsLibrary)).toHaveLength(2);
    expect(keptRow(handle, A)).toMatchObject({ createdAt: later });
    // Exemple gardé lors d'une veille précédente : toujours accepté, sans effet
    const past = memoryDb({ analyses: market(), library: [libraryRow(D, "kept")] });
    expect(await keepMetaAds(past.db, SITE_ID, [D], keepDeps())).toEqual({ status: "done", count: 0 });
    expect(await keepMetaAds(past.db, SITE_ID, [D, A], keepDeps())).toEqual({ status: "done", count: 1 });
  });

  it(`au plus META_LIBRARY_KEPT_MAX (${META_LIBRARY_KEPT_MAX}) exemples : refus groupé « full » au-delà, exemples déjà gardés et annonces supprimées non comptés deux fois`, async () => {
    const filler = (count: number) => Array.from({ length: count }, (_, i) => libraryRow(String(720_000_000_000_000 + i), "kept"));
    const dismissedRows = Array.from({ length: 30 }, (_, i) => libraryRow(String(730_000_000_000_000 + i), "dismissed"));
    const full = memoryDb({ analyses: market(), library: [...filler(META_LIBRARY_KEPT_MAX), ...dismissedRows] });
    expect(await keepMetaAds(full.db, SITE_ID, [A], keepDeps())).toEqual({ status: "skipped", reason: "full" });
    expect(full.rows(metaAdsLibrary)).toHaveLength(META_LIBRARY_KEPT_MAX + 30);
    // Un exemple déjà gardé reste accepté dans une bibliothèque pleine
    expect(await keepMetaAds(full.db, SITE_ID, ["720000000000000"], keepDeps())).toEqual({ status: "done", count: 0 });
    // Deux places demandées pour une seule libre : rien n'est gardé
    const almost = memoryDb({ analyses: market(), library: filler(META_LIBRARY_KEPT_MAX - 1) });
    expect(await keepMetaAds(almost.db, SITE_ID, [A, B], keepDeps())).toEqual({ status: "skipped", reason: "full" });
    expect(almost.rows(metaAdsLibrary)).toHaveLength(META_LIBRARY_KEPT_MAX - 1);
    // La dernière place est prise
    expect(await keepMetaAds(almost.db, SITE_ID, [A], keepDeps())).toEqual({ status: "done", count: 1 });
    expect(await keepMetaAds(almost.db, SITE_ID, [B], keepDeps())).toEqual({ status: "skipped", reason: "full" });
    // Les exemples des autres sites ne comptent pas
    const elsewhere = memoryDb({ analyses: market(), library: filler(META_LIBRARY_KEPT_MAX).map((row) => ({ ...row, siteId: OTHER_SITE_ID })) });
    expect(await keepMetaAds(elsewhere.db, SITE_ID, [A], keepDeps())).toEqual({ status: "done", count: 1 });
    expect(META_LIBRARY_KEPT_MAX).toBe(200);
  });

  it("copie les vidéos sur le stockage sous meta-library/<siteId>/<adId>/video-<i>.mp4 ; le cache commun n'est pas modifié", async () => {
    const carousel = imageMedia(B, {
      format: "carousel",
      items: [
        { kind: "image", posterUrl: `https://blob.test/meta-media/${B}/0.jpg`, sourceImageUrl: cdnImage("b-0"), sourceVideoUrl: null },
        { kind: "video", posterUrl: `https://blob.test/meta-media/${B}/1.jpg`, sourceImageUrl: cdnImage("b-1"), sourceVideoUrl: cdnVideo("b-1") },
        { kind: "video", posterUrl: `https://blob.test/meta-media/${B}/2.jpg`, sourceImageUrl: cdnImage("b-2"), sourceVideoUrl: cdnVideo("b-2") },
      ],
    });
    const handle = memoryDb({ analyses: market(), media: [mediaRow(A, videoMedia(A)), mediaRow(B, carousel)] });
    const { store, files, images } = fakeStore();
    const { calls, impl } = cdn();
    const provider = fakeMediaProvider();
    expect(await keepMetaAds(handle.db, SITE_ID, [A, B], keepDeps({ store, fetchImpl: impl, provider: provider.provider }))).toEqual({ status: "done", count: 2 });
    expect(files.map((file) => [file.key, file.contentType])).toEqual([
      [`meta-library/${SITE_ID}/${A}/video-0.mp4`, "video/mp4"],
      [`meta-library/${SITE_ID}/${B}/video-1.mp4`, "video/mp4"],
      [`meta-library/${SITE_ID}/${B}/video-2.mp4`, "video/mp4"],
    ]);
    expect(files.every((file) => [...file.bytes].join() === [...VIDEO_BYTES].join())).toBe(true);
    // Seules les vidéos sont téléchargées (les affiches sont déjà copiées), sans redirection
    expect(calls.map((call) => call.url)).toEqual([cdnVideo(`${A}-0`), cdnVideo("b-1"), cdnVideo("b-2")]);
    expect(calls.every((call) => call.init?.redirect === "error")).toBe(true);
    expect(images).toHaveLength(0);
    // Liens encore valables : aucune recherche chez le fournisseur
    expect(provider.calls).toEqual([]);
    expect((keptRow(handle, A)!.media as MetaAdMedia).items).toEqual([{ ...videoMedia(A).items[0]!, videoUrl: `https://blob.test/meta-library/${SITE_ID}/${A}/video-0.mp4` }]);
    expect((keptRow(handle, B)!.media as MetaAdMedia).items).toEqual([
      carousel.items[0]!,
      { ...carousel.items[1]!, videoUrl: `https://blob.test/meta-library/${SITE_ID}/${B}/video-1.mp4` },
      { ...carousel.items[2]!, videoUrl: `https://blob.test/meta-library/${SITE_ID}/${B}/video-2.mp4` },
    ]);
    expect(libraryVideoUrls(keptRow(handle, B)!.media as MetaAdMedia)).toHaveLength(2);
    // meta_ad_media (commun aux sites) garde les visuels tels qu'ils étaient
    expect(handle.rows(metaAdMedia).find((row) => row.adId === B)!.media).toEqual(carousel);
    expect(handle.count("insert", metaAdMedia)).toBe(0);
    expect(META_LIBRARY_COPY_DEADLINE_MS).toBe(90_000);
    expect(META_LIBRARY_VIDEO_MAX_BYTES).toBe(40 * 1024 * 1024);
  });

  it("sans stockage (store null) : l'exemple est gardé sans copie de la vidéo, sans téléchargement", async () => {
    const cached = videoMedia(A);
    const handle = memoryDb({ analyses: market(), media: [mediaRow(A, cached)] });
    const { calls, impl } = cdn();
    expect(await keepMetaAds(handle.db, SITE_ID, [A], keepDeps({ store: null, fetchImpl: impl, provider: fakeMediaProvider().provider }))).toEqual({ status: "done", count: 1 });
    expect(calls).toHaveLength(0);
    expect(keptRow(handle, A)).toMatchObject({ status: "kept", media: cached });
    expect(libraryVideoUrls(keptRow(handle, A)!.media as MetaAdMedia)).toEqual([]);
  });

  it("copie de la vidéo impossible (lien refusé, mauvais type, stockage qui lève ou refuse, délai écoulé) : l'exemple est gardé sans vidéo durable", async () => {
    const cached = videoMedia(A);
    const attempt = async (deps: Partial<Parameters<typeof keepMetaAds>[3]>) => {
      const handle = memoryDb({ analyses: market(), media: [mediaRow(A, cached)] });
      expect(await keepMetaAds(handle.db, SITE_ID, [A], keepDeps(deps))).toEqual({ status: "done", count: 1 });
      return keptRow(handle, A)!.media as MetaAdMedia;
    };
    const refused = cdn({ video: () => bytesResponse(VIDEO_BYTES, "video/mp4", { status: 403 }) });
    expect(await attempt({ store: fakeStore().store, fetchImpl: refused.impl })).toEqual(cached);
    const html = cdn({ video: () => bytesResponse(VIDEO_BYTES, "text/html") });
    expect(await attempt({ store: fakeStore().store, fetchImpl: html.impl })).toEqual(cached);
    const throwing = fakeStore({
      putFile: () => {
        throw new Error("Blob indisponible");
      },
    });
    expect(await attempt({ store: throwing.store, fetchImpl: cdn().impl })).toEqual(cached);
    expect(throwing.files).toHaveLength(1);
    expect(await attempt({ store: fakeStore({ putFile: () => null }).store, fetchImpl: cdn().impl })).toEqual(cached);
    // Délai des copies déjà écoulé : la vidéo n'est même pas téléchargée
    const late = cdn();
    const lateStore = fakeStore();
    expect(await attempt({ store: lateStore.store, fetchImpl: late.impl, deadlineMs: -1 })).toEqual(cached);
    expect(late.calls).toHaveLength(0);
    expect(lateStore.files).toHaveLength(0);
  });

  it("image non copiée lors de la veille : copiée au moment de garder (meta-media/<adId>/<index>.jpg)", async () => {
    const bare = imageMedia(A, { items: [{ kind: "image", posterUrl: null, sourceImageUrl: cdnImage("a-0"), sourceVideoUrl: null }] });
    const handle = memoryDb({ analyses: market(), media: [mediaRow(A, bare)] });
    const { store, images, files } = fakeStore();
    const { calls, impl } = cdn();
    expect(await keepMetaAds(handle.db, SITE_ID, [A], keepDeps({ store, fetchImpl: impl }))).toEqual({ status: "done", count: 1 });
    expect(calls.map((call) => call.url)).toEqual([cdnImage("a-0")]);
    expect(images.map((image) => [image.key, image.maxWidth])).toEqual([[`meta-media/${A}/0.jpg`, META_MEDIA_POSTER_WIDTH]]);
    expect(files).toHaveLength(0);
    expect((keptRow(handle, A)!.media as MetaAdMedia).items).toEqual([{ kind: "image", posterUrl: `https://blob.test/meta-media/${A}/0.jpg`, sourceImageUrl: cdnImage("a-0"), sourceVideoUrl: null }]);
  });

  it("liens d'origine expirés : rafraîchis chez le fournisseur (une recherche, inscrite à l'usage) avant la copie de la vidéo", async () => {
    const expired = videoMedia(A, {
      sourceExpiresAt: EXPIRED.toISOString(),
      items: [{ kind: "video", posterUrl: `https://blob.test/meta-media/${A}/0.jpg`, sourceImageUrl: cdnImage(`${A}-affiche`, EXPIRED), sourceVideoUrl: cdnVideo(`${A}-0`, EXPIRED) }],
    });
    const handle = memoryDb({ analyses: market(), media: [mediaRow(A, expired)] });
    const { provider, calls: lookups } = fakeMediaProvider((adId) => videoLookup(adId, { items: [{ kind: "video", imageUrl: cdnImage("frais-affiche"), videoUrl: cdnVideo("frais") }] }));
    const { store, files } = fakeStore();
    const { calls, impl } = cdn();
    expect(await keepMetaAds(handle.db, SITE_ID, [A], keepDeps({ provider, store, fetchImpl: impl }))).toEqual({ status: "done", count: 1 });
    expect(lookups).toEqual([A]);
    // La vidéo copiée vient du lien rafraîchi, jamais du lien expiré
    expect(calls.map((call) => call.url)).toContain(cdnVideo("frais"));
    expect(calls.map((call) => call.url)).not.toContain(cdnVideo(`${A}-0`, EXPIRED));
    expect(files.map((file) => file.key)).toEqual([`meta-library/${SITE_ID}/${A}/video-0.mp4`]);
    expect((keptRow(handle, A)!.media as MetaAdMedia).items[0]).toMatchObject({ sourceVideoUrl: cdnVideo("frais"), videoUrl: `https://blob.test/meta-library/${SITE_ID}/${A}/video-0.mp4` });
    expect((keptRow(handle, A)!.media as MetaAdMedia).sourceExpiresAt).toBe(FRESH.toISOString());
    // Recherche inscrite au tarif du fournisseur, cache commun rafraîchi
    expect(handle.rows(googleUsage)).toMatchObject([{ siteId: SITE_ID, kind: "meta_media", requests: 1, costUsd: META_MEDIA_LOOKUP_COST_USD, month: "2026-10" }]);
    expect((handle.rows(metaAdMedia)[0]!.media as MetaAdMedia).items[0]!.sourceVideoUrl).toBe(cdnVideo("frais"));
  });

  it("liens expirés sans fournisseur ou quota mensuel épuisé : aucune recherche, aucun téléchargement du lien mort, l'exemple est gardé tel quel", async () => {
    const expired = videoMedia(A, { sourceExpiresAt: EXPIRED.toISOString() });
    const exhausted = memoryDb({ analyses: market(), media: [mediaRow(A, expired)], usage: [usageRow(META_MEDIA_LOOKUPS_PER_MONTH)] });
    const { provider, calls: lookups } = fakeMediaProvider();
    const quota = cdn();
    expect(await keepMetaAds(exhausted.db, SITE_ID, [A], keepDeps({ provider, store: fakeStore().store, fetchImpl: quota.impl }))).toEqual({ status: "done", count: 1 });
    expect(lookups).toEqual([]);
    expect(quota.calls).toHaveLength(0);
    expect(keptRow(exhausted, A)).toMatchObject({ status: "kept", media: expired });
    expect(exhausted.rows(googleUsage)).toHaveLength(1);
    const noProvider = memoryDb({ analyses: market(), media: [mediaRow(A, expired)] });
    const offline = cdn();
    expect(await keepMetaAds(noProvider.db, SITE_ID, [A], keepDeps({ provider: null, store: fakeStore().store, fetchImpl: offline.impl }))).toEqual({ status: "done", count: 1 });
    expect(offline.calls).toHaveLength(0);
    expect(keptRow(noProvider, A)).toMatchObject({ media: expired });
    // Rien à rafraîchir quand tout est déjà durable (image copiée, pas de vidéo) : pas de recherche malgré l'expiration
    const durable = memoryDb({ analyses: market(), media: [mediaRow(A, imageMedia(A, { sourceExpiresAt: EXPIRED.toISOString() }))] });
    const idle = fakeMediaProvider();
    expect(await keepMetaAds(durable.db, SITE_ID, [A], keepDeps({ provider: idle.provider, store: fakeStore().store, fetchImpl: cdn().impl }))).toEqual({ status: "done", count: 1 });
    expect(idle.calls).toEqual([]);
    expect(durable.rows(googleUsage)).toEqual([]);
  });

  it("annonce supprimée puis gardée (encore dans la veille) : la même ligne redevient un exemple", async () => {
    const before = new Date(NOW.getTime() - DAY_MS);
    const handle = memoryDb({ analyses: market(), library: [libraryRow(A, "dismissed", { createdAt: before, updatedAt: before })], media: [mediaRow(A, imageMedia(A))] });
    expect(await keepMetaAds(handle.db, SITE_ID, [A], keepDeps())).toEqual({ status: "done", count: 1 });
    expect(handle.rows(metaAdsLibrary)).toHaveLength(1);
    expect(keptRow(handle, A)).toMatchObject({ status: "kept", ad: marketAd(A), media: imageMedia(A), createdAt: NOW, updatedAt: NOW });
    expect(await loadMetaLibrary(handle.db, SITE_ID)).toMatchObject({ dismissedIds: [], kept: [{ adId: A, savedAt: NOW.toISOString() }] });
  });

  it(`au plus META_LIBRARY_BULK_MAX (${META_LIBRARY_BULK_MAX}) annonces par action groupée`, async () => {
    const ids = Array.from({ length: META_LIBRARY_BULK_MAX + 5 }, (_, i) => String(740_000_000_000_000 + i));
    const handle = memoryDb({ analyses: [analysisRow(ids.map((id) => marketAd(id)))] });
    expect(await keepMetaAds(handle.db, SITE_ID, ids, keepDeps())).toEqual({ status: "done", count: META_LIBRARY_BULK_MAX });
    expect(handle.rows(metaAdsLibrary).map((row) => row.adId)).toEqual(ids.slice(0, META_LIBRARY_BULK_MAX));
  });

  it("table absente (migration 0007) → `unavailable` ; autre erreur de base → levée", async () => {
    for (const table of [metaAdsLibrary, metaAdsAnalyses]) {
      const absent = memoryDb({ analyses: market() }, { fail: missing(table) });
      expect(await keepMetaAds(absent.db, SITE_ID, [A], keepDeps())).toEqual({ status: "skipped", reason: "unavailable" });
    }
    const down = memoryDb({ analyses: market() }, { fail: (op) => (op === "insert" ? new Error("connexion perdue") : null) });
    await expect(keepMetaAds(down.db, SITE_ID, [A], keepDeps())).rejects.toThrow("connexion perdue");
  });
});

describe("dismissMetaAds", () => {
  const market = () => [analysisRow([marketAd(A), marketAd(B), marketAd(C)])];
  const durable = (adId: string): MetaAdMedia =>
    imageMedia(adId, {
      format: "carousel",
      items: [
        { kind: "video", posterUrl: `https://blob.test/meta-media/${adId}/0.jpg`, sourceImageUrl: null, sourceVideoUrl: cdnVideo(`${adId}-0`), videoUrl: `https://blob.test/meta-library/${SITE_ID}/${adId}/video-0.mp4` },
        { kind: "image", posterUrl: `https://blob.test/meta-media/${adId}/1.jpg`, sourceImageUrl: null, sourceVideoUrl: null },
        { kind: "video", posterUrl: null, sourceImageUrl: null, sourceVideoUrl: cdnVideo(`${adId}-2`), videoUrl: `https://blob.test/meta-library/${SITE_ID}/${adId}/video-2.mp4` },
      ],
    });

  it("annonce de la veille : inscrite comme supprimée (sans contenu), elle sort de la veille des analyses suivantes", async () => {
    const handle = memoryDb({ analyses: market() });
    const { store, removed } = fakeStore();
    expect(await dismissMetaAds(handle.db, SITE_ID, [A, C], { store, now: NOW })).toEqual({ status: "done", count: 2 });
    expect(handle.rows(metaAdsLibrary)).toMatchObject([
      { siteId: SITE_ID, adId: A, status: "dismissed", pageName: "Cabinet 001", ad: null, media: null, createdAt: NOW, updatedAt: NOW },
      { siteId: SITE_ID, adId: C, status: "dismissed", pageName: "Cabinet 003", ad: null, media: null, createdAt: NOW, updatedAt: NOW },
    ]);
    expect(removed).toEqual([]);
    expect(await libraryForAnalysis(handle.db, SITE_ID)).toEqual({ dismissedIds: expect.arrayContaining([A, C]), favorites: [] });
    // Supprimer à nouveau : sans effet, toujours une ligne par annonce
    const later = new Date(NOW.getTime() + DAY_MS);
    expect(await dismissMetaAds(handle.db, SITE_ID, [A], { store, now: later })).toEqual({ status: "done", count: 1 });
    expect(handle.rows(metaAdsLibrary)).toHaveLength(2);
    expect(handle.rows(metaAdsLibrary).find((row) => row.adId === A)).toMatchObject({ status: "dismissed", createdAt: NOW, updatedAt: later });
  });

  it("exemple gardé : ses vidéos durables sont supprimées du stockage (elles seules), il devient une annonce supprimée", async () => {
    const before = new Date(NOW.getTime() - 3 * DAY_MS);
    const handle = memoryDb({
      analyses: market(),
      library: [
        libraryRow(A, "kept", { media: durable(A), createdAt: before, updatedAt: before }),
        libraryRow(B, "kept", { media: imageMedia(B) }),
        // Même annonce gardée par un autre site : ni sa ligne ni ses vidéos ne sont touchées
        libraryRow(A, "kept", { siteId: OTHER_SITE_ID, media: durable(A) }),
      ],
    });
    const { store, removed } = fakeStore();
    expect(await dismissMetaAds(handle.db, SITE_ID, [A, B], { store, now: NOW })).toEqual({ status: "done", count: 2 });
    expect(removed).toEqual([[`https://blob.test/meta-library/${SITE_ID}/${A}/video-0.mp4`, `https://blob.test/meta-library/${SITE_ID}/${A}/video-2.mp4`]]);
    const rows = handle.rows(metaAdsLibrary);
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.siteId === SITE_ID && row.adId === A)).toMatchObject({ status: "dismissed", ad: null, media: null, pageName: "Cabinet 001", createdAt: before, updatedAt: NOW });
    expect(rows.find((row) => row.siteId === SITE_ID && row.adId === B)).toMatchObject({ status: "dismissed", ad: null, media: null });
    expect(rows.find((row) => row.siteId === OTHER_SITE_ID)).toMatchObject({ status: "kept", media: durable(A) });
    expect(await loadMetaLibrary(handle.db, SITE_ID)).toMatchObject({ kept: [], dismissedIds: expect.arrayContaining([A, B]) });
  });

  it("refuse les annonces inconnues (ni dans la veille ni dans la bibliothèque du site) : `unknown_ad`, rien n'est écrit ni supprimé", async () => {
    const handle = memoryDb({ analyses: market(), library: [libraryRow(A, "kept", { media: durable(A) }), libraryRow(UNKNOWN, "kept", { siteId: OTHER_SITE_ID })] });
    const { store, removed } = fakeStore();
    expect(await dismissMetaAds(handle.db, SITE_ID, [A, UNKNOWN], { store, now: NOW })).toEqual({ status: "skipped", reason: "unknown_ad" });
    expect(handle.count("insert", metaAdsLibrary)).toBe(0);
    expect(removed).toEqual([]);
    expect(handle.rows(metaAdsLibrary).find((row) => row.siteId === SITE_ID)).toMatchObject({ adId: A, status: "kept" });
    expect(await dismissMetaAds(memoryDb().db, SITE_ID, [A], { store, now: NOW })).toEqual({ status: "skipped", reason: "unknown_ad" });
  });

  it("annonce de la bibliothèque sortie de la veille : acceptée (nom de page de la bibliothèque) ; aucun identifiant valable → `empty`", async () => {
    const handle = memoryDb({ analyses: market(), library: [libraryRow(D, "kept", { pageName: "Cabinet gardé", media: durable(D) }), libraryRow(UNKNOWN, "dismissed", { pageName: "Cabinet écarté" })] });
    const { store, removed } = fakeStore();
    expect(await dismissMetaAds(handle.db, SITE_ID, [D, UNKNOWN], { store, now: NOW })).toEqual({ status: "done", count: 2 });
    expect(handle.rows(metaAdsLibrary)).toMatchObject([
      { adId: D, status: "dismissed", pageName: "Cabinet gardé", ad: null, media: null },
      { adId: UNKNOWN, status: "dismissed", pageName: "Cabinet écarté" },
    ]);
    expect(removed).toEqual([libraryVideoUrls(durable(D))]);
    expect(await dismissMetaAds(handle.db, SITE_ID, [], { store, now: NOW })).toEqual({ status: "skipped", reason: "empty" });
    expect(await dismissMetaAds(handle.db, SITE_ID, ["abc"], { store, now: NOW })).toEqual({ status: "skipped", reason: "empty" });
  });

  it("sans stockage ou suppression des copies en échec : l'annonce est supprimée quand même, sans lever", async () => {
    const withoutStore = memoryDb({ analyses: market(), library: [libraryRow(A, "kept", { media: durable(A) })] });
    expect(await dismissMetaAds(withoutStore.db, SITE_ID, [A], { store: null, now: NOW })).toEqual({ status: "done", count: 1 });
    expect(withoutStore.rows(metaAdsLibrary)[0]).toMatchObject({ status: "dismissed" });
    const failing = fakeStore({ remove: () => Promise.reject(new Error("Blob indisponible")) });
    const handle = memoryDb({ analyses: market(), library: [libraryRow(A, "kept", { media: durable(A) })] });
    expect(await dismissMetaAds(handle.db, SITE_ID, [A], { store: failing.store, now: NOW })).toEqual({ status: "done", count: 1 });
    expect(failing.removed).toHaveLength(1);
    expect(handle.rows(metaAdsLibrary)[0]).toMatchObject({ status: "dismissed", media: null });
  });

  it("table absente (migration 0007) → `unavailable` ; autre erreur de base → levée", async () => {
    const absent = memoryDb({ analyses: market() }, { fail: missing(metaAdsLibrary) });
    expect(await dismissMetaAds(absent.db, SITE_ID, [A], { store: null, now: NOW })).toEqual({ status: "skipped", reason: "unavailable" });
    const down = memoryDb({ analyses: market() }, { fail: (op) => (op === "insert" ? new Error("connexion perdue") : null) });
    await expect(dismissMetaAds(down.db, SITE_ID, [A], { store: null, now: NOW })).rejects.toThrow("connexion perdue");
  });
});

describe("restoreMetaAds", () => {
  const video = (adId: string) => `https://blob.test/meta-library/${SITE_ID}/${adId}/video-0.mp4`;
  const withVideo = (adId: string): MetaAdMedia => videoMedia(adId, { items: [{ ...videoMedia(adId).items[0]!, videoUrl: video(adId) }] });
  const seed = (): Seed => ({
    library: [
      libraryRow(A, "kept", { media: withVideo(A) }),
      libraryRow(B, "dismissed"),
      libraryRow(C, "kept", { media: imageMedia(C) }),
      libraryRow(D, "kept", { media: withVideo(D) }),
      libraryRow(A, "kept", { siteId: OTHER_SITE_ID, media: withVideo(A) }),
    ],
  });

  it("retire les lignes (exemples gardés et annonces supprimées) et supprime les vidéos durables des exemples retirés", async () => {
    const handle = memoryDb(seed());
    const { store, removed } = fakeStore();
    expect(await restoreMetaAds(handle.db, SITE_ID, [A, B, C, UNKNOWN], { store })).toEqual({ status: "done", count: 3 });
    expect(removed).toEqual([[video(A)]]);
    const rows = handle.rows(metaAdsLibrary);
    // Restent l'exemple non visé et la ligne de l'autre site
    expect(rows.map((row) => [row.siteId, row.adId])).toEqual([
      [SITE_ID, D],
      [OTHER_SITE_ID, A],
    ]);
    expect(await loadMetaLibrary(handle.db, SITE_ID)).toMatchObject({ kept: [{ adId: D }], dismissedIds: [] });
  });

  it("annonce supprimée restaurée : aucune vidéo à retirer du stockage ; annonce absente de la bibliothèque : zéro ligne", async () => {
    const handle = memoryDb(seed());
    const { store, removed } = fakeStore();
    expect(await restoreMetaAds(handle.db, SITE_ID, [B], { store })).toEqual({ status: "done", count: 1 });
    expect(await restoreMetaAds(handle.db, SITE_ID, [B, UNKNOWN], { store })).toEqual({ status: "done", count: 0 });
    expect(await restoreMetaAds(handle.db, SITE_ID, [C], { store })).toEqual({ status: "done", count: 1 });
    expect(removed).toEqual([]);
    expect(handle.rows(metaAdsLibrary)).toHaveLength(3);
  });

  it("sans stockage ou suppression des copies en échec : les lignes sont retirées quand même ; aucun identifiant valable → `empty`", async () => {
    const withoutStore = memoryDb(seed());
    expect(await restoreMetaAds(withoutStore.db, SITE_ID, [A, D], { store: null })).toEqual({ status: "done", count: 2 });
    const failing = fakeStore({ remove: () => Promise.reject(new Error("Blob indisponible")) });
    const handle = memoryDb(seed());
    expect(await restoreMetaAds(handle.db, SITE_ID, [A, D], { store: failing.store })).toEqual({ status: "done", count: 2 });
    expect(failing.removed).toEqual([[video(A), video(D)]]);
    expect(await restoreMetaAds(handle.db, SITE_ID, [], { store: null })).toEqual({ status: "skipped", reason: "empty" });
    expect(await restoreMetaAds(handle.db, SITE_ID, ["abc", "12"], { store: null })).toEqual({ status: "skipped", reason: "empty" });
  });

  it("table absente (migration 0007) → `unavailable` ; autre erreur de base → levée", async () => {
    expect(await restoreMetaAds(memoryDb(seed(), { fail: missing(metaAdsLibrary) }).db, SITE_ID, [A], { store: null })).toEqual({ status: "skipped", reason: "unavailable" });
    await expect(restoreMetaAds(memoryDb(seed(), { fail: () => new Error("connexion perdue") }).db, SITE_ID, [A], { store: null })).rejects.toThrow("connexion perdue");
  });

  it("garder, supprimer puis restaurer : l'annonce retrouve son état d'origine dans la veille", async () => {
    const handle = memoryDb({ analyses: [analysisRow([marketAd(A), marketAd(B)])], media: [mediaRow(A, videoMedia(A))] });
    const { store, removed, files } = fakeStore();
    const deps = { provider: null, store, now: NOW, fetchImpl: cdn().impl };
    expect(await keepMetaAds(handle.db, SITE_ID, [A], deps)).toEqual({ status: "done", count: 1 });
    expect(files).toHaveLength(1);
    expect(await dismissMetaAds(handle.db, SITE_ID, [A, B], { store, now: NOW })).toEqual({ status: "done", count: 2 });
    expect(removed).toEqual([[video(A)]]);
    expect(await libraryForAnalysis(handle.db, SITE_ID)).toMatchObject({ favorites: [] });
    expect(await restoreMetaAds(handle.db, SITE_ID, [A, B], { store })).toEqual({ status: "done", count: 2 });
    // Déjà supprimée du stockage au moment d'écarter l'exemple : rien de plus à retirer
    expect(removed).toHaveLength(1);
    expect(handle.rows(metaAdsLibrary)).toEqual([]);
    expect(await libraryForAnalysis(handle.db, SITE_ID)).toEqual({ dismissedIds: [], favorites: [] });
    expect(await keepMetaAds(handle.db, SITE_ID, [A], deps)).toEqual({ status: "done", count: 1 });
  });
});

// ─── Lecture d'une vidéo ─────────────────────────────────────────────────────

describe("metaAdVideoSource", () => {
  const durableUrl = `https://blob.test/meta-library/${SITE_ID}/${A}/video-0.mp4`;
  const keptMedia = (): MetaAdMedia => videoMedia(A, { items: [{ ...videoMedia(A).items[0]!, videoUrl: durableUrl }] });
  const market = () => [analysisRow([marketAd(A), marketAd(B)])];
  const sourceDeps = (overrides: Partial<Parameters<typeof metaAdVideoSource>[4]> = {}) => ({ provider: null, store: null, now: NOW, ...overrides });

  it("exemple gardé : sa copie durable, même sortie de la veille, liens d'origine expirés et sans fournisseur", async () => {
    const expiredKept = { ...keptMedia(), sourceExpiresAt: EXPIRED.toISOString() };
    const handle = memoryDb({ library: [libraryRow(A, "kept", { media: expiredKept })] });
    const { provider, calls } = fakeMediaProvider();
    expect(await metaAdVideoSource(handle.db, SITE, A, 0, sourceDeps({ provider }))).toEqual({ url: durableUrl, durable: true });
    expect(await metaAdVideoSource(handle.db, SITE, A, 0, sourceDeps())).toEqual({ url: durableUrl, durable: true });
    expect(calls).toEqual([]);
    expect(handle.rows(googleUsage)).toEqual([]);
  });

  it("annonce de la veille : lien d'origine tant qu'il n'a pas expiré, sans recherche", async () => {
    const handle = memoryDb({ analyses: market(), media: [mediaRow(B, videoMedia(B))] });
    const { provider, calls } = fakeMediaProvider();
    expect(await metaAdVideoSource(handle.db, SITE, B, 0, sourceDeps({ provider }))).toEqual({ url: cdnVideo(`${B}-0`), durable: false });
    expect(calls).toEqual([]);
    expect(handle.rows(googleUsage)).toEqual([]);
    // Exemple gardé sans copie durable (copie impossible au moment de garder) : même repli sur le lien d'origine
    const kept = memoryDb({ library: [libraryRow(A, "kept", { media: videoMedia(A) })] });
    expect(await metaAdVideoSource(kept.db, SITE, A, 0, sourceDeps({ provider }))).toEqual({ url: cdnVideo(`${A}-0`), durable: false });
    expect(calls).toEqual([]);
  });

  it("visuel choisi par son index dans un carrousel", async () => {
    const carousel = imageMedia(B, {
      format: "carousel",
      items: [
        { kind: "image", posterUrl: "https://blob.test/0.jpg", sourceImageUrl: cdnImage("b-0"), sourceVideoUrl: null },
        { kind: "video", posterUrl: "https://blob.test/1.jpg", sourceImageUrl: cdnImage("b-1"), sourceVideoUrl: cdnVideo("b-1") },
        { kind: "video", posterUrl: "https://blob.test/2.jpg", sourceImageUrl: cdnImage("b-2"), sourceVideoUrl: cdnVideo("b-2") },
      ],
    });
    const handle = memoryDb({ analyses: market(), media: [mediaRow(B, carousel)] });
    expect(await metaAdVideoSource(handle.db, SITE, B, 1, sourceDeps())).toEqual({ url: cdnVideo("b-1"), durable: false });
    expect(await metaAdVideoSource(handle.db, SITE, B, 2, sourceDeps())).toEqual({ url: cdnVideo("b-2"), durable: false });
    // Diapositive sans vidéo, index hors des visuels : rien à lire (sans fournisseur)
    expect(await metaAdVideoSource(handle.db, SITE, B, 0, sourceDeps())).toBeNull();
    expect(await metaAdVideoSource(handle.db, SITE, B, 7, sourceDeps())).toBeNull();
  });

  it("annonce qui n'appartient ni à la veille ni à la bibliothèque du site → null, sans recherche ni usage", async () => {
    const handle = memoryDb({
      analyses: [...market(), analysisRow([marketAd(C)], { siteId: OTHER_SITE_ID }), analysisRow([marketAd(D)], { createdAt: new Date(NOW.getTime() - DAY_MS) })],
      media: [mediaRow(C, videoMedia(C)), mediaRow(D, videoMedia(D)), mediaRow(UNKNOWN, videoMedia(UNKNOWN))],
      library: [libraryRow(C, "kept", { siteId: OTHER_SITE_ID, media: videoMedia(C) }), libraryRow(UNKNOWN, "dismissed")],
    });
    const { provider, calls } = fakeMediaProvider((adId) => videoLookup(adId));
    // Veille et bibliothèque d'un autre site, veille précédente du site, annonce supprimée sortie de la veille
    for (const adId of [C, D, UNKNOWN]) expect(await metaAdVideoSource(handle.db, SITE, adId, 0, sourceDeps({ provider }))).toBeNull();
    expect(calls).toEqual([]);
    expect(handle.rows(googleUsage)).toEqual([]);
    expect(handle.count("insert", metaAdMedia)).toBe(0);
  });

  it("identifiant ou index invalide → null sans aucune requête", async () => {
    const handle = memoryDb({ analyses: market(), media: [mediaRow(B, videoMedia(B))] });
    const { provider, calls } = fakeMediaProvider();
    for (const [adId, index] of [
      ["abc", 0],
      ["", 0],
      [`${B}'--`, 0],
      [B, -1],
      [B, 0.5],
      [B, Number.NaN],
    ] as const) {
      expect(await metaAdVideoSource(handle.db, SITE, adId, index, sourceDeps({ provider }))).toBeNull();
    }
    expect(handle.log).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("lien d'origine expiré : rafraîchi chez le fournisseur (une recherche forcée, inscrite à l'usage), cache mis à jour", async () => {
    const expired = videoMedia(B, { sourceExpiresAt: EXPIRED.toISOString(), items: [{ kind: "video", posterUrl: `https://blob.test/meta-media/${B}/0.jpg`, sourceImageUrl: cdnImage("vieux", EXPIRED), sourceVideoUrl: cdnVideo("vieux", EXPIRED) }] });
    const handle = memoryDb({ analyses: market(), media: [mediaRow(B, expired)], usage: [usageRow(10)] });
    const { provider, calls } = fakeMediaProvider((adId) => videoLookup(adId, { items: [{ kind: "video", imageUrl: cdnImage("frais-affiche"), videoUrl: cdnVideo("frais") }] }));
    const source = await metaAdVideoSource(handle.db, SITE, B, 0, sourceDeps({ provider }));
    expect(source).toEqual({ url: cdnVideo("frais"), durable: false });
    expect(calls).toEqual([B]);
    const usage = handle.rows(googleUsage);
    expect(usage).toHaveLength(2);
    expect(usage[1]).toMatchObject({ siteId: SITE_ID, month: "2026-10", kind: "meta_media", requests: 1, costUsd: META_MEDIA_LOOKUP_COST_USD, createdAt: NOW });
    expect(await mediaLookupsUsed(handle.db, SITE_ID, NOW)).toBe(11);
    const rows = handle.rows(metaAdMedia);
    expect(rows).toHaveLength(1);
    expect((rows[0]!.media as MetaAdMedia).items[0]!.sourceVideoUrl).toBe(cdnVideo("frais"));
    // Lien rafraîchi : l'appel suivant est servi par le cache
    expect(await metaAdVideoSource(handle.db, SITE, B, 0, sourceDeps({ provider }))).toEqual({ url: cdnVideo("frais"), durable: false });
    expect(calls).toEqual([B]);
    // Visuels de démonstration : la recherche est comptée mais ne coûte rien
    const demo = memoryDb({ analyses: market(), media: [mediaRow(B, expired)] });
    const mock = fakeMediaProvider((adId) => videoLookup(adId), "mock");
    expect(await metaAdVideoSource(demo.db, SITE, B, 0, sourceDeps({ provider: mock.provider }))).toEqual({ url: cdnVideo(`${B}-0`), durable: false });
    expect(demo.rows(googleUsage)).toMatchObject([{ kind: "meta_media", requests: 1, costUsd: 0 }]);
  });

  it("lien expiré mais quota mensuel épuisé, ou sans fournisseur → null, aucune recherche", async () => {
    const expired = videoMedia(B, { sourceExpiresAt: EXPIRED.toISOString() });
    const exhausted = memoryDb({ analyses: market(), media: [mediaRow(B, expired)], usage: [usageRow(META_MEDIA_LOOKUPS_PER_MONTH)] });
    const { provider, calls } = fakeMediaProvider((adId) => videoLookup(adId));
    expect(await metaAdVideoSource(exhausted.db, SITE, B, 0, sourceDeps({ provider }))).toBeNull();
    expect(calls).toEqual([]);
    expect(exhausted.rows(googleUsage)).toHaveLength(1);
    const noProvider = memoryDb({ analyses: market(), media: [mediaRow(B, expired)] });
    expect(await metaAdVideoSource(noProvider.db, SITE, B, 0, sourceDeps())).toBeNull();
    // Le quota d'un autre site ne compte pas
    const other = memoryDb({ analyses: market(), media: [mediaRow(B, expired)], usage: [usageRow(META_MEDIA_LOOKUPS_PER_MONTH, { siteId: OTHER_SITE_ID })] });
    expect(await metaAdVideoSource(other.db, SITE, B, 0, sourceDeps({ provider }))).toEqual({ url: cdnVideo(`${B}-0`), durable: false });
    expect(calls).toEqual([B]);
  });

  it("recherche de rafraîchissement sans vidéo exploitable (annonce introuvable, erreur du fournisseur) → null", async () => {
    const expired = videoMedia(B, { sourceExpiresAt: EXPIRED.toISOString() });
    const gone = memoryDb({ analyses: market(), media: [mediaRow(B, expired)] });
    const missingAd = fakeMediaProvider(() => null);
    expect(await metaAdVideoSource(gone.db, SITE, B, 0, sourceDeps({ provider: missingAd.provider }))).toBeNull();
    expect(missingAd.calls).toEqual([B]);
    expect(gone.rows(googleUsage)).toMatchObject([{ kind: "meta_media", requests: 1 }]);
    const failing = memoryDb({ analyses: market(), media: [mediaRow(B, expired)] });
    const refused = fakeMediaProvider(() => {
      throw new AdMediaError("ScrapeCreators HTTP 401", { status: 401, kind: "auth" });
    });
    expect(await metaAdVideoSource(failing.db, SITE, B, 0, sourceDeps({ provider: refused.provider }))).toBeNull();
    // Le cache n'est pas écrasé par une recherche en échec
    expect(failing.rows(metaAdMedia)[0]!.media).toEqual(expired);
  });

  it("exemple gardé sans copie durable et liens expirés : rafraîchi comme une annonce de la veille, même sortie de la veille", async () => {
    const expired = videoMedia(A, { sourceExpiresAt: EXPIRED.toISOString() });
    const handle = memoryDb({ library: [libraryRow(A, "kept", { media: expired })] });
    const { provider, calls } = fakeMediaProvider((adId) => videoLookup(adId, { items: [{ kind: "video", imageUrl: null, videoUrl: cdnVideo("frais") }] }));
    expect(await metaAdVideoSource(handle.db, SITE, A, 0, sourceDeps({ provider }))).toEqual({ url: cdnVideo("frais"), durable: false });
    expect(calls).toEqual([A]);
    expect(handle.rows(googleUsage)).toHaveLength(1);
  });

  it("table meta_ads_library absente (migration 0007) → null ; autre erreur de base → levée", async () => {
    const absent = memoryDb({ analyses: market(), media: [mediaRow(B, videoMedia(B))] }, { fail: missing(metaAdsLibrary) });
    expect(await metaAdVideoSource(absent.db, SITE, B, 0, sourceDeps())).toBeNull();
    const down = memoryDb({ analyses: market() }, { fail: () => new Error("connexion perdue") });
    await expect(metaAdVideoSource(down.db, SITE, B, 0, sourceDeps())).rejects.toThrow("connexion perdue");
  });
});
