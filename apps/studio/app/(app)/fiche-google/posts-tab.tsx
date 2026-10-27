"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { clsx } from "clsx";
import { Badge, Button, Card, FieldHint, Input, Label, Spinner } from "@theralys/ui";
import { GOOGLE_POST_REQUESTS_PER_MONTH } from "@theralys/shared";
import { WEEKDAYS, buildMonthGrid, formatDayFr, monthLabelFr, monthNameFr, ofMonthFr, shiftMonthParam } from "@/lib/calendar";
import type { GoogleCalendarItem, GoogleMonthState, GoogleRequestUsage } from "@/lib/google/posts";
import type { SocialSwatch } from "@/lib/social/render/theme";
import { planGoogleMonth, requestGooglePost } from "./actions";
import { GooglePostModal } from "./google-post-modal";
import { tabHref } from "./tabs";

const CHIP_MAX = 3;
const LIST_SCROLL_FROM = 8;
const WAITING_MESSAGES = [
  "Lecture de votre site…",
  "Rédaction des posts…",
  "Mise en page dans vos couleurs…",
  "Encore quelques secondes…",
];

/** Statut affiché : « Publié » / « Téléchargé » / « À publier ». */
export function statusOf(item: GoogleCalendarItem): { label: string; tone: "success" | "info" } {
  if (item.status === "published") return { label: "Publié", tone: "success" };
  if (item.downloadedAt) return { label: "Téléchargé", tone: "info" };
  return { label: "À publier", tone: "info" };
}

export function itemLabel(item: GoogleCalendarItem): string {
  return `Post Google — ${item.topic}${item.source === "request" ? " (sur mesure)" : ""}`;
}

