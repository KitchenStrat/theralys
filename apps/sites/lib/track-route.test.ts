import { createHash } from "node:crypto";
import type * as Database from "@theralys/db";
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
}));

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
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        db.rows.push(row);
      },
    }),
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
