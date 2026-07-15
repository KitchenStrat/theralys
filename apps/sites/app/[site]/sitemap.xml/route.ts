import { NextResponse } from "next/server";
import {
  getMotifPages,
  getPublishedArticles,
  getSiteByKey,
  siteBaseUrl,
} from "@/lib/site-data";

export const dynamic = "force-dynamic";

/** Sitemap par site — vide pour les démos (non indexées). */
export async function GET(_request: Request, ctx: { params: Promise<{ site: string }> }) {
  const { site: siteKey } = await ctx.params;
  const site = await getSiteByKey(siteKey);
  if (!site) return new NextResponse("Not found", { status: 404 });

  const urls: { loc: string; lastmod?: string }[] = [];
  if (site.type !== "demo") {
    const base = siteBaseUrl(site);
    const [motifs, articles] = await Promise.all([
      getMotifPages(site.id),
      getPublishedArticles(site.id),
    ]);
    urls.push({ loc: base, lastmod: site.updatedAt.toISOString() });
    for (const page of motifs) {
      urls.push({ loc: `${base}/motifs/${page.slug}`, lastmod: page.updatedAt.toISOString() });
    }
    urls.push({ loc: `${base}/blog` });
    for (const article of articles) {
      urls.push({
        loc: `${base}/blog/${article.slug}`,
        lastmod: (article.publishedAt ?? article.updatedAt).toISOString(),
      });
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
  )
  .join("\n")}
</urlset>`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
