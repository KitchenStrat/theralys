"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Modal, Spinner } from "@theralys/ui";
import type { CalendarItem } from "@/lib/data";
import { getArticleCopySource, getArticleViewUrl } from "../actions";
import { ArticleExportMessage, useArticleExport } from "./article-export";

const STATUS_BADGE: Record<
  CalendarItem["status"],
  { label: (d: string) => string; tone: "success" | "info" | "warning" | "neutral" }
> = {
  published: { label: (d) => `Publié le ${d}`, tone: "success" },
  draft: { label: (d) => `Brouillon — prévu le ${d}`, tone: "success" },
  scheduled: { label: (d) => `Planifié le ${d}`, tone: "info" },
  planned: { label: (d) => `Planifié le ${d}`, tone: "info" },
  withdrawn: { label: (d) => `Retiré (prévu le ${d})`, tone: "warning" },
};

type ModalItem = CalendarItem & { motifTitle?: string; readingTimeMin?: number; imageUrl?: string | null };

const ROW = "flex w-full items-center justify-between py-3.5 text-left text-sm font-medium hover:text-primary-600";

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
  const badge = STATUS_BADGE[item.status];

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
    <Modal open onClose={onClose} title=" " wide>
      <div className="-mt-6">
        <Badge tone={badge.tone}>{badge.label(dateLabel)}</Badge>
        <h2 className="mt-3 text-xl font-bold leading-snug">{item.title}</h2>
        {item.kind === "article" ? (
          <p className="mt-1 text-sm text-ink-500">
            {item.motifTitle ? `${item.motifTitle} · ` : ""}
            {item.readingTimeMin ?? 3} min
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-500">
            Notre IA rédigera cet article 7 jours avant sa date de publication. Vous pourrez le
            relire, le modifier ou le refuser avant sa mise en ligne.
          </p>
        )}

        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            className="mt-4 aspect-[16/9] w-full rounded-2xl object-cover"
          />
        ) : null}

        {item.kind === "article" ? (
          <div className="mt-5 divide-y divide-cream-200 border-t border-cream-200">
            {ownSite && item.articleId ? (
              // `key` : l'état de la copie repart de zéro à chaque article
              <OwnSiteRows key={item.articleId} articleId={item.articleId} title={item.title} imageUrl={item.imageUrl ?? null} />
            ) : null}
            <button
              type="button"
              onClick={openOnSite}
              disabled={pending}
              className={ROW}
            >
              {ownSite ? "Voir sur le site Harmony" : "Voir sur le site"} {pending ? <Spinner /> : <span aria-hidden>↗</span>}
            </button>
            <Link
              href={`/publications/${item.articleId}`}
              className="flex w-full items-center justify-between py-3.5 text-sm font-medium hover:text-primary-600"
            >
              Modifier l&apos;article <span aria-hidden>✎</span>
            </Link>
          </div>
        ) : null}
        {error ? <p className="mt-2 text-sm text-danger-500">{error}</p> : null}
      </div>
    </Modal>
  );
}

/**
 * « Copier l'article » et « Télécharger l'image », en tête des actions d'un
 * article quand le praticien le publie sur son propre site. Le texte de
 * l'article n'est lu qu'au clic (le calendrier ne le porte pas).
 */
function OwnSiteRows({ articleId, title, imageUrl }: { articleId: string; title: string; imageUrl: string | null }) {
  const { copy, copying, copied, saveImage, savingImage, notice } = useArticleExport(() => getArticleCopySource(articleId));
  return (
    <>
      <button type="button" onClick={copy} disabled={copying} className={ROW}>
        {copied ? "Article copié" : "Copier l'article"} {copying ? <Spinner /> : <span aria-hidden>{copied ? "✓" : "⧉"}</span>}
      </button>
      {imageUrl ? (
        <button type="button" onClick={() => saveImage(imageUrl, title)} disabled={savingImage} className={ROW}>
          Télécharger l&apos;image {savingImage ? <Spinner /> : <span aria-hidden>⇩</span>}
        </button>
      ) : null}
      {notice ? (
        <div className="py-3">
          <ArticleExportMessage notice={notice} />
        </div>
      ) : null}
    </>
  );
}
