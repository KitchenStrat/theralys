import { timingSafeEqual, scryptSync } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb, users, type User } from "@theralys/db";

export const SESSION_COOKIE = "tl_studio_session";
const SESSION_DURATION_S = 60 * 60 * 24 * 30; // 30 jours

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET manquante");
  return new TextEncoder().encode(secret);
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function authenticateClient(email: string, password: string): Promise<User | null> {
  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || user.role !== "client" || !user.siteId) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export async function createSession(user: User): Promise<void> {
  const token = await new SignJWT({ role: user.role, name: user.name, siteId: user.siteId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_DURATION_S)
    .sign(secretKey());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_S,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export type StudioSession = { userId: string; siteId: string; name: string };

export async function getSession(): Promise<StudioSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.role !== "client" || typeof payload.siteId !== "string") return null;
    return {
      userId: String(payload.sub),
      siteId: payload.siteId,
      name: String(payload.name ?? ""),
    };
  } catch {
    return null;
  }
}

/** À appeler en tête de chaque page/action du studio. */
export async function requireClient(): Promise<StudioSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
