"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CircleCheck,
  Clock,
  Copy,
  CopyCheck,
  Download,
  ExternalLink,
  EyeOff,
  FileText,
  Globe,
  ImageOff,
  Save,
  Send,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { FieldHint, Input, Label } from "@theralys/ui";
import { AiBadge, Badge, Button, Card, CardHeader, InlineSuccess, LinkButton, PageHeader, Stagger } from "@/components/ds";
import {
  getArticleViewUrl,
  publishArticleNow,
  regenerateArticleImage,
  rescheduleArticle,
  updateArticle,
  withdrawArticle,
} from "../../actions";
import { ArticleExportMessage, useArticleExport } from "../article-export";
import { ArticleStatusPill } from "../article-status";

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

/** Où s'affiche le résultat d'une action : près du bouton qui l'a lancée. */
type Zone = "texte" | "publication";

/** Champs de saisie : 44 px de haut et corps en 16 px (lisible, et sans zoom forcé sur téléphone). */
const INPUT = "min-h-11 text-base!";
const TEXTAREA =
  "block w-full rounded-xl border border-ink-300 bg-white px-3.5 py-2.5 text-base/7 text-ds-ink-900 placeholder:text-ink-500";

export function ArticleEditor({
  article,
  publicationMode,
  ownSite = false,
}: {
  article: ArticleData;
  publicationMode: "auto" | "manual";
  /**
   * Le site du client est la référence des outils : l'article paraît sur le
   * site Harmony, et le praticien le reprend sur le sien (copie, image).
   */
  ownSite?: boolean;
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
  // Présentation seulement : quel bouton tourne, et où dire le résultat
  const [running, setRunning] = useState<string | null>(null);
  const [zone, setZone] = useState<Zone>("texte");

  const notPublished = article.status !== "published";
  // « Copier l'article » reprend ce qui est à l'écran, modifications en cours comprises
  const exporter = useArticleExport(() => ({ title, content }));
  // La marque de l'IA ne vaut que pour l'image enregistrée, pas pour une adresse que le praticien vient de coller
  const aiImage = article.imageAiGenerated && imageUrl !== "" && imageUrl === (article.imageUrl ?? "");

  async function onSave() {
    setSaving(true);
    setZone("texte");
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

  function run(key: string, where: Zone, action: () => Promise<unknown>, successMessage: string) {
    setError(null);
    setMessage(null);
    setRunning(key);
    setZone(where);
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

  const feedback = (where: Zone) =>
    zone !== where ? null : error ? (
      <p role="alert" className="flex items-start gap-2 text-ds-body font-medium text-ds-danger-700">
        <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
        {error}
      </p>
    ) : message ? (
      <InlineSuccess>{message}</InlineSuccess>
    ) : null;

  return (
    <Stagger className="space-y-6">
      {/* Le lien de retour et l'en-tête forment un seul bloc de la cascade */}
      <div className="space-y-2">
        <LinkButton href="/publications" variant="quiet" size="sm" icon={<ArrowLeft size={16} aria-hidden />}>
          Retour aux publications
        </LinkButton>
        <PageHeader
          section="publications"
          title="Modifier l'article"
          purpose="Relisez le texte, ajustez-le si besoin, puis décidez de sa publication."
        >
          <div className="flex flex-wrap items-center gap-2">
            <ArticleStatusPill status={article.status} />
            {article.aiGenerated ? <AiBadge /> : null}
            <Badge icon={Clock} className="bg-white">
              {article.readingTimeMin} min de lecture
            </Badge>
          </div>
        </PageHeader>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardHeader icon={FileText} title="Texte et image" description="Ce que vos lecteurs verront sur votre blog." />
          <div className="mt-6 space-y-5">
            <div>
              <Label htmlFor="title">Titre</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
            </div>
            <div>
              <Label htmlFor="excerpt">Extrait (affiché sur la liste du blog)</Label>
              <textarea id="excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={3} className={TEXTAREA} />
            </div>
            <div>
              <p className="mb-1 block text-sm font-medium text-ink-700">Image de couverture</p>
              <div className="relative overflow-hidden rounded-ds-md bg-ds-section-tint ring-1 ring-ds-section-line/70">
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
                ) : (
                  <p className="flex aspect-[16/9] flex-col items-center justify-center gap-2 p-6 text-center text-ds-body text-ds-ink-600">
                    <ImageOff size={28} aria-hidden className="text-ds-section-accent" />
                    Pas d&apos;image de couverture
                  </p>
                )}
                {aiImage ? (
                  <span className="absolute top-3 left-3">
                    <AiBadge className="shadow-sm">Image générée par l&apos;IA</AiBadge>
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  loading={busy && running === "image"}
                  icon={<Sparkles size={18} aria-hidden />}
                  onClick={() =>
                    run(
                      "image",
                      "texte",
                      async () => {
                        const { imageUrl: url } = await regenerateArticleImage(article.id);
                        setImageUrl(url);
                      },
                      "Nouvelle image générée par IA.",
                    )
                  }
                >
                  Régénérer par IA
                </Button>
                <div className="min-w-0 flex-[1_1_16rem]">
                  <Input
                    aria-label="Adresse de votre propre image"
                    placeholder="…ou collez l'adresse de votre propre image"
                    value={imageUrl.startsWith("data:") ? "" : imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className={INPUT}
                  />
                </div>
              </div>
              <FieldHint>Utilisez votre propre photo ou laissez l&apos;IA illustrer l&apos;article.</FieldHint>
            </div>
            <div>
              <Label htmlFor="content">Texte de l&apos;article</Label>
              <textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} rows={18} className={TEXTAREA} />
              <FieldHint>
                Mise en forme : « ## » devant un intertitre, « - » devant chaque ligne d&apos;une liste, deux astérisques de
                chaque côté d&apos;un mot pour le mettre en gras.
              </FieldHint>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-ds-ink-200 pt-5">
            <Button
              type="button"
              variant="quiet"
              disabled={busy}
              loading={busy && running === "voir"}
              iconRight={<ExternalLink size={18} aria-hidden />}
              onClick={() => {
                setRunning("voir");
                startTransition(async () => {
                  const { url } = await getArticleViewUrl(article.id);
                  window.open(url, "_blank", "noopener");
                });
              }}
            >
              {ownSite ? "Voir sur le site Harmony" : "Voir sur le site"}
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-3">
              {feedback("texte")}
              <Button onClick={onSave} loading={saving} icon={<Save size={18} aria-hidden />}>
                Enregistrer
              </Button>
            </div>
          </div>
        </Card>

        {/* Sur grand écran, les décisions de publication restent à portée pendant la relecture */}
        <div className="space-y-6 xl:sticky xl:top-6">
          {notPublished ? (
            <Card>
              <CardHeader
                icon={CalendarClock}
                title="Avant la publication"
                description={
                  publicationMode === "auto"
                    ? "Cet article sera publié automatiquement à la date prévue. Vous pouvez le replanifier, le publier maintenant ou le refuser."
                    : "Publication manuelle : cet article ne sera mis en ligne que lorsque vous cliquerez sur « Publier maintenant »."
                }
              />
              <div className="mt-5">
                <Label htmlFor="publishAt">Replanifier au</Label>
                <div className="flex flex-wrap gap-2">
                  <div className="min-w-0 flex-[1_1_10rem]">
                    <Input
                      id="publishAt"
                      type="date"
                      value={publishAt}
                      onChange={(e) => setPublishAt(e.target.value)}
                      className={INPUT}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    disabled={busy || !publishAt}
                    loading={busy && running === "date"}
                    onClick={() => run("date", "publication", () => rescheduleArticle(article.id, publishAt), "Article replanifié.")}
                  >
                    Replanifier
                  </Button>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ds-ink-200 pt-5">
                <Button
                  variant="secondary"
                  disabled={busy}
                  loading={busy && running === "publier"}
                  icon={<Send size={18} aria-hidden />}
                  onClick={() => run("publier", "publication", () => publishArticleNow(article.id), "Article publié !")}
                >
                  Publier maintenant
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy || article.status === "withdrawn"}
                  loading={busy && running === "refuser"}
                  icon={<EyeOff size={16} aria-hidden />}
                  onClick={() =>
                    run("refuser", "publication", () => withdrawArticle(article.id), "Article refusé — il ne sera pas publié.")
                  }
                >
                  Refuser l&apos;article
                </Button>
              </div>
              {zone === "publication" && (error || message) ? <div className="mt-4">{feedback("publication")}</div> : null}
            </Card>
          ) : (
            <Card>
              <CardHeader
                icon={CircleCheck}
                title="Article en ligne"
                description={`Publié le ${
                  article.publishedAt
                    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(article.publishedAt))
                    : ""
                }`}
              />
              <div className="mt-5">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  loading={busy && running === "retirer"}
                  icon={<EyeOff size={16} aria-hidden />}
                  onClick={() =>
                    run(
                      "retirer",
                      "publication",
                      () => withdrawArticle(article.id),
                      ownSite ? "Article retiré du site Harmony." : "Article retiré du site.",
                    )
                  }
                >
                  {ownSite ? "Retirer du site Harmony" : "Retirer du site"}
                </Button>
              </div>
              {zone === "publication" && (error || message) ? <div className="mt-4">{feedback("publication")}</div> : null}
            </Card>
          )}

          {ownSite ? (
            <Card variant="tinted">
              <CardHeader
                icon={Globe}
                title="Publier sur votre propre site"
                description="Cet article paraît sur le blog de votre site Harmony. Copiez-le, puis collez-le dans l'éditeur de votre propre site."
              />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  loading={exporter.copying}
                  icon={exporter.copied ? <CopyCheck size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
                  onClick={exporter.copy}
                >
                  {exporter.copied ? "Article copié" : "Copier l'article"}
                </Button>
                {imageUrl ? (
                  <Button
                    type="button"
                    variant="secondary"
                    loading={exporter.savingImage}
                    icon={<Download size={18} aria-hidden />}
                    onClick={() => exporter.saveImage(imageUrl, title)}
                  >
                    Télécharger l&apos;image
                  </Button>
                ) : null}
              </div>
              <ArticleExportMessage notice={exporter.notice} className="mt-3" />
            </Card>
          ) : null}
        </div>
      </div>
    </Stagger>
  );
}
