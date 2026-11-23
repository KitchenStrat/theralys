import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE, acceptsLegacyToken, sessionTokens } from "@/lib/session-cookie";

/** Pages ouvertes sans session : connexion, entrée du mode support, création et réinitialisation du mot de passe. */
const PUBLIC_PATHS = new Set(["/login", "/impersonate", "/creer-mot-de-passe", "/mot-de-passe-oublie"]);

/**
 * Tout le studio est réservé aux clients connectés, sauf les pages publiques.
 * Le garde ne lit que le jeton : l'état du compte (supprimé, mot de passe
 * changé) est relu en base par chaque page, action et route (`getSession`).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  if (secret) {
    const key = new TextEncoder().encode(secret);
    for (const { token, legacy } of sessionTokens((name) => request.cookies.get(name)?.value)) {
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(token, key, { algorithms: ["HS256"] }));
      } catch {
        continue; // session invalide/expirée → jeton suivant, sinon login
      }
      if (legacy && !acceptsLegacyToken(payload)) continue;
      if ((payload.role !== "client" && payload.role !== "agency") || typeof payload.siteId !== "string") continue;

      const response = NextResponse.next();
      // Session ouverte avant le cookie protégé : recopiée sous le nouveau nom pour le temps qu'il lui reste
      if (legacy && typeof payload.exp === "number") {
        const remaining = payload.exp - Math.floor(Date.now() / 1000);
        if (remaining > 0) {
          response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: true, maxAge: remaining, path: "/" });
          response.cookies.delete(LEGACY_SESSION_COOKIE);
        }
      }
      return response;
    }
  }

  // Routes d'API (rendu des visuels, téléversement) : réponse 401 lisible par
  // un client HTTP plutôt qu'une redirection vers la page de connexion.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // L'icône du studio (`app/icon.svg`) reste publique : la page de connexion l'affiche aussi
  matcher: ["/((?!_next/|favicon.ico|icon.svg).*)"],
};
