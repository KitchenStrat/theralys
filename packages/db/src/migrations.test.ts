import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// `pnpm db:migrate` doit passer sur une base vierge, sur une base déjà migrée (no-op)
// et sur une base créée autrefois par `drizzle-kit push` sans journal : le migrateur
// drizzle y rejoue alors TOUTES les migrations depuis 0000. Chaque instruction DDL est
// donc gardée (IF NOT EXISTS / DO $$ … EXCEPTION WHEN duplicate_object) — ce test
// verrouille ces gardes, fichier par fichier, en découpant comme le migrateur.

const here = path.dirname(fileURLToPath(import.meta.url));
const folder = path.resolve(here, "../drizzle");
const BREAKPOINT = "--> statement-breakpoint";

type JournalEntry = { idx: number; when: number; tag: string; breakpoints: boolean };
type Journal = { entries: JournalEntry[] };

const journal = JSON.parse(
  fs.readFileSync(path.join(folder, "meta/_journal.json"), "utf8"),
) as Journal;

/** Découpe une migration comme drizzle-orm (split sur le séparateur), commentaires retirés. */
function statementsOf(tag: string): string[] {
  const sql = fs.readFileSync(path.join(folder, `${tag}.sql`), "utf8");
  return sql.split(BREAKPOINT).map((chunk) =>
    chunk
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .trim(),
  );
}

const DO_GUARD = /^DO \$\$ BEGIN (.+); EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;$/s;

/** Instruction dont le rejeu est sans effet si l'objet existe déjà. */
function isIdempotent(stmt: string): boolean {
  const guarded = DO_GUARD.exec(stmt);
  if (guarded) {
    const inner = guarded[1] ?? "";
    return /^CREATE TYPE "/.test(inner) || /^ALTER TABLE "[^"]+" ADD CONSTRAINT "/.test(inner);
  }
  if (/^CREATE TABLE/.test(stmt)) return /^CREATE TABLE IF NOT EXISTS "/.test(stmt);
  if (/^CREATE (UNIQUE )?INDEX/.test(stmt)) return /^CREATE (UNIQUE )?INDEX IF NOT EXISTS "/.test(stmt);
  if (/^ALTER TABLE "[^"]+" ADD COLUMN/.test(stmt)) return / ADD COLUMN IF NOT EXISTS "/.test(stmt);
  // CREATE TYPE / ADD CONSTRAINT hors bloc DO : non rejouables
  return !/^(CREATE TYPE|ALTER TABLE "[^"]+" ADD CONSTRAINT)/.test(stmt);
}

describe("journal des migrations (packages/db/drizzle/meta/_journal.json)", () => {
  it("référence 0000_soft_scrambler, 0001_social_posts puis 0002_social_settings, fichiers présents", () => {
    expect(journal.entries.map((e) => e.tag)).toEqual([
      "0000_soft_scrambler",
      "0001_social_posts",
      "0002_social_settings",
    ]);
    for (const entry of journal.entries) {
      expect(fs.existsSync(path.join(folder, `${entry.tag}.sql`)), entry.tag).toBe(true);
      expect(entry.breakpoints).toBe(true);
    }
  });

  it("entrées ordonnées : idx consécutifs et `when` strictement croissant (ordre d'application du migrateur)", () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
      if (i > 0) expect(entry.when).toBeGreaterThan(journal.entries[i - 1]!.when);
    });
  });
});

describe.each(journal.entries.map((e) => [e.tag] as const))("migration %s rejouable", (tag) => {
  const statements = statementsOf(tag);

  it("aucun fragment vide entre deux séparateurs (un commentaire contenant le séparateur casserait le découpage)", () => {
    statements.forEach((stmt, i) => {
      expect(stmt.length, `fragment n°${i + 1} vide`).toBeGreaterThan(0);
    });
  });

  it("chaque instruction est gardée (IF NOT EXISTS ou DO $$ … duplicate_object)", () => {
    const offenders = statements.filter((stmt) => !isIdempotent(stmt));
    expect(offenders, offenders.map((s) => s.slice(0, 90)).join("\n")).toEqual([]);
  });
});

