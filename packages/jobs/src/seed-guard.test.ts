import { describe, expect, it } from "vitest";
import {
  databaseHost,
  hasPublicDefaultPassword,
  hashPassword,
  isLocalDatabaseUrl,
  passwordMatches,
  SeedGuardError,
  seedPassword,
} from "./seed-guard";

const LOCAL = "postgresql://postgres:postgres@localhost:5432/theralys";
const NEON = "postgresql://neondb_owner:npg_abc@ep-cool-sea-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require";

describe("isLocalDatabaseUrl", () => {
  it("localhost, boucle locale, *.local et nom de service docker : locales", () => {
    expect(isLocalDatabaseUrl(LOCAL)).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://u:p@127.0.0.1:5432/db")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://u:p@[::1]:5432/db")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://u:p@pg.local/db")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://u:p@db:5432/theralys")).toBe(true);
  });

  it("Neon, pooler, hôte quelconque avec domaine, URL absente ou vide : non locales", () => {
    expect(isLocalDatabaseUrl(NEON)).toBe(false);
    expect(isLocalDatabaseUrl(NEON.replace("ep-cool-sea-123456", "ep-cool-sea-123456-pooler"))).toBe(false);
    expect(isLocalDatabaseUrl("postgres://u:p@db.example.com/x")).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
    expect(isLocalDatabaseUrl("")).toBe(false);
    expect(isLocalDatabaseUrl("pas une url")).toBe(false);
    // IPv6 littérale autre que ::1 : distante, même sans point
    expect(isLocalDatabaseUrl("postgresql://u:p@[2a05:d014:1234::1]:5432/db")).toBe(false);
  });

  it("mot de passe non encodé (@, /) : l'hôte reste correctement lu", () => {
    expect(databaseHost("postgresql://u:p@ss/w@rd@ep-x-1.neon.tech:5432/db")).toBe("ep-x-1.neon.tech");
    expect(isLocalDatabaseUrl("postgresql://u:p@ss@localhost:5432/db")).toBe(true);
    expect(databaseHost("postgresql://u:p%40ss%2Fw%3Ard@ep-x-1.neon.tech/db?sslmode=require")).toBe("ep-x-1.neon.tech");
  });

  it("URL illisible (« ? » ou « # » bruts dans le mot de passe, forme libpq) : hôte vide ⇒ distante", () => {
    expect(databaseHost("postgresql://u:p?x@ep-x-1.neon.tech:5432/db")).toBe("");
    expect(isLocalDatabaseUrl("postgresql://u:p?x@ep-x-1.neon.tech:5432/db")).toBe(false);
    expect(isLocalDatabaseUrl("postgresql://u:p#x@localhost:5432/db")).toBe(false);
    expect(isLocalDatabaseUrl("host=localhost dbname=theralys")).toBe(false);
    expect(isLocalDatabaseUrl("postgresql://")).toBe(false);
  });
});

describe("seedPassword", () => {
  const base = { name: "SEED_CLIENT_PASSWORD" as const, fallback: "client-demo" };

  it("base locale : valeur fournie, sinon le défaut (défaut explicite accepté)", () => {
    expect(seedPassword({ ...base, value: undefined, databaseUrl: LOCAL })).toBe("client-demo");
    expect(seedPassword({ ...base, value: "  ", databaseUrl: LOCAL })).toBe("client-demo");
    expect(seedPassword({ ...base, value: "client-demo", databaseUrl: LOCAL })).toBe("client-demo");
    expect(seedPassword({ ...base, value: "autre", databaseUrl: LOCAL })).toBe("autre");
  });

  it("base distante : la valeur fournie est acceptée (espaces retirés)", () => {
    expect(seedPassword({ ...base, value: " Tr3s-Secret ", databaseUrl: NEON })).toBe("Tr3s-Secret");
  });

  it("base distante : valeur absente ou égale au défaut → erreur nommant la variable et l'hôte", () => {
    expect(() => seedPassword({ ...base, value: undefined, databaseUrl: NEON })).toThrow(
      /SEED_CLIENT_PASSWORD manquante .*ep-cool-sea-123456\.eu-central-1\.aws\.neon\.tech.*DEPLOY\.md, étape 2\.3/,
    );
    expect(() => seedPassword({ ...base, value: "client-demo", databaseUrl: NEON })).toThrow(
      /SEED_CLIENT_PASSWORD égale à un mot de passe par défaut/,
    );
    expect(() =>
      seedPassword({ name: "SEED_ADMIN_PASSWORD", fallback: "admin-change-me", value: "admin-change-me", databaseUrl: NEON }),
    ).toThrow(/SEED_ADMIN_PASSWORD égale à un mot de passe par défaut/);
    // Défauts croisés : tout mot de passe public est refusé, pas seulement celui de la variable
    expect(() =>
      seedPassword({ name: "SEED_ADMIN_PASSWORD", fallback: "admin-change-me", value: "client-demo", databaseUrl: NEON }),
    ).toThrow(/SEED_ADMIN_PASSWORD égale à un mot de passe par défaut/);
    expect(() => seedPassword({ ...base, value: "admin-change-me", databaseUrl: NEON })).toThrow(/SEED_CLIENT_PASSWORD/);
  });

  it("URL absente : traitée comme distante (jamais de défaut sans savoir où l'on écrit)", () => {
    expect(() => seedPassword({ ...base, value: undefined, databaseUrl: undefined })).toThrow(/cette base distante/);
    expect(() => seedPassword({ ...base, value: undefined, databaseUrl: undefined })).toThrow(SeedGuardError);
  });

  it("valeur venant d'un .env : acceptée en local, ignorée hors base locale (message explicite)", () => {
    expect(seedPassword({ ...base, value: "perso", fromDotenv: true, databaseUrl: LOCAL })).toBe("perso");
    expect(() => seedPassword({ ...base, value: "perso", fromDotenv: true, databaseUrl: NEON })).toThrow(
      /SEED_CLIENT_PASSWORD manquante .*ni une valeur lue dans un fichier \.env/,
    );
    expect(seedPassword({ ...base, value: "perso", fromDotenv: false, databaseUrl: NEON })).toBe("perso");
  });
});

describe("hachage et détection d'un mot de passe par défaut déjà seedé", () => {
  it("hashPassword / passwordMatches : format scrypt:sel:hash, sel aléatoire, comparaison stricte", () => {
    const stored = hashPassword("Tr3s-Secret");
    expect(stored).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(hashPassword("Tr3s-Secret")).not.toBe(stored);
    expect(passwordMatches("Tr3s-Secret", stored)).toBe(true);
    expect(passwordMatches("tr3s-secret", stored)).toBe(false);
    expect(passwordMatches("Tr3s-Secret", "bcrypt:x:y")).toBe(false);
    expect(passwordMatches("Tr3s-Secret", null)).toBe(false);
    expect(passwordMatches("Tr3s-Secret", "scrypt:abcd:zz")).toBe(false);
  });

  it("hasPublicDefaultPassword : vrai pour admin-change-me et client-demo, faux sinon", () => {
    expect(hasPublicDefaultPassword(hashPassword("client-demo"))).toBe(true);
    expect(hasPublicDefaultPassword(hashPassword("admin-change-me"))).toBe(true);
    expect(hasPublicDefaultPassword(hashPassword("Tr3s-Secret"))).toBe(false);
    expect(hasPublicDefaultPassword(undefined)).toBe(false);
  });
});
