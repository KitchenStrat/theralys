import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Db from "@theralys/db";

/**
 * Accueil du studio (lib/accueil.ts) : lecture des étapes de mise en route et
 * choix de la « prochaine étape ». Sans base : `getDb` est remplacé par un
 * faux qui enregistre la requête et rend les lignes voulues.
 */

type Query = { where: SQL; orderBy: SQL[]; columns: Record<string, boolean> };

const findMany = vi.fn<(query: Query) => Promise<{ key: string; done: boolean }[]>>();

vi.mock("@theralys/db", async (importOriginal) => ({
  ...(await importOriginal<typeof Db>()),
  getDb: () => ({ query: { onboardingTasks: { findMany } } }),
}));

const { SETUP_KEYS, availableSetupTasks, getSetupTasks, pickNextStep, remainingSetupTasks, toSetupTasks } = await import("@/lib/accueil");

const SITE = "b6bed027-6656-4734-926f-501605751fdc";
const dialect = new PgDialect();
const ALL = { google: true, blog: true, editor: true };

beforeEach(() => {
  findMany.mockReset();
});

describe("getSetupTasks : lecture des étapes de mise en route", () => {
  it("lit les tâches du site, dans l'ordre de leur position, sans rien écrire", async () => {
    findMany.mockResolvedValueOnce([
      { key: "connect_google", done: true },
      { key: "publish_site", done: false },
    ]);
    const tasks = await getSetupTasks(SITE);
    expect(findMany).toHaveBeenCalledTimes(1);
    const query = findMany.mock.calls[0]![0];
    const where = dialect.sqlToQuery(query.where);
    expect(where.sql).toBe('"onboarding_tasks"."site_id" = $1');
    expect(where.params).toEqual([SITE]);
    expect(query.orderBy.map((order) => dialect.sqlToQuery(order).sql)).toEqual(['"onboarding_tasks"."position" asc']);
    expect(Object.keys(query.columns).sort()).toEqual(["done", "key"]);
    expect(tasks).toEqual([
      { key: "connect_google", done: true },
      { key: "publish_site", done: false },
    ]);
  });

  it("site sans aucune tâche (tous les sites hors démonstration) : liste vide", async () => {
    findMany.mockResolvedValueOnce([]);
    expect(await getSetupTasks(SITE)).toEqual([]);
  });

  it("données de démonstration : la visite guidée, que rien ne termine, n'est pas présentée", async () => {
    findMany.mockResolvedValueOnce([
      { key: "guided_tour", done: false },
      { key: "connect_google", done: true },
      { key: "verify_pages", done: true },
      { key: "publish_site", done: true },
      { key: "activate_blog", done: true },
    ]);
    const tasks = await getSetupTasks(SITE);
    expect(tasks.map((task) => task.key)).toEqual(["connect_google", "verify_pages", "publish_site", "activate_blog"]);
    expect(remainingSetupTasks(tasks)).toBe(0);
  });
});

describe("toSetupTasks", () => {
  it("garde l'ordre reçu, écarte les clés inconnues et les doublons", () => {
    expect(
      toSetupTasks([
        { key: "activate_blog", done: false },
        { key: "inconnue", done: false },
        { key: "connect_google", done: true },
        { key: "activate_blog", done: true },
      ]),
    ).toEqual([
      { key: "activate_blog", done: false },
      { key: "connect_google", done: true },
    ]);
  });

  it("ne connaît que les étapes qu'une action du studio termine", () => {
    expect([...SETUP_KEYS]).toEqual(["connect_google", "verify_pages", "publish_site", "activate_blog"]);
  });
});

