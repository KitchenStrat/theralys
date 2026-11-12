import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Db from "@theralys/db";

/**
 * `getDashboardStats` (lib/data.ts) lit les visites du site de référence :
 * celles du site du client (`origin = external`) ou celles du site hébergé
 * (`origin` absent). Ces tests vérifient le filtre demandé à la base et le
 * repli quand la base n'a pas encore reçu la colonne `origin` (migration
 * 0009) ou la colonne `source` (migration 0004) — sans base : `getDb` est
 * remplacé par un faux qui enregistre les requêtes.
 */

type Query = { where: SQL; columns: Record<string, boolean> };

const findMany = vi.fn<(query: Query) => Promise<unknown[]>>();

vi.mock("@theralys/db", async (importOriginal) => ({
  ...(await importOriginal<typeof Db>()),
  getDb: () => ({ query: { analyticsEvents: { findMany } } }),
}));

const { getDashboardStats } = await import("@/lib/data");

const SITE = "b6bed027-6656-4734-926f-501605751fdc";
const dialect = new PgDialect();
/** La condition d'une requête, en SQL : texte et paramètres. */
const whereOf = (call: number) => dialect.sqlToQuery(findMany.mock.calls[call]![0].where);
const columnsOf = (call: number) => Object.keys(findMany.mock.calls[call]![0].columns).sort();

const missingColumn = () => Object.assign(new Error("requête refusée"), { cause: Object.assign(new Error("column does not exist"), { code: "42703" }) });

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const ROWS = [
  { type: "pageview", visitorId: "a", occurredAt: minutesAgo(30), source: "google" },
  { type: "pageview", visitorId: "b", occurredAt: minutesAgo(20), source: "direct" },
  { type: "rdv_click", visitorId: "a", occurredAt: minutesAgo(10), source: null },
  { type: "call_click", visitorId: "b", occurredAt: minutesAgo(5), source: null },
];

beforeEach(() => {
  findMany.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getDashboardStats : site mesuré", () => {
  it("par défaut, les visites du site hébergé : origine absente", async () => {
    findMany.mockResolvedValueOnce(ROWS);
    const stats = await getDashboardStats(SITE, "7j");
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(whereOf(0).sql).toContain('"analytics_events"."origin" is null');
    expect(whereOf(0).params).toContain(SITE);
    expect(columnsOf(0)).toEqual(["occurredAt", "source", "type", "visitorId"]);
    // L'appel téléphonique n'est ni un visiteur ni un clic de rendez-vous
    expect(stats).toMatchObject({ visitors: 2, rdvClicks: 1 });
    expect(stats.sources.total).toBe(2);
  });

  it("site du client en référence : seulement les visites de son code de mesure", async () => {
    findMany.mockResolvedValueOnce(ROWS);
    const stats = await getDashboardStats(SITE, "30j", "external");
    const where = whereOf(0);
    expect(where.sql).toMatch(/"analytics_events"\."origin" = \$\d/);
    expect(where.sql).not.toContain("is null");
    expect(where.params).toContain("external");
    expect(stats.visitors).toBe(2);
  });
});

describe("getDashboardStats : base pas encore migrée", () => {
  it("colonne origin absente, site hébergé : toutes les visites sont les siennes, la provenance reste lue", async () => {
    findMany.mockRejectedValueOnce(missingColumn()).mockResolvedValueOnce(ROWS);
    const stats = await getDashboardStats(SITE, "7j", "hosted");
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(whereOf(1).sql).not.toContain("origin");
    expect(columnsOf(1)).toContain("source");
    expect(stats).toMatchObject({ visitors: 2, rdvClicks: 1 });
    expect(stats.sources.total).toBe(2);
  });

  it("colonne origin absente, site du client : aucune visite n'a pu être mesurée — zéro, sans autre requête", async () => {
    findMany.mockRejectedValueOnce(missingColumn());
    const stats = await getDashboardStats(SITE, "7j", "external");
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(stats).toMatchObject({ visitors: 0, rdvClicks: 0, visitorsChangePct: null });
    expect(stats.sources).toEqual({ total: 0, unit: "views", rows: [] });
    expect(stats.daily.every((day) => day.visitors === 0 && day.rdvClicks === 0)).toBe(true);
  });

  it("colonnes origin et source absentes : l'accueil reste servi, sans provenance", async () => {
    findMany
      .mockRejectedValueOnce(missingColumn())
      .mockRejectedValueOnce(missingColumn())
      .mockResolvedValueOnce(ROWS.map(({ type, visitorId, occurredAt }) => ({ type, visitorId, occurredAt })));
    const stats = await getDashboardStats(SITE, "7j");
    expect(findMany).toHaveBeenCalledTimes(3);
    expect(whereOf(2).sql).not.toContain("origin");
    expect(columnsOf(2)).toEqual(["occurredAt", "type", "visitorId"]);
    expect(stats).toMatchObject({ visitors: 2, rdvClicks: 1 });
    expect(stats.sources.total).toBe(0);
  });

  it("une autre erreur de la base n'est pas avalée", async () => {
    const down = Object.assign(new Error("connexion refusée"), { code: "ECONNREFUSED" });
    findMany.mockRejectedValueOnce(down);
    await expect(getDashboardStats(SITE, "7j")).rejects.toBe(down);
    findMany.mockReset();
    findMany.mockRejectedValueOnce(missingColumn()).mockRejectedValueOnce(down);
    await expect(getDashboardStats(SITE, "7j")).rejects.toBe(down);
  });
});
