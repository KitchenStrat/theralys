import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Db from "@theralys/db";
import type * as Jobs from "@theralys/jobs";
import type { SetupAccess, SetupSignals, SetupTask } from "@/lib/accueil";

/**
 * Accueil du studio (lib/accueil.ts) : faits de la mise en route lus sur
 * l'état réel du compte, étapes qui en découlent et choix de la « prochaine
 * étape ». Sans base : `getDb` est remplacé par un faux qui enregistre les
 * lectures et rend les lignes voulues.
 */

type FindFirst = (query: { where: SQL; columns?: Record<string, boolean> }) => Promise<Record<string, unknown> | undefined>;

const pagesWhere = vi.fn<(where: SQL) => void>();
const pagesRows = vi.fn<() => Promise<{ id: string }[]>>();
const findProspect = vi.fn<FindFirst>();
const findBlogSettings = vi.fn<FindFirst>();
const findSocialSettings = vi.fn<FindFirst>();
const realProvider = vi.fn<() => boolean>();
/** Toute écriture tentée par la lecture ferait échouer le test */
const write = vi.fn(() => {
  throw new Error("la mise en route ne doit rien écrire");
});

vi.mock("@theralys/db", async (importOriginal) => ({
  ...(await importOriginal<typeof Db>()),
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: (where: SQL) => {
          pagesWhere(where);
          return { limit: () => pagesRows() };
        },
      }),
    }),
    query: {
      prospects: { findFirst: findProspect },
      blogSettings: { findFirst: findBlogSettings },
      socialSettings: { findFirst: findSocialSettings },
    },
    insert: write,
    update: write,
    delete: write,
    execute: write,
  }),
}));

vi.mock("@theralys/jobs", async (importOriginal) => ({
  ...(await importOriginal<typeof Jobs>()),
  hasRealGoogleProvider: () => realProvider(),
}));

const { SETUP_KEYS, deriveSetupTasks, pickNextStep, readSetupSignals, remainingSetupTasks } = await import("@/lib/accueil");

const SITE = "b6bed027-6656-4734-926f-501605751fdc";
const PROSPECT = "0d0f6f0a-7d0e-4a7b-9a51-1f3f0c2f6c11";
const dialect = new PgDialect();
const HOSTED: SetupAccess = { reference: "hosted", google: true, blog: true, social: true };
const EXTERNAL: SetupAccess = { ...HOSTED, reference: "external" };
const site = (over: Partial<{ prospectId: string | null; bookingUrl: string | null }> = {}) => ({
  id: SITE,
  prospectId: PROSPECT,
  bookingUrl: "https://www.doctolib.fr/sophrologue/albi/claire-dupont",
  ...over,
});
const prospect = (googlePlaceId: string | null) => ({
  googlePlaceId,
  googleBusinessName: "Claire Dupont Sophrologie",
  firstName: "Claire",
  lastName: "Dupont",
  googleAddress: "12 rue des Lilas, 81000 Albi",
  googleRating: 4.9,
  googleReviewCount: 34,
});

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const mock of [pagesWhere, pagesRows, findProspect, findBlogSettings, findSocialSettings, realProvider, write]) mock.mockClear();
  // Compte « tout juste livré » : rien n'a encore été fait
  pagesRows.mockResolvedValue([]);
  findProspect.mockResolvedValue(prospect(null));
  findBlogSettings.mockResolvedValue({ themes: null });
  findSocialSettings.mockResolvedValue(undefined);
  realProvider.mockReturnValue(false);
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  errors.mockRestore();
});

