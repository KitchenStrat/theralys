"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button, Card, FieldHint, Input, Label, Spinner } from "@theralys/ui";
import {
  getArticleViewUrl,
  publishArticleNow,
  regenerateArticleImage,
  rescheduleArticle,
  updateArticle,
  withdrawArticle,
} from "../../actions";

type ArticleData = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  imageUrl: string | null;
  imageAiGenerated: boolean;
  status: "published" | "draft" | "scheduled" | "withdrawn";
  publishAt: string | null;
  publishedAt: string | null;
  readingTimeMin: number;
  aiGenerated: boolean;
};

const STATUS_LABEL: Record<ArticleData["status"], { label: string; tone: "success" | "info" | "warning" | "neutral" }> = {
  published: { label: "Publié", tone: "success" },
  draft: { label: "Brouillon", tone: "success" },
  scheduled: { label: "Planifié", tone: "info" },
  withdrawn: { label: "Retiré", tone: "warning" },
};

export function ArticleEditor({
  article,
  publicationMode,
}: {
  article: ArticleData;
  publicationMode: "auto" | "manual";
}) {
  const router = useRouter();
  const [title, setTitle] = useState(article.title);
  const [excerpt, setExcerpt] = useState(article.excerpt);
  const [content, setContent] = useState(article.content);
  const [imageUrl, setImageUrl] = useState(article.imageUrl ?? "");
  const [publishAt, setPublishAt] = useState(article.publishAt ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, startTransition] = useTransition();

  const status = STATUS_LABEL[article.status];
  const notPublished = article.status !== "published";

  async function onSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await updateArticle({ articleId: article.id, title, excerpt, content, imageUrl });
    setSaving(false);
    if (result.error) setError(result.error);
    else {
      setMessage("Modifications enregistrées.");
      router.refresh();
    }
  }

  function run(action: () => Promise<unknown>, successMessage: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        setMessage(successMessage);
        router.refresh();
      } catch {
        setError("L'action a échoué.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href="/publications" className="text-ink-500 hover:text-ink-900">
          ← Retour aux publications
        </Link>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Modifier l&apos;article</h1>
        <Badge tone={status.tone}>{status.label}</Badge>
        {article.aiGenerated ? <Badge tone="info">IA</Badge> : null}
        <span className="text-sm text-ink-500">{article.readingTimeMin} min de lecture</span>
      </div>

      <Card className="mt-5 p-5">
        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Titre</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="excerpt">Extrait (affiché sur la liste du blog)</Label>
            <textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div>
            <Label>Image de couverture</Label>
            {imageUrl ? (
              <img src={imageUrl} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" />
            ) : (
              <p className="rounded-2xl bg-cream-100 p-6 text-center text-sm text-ink-500">
                Pas d&apos;image de couverture
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const { imageUrl: url } = await regenerateArticleImage(article.id);
                    setImageUrl(url);
                  }, "Nouvelle image générée par IA.")
                }
              >
                {busy ? <Spinner /> : "✨"} Régénérer par IA
              </Button>
              <Input
                placeholder="…ou collez l'URL de votre propre image"
                value={imageUrl.startsWith("data:") ? "" : imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <FieldHint>Utilisez votre propre photo ou laissez l&apos;IA illustrer l&apos;article.</FieldHint>
          </div>
          <div>
            <Label htmlFor="content">Contenu (markdown)</Label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={18}
              className="w-full rounded-xl border border-ink-300 bg-white px-3 py-2 font-mono text-sm leading-relaxed focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-danger-500">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-success-500">{message}</p> : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              startTransition(async () => {
                const { url } = await getArticleViewUrl(article.id);
                window.open(url, "_blank", "noopener");
              })
            }
          >
            Voir sur le site ↗
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </Card>

      {notPublished ? (
        <Card className="mt-5 p-5">
          <h2 className="text-sm font-semibold">Avant la publication</h2>
          <p className="mt-1 text-xs text-ink-500">
            {publicationMode === "auto"
              ? "Cet article sera publié automatiquement à la date prévue. Vous pouvez le replanifier, le publier maintenant ou le refuser."
              : "Publication manuelle : cet article ne sera mis en ligne que lorsque vous cliquerez sur « Publier maintenant »."}
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="publishAt">Replanifier au</Label>
              <div className="flex gap-2">
                <Input
                  id="publishAt"
                  type="date"
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                  className="w-44"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || !publishAt}
                  onClick={() =>
                    run(() => rescheduleArticle(article.id, publishAt), "Article replanifié.")
                  }
                >
                  Replanifier
                </Button>
              </div>
            </div>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(() => publishArticleNow(article.id), "Article publié !")}
            >
              Publier maintenant
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={busy || article.status === "withdrawn"}
              onClick={() =>
                run(() => withdrawArticle(article.id), "Article refusé — il ne sera pas publié.")
              }
            >
              Refuser l&apos;article
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="mt-5 flex items-center justify-between p-5">
          <p className="text-sm text-ink-500">
            Publié le{" "}
            {article.publishedAt
              ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(article.publishedAt))
              : ""}
          </p>
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => run(() => withdrawArticle(article.id), "Article retiré du site.")}
          >
            Retirer du site
          </Button>
        </Card>
      )}
    </div>
  );
}
