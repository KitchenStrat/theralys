import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "tl_studio_session";

/** Tout le studio est réservé aux clients connectés, sauf /login et l'entrée d'impersonation. */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname === "/login" ||
    pathname === "/impersonate" ||
    pathname === "/creer-mot-de-passe"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && process.env.AUTH_SECRET) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      if (
        (payload.role === "client" || payload.role === "agency") &&
        typeof payload.siteId === "string"
      ) {
        return NextResponse.next();
      }
    } catch {
      // session invalide/expirée → login
    }
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
