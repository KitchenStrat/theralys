import { randomBytes } from "node:crypto";
import type * as Database from "@theralys/db";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FOREIGN_DUPLICATE_MESSAGE } from "@/lib/crm/access";
import { passwordFingerprint } from "@/lib/password-fingerprint";
import { createRep, reassignRepContacts, renewRepInvitation, setRepDisabled } from "../equipe/actions";
import { addTask, bulkUpdate, completeTask, deleteActivity, deleteContact, deleteImport, finishImport, importRows, logActivity, purgeFromTrash, restoreFromTrash, saveContact, setStage, startImport } from "./actions";

/**
 * Appels directs des actions serveur, sans passer par l'écran : ce qu'un
 * commercial obtiendrait en les invoquant lui-même, avec sa session.
 *
 * Aucune connexion : la base est simulée au niveau du pilote Postgres. Le
 * vrai code tourne de bout en bout (lecture du jeton, relecture du compte,
 * requêtes drizzle) ; le pilote factice reçoit le SQL tel qu'il partirait,
 * et y répond d'après quelques fiches en mémoire EN APPLIQUANT les
 * conditions du SQL (identifiant, propriétaire, corbeille). Une action qui
 * oublierait de borner sa requête au propriétaire verrait donc la fiche
 * d'un autre, et ces tests échoueraient. Une condition que le simulateur ne
 * connaît pas le fait échouer bruyamment plutôt que de passer pour vraie.
 */

const ADMIN = "7b6e92c0-a7d3-4f96-9230-c5ad737bd0dc";
const JULIE = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const MARC = "11111111-2222-4333-8444-555555555555";
const MINE = "aaaaaaaa-0000-4000-8000-000000000001";
const THEIRS = "bbbbbbbb-0000-4000-8000-000000000002";
const NOBODY = "cccccccc-0000-4000-8000-000000000003";
const MINE_TRASHED = "dddddddd-0000-4000-8000-000000000004";
const TASK_THEIRS = "eeeeeeee-0000-4000-8000-000000000005";
const NOTE_THEIRS = "eeeeeeee-0000-4000-8000-000000000006";
const NOTE_ADMIN_ON_MINE = "eeeeeeee-0000-4000-8000-000000000007";
const NOTE_MINE = "eeeeeeee-0000-4000-8000-000000000008";
const TASK_ADMIN_ON_MINE = "eeeeeeee-0000-4000-8000-000000000009";
const JULIE_HASH = "scrypt:00aa:11bb";

type Contact = { id: string; owner_id: string | null; stage: string; first_name: string; last_name: string; company: string; profession: string; city: string; email: string | null; phone: string | null; tags: string[]; extra: Record<string, string> };
type Activity = { id: string; contact_id: string; kind: string; author_id: string | null };
type Rep = { name: string; role: string; password_hash: string; disabled_at: Date | null };
type Statement = { text: string; params: unknown[]; table: string; verb: "select" | "insert" | "update" | "delete" | "other"; touched: string[]; inserted: Record<string, unknown>[] };

