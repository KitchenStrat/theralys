"use client";

import { clsx } from "clsx";
import { CalendarDays } from "lucide-react";
import { Card, CardHeader } from "@/components/ds";
import { WEEKDAYS, formatDayFr, ofMonthFr } from "@/lib/calendar";
import type { SocialCalendarItem } from "@/lib/social/data";
import {
  CustomIcon,
  FORMAT_LABEL,
  FormatTile,
  STATUS_META,
  itemLabel,
  nbspFr,
  statusOf,
  type ContentStatusKey,
} from "./social-ui";

/** Puces affichées par jour avant « +N autres ». */
const CHIP_MAX = 3;

/** Cadre d'une puce du calendrier selon l'état du contenu : trait, fond et icône — jamais la couleur seule. */
const CHIP_STATUS: Record<ContentStatusKey, { frame: string; icon: string }> = {
  "a-telecharger": { frame: "border-dashed border-ds-warning-700/60 bg-white", icon: "text-ds-warning-700" },
  telecharge: { frame: "border-solid border-ds-brand-300 bg-ds-brand-50", icon: "text-ds-brand-700" },
  publie: { frame: "border-solid border-ds-success-600/50 bg-ds-success-100", icon: "text-ds-success-700" },
};

const STATUS_ORDER: ContentStatusKey[] = ["a-telecharger", "telecharge", "publie"];
const FORMAT_ORDER: SocialCalendarItem["format"][] = ["static", "carousel", "story"];

/**
 * Calendrier du mois, à partir de 640 px (en dessous, la liste du mois en
 * tient lieu) : une case par jour, le jour courant mis en valeur, une puce par
 * contenu. Les puces portent le sujet à partir de 1 280 px ; plus étroites,
 * elles se réduisent à la vignette et à l'icône de statut.
 */
export function CalendarCard({
  monthParam,
  year,
  weeks,
  byDate,
  todayIso,
  onSelect,
  onMore,
}: {
  monthParam: string;
  year: number;
  weeks: (string | null)[][];
  byDate: Map<string, SocialCalendarItem[]>;
  todayIso: string;
  onSelect: (item: SocialCalendarItem) => void;
  onMore: (day: string) => void;
}) {
  return (
    <Card as="section" aria-labelledby="calendrier-titre" className="hidden sm:block">
      <CardHeader
        icon={CalendarDays}
        title={
          <span id="calendrier-titre">
            Calendrier {ofMonthFr(`${monthParam}-01`)} {year}
          </span>
        }
        description="Vos contenus, jour par jour. Cliquez sur l'un d'eux pour l'ouvrir."
      />

      <div
        aria-hidden
        className="mt-5 grid grid-cols-7 gap-1.5 text-center text-ds-meta font-semibold tracking-wide xl:gap-2"
      >
        {WEEKDAYS.map((d, i) => (
          <span key={d} className={i >= 5 ? "text-ds-ink-500" : "text-ds-section-accent"}>
            {d}
          </span>
        ))}
      </div>

      <div className="mt-2 space-y-1.5 xl:space-y-2">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1.5 xl:gap-2">
            {week.map((day, di) =>
              day === null ? (
                <div key={di} />
              ) : (
                <CalendarCell
                  key={day}
                  iso={day}
                  isToday={day === todayIso}
                  items={byDate.get(day) ?? []}
                  onSelect={onSelect}
                  onMore={() => onMore(day)}
                />
              ),
            )}
          </div>
        ))}
      </div>

      <ul
        aria-label="Légende du calendrier"
        className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-ds-ink-200 pt-4 text-ds-meta text-ds-ink-600"
      >
        {FORMAT_ORDER.map((format) => (
          <li key={format} className="inline-flex items-center gap-1.5">
            <FormatTile format={format} size="xs" />
            {FORMAT_LABEL[format]}
          </li>
        ))}
        {STATUS_ORDER.map((key) => {
          const Icon = STATUS_META[key].icon;
          return (
            <li key={key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={clsx("grid size-6 place-items-center rounded-md border", CHIP_STATUS[key].frame)}>
                <Icon size={13} strokeWidth={2.5} className={CHIP_STATUS[key].icon} />
              </span>
              {STATUS_META[key].label}
            </li>
          );
        })}
        <li className="inline-flex items-center gap-1.5">
          <CustomIcon size={15} aria-hidden className="text-ds-section-accent" />
          Sur mesure
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-full bg-ds-section-to inset-ring inset-ring-ds-ink-900/20"
          />
          Couleur dominante du visuel
        </li>
      </ul>
    </Card>
  );
}

