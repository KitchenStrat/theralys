import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, gte, lt, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, hasSocialMedia, socialPosts } from "@theralys/db";
import { SOCIAL_BIO_LINE } from "@theralys/ai";
import { monthRange, sizesFor, type SocialFormat, type SocialSize, type SocialTemplate } from "@theralys/shared";
import { getSession } from "@/lib/auth";
import { getSite, siteUrl } from "@/lib/data";
import {
  buildIcs,
  buildPlannerCsv,
  EXPORT_RENDER_MAX,
  exportFilename,
  plannerRows,
  socialPostDeepLink,
  STUDIO_DEFAULT_BASE_URL,
  type ExportablePost,
} from "@/lib/social/export";
import { contentDisposition } from "@/lib/social/render/bundle";
import { assetSlot, renderSlideCached } from "@/lib/social/render/cache";
import { loadRenderContext, loadReviewRating } from "@/lib/social/render/context";
import { monthLabelFr } from "@/lib/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Jusqu'à EXPORT_RENDER_MAX rendus séquentiels (satori + sharp) pour les visuels du CSV
export const maxDuration = 120;

const querySchema = z.object({
  mois: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  format: z.enum(["csv", "ics"]),
});

/** En-tête HTTP : ASCII seulement (accents retirés, le reste remplacé) — l'encodage des octets non ASCII y est ambigu. */
function headerSafe(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

function file(body: string, contentType: string, filename: string, note?: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "private, no-store",
      ...(note ? { "X-Harmony-Export-Note": headerSafe(note) } : {}),
    },
  });
}

/**
 * GET /api/social/export?mois=YYYY-MM&format=csv|ics
 * Contenus non archivés du mois, pour un planificateur (CSV : une ligne par
 * contenu et par réseau, légende du réseau, heure 09:00 Europe/Paris, URL
 * publique du visuel carré rendu sur Blob) ou un agenda (ICS : un événement
 * par contenu, lien profond vers le studio). Les URLs Blob ne sortent du
 * studio que par cet export : un planificateur doit pouvoir lire le visuel
 * sans session. Sans stockage Blob, `image_url` reste vide et l'en-tête
 * `X-Harmony-Export-Note` l'indique.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const site = await getSite(session.siteId);
  if (site.type !== "demo" && !hasSocialMedia(site.plan)) {
    return NextResponse.json({ error: "Les contenus réseaux sociaux ne sont pas inclus dans votre formule." }, { status: 403 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  const { mois, format } = parsed.data;
  const [year, month] = mois.split("-").map(Number) as [number, number];
  const { startIso, endIso } = monthRange(year, month);

  const db = getDb();
  const posts = await db.query.socialPosts.findMany({
    where: and(
      eq(socialPosts.siteId, site.id),
      ne(socialPosts.status, "archived"),
      gte(socialPosts.scheduledFor, startIso),
      lt(socialPosts.scheduledFor, endIso),
    ),
    orderBy: [asc(socialPosts.scheduledFor), asc(socialPosts.createdAt)],
  });
  const started = Date.now();

  if (format === "ics") {
    const base = process.env.STUDIO_BASE_URL ?? STUDIO_DEFAULT_BASE_URL;
    const publicUrl = siteUrl(site);
    const ics = buildIcs(
      posts.map((post) => ({
        uid: post.id,
        date: post.scheduledFor,
        summary: post.topic,
        // Légende Instagram (telle quelle, avec tous les hashtags)
        description: [post.content.caption.trim(), post.content.hashtags.join(" ")].filter((p) => p !== "").join("\n\n"),
        url: socialPostDeepLink(base, mois, post.id),
      })),
      { name: `Réseaux sociaux — ${monthLabelFr(year, month)} (${publicUrl.replace(/^https?:\/\//, "")})`, now: new Date() },
    );
    console.info("[social] export", { siteId: site.id, month: mois, format, posts: posts.length, ms: Date.now() - started });
    return file(ics, "text/calendar; charset=utf-8", exportFilename(mois, "ics"));
  }

  // CSV : visuels rendus (ou relus) sur Blob pour les EXPORT_RENDER_MAX premiers contenus
  const notes: string[] = [];
  const imageUrls = new Map<string, string>();
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    notes.push("Visuels non exportés : le stockage des rendus n'est pas configuré (colonne image_url vide).");
  } else if (posts.length > 0) {
    const ctx = await loadRenderContext(site.id);
    let degraded = 0;
    for (const post of posts.slice(0, EXPORT_RENDER_MAX)) {
      const allowed = sizesFor(post.format as SocialFormat, post.template as SocialTemplate);
      const size: SocialSize | undefined = allowed.includes("square") ? "square" : allowed[0];
      if (!size) continue;
      try {
        const reviewRating = post.template === "avis" ? await loadReviewRating(site.id, post.content) : null;
        const rendered = await renderSlideCached({ post, ctx, size, slideIndex: 0, preview: false, reviewRating });
        if (rendered.degraded) {
          degraded += 1;
          continue;
        }
        // L'URL publique est celle inscrite dans `assets` par le cache (même clé de rendu)
        const fresh = await db.query.socialPosts.findFirst({ where: eq(socialPosts.id, post.id), columns: { assets: true } });
        const entry = fresh?.assets.renders[assetSlot(size, 0, false)];
        if (entry?.url && entry.key === rendered.key) imageUrls.set(post.id, entry.url);
      } catch (err) {
        console.error("[social] export : rendu impossible", { siteId: site.id, postId: post.id, err });
        degraded += 1;
      }
    }
    if (degraded > 0) notes.push(`${degraded} visuel(s) non exporté(s) : rendu indisponible.`);
    if (posts.length > EXPORT_RENDER_MAX) {
      notes.push(`Visuels exportés pour les ${EXPORT_RENDER_MAX} premiers contenus seulement.`);
    }
  }

  const rows: ExportablePost[] = posts.map((post) => ({
    id: post.id,
    scheduledFor: post.scheduledFor,
    topic: post.topic,
    format: post.format as SocialFormat,
    content: post.content,
    imageUrl: imageUrls.get(post.id) ?? "",
  }));
  const csv = buildPlannerCsv(plannerRows(rows, siteUrl(site), SOCIAL_BIO_LINE));
  console.info("[social] export", {
    siteId: site.id,
    month: mois,
    format,
    posts: posts.length,
    images: imageUrls.size,
    ms: Date.now() - started,
  });
  return file(csv, "text/csv; charset=utf-8", exportFilename(mois, "csv"), notes.length > 0 ? notes.join(" ") : undefined);
}
