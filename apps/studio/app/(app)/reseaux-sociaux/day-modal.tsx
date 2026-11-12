"use client";

import { Modal } from "@theralys/ui";
import { formatDayFr } from "@/lib/calendar";
import type { SocialCalendarItem } from "@/lib/social/data";
import { ContentRow, CustomBadge, FORMAT_LABEL, ModalHeader, itemLabel, statusOf } from "./social-ui";

/**
 * Journée à plus de 3 contenus : liste cliquable (format, sujet, statut) ;
 * le détail s'ouvre ensuite avec « Retour à la journée ».
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
  const title = `Contenus du ${formatDayFr(date, "long")}`;
  return (
    <Modal open onClose={onClose} title={title} size="lg" plain>
      <ModalHeader title={title} onClose={onClose}>
        <p className="mt-1 text-ds-body text-ds-ink-700">
          {items.length} contenus sont prévus ce jour-là. Choisissez celui que vous voulez ouvrir.
        </p>
      </ModalHeader>
      <ul className="space-y-1 p-3 sm:px-6 sm:py-5">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <ContentRow
              item={item}
              label={`${itemLabel(item)} — ${statusOf(item).label}`}
              onClick={() => onSelect(item)}
              meta={
                <>
                  <span>
                    {FORMAT_LABEL[item.format]}
                    {item.format === "carousel" ? ` · ${item.slideCount} pages` : ""}
                  </span>
                  {item.source === "request" ? <CustomBadge /> : null}
                </>
              }
            />
          </li>
        ))}
      </ul>
    </Modal>
  );
}
