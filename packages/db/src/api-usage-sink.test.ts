import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";
import { hasApiUsageSink, recordApiUsage, setApiUsageSink, setApiUsageSinkFactory, trackApiCall, withApiUsage, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import type * as ClientModule from "./client";

// ─── Pilote PostgreSQL et drizzle simulés ────────────────────────────────────
// `getDb()` ouvre un pool `pg` et l'enveloppe avec drizzle : ici le pool ne se connecte à rien, et la « base »
// rendue par drizzle garde les lignes insérées (ou lève l'erreur choisie par le test).

type Inserted = { table: string; values: Record<string, unknown> };

const pg = vi.hoisted(() => ({
  pools: [] as Record<string, unknown>[],
  inserted: [] as { table: unknown; values: Record<string, unknown> }[],
  failure: null as unknown,
}));

vi.mock("pg", () => ({
  Pool: class FakePool {
    constructor(options: Record<string, unknown>) {
      pg.pools.push(options);
    }
  },
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () => ({
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (pg.failure) throw pg.failure;
        pg.inserted.push({ table, values });
      },
    }),
  }),
}));

const SITE_ID = "11111111-1111-4111-8111-111111111111";
const DATABASE_URL = "postgres://harmony:motdepasse@db.exemple.test:5432/harmony";
const NOW = new Date("2026-11-11T14:32:05.123Z");

/** Événement complet, tel que `recordApiUsage` le remet au puits. */
function event(overrides: Partial<ResolvedApiUsageEvent> = {}): ResolvedApiUsageEvent {
  return {
    provider: "anthropic",
    operation: "messages",
    feature: "blog",
    siteId: SITE_ID,
    model: "claude-opus-5",
    status: "ok",
    requests: 1,
    inputTokens: 1_200,
    outputTokens: 800,
    cacheReadTokens: 300,
    cacheWriteTokens: 40,
    units: 0,
    costUsd: 0.026,
    costSource: "tariff",
    durationMs: 4_321,
    error: null,
    meta: { effort: "high", attempt: 1, stopReason: "end_turn" },
    createdAt: NOW,
    ...overrides,
  };
}

/** Base minimale : `insert(table).values(v)` garde `v`, ou lève l'erreur donnée. */
function fakeDb(fail?: () => unknown) {
  const rows: Inserted[] = [];
  const db = {
    insert: (table: Table) => ({
      values: async (values: Record<string, unknown>) => {
        const failure = fail?.();
        if (failure) throw failure;
        rows.push({ table: getTableName(table), values });
      },
    }),
  };
  return { db: db as unknown as ClientModule.Database, rows };
}

/** Erreur du pilote `pg` (code SQLSTATE sur l'erreur). */
const pgError = (code: string, message: string) => Object.assign(new Error(message), { code });
/** Erreur telle que drizzle l'enveloppe : la cause porte le code. */
const wrapped = (cause: unknown, depth = 1): Error => (depth <= 1 ? new Error('Failed query: insert into "api_usage" (…) values (…)', { cause }) : new Error("enveloppe", { cause: wrapped(cause, depth - 1) }));

let client: typeof ClientModule;

beforeEach(async () => {
  pg.pools.length = 0;
  pg.inserted.length = 0;
  pg.failure = null;
  globalThis.__theralysPool = undefined;
  vi.stubEnv("DATABASE_URL", undefined);
  // Hors test (comme en production) : le chargement du module pose la fabrique du puits
  vi.stubEnv("NODE_ENV", "production");
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  // Module rechargé à chaque test : son chargement pose la fabrique du puits, et l'avertissement « table absente »
  // (émis une seule fois par module) repart de zéro
  vi.resetModules();
  client = await import("./client");
});

