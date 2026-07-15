"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Modal, Spinner } from "@theralys/ui";
import type { CalendarItem } from "@/lib/data";
import { getArticleViewUrl } from "../actions";

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

export function ArticleModal({
  item,
  onClose,
}: {
  item: (CalendarItem & { motifTitle?: string; readingTimeMin?: number; imageUrl?: string | null }) | null;
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
            <button
              type="button"
              onClick={openOnSite}
              disabled={pending}
              className="flex w-full items-center justify-between py-3.5 text-left text-sm font-medium hover:text-primary-600"
            >
              Voir sur le site {pending ? <Spinner /> : <span aria-hidden>↗</span>}
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
