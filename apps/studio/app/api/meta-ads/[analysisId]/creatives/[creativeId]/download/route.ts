import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { META_ADS_FORMATS, type MetaAdsFormat } from "@theralys/shared";
import { getSession } from "@/lib/auth";
import { getSite, siteUrl } from "@/lib/data";
import { creativeOf, metaAccess, ownedMetaAnalysis } from "@/lib/meta-ads/access";
import { metaCreativeTxt } from "@/lib/meta-ads/clipboard";
import { metaCreativePhotoUrl } from "@/lib/meta-ads/photos";
import { metaCreativeFilename, renderableMetaCreative } from "@/lib/meta-ads/render";
import { SIZE_SUFFIX, buildZip, contentDisposition, type ZipEntry } from "@/lib/social/render/bundle";
import { renderSlideCached } from "@/lib/social/render/cache";
import { loadRenderContext } from "@/lib/social/render/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const querySchema = z.object({
  size: z.enum(META_ADS_FORMATS).default("square"),
  kit: z.enum(["1", "0"]).optional(),
});

function file(data: Uint8Array, contentType: string, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(data.byteLength),
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * GET /api/meta-ads/[analysisId]/creatives/[creativeId]/download?size=square|portrait|story
 * Visuel JPEG d'une créa dans la taille demandée, nommé
 * « meta-c1-reassurance-carre.jpg » ; avec `?kit=1`, le kit complet (ZIP) :
 * les trois JPEG (carré, portrait, story) et `textes.txt` (texte principal,
 * titre, description, bouton, page d'atterrissage, texte alternatif).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ analysisId: string; creativeId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const site = await getSite(session.siteId);
  // Formule : un client repassé à une formule sans Meta Ads ne rend ni ne télécharge plus ses créas
  if (!metaAccess(site)) return NextResponse.json({ error: "La section Meta Ads n'est pas incluse dans votre formule." }, { status: 403 });

  const { analysisId, creativeId } = await context.params;
  const analysis = await ownedMetaAnalysis(session.siteId, analysisId);
  const creative = analysis ? creativeOf(analysis, creativeId) : null;
  if (!analysis || !creative) return NextResponse.json({ error: "Créa introuvable." }, { status: 404 });

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  const { size, kit } = parsed.data;

  const [ctx, photoUrl] = await Promise.all([loadRenderContext(session.siteId), metaCreativePhotoUrl(session.siteId, creative)]);
  const post = renderableMetaCreative(analysis, creative, photoUrl);
  const render = (s: MetaAdsFormat) => renderSlideCached({ post, ctx, size: s, slideIndex: 0, preview: false, reviewRating: null });
  const started = Date.now();
  try {
    if (kit !== "1") {
      const rendered = await render(size);
      console.info("[meta-ads] download", { analysisId: analysis.id, creativeId: creative.id, size, ms: Date.now() - started, degraded: rendered.degraded });
      return file(rendered.data, "image/jpeg", metaCreativeFilename(creative, SIZE_SUFFIX[size], "jpg"));
    }
    const entries: ZipEntry[] = [];
    let degraded = false;
    for (const s of META_ADS_FORMATS) {
      const rendered = await render(s);
      degraded ||= rendered.degraded;
      entries.push({ name: metaCreativeFilename(creative, SIZE_SUFFIX[s], "jpg"), data: rendered.data });
    }
    const domain = siteUrl(site).replace(/^https?:\/\//, "");
    entries.push({ name: "textes.txt", data: Buffer.from(metaCreativeTxt(creative, domain), "utf8") });
    console.info("[meta-ads] download kit", { analysisId: analysis.id, creativeId: creative.id, ms: Date.now() - started, degraded });
    return file(buildZip(entries), "application/zip", metaCreativeFilename(creative, "kit", "zip"));
  } catch (err) {
    console.error("[meta-ads] download échoué", { analysisId: analysis.id, creativeId: creative.id, size, kit, ms: Date.now() - started, err });
    return NextResponse.json({ error: "Le visuel n'a pas pu être généré." }, { status: 500 });
  }
}