// Le puits et sa fabrique sont globaux : retirés après chaque test, comme le pool partagé.
afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  globalThis.__theralysPool = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("apiUsageSink", () => {
  beforeEach(() => {
    // Ces tests exercent le puits seul : la fabrique posée par le chargement du module est retirée
    setApiUsageSinkFactory(null);
  });

  it("une ligne `api_usage` par événement, champ pour champ", async () => {
    const { db, rows } = fakeDb();
    const sink = client.apiUsageSink(db);
    await expect(sink(event())).resolves.toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.table).toBe("api_usage");
    expect(rows[0]!.values).toEqual({
      createdAt: NOW,
      provider: "anthropic",
      operation: "messages",
      feature: "blog",
      siteId: SITE_ID,
      model: "claude-opus-5",
      status: "ok",
      requests: 1,
      inputTokens: 1_200,
      outputTokens: 800,
      cacheReadTokens: 300,
      cacheWriteTokens: 40,
      units: 0,
      costUsd: 0.026,
      costSource: "tariff",
      durationMs: 4_321,
      error: null,
      meta: { effort: "high", attempt: 1, stopReason: "end_turn" },
    });
    // L'identifiant de la ligne est laissé à la base
    expect(Object.keys(rows[0]!.values)).not.toContain("id");
  });

  it("événement non attribué, en erreur, sans modèle ni notes : null transmis tel quel", async () => {
    const { db, rows } = fakeDb();
    await client.apiUsageSink(db)(event({ provider: "resend", operation: "email", feature: null, siteId: null, model: null, status: "error", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, costSource: "free", error: "Resend 503 (transitoire): panne", meta: null }));
    expect(rows[0]!.values).toMatchObject({ provider: "resend", operation: "email", feature: null, siteId: null, model: null, status: "error", costUsd: 0, costSource: "free", error: "Resend 503 (transitoire): panne", meta: null });
  });

  it("chaque événement est écrit, dans l'ordre des appels, sans rien regrouper", async () => {
    const { db, rows } = fakeDb();
    const sink = client.apiUsageSink(db);
    for (const operation of ["text_search", "place_details", "place_photo"]) await sink(event({ provider: "google_places", operation, units: 1 }));
    expect(rows.map((row) => row.values.operation)).toEqual(["text_search", "place_details", "place_photo"]);
  });

  it("table absente (42P01) ou colonne absente (42703) : l'écriture est abandonnée sans erreur, signalée une seule fois", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failures = [pgError("42P01", 'relation "api_usage" does not exist'), pgError("42703", 'column "cost_source" of relation "api_usage" does not exist'), pgError("42P01", 'relation "api_usage" does not exist')];
    const { db, rows } = fakeDb(() => failures.shift());
    const sink = client.apiUsageSink(db);
    for (let n = 0; n < 3; n++) await expect(sink(event())).resolves.toBeUndefined();
    expect(rows).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("table api_usage absente");
    // Un autre puits du même processus ne le répète pas
    await client.apiUsageSink(fakeDb(() => pgError("42P01", "relation absente")).db)(event());
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("code porté par la cause (erreur enveloppée par drizzle, jusqu'à plusieurs niveaux) : même tolérance", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failures = [wrapped(pgError("42P01", 'relation "api_usage" does not exist')), wrapped(pgError("42703", "colonne absente")), wrapped(pgError("42P01", "relation absente"), 4)];
    const { db } = fakeDb(() => failures.shift());
    const sink = client.apiUsageSink(db);
    for (let n = 0; n < 3; n++) await expect(sink(event())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("la table réapparaît (migration appliquée) : les événements suivants sont écrits", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let missing = true;
    const { db, rows } = fakeDb(() => (missing ? pgError("42P01", "relation absente") : null));
    const sink = client.apiUsageSink(db);
    await sink(event({ operation: "perdu" }));
    missing = false;
    await sink(event({ operation: "inscrit" }));
    expect(rows.map((row) => row.values.operation)).toEqual(["inscrit"]);
  });

  it("toute autre erreur est relancée telle quelle (contrainte, type, connexion, erreur sans code)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failures = [
      pgError("23503", 'insert or update on table "api_usage" violates foreign key constraint "api_usage_site_id_sites_id_fk"'),
      pgError("22P02", 'invalid input syntax for type uuid: "site-a"'),
      pgError("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:5432"),
      new Error("délai de connexion dépassé"),
      wrapped(pgError("23505", "duplicate key value violates unique constraint")),
      // Code voisin mais différent : table en double, pas table absente
      pgError("42P07", 'relation "api_usage" already exists'),
    ];
    for (const failure of failures) {
      const { db, rows } = fakeDb(() => failure);
      await expect(client.apiUsageSink(db)(event())).rejects.toBe(failure);
      expect(rows).toHaveLength(0);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it("valeur levée qui n'est pas une erreur, même avec un code de table absente : relancée", async () => {
    const odd = { code: "42P01", message: "pas une Error" };
    await expect(client.apiUsageSink(fakeDb(() => odd).db)(event())).rejects.toBe(odd);
    await expect(client.apiUsageSink(fakeDb(() => "42P01").db)(event())).rejects.toBe("42P01");
  });

  it("chaîne de causes trop profonde ou cyclique : la recherche du code s'arrête, l'erreur est relancée", async () => {
    const deep = wrapped(pgError("42P01", "relation absente"), 5);
    await expect(client.apiUsageSink(fakeDb(() => deep).db)(event())).rejects.toBe(deep);
    const first = new Error("première");
    const second = new Error("seconde", { cause: first });
    first.cause = second;
    await expect(client.apiUsageSink(fakeDb(() => first).db)(event())).rejects.toBe(first);
  });

  it("branché sur le registre : l'appel mesuré est écrit avec son contexte, sa durée et son coût", async () => {
    const { db, rows } = fakeDb();
    setApiUsageSink(client.apiUsageSink(db));
    const result = await withApiUsage({ feature: "prospecting", siteId: SITE_ID }, () => trackApiCall({ provider: "google_places", operation: "text_search" }, async () => ["fiche"], () => ({ units: 1, costUsd: 0.035, costSource: "tariff" })));
    expect(result).toEqual(["fiche"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.table).toBe("api_usage");
    expect(rows[0]!.values).toMatchObject({ provider: "google_places", operation: "text_search", feature: "prospecting", siteId: SITE_ID, model: null, status: "ok", requests: 1, units: 1, costUsd: 0.035, costSource: "tariff", error: null, meta: null });
    expect(rows[0]!.values.createdAt).toBeInstanceOf(Date);
    expect(Number.isInteger(rows[0]!.values.durationMs)).toBe(true);
  });

  it("branché sur le registre : une écriture refusée n'atteint jamais l'appel mesuré (avertissement), une table absente non plus", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failures: unknown[] = [pgError("23503", "violates foreign key constraint"), wrapped(pgError("42P01", 'relation "api_usage" does not exist'))];
    setApiUsageSink(client.apiUsageSink(fakeDb(() => failures.shift()).db));
    await expect(trackApiCall({ provider: "pexels", operation: "search" }, async () => "photo")).resolves.toBe("photo");
    await expect(trackApiCall({ provider: "pexels", operation: "search" }, async () => "photo")).resolves.toBe("photo");
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual(["[api-usage] appel non enregistré :", expect.stringContaining("table api_usage absente")]);
  });
});

describe("getDb — pose du puits", () => {
  it("sans DATABASE_URL : erreur explicite, aucun pool, aucun puits", () => {
    setApiUsageSinkFactory(null);
    expect(() => client.getDb()).toThrow(/DATABASE_URL manquante/);
    expect(pg.pools).toHaveLength(0);
    expect(hasApiUsageSink()).toBe(false);
  });

  it("dès qu'une base existe, le puits est posé : les appels s'inscrivent dans `api_usage`", async () => {
    setApiUsageSinkFactory(null);
    vi.stubEnv("DATABASE_URL", DATABASE_URL);
    expect(hasApiUsageSink()).toBe(false);
    client.getDb();
    expect(hasApiUsageSink()).toBe(true);
    await recordApiUsage({ provider: "vercel", operation: "domain_attach", units: 1 });
    expect(pg.inserted).toHaveLength(1);
    expect(getTableName(pg.inserted[0]!.table as Table)).toBe("api_usage");
    expect(pg.inserted[0]!.values).toMatchObject({ provider: "vercel", operation: "domain_attach", units: 1, costSource: "free" });
  });

  it("un puits déjà en place n'est pas remplacé ; le pool est partagé entre les appels", async () => {
    setApiUsageSinkFactory(null);
    vi.stubEnv("DATABASE_URL", DATABASE_URL);
    const explicit: ResolvedApiUsageEvent[] = [];
    setApiUsageSink(async (received) => {
      explicit.push(received);
    });
    client.getDb();
    client.getDb();
    await recordApiUsage({ provider: "vercel", operation: "domain_attach" });
    expect(explicit).toHaveLength(1);
    expect(pg.inserted).toHaveLength(0);
    expect(pg.pools).toEqual([{ connectionString: DATABASE_URL, max: 10 }]);
  });
});

describe("chargement du module — fabrique du puits", () => {
  it("sous test (NODE_ENV=test) : aucune fabrique, un appel inscrit n'ouvre pas la base que DATABASE_URL désigne", async () => {
    setApiUsageSinkFactory(null);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", DATABASE_URL);
    vi.resetModules();
    const underTest = await import("./client");
    await recordApiUsage({ provider: "pexels", operation: "search", units: 1 });
    expect(hasApiUsageSink()).toBe(false);
    expect(pg.pools).toHaveLength(0);
    expect(pg.inserted).toHaveLength(0);
    // Une base ouverte exprès pose toujours le puits
    underTest.getDb();
    expect(hasApiUsageSink()).toBe(true);
  });

  it("le chargement pose la fabrique sans rien ouvrir : ni pool ni puits avant le premier appel inscrit", () => {
    vi.stubEnv("DATABASE_URL", DATABASE_URL);
    expect(pg.pools).toHaveLength(0);
    expect(hasApiUsageSink()).toBe(false);
  });

  it("premier appel inscrit sans que la base ait été touchée : la fabrique ouvre le puits (une fois) et l'événement est écrit", async () => {
    vi.stubEnv("DATABASE_URL", DATABASE_URL);
    await withApiUsage({ feature: "prospecting" }, () => recordApiUsage({ provider: "google_places", operation: "text_search", units: 1, costUsd: 0.035 }));
    expect(hasApiUsageSink()).toBe(true);
    expect(pg.pools).toEqual([{ connectionString: DATABASE_URL, max: 10 }]);
    expect(pg.inserted).toHaveLength(1);
    expect(pg.inserted[0]!.values).toMatchObject({ provider: "google_places", operation: "text_search", feature: "prospecting", siteId: null, units: 1, costUsd: 0.035, costSource: "tariff" });
    await recordApiUsage({ provider: "google_places", operation: "place_details", units: 1, costUsd: 0.025 });
    client.getDb();
    await recordApiUsage({ provider: "google_places", operation: "place_photo", units: 1, costUsd: 0.007 });
    // Chaque événement une seule fois, toujours le même pool
    expect(pg.inserted.map((row) => row.values.operation)).toEqual(["text_search", "place_details", "place_photo"]);
    expect(pg.pools).toHaveLength(1);
  });

  it("base non configurée (DATABASE_URL absente) : l'événement est abandonné sans rien lever, puis inscrit dès que la base existe", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordApiUsage({ provider: "pexels", operation: "search", units: 1 })).resolves.toBeUndefined();
    await expect(trackApiCall({ provider: "pexels", operation: "search" }, async () => "photo")).resolves.toBe("photo");
    expect(hasApiUsageSink()).toBe(false);
    expect(pg.pools).toHaveLength(0);
    expect(pg.inserted).toHaveLength(0);
    // La fabrique est réessayée à l'appel suivant
    vi.stubEnv("DATABASE_URL", DATABASE_URL);
    await recordApiUsage({ provider: "pexels", operation: "search", units: 1 });
    expect(hasApiUsageSink()).toBe(true);
    expect(pg.inserted.map((row) => row.values.provider)).toEqual(["pexels"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("un puits explicite l'emporte sur la fabrique du module : aucune base n'est ouverte", async () => {
    vi.stubEnv("DATABASE_URL", DATABASE_URL);
    const explicit: ResolvedApiUsageEvent[] = [];
    setApiUsageSink(async (received) => {
      explicit.push(received);
    });
    await recordApiUsage({ provider: "fal", operation: "image", units: 1, costUsd: 0.003 });
    expect(explicit).toHaveLength(1);
    expect(pg.pools).toHaveLength(0);
    expect(pg.inserted).toHaveLength(0);
  });

  it("puits ouvert par la fabrique : une écriture refusée est avalée par le registre, une table absente aussi", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", DATABASE_URL);
    pg.failure = pgError("23503", "violates foreign key constraint");
    await expect(recordApiUsage({ provider: "resend", operation: "email", units: 1 })).resolves.toBeUndefined();
    pg.failure = wrapped(pgError("42P01", 'relation "api_usage" does not exist'));
    await expect(recordApiUsage({ provider: "resend", operation: "email", units: 1 })).resolves.toBeUndefined();
    await expect(recordApiUsage({ provider: "resend", operation: "email", units: 1 })).resolves.toBeUndefined();
    expect(pg.inserted).toHaveLength(0);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual(["[api-usage] appel non enregistré :", expect.stringContaining("table api_usage absente")]);
  });
});