describe("readSetupSignals : les faits de la mise en route, lus en base", () => {
  it("compte tout juste livré : rien n'est fait, sauf le lien de rendez-vous déjà posé à la création", async () => {
    expect(await readSetupSignals(site(), HOSTED, null)).toEqual({
      pagesEdited: false,
      bookingLink: true,
      measureSeen: null,
      googleLinked: false,
      blogConfigured: false,
      socialConfigured: false,
    });
  });

  it("chaque lecture porte sur le site de la session, et rien n'est écrit", async () => {
    await readSetupSignals(site(), HOSTED, null);
    const pages = dialect.sqlToQuery(pagesWhere.mock.calls[0]![0]);
    expect(pages.params).toContain(SITE);
    // Une page enregistrée depuis l'éditeur : date de modification postérieure à la création, à deux secondes près
    expect(pages.sql).toMatch(/"updated_at" > .*"created_at" \+ interval '2 seconds'/);
    expect(dialect.sqlToQuery(findProspect.mock.calls[0]![0].where).params).toEqual([PROSPECT]);
    expect(dialect.sqlToQuery(findBlogSettings.mock.calls[0]![0].where).params).toEqual([SITE]);
    expect(dialect.sqlToQuery(findSocialSettings.mock.calls[0]![0].where).params).toEqual([SITE]);
    // Colonnes strictement nécessaires : ni voix, ni consignes
    expect(findBlogSettings.mock.calls[0]![0].columns).toEqual({ themes: true });
    expect(findSocialSettings.mock.calls[0]![0].columns).toEqual({ id: true });
    expect(write).not.toHaveBeenCalled();
  });

  it("une page enregistrée depuis l'éditeur : le site a été relu", async () => {
    pagesRows.mockResolvedValueOnce([{ id: "p1" }]);
    expect((await readSetupSignals(site(), HOSTED, null)).pagesEdited).toBe(true);
  });

  it("lien de rendez-vous : absent, vide ou fait d'espaces, il reste à ajouter", async () => {
    for (const bookingUrl of [null, "", "   "]) expect((await readSetupSignals(site({ bookingUrl }), HOSTED, null)).bookingLink).toBe(false);
    expect((await readSetupSignals(site({ bookingUrl: "tel:+33563000000" }), HOSTED, null)).bookingLink).toBe(true);
  });

  it("fiche Google : reliée dès que le prospect porte l'identifiant d'une fiche", async () => {
    findProspect.mockResolvedValueOnce(prospect("ChIJN1t_tDeuEmsRUsoyG83frY4"));
    expect((await readSetupSignals(site(), HOSTED, null)).googleLinked).toBe(true);
  });

  it("fiche Google : un identifiant factice ne compte plus dès qu'un fournisseur réel est configuré (même règle que la section)", async () => {
    findProspect.mockResolvedValue(prospect("mock-claire-dupont"));
    expect((await readSetupSignals(site(), HOSTED, null)).googleLinked).toBe(true);
    realProvider.mockReturnValue(true);
    expect((await readSetupSignals(site(), HOSTED, null)).googleLinked).toBe(false);
  });

  it("fiche Google : site sans prospect, ou prospect introuvable — pas reliée, sans erreur", async () => {
    expect((await readSetupSignals(site({ prospectId: null }), HOSTED, null)).googleLinked).toBe(false);
    expect(findProspect).not.toHaveBeenCalled();
    findProspect.mockResolvedValueOnce(undefined);
    expect((await readSetupSignals(site(), HOSTED, null)).googleLinked).toBe(false);
  });

  it("blog : les réglages par défaut posés à la création n'ont pas de thématiques ; l'assistant enregistré, si (même vides)", async () => {
    findBlogSettings.mockResolvedValueOnce(undefined);
    expect((await readSetupSignals(site(), HOSTED, null)).blogConfigured).toBe(false);
    findBlogSettings.mockResolvedValueOnce({ themes: [] });
    expect((await readSetupSignals(site(), HOSTED, null)).blogConfigured).toBe(true);
    findBlogSettings.mockResolvedValueOnce({ themes: [{ label: "Sommeil", perMonth: 4 }] });
    expect((await readSetupSignals(site(), HOSTED, null)).blogConfigured).toBe(true);
  });

  it("réseaux sociaux : réglés dès que le paramétrage a été enregistré", async () => {
    findSocialSettings.mockResolvedValueOnce({ id: "s1" });
    expect((await readSetupSignals(site(), HOSTED, null)).socialConfigured).toBe(true);
  });

  it("formule sans la section : son fait n'est pas lu", async () => {
    const signals = await readSetupSignals(site(), { reference: "hosted", google: false, blog: false, social: false }, null);
    expect(signals).toMatchObject({ googleLinked: null, blogConfigured: null, socialConfigured: null });
    expect(findProspect).not.toHaveBeenCalled();
    expect(findBlogSettings).not.toHaveBeenCalled();
    expect(findSocialSettings).not.toHaveBeenCalled();
  });

  it("site du praticien en référence : les pages du site Harmony ne sont pas lues, la mesure vient de l'état déjà chargé", async () => {
    expect(await readSetupSignals(site(), EXTERNAL, false)).toMatchObject({ pagesEdited: null, measureSeen: false });
    expect((await readSetupSignals(site(), EXTERNAL, true)).measureSeen).toBe(true);
    expect((await readSetupSignals(site(), EXTERNAL, null)).measureSeen).toBeNull();
    expect(pagesWhere).not.toHaveBeenCalled();
    // Site Harmony en référence : la mesure du site du praticien ne s'applique pas, quoi qu'on passe
    expect((await readSetupSignals(site(), HOSTED, true)).measureSeen).toBeNull();
  });

  it("une lecture qui échoue (table absente d'une base pas encore migrée) n'emporte ni l'accueil ni les autres faits", async () => {
    findSocialSettings.mockRejectedValueOnce(Object.assign(new Error('relation "social_settings" does not exist — site b6bed027'), { code: "42P01" }));
    pagesRows.mockResolvedValueOnce([{ id: "p1" }]);
    const signals = await readSetupSignals(site(), HOSTED, null);
    expect(signals).toMatchObject({ pagesEdited: true, googleLinked: false, blogConfigured: false, socialConfigured: null });
    // Journalisé une fois, par le nom de l'erreur et son code : jamais le message (il peut citer une donnée)
    expect(errors).toHaveBeenCalledTimes(1);
    const logged = errors.mock.calls[0]!.join(" ");
    expect(logged).toContain("réseaux sociaux");
    expect(logged).toContain("42P01");
    expect(logged).not.toContain("b6bed027");
  });
});

