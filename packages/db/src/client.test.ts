import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { setApiUsageSink } from "@theralys/shared/usage-runtime";
import { getDb, type Database } from "./client";

// Le pool `pg` n'ouvre une connexion qu'à la première requête : rien ici ne touche une base.
const DATABASE_URL = "postgres://harmony:motdepasse@db.exemple.test:5432/harmony";

/** Le pool sur lequel repose un client (drizzle l'expose sous `$client`). */
const poolOf = (db: Database): Pool => (db as unknown as { $client: Pool }).$client;

/** Connexion réservée simulée : garde l'ordre des instructions reçues. */
function fakeConnection() {
  const statements: string[] = [];
  let released = 0;
  return {
    statements,
    released: () => released,
    query: async (config: string | { text: string }) => {
      statements.push(typeof config === "string" ? config : config.text);
      return { rows: [], fields: [], rowCount: 0, command: "" };
    },
    release: () => {
      released++;
    },
  };
}

/** Remplace l'ouverture de connexion du pool : rend la connexion simulée, compte les demandes. */
function reserveFrom(pool: Pool) {
  const connection = fakeConnection();
  let reserved = 0;
  let direct = 0;
  const patched = pool as unknown as { connect: () => Promise<unknown>; query: () => Promise<unknown> };
  patched.connect = async () => {
    reserved++;
    return connection;
  };
  // Une instruction envoyée au pool lui-même partirait sur une connexion quelconque
  patched.query = async () => {
    direct++;
    return { rows: [], fields: [], rowCount: 0, command: "" };
  };
  return { connection, reserved: () => reserved, direct: () => direct };
}

let previousUrl: string | undefined;

beforeEach(() => {
  previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = DATABASE_URL;
  globalThis.__theralysPool = undefined;
  globalThis.__theralysExtraPools = undefined;
});

afterEach(() => {
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
  globalThis.__theralysPool = undefined;
  globalThis.__theralysExtraPools = undefined;
  setApiUsageSink(null);
});

describe("pool de connexions partagé", () => {
  it("un seul pool pour le processus : chaque appel le retrouve", () => {
    const first = poolOf(getDb());
    expect(first).toBeInstanceOf(Pool);
    expect(globalThis.__theralysPool).toBe(first);
    expect(poolOf(getDb())).toBe(first);
    expect(globalThis.__theralysExtraPools).toBeUndefined();
  });

  it("une transaction réserve une connexion : begin, requêtes et commit y passent tous, puis elle est rendue", async () => {
    const db = getDb();
    const probe = reserveFrom(poolOf(db));
    await db.transaction(async (tx) => {
      await tx.execute(sql`select 1`);
    });
    expect(probe.reserved()).toBe(1);
    expect(probe.direct()).toBe(0);
    expect(probe.connection.statements).toEqual(["begin", "select 1", "commit"]);
    expect(probe.connection.released()).toBe(1);
  });
});

describe("deux exemplaires du pilote dans le même processus (build Next : pages et routes d'API)", () => {
  /** Pool créé par l'autre exemplaire : même forme, autre classe. */
  class ForeignPool {
    on() {
      return this;
    }
  }

  it("le pool de l'autre exemplaire n'est pas réutilisé : celui-ci ouvre le sien, et le retrouve ensuite", () => {
    const foreign = new ForeignPool();
    globalThis.__theralysPool = foreign as unknown as Pool;
    const own = poolOf(getDb());
    expect(own).toBeInstanceOf(Pool);
    expect(own).not.toBe(foreign);
    // Le premier pool reste celui de l'exemplaire qui l'a créé
    expect(globalThis.__theralysPool).toBe(foreign);
    expect(poolOf(getDb())).toBe(own);
    expect(globalThis.__theralysExtraPools).toEqual([own]);
  });

  it("…et une transaction y réserve bien sa connexion (avec le pool de l'autre, chaque instruction partait sur une connexion quelconque)", async () => {
    globalThis.__theralysPool = new ForeignPool() as unknown as Pool;
    const db = getDb();
    const probe = reserveFrom(poolOf(db));
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select pg_try_advisory_xact_lock(1)`);
        throw new Error("abandon");
      }),
    ).rejects.toThrow("abandon");
    expect(probe.reserved()).toBe(1);
    expect(probe.direct()).toBe(0);
    expect(probe.connection.statements).toEqual(["begin", "select pg_try_advisory_xact_lock(1)", "rollback"]);
    expect(probe.connection.released()).toBe(1);
  });
});