describe("availableSetupTasks : étapes que le compte peut mener à bien", () => {
  const tasks = toSetupTasks([
    { key: "connect_google", done: false },
    { key: "verify_pages", done: true },
    { key: "publish_site", done: false },
    { key: "activate_blog", done: false },
  ]);

  it("tout est ouvert : toutes les étapes", () => {
    expect(availableSetupTasks(tasks, ALL)).toEqual(tasks);
  });

  it("formule sans Fiche Google : pas de connexion du compte Google", () => {
    expect(availableSetupTasks(tasks, { ...ALL, google: false }).map((task) => task.key)).toEqual(["verify_pages", "publish_site", "activate_blog"]);
  });

  it("formule sans blog : pas d'activation du blog", () => {
    expect(availableSetupTasks(tasks, { ...ALL, blog: false }).map((task) => task.key)).toEqual(["connect_google", "verify_pages", "publish_site"]);
  });

  it("site du praticien en référence : les étapes de l'éditeur du site Harmony ne sont plus proposées, faites ou non", () => {
    expect(availableSetupTasks(tasks, { ...ALL, editor: false }).map((task) => task.key)).toEqual(["connect_google", "activate_blog"]);
  });

  it("compte le reste à faire", () => {
    expect(remainingSetupTasks(tasks)).toBe(3);
    expect(remainingSetupTasks(availableSetupTasks(tasks, { google: false, blog: false, editor: true }))).toBe(1);
    expect(remainingSetupTasks([])).toBe(0);
  });
});

describe("pickNextStep : une seule prochaine étape, d'après l'état du compte", () => {
  const draft = { kind: "article", articleId: "a1", title: "Sommeil léger", date: "2026-11-13", status: "draft", readingTimeMin: 4 } as const;
  const scheduled = { kind: "article", articleId: "a2", title: "Nuque bloquée", date: "2026-11-16", status: "scheduled", readingTimeMin: 3 } as const;
  const planned = { kind: "planned", title: "Jambes lourdes", date: "2026-11-12", status: "planned" } as const;
  const todo = toSetupTasks([
    { key: "connect_google", done: true },
    { key: "publish_site", done: false },
    { key: "activate_blog", done: false },
  ]);

  it("code de mesure à installer : avant tout le reste", () => {
    expect(pickNextStep({ awaitingMeasure: { address: "www.cabinet-exemple.fr" }, setup: todo, upcoming: [draft] })).toEqual({ kind: "measure", address: "www.cabinet-exemple.fr" });
  });

  it("mise en route : la première étape non faite, dans l'ordre reçu", () => {
    expect(pickNextStep({ awaitingMeasure: null, setup: todo, upcoming: [draft] })).toEqual({ kind: "setup", key: "publish_site" });
  });

  it("mise en route terminée : le premier article déjà écrit, même après un sujet seulement planifié", () => {
    const done = todo.map((task) => ({ ...task, done: true }));
    expect(pickNextStep({ awaitingMeasure: null, setup: done, upcoming: [planned, draft, scheduled] })).toEqual({
      kind: "review",
      articleId: "a1",
      title: "Sommeil léger",
      date: "2026-11-13",
      status: "draft",
      readingTimeMin: 4,
    });
    expect(pickNextStep({ awaitingMeasure: null, setup: [], upcoming: [scheduled] })).toMatchObject({ kind: "review", articleId: "a2", status: "scheduled" });
  });

  it("aucun article écrit : le prochain sujet planifié, pour information", () => {
    expect(pickNextStep({ awaitingMeasure: null, setup: [], upcoming: [planned] })).toEqual({ kind: "upcoming", title: "Jambes lourdes", date: "2026-11-12" });
  });

  it("un article publié ou retiré n'est ni à relire ni à venir", () => {
    const published = { ...draft, status: "published" } as const;
    const withdrawn = { ...scheduled, status: "withdrawn" } as const;
    expect(pickNextStep({ awaitingMeasure: null, setup: [], upcoming: [published, withdrawn] })).toBeNull();
  });

  it("rien de tout cela : pas de carte", () => {
    expect(pickNextStep({ awaitingMeasure: null, setup: [], upcoming: [] })).toBeNull();
    expect(pickNextStep({ awaitingMeasure: null, setup: toSetupTasks([{ key: "connect_google", done: true }]), upcoming: [] })).toBeNull();
  });
});
