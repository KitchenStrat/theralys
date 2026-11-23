import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { ADMIN_ONLY, BULK_ACTIONS, FOREIGN_DUPLICATE_MESSAGE, bulkActionAllowed, can, duplicateVerdict, ownerOnCreate, type CrmViewer } from "./access";
import { buildWhere } from "./data";
import { EMPTY_FILTERS, UNASSIGNED, parseFilters } from "./filters";
import { contactVisibleTo, visibleTo } from "./scope";

const ADMIN: CrmViewer = { id: "7b6e92c0-a7d3-4f96-9230-c5ad737bd0dc", role: "admin" };
const JULIE: CrmViewer = { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", role: "sales" };
const MARC: CrmViewer = { id: "11111111-2222-4333-8444-555555555555", role: "sales" };
const CONTACT = "b6bed027-6656-4734-926f-501605751fdc";
const now = new Date("2026-11-23T09:00:00Z");

/** La requête telle qu'elle part à Postgres : texte et paramètres. */
const render = (condition: SQL | undefined) => (condition ? new PgDialect().sqlToQuery(condition) : { sql: "", params: [] as unknown[] });
const OWNER = /"crm_contacts"\."owner_id" = \$(\d+)/;

/** Identifiant du propriétaire auquel la requête est bornée ; null si elle ne l'est pas. */
function ownerBound(condition: SQL | undefined): unknown {
  const { sql, params } = render(condition);
  const match = OWNER.exec(sql);
  return match ? params[Number(match[1]) - 1] : null;
}

describe("droits dans le CRM", () => {
  it("tout ce qui est réservé l'est à l'admin : un commercial n'en a aucun", () => {
    expect([...ADMIN_ONLY]).toEqual(["delete", "trash", "import", "export", "lists", "assign", "demo", "team"]);
    for (const capability of ADMIN_ONLY) {
      expect(can("admin", capability), capability).toBe(true);
      expect(can("sales", capability), capability).toBe(false);
    }
  });

  it("actions groupées : étape, étiquettes et opposition pour tous ; suppression et attribution pour l'admin", () => {
    expect(BULK_ACTIONS.filter((action) => bulkActionAllowed("sales", action))).toEqual(["stage", "tag", "untag", "dnc", "allow"]);
    expect(BULK_ACTIONS.filter((action) => bulkActionAllowed("admin", action))).toEqual([...BULK_ACTIONS]);
  });

  it("une fiche créée par un commercial lui appartient, quoi que demande le formulaire", () => {
    expect(ownerOnCreate(JULIE, null)).toBe(JULIE.id);
    expect(ownerOnCreate(JULIE, MARC.id)).toBe(JULIE.id);
    expect(ownerOnCreate(JULIE, undefined)).toBe(JULIE.id);
    // L'admin choisit, ou laisse la fiche non attribuée
    expect(ownerOnCreate(ADMIN, MARC.id)).toBe(MARC.id);
    expect(ownerOnCreate(ADMIN, null)).toBeNull();
    expect(ownerOnCreate(ADMIN, undefined)).toBeNull();
  });
});

describe("doublon à la création", () => {
  type Match = { id: string; ownerId: string | null; name: string };
  const mine: Match = { id: "a", ownerId: JULIE.id, name: "Claire Dupont" };
  const theirs: Match = { id: "b", ownerId: MARC.id, name: "Paul Martin" };
  const nobody: Match = { id: "c", ownerId: null, name: "Léa Roux" };

  it("pas de doublon : la création passe", () => {
    expect(duplicateVerdict(JULIE, [], false)).toEqual({ kind: "none" });
    expect(duplicateVerdict(ADMIN, [], false)).toEqual({ kind: "none" });
  });

  it("commercial, doublon chez un autre ou non attribué : refus sans rien de la fiche, même en forçant", () => {
    for (const matches of [[theirs], [nobody], [mine, theirs], [theirs, mine]]) {
      for (const force of [false, true]) {
        const verdict = duplicateVerdict(JULIE, matches, force);
        expect(verdict).toEqual({ kind: "foreign" });
        expect(JSON.stringify(verdict)).not.toMatch(/Paul|Léa|"b"|"c"/);
      }
    }
    expect(FOREIGN_DUPLICATE_MESSAGE).toBe("Ce prospect est déjà dans le CRM — voyez avec votre responsable.");
  });

  it("commercial, doublon à lui : signalé par son nom, et il peut passer outre", () => {
    expect(duplicateVerdict(JULIE, [mine], false)).toEqual({ kind: "own", match: mine });
    expect(duplicateVerdict(JULIE, [mine], true)).toEqual({ kind: "none" });
  });

  it("admin : tout doublon lui est montré, et il peut passer outre", () => {
    expect(duplicateVerdict(ADMIN, [theirs, mine], false)).toEqual({ kind: "own", match: theirs });
    expect(duplicateVerdict(ADMIN, [nobody], false)).toEqual({ kind: "own", match: nobody });
    expect(duplicateVerdict(ADMIN, [theirs], true)).toEqual({ kind: "none" });
  });
});

describe("portée des requêtes selon le rôle", () => {
  it("admin : aucune borne sur le propriétaire", () => {
    expect(visibleTo(ADMIN)).toBeUndefined();
    expect(ownerBound(contactVisibleTo(ADMIN, CONTACT))).toBeNull();
    expect(render(contactVisibleTo(ADMIN, CONTACT))).toMatchObject({ sql: '"crm_contacts"."id" = $1', params: [CONTACT] });
    expect(ownerBound(buildWhere(ADMIN, EMPTY_FILTERS, now))).toBeNull();
  });

  it("commercial : toute lecture est bornée à ses fiches, hors corbeille", () => {
    const { sql, params } = render(visibleTo(JULIE));
    expect(sql).toBe('("crm_contacts"."owner_id" = $1 and "crm_contacts"."stage" not like $2)');
    expect(params).toEqual([JULIE.id, "trash:%"]);
    expect(ownerBound(visibleTo(MARC))).toBe(MARC.id);
  });

  it("commercial : une fiche se désigne par son identifiant ET son propriétaire", () => {
    const { sql, params } = render(contactVisibleTo(JULIE, CONTACT));
    expect(sql).toBe('("crm_contacts"."id" = $1 and ("crm_contacts"."owner_id" = $2 and "crm_contacts"."stage" not like $3))');
    expect(params).toEqual([CONTACT, JULIE.id, "trash:%"]);
  });

  it("liste, pipeline, compteurs : quels que soient les filtres, la borne du commercial y est", () => {
    const everyFilter = parseFilters({ vue: "liste", q: "dupont albi 0612", etape: "new,won", source: "landing", metier: "Sophrologue", ville: "Albi", dept: "81", tag: "salon", liste: CONTACT, joindre: "both", action: "overdue", cree: "30", relance: "90", formule: "none", opposition: "hide" });
    for (const filters of [EMPTY_FILTERS, everyFilter, { ...EMPTY_FILTERS, action: "none" as const }]) {
      for (const options of [{}, { ignoreStages: true }]) {
        expect(ownerBound(buildWhere(JULIE, filters, now, options))).toBe(JULIE.id);
        expect(ownerBound(buildWhere(MARC, filters, now, options))).toBe(MARC.id);
        expect(ownerBound(buildWhere(ADMIN, filters, now, options))).toBeNull();
      }
    }
  });

  it("le filtre « Commercial » de l'adresse ne déplace pas la borne d'un commercial", () => {
    for (const owner of [MARC.id, UNASSIGNED, ADMIN.id]) {
      const { sql, params } = render(buildWhere(JULIE, { ...EMPTY_FILTERS, owner }, now));
      // Une seule condition sur le propriétaire : la sienne
      expect(sql.match(/"owner_id"/g)).toHaveLength(1);
      expect(sql).not.toContain('"owner_id" is null');
      expect(params).toContain(JULIE.id);
      expect(params).not.toContain(MARC.id);
    }
  });

  it("le filtre « Commercial » est celui de l'admin : un compte, ou « non attribué »", () => {
    expect(ownerBound(buildWhere(ADMIN, { ...EMPTY_FILTERS, owner: MARC.id }, now))).toBe(MARC.id);
    const unassigned = render(buildWhere(ADMIN, { ...EMPTY_FILTERS, owner: UNASSIGNED }, now));
    expect(unassigned.sql).toContain('"crm_contacts"."owner_id" is null');
    expect(unassigned.sql).not.toMatch(OWNER);
  });

  it("personne ne lit la corbeille par la liste", () => {
    for (const viewer of [ADMIN, JULIE]) {
      const { sql, params } = render(buildWhere(viewer, EMPTY_FILTERS, now));
      expect(sql).toContain('"crm_contacts"."stage" not like');
      expect(params).toContain("trash:%");
    }
  });
});
