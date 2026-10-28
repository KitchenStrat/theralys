import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { META_ADS_FORMATS, SOCIAL_SIZES } from "@theralys/shared";
import { getSession } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { creativeOf, metaAccess, ownedMetaAnalysis } from "@/lib/meta-ads/access";
import { metaCreativePhotoUrl } from "@/lib/meta-ads/photos";
import { renderableMetaCreative } from "@/lib/meta-ads/render";
import { renderKey, renderSlideCached } from "@/lib/social/render/cache";
import { loadRenderContext } from "@/lib/social/render/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({
  size: z.enum(META_ADS_FORMATS).default("square"),
  preview: z.enum(["1", "0"]).optional(),
});

const REVALIDATE = "private, no-cache";
const NO_STORE = "private, no-store";

/**
 * GET /api/meta-ads/[analysisId]/creatives/[creativeId]/render?size=square|portrait|story&preview=1
 * JPEG du visuel d'une créa Meta (aperçu 540 px avec `preview=1`), via le
 * cache des rendus (table `meta_ads_analyses`, slot par créa). ETag faible =
 * clé de cache ; 304 sur `If-None-Match`. Accès : session, formule, analyse
 * aboutie du site.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ analysisId: string; creativeId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  // Formule : un client repassé à une formule sans Meta Ads ne rend ni ne télécharge plus ses créas
  if (!metaAccess(await getSite(session.siteId))) {
    return NextResponse.json({ error: "La section Meta Ads n'est pas incluse dans votre formule." }, { status: 403 });
  }

  const { analysisId, creativeId } = await context.params;
  const analysis = await ownedMetaAnalysis(session.siteId, analysisId);
  const creative = analysis ? creativeOf(analysis, creativeId) : null;
  if (!analysis || !creative) return NextResponse.json({ error: "Créa introuvable." }, { status: 404 });

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  const { size, preview } = parsed.data;

  // Tout ce qui entre dans la clé (donc dans l'ETag) est chargé avant son calcul
  const [ctx, photoUrl] = await Promise.all([loadRenderContext(session.siteId), metaCreativePhotoUrl(session.siteId, creative)]);
  const input = { post: renderableMetaCreative(analysis, creative, photoUrl), ctx, size, slideIndex: 0, preview: preview === "1", reviewRating: null };
  const key = renderKey(input);
  const etag = `W/"${key}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": REVALIDATE } });
  }

  const started = Date.now();
  try {
    const rendered = await renderSlideCached(input);
    console.info("[meta-ads] render", {
      analysisId: analysis.id,
      creativeId: creative.id,
      template: creative.template,
      size,
      preview: input.preview,
      ms: Date.now() - started,
      cached: rendered.cached,
      degraded: rendered.degraded,
    });
    return new NextResponse(new Uint8Array(rendered.data), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(rendered.data.length),
        "X-Social-Size": `${SOCIAL_SIZES[size].w}x${SOCIAL_SIZES[size].h}`,
        ...(rendered.degraded ? { "Cache-Control": NO_STORE } : { "Cache-Control": REVALIDATE, ETag: etag }),
      },
    });
  } catch (err) {
    console.error("[meta-ads] render échoué", { analysisId: analysis.id, creativeId: creative.id, size, ms: Date.now() - started, err });
    return NextResponse.json({ error: "Le visuel n'a pas pu être généré." }, { status: 500 });
  }
}
