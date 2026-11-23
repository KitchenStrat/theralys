import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq, sql } from "drizzle-orm";
import { getDb, sites, users, type User } from "@theralys/db";
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE, acceptsLegacyToken, sessionTokens } from "./session-cookie";

export { SESSION_COOKIE };
const SESSION_DURATION_S = 60 * 60 * 24 * 30; // 30 jours

let weakSecretReported = false;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET manquante");
  // Un secret court se devine hors ligne à partir d'un seul jeton (cookie, lien d'invitation) : signalé une fois
  // dans les journaux, sans bloquer le service — le remplacer déconnecte tout le monde, c'est à l'exploitant de choisir le moment
  if (!weakSecretReported && (secret.length < 32 || secret.startsWith("change-me"))) {
    weakSecretReported = true;
    console.error("[auth] AUTH_SECRET est trop court ou vaut la valeur d'exemple : remplacez-le par une valeur aléatoire d'au moins 32 caractères.");
  }
  return new TextEncoder().encode(secret);
}

/** scrypt hors du fil principal : un calcul de mot de passe ne bloque pas les autres requêtes de l'instance. */
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = await derive(password, salt);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/**
 * Hachage de comparaison pour un compte inexistant ou pas encore activé : le
 * même calcul est fait dans tous les cas, si bien que le temps de réponse ne
 * dit pas si une adresse e-mail a un compte.
 */
const DECOY_HASH = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;

/**
 * Compte d'une adresse e-mail, sans tenir compte de la casse (« Claire@… »
 * saisi au clavier d'un téléphone vaut « claire@… »). Si deux comptes ne
 * diffèrent que par la casse, seul celui écrit exactement ainsi est retenu.
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const wanted = email.trim();
  if (wanted === "" || wanted.length > 320) return null;
  const matches = await getDb()
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${wanted.toLowerCase()}`)
    .limit(2);
  if (matches.length <= 1) return matches[0] ?? null;
  return matches.find((user) => user.email === wanted) ?? null;
}

export async function authenticateClient(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);
  const eligible = user && user.role === "client" && user.siteId ? user : null;
  const valid = await verifyPassword(password, eligible?.passwordHash.startsWith("scrypt:") ? eligible.passwordHash : DECOY_HASH);
  return eligible && valid ? eligible : null;
}

/**
 * Empreinte du mot de passe en cours, portée par le jeton de session : dès que
 * le mot de passe change, les sessions ouvertes avec l'ancien cessent d'être
 * acceptées (appareil perdu, mot de passe compromis).
 */
export function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

async function setSessionCookie(token: string, duration: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: duration,
    path: "/",
  });
  // L'ancien nom ne sert plus dès qu'une session est ouverte sous le nom protégé
  if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) store.delete(LEGACY_SESSION_COOKIE);
}

export async function createSession(
  user: User,
  opts: { impersonated?: boolean } = {},
): Promise<void> {
  // Une session support (impersonation admin) est volontairement courte
  const duration = opts.impersonated ? 60 * 60 : SESSION_DURATION_S;
  const token = await new SignJWT({
    role: user.role,
    name: user.name,
    siteId: user.siteId,
    pv: passwordFingerprint(user.passwordHash),
    ...(opts.impersonated ? { impersonated: true } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + duration)
    .sign(secretKey());
  await setSessionCookie(token, duration);
}

/**
 * Session « agence » : ouverte par l'admin Harmony sur un site donné (démo ou
 * client, avec ou sans compte utilisateur). Même durée courte que le mode
 * support, bannière impersonation affichée.
 */
export async function createAgencySession(siteId: string): Promise<void> {
  const duration = 60 * 60;
  const token = await new SignJWT({
    role: "agency",
    name: "Harmony (agence)",
    siteId,
    impersonated: true,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("agency")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + duration)
    .sign(secretKey());
  await setSessionCookie(token, duration);
}

/**
 * Ferme la session. Le cookie protégé (`__Host-`) ne s'efface que par une pose
 * vide portant les mêmes attributs : un navigateur refuse tout `Set-Cookie`
 * de ce préfixe sans `Secure`, effacement compris — un simple `delete()` (qui
 * n'émet pas `Secure`) laisserait la session ouverte.
 */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0, path: "/" });
  if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) store.delete(LEGACY_SESSION_COOKIE);
}

