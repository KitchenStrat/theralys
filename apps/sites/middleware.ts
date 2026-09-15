import { NextResponse, type NextRequest } from "next/server";
import { verifySitePreviewToken } from "@theralys/shared";

/**
 * Routage multi-tenant par en-tête Host :
 * - hôte de base (demo.theralys-web.fr, localhost…) → chemin /<slug>/… inchangé ;
 * - domaine custom d'un client (Phase 3) → réécriture vers /<domaine>/…,
 *   le segment [site] résout alors par domaine (il contient un point).
 *
 * Prévisualisation depuis l'éditeur du studio : un jeton signé `?apercu=`
 * (ou le cookie posé à sa première lecture, pour les navigations suivantes
 * dans l'iframe) est vérifié ici et transmis au rendu via l'en-tête
 * `x-hy-preview` (= id du site autorisé). Le layout et les pages s'en servent
 * pour afficher une démo expirée ou une page désactivée à l'éditeur seul.
 */

const PREVIEW_COOKIE = "hy_preview";

function baseHosts(): string[] {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  const base = process.env.SITES_BASE_URL;
  if (base) {
    try {
      hosts.add(new URL(base).hostname);
    } catch {
      // SITES_BASE_URL malformée : on garde les hôtes par défaut
    }
  }
  if (process.env.DEMO_HOST) hosts.add(process.env.DEMO_HOST);
  return [...hosts];
}

/** Id du site dont la prévisualisation est autorisée, sinon null. */
async function previewSiteId(request: NextRequest): Promise<{ siteId: string; fromQuery: boolean } | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const fromQuery = request.nextUrl.searchParams.get("apercu");
  if (fromQuery) {
    const payload = await verifySitePreviewToken(fromQuery, secret);
    if (payload) return { siteId: payload.siteId, fromQuery: true };
  }
  const fromCookie = request.cookies.get(PREVIEW_COOKIE)?.value;
  if (fromCookie) {
    const payload = await verifySitePreviewToken(fromCookie, secret);
    if (payload) return { siteId: payload.siteId, fromQuery: false };
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0] ?? "";
  const { pathname } = request.nextUrl;

  const preview = await previewSiteId(request);
  const requestHeaders = new Headers(request.headers);
  if (preview) requestHeaders.set("x-hy-preview", preview.siteId);

  const response = baseHosts().includes(host)
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : // Domaine custom : préfixer le chemin par le domaine pour le segment [site]
      NextResponse.rewrite(
        (() => {
          const url = request.nextUrl.clone();
          url.pathname = `/${host}${pathname}`;
          return url;
        })(),
        { request: { headers: requestHeaders } },
      );

  // Mémorise le jeton pour les navigations suivantes dans l'iframe de l'éditeur
  // (le domaine d'un client est un site tiers vu depuis le studio : SameSite=None)
  if (preview?.fromQuery) {
    const secure = request.nextUrl.protocol === "https:";
    response.cookies.set(PREVIEW_COOKIE, request.nextUrl.searchParams.get("apercu") ?? "", {
      httpOnly: true,
      sameSite: secure ? "none" : "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }
  return response;
}

export const config = {
  // Tout sauf les assets Next et fichiers statiques
  matcher: ["/((?!_next/|api/|favicon.ico|robots.txt).*)"],
};
