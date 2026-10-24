"use client";

import { Badge, Modal } from "@theralys/ui";
import { formatDayFr } from "@/lib/calendar";
import type { SocialCalendarItem } from "@/lib/social/data";

export const FORMAT_LABEL: Record<SocialCalendarItem["format"], string> = {
  static: "Statique",
  carousel: "Carrousel",
  story: "Story",
};

/** Glyphe du format dans les puces du calendrier (« 1 », « ≡ », « ▯ »). */
export const FORMAT_GLYPH: Record<SocialCalendarItem["format"], string> = {
  static: "1",
  carousel: "≡",
  story: "▯",
};

/** Statut affiché : « Publié » / « Téléchargé » / « À télécharger ». */
export function statusOf(item: SocialCalendarItem): {
  label: string;
  tone: "success" | "info";
} {
  if (item.status === "published") return { label: "Publié", tone: "success" };
  if (item.downloadedAt) return { label: "Téléchargé", tone: "info" };
  return { label: "À télécharger", tone: "info" };
}

/** Nom accessible d'un contenu : « Carrousel — Un exercice simple (sur mesure) ». */
export function itemLabel(item: SocialCalendarItem): string {
  return `${FORMAT_LABEL[item.format]} — ${item.topic}${item.source === "request" ? " (sur mesure)" : ""}`;
}

/**
 * Journée à plus de 3 contenus : liste cliquable (format, sujet, statut) ;
 * le détail s'ouvre ensuite avec « ← Retour à la journée ».
 */
export function DayModal({
  date,
  items,
  onClose,
  onSelect,
}: {
  date: string | null;
  items: SocialCalendarItem[];
  onClose: () => void;
  onSelect: (item: SocialCalendarItem) => void;
}) {
  if (!date) return null;
  return (
    <Modal open onClose={onClose} title={`Contenus du ${formatDayFr(date, "long")}`} size="lg">
      <ul className="divide-y divide-cream-200">
        {items.map((item) => {
          const status = statusOf(item);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                aria-label={`${itemLabel(item)} — ${status.label}`}
                className="flex w-full items-center gap-3 py-3 text-left hover:text-primary-600"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-ink-900/15"
                  style={{ backgroundColor: item.accentColor }}
                />
                <Badge tone="neutral">{FORMAT_LABEL[item.format]}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">
                  {item.source === "request" ? (
                    <span className="mr-1 text-primary-600" aria-hidden>
                      ✦
                    </span>
                  ) : null}
                  {item.topic}
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