describe("deriveSetupTasks : les étapes proposées, dans l'ordre où les mener", () => {
  const nothing: SetupSignals = { pagesEdited: false, bookingLink: false, measureSeen: null, googleLinked: false, blogConfigured: false, socialConfigured: false };
  const keys = (tasks: SetupTask[]) => tasks.map((task) => task.key);

  it("ne connaît que des étapes dont un fait de la base dit l'achèvement", () => {
    expect([...SETUP_KEYS]).toEqual(["verify_pages", "booking_link", "install_measure", "link_google", "blog_settings", "social_settings"]);
  });

  it("site Harmony, formule complète : le site d'abord, puis la fiche Google, le blog et les réseaux", () => {
    const tasks = deriveSetupTasks(nothing, HOSTED);
    expect(keys(tasks)).toEqual(["verify_pages", "booking_link", "link_google", "blog_settings", "social_settings"]);
    expect(tasks.every((task) => !task.done)).toBe(true);
    expect(remainingSetupTasks(tasks)).toBe(5);
  });

  it("chaque étape suit son fait, et seulement le sien", () => {
    const tasks = deriveSetupTasks({ ...nothing, bookingLink: true, googleLinked: true }, HOSTED);
    expect(tasks).toEqual([
      { key: "verify_pages", done: false },
      { key: "booking_link", done: true },
      { key: "link_google", done: true },
      { key: "blog_settings", done: false },
      { key: "social_settings", done: false },
    ]);
    expect(remainingSetupTasks(tasks)).toBe(3);
  });

  it("tout est fait : plus rien à faire (l'accueil n'affiche alors pas la mise en route)", () => {
    const tasks = deriveSetupTasks({ pagesEdited: true, bookingLink: true, measureSeen: null, googleLinked: true, blogConfigured: true, socialConfigured: true }, HOSTED);
    expect(tasks).toHaveLength(5);
    expect(remainingSetupTasks(tasks)).toBe(0);
  });

  it("site du praticien en référence : le code de mesure remplace les étapes de l'éditeur du site Harmony", () => {
    const tasks = deriveSetupTasks({ ...nothing, pagesEdited: null, bookingLink: true, measureSeen: false }, EXTERNAL);
    expect(keys(tasks)).toEqual(["install_measure", "link_google", "blog_settings", "social_settings"]);
    expect(deriveSetupTasks({ ...nothing, measureSeen: true }, EXTERNAL)[0]).toEqual({ key: "install_measure", done: true });
  });

  it("formule sans Fiche Google, sans blog ou sans réseaux sociaux : l'étape n'est pas proposée", () => {
    expect(keys(deriveSetupTasks(nothing, { ...HOSTED, google: false }))).toEqual(["verify_pages", "booking_link", "blog_settings", "social_settings"]);
    expect(keys(deriveSetupTasks(nothing, { ...HOSTED, blog: false }))).toEqual(["verify_pages", "booking_link", "link_google", "social_settings"]);
    expect(keys(deriveSetupTasks(nothing, { ...HOSTED, social: false }))).toEqual(["verify_pages", "booking_link", "link_google", "blog_settings"]);
  });

  it("un fait illisible retire son étape : jamais affichée à tort comme faite ou à faire", () => {
    const tasks = deriveSetupTasks({ ...nothing, pagesEdited: null, socialConfigured: null }, HOSTED);
    expect(keys(tasks)).toEqual(["booking_link", "link_google", "blog_settings"]);
    // Site du praticien dont l'état n'a pas pu être lu : pas d'étape de mesure
    expect(keys(deriveSetupTasks({ ...nothing, measureSeen: null }, EXTERNAL))).toEqual(["link_google", "blog_settings", "social_settings"]);
  });

  it("un fait lu pour une section fermée par la formule ne fait pas apparaître son étape", () => {
    expect(keys(deriveSetupTasks({ ...nothing, googleLinked: true }, { reference: "hosted", google: false, blog: false, social: false }))).toEqual(["verify_pages", "booking_link"]);
  });
});