function CalendarCell({
  iso,
  isToday,
  items,
  onSelect,
  onMore,
}: {
  iso: string;
  isToday: boolean;
  items: SocialCalendarItem[];
  onSelect: (item: SocialCalendarItem) => void;
  onMore: () => void;
}) {
  const dayNumber = Number(iso.slice(8, 10));
  const shown = items.length > CHIP_MAX ? items.slice(0, CHIP_MAX - 1) : items;
  const more = items.length - shown.length;
  return (
    <div
      className={clsx(
        "min-h-28 min-w-0 rounded-ds-md p-1.5 xl:p-2",
        isToday
          ? "bg-ds-section-tint-2 ring-2 ring-ds-section-accent"
          : items.length > 0
            ? "bg-white shadow-sm ring-1 ring-ds-section-line"
            : "bg-ds-ink-50 ring-1 ring-ds-ink-200/80",
      )}
    >
      <p className="flex items-center gap-1.5">
        <span className="sr-only">
          {isToday ? "Aujourd'hui, " : ""}
          {formatDayFr(iso, "long")}
        </span>
        <span
          aria-hidden
          className={clsx(
            "inline-grid size-7 place-items-center rounded-full text-ds-meta font-semibold ds-tnum",
            isToday ? "bg-ds-section-gradient-deep text-ds-section-on-deep shadow-ds-glow" : "text-ds-ink-700",
          )}
        >
          {dayNumber}
        </span>
        {isToday ? (
          <span aria-hidden className="hidden text-ds-meta font-semibold text-ds-section-ink xl:inline">
            Aujourd&apos;hui
          </span>
        ) : null}
      </p>
      {items.length > 0 ? (
        <div className="mt-1 space-y-1">
          {shown.map((item) => (
            <CalendarChip key={item.id} item={item} onClick={() => onSelect(item)} />
          ))}
          {more > 0 ? (
            <button
              type="button"
              onClick={onMore}
              aria-label={`${more} autre${more > 1 ? "s" : ""} contenu${more > 1 ? "s" : ""} ce jour`}
              className="min-h-9 w-full rounded-ds-sm px-1.5 text-center text-ds-meta font-semibold text-ds-brand-800 ds-focus hover:bg-ds-section-tint-2 pointer-coarse:min-h-11 xl:text-left"
            >
              +{more}
              <span className="hidden xl:inline"> autre{more > 1 ? "s" : ""}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Puce d'un contenu dans le calendrier. Étroite (moins de 1 280 px) : vignette
 * de format et icône de statut empilées, cible de 44 px. Large : vignette, nom
 * du format (à partir de 1 400 px) et icône de statut sur une ligne, sujet sur
 * deux lignes dessous. Nom accessible complet.
 */
function CalendarChip({ item, onClick }: { item: SocialCalendarItem; onClick: () => void }) {
  const status = statusOf(item);
  const StatusIcon = STATUS_META[status.key].icon;
  const look = CHIP_STATUS[status.key];
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.topic}
      aria-label={itemLabel(item)}
      className={clsx(
        "flex min-h-11 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-ds-sm border p-1 text-left ds-focus ds-press hover:border-ds-section-accent",
        "xl:items-stretch xl:justify-start xl:gap-1.5 xl:p-1.5",
        look.frame,
      )}
    >
      <span aria-hidden className="flex flex-col items-center gap-1 xl:flex-row xl:gap-1.5">
        <FormatTile format={item.format} size="xs" accentColor={item.accentColor} />
        {/* Le nom du format n'apparaît que s'il tient en entier ; sinon la vignette suffit, la légende l'explique */}
        <span className="hidden min-w-0 flex-1 truncate text-xs font-medium text-ds-ink-600 min-[1400px]:block">
          {FORMAT_LABEL[item.format]}
        </span>
        <span className="flex shrink-0 items-center gap-1 xl:ml-auto">
          {item.source === "request" ? <CustomIcon size={13} className="text-ds-section-accent xl:hidden" /> : null}
          <StatusIcon size={14} strokeWidth={2.5} className={look.icon} />
        </span>
      </span>
      <span aria-hidden className="hidden xl:block">
        <span className="line-clamp-2 text-ds-meta/[1.125rem] font-medium text-ds-ink-900">
          {item.source === "request" ? (
            <CustomIcon size={13} className="mr-1 inline-block align-[-2px] text-ds-section-accent" />
          ) : null}
          {nbspFr(item.topic)}
        </span>
      </span>
    </button>
  );
}
