"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Clock, Copy, CopyCheck, Download, ExternalLink, Pencil, Tag, TriangleAlert, X } from "lucide-react";
import { Modal } from "@theralys/ui";
import { AiBadge, Badge, Button, LinkButton } from "@/components/ds";
import type { CalendarItem } from "@/lib/data";
import { getArticleCopySource, getArticleViewUrl } from "../actions";
import { ArticleExportMessage, useArticleExport } from "./article-export";
import { ArticleStatusPill } from "./article-status";

const STATUS_LABEL: Record<CalendarItem["status"], (d: string) => string> = {
  published: (d) => `Publié le ${d}`,
  draft: (d) => `Brouillon — prévu le ${d}`,
  scheduled: (d) => `Planifié le ${d}`,
  planned: (d) => `Planifié le ${d}`,
  withdrawn: (d) => `Retiré (prévu le ${d})`,
};

type ModalItem = CalendarItem & { motifTitle?: string; readingTimeMin?: number; imageUrl?: string | null };

export function ArticleModal({
  item,
  ownSite = false,
  onClose,
}: {
  item: ModalItem | null;
  /**
   * Le site du client est la référence des outils : l'article paraît sur le
   * blog du site Harmony et le praticien le reprend chez lui (copie du texte,
   * téléchargement de l'image).
   */
  ownSite?: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!item) return null;

  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${item.date}T00:00:00Z`));
  const isArticle = item.kind === "article";

  function openOnSite() {
    if (!item?.articleId) return;
    setError(null);
    startTransition(async () => {
      try {
        const { url } = await getArticleViewUrl(item.articleId!);
        window.open(url, "_blank", "noopener");
      } catch {
        setError("Impossible d'ouvrir l'article.");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title={item.title} size="lg" plain>
      <div data-ds-section="publications" className="relative ds-fade-in">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-3 right-3 z-10 grid size-11 place-items-center rounded-full bg-white text-ds-ink-700 shadow-ds-card ds-focus ds-press hover:bg-ds-ink-100"
        >
          <X size={20} aria-hidden />
        </button>

        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="h-44 w-full rounded-t-3xl object-cover sm:h-64" />
        ) : (
          // Pas encore d'image : un bandeau à la teinte de la section, jamais une image d'exemple
          <div className="relative h-24 overflow-hidden rounded-t-3xl bg-ds-section-soft">
            <span aria-hidden className="ds-band-art" />
          </div>
        )}

        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <ArticleStatusPill status={item.status}>{STATUS_LABEL[item.status](dateLabel)}</ArticleStatusPill>
            {item.aiGenerated ? <AiBadge>{isArticle ? "Rédigé par l'IA" : "Sera rédigé par l'IA"}</AiBadge> : null}
          </div>
          <h2 className="mt-3 font-ds-display text-2xl/8 font-bold text-ds-ink-900 text-balance">{item.title}</h2>
          {isArticle ? (
            <p className="mt-2.5 flex flex-wrap items-center gap-2">
              {item.motifTitle ? (
                <Badge tone="section" icon={Tag}>
                  {item.motifTitle}
                </Badge>
              ) : null}
              <Badge icon={Clock}>{item.readingTimeMin ?? 3} min de lecture</Badge>
            </p>
          ) : (
            <div className="mt-4 flex items-start gap-3.5 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70">
              <CalendarClock size={22} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
              <p className="text-base text-ds-ink-700 text-pretty">
                {item.motifTitle ? (
                  <>
                    <strong className="font-semibold text-ds-ink-900">{item.motifTitle}.</strong>{" "}
                  </>
                ) : null}
                Notre IA rédigera cet article 7 jours avant sa date de publication. Vous pourrez le relire, le modifier ou le
                refuser avant sa mise en ligne.
              </p>
            </div>
          )}

          {isArticle ? (
            <>
              {ownSite && item.articleId ? (
                // `key` : l'état de la copie repart de zéro à chaque article
                <OwnSiteActions key={item.articleId} articleId={item.articleId} title={item.title} imageUrl={item.imageUrl ?? null} />
              ) : null}
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Button
                  // Un seul bouton principal : la copie quand le praticien publie chez lui, la lecture sinon
                  variant={ownSite ? "secondary" : "primary"}
                  loading={pending}
                  iconRight={<ExternalLink size={18} aria-hidden />}
                  onClick={openOnSite}
                >
                  {ownSite ? "Voir sur le site Harmony" : "Voir sur le site"}
                </Button>
                <LinkButton href={`/publications/${item.articleId}`} variant="secondary" icon={<Pencil size={18} aria-hidden />}>
                  Modifier l&apos;article
                </LinkButton>
              </div>
            </>
          ) : null}
          {error ? (
            <p role="alert" className="mt-4 flex items-start gap-2 text-ds-body font-medium text-ds-danger-700">
              <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/**
 * « Copier l'article » et « Télécharger l'image », en tête des actions d'un
 * article quand le praticien le publie sur son propre site. Le texte de
 * l'article n'est lu qu'au clic (le calendrier ne le porte pas).
 */
function OwnSiteActions({ articleId, title, imageUrl }: { articleId: string; title: string; imageUrl: string | null }) {
  const { copy, copying, copied, saveImage, savingImage, notice } = useArticleExport(() => getArticleCopySource(articleId));
  return (
    <div className="mt-5 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70">
      <h3 className="font-ds-display text-lg/7 font-bold text-ds-section-ink">Publier sur votre propre site</h3>
      <p className="mt-1 text-ds-body text-ds-ink-700 text-pretty">
        Cet article paraît sur le blog de votre site Harmony. Copiez-le, puis collez-le dans l&apos;éditeur de votre propre
        site.
      </p>
      <div className="mt-3.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          loading={copying}
          icon={copied ? <CopyCheck size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
          onClick={copy}
        >
          {copied ? "Article copié" : "Copier l'article"}
        </Button>
        {imageUrl ? (
          <Button
            variant="secondary"
            loading={savingImage}
            icon={<Download size={18} aria-hidden />}
            onClick={() => saveImage(imageUrl, title)}
          >
            Télécharger l&apos;image
          </Button>
        ) : null}
      </div>
      <ArticleExportMessage notice={notice} className="mt-3" />
    </div>
  );
}