describe("pickNextStep : une seule prochaine étape, d'après l'état du compte", () => {
  const draft = { kind: "article", articleId: "a1", title: "Sommeil léger", date: "2026-11-13", status: "draft", readingTimeMin: 4 } as const;
  const scheduled = { kind: "article", articleId: "a2", title: "Nuque bloquée", date: "2026-11-16", status: "scheduled", readingTimeMin: 3 } as const;
  const planned = { kind: "planned", title: "Jambes lourdes", date: "2026-11-12", status: "planned" } as const;
  const todo: SetupTask[] = [
    { key: "verify_pages", done: true },
    { key: "booking_link", done: false },
    { key: "blog_settings", done: false },
  ];

  it("code de mesure à installer : avant tout le reste", () => {
    expect(pickNextStep({ awaitingMeasure: { address: "www.cabinet-exemple.fr" }, setup: todo, upcoming: [draft] })).toEqual({ kind: "measure", address: "www.cabinet-exemple.fr" });
  });

  it("mise en route : la première étape non faite, dans l'ordre reçu", () => {
    expect(pickNextStep({ awaitingMeasure: null, setup: todo, upcoming: [draft] })).toEqual({ kind: "setup", key: "booking_link" });
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
    expect(pickNextStep({ awaitingMeasure: null, setup: [{ key: "link_google", done: true }], upcoming: [] })).toBeNull();
  });
});