export function PostsTab({
  year,
  month,
  items,
  state,
  usage,
  swatches,
  siteName,
  todayIso,
  requestDates,
  regenRemaining,
}: {
  year: number;
  month: number;
  items: GoogleCalendarItem[];
  state: GoogleMonthState;
  usage: GoogleRequestUsage;
  swatches: SocialSwatch[];
  siteName: string;
  todayIso: string;
  requestDates: { default: string; min: string; max: string };
  /** Régénérations (instructions) restantes ce mois-ci */
  regenRemaining: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);

  const monthParam = `${year}-${String(month).padStart(2, "0")}`;
  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const byDate = useMemo(() => {
    const map = new Map<string, GoogleCalendarItem[]>();
    for (const item of items) map.set(item.date, [...(map.get(item.date) ?? []), item]);
    return map;
  }, [items]);
  const selected = useMemo(() => (selectedId ? (items.find((i) => i.id === selectedId) ?? null) : null), [items, selectedId]);

  useEffect(() => {
    if (pendingOpenId && items.some((i) => i.id === pendingOpenId)) {
      setSelectedId(pendingOpenId);
      setPendingOpenId(null);
    }
  }, [items, pendingOpenId]);

  const isPast = monthParam < todayIso.slice(0, 7);
  const isCurrent = monthParam === todayIso.slice(0, 7);
  const tooFar = `${monthParam}-01` > requestDates.max;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={tabHref("posts", shiftMonthParam(year, month, -1))} aria-label="Mois précédent" className="rounded-full p-2 hover:bg-cream-200">
            ◀
          </Link>
          <span className="min-w-32 text-center text-lg font-semibold capitalize">{monthLabelFr(year, month)}</span>
          <Link href={tabHref("posts", shiftMonthParam(year, month, 1))} aria-label="Mois suivant" className="rounded-full p-2 hover:bg-cream-200">
            ▶
          </Link>
        </div>
        <QuotaBadge usage={usage} />
      </div>

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
          onSelect={(item) => setSelectedId(item.id)}
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
                <CalendarCell key={day} iso={day} isToday={day === todayIso} items={byDate.get(day) ?? []} onSelect={(item) => setSelectedId(item.id)} />
              ),
            )}
          </div>
        ))}
      </div>

      {isPast && items.length === 0 ? <p className="mt-4 text-sm text-ink-500">Aucun post ce mois-ci.</p> : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-4 text-xs text-ink-500">
        <p>Harmony ne publie pas à votre place : copiez le texte, téléchargez le visuel, publiez sur Google puis marquez le post comme publié.</p>
        <div className="flex flex-wrap items-center gap-4">
          <LegendSwatch className="border border-dashed border-info-500" label="À publier" />
          <LegendSwatch className="border border-solid border-info-500" label="Téléchargé" />
          <LegendSwatch className="border border-solid border-success-500" label="Publié" />
          <span className="inline-flex items-center gap-1">
            <span className="font-semibold text-primary-600">✦</span> Sur mesure
          </span>
        </div>
      </div>

      <GooglePostModal item={selected} todayIso={todayIso} regenRemaining={regenRemaining} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function QuotaBadge({ usage }: { usage: GoogleRequestUsage }) {
  if (usage.remaining === 0) return <Badge tone="danger">Quota atteint</Badge>;
  return (
    <Badge tone={usage.remaining <= 3 ? "warning" : "primary"}>
      {usage.remaining} post{usage.remaining > 1 ? "s" : ""} sur mesure restant{usage.remaining > 1 ? "s" : ""}
    </Badge>
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

function progressLine(state: GoogleMonthState): string {
  return `${plural(state.published, "publié")} · ${state.toPublish} à publier`;
}

/** Carte « Vos posts du mois » : états exclusifs (préparer, compléter, prêt, historique) + liste. */
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
  state: GoogleMonthState;
  items: GoogleCalendarItem[];
  isPast: boolean;
  isCurrent: boolean;
  tooFar: boolean;
  nextMonthParam: string;
  siteName: string;
  onSelect: (item: GoogleCalendarItem) => void;
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
      const result = await planGoogleMonth({ month: monthParam });
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
  const nextMonthLink = (
    <Link href={tabHref("posts", nextMonthParam)} className="font-medium text-primary-600 hover:underline">
      préparez plutôt le mois prochain →
    </Link>
  );
  let body: ReactNode;

  if (isPast) {
    body = <p className="mt-2 text-sm text-ink-500">Historique de vos posts.</p>;
  } else if (tooFar && !prepared) {
    body = <p className="mt-2 text-sm text-ink-700">Ce mois est encore loin — vous pourrez le préparer 4 mois à l&apos;avance.</p>;
  } else if (isCurrent && state.slots.length < 1 && !prepared) {
    body = <p className="mt-2 text-sm text-ink-700">Plus de mardi à venir ce mois-ci — {nextMonthLink}</p>;
  } else if (canPlan && !prepared) {
    body = (
      <>
        <p className="mt-2 font-medium text-ink-900">Préparez vos posts Google en un clic</p>
        <p className="mt-1 text-sm text-ink-500">
          Un post par semaine, le mardi : Harmony lit votre site et prépare {plural(free, "post")} avec visuel 4:3, texte et
          bouton d&apos;action. Vous n&apos;avez plus qu&apos;à les publier sur votre fiche.
        </p>
        <div className="mt-4">
          <Button onClick={plan} disabled={pending}>
            {pending ? <Spinner className="text-white" /> : null} Préparer mes posts du mois
          </Button>
          <FieldHint>Environ une minute.</FieldHint>
        </div>
      </>
    );
  } else if (canPlan) {
    body = (
      <>
        <p className="mt-2 text-sm text-ink-700">
          {plural(state.calendarCount, "post")} déjà prêt{state.calendarCount > 1 ? "s" : ""} · {progressLine(state)}
        </p>
        <div className="mt-4">
          <Button variant="secondary" onClick={plan} disabled={pending}>
            {pending ? <Spinner /> : null} Compléter le mois ({plural(free, "post")} manquant{free > 1 ? "s" : ""})
          </Button>
        </div>
      </>
    );
  } else if (prepared) {
    body = (
      <>
        <p className="mt-2 font-medium text-ink-900">
          Votre mois est prêt : {plural(state.calendarCount, "post")}
          {state.requestCount > 0 ? ` + ${state.requestCount} sur mesure` : ""}
        </p>
        <p className="mt-1 text-sm text-ink-500">{progressLine(state)}</p>
      </>
    );
  } else {
    body = <p className="mt-2 text-sm text-ink-700">Ce mois touche à sa fin — {nextMonthLink}</p>;
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Vos posts du mois</h2>
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

function MonthList({ items, onSelect }: { items: GoogleCalendarItem[]; onSelect: (item: GoogleCalendarItem) => void }) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label="Posts du mois"
      className={clsx("mt-4 divide-y divide-cream-200 border-t border-cream-200 text-sm", items.length > LIST_SCROLL_FROM && "max-h-72 overflow-y-auto pr-1")}
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
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-ink-900/15" style={{ backgroundColor: item.accentColor }} />
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

type ColorChoice = "auto" | "other" | `#${string}`;

/** Barre « sur mesure » : sujet, date, couleur (quota GOOGLE_POST_REQUESTS_PER_MONTH). */
function RequestBar({
  swatches,
  usage,
  dates,
  monthParam,
  todayIso,
  onCreated,
}: {
  swatches: SocialSwatch[];
  usage: GoogleRequestUsage;
  dates: { default: string; min: string; max: string };
  monthParam: string;
  todayIso: string;
  onCreated: (postId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [topic, setTopic] = useState("");
  const [choice, setChoice] = useState<ColorChoice>("auto");
  const [customHex, setCustomHex] = useState(swatches[0]?.hex ?? "#6b5bd2");
  const [date, setDate] = useState(dates.default);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ postId: string; date: string } | null>(null);

  const exhausted = usage.remaining === 0;
  const disabled = exhausted || pending;
  const dateOutOfRange = date !== "" && (date < dates.min || date > dates.max);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (dateOutOfRange) return;
    setError(null);
    setCreated(null);
    const accentColor = choice === "auto" ? null : choice === "other" ? customHex : choice;
    const scheduledFor = date;
    startTransition(async () => {
      const result = await requestGooglePost({ topic, accentColor, scheduledFor });
      if (result.error || !result.postId) {
        setError(result.error ?? "La création a échoué — réessayez dans un instant.");
        return;
      }
      setTopic("");
      setCreated({ postId: result.postId, date: scheduledFor });
      router.refresh();
      onCreated(result.postId);
    });
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
          ✦
        </span>
        <h2 className="text-xl font-semibold">Demander un post sur mesure</h2>
      </div>
      <p className="mt-1 text-sm text-ink-500">Une actualité, une spécialité, une info pratique : Harmony prépare le post à partir de votre site.</p>

      {exhausted ? (
        <p className="mt-4 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
          Vous avez utilisé vos {GOOGLE_POST_REQUESTS_PER_MONTH} posts sur mesure {ofMonthFr(todayIso)}. Ils se renouvellent le 1er{" "}
          {monthNameFr(usage.resetsOn)}. Vos posts du calendrier restent disponibles.
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="google-post-topic">Sur quel sujet ? *</Label>
          <Input
            id="google-post-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ex. : nouveaux créneaux le samedi, une idée reçue sur la sophrologie…"
            maxLength={200}
            required
            minLength={3}
            disabled={disabled}
          />
          <FieldHint>Plus c&apos;est précis, mieux c&apos;est.</FieldHint>
        </div>

        <div>
          <Label htmlFor="google-post-date">Pour quel jour ?</Label>
          <Input
            id="google-post-date"
            type="date"
            value={date}
            min={dates.min}
            max={dates.max}
            onChange={(e) => setDate(e.target.value)}
            required
            disabled={disabled}
            aria-invalid={dateOutOfRange || undefined}
            aria-describedby="google-post-date-hint"
          />
          <p id="google-post-date-hint" className={clsx("mt-1 text-xs", dateOutOfRange ? "text-danger-500" : "text-ink-500")}>
            {dateOutOfRange
              ? `Choisissez une date entre le ${formatDayFr(dates.min, "day")} et le ${formatDayFr(dates.max, "day")}.`
              : "Vous pourrez le changer ensuite."}
          </p>
        </div>

        <div>
          <fieldset disabled={disabled}>
            <legend className="mb-1 block text-sm font-medium text-ink-700">Couleur dominante</legend>
            <div className="flex flex-wrap items-center gap-2">
              <ColorOption label="Automatique" value="auto" checked={choice === "auto"} onSelect={() => setChoice("auto")} hatched />
              {swatches.map((swatch) => (
                <ColorOption
                  key={swatch.label}
                  label={swatch.label}
                  value={swatch.hex}
                  hex={swatch.hex}
                  checked={choice === swatch.hex}
                  onSelect={() => setChoice(swatch.hex as `#${string}`)}
                />
              ))}
              <ColorOption label="Autre" value="other" checked={choice === "other"} onSelect={() => setChoice("other")} text />
            </div>
          </fieldset>
          {choice === "other" ? (
            <div className="mt-2 flex items-center gap-2">
              <Label htmlFor="google-post-color-custom" className="mb-0">
                Couleur personnalisée
              </Label>
              <input
                id="google-post-color-custom"
                type="color"
                value={customHex}
                onChange={(e) => setCustomHex(e.target.value)}
                disabled={disabled}
                className="h-8 w-12 cursor-pointer rounded-lg border border-ink-300 bg-white p-0.5"
              />
            </div>
          ) : null}
        </div>

        <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={disabled || dateOutOfRange || topic.trim().length < 3}>
            {pending ? (
              <>
                <Spinner className="text-white" /> Création en cours… (10 à 30 secondes)
              </>
            ) : (
              "Créer ce post"
            )}
          </Button>
          {!exhausted ? (
            <p className="text-sm text-ink-500">
              Il vous reste <strong>{usage.remaining}</strong> post{usage.remaining > 1 ? "s" : ""} sur mesure ce mois-ci.
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="sm:col-span-2 text-sm text-danger-500" role="alert">
            {error}
          </p>
        ) : null}
        {created && created.date.slice(0, 7) !== monthParam ? (
          <p className="sm:col-span-2 text-sm text-ink-700">
            Votre post est prêt.{" "}
            <Link href={tabHref("posts", created.date.slice(0, 7))} className="font-medium text-primary-600 hover:underline">
              Voir le {formatDayFr(created.date, "day")} →
            </Link>
          </p>
        ) : null}
      </form>
    </Card>
  );
}

/** Pastille de couleur : vrai bouton radio (clavier, lecteur d'écran) rendu `sr-only` sous une étiquette stylée. */
function ColorOption({
  label,
  value,
  hex,
  checked,
  onSelect,
  hatched,
  text,
}: {
  label: string;
  value: string;
  hex?: string;
  checked: boolean;
  onSelect: () => void;
  hatched?: boolean;
  text?: boolean;
}) {
  return (
    <label
      title={label}
      className={clsx(
        "relative flex cursor-pointer items-center justify-center rounded-full border border-cream-300 transition-shadow",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-500",
        text ? "h-8 px-3 text-sm font-medium text-ink-700" : "h-8 w-8",
        checked && "ring-2 ring-primary-400 ring-offset-1",
      )}
      style={hex ? { backgroundColor: hex } : hatched ? { backgroundImage: "repeating-linear-gradient(135deg, #d3e3ef 0 3px, #ffffff 3px 7px)" } : undefined}
    >
      <input type="radio" name="google-post-color" value={value} checked={checked} onChange={onSelect} className="sr-only" />
      {text ? label : <span className="sr-only">{label}</span>}
    </label>
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
  items: GoogleCalendarItem[];
  onSelect: (item: GoogleCalendarItem) => void;
}) {
  const dayNumber = Number(iso.slice(8, 10));
  if (items.length === 0) {
    return (
      <div className="min-h-24 rounded-2xl border border-cream-300 bg-cream-50 p-1.5 text-sm text-ink-500 sm:p-2">
        <DayNumber value={dayNumber} isToday={isToday} />
      </div>
    );
  }
  const shown = items.slice(0, CHIP_MAX);
  const more = items.length - shown.length;
  return (
    <div className="min-h-24 rounded-2xl border border-cream-300 bg-white p-1.5 sm:p-2">
      <DayNumber value={dayNumber} isToday={isToday} />
      <div className="mt-1 space-y-1">
        {shown.map((item) => (
          <Chip key={item.id} item={item} onClick={() => onSelect(item)} />
        ))}
        {more > 0 ? <p className="px-1 text-xs text-ink-500">+{more}</p> : null}
      </div>
    </div>
  );
}

function chipBorder(item: GoogleCalendarItem): string {
  if (item.status === "published") return "border border-solid border-success-500";
  if (item.downloadedAt) return "border border-solid border-info-500";
  return "border border-dashed border-info-500";
}

function Chip({ item, onClick }: { item: GoogleCalendarItem; onClick: () => void }) {
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
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-ink-900/15 sm:mt-1" style={{ backgroundColor: item.accentColor }} />
      <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-cream-200 text-[10px] font-bold text-info-500">
        G
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
    <span className={clsx("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold", isToday ? "bg-primary-500 text-white" : "text-ink-700")}>
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
