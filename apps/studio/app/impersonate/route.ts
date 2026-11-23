import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb, sites, users } from "@theralys/db";
import { createAgencySession, createSession } from "@/lib/auth";
import { recordImpersonation } from "@/lib/impersonation-log";

export const dynamic = "force-dynamic";

/**
 * Entrée du mode support : l'admin arrive avec un jeton d'impersonation signé
 * (2 min de validité, usage unique). La session créée est marquée
 * « impersonated » et affichée en bannière dans tout le studio. Chaque entrée
 * est inscrite au journal (`impersonations`) : qui, dans quel site, quand.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) {
    return NextResponse.redirect(new URL("/login?error=lien", request.url));
  }

  // Destination après connexion (l'admin arrive souvent droit sur l'éditeur)
  const next = request.nextUrl.searchParams.get("next");
  const destination = next === "/editor" ? "/editor" : "/";

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    if (payload.purpose !== "studio-impersonation") throw new Error("jeton invalide");
    const db = getDb();
    // Usage unique et journal : un lien déjà inscrit (rejoué) n'ouvre rien. Un lien sans identifiant (émis par une
    // version précédente de l'admin, valable 2 minutes) passe encore, sans journal.
    const enter = async (siteId: string) => {
      if (typeof payload.jti !== "string") return;
      if ((await recordImpersonation({ jti: payload.jti, adminId: payload.impersonator, siteId })) === "replayed") throw new Error("lien déjà utilisé");
    };

    // Jeton « agence » : porte directement un siteId (démos sans compte client)
    if (payload.agency === true && typeof payload.siteId === "string") {
      const site = await db.query.sites.findFirst({ where: eq(sites.id, payload.siteId) });
      if (!site) throw new Error("site introuvable");
      await enter(site.id);
      await createAgencySession(site.id);
      return NextResponse.redirect(new URL(destination, request.url));
    }

    if (typeof payload.sub !== "string") throw new Error("jeton invalide");
    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) });
    if (!user || user.role !== "client" || !user.siteId) throw new Error("client introuvable");

    await enter(user.siteId);
    await createSession(user, { impersonated: true });
    return NextResponse.redirect(new URL(destination, request.url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=lien", request.url));
  }
}
