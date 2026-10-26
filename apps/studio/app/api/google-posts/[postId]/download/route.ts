import { NextResponse, type NextRequest } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, googlePosts } from "@theralys/db";
import { getSession } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { googleAccess } from "@/lib/google/access";
import { ownedActiveGooglePost } from "@/lib/google/post-access";
import { GOOGLE_POST_SIZE, googlePostTxt, renderableGooglePost } from "@/lib/google/render";
import { buildZip, contentDisposition, downloadFilename, type ZipEntry } from "@/lib/social/render/bundle";
import { renderSlideCached } from "@/lib/social/render/cache";
import { loadRenderContext, loadReviewRating } from "@/lib/social/render/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const querySchema = z.object({ kind: z.enum(["image", "text", "all"]) });

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
 * GET /api/google-posts/[postId]/download?kind=image|text|all
 * Visuel 4:3 (JPG), texte du post (.txt) ou les deux (ZIP) ; marque le post
 * comme téléchargé (`downloaded_at = coalesce(downloaded_at, now())`). Un
 * post archivé est introuvable (404) et n'est jamais marqué.
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
  const { kind } = parsed.data;

  const name = (suffix: string, ext: string) =>
    downloadFilename({ scheduledFor: post.scheduledFor, topic: post.topic }, suffix, ext);
  const text = Buffer.from(googlePostTxt(post.content), "utf8");

  if (kind === "text") {
    await markDownloaded(post.id);
    return file(text, "text/plain; charset=utf-8", name("google-texte", "txt"));
  }

  const renderable = renderableGooglePost(post);
  const ctx = await loadRenderContext(session.siteId);
  const reviewRating = post.template === "avis" ? await loadReviewRating(session.siteId, renderable.content) : null;
  const started = Date.now();
  try {
    const rendered = await renderSlideCached({
      post: renderable,
      ctx,
      size: GOOGLE_POST_SIZE,
      slideIndex: 0,
      preview: false,
      reviewRating,
    });
    let response: NextResponse;
    if (kind === "image") {
      response = file(rendered.data, "image/jpeg", name("google-visuel", "jpg"));
    } else {
      const entries: ZipEntry[] = [
        { name: "visuel-google.jpg", data: rendered.data },
        { name: "texte-google.txt", data: text },
      ];
      response = file(buildZip(entries), "application/zip", name("google", "zip"));
    }
    console.info("[google] download", { postId: post.id, kind, ms: Date.now() - started, degraded: rendered.degraded });
    await markDownloaded(post.id);
    return response;
  } catch (err) {
    console.error("[google] download échoué", { postId: post.id, kind, ms: Date.now() - started, err });
    return NextResponse.json({ error: "Le visuel n'a pas pu être généré." }, { status: 500 });
  }
}

/** Pose `downloaded_at` (première fois seulement) — jamais sur un post archivé entre-temps. */
async function markDownloaded(postId: string): Promise<void> {
  await getDb()
    .update(googlePosts)
    .set({ downloadedAt: sql`coalesce(${googlePosts.downloadedAt}, now())`, updatedAt: new Date() })
    .where(and(eq(googlePosts.id, postId), ne(googlePosts.status, "archived")));
}
