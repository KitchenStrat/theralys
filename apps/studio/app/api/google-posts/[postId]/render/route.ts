import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SOCIAL_SIZES } from "@theralys/shared";
import { getSession } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { googleAccess } from "@/lib/google/access";
import { ownedActiveGooglePost } from "@/lib/google/post-access";
import { GOOGLE_POST_SIZE, renderableGooglePost } from "@/lib/google/render";
import { renderKey, renderSlideCached } from "@/lib/social/render/cache";
import { loadRenderContext, loadReviewRating } from "@/lib/social/render/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({
  size: z.enum([GOOGLE_POST_SIZE]).default(GOOGLE_POST_SIZE),
  preview: z.enum(["1", "0"]).optional(),
});

const REVALIDATE = "private, no-cache";
const NO_STORE = "private, no-store";

/**
 * GET /api/google-posts/[postId]/render?size=landscape&preview=1
 * JPEG 4:3 (1200×900, aperçu 540 px avec `preview=1`) du visuel d'un post
 * Google, via le cache des rendus (table `google_posts`). ETag faible = clé de
 * cache ; 304 sur `If-None-Match`. Un post archivé est introuvable (404).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ postId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  // Formule : un client repassé à une formule sans Fiche Google ne rend ni ne télécharge plus ses posts
  if (!googleAccess(await getSite(session.siteId))) {
    return NextResponse.json({ error: "La Fiche Google n'est pas incluse dans votre formule." }, { status: 403 });
  }

  const { postId } = await context.params;
  const post = await ownedActiveGooglePost(session.siteId, postId);
  if (!post) return NextResponse.json({ error: "Post introuvable." }, { status: 404 });

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  const { size, preview } = parsed.data;

  const renderable = renderableGooglePost(post);
  const ctx = await loadRenderContext(session.siteId);
  const reviewRating = post.template === "avis" ? await loadReviewRating(session.siteId, renderable.content) : null;
  const input = { post: renderable, ctx, size, slideIndex: 0, preview: preview === "1", reviewRating };
  const key = renderKey(input);
  const etag = `W/"${key}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": REVALIDATE } });
  }

  const started = Date.now();
  try {
    const rendered = await renderSlideCached(input);
    console.info("[google] render", {
      postId: post.id,
      template: post.template,
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
    console.error("[google] render échoué", { postId: post.id, template: post.template, ms: Date.now() - started, err });
    return NextResponse.json({ error: "Le visuel n'a pas pu être généré." }, { status: 500 });
  }
}
