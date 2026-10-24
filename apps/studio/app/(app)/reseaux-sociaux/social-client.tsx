"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { clsx } from "clsx";
import { Badge, Button, Card, FieldHint, Spinner } from "@theralys/ui";
import { WEEKDAYS, buildMonthGrid, formatDayFr, monthLabelFr, shiftMonthParam } from "@/lib/calendar";
import type { SocialCalendarItem, SocialMonthState, SocialRequestUsage } from "@/lib/social/data";
import type { SocialSwatch } from "@/lib/social/render/theme";
import { planSocialMonth } from "./actions";
import { DayModal, FORMAT_GLYPH, itemLabel, statusOf } from "./day-modal";
import { RequestBar } from "./request-bar";
import { SocialPostModal } from "./social-post-modal";

/** Puces affichées par jour avant « +N autres ». */
const CHIP_MAX = 3;
/** Au-delà, la liste des contenus de la carte A défile. */
const LIST_SCROLL_FROM = 8;
const WAITING_MESSAGES = [
  "Lecture de votre site…",
  "Rédaction des légendes…",
  "Mise en page dans vos couleurs…",
  "Encore quelques secondes…",
];

export function SocialClient({
  year,
  month,
  items,
  state,
  usage,
  swatches,
  siteName,
  todayIso,
  requestDates,
}: {
  year: number;
  month: number;
  items: SocialCalendarItem[];
  state: SocialMonthState;
  usage: SocialRequestUsage;
  swatches: SocialSwatch[];
  siteName: string;
  /** Jour civil Europe/Paris */
  todayIso: string;
  requestDates: { default: string; min: string; max: string };
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [fromDay, setFromDay] = useState<string | null>(null);
  // Contenu créé par la barre : la modale s'ouvre dès qu'il apparaît dans `items`
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);

  const monthParam = `${year}-${String(month).padStart(2, "0")}`;
  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const byDate = useMemo(() => {
    const map = new Map<string, SocialCalendarItem[]>();
    for (const item of items) map.set(item.date, [...(map.get(item.date) ?? []), item]);
    return map;
  }, [items]);
  const selected = useMemo(
    () => (selectedId ? (items.find((i) => i.id === selectedId) ?? null) : null),
    [items, selectedId],
  );

  useEffect(() => {
    if (pendingOpenId && items.some((i) => i.id === pendingOpenId)) {
      setSelectedId(pendingOpenId);
      setPendingOpenId(null);
    }
  }, [items, pendingOpenId]);

  const isPast = monthParam < todayIso.slice(0, 7);
  const isCurrent = monthParam === todayIso.slice(0, 7);
  // Mois au-delà de l'horizon des demandes et des planifications
  const tooFar = `${monthParam}-01` > requestDates.max;

  function openFromDay(item: SocialCalendarItem) {
    setFromDay(dayOpen);
    setDayOpen(null);
    setSelectedId(item.id);
  }

  function openItem(item: SocialCalendarItem) {
    setFromDay(null);
    setSelectedId(item.id);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">Réseaux sociaux</h1>
        <div className="flex items-center gap-4">
          <Link
            href={`/reseaux-sociaux?mois=${shiftMonthParam(year, month, -1)}`}
            aria-label="Mois précédent"
            className="rounded-full p-2 hover:bg-cream-200"
          >
            ◀
          </Link>
          <span className="min-w-32 text-center text-lg font-semibold capitalize">
            {monthLabelFr(year, month)}
          </span>
          <Link
            href={`/reseaux-sociaux?mois=${shiftMonthParam(year, month, 1)}`}
            aria-label="Mois suivant"
            className="rounded-full p-2 hover:bg-cream-200"
          >
            ▶
          </Link>
        </div>
        <QuotaBadge usage={usage} />
      </div>

      {/* grid-cols-1 = minmax(0,1fr) : la liste en nowrap de la carte A ne doit pas élargir la colonne sur mobile */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MonthCard
          monthParam={monthParam}
          state={state}
          items={items}
          isPast={isPast}
          isCurrent={isCurrent}
          tooFar={tooFar}
          nextMonthParam={shiftMonthParam(year, month, 1)}
          siteName={siteName}
          onSelect={openItem}
        />
        <RequestBar
          key={monthParam}
          swatches={swatches}
          usage={usage}
          dates={requestDates}
          monthParam={monthParam}
          todayIso={todayIso}
          onCreated={(postId) => setPendingOpenId(postId)}
        />
      </div>

      <div className="mt-8 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-info-500">
        {WEEKDAYS.map((d, i) => (
          <span key={d} className={clsx(i >= 5 && "text-ink-500")}>
            {d}
          </span>
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
                  onSelect={openItem}
                  onMore={() => setDayOpen(day)}
                />
              ),
            )}
          </div>
        ))}
      </div>

      {isPast && items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">Aucun contenu ce mois-ci.</p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-4 text-xs text-ink-500">
        <p>
          Harmony ne publie pas à votre place : téléchargez le visuel, collez la légende, et
          marquez le contenu comme publié.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <LegendSwatch className="border border-dashed border-info-500" label="À télécharger" />
          <LegendSwatch className="border border-solid border-info-500" label="Téléchargé" />
          <LegendSwatch className="border border-solid border-success-500" label="Publié" />
          <span className="inline-flex items-center gap-1">
            <span className="font-semibold text-primary-600">✦</span> Sur mesure
          </span>
        </div>
      </div>

      <DayModal
        date={dayOpen}
        items={dayOpen ? (byDate.get(dayOpen) ?? []) : []}
        onClose={() => setDayOpen(null)}
        onSelect={openFromDay}
      />
      <SocialPostModal
        item={selected}
        todayIso={todayIso}
        onClose={() => {
          setSelectedId(null);
          setFromDay(null);
        }}
        onBack={
          fromDay
            ? () => {
                setSelectedId(null);
                setDayOpen(fromDay);
                setFromDay(null);
              }
            : undefined
        }
      />
    </div>
  );
}