const sim = vi.hoisted(() => {
  class Redirect extends Error {
    constructor(public to: string) {
      super(`redirection vers ${to}`);
    }
  }
  const world = {
    cookie: null as string | null,
    statements: [] as Statement[],
    reps: new Map<string, Rep>(),
    /** Comptes administrateurs en base : la session d'un admin est relue à chaque requête */
    admins: new Map<string, { name: string; role: string; password_hash: string }>(),
    contacts: new Map<string, Contact>(),
    activities: new Map<string, Activity>(),
    created: 0,
  };
  const param = (params: unknown[], index: string) => params[Number(index) - 1];
  const paramList = (params: unknown[], list: string) => [...list.matchAll(/\$(\d+)/g)].map((match) => param(params, match[1]!));

  /** Fiches qui répondent aux conditions du SQL ; toute condition inconnue sur `crm_contacts` lève une erreur. */
  function matchContacts(where: string, params: unknown[]): Contact[] {
    let rows = [...world.contacts.values()];
    let rest = where;
    const take = (pattern: RegExp, filter: (match: RegExpExecArray, row: Contact) => boolean) => {
      for (let match = pattern.exec(rest); match; match = pattern.exec(rest)) {
        const found = match;
        rows = rows.filter((row) => filter(found, row));
        rest = rest.replace(found[0], "");
      }
    };
    take(/"crm_contacts"\."id" = \$(\d+)/, (match, row) => row.id === param(params, match[1]!));
    take(/"crm_contacts"\."id" in \(([^()]*)\)/, (match, row) => paramList(params, match[1]!).includes(row.id));
    take(/"crm_contacts"\."owner_id" = \$(\d+)/, (match, row) => row.owner_id === param(params, match[1]!));
    take(/"crm_contacts"\."owner_id" is distinct from \$(\d+)/, (match, row) => row.owner_id !== param(params, match[1]!));
    take(/"crm_contacts"\."owner_id" is not null/, (_match, row) => row.owner_id !== null);
    take(/"crm_contacts"\."stage" not like \$(\d+)/, (_match, row) => !row.stage.startsWith("trash:"));
    take(/"crm_contacts"\."stage" like \$(\d+)/, (_match, row) => row.stage.startsWith("trash:"));
    take(/"crm_contacts"\."email" in \(([^()]*)\)/, (match, row) => paramList(params, match[1]!).includes(row.email));
    if (!/^(?:[\s()]|and|or)*$/.test(rest.replace(/ limit \$\d+$/, ""))) throw new Error(`Condition non simulée sur crm_contacts : ${rest}`);
    return rows;
  }

  /** Lignes d'historique qui répondent aux conditions du SQL (dont « sa fiche est visible », en sous-requête). */
  function matchActivities(where: string, params: unknown[]): Activity[] {
    let rows = [...world.activities.values()];
    let rest = where;
    const take = (pattern: RegExp, filter: (match: RegExpExecArray, row: Activity) => boolean) => {
      const match = pattern.exec(rest);
      if (!match) return;
      rows = rows.filter((row) => filter(match, row));
      rest = rest.replace(match[0], "");
    };
    // « Sa fiche est visible » : la sous-requête sur crm_contacts est évaluée comme les autres lectures de fiches
    const sub = /"crm_activities"\."contact_id" in \(select "id" from "crm_contacts" where (\([^()]*\))\)/.exec(rest);
    if (sub) {
      const visible = new Set(matchContacts(sub[1]!, params).map((row) => row.id));
      rows = rows.filter((row) => visible.has(row.contact_id));
      rest = rest.replace(sub[0], "");
    }
    take(/"crm_activities"\."id" = \$(\d+)/, (match, row) => row.id === param(params, match[1]!));
    take(/"crm_activities"\."kind" = \$(\d+)/, (match, row) => row.kind === param(params, match[1]!));
    take(/"crm_activities"\."kind" in \(([^()]*)\)/, (match, row) => paramList(params, match[1]!).includes(row.kind));
    take(/"crm_activities"\."author_id" = \$(\d+)/, (match, row) => row.author_id === param(params, match[1]!));
    if (!/^(?:[\s()]|and)*$/.test(rest)) throw new Error(`Condition non simulée sur crm_activities : ${rest}`);
    return rows;
  }

  const columnsOf = (list: string) => list.split(",").map((column) => column.trim().replace(/^"[a-z_]+"\./, "").replace(/"/g, ""));
  const project = (rows: Record<string, unknown>[], columns: string[]) => rows.map((row) => columns.map((column) => (column in row ? row[column] : null)));

  /** Valeurs d'un INSERT, colonne par colonne (`default` : absente). */
  function insertedRows(text: string, params: unknown[]): Record<string, unknown>[] {
    const head = /^insert into "[a-z_]+" \(([^)]*)\) values (.*?)(?: returning .*)?$/.exec(text);
    if (!head) return [];
    const columns = columnsOf(head[1]!);
    return [...head[2]!.matchAll(/\(([^()]*)\)/g)].map((tuple) => {
      const values = tuple[1]!.split(",").map((value) => value.trim());
      return Object.fromEntries(columns.flatMap((column, index) => (values[index]?.startsWith("$") ? [[column, param(params, values[index]!.slice(1))]] : [])));
    });
  }

  function respond(text: string, params: unknown[]): unknown[][] {
    const statement: Statement = { text, params, table: "", verb: "other", touched: [], inserted: [] };
    world.statements.push(statement);
    if (/^(begin|commit|rollback)/.test(text)) return [];
    const returning = / returning (.*)$/.exec(text);

    // Compte d'un commercial (session relue, commercial attribuable)
    if (/^select .* from "users" inner join "crm_reps"/.test(text)) {
      statement.verb = "select";
      statement.table = "users";
      const [, list, where] = /^select (.*?) from "users" inner join "crm_reps" on .*? where (.*)$/.exec(text)!;
      const id = /"users"\."id" = \$(\d+)/.exec(where!);
      const role = /"users"\."role" = \$(\d+)/.exec(where!);
      const rows = [...world.reps.entries()]
        .filter(([repId, rep]) => (!id || repId === param(params, id[1]!)) && (!role || rep.role === param(params, role[1]!)))
        .filter(([, rep]) => !where!.includes('"crm_reps"."disabled_at" is null') || rep.disabled_at === null)
        .filter(([, rep]) => !where!.includes("not like 'invite:%'") || !rep.password_hash.startsWith("invite:"))
        .map(([repId, rep]) => ({ id: repId, ...rep }));
      return project(rows, columnsOf(list!));
    }

    // Compte d'un administrateur (session relue en base : le compte existe-t-il toujours, est-il toujours admin ?)
    const account = /^select (.*?) from "users" where "users"\."id" = \$(\d+) limit \$\d+$/.exec(text);
    if (account) {
      statement.verb = "select";
      statement.table = "users";
      const id = String(param(params, account[2]!));
      const admin = world.admins.get(id);
      return project(admin ? [{ id, ...admin }] : [], columnsOf(account[1]!));
    }

    const select = /^select (.*?) from "(crm_contacts|crm_activities|crm_imports|users)"(?: where (.*?))?(?: order by .*?)?(?: limit \$\d+)?$/.exec(text);
    if (select) {
      statement.verb = "select";
      statement.table = select[2]!;
      if (select[2] === "crm_contacts") {
        const rows = matchContacts(select[3] ?? "", params);
        statement.touched = rows.map((row) => row.id);
        return project(rows, columnsOf(select[1]!));
      }
      // Prochaine tâche d'une fiche, liste importée, e-mail déjà pris : rien en mémoire
      return [];
    }

    const update = /^update "(crm_contacts|crm_activities|crm_reps|crm_imports|users)" set (.*?) where (.*?)(?: returning .*)?$/.exec(text);
    const remove = /^delete from "(crm_contacts|crm_activities|crm_imports)" where (.*?)(?: returning .*)?$/.exec(text);
    if (update || remove) {
      statement.verb = update ? "update" : "delete";
      statement.table = (update ?? remove)![1]!;
      const where = update ? update[3]! : remove![2]!;
      const rows: Record<string, unknown>[] = statement.table === "crm_contacts" ? matchContacts(where, params) : statement.table === "crm_activities" ? matchActivities(where, params) : [];
      statement.touched = rows.map((row) => String(row.id));
      return returning ? project(rows, columnsOf(returning[1]!)) : [];
    }

    if (text.startsWith("insert into")) {
      statement.verb = "insert";
      statement.table = /^insert into "([a-z_]+)"/.exec(text)![1]!;
      statement.inserted = insertedRows(text, params);
      const id = `99999999-0000-4000-8000-${String(++world.created).padStart(12, "0")}`;
      return returning ? project([{ id }], columnsOf(returning[1]!)) : [];
    }
    throw new Error(`Requête non simulée : ${text}`);
  }

  const client = { query: async (config: { text: string }, params: unknown[] = []) => ({ rows: respond(config.text, params), rowCount: 0, fields: [] }) };
  return { world, client, Redirect };
});

vi.mock("@theralys/db", async (importOriginal) => {
  const original = await importOriginal<typeof Database>();
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const db = drizzle(sim.client as never, { schema: original });
  return { ...original, getDb: () => db };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (sim.world.cookie && name === "tl_admin_session" ? { value: sim.world.cookie } : undefined), set: () => {}, delete: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new sim.Redirect(to);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { world } = sim;
const secret = randomBytes(32).toString("hex");
process.env.AUTH_SECRET = secret;

async function signIn(userId: string | null, role: string, passwordHash?: string) {
  if (!userId) {
    world.cookie = null;
    return;
  }
  world.cookie = await new SignJWT({ role, name: "Essai", ...(passwordHash ? { pv: passwordFingerprint(passwordHash) } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}
const asJulie = () => signIn(JULIE, "sales", JULIE_HASH);
const asAdmin = () => signIn(ADMIN, "admin");

const contact = (id: string, owner_id: string | null, stage = "new", extra: Partial<Contact> = {}): Contact => ({ id, owner_id, stage, first_name: "Prénom", last_name: "Nom", company: "", profession: "", city: "", email: null, phone: null, tags: [], extra: {}, ...extra });

beforeEach(() => {
  world.cookie = null;
  world.statements = [];
  world.created = 0;
  world.admins = new Map([[ADMIN, { name: "Admin", role: "admin", password_hash: "scrypt:aa00:bb11" }]]);
  world.reps = new Map([
    [JULIE, { name: "Julie Martin", role: "sales", password_hash: JULIE_HASH, disabled_at: null }],
    [MARC, { name: "Marc Petit", role: "sales", password_hash: "scrypt:22cc:33dd", disabled_at: null }],
  ]);
  world.contacts = new Map(
    [contact(MINE, JULIE, "new", { first_name: "Claire", last_name: "Dupont", email: "claire@exemple.test" }), contact(THEIRS, MARC, "new", { first_name: "Paul", last_name: "Secret", email: "paul@exemple.test" }), contact(NOBODY, null, "new", { first_name: "Léa", last_name: "Libre", email: "lea@exemple.test" }), contact(MINE_TRASHED, JULIE, "trash:new")].map((row) => [row.id, row]),
  );
  world.activities = new Map(
    [
      { id: TASK_THEIRS, contact_id: THEIRS, kind: "task", author_id: MARC },
      { id: NOTE_THEIRS, contact_id: THEIRS, kind: "note", author_id: MARC },
      { id: NOTE_ADMIN_ON_MINE, contact_id: MINE, kind: "note", author_id: ADMIN },
      { id: TASK_ADMIN_ON_MINE, contact_id: MINE, kind: "task", author_id: ADMIN },
      { id: NOTE_MINE, contact_id: MINE, kind: "note", author_id: JULIE },
    ].map((row) => [row.id, row]),
  );
});

/** Écritures qui ont réellement touché ou créé quelque chose. */
const writes = () => world.statements.filter((statement) => statement.verb !== "select" && statement.verb !== "other" && (statement.touched.length > 0 || statement.inserted.length > 0));
const touchedContacts = () => new Set(world.statements.filter((statement) => statement.table === "crm_contacts" && statement.verb !== "select").flatMap((statement) => statement.touched));
const redirected = async (call: Promise<unknown>) => {
  try {
    await call;
  } catch (error) {
    if (error instanceof sim.Redirect) return error.to;
    throw error;
  }
  return null;
};
const GONE = { ok: false, error: "Cette fiche n'existe plus." };
const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

describe("sans session, ou avec une session qui n'ouvre plus rien", () => {
  const everyAction = (): [string, () => Promise<unknown>][] => [
    ["saveContact", () => saveContact({ firstName: "X", lastName: "Y" })],
    ["setStage", () => setStage({ id: MINE, stage: "won" })],
    ["bulkUpdate", () => bulkUpdate({ ids: [MINE], action: "dnc" })],
    ["logActivity", () => logActivity({ contactId: MINE, kind: "call", body: "x" })],
    ["addTask", () => addTask({ contactId: MINE, body: "x", dueAt: tomorrow })],
    ["completeTask", () => completeTask({ id: TASK_ADMIN_ON_MINE, done: true })],
    ["deleteActivity", () => deleteActivity(NOTE_MINE)],
    ["deleteContact", () => deleteContact(MINE)],
    ["restoreFromTrash", () => restoreFromTrash({ ids: [MINE_TRASHED] })],
    ["purgeFromTrash", () => purgeFromTrash({})],
    ["startImport", () => startImport({ filename: "x.csv", format: "csv", totalRows: 1 })],
    ["importRows", () => importRows({ importId: MINE, rows: [{ firstName: "X" }], duplicates: "create" })],
    ["finishImport", () => finishImport(MINE)],
    ["deleteImport", () => deleteImport({ importId: MINE, withContacts: true })],
    ["createRep", () => createRep({ name: "Pirate", email: "pirate@exemple.test" })],
    ["renewRepInvitation", () => renewRepInvitation({ id: JULIE })],
    ["setRepDisabled", () => setRepDisabled({ id: JULIE, disabled: false })],
    ["reassignRepContacts", () => reassignRepContacts({ fromId: MARC, toId: JULIE })],
  ];
  const ADMIN_ONLY = ["deleteContact", "restoreFromTrash", "purgeFromTrash", "startImport", "importRows", "finishImport", "deleteImport", "createRep", "renewRepInvitation", "setRepDisabled", "reassignRepContacts"];

  it("aucune session : chaque action renvoie à la connexion, sans une seule requête", async () => {
    for (const [name, call] of everyAction()) {
      expect(await redirected(call()), name).toBe("/login");
    }
    expect(world.statements).toEqual([]);
  });

  it("jeton d'un autre rôle (client du studio) ou mal signé : connexion, sans une seule requête", async () => {
    await signIn(JULIE, "client");
    for (const [name, call] of everyAction()) expect(await redirected(call()), name).toBe("/login");
    world.cookie = `${world.cookie}x`;
    for (const [name, call] of everyAction()) expect(await redirected(call()), name).toBe("/login");
    expect(world.statements).toEqual([]);
  });

  it.each([
    ["désactivé par l'admin", (rep: Rep) => void (rep.disabled_at = new Date())],
    ["qui n'est plus commercial", (rep: Rep) => void (rep.role = "client")],
    ["dont le mot de passe a été réinitialisé (nouveau lien d'invitation)", (rep: Rep) => void (rep.password_hash = "invite:0123456789abcdef0123456789abcdef")],
    ["dont le mot de passe a changé depuis l'ouverture de la session", (rep: Rep) => void (rep.password_hash = "scrypt:ffff:eeee")],
  ])("commercial %s : son jeton encore valable n'ouvre plus rien, la session est fermée", async (_label, change) => {
    await asJulie();
    change(world.reps.get(JULIE)!);
    for (const [name, call] of everyAction()) {
      // Les actions de l'admin le renvoient vers le CRM, dont la page le déconnecte ; les siennes le déconnectent aussitôt
      expect(await redirected(call()), name).toBe(ADMIN_ONLY.includes(name) ? "/crm" : "/deconnexion");
    }
    expect(writes()).toEqual([]);
    expect(world.statements.every((statement) => statement.table === "users")).toBe(true);
  });

  it.each([
    ["dont le compte n'existe plus", () => void world.admins.delete(ADMIN), undefined],
    ["qui n'est plus administrateur", () => void (world.admins.get(ADMIN)!.role = "client"), undefined],
    ["dont le mot de passe a changé depuis l'ouverture de la session", () => void (world.admins.get(ADMIN)!.password_hash = "scrypt:ffff:eeee"), "scrypt:aa00:bb11"],
  ])("jeton d'admin %s : il n'ouvre plus rien, aucune écriture", async (_label, change, sessionHash) => {
    await signIn(ADMIN, "admin", sessionHash);
    change();
    for (const [name, call] of everyAction()) expect(await redirected(call()), name).toBe("/deconnexion");
    expect(writes()).toEqual([]);
    expect(world.statements.every((statement) => statement.table === "users")).toBe(true);
  });

  it("jeton d'admin forgé pour un identifiant quelconque (secret de signature compromis) : refusé sans lecture hasardeuse", async () => {
    await signIn("x", "admin");
    expect(await redirected(deleteContact(MINE))).toBe("/deconnexion");
    await signIn("99999999-9999-4999-8999-999999999999", "admin");
    expect(await redirected(deleteContact(MINE))).toBe("/deconnexion");
    expect(writes()).toEqual([]);
  });

  it("session d'admin ouverte avant l'empreinte du mot de passe (jeton sans `pv`) : acceptée jusqu'à son terme", async () => {
    await signIn(ADMIN, "admin");
    expect(await deleteContact(MINE)).toMatchObject({ ok: true });
  });

  it("compte supprimé : même refus", async () => {
    await asJulie();
    world.reps.delete(JULIE);
    expect(await redirected(setStage({ id: MINE, stage: "won" }))).toBe("/deconnexion");
    expect(writes()).toEqual([]);
  });

  it("l'état du compte est relu en base à chaque action", async () => {
    await asJulie();
    await setStage({ id: MINE, stage: "contacted" });
    await logActivity({ contactId: MINE, kind: "note", body: "x" });
    expect(world.statements.filter((statement) => statement.table === "users" && statement.params[0] === JULIE)).toHaveLength(2);
  });
});

describe("un commercial et la fiche d'un autre", () => {
  beforeEach(asJulie);

  it.each([
    ["attribuée à un autre commercial", THEIRS],
    ["attribuée à personne", NOBODY],
    ["à lui, mais à la corbeille", MINE_TRASHED],
    ["qui n'existe pas", "12345678-0000-4000-8000-000000000000"],
  ])("fiche %s : changer l'étape, modifier, consigner, planifier → « n'existe plus », rien n'est écrit", async (_label, id) => {
    expect(await setStage({ id, stage: "won" })).toEqual(GONE);
    expect(await saveContact({ id, firstName: "Piratée", lastName: "X" })).toEqual(GONE);
    expect(await logActivity({ contactId: id, kind: "call", body: "appel fantôme" })).toEqual(GONE);
    expect(await addTask({ contactId: id, body: "tâche fantôme", dueAt: tomorrow })).toEqual(GONE);
    expect(writes()).toEqual([]);
    expect(world.statements.some((statement) => statement.verb === "insert")).toBe(false);
  });

  it("la réponse ne dit rien de la fiche d'autrui : ni son nom, ni si elle existe", async () => {
    const foreign = await setStage({ id: THEIRS, stage: "won" });
    const missing = await setStage({ id: "12345678-0000-4000-8000-000000000000", stage: "won" });
    expect(foreign).toEqual(missing);
    expect(JSON.stringify(foreign)).not.toMatch(/Paul|Secret/);
  });

  it("tâche ou note d'une fiche d'un autre : ni cochée ni retirée", async () => {
    expect(await completeTask({ id: TASK_THEIRS, done: true })).toEqual({ ok: false, error: "Cette tâche n'existe plus." });
    expect(await deleteActivity(TASK_THEIRS)).toEqual({ ok: false, error: "Cet élément n'existe plus." });
    expect(await deleteActivity(NOTE_THEIRS)).toEqual({ ok: false, error: "Cet élément n'existe plus." });
    expect(writes()).toEqual([]);
  });

  it("sur sa propre fiche, il ne retire que ce qu'il a inscrit lui-même", async () => {
    expect(await deleteActivity(NOTE_ADMIN_ON_MINE)).toEqual({ ok: false, error: "Cet élément n'existe plus." });
    expect(writes()).toEqual([]);
    expect(await deleteActivity(NOTE_MINE)).toEqual({ ok: true });
    expect(writes().filter((statement) => statement.verb === "delete").map((statement) => statement.touched)).toEqual([[NOTE_MINE]]);
    // Une tâche posée par l'admin sur sa fiche : il peut la terminer, pas la supprimer
    expect(await deleteActivity(TASK_ADMIN_ON_MINE)).toEqual({ ok: false, error: "Cet élément n'existe plus." });
    expect(await completeTask({ id: TASK_ADMIN_ON_MINE, done: true })).toEqual({ ok: true });
  });

  it("actions groupées sur des identifiants d'autrui : zéro fiche touchée", async () => {
    for (const input of [
      { ids: [THEIRS, NOBODY, MINE_TRASHED], action: "stage", value: "lost" },
      { ids: [THEIRS, NOBODY, MINE_TRASHED], action: "dnc" },
      { ids: [THEIRS, NOBODY, MINE_TRASHED], action: "allow" },
      { ids: [THEIRS, NOBODY, MINE_TRASHED], action: "tag", value: "piraté" },
      { ids: [THEIRS, NOBODY, MINE_TRASHED], action: "untag", value: "piraté" },
    ]) {
      expect(await bulkUpdate(input), input.action).toEqual({ ok: true, count: 0 });
    }
    expect(writes()).toEqual([]);
  });

  it("actions groupées sur un mélange : seules ses fiches sont touchées", async () => {
    expect(await bulkUpdate({ ids: [MINE, THEIRS, NOBODY, MINE_TRASHED], action: "dnc" })).toEqual({ ok: true, count: 1 });
    expect(await bulkUpdate({ ids: [MINE, THEIRS, NOBODY, MINE_TRASHED], action: "stage", value: "meeting" })).toEqual({ ok: true, count: 1 });
    expect(await bulkUpdate({ ids: [MINE, THEIRS, NOBODY, MINE_TRASHED], action: "tag", value: "salon" })).toEqual({ ok: true, count: 1 });
    expect([...touchedContacts()]).toEqual([MINE]);
  });

  it("« tous les prospects de cette recherche » : la recherche est bornée à ses fiches, quel que soit le filtre demandé", async () => {
    for (const query of ["", `commercial=${MARC}`, "commercial=none"]) {
      expect(await bulkUpdate({ query, action: "dnc" }), query).toEqual({ ok: true, count: 1 });
    }
    expect([...touchedContacts()]).toEqual([MINE]);
  });

  it("toute requête faite en son nom sur les fiches porte son identifiant de propriétaire — sauf la recherche de doublons, sur tout le CRM", async () => {
    await setStage({ id: THEIRS, stage: "won" });
    await setStage({ id: MINE, stage: "contacted" });
    await saveContact({ id: MINE, firstName: "Claire", lastName: "Dupont-Durand" });
    await logActivity({ contactId: MINE, kind: "call", body: "rappel" });
    await addTask({ contactId: MINE, body: "relancer", dueAt: tomorrow });
    await completeTask({ id: TASK_ADMIN_ON_MINE, done: true });
    await bulkUpdate({ ids: [MINE, THEIRS], action: "tag", value: "salon" });
    await bulkUpdate({ query: "vue=liste", action: "dnc" });
    await saveContact({ firstName: "Nouveau", lastName: "Prospect", email: "nouveau@exemple.test" });
    const onContacts = world.statements.filter((statement) => statement.table === "crm_contacts" && statement.verb !== "insert");
    const bounded = onContacts.filter((statement) => /"crm_contacts"\."owner_id" = \$\d+/.test(statement.text) && statement.params.includes(JULIE));
    const unbounded = onContacts.filter((statement) => !bounded.includes(statement));
    expect(onContacts.length).toBeGreaterThan(12);
    // Les seules requêtes sans borne : la recherche de doublons (lecture seule) et la recopie de la prochaine tâche sur une fiche déjà vérifiée
    expect(unbounded.map((statement) => statement.text.slice(0, 60))).toEqual([expect.stringMatching(/^update "crm_contacts" set "next_action_at"/), expect.stringMatching(/^update "crm_contacts" set "next_action_at"/), expect.stringMatching(/^select "id", "first_name"/)]);
    for (const statement of unbounded.slice(0, 2)) expect(statement.touched).toEqual([MINE]);
    expect(world.statements.every((statement) => !statement.params.includes(MARC))).toBe(true);
  });
});

describe("ce qui est réservé à l'admin", () => {
  beforeEach(asJulie);

  it("suppression, corbeille, import, listes : un commercial est renvoyé vers le CRM, sans une seule requête", async () => {
    const calls: [string, () => Promise<unknown>][] = [
      ["supprimer sa propre fiche", () => deleteContact(MINE)],
      ["supprimer la fiche d'un autre", () => deleteContact(THEIRS)],
      ["restaurer depuis la corbeille", () => restoreFromTrash({ ids: [MINE_TRASHED] })],
      ["effacer de la corbeille", () => purgeFromTrash({ ids: [MINE_TRASHED] })],
      ["vider la corbeille", () => purgeFromTrash({})],
      ["commencer un import", () => startImport({ filename: "liste.csv", format: "csv", totalRows: 2 })],
      ["importer des lignes", () => importRows({ importId: MINE, rows: [{ firstName: "Importé", email: "importe@exemple.test" }], duplicates: "create", ownerId: JULIE })],
      ["terminer un import", () => finishImport(MINE)],
      ["supprimer une liste et ses prospects", () => deleteImport({ importId: MINE, withContacts: true })],
    ];
    for (const [label, call] of calls) expect(await redirected(call()), label).toBe("/crm");
    expect(world.statements).toEqual([]);
  });

  it("suppression et attribution groupées : refusées, même sur ses propres fiches", async () => {
    const refused = { ok: false, error: "Cette action est réservée à l'administrateur." };
    expect(await bulkUpdate({ ids: [MINE], action: "delete" })).toEqual(refused);
    expect(await bulkUpdate({ query: "", action: "delete" })).toEqual(refused);
    expect(await bulkUpdate({ ids: [MINE], action: "assign", value: "none" })).toEqual(refused);
    expect(await bulkUpdate({ ids: [THEIRS, NOBODY], action: "assign", value: JULIE })).toEqual(refused);
    expect(writes()).toEqual([]);
    expect(world.statements.every((statement) => statement.table === "users")).toBe(true);
  });

  it("comptes de l'équipe : créer, inviter, désactiver, réattribuer — renvoyé vers le CRM, sans une seule requête", async () => {
    expect(await redirected(createRep({ name: "Complice", email: "complice@exemple.test" }))).toBe("/crm");
    expect(await redirected(renewRepInvitation({ id: JULIE }))).toBe("/crm");
    expect(await redirected(renewRepInvitation({ id: MARC }))).toBe("/crm");
    expect(await redirected(setRepDisabled({ id: MARC, disabled: true }))).toBe("/crm");
    expect(await redirected(setRepDisabled({ id: JULIE, disabled: false }))).toBe("/crm");
    expect(await redirected(reassignRepContacts({ fromId: MARC, toId: JULIE }))).toBe("/crm");
    expect(world.statements).toEqual([]);
  });

  it("l'admin, lui, passe : suppression, attribution, corbeille", async () => {
    await asAdmin();
    expect(await deleteContact(THEIRS)).toEqual({ ok: true });
    expect(await bulkUpdate({ ids: [NOBODY, THEIRS], action: "assign", value: JULIE })).toEqual({ ok: true, count: 2 });
    expect(await bulkUpdate({ ids: [MINE], action: "assign", value: "none" })).toEqual({ ok: true, count: 1 });
    expect(await restoreFromTrash({ ids: [MINE_TRASHED] })).toEqual({ ok: true, count: 1 });
    expect([...touchedContacts()].sort()).toEqual([MINE, THEIRS, NOBODY, MINE_TRASHED].sort());
    // Chaque ligne d'historique écrite par ces actions porte l'admin pour auteur
    const history = world.statements.filter((statement) => statement.table === "crm_activities" && statement.verb === "insert").flatMap((statement) => statement.inserted);
    expect(history.length).toBe(5);
    expect(history.every((row) => row.author_id === ADMIN)).toBe(true);
    expect(history.map((row) => row.body)).toEqual(["Mise à la corbeille", "Attribué à Julie Martin", "Attribué à Julie Martin", "Attribution retirée", "Restaurée depuis la corbeille"]);
  });

  it("attribution à un compte qui n'est pas un commercial actif : refusée, même pour l'admin", async () => {
    await asAdmin();
    world.reps.get(MARC)!.disabled_at = new Date();
    const refused = { ok: false, error: "Ce commercial n'existe pas, ou son compte est désactivé." };
    expect(await bulkUpdate({ ids: [NOBODY], action: "assign", value: MARC })).toEqual(refused);
    expect(await bulkUpdate({ ids: [NOBODY], action: "assign", value: ADMIN })).toEqual(refused);
    expect(await bulkUpdate({ ids: [NOBODY], action: "assign", value: "pas-un-identifiant" })).toEqual(refused);
    expect(await saveContact({ firstName: "X", lastName: "Y", ownerId: MARC })).toEqual(refused);
    expect(writes()).toEqual([]);
  });
});

describe("ce qu'un commercial fait sur ses propres fiches", () => {
  beforeEach(asJulie);

  it("la fiche qu'il crée lui appartient, quoi que demande le formulaire", async () => {
    const result = await saveContact({ firstName: "Nouvelle", lastName: "Fiche", email: "nouvelle@exemple.test", ownerId: MARC });
    expect(result).toMatchObject({ ok: true });
    const [inserted] = world.statements.filter((statement) => statement.table === "crm_contacts" && statement.verb === "insert").flatMap((statement) => statement.inserted);
    expect(inserted).toMatchObject({ first_name: "Nouvelle", last_name: "Fiche", email: "nouvelle@exemple.test", owner_id: JULIE });
  });

  it("doublon d'une fiche qui n'est pas à lui : message générique, rien de la fiche, pas de création — même en forçant", async () => {
    for (const email of ["paul@exemple.test", "lea@exemple.test"]) {
      for (const force of [false, true]) {
        const result = await saveContact({ firstName: "Autre", lastName: "Nom", email, force });
        expect(result).toEqual({ ok: false, error: FOREIGN_DUPLICATE_MESSAGE });
        expect(JSON.stringify(result)).not.toMatch(/Paul|Secret|Léa|Libre|bbbbbbbb|cccccccc/);
      }
    }
    expect(world.statements.some((statement) => statement.verb === "insert")).toBe(false);
  });

  it("doublon d'une de ses fiches : signalé par son nom, et il peut créer quand même", async () => {
    expect(await saveContact({ firstName: "Claire", lastName: "Bis", email: "claire@exemple.test" })).toEqual({ ok: false, duplicate: { id: MINE, name: "Claire Dupont" } });
    expect(world.statements.some((statement) => statement.verb === "insert")).toBe(false);
    expect(await saveContact({ firstName: "Claire", lastName: "Bis", email: "claire@exemple.test", force: true })).toMatchObject({ ok: true });
  });

  it("changement d'étape, appel, tâche : écrits sur sa fiche, à son nom", async () => {
    expect(await setStage({ id: MINE, stage: "qualified" })).toEqual({ ok: true });
    expect(await logActivity({ contactId: MINE, kind: "call", body: "Premier appel" })).toEqual({ ok: true });
    expect(await addTask({ contactId: MINE, body: "Rappeler", dueAt: tomorrow })).toEqual({ ok: true });
    expect([...touchedContacts()]).toEqual([MINE]);
    const history = world.statements.filter((statement) => statement.table === "crm_activities" && statement.verb === "insert").flatMap((statement) => statement.inserted);
    // L'appel fait aussi passer la fiche (« à contacter » dans la base simulée) à « contacté » : quatre lignes
    expect(history.map((row) => row.kind)).toEqual(["stage", "call", "stage", "task"]);
    expect(history.every((row) => row.author_id === JULIE && row.contact_id === MINE)).toBe(true);
  });

  it("l'admin écrit aussi à son nom, sur n'importe quelle fiche", async () => {
    await asAdmin();
    expect(await setStage({ id: THEIRS, stage: "meeting" })).toEqual({ ok: true });
    expect(await logActivity({ contactId: NOBODY, kind: "note", body: "Vu au salon" })).toEqual({ ok: true });
    const history = world.statements.filter((statement) => statement.table === "crm_activities" && statement.verb === "insert").flatMap((statement) => statement.inserted);
    expect(history.map((row) => [row.contact_id, row.kind, row.author_id])).toEqual([
      [THEIRS, "stage", ADMIN],
      [NOBODY, "note", ADMIN],
    ]);
    // Aucune borne sur le propriétaire dans les requêtes de l'admin
    expect(world.statements.some((statement) => /"owner_id" = \$/.test(statement.text))).toBe(false);
  });
});
