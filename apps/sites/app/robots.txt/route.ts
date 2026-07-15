import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, sites } from "@theralys/db";

export const dynamic = "force-dynamic";

/**
 * robots.txt par hôte :
 * - hôte de démos → tout est interdit à l'indexation ;
 * - domaine custom d'un client (Phase 3) → indexation + sitemap.
 */
export async function GET(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0] ?? "";

  const db = getDb();
  const site = await db.query.sites.findFirst({ where: eq(sites.domain, host) });

  if (site && site.type === "client") {
    return robotsResponse(`User-agent: *\nAllow: /\n\nSitemap: https://${host}/sitemap.xml\n`);
  }

  return robotsResponse("User-agent: *\nDisallow: /\n");
}

function robotsResponse(body: string) {
  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