function QuotaBadge({ usage }: { usage: SocialRequestUsage }) {
  if (usage.remaining === 0) return <Badge tone="danger">Quota atteint</Badge>;
  return (
    <Badge tone={usage.remaining <= 3 ? "warning" : "primary"}>
      {usage.remaining} demande{usage.remaining > 1 ? "s" : ""} restante
      {usage.remaining > 1 ? "s" : ""}
    </Badge>
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

/** « 3 téléchargés · 1 publié · 4 à télécharger » */
function progressLine(state: SocialMonthState): string {
  return `${plural(state.downloaded, "téléchargé")} · ${plural(state.published, "publié")} · ${state.toDownload} à télécharger`;
}

/** Carte A — « Vos contenus du mois » : états exclusifs (§6.2) + liste des contenus. */
function MonthCard({
  monthParam,
  state,
  items,
  isPast,
  isCurrent,
  tooFar,
  nextMonthParam,
  siteName,
  onSelect,
}: {
  monthParam: string;
  state: SocialMonthState;
  items: SocialCalendarItem[];
  isPast: boolean;
  isCurrent: boolean;
  tooFar: boolean;
  nextMonthParam: string;
  siteName: string;
  onSelect: (item: SocialCalendarItem) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [waitIndex, setWaitIndex] = useState(0);

  useEffect(() => {
    if (!pending) return;
    setWaitIndex(0);
    const id = setInterval(() => setWaitIndex((i) => (i + 1) % WAITING_MESSAGES.length), 8000);
    return () => clearInterval(id);
  }, [pending]);

  function plan() {
    setError(null);
    startTransition(async () => {
      const result = await planSocialMonth({ month: monthParam });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const free = state.freeSlots.length;
  const prepared = state.calendarCount > 0;
  const canPlan = free > 0 && !tooFar;
  let body: ReactNode;

  if (isPast) {
    body = <p className="mt-2 text-sm text-ink-500">Historique de vos contenus.</p>;
  } else if (tooFar && !prepared) {
    body = (
      <p className="mt-2 text-sm text-ink-700">
        Ce mois est encore loin — vous pourrez le préparer 4 mois à l&apos;avance.
      </p>
    );
  } else if (isCurrent && state.slots.length < 2 && !prepared) {
    body = (
      <p className="mt-2 text-sm text-ink-700">
        Ce mois touche à sa fin —{" "}
        <Link href={`/reseaux-sociaux?mois=${nextMonthParam}`} className="font-medium text-primary-600 hover:underline">
          préparez plutôt le mois prochain →
        </Link>
      </p>
    );
  } else if (canPlan && !prepared) {
    body = (
      <>
        <p className="mt-2 font-medium text-ink-900">Préparez votre mois en un clic</p>
        <p className="mt-1 text-sm text-ink-500">
          Harmony lit votre site — vos spécialités, votre page À propos, vos articles — et prépare{" "}
          {free} contenus prêts à poster, dans vos couleurs. Vous n&apos;avez plus qu&apos;à
          télécharger et coller la légende.
        </p>
        <div className="mt-4">
          <Button onClick={plan} disabled={pending}>
            {pending ? <Spinner className="text-white" /> : null} Préparer mon mois de contenus
          </Button>
          <FieldHint>Environ une minute.</FieldHint>
        </div>
      </>
    );
  } else if (canPlan) {
    body = (
      <>
        <p className="mt-2 text-sm text-ink-700">
          {plural(state.calendarCount, "contenu")} déjà prêt{state.calendarCount > 1 ? "s" : ""} ·{" "}
          {progressLine(state)}
        </p>
        <div className="mt-4">
          <Button variant="secondary" onClick={plan} disabled={pending}>
            {pending ? <Spinner /> : null} Compléter le mois ({plural(free, "contenu")} manquant
            {free > 1 ? "s" : ""})
          </Button>
        </div>
      </>
    );
  } else if (prepared) {
    body = (
      <>
        <p className="mt-2 font-medium text-ink-900">
          Votre mois est prêt : {plural(state.calendarCount, "contenu")}
          {state.requestCount > 0 ? ` + ${state.requestCount} sur mesure` : ""}
        </p>
        <p className="mt-1 text-sm text-ink-500">{progressLine(state)}</p>
      </>
    );
  } else {
    body = (
      <p className="mt-2 text-sm text-ink-700">
        Ce mois touche à sa fin —{" "}
        <Link href={`/reseaux-sociaux?mois=${nextMonthParam}`} className="font-medium text-primary-600 hover:underline">
          préparez plutôt le mois prochain →
        </Link>
      </p>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Vos contenus du mois</h2>
      <p className="text-xs text-ink-500">{siteName}</p>
      {body}
      {pending ? (
        <p className="mt-3 text-sm text-ink-700" aria-live="polite">
          {WAITING_MESSAGES[waitIndex]} <span className="text-ink-500">Ne fermez pas la page.</span>
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger-500" role="alert">
          {error}
        </p>
      ) : null}
      <MonthList items={items} onSelect={onSelect} />
    </Card>
  );
}

/** Liste compacte des contenus du mois (date, format, sujet, statut) ; défilable au-delà de 8. */
function MonthList({
  items,
  onSelect,
}: {
  items: SocialCalendarItem[];
  onSelect: (item: SocialCalendarItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label="Contenus du mois"
      className={clsx(
        "mt-4 divide-y divide-cream-200 border-t border-cream-200 text-sm",
        items.length > LIST_SCROLL_FROM && "max-h-72 overflow-y-auto pr-1",
      )}
    >
      {items.map((item) => {
        const status = statusOf(item);
        return (
          <li key={item.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect(item)}
              aria-label={`${formatDayFr(item.date, "day")} — ${itemLabel(item)} — ${status.label}`}
              className="flex w-full min-w-0 items-center gap-2.5 py-2 text-left hover:text-primary-600"
            >
              <span className="w-12 shrink-0 text-xs text-ink-500">{formatDayFr(item.date)}</span>
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-ink-900/15"
                style={{ backgroundColor: item.accentColor }}
              />
              <span
                aria-hidden
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-cream-200 text-[10px] font-bold text-ink-700"
              >
                {FORMAT_GLYPH[item.format]}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink-900">
                {item.source === "request" ? (
                  <span className="text-primary-600" aria-hidden>
                    ✦{" "}
                  </span>
                ) : null}
                {item.topic}
              </span>
              <Badge tone={status.tone} className="shrink-0">
                {status.label}
              </Badge>
            </button>
          </li>
        );
      })}
    </ul>
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
  if (items.length === 0) {
    return (
      <div className="min-h-28 rounded-2xl border border-cream-300 bg-cream-50 p-1.5 text-sm text-ink-500 sm:p-2">
        <DayNumber value={dayNumber} isToday={isToday} />
      </div>
    );
  }
  const shown = items.length > CHIP_MAX ? items.slice(0, CHIP_MAX - 1) : items;
  const more = items.length - shown.length;
  return (
    <div className="min-h-28 rounded-2xl border border-cream-300 bg-white p-1.5 sm:p-2">
      <DayNumber value={dayNumber} isToday={isToday} />
      <div className="mt-1 space-y-1">
        {shown.map((item) => (
          <Chip key={item.id} item={item} onClick={() => onSelect(item)} />
        ))}
        {more > 0 ? (
          <button
            type="button"
            onClick={onMore}
            aria-label={`${more} autre${more > 1 ? "s" : ""} contenu${more > 1 ? "s" : ""} ce jour`}
            className="w-full rounded-lg px-1 py-1 text-left text-xs font-medium text-primary-600 hover:bg-cream-100 sm:px-1.5"
          >
            +{more}
            <span className="hidden sm:inline"> autre{more > 1 ? "s" : ""}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function chipBorder(item: SocialCalendarItem): string {
  if (item.status === "published") return "border border-solid border-success-500";
  if (item.downloadedAt) return "border border-solid border-info-500";
  return "border border-dashed border-info-500";
}

/**
 * Puce d'un contenu : mobile = pastille et glyphe empilés (cible ≥ 36 px),
 * dès `sm:` = pastille, glyphe et sujet en ligne. Nom accessible complet.
 */
function Chip({ item, onClick }: { item: SocialCalendarItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.topic}
      aria-label={itemLabel(item)}
      className={clsx(
        "flex w-full min-w-0 flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 text-left text-xs leading-snug hover:bg-cream-100",
        "min-h-9 sm:min-h-0 sm:flex-row sm:items-start sm:gap-1.5 sm:px-1.5",
        chipBorder(item),
      )}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-ink-900/15 sm:mt-1"
        style={{ backgroundColor: item.accentColor }}
      />
      <span
        aria-hidden
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-cream-200 text-[10px] font-bold text-ink-700"
      >
        {FORMAT_GLYPH[item.format]}
      </span>
      <span aria-hidden className="hidden min-w-0 flex-1 sm:block">
        <span className="line-clamp-2 font-medium text-ink-900">
          {item.source === "request" ? <span className="text-primary-600">✦ </span> : null}
          {item.topic}
        </span>
      </span>
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
