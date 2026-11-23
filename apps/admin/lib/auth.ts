import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, isNull, sql } from "drizzle-orm";
import { crmReps, getDb, users, type User } from "@theralys/db";
import { passwordFingerprint } from "@/lib/password-fingerprint";
import { isMissingSchemaError } from "@/lib/pg-errors";
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE, acceptsLegacyToken, sessionTokens } from "@/lib/session-cookie";
import { isStaffRole, type StaffRole } from "@/lib/staff";

export { SESSION_COOKIE };
const SESSION_DURATION_S = 60 * 60 * 24 * 7; // 7 jours

let weakSecretReported = false;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET manquante");
  // Un secret court se devine hors ligne à partir d'un seul jeton : signalé une fois dans les journaux, sans bloquer
  // le service — le remplacer déconnecte tout le monde, c'est à l'exploitant de choisir le moment
  if (!weakSecretReported && (secret.length < 32 || secret.startsWith("change-me"))) {
    weakSecretReported = true;
    console.error("[auth] AUTH_SECRET est trop court ou vaut la valeur d'exemple : remplacez-le par une valeur aléatoire d'au moins 32 caractères.");
  }
  return new TextEncoder().encode(secret);
}

// ── Mots de passe (scrypt, format scrypt:salt:hash) ──────────────────────────

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
 * Hachage de comparaison pour un compte inexistant, d'un autre rôle ou pas
 * encore activé : le même calcul est fait dans tous les cas, si bien que le
 * temps de réponse ne dit pas si une adresse e-mail a un compte.
 */
const DECOY_HASH = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;

// ── Session (JWT signé en cookie httpOnly) ───────────────────────────────────

/**
 * Ouvre la session d'un admin ou d'un commercial. Elle porte l'empreinte du
 * mot de passe (`pv`) : le changer ou le réinitialiser ferme pour de bon les
 * sessions ouvertes avec l'ancien.
 */
export async function createSession(user: User): Promise<void> {
  const token = await new SignJWT({ role: user.role, name: user.name, pv: passwordFingerprint(user.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_DURATION_S)
    .sign(secretKey());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, { ...SESSION_COOKIE_ATTRIBUTES, maxAge: SESSION_DURATION_S });
  // L'ancien nom ne sert plus dès qu'une session est ouverte sous le nom protégé
  if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) store.delete(LEGACY_SESSION_COOKIE);
}

/**
 * Attributs du cookie de session. Les mêmes servent à l'effacer : un
 * navigateur refuse tout `Set-Cookie` d'un nom `__Host-…` sans `Secure`,
 * effacement compris — un simple `delete()` (qui n'émet pas `Secure`)
 * laisserait la session ouverte.
 */
export const SESSION_COOKIE_ATTRIBUTES = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" } as const;

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_ATTRIBUTES, maxAge: 0 });
  if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) store.delete(LEGACY_SESSION_COOKIE);
}

export type SessionUser = { id: string; role: StaffRole; name: string };

type Session = { user: SessionUser; fingerprint: string | null };

async function readSession(): Promise<Session | null> {
  const store = await cookies();
  for (const { token, legacy } of sessionTokens((name) => store.get(name)?.value)) {
    try {
      const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
      if (legacy && !acceptsLegacyToken(payload)) continue;
      if (!isStaffRole(payload.role) || typeof payload.sub !== "string") continue;
      return { user: { id: payload.sub, role: payload.role, name: String(payload.name ?? "") }, fingerprint: typeof payload.pv === "string" ? payload.pv : null };
    } catch {
      // jeton invalide ou expiré : on essaie le suivant
    }
  }
  return null;
}

/**
 * Session portée par le cookie : le jeton signé d'un admin ou d'un
 * commercial. Elle ne dit pas si le compte existe toujours ni s'il est encore
 * ouvert (supprimé, désactivé, mot de passe changé) : ce sont `requireAdmin`
 * et `requireStaff` qui le relisent en base. À n'utiliser que pour orienter
 * (page de connexion), jamais pour autoriser.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  return (await readSession())?.user ?? null;
}

/**
 * À appeler en tête de chaque page/action réservée à l'admin. Un commercial
 * connecté n'y entre pas : il est renvoyé vers le CRM (qui vérifie son
 * compte), pas vers la connexion. Le compte de l'admin est relu en base : un
 * jeton signé ne suffit pas s'il ne désigne plus un administrateur.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/crm");
  const user = await verifiedStaff(session);
  if (!user) redirect("/deconnexion");
  return user;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Compte d'un administrateur, relu en base à chaque requête (une seule
 * lecture par requête) : il doit exister et être toujours administrateur.
 */
