import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { getArticle, getBlogSettings } from "@/lib/data";
import { ArticleEditor } from "./article-editor";

export const metadata = { title: "Modifier l'article" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ArticleEditPage({ params }: Props) {
  const session = await requireClient();
  const { id } = await params;
  const article = await getArticle(session.siteId, id);
  if (!article) notFound();
  const settings = await getBlogSettings(session.siteId);

  return (
    <ArticleEditor
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
