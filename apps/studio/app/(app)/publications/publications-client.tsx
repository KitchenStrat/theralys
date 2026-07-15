"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Button } from "@theralys/ui";
import type { CalendarItem } from "@/lib/data";
import { ArticleModal } from "./article-modal";
import { BlogSettingsModal, type BlogSettingsValue } from "./blog-settings-modal";

const WEEKDAYS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

const STATUS_STYLES: Record<CalendarItem["status"], string> = {
  published: "border-2 border-solid border-success-500 bg-white",
  draft: "border-2 border-dashed border-success-500 bg-white",
  scheduled: "border-2 border-dashed border-info-500 bg-white",
  planned: "border-2 border-dashed border-info-500 bg-white",
  withdrawn: "border-2 border-dashed border-warning-500 bg-white",
};

export function PublicationsClient({
  year,
  month,
  items,
  settings,
}: {
  year: number;
  month: number;
  items: CalendarItem[];
  settings: BlogSettingsValue | null;
}) {
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const monthLabel = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      map.set(item.date, [...(map.get(item.date) ?? []), item]);
    }
    return map;
  }, [items]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Publications</h1>
        <div className="flex items-center gap-4">
          <Link href={`/publications?mois=${prev}`} aria-label="Mois précédent" className="rounded-full p-2 hover:bg-cream-200">◀</Link>
          <span className="min-w-32 text-center text-lg font-semibold capitalize">{monthLabel}</span>
          <Link href={`/publications?mois=${next}`} aria-label="Mois suivant" className="rounded-full p-2 hover:bg-cream-200">▶</Link>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-600">
            ▶ Guide du blog (2 min)
          </span>
          <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)}>
            ⚙ Paramètres
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-info-500">
        {WEEKDAYS.map((d, i) => (
          <span key={d} className={clsx(i >= 5 && "text-ink-500")}>{d}</span>
        ))}
      </div>

      <div className="mt-2 space-y-2">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-2">
            {week.map((day, di) =>
              day === null ? (
                <div key={di} />
              ) : (
                <CalendarCell
                  key={day}
                  iso={day}
                  isToday={day === todayIso}
                  items={byDate.get(day) ?? []}
                  onSelect={setSelected}
                />
              ),
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-4 text-xs text-ink-500">
        <p>
          Notre IA spécialisée rédige chaque article <strong>7 jours avant</strong> sa date de
          publication.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <LegendSwatch className="border-2 border-solid border-success-500" label="Publié" />
          <LegendSwatch className="border-2 border-dashed border-success-500" label="Brouillon" />
          <LegendSwatch className="border-2 border-dashed border-info-500" label="Planifié" />
          <LegendSwatch className="border-2 border-dashed border-warning-500" label="Retiré" />
          <span className="font-semibold text-info-500">IA</span> Rédigé par l&apos;IA
        </div>
      </div>

      <ArticleModal item={selected} onClose={() => setSelected(null)} />
      <BlogSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initial={settings}
      />
    </div>
  );
}

function CalendarCell({
  iso,
  isToday,
  items,
  onSelect,
}: {
  iso: string;
  isToday: boolean;
  items: CalendarItem[];
  onSelect: (item: CalendarItem) => void;
}) {
  const dayNumber = Number(iso.slice(8, 10));
  const item = items[0];

  if (!item) {
    return (
      <div className="min-h-24 rounded-2xl border border-cream-300 bg-cream-50 p-2 text-sm text-ink-500">
        <DayNumber value={dayNumber} isToday={isToday} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={clsx(
        "min-h-24 rounded-2xl p-2 text-left text-sm shadow-sm transition-shadow hover:shadow-md",
        STATUS_STYLES[item.status],
      )}
    >
      <div className="flex items-start justify-between">
        <DayNumber value={dayNumber} isToday={isToday} />
        {item.aiGenerated ? <span className="text-[10px] font-bold text-info-500">IA</span> : null}
      </div>
      <p className="mt-1 line-clamp-3 text-xs font-medium leading-snug text-ink-900">
        {item.title}
      </p>
    </button>
  );
}

function DayNumber({ value, isToday }: { value: number; isToday: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
        isToday ? "bg-primary-500 text-white" : "text-ink-700",
      )}
    >
      {value}
    </span>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("inline-block h-3 w-6 rounded", className)} /> {label}
    </span>
  );
}

/** Grille du mois : semaines lundi→dimanche, null hors du mois. */
function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = (first.getUTCDay() + 6) % 7; // 0 = lundi

  const cells: (string | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