const loadAdmin = cache(async (userId: string): Promise<{ name: string; role: string; passwordHash: string } | null> => {
  if (!UUID.test(userId)) return null;
  const [admin] = await getDb().select({ name: users.name, role: users.role, passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  return admin ?? null;
});

/**
 * Compte d'un commercial, s'il ouvre encore le CRM : relu en base à chaque
 * requête — non désactivé, mot de passe choisi (le rôle et l'empreinte du
 * mot de passe sont comparés par `verifiedStaff`). Une seule lecture par
 * requête (`cache`), même si la mise en page et la page le demandent toutes
 * les deux.
 */
const loadOpenRep = cache(async (userId: string): Promise<{ name: string; role: string; passwordHash: string } | null> => {
  try {
    const [rep] = await getDb()
      .select({ name: users.name, role: users.role, passwordHash: users.passwordHash })
      .from(users)
      .innerJoin(crmReps, eq(crmReps.userId, users.id))
      .where(and(eq(users.id, userId), isNull(crmReps.disabledAt), sql`${users.passwordHash} not like 'invite:%'`))
      .limit(1);
    return rep ?? null;
  } catch (error) {
    // Migration 0012 non appliquée : aucun compte de commercial ne peut exister
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
});

/**
 * La session, si elle ouvre encore quelque chose : d'après son jeton ET le
 * compte relu en base.
 * - Admin : le compte existe et est toujours administrateur ; si le jeton
 *   porte l'empreinte du mot de passe, c'est encore celui-là (un jeton émis
 *   avant l'empreinte reste accepté jusqu'à son terme, 7 jours).
 * - Commercial : toujours de rôle `sales`, non désactivé, et avec le mot de
 *   passe pour lequel la session a été ouverte.
 * Une suppression, une désactivation ou un changement de mot de passe coupe
 * donc l'accès dès la page ou l'action suivante, sans attendre l'expiration
 * du jeton.
 */
async function verifiedStaff(session: Session): Promise<SessionUser | null> {
  if (session.user.role === "admin") {
    const admin = await loadAdmin(session.user.id);
    if (!admin || admin.role !== "admin") return null;
    if (session.fingerprint !== null && session.fingerprint !== passwordFingerprint(admin.passwordHash)) return null;
    return { ...session.user, name: admin.name };
  }
  const rep = await loadOpenRep(session.user.id);
  if (!rep || rep.role !== "sales" || passwordFingerprint(rep.passwordHash) !== session.fingerprint) return null;
  return { ...session.user, name: rep.name };
}

/** Session vérifiée (voir `verifiedStaff`), ou null. Ne redirige pas : pour les titres de page et la fin de session. */
export async function currentStaff(): Promise<SessionUser | null> {
  const session = await readSession();
  return session ? verifiedStaff(session) : null;
}

/**
 * À appeler en tête de chaque page/action ouverte à l'équipe : admin, ou
 * commercial dont le compte est actif. Un commercial dont le compte ne
 * l'est plus est déconnecté (`/deconnexion` efface son cookie).
 */
export async function requireStaff(): Promise<SessionUser> {
  const session = await readSession();
  if (!session) redirect("/login");
  const user = await verifiedStaff(session);
  if (!user) redirect("/deconnexion");
  return user;
}

/**
 * Vérifie des identifiants du back-office : admin, ou commercial actif (sa
 * connexion s'inscrit alors dans `last_login_at`). Un compte client, un
 * commercial désactivé ou qui n'a pas encore choisi son mot de passe : refus.
 */
export async function authenticate(email: string, password: string): Promise<User | null> {
  const db = getDb();
  // Les comptes de commerciaux sont enregistrés en minuscules : une majuscule saisie au clavier d'un téléphone ne bloque pas
  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user && email !== email.toLowerCase()) {
    const lowered = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
    if (lowered?.role === "sales") user = lowered;
  }
  const eligible = user && isStaffRole(user.role) ? user : null;
  // Même calcul que le compte existe ou non (hachage factice sinon) : le temps de réponse ne révèle rien
  const valid = await verifyPassword(password, eligible?.passwordHash.startsWith("scrypt:") ? eligible.passwordHash : DECOY_HASH);
  if (!eligible || !valid) return null;
  user = eligible;
  if (user.role === "sales") {
    const opened = await db
      .update(crmReps)
      .set({ lastLoginAt: new Date() })
      .where(and(eq(crmReps.userId, user.id), isNull(crmReps.disabledAt)))
      .returning({ userId: crmReps.userId });
    if (opened.length === 0) return null;
  }
  return user;
}
