/**
 * Garde-fou du seed : les mots de passe par défaut (`.env.example`, lisibles
 * dans ce dépôt public) ne servent que sur une base locale. Sur toute autre
 * base (Neon, préproduction…), chaque mot de passe doit être fourni
 * explicitement et différer du défaut — sinon n'importe qui pourrait se
 * connecter au compte seedé.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Mots de passe de développement de `.env.example` : connus de tous (dépôt public). */
export const PUBLIC_DEFAULT_PASSWORDS = ["admin-change-me", "client-demo"] as const;

/**
 * Hôte d'une URL Postgres. Lecture par expression régulière plutôt que
 * `new URL` : un mot de passe contenant « @ » ou « / » non encodés ferait
 * prendre un morceau du mot de passe pour l'hôte (le dernier « @ » avant le
 * chemin sépare l'authentification de l'hôte).
 */
export function databaseHost(url: string | undefined): string {
  if (!url) return "";
  const match = /^[a-z][a-z0-9+.-]*:\/\/(?:[^?#]*@)?(\[[^\]]*\]|[^/:?#@]+)/i.exec(url.trim());
  return (match?.[1] ?? "").toLowerCase();
}

/**
 * Base locale : localhost, boucle locale, `*.local`, ou nom de service sans
 * domaine (docker). Une IPv6 littérale n'est locale que si c'est `::1`. Limite
 * connue : un tunnel (port local redirigé vers Neon) n'est pas détecté —
 * passez alors les deux `SEED_*_PASSWORD` explicitement.
 */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  const host = databaseHost(url);
  if (host === "") return false;
  if (host.startsWith("[")) return host === "[::1]";
  return LOCAL_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".localhost") || !host.includes(".");
}

/** Hachage scrypt des mots de passe des comptes (même format que les lib/auth des apps). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

/** Le mot de passe correspond-il au hachage stocké (`scrypt:sel:hash`) ? */
export function passwordMatches(password: string, stored: string | null | undefined): boolean {
  const [scheme, salt, hex] = (stored ?? "").split(":");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const candidate = scryptSync(password, salt, expected.length || 64);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** Un compte déjà seedé garde-t-il un mot de passe par défaut public ? */
export function hasPublicDefaultPassword(stored: string | null | undefined): boolean {
  return PUBLIC_DEFAULT_PASSWORDS.some((password) => passwordMatches(password, stored));
}

export type SeedPasswordInput = {
  /** Nom de la variable d'environnement (pour le message) */
  name: "SEED_ADMIN_PASSWORD" | "SEED_CLIENT_PASSWORD";
  /** Valeur lue dans l'environnement */
  value: string | undefined;
  /** Défaut de développement (celui de `.env.example`) */
  fallback: string;
  databaseUrl: string | undefined;
};

/**
 * Mot de passe à seeder : la valeur fournie, sinon le défaut — accepté
 * uniquement sur une base locale. Hors base locale, une valeur absente ou
 * égale au défaut est refusée (erreur explicite, le seed s'arrête avant
 * de créer le compte).
 */
export function seedPassword(input: SeedPasswordInput): string {
  const value = input.value?.trim() ?? "";
  const local = isLocalDatabaseUrl(input.databaseUrl);
  const isPublicDefault = (PUBLIC_DEFAULT_PASSWORDS as readonly string[]).includes(value) || value === input.fallback;
  if (value !== "" && !isPublicDefault) return value;
  if (local) return value === "" ? input.fallback : value;
  const host = databaseHost(input.databaseUrl) || "base distante";
  const reason = value === "" ? "manquante" : "égale à un mot de passe par défaut";
  throw new Error(
    `${input.name} ${reason} : le mot de passe par défaut de .env.example (dépôt public) est réservé à une base locale. ` +
      `Fournissez un mot de passe propre à cette base (${host}), par exemple : ${input.name}="<mot de passe>" pnpm db:seed`,
  );
}
