import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE, acceptsLegacyToken, sessionTokens } from "@/lib/session-cookie";
import { PUBLIC_PATHS, routeFor } from "@/lib/staff";

/**
 * Garde d'authentification : tout l'admin est protégé sauf les pages
 * publiques (connexion, invitation d'un commercial) et les routes API
 * (webhook Stripe, cron des jobs), qui portent leur propre auth.
 * Un jeton d'admin ouvre tout ; un jeton de commercial n'ouvre que le CRM et
 * ses fiches, tout autre chemin le renvoie vers le CRM. Le garde ne lit que
 * le jeton : l'état du compte (supprimé, désactivé, mot de passe changé) est
 * relu en base par chaque page et chaque action (`requireAdmin`,
 * `requireStaff`).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api/")) return NextResponse.next();

  let role: unknown = null;
  /** Session ouverte avant le cookie protégé : à recopier sous le nouveau nom pour le temps qu'il lui reste. */
  let upgrade: { token: string; remaining: number } | null = null;
  const secret = process.env.AUTH_SECRET;
  if (secret) {
    const key = new TextEncoder().encode(secret);
    for (const { token, legacy } of sessionTokens((name) => request.cookies.get(name)?.value)) {
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(token, key, { algorithms: ["HS256"] }));
      } catch {
        continue; // token invalide/expiré → jeton suivant, sinon login
      }
      if (legacy && !acceptsLegacyToken(payload)) continue;
      if (typeof payload.sub !== "string") continue;
      role = payload.role;
      if (legacy && typeof payload.exp === "number") upgrade = { token, remaining: payload.exp - Math.floor(Date.now() / 1000) };
      break;
    }
  }

  const decision = routeFor(role, pathname);
  let response: NextResponse;
  if (decision === "pass") {
    response = NextResponse.next();
  } else {
    const target = request.nextUrl.clone();
    target.pathname = decision === "crm" ? "/crm" : "/login";
    target.search = "";
    response = NextResponse.redirect(target);
  }
  if (upgrade && upgrade.remaining > 0 && decision !== "login") {
    response.cookies.set(SESSION_COOKIE, upgrade.token, { httpOnly: true, sameSite: "lax", secure: true, maxAge: upgrade.remaining, path: "/" });
    response.cookies.delete(LEGACY_SESSION_COOKIE);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