describe("0000_soft_scrambler : rien n'a été perdu en rendant le schéma initial rejouable", () => {
  const statements = statementsOf("0000_soft_scrambler");
  const count = (re: RegExp) => statements.filter((s) => re.test(s)).length;

  it("18 enums, 15 tables, 15 clés étrangères, 9 index — dans cet ordre", () => {
    expect(count(/CREATE TYPE "public"\./)).toBe(18);
    expect(count(/^CREATE TABLE IF NOT EXISTS "/)).toBe(15);
    expect(count(/ADD CONSTRAINT "[^"]+" FOREIGN KEY/)).toBe(15);
    expect(count(/^CREATE (UNIQUE )?INDEX IF NOT EXISTS "/)).toBe(9);
    expect(statements).toHaveLength(57);

    const kind = (s: string) =>
      /CREATE TYPE/.test(s) ? 0 : /CREATE TABLE/.test(s) ? 1 : /ADD CONSTRAINT/.test(s) ? 2 : 3;
    const kinds = statements.map(kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => a - b));
  });

  it("le défaut de sites.plan reste 'scale' et les contraintes d'unicité inline sont conservées", () => {
    const sites = statements.find((s) => s.startsWith('CREATE TABLE IF NOT EXISTS "sites"'));
    expect(sites).toContain(`"plan" "plan" DEFAULT 'scale' NOT NULL`);
    expect(sites).toContain('CONSTRAINT "sites_slug_unique" UNIQUE("slug")');
    expect(statements.find((s) => s.startsWith('CREATE TABLE IF NOT EXISTS "users"'))).toContain(
      'CONSTRAINT "users_email_unique" UNIQUE("email")',
    );
  });
});

describe("0001_social_posts : résorbe la dérive et crée social_posts", () => {
  const statements = statementsOf("0001_social_posts");

  it("ajoute les 3 colonnes poussées à la main avec IF NOT EXISTS, puis la table et son index", () => {
    expect(statements.filter((s) => /ADD COLUMN IF NOT EXISTS/.test(s))).toHaveLength(3);
    expect(statements.some((s) => s.startsWith('CREATE TABLE IF NOT EXISTS "social_posts"'))).toBe(true);
    expect(
      statements.some((s) => s.startsWith('CREATE INDEX IF NOT EXISTS "social_posts_site_date_idx"')),
    ).toBe(true);
  });
});

describe("0002_social_settings : crée social_settings (« Paramétrage » des réseaux sociaux)", () => {
  const statements = statementsOf("0002_social_settings");

  it("table, clé étrangère gardée et index unique sur site_id — rien d'autre", () => {
    expect(statements).toHaveLength(3);
    const table = statements.find((s) => s.startsWith('CREATE TABLE IF NOT EXISTS "social_settings"'));
    expect(table).toBeDefined();
    expect(table).toContain(`"post_days" jsonb DEFAULT '[2,5]'::jsonb NOT NULL`);
    expect(table).toContain(`"voice_tone" "voice_tone" DEFAULT 'chaleureux' NOT NULL`);
    expect(table).toContain('"instructions" text,');
    expect(
      statements.some((s) =>
        /^DO \$\$ BEGIN ALTER TABLE "social_settings" ADD CONSTRAINT "social_settings_site_id_sites_id_fk" FOREIGN KEY/.test(s),
      ),
    ).toBe(true);
    expect(
      statements.some((s) =>
        s.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS "social_settings_site_id_idx" ON "social_settings"'),
      ),
    ).toBe(true);
    // Les enums voice_* et gender existent depuis 0000 : aucun CREATE TYPE ici
    expect(statements.some((s) => /CREATE TYPE/.test(s))).toBe(false);
  });
});
