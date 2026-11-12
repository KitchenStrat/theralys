import { createHash } from "node:crypto";
import type * as Database from "@theralys/db";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/track/route";

/**
 * `/api/track` (mesure du site hébergé) : la reconnaissance des robots et
 * l'identifiant anonyme ont été déplacés dans `lib/visitor.ts` pour être
 * partagés avec `/api/m`. Ces tests figent le comportement de la route tel
 * qu'il était avant ce déplacement — réponses, ligne inscrite, identifiant —
 * avec une base simulée (aucune connexion).
 */

const SITE_ID = "b6bed027-6656-4734-926f-501605751fdc";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const db = vi.hoisted(() => ({
  site: null as { id: string; domain: string | null } | null,
  rows: [] as Record<string, unknown>[],
  lookups: 0,
  /** Colonnes que la base simulée n'a pas encore reçues (migration non appliquée) */
  missingColumns: [] as string[],
  /** Valeur de `type` que l'enum de la base simulée ne connaît pas encore */
  unknownType: null as string | null,
  /** Requêtes SQL explicites reçues par `execute` : texte et paramètres */
  statements: [] as { text: string; params: unknown[] }[],
  /** Panne sans rapport avec une migration, levée par l'INSERT de drizzle (`insert`) ou par le SQL explicite (`execute`) */
  failure: null as { on: "insert" | "execute"; error: Error } | null,
}));

/** Erreur du pilote Postgres, enveloppée par drizzle comme en production (`cause`). */
const pgError = (code: string, message: string) => Object.assign(new Error("Failed query"), { cause: Object.assign(new Error(message), { code }) });

vi.mock("@theralys/db", async (importOriginal) => ({
  ...(await importOriginal<typeof Database>()),
  getDb: () => ({
    query: {
      sites: {
        findFirst: async () => {
          db.lookups += 1;
          return db.site ?? undefined;
        },
      },
    },
    // Comme drizzle : l'INSERT nomme toutes les colonnes du schéma, `source` et `origin` comprises
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        if (db.failure?.on === "insert") throw db.failure.error;
        const missing = ["origin", "source"].find((column) => db.missingColumns.includes(column));
        if (missing) throw pgError("42703", `column "${missing}" of relation "analytics_events" does not exist`);
        if (row.type === db.unknownType) throw pgError("22P02", `invalid input value for enum analytics_event_type: "${String(row.type)}"`);
        db.rows.push(row);
      },
    }),
    execute: async (statement: SQL) => {
      if (db.failure?.on === "execute") throw db.failure.error;
      const { sql: text, params } = new PgDialect().sqlToQuery(statement);
      const columns = /\(([^)]*)\) values/.exec(text)?.[1]?.split(", ") ?? [];
      const missing = columns.find((column) => db.missingColumns.includes(column));
      if (missing) throw pgError("42703", `column "${missing}" of relation "analytics_events" does not exist`);
      if (params[columns.indexOf("type")] === db.unknownType) throw pgError("22P02", "invalid input value for enum analytics_event_type");
      db.statements.push({ text, params });
    },
  }),
}));

/** Identifiant anonyme tel que la route le calculait avant le déplacement : sha256(sel:jour:IP:navigateur:site). */
const anonymous = (salt: string, ip: string, userAgent: string) =>
  `anon-${createHash("sha256").update(`${salt}:2026-11-12:${ip}:${userAgent}:${SITE_ID}`).digest("hex").slice(0, 32)}`;

const track = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest("https://demo.harmony-web.fr/api/track", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json", "user-agent": CHROME, ...headers },
    }),
  );

