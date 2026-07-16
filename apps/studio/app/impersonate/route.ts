import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb, users } from "@theralys/db";
import { createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Entrée du mode support : l'admin arrive avec un jeton d'impersonation signé
 * (2 min de validité). La session créée est marquée « impersonated » et
 * affichée en bannière dans tout le studio.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.purpose !== "studio-impersonation" || typeof payload.sub !== "string") {
      throw new Error("jeton invalide");
    }
    const db = getDb();
    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) });
    if (!user || user.role !== "client" || !user.siteId) throw new Error("client introuvable");

    await createSession(user, { impersonated: true });
    return NextResponse.redirect(new URL("/", request.url));
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