export type StudioSession = {
  userId: string;
  siteId: string;
  name: string;
  /** Session ouverte par l'agence via impersonation (mode support) */
  impersonated: boolean;
};

/**
 * État du compte derrière un jeton de session client, relu en base une fois
 * par requête :
 * - `gone` — compte supprimé, déplacé vers un autre site, ou dont le mot de
 *   passe a changé depuis l'émission du jeton : la session ne vaut plus, sans
 *   attendre l'expiration du jeton (30 jours). Un jeton émis avant l'empreinte
 *   (`pv` absent) reste accepté jusqu'à son terme ;
 * - `suspended` — abonnement terminé (site archivé) : le praticien peut se
 *   connecter, mais ses outils sont en pause ;
 * - `active`.
 */
const accountState = cache(async (userId: string, siteId: string, fingerprint: string | null): Promise<"active" | "suspended" | "gone"> => {
  const [account] = await getDb()
    .select({ role: users.role, siteId: users.siteId, passwordHash: users.passwordHash, siteStatus: sites.status })
    .from(users)
    .leftJoin(sites, eq(sites.id, users.siteId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!account || account.role !== "client" || account.siteId !== siteId) return "gone";
  if (fingerprint !== null && fingerprint !== passwordFingerprint(account.passwordHash)) return "gone";
  return account.siteStatus === "archived" ? "suspended" : "active";
});

type ResolvedSession = StudioSession & { suspended: boolean };

/** Session portée par les cookies, compte vérifié en base ; `suspended` quand l'abonnement est terminé. */
const resolveSession = cache(async (): Promise<ResolvedSession | null> => {
  const store = await cookies();
  for (const { token, legacy } of sessionTokens((name) => store.get(name)?.value)) {
    try {
      const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
      if (legacy && !acceptsLegacyToken(payload)) continue;
      if ((payload.role !== "client" && payload.role !== "agency") || typeof payload.siteId !== "string") continue;
      let suspended = false;
      // L'équipe Harmony (session « agence ») garde la main sur un site archivé : seul le compte du praticien est vérifié
      if (payload.role === "client") {
        if (typeof payload.sub !== "string") continue;
        const state = await accountState(payload.sub, payload.siteId, typeof payload.pv === "string" ? payload.pv : null);
        if (state === "gone") continue;
        suspended = state === "suspended";
      }
      return {
        userId: String(payload.sub),
        siteId: payload.siteId,
        name: String(payload.name ?? ""),
        impersonated: payload.impersonated === true,
        suspended,
      };
    } catch {
      // jeton invalide ou expiré : on essaie le suivant
    }
  }
  return null;
});

/**
 * Session d'un compte en service. Un compte dont l'abonnement est terminé
 * n'en a pas : ses pages, ses actions et ses routes (générations, relevés,
 * rendus) lui sont fermées — voir `getSuspendedSession`.
 */
export async function getSession(): Promise<StudioSession | null> {
  const session = await resolveSession();
  if (!session || session.suspended) return null;
  const { suspended: _suspended, ...active } = session;
  return active;
}

/** Session d'un praticien dont l'abonnement est terminé (page « Abonnement terminé »), sinon null. */
export async function getSuspendedSession(): Promise<StudioSession | null> {
  const session = await resolveSession();
  if (!session?.suspended) return null;
  const { suspended: _suspended, ...rest } = session;
  return rest;
}

/** À appeler en tête de chaque page/action du studio. */
export async function requireClient(): Promise<StudioSession> {
  const session = await resolveSession();
  if (!session) redirect("/login");
  if (session.suspended) redirect("/abonnement-termine");
  const { suspended: _suspended, ...active } = session;
  return active;
}
