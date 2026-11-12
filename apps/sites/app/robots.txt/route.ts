import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, sites } from "@theralys/db";
import { robotsTxt } from "@/lib/indexing";

export const dynamic = "force-dynamic";

/**
 * robots.txt par hôte (règle dans `robotsTxt`, lib/indexing.ts) :
 * - hôte de démos → tout est interdit ;
 * - domaine custom d'un client (Phase 3) → parcours autorisé + sitemap ;
 * - domaine d'un client dont le propre site est la référence des outils →
 *   parcours autorisé, sans sitemap : ses pages portent `noindex`, que les
 *   moteurs ne peuvent lire qu'en les parcourant.
 */
export async function GET(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0] ?? "";

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.domain, host) });

  return new NextResponse(robotsTxt(site, host), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
