import { notFound } from "next/navigation";
import { activeExternalSite } from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { getArticle, getBlogSettings, getSite } from "@/lib/data";
import { ArticleEditor } from "./article-editor";

export const metadata = { title: "Modifier l'article" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ArticleEditPage({ params }: Props) {
  const session = await requireClient();
  const { id } = await params;
  const article = await getArticle(session.siteId, id);
  if (!article) notFound();
  const [settings, site] = await Promise.all([getBlogSettings(session.siteId), getSite(session.siteId)]);
  // Site du client en référence : l'article paraît sur le site Harmony, le praticien le reprend sur le sien
  const ownSite = activeExternalSite(site.theme) !== null;

  return (
    <ArticleEditor
      ownSite={ownSite}
      article={{
        id: article.id,
        title: article.title,
        excerpt: article.excerpt ?? "",
        content: article.content,
        imageUrl: article.imageUrl,
        imageAiGenerated: article.imageAiGenerated,
        status: article.status,
        publishAt: article.publishAt?.toISOString().slice(0, 10) ?? null,
        publishedAt: article.publishedAt?.toISOString() ?? null,
        readingTimeMin: article.readingTimeMin,
        aiGenerated: article.aiGenerated,
      }}
      publicationMode={settings?.publicationMode ?? "auto"}
    />
  );
}
