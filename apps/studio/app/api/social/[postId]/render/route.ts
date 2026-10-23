import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SOCIAL_SIZES, sizesFor, type SocialFormat, type SocialTemplate } from "@theralys/shared";
import { getSession } from "@/lib/auth";
import { ownedSocialPost } from "@/lib/social/post-access";
import { renderKey, renderSlideCached } from "@/lib/social/render/cache";
import { loadRenderContext, loadReviewRating } from "@/lib/social/render/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({
  size: z.enum(["square", "portrait", "story"]),
  slide: z.coerce.number().int().min(0).default(0),
  preview: z.enum(["1", "0"]).optional(),
});

/**
 * GET /api/social/[postId]/render?size=square|portrait|story&slide=0&preview=1
 * JPEG d'une diapositive (aperçu 540 px avec `preview=1`), via le cache des
 * rendus. ETag faible = clé de cache ; 304 sur `If-None-Match`.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ postId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { postId } = await context.params;
  const post = await ownedSocialPost(session.siteId, postId);
  if (!post) return NextResponse.json({ error: "Contenu introuvable." }, { status: 404 });

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  const { size, slide, preview } = parsed.data;

  const allowed = sizesFor(post.format as SocialFormat, post.template as SocialTemplate);
  if (!allowed.includes(size)) {
    return NextResponse.json({ error: "Taille non disponible pour ce contenu." }, { status: 400 });
  }
  if (slide >= post.content.slides.length) {
    return NextResponse.json({ error: "Diapositive introuvable." }, { status: 400 });
  }

  const ctx = await loadRenderContext(session.siteId);
  const input = { post, ctx, size, slideIndex: slide, preview: preview === "1" };
  const key = renderKey(input);
  const etag = `W/"${key}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, max-age=3600" },
    });
  }

  const started = Date.now();
  const reviewRating = post.template === "avis" ? await loadReviewRating(session.siteId, post.content) : null;
  try {
    const rendered = await renderSlideCached({ ...input, reviewRating });
    console.info("[social] render", {
      postId: post.id,
      template: post.template,
      size,
      slide,
      preview: input.preview,
      ms: Date.now() - started,
      cached: rendered.cached,
    });
    return new NextResponse(new Uint8Array(rendered.data), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(rendered.data.length),
        "Cache-Control": "private, max-age=3600",
        ETag: etag,
        "X-Social-Size": `${SOCIAL_SIZES[size].w}x${SOCIAL_SIZES[size].h}`,
      },
    });
  } catch (err) {
    console.error("[social] render échoué", {
      postId: post.id,
      template: post.template,
      size,
      slide,
      ms: Date.now() - started,
      err,
    });
    return NextResponse.json({ error: "Le visuel n'a pas pu être généré." }, { status: 500 });
  }
}
