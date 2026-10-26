import { NextResponse, type NextRequest } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, socialPosts } from "@theralys/db";
import { SOCIAL_SIZES, sizesFor, type SocialFormat, type SocialSize, type SocialTemplate } from "@theralys/shared";
import { hasSocialMedia } from "@theralys/db";
import { getSession } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { ownedActiveSocialPost } from "@/lib/social/post-access";
import {
  SIZE_SUFFIX,
  buildPdf,
  buildZip,
  captionTxt,
  contentDisposition,
  downloadFilename,
  slideFileName,
  type ZipEntry,
} from "@/lib/social/render/bundle";
import { renderSlideCached } from "@/lib/social/render/cache";
import { loadRenderContext, loadReviewRating } from "@/lib/social/render/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Au-delà, on demande de télécharger les formats séparément (413). */
const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;

const querySchema = z.object({
  kind: z.enum(["image", "zip", "pdf", "caption", "all"]),
  size: z.enum(["square", "portrait", "story"]).optional(),
});

function file(data: Uint8Array, contentType: string, filename: string): NextResponse {
  // Copie typée `Uint8Array<ArrayBuffer>` : BodyInit refuse ArrayBufferLike (TS 5.9)
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
 * GET /api/social/[postId]/download?kind=image|zip|pdf|caption|all&size=…
 * Rendus séquentiels via le cache ; marque le contenu comme téléchargé
 * (`downloaded_at = coalesce(downloaded_at, now())`). Un contenu archivé est
 * introuvable (404) et n'est jamais marqué.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ postId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  // Formule : un client repassé à une formule sans réseaux sociaux ne rend ni ne télécharge plus ses contenus
  const site = await getSite(session.siteId);
  if (site.type !== "demo" && !hasSocialMedia(site.plan)) {
    return NextResponse.json({ error: "Les contenus réseaux sociaux ne sont pas inclus dans votre formule." }, { status: 403 });
  }

  const { postId } = await context.params;
  const post = await ownedActiveSocialPost(session.siteId, postId);
  if (!post) return NextResponse.json({ error: "Contenu introuvable." }, { status: 404 });

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  const { kind } = parsed.data;

  const allowed = sizesFor(post.format as SocialFormat, post.template as SocialTemplate);
  const size: SocialSize | undefined = parsed.data.size ?? allowed[0];
  if (!size || !allowed.includes(size)) {
    return NextResponse.json({ error: "Taille non disponible pour ce contenu." }, { status: 400 });
  }
  const isCarousel = post.format === "carousel";
  if ((kind === "zip" || kind === "pdf") && !isCarousel) {
    return NextResponse.json({ error: "Fichier non disponible pour ce contenu." }, { status: 400 });
  }

  const name = (suffix: string, ext: string) =>
    downloadFilename({ scheduledFor: post.scheduledFor, topic: post.topic }, suffix, ext);

  if (kind === "caption") {
    await markDownloaded(post.id);
    return file(Buffer.from(captionTxt(post.content), "utf8"), "text/plain; charset=utf-8", name("legende", "txt"));
  }

  const ctx = await loadRenderContext(session.siteId);
  const reviewRating = post.template === "avis" ? await loadReviewRating(session.siteId, post.content) : null;
  const started = Date.now();
  let degraded = false;
  // Rendus séquentiels (jamais Promise.all) : satori + sharp sont gourmands
  const renderAll = async (indices: number[]) => {
    const out: Buffer[] = [];
    for (const slideIndex of indices) {
      const r = await renderSlideCached({ post, ctx, size, slideIndex, preview: false, reviewRating });
      degraded ||= r.degraded;
      out.push(r.data);
    }
    return out;
  };
  const slides = post.content.slides;
  const allIndices = slides.map((_, i) => i);
  const { w, h } = SOCIAL_SIZES[size];

  try {
    let response: NextResponse;
    if (kind === "image") {
      const [jpeg] = await renderAll([0]);
      response = file(jpeg!, "image/jpeg", name(SIZE_SUFFIX[size], "jpg"));
    } else if (kind === "zip") {
      const images = await renderAll(allIndices);
      const entries: ZipEntry[] = images.map((data, i) => ({
        name: slideFileName(i, slides[i]?.role ?? "page"),
        data,
      }));
      response = file(buildZip(entries), "application/zip", name(`carrousel-${SIZE_SUFFIX[size]}`, "zip"));
    } else if (kind === "pdf") {
      const images = await renderAll(allIndices);
      const pdf = await buildPdf(
        images.map((data) => ({ data, width: w, height: h })),
        post.topic,
      );
      response = file(pdf, "application/pdf", name("carrousel", "pdf"));
    } else {
      const images = await renderAll(isCarousel ? allIndices : [0]);
      const entries: ZipEntry[] = isCarousel
        ? images.map((data, i) => ({ name: `carrousel/${slideFileName(i, slides[i]?.role ?? "page")}`, data }))
        : [{ name: `visuel-${SIZE_SUFFIX[size]}.jpg`, data: images[0]! }];
      entries.push({ name: "legende.txt", data: Buffer.from(captionTxt(post.content), "utf8") });
      const total = entries.reduce((sum, e) => sum + e.data.byteLength, 0);
      if (total > MAX_BUNDLE_BYTES) {
        return NextResponse.json(
          { error: "Fichier trop volumineux — téléchargez les formats séparément." },
          { status: 413 },
        );
      }
      response = file(buildZip(entries), "application/zip", name("tout", "zip"));
    }
    console.info("[social] download", {
      postId: post.id,
      kind,
      size,
      slides: isCarousel ? slides.length : 1,
      ms: Date.now() - started,
      degraded,
    });
    await markDownloaded(post.id);
    return response;
  } catch (err) {
    console.error("[social] download échoué", { postId: post.id, kind, size, ms: Date.now() - started, err });
    return NextResponse.json({ error: "Le visuel n'a pas pu être généré." }, { status: 500 });
  }
}

/** Pose `downloaded_at` (première fois seulement) — jamais sur un contenu archivé entre-temps. */
async function markDownloaded(postId: string): Promise<void> {
  const db = getDb();
  await db
    .update(socialPosts)
    .set({ downloadedAt: sql`coalesce(${socialPosts.downloadedAt}, now())`, updatedAt: new Date() })
    .where(and(eq(socialPosts.id, postId), ne(socialPosts.status, "archived")));
}
