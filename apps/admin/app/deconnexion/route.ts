import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_ATTRIBUTES, currentStaff } from "@/lib/auth";
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/session-cookie";
import { homeFor } from "@/lib/staff";

export const dynamic = "force-dynamic";

/**
 * Fin d'une session qui n'ouvre plus rien : le compte du commercial a été
 * désactivé, ou son mot de passe réinitialisé. Une page ne peut pas effacer
 * un cookie ; `requireStaff` renvoie donc ici, où il est effacé avant le
 * retour à la connexion. Une session encore valable n'est pas touchée (une
 * simple visite de cette adresse ne déconnecte personne) : pour se
 * déconnecter, le bouton « Déconnexion » suffit.
 */
export async function GET(request: NextRequest) {
  const user = await currentStaff();
  const target = request.nextUrl.clone();
  target.search = "";
  if (user) {
    target.pathname = homeFor(user.role);
    return NextResponse.redirect(target);
  }
  target.pathname = "/login";
  const response = NextResponse.redirect(target);
  // Pose vide avec les attributs du cookie : le nom protégé ne s'efface pas autrement (voir `SESSION_COOKIE_ATTRIBUTES`)
  response.cookies.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_ATTRIBUTES, maxAge: 0 });
  if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) response.cookies.delete(LEGACY_SESSION_COOKIE);
  return response;
}
