import { NextResponse, type NextRequest } from "next/server";

/**
 * Routage multi-tenant par en-tête Host :
 * - hôte de base (demo.theralys-web.fr, localhost…) → chemin /<slug>/… inchangé ;
 * - domaine custom d'un client (Phase 3) → réécriture vers /<domaine>/…,
 *   le segment [site] résout alors par domaine (il contient un point).
 */

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

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0] ?? "";
  const { pathname } = request.nextUrl;

  if (baseHosts().includes(host)) {
    return NextResponse.next();
  }

  // Domaine custom : préfixer le chemin par le domaine pour le segment [site]
  const url = request.nextUrl.clone();
  url.pathname = `/${host}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Tout sauf les assets Next et fichiers statiques
  matcher: ["/((?!_next/|api/|favicon.ico|robots.txt).*)"],
};
