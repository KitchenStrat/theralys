import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@theralys/db";
import { metaAdVideoSource, mediaProviderFor } from "@theralys/jobs";
import { META_MEDIA_ITEMS_MAX } from "@theralys/shared";
import { getSession } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { metaAccess } from "@/lib/meta-ads/access";
import { createMetaMediaStore } from "@/lib/meta-ads/media-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const paramsSchema = z.object({ adId: z.string().regex(/^\d{5,25}$/) });
const querySchema = z.object({ i: z.coerce.number().int().min(0).max(META_MEDIA_ITEMS_MAX - 1).default(0) });

const NO_STORE = "private, no-store";

/**
 * GET /api/meta-ads/media/[adId]/video?i=0 — redirige vers la vidéo d'une
 * annonce de la veille ou de la bibliothèque du site : copie durable d'un
 * exemple gardé, sinon lien d'origine (rafraîchi chez le fournisseur s'il a
 * expiré, dans la limite du quota). Accès : session, formule, annonce du
 * site. 404 si l'annonce n'est pas celle du site ou si la vidéo n'est plus
 * disponible.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ adId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const site = await getSite(session.siteId);
  if (!metaAccess(site)) return NextResponse.json({ error: "La section Meta Ads n'est pas incluse dans votre formule." }, { status: 403 });

  const params = paramsSchema.safeParse(await context.params);
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!params.success || !query.success) return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });

  try {
    const db = getDb();
    const analysis = await db.query.metaAdsAnalyses.findFirst({
      where: (table, { and, eq }) => and(eq(table.siteId, site.id), eq(table.status, "done")),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      columns: { provider: true },
    });
    const source = await metaAdVideoSource(db, site, params.data.adId, query.data.i, {
      provider: mediaProviderFor(process.env, analysis?.provider ?? "none"),
      store: createMetaMediaStore(),
      now: new Date(),
    });
    if (!source) return NextResponse.json({ error: "Vidéo indisponible." }, { status: 404, headers: { "Cache-Control": NO_STORE } });
    return new NextResponse(null, { status: 302, headers: { Location: source.url, "Cache-Control": NO_STORE, "Referrer-Policy": "no-referrer" } });
  } catch (err) {
    console.error("[meta-ads] vidéo d'annonce indisponible", { siteId: site.id, adId: params.data.adId, err });
    return NextResponse.json({ error: "Vidéo indisponible." }, { status: 502, headers: { "Cache-Control": NO_STORE } });
  }
}