beforeEach(() => {
  db.site = { id: SITE_ID, domain: null };
  db.rows = [];
  db.lookups = 0;
  db.missingColumns = [];
  db.unknownType = null;
  db.statements = [];
  db.failure = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));
  vi.stubEnv("AUTH_SECRET", "secret-de-test");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/track — comportement inchangé", () => {
  it("visiteur sans consentement : ligne inscrite avec l'identifiant anonyme du jour, aucun cookie posé", async () => {
    const response = await track(
      { siteId: SITE_ID, type: "pageview", path: "/claire/motifs/stress", referrer: "https://www.google.fr/" },
      { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(db.rows).toEqual([
      {
        siteId: SITE_ID,
        type: "pageview",
        visitorId: anonymous("secret-de-test", "203.0.113.7", CHROME),
        path: "/claire/motifs/stress",
        source: "google",
      },
    ]);
  });

  it("identifiant anonyme : x-real-ip à défaut de x-forwarded-for, 0.0.0.0 sans adresse, sel par défaut sans AUTH_SECRET", async () => {
    await track({ siteId: SITE_ID, type: "rdv_click", path: "/" }, { "x-real-ip": "198.51.100.5" });
    await track({ siteId: SITE_ID, type: "call_click", path: "/" });
    vi.stubEnv("AUTH_SECRET", undefined);
    await track({ siteId: SITE_ID, type: "pageview", path: "/" }, { "x-forwarded-for": "203.0.113.7" });
    expect(db.rows.map((row) => row.visitorId)).toEqual([
      anonymous("secret-de-test", "198.51.100.5", CHROME),
      anonymous("secret-de-test", "0.0.0.0", CHROME),
      anonymous("harmony-analytics", "203.0.113.7", CHROME),
    ]);
  });

  it("robot : ignoré avant toute lecture en base", async () => {
    for (const userAgent of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/131.0.0.0", "vercel-screenshot/1.0"]) {
      const response = await track({ siteId: SITE_ID, type: "pageview", path: "/" }, { "user-agent": userAgent });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, ignored: "bot" });
    }
    expect(db.lookups).toBe(0);
    expect(db.rows).toEqual([]);
  });

  it("charge invalide : 400 ; site inconnu : 404", async () => {
    const invalid = await track("pas du json");
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "Payload invalide" });
    expect((await track({ siteId: "pas-un-uuid", type: "pageview" })).status).toBe(400);

    db.site = null;
    const unknown = await track({ siteId: SITE_ID, type: "pageview", path: "/" });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "Site inconnu" });
    expect(db.rows).toEqual([]);
  });

  it("consentement accordé : identifiant durable par cookie, jamais l'identifiant anonyme", async () => {
    const first = await track({ siteId: SITE_ID, type: "pageview", path: "/" }, { cookie: "tl_consent=granted" });
    const created = String(db.rows[0]?.visitorId);
    expect(created).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(first.headers.get("set-cookie")).toContain(`tl_vid=${created}`);

    const next = await track({ siteId: SITE_ID, type: "pageview", path: "/" }, { cookie: `tl_consent=granted; tl_vid=${created}` });
    expect(db.rows[1]?.visitorId).toBe(created);
    expect(next.headers.get("set-cookie")).toBeNull();

    // Refus : pas de cookie, identifiant anonyme
    const denied = await track({ siteId: SITE_ID, type: "pageview", path: "/" }, { cookie: "tl_consent=denied", "x-forwarded-for": "203.0.113.7" });
    expect(db.rows[2]?.visitorId).toBe(anonymous("secret-de-test", "203.0.113.7", CHROME));
    expect(denied.headers.get("set-cookie")).toBeNull();
  });
});

describe("POST /api/track — déployé avant une migration", () => {
  const visit = { siteId: SITE_ID, type: "pageview", path: "/claire", referrer: "https://www.google.fr/" };
  const headers = { "x-forwarded-for": "203.0.113.7" };
  const visitor = anonymous("secret-de-test", "203.0.113.7", CHROME);

  it("migration 0009 non appliquée (colonne `origin` absente) : la visite est inscrite avec sa provenance", async () => {
    db.missingColumns = ["origin"];
    const response = await track(visit, headers);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(db.rows).toEqual([]);
    expect(db.statements).toEqual([
      {
        text: "insert into analytics_events (site_id, type, visitor_id, path, source) values ($1, $2, $3, $4, $5)",
        params: [SITE_ID, "pageview", visitor, "/claire", "google"],
      },
    ]);
  });

  it("avant 0009, une annonce garde sa provenance : c'est elle qui alimente les résultats Google Ads et Meta Ads", async () => {
    db.missingColumns = ["origin"];
    await track({ siteId: SITE_ID, type: "pageview", path: "/claire", src: "ads" }, headers);
    await track({ siteId: SITE_ID, type: "rdv_click", path: "/claire", src: "meta" }, headers);
    await track({ siteId: SITE_ID, type: "pageview", path: "/claire/tarifs" }, headers);
    expect(db.statements.map((statement) => statement.params.slice(1))).toEqual([
      ["pageview", visitor, "/claire", "google_ads"],
      ["rdv_click", visitor, "/claire", "meta_ads"],
      // Navigation interne : pas de provenance, et la colonne reçoit bien NULL
      ["pageview", visitor, "/claire/tarifs", null],
    ]);
  });

  it("migration 0004 non appliquée (colonne `source` absente) : la visite compte quand même, sans provenance", async () => {
    db.missingColumns = ["origin", "source"];
    const response = await track(visit, headers);
    expect(await response.json()).toEqual({ ok: true });
    expect(db.statements).toEqual([
      { text: "insert into analytics_events (site_id, type, visitor_id, path) values ($1, $2, $3, $4)", params: [SITE_ID, "pageview", visitor, "/claire"] },
    ]);
  });

  it("migration 0005 non appliquée (`call_click` inconnu de l'enum) : clic ignoré sans erreur, avec ou sans 0009", async () => {
    db.unknownType = "call_click";
    for (const missingColumns of [[], ["origin"]]) {
      db.missingColumns = missingColumns;
      const response = await track({ siteId: SITE_ID, type: "call_click", path: "/claire" }, headers);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, ignored: "schema" });
    }
    expect(db.rows).toEqual([]);
    expect(db.statements).toEqual([]);
  });

  it("toute autre panne de la base remonte : elle n'est jamais prise pour une migration manquante", async () => {
    const timeout = pgError("57014", "canceling statement due to statement timeout");
    db.failure = { on: "insert", error: timeout };
    await expect(track(visit, headers)).rejects.toBe(timeout);
    // Aucune seconde tentative en SQL explicite
    expect(db.statements).toEqual([]);

    db.missingColumns = ["origin"];
    db.failure = { on: "execute", error: timeout };
    await expect(track(visit, headers)).rejects.toBe(timeout);
    expect(db.rows).toEqual([]);
  });
});
