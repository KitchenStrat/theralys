"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { clsx } from "clsx";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  Info,
  ListChecks,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { FieldHint, Input, Label } from "@theralys/ui";
import { GOOGLE_POST_REQUESTS_PER_MONTH } from "@theralys/shared";
import { Badge, Button, Card, CardHeader, GenerationProgress, ProgressBar, type TimedStep } from "@/components/ds";
import { WEEKDAYS, buildMonthGrid, formatDayFr, monthLabelFr, monthNameFr, ofMonthFr, shiftMonthParam } from "@/lib/calendar";
import type { GoogleCalendarItem, GoogleMonthState, GoogleRequestUsage } from "@/lib/google/posts";
import type { SocialSwatch } from "@/lib/social/render/theme";
import { planGoogleMonth, requestGooglePost } from "./actions";
import { GooglePostModal } from "./google-post-modal";
import { PostStatusPill, STATUS_ICON, itemLabel, statusOf, type PostStatusKind } from "./post-status";
import { ErrorNote } from "./shared";
import { tabHref } from "./tabs";

const CHIP_MAX = 3;
const LIST_SCROLL_FROM = 8;
/** `?post=<id>` : lien profond vers un post du mois affiché (modale ouverte au chargement). */
const POST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Préparation du mois (environ une minute) : ce qui se fait, dans l'ordre ; la dernière étape dure jusqu'à la réponse du serveur. */
const PLAN_STEPS: TimedStep[] = [
  { label: "Lecture de votre site", seconds: 8 },
  { label: "Rédaction des posts", seconds: 24 },
  { label: "Mise en page dans vos couleurs", seconds: 16, details: ["Un visuel par post", "Encore quelques secondes…"] },
];
/** Création d'un post sur mesure (10 à 30 secondes). */
const REQUEST_STEPS: TimedStep[] = [
  { label: "Lecture de votre site", seconds: 4 },
  { label: "Rédaction du post", seconds: 10 },
  { label: "Mise en page dans vos couleurs", seconds: 8 },
];

/** Ce que la carte « Vos posts du mois » propose, selon le mois affiché (états exclusifs). */
type MonthMode = "past" | "too-far" | "no-slot" | "plan" | "complete" | "ready" | "ending";

function monthMode(state: GoogleMonthState, { isPast, isCurrent, tooFar }: { isPast: boolean; isCurrent: boolean; tooFar: boolean }): MonthMode {
  const prepared = state.calendarCount > 0;
  const canPlan = state.freeSlots.length > 0 && !tooFar;
  if (isPast) return "past";
  if (tooFar && !prepared) return "too-far";
  if (isCurrent && state.slots.length < 1 && !prepared) return "no-slot";
  if (canPlan && !prepared) return "plan";
  if (canPlan) return "complete";
  if (prepared) return "ready";
  return "ending";
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
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Post créé par la barre, ou désigné par `?post=` : la modale s'ouvre dès qu'il figure dans `items`
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(() => {
    const fromUrl = searchParams.get("post");
    return fromUrl && POST_ID_RE.test(fromUrl) ? fromUrl.toLowerCase() : null;
  });
  // Lien profond (e-mail, agenda) vers un post absent du mois affiché : un message, pas une erreur, décidé au chargement
  const [missingDeepLink, setMissingDeepLink] = useState(() => {
    const fromUrl = searchParams.get("post");
    const wanted = fromUrl && POST_ID_RE.test(fromUrl) ? fromUrl.toLowerCase() : null;
    return wanted !== null && !items.some((i) => i.id === wanted);
  });

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
  const mode = monthMode(state, { isPast, isCurrent, tooFar });
  const monthLinkClasses =
    "grid size-11 shrink-0 place-items-center rounded-full bg-white text-ds-brand-800 shadow-sm inset-ring inset-ring-ds-ink-300 ds-focus ds-press hover:bg-ds-brand-50";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-2">
          <Link href={tabHref("posts", shiftMonthParam(year, month, -1))} scroll={false} aria-label="Mois précédent" className={monthLinkClasses}>
            <ChevronLeft size={20} aria-hidden />
          </Link>
          <p className="min-w-40 text-center font-ds-display text-xl/7 font-bold capitalize text-ds-ink-900 sm:min-w-48 sm:text-2xl/8">
            {monthLabelFr(year, month)}
          </p>
          <Link href={tabHref("posts", shiftMonthParam(year, month, 1))} scroll={false} aria-label="Mois suivant" className={monthLinkClasses}>
            <ChevronRight size={20} aria-hidden />
          </Link>
        </div>
        <QuotaBadge usage={usage} />
      </div>

      {missingDeepLink ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-ds-md bg-ds-ink-100 px-4 py-3 text-ds-body text-ds-ink-800"
        >
          <span className="flex min-w-0 items-start gap-2">
            <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-ds-ink-600" />
            Ce contenu n&apos;est plus dans ce mois (reporté ou retiré).
          </span>
          <Button variant="quiet" size="sm" onClick={() => setMissingDeepLink(false)} aria-label="Fermer ce message">
            Fermer
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <MonthCard
          monthParam={monthParam}
          state={state}
          items={items}
          mode={mode}
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
          // Un seul bouton principal par vue : celui de la préparation du mois quand elle est proposée
          primary={mode !== "plan"}
          onCreated={(postId) => setPendingOpenId(postId)}
        />
      </div>

      <Card className="p-3 sm:p-6">
        <CardHeader
          className="max-sm:px-2 max-sm:pt-2"
          icon={CalendarDays}
          title="Calendrier du mois"
          description="Chaque post est placé au jour prévu pour sa publication. Ouvrez-le pour copier son texte et télécharger son visuel."
        />

        <div className="mt-5 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ds-ink-700 sm:gap-2">
          {WEEKDAYS.map((d, i) => (
            <span key={d} className={clsx(i >= 5 && "font-medium text-ds-ink-600")}>
              {d}
            </span>
          ))}
        </div>

        <div className="mt-2 space-y-1 sm:space-y-2">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1 sm:gap-2">
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

        {isPast && items.length === 0 ? <p className="mt-4 px-2 text-ds-body text-ds-ink-600">Aucun post ce mois-ci.</p> : null}

        <div className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-t border-ds-ink-200 px-2 pt-4 sm:px-0">
          <p className="flex min-w-0 flex-[1_1_22rem] items-start gap-2 text-ds-body text-ds-ink-700">
            <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
            Harmony ne publie pas à votre place : copiez le texte, téléchargez le visuel, publiez sur Google puis marquez le post
            comme publié.
          </p>
          <ul className="flex flex-wrap items-center gap-2" aria-label="Légende du calendrier">
            <li>
              <PostStatusPill kind="a-publier" />
            </li>
            <li>
              <PostStatusPill kind="telecharge" />
            </li>
            <li>
              <PostStatusPill kind="publie" />
            </li>
            <li>
              <Badge tone="neutral" icon={Sparkles}>
                Sur mesure
              </Badge>
            </li>
          </ul>
        </div>
      </Card>

      <GooglePostModal item={selected} todayIso={todayIso} regenRemaining={regenRemaining} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function QuotaBadge({ usage }: { usage: GoogleRequestUsage }) {
  if (usage.remaining === 0) {
    return (
      <Badge tone="danger" icon={CircleAlert}>
        Quota atteint
      </Badge>
    );
  }
  return (
    <Badge tone={usage.remaining <= 3 ? "warning" : "section"} icon={usage.remaining <= 3 ? TriangleAlert : Sparkles}>
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
  mode,
  nextMonthParam,
  siteName,
  onSelect,
}: {
  monthParam: string;
  state: GoogleMonthState;
  items: GoogleCalendarItem[];
  mode: MonthMode;
  nextMonthParam: string;
  siteName: string;
  onSelect: (item: GoogleCalendarItem) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
  const total = state.published + state.toPublish;
  const nextMonthLink = (
    <Link
      href={tabHref("posts", nextMonthParam)}
      scroll={false}
      className="inline-flex items-center gap-1 rounded-ds-sm font-semibold text-ds-brand-700 underline ds-focus"
    >
      préparez plutôt le mois prochain
      <ArrowRight size={15} aria-hidden />
    </Link>
  );
  let body: ReactNode;

  if (mode === "past") {
    body = <p className="mt-4 text-ds-body text-ds-ink-600">Historique de vos posts.</p>;
  } else if (mode === "too-far") {
    body = <p className="mt-4 text-ds-body text-ds-ink-700">Ce mois est encore loin — vous pourrez le préparer 4 mois à l&apos;avance.</p>;
  } else if (mode === "no-slot") {
    body = <p className="mt-4 text-ds-body text-ds-ink-700">Plus de mardi à venir ce mois-ci — {nextMonthLink}</p>;
  } else if (mode === "plan") {
    body = (
      <div className="mt-4 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/60 sm:p-5">
        <p className="text-base font-semibold text-ds-section-ink">Préparez vos posts Google en un clic</p>
        <p className="mt-1 text-ds-body text-ds-ink-700">
          Un post par semaine, le mardi : Harmony lit votre site et prépare {plural(free, "post")} avec visuel 4:3, texte et
          bouton d&apos;action. Vous n&apos;avez plus qu&apos;à les publier sur votre fiche.
        </p>
        <div className="mt-4">
          <Button onClick={plan} loading={pending} icon={<Sparkles size={18} aria-hidden />}>
            Préparer mes posts du mois
          </Button>
          {pending ? null : <FieldHint>Environ une minute.</FieldHint>}
        </div>
      </div>
    );
  } else if (mode === "complete") {
    body = (
      <>
        <p className="mt-4 text-ds-body text-ds-ink-700">
          {plural(state.calendarCount, "post")} déjà prêt{state.calendarCount > 1 ? "s" : ""} · {progressLine(state)}
        </p>
        <div className="mt-3">
          <Button variant="secondary" onClick={plan} loading={pending} icon={<Sparkles size={18} aria-hidden />}>
            Compléter le mois ({plural(free, "post")} manquant{free > 1 ? "s" : ""})
          </Button>
        </div>
      </>
    );
  } else if (mode === "ready") {
    body = (
      <div className="mt-4 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/60">
        <p className="flex items-start gap-2 text-base font-semibold text-ds-section-ink">
          <CircleCheckBig size={20} aria-hidden className="mt-0.5 shrink-0 text-ds-success-700" />
          <span>
            Votre mois est prêt : {plural(state.calendarCount, "post")}
            {state.requestCount > 0 ? ` + ${state.requestCount} sur mesure` : ""}
          </span>
        </p>
        <ProgressBar
          className="mt-3 [--ds-progress-track:white]"
          size="sm"
          label={progressLine(state)}
          value={state.published}
          max={Math.max(1, total)}
          valueText={`${state.published} sur ${total}`}
          hideValueText
        />
      </div>
    );
  } else {
    body = <p className="mt-4 text-ds-body text-ds-ink-700">Ce mois touche à sa fin — {nextMonthLink}</p>;
  }

  return (
    <Card>
      <CardHeader icon={ListChecks} title="Vos posts du mois" description={siteName} />
      {body}
      {pending ? (
        <div className="mt-4 rounded-ds-md bg-ds-ink-50 p-4 ring-1 ring-ds-ink-200 sm:p-5">
          <GenerationProgress
            icon={Sparkles}
            title="Nous préparons vos posts du mois"
            steps={PLAN_STEPS}
            running
            estimate="environ une minute"
            hint="Ne fermez pas la page."
          />
        </div>
      ) : null}
      {error ? <ErrorNote className="mt-4">{error}</ErrorNote> : null}
      <MonthList items={items} onSelect={onSelect} />
    </Card>
  );
}

const SHORT_MONTH = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });

function MonthList({ items, onSelect }: { items: GoogleCalendarItem[]; onSelect: (item: GoogleCalendarItem) => void }) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label="Posts du mois"
      className={clsx(
        "mt-5 divide-y divide-ds-ink-200 border-t border-ds-ink-200",
        items.length > LIST_SCROLL_FROM && "max-h-[26rem] overflow-y-auto pr-1",
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
              className="group/post flex w-full min-w-0 items-center gap-3 rounded-ds-sm py-3 text-left ds-focus-inset"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-ds-sm bg-ds-section-tint-2 text-ds-section-ink">
                <span className="text-center leading-none">
                  <span className="block text-lg/none font-bold ds-tnum">{Number(item.date.slice(8, 10))}</span>
                  <span className="mt-1 block text-xs/none font-medium">{SHORT_MONTH.format(new Date(`${item.date}T00:00:00Z`))}</span>
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full ring-1 ring-ds-ink-900/15 ring-inset"
                    style={{ backgroundColor: item.accentColor }}
                  />
                  <span className="min-w-0 truncate text-base font-semibold text-ds-ink-900 group-hover/post:text-ds-brand-700">
                    {item.topic}
                  </span>
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <PostStatusPill kind={status.kind} />
                  {item.source === "request" ? (
                    <Badge tone="neutral" icon={Sparkles}>
                      Sur mesure
                    </Badge>
                  ) : null}
                </span>
              </span>
              <ChevronRight size={18} aria-hidden className="shrink-0 text-ds-ink-400" />
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
  primary,
  onCreated,
}: {
  swatches: SocialSwatch[];
  usage: GoogleRequestUsage;
  dates: { default: string; min: string; max: string };
  monthParam: string;
  todayIso: string;
  /** Le bouton « Créer ce post » est-il l'action principale de la vue ? */
  primary: boolean;
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
    <Card>
      <CardHeader
        icon={Sparkles}
        title="Demander un post sur mesure"
        description="Une actualité, une spécialité, une info pratique : Harmony prépare le post à partir de votre site."
      />

      {exhausted ? (
        <p className="mt-4 flex items-start gap-2.5 rounded-ds-md bg-ds-warning-100 px-4 py-3 text-ds-body text-ds-warning-900">
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            Vous avez utilisé vos {GOOGLE_POST_REQUESTS_PER_MONTH} posts sur mesure {ofMonthFr(todayIso)}. Ils se renouvellent le 1er{" "}
            {monthNameFr(usage.resetsOn)}. Vos posts du calendrier restent disponibles.
          </span>
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
            className="min-h-11"
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
            className="min-h-11"
          />
          <p id="google-post-date-hint" className={clsx("mt-1 text-xs", dateOutOfRange ? "font-medium text-ds-danger-700" : "text-ds-ink-600")}>
            {dateOutOfRange
              ? `Choisissez une date entre le ${formatDayFr(dates.min, "day")} et le ${formatDayFr(dates.max, "day")}.`
              : "Vous pourrez le changer ensuite."}
          </p>
        </div>

        <div>
          <fieldset disabled={disabled}>
            <legend className="mb-1 block text-sm font-medium text-ds-ink-700">Couleur dominante</legend>
            <div className="flex flex-wrap items-center gap-2.5">
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
            <div className="mt-3 flex items-center gap-2.5">
              <Label htmlFor="google-post-color-custom" className="mb-0!">
                Couleur personnalisée
              </Label>
              <input
                id="google-post-color-custom"
                type="color"
                value={customHex}
                onChange={(e) => setCustomHex(e.target.value)}
                disabled={disabled}
                className="h-9 w-14 cursor-pointer rounded-ds-sm border border-ds-ink-450 bg-white p-0.5 pointer-coarse:h-11"
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2">
          <Button
            type="submit"
            variant={primary ? "primary" : "secondary"}
            loading={pending}
            disabled={disabled || dateOutOfRange || topic.trim().length < 3}
            icon={<Sparkles size={18} aria-hidden />}
          >
            {pending ? "Création en cours…" : "Créer ce post"}
          </Button>
          {!exhausted ? (
            <p className="text-ds-body text-ds-ink-600">
              Il vous reste <strong className="font-semibold text-ds-ink-900">{usage.remaining}</strong> post
              {usage.remaining > 1 ? "s" : ""} sur mesure ce mois-ci.
            </p>
          ) : null}
        </div>

        {pending ? (
          <div className="rounded-ds-md bg-ds-ink-50 p-4 ring-1 ring-ds-ink-200 sm:col-span-2 sm:p-5">
            <GenerationProgress
              icon={Sparkles}
              title="Nous préparons votre post"
              steps={REQUEST_STEPS}
              running
              estimate="10 à 30 secondes"
              hint="Il s'ouvrira dès qu'il sera prêt."
            />
          </div>
        ) : null}
        {error ? <ErrorNote className="sm:col-span-2">{error}</ErrorNote> : null}
        {created && created.date.slice(0, 7) !== monthParam ? (
          <p className="text-ds-body text-ds-ink-700 sm:col-span-2">
            Votre post est prêt.{" "}
            <Link
              href={tabHref("posts", created.date.slice(0, 7))}
              scroll={false}
              className="inline-flex items-center gap-1 rounded-ds-sm font-semibold text-ds-brand-700 underline ds-focus"
            >
              Voir le {formatDayFr(created.date, "day")}
              <ArrowRight size={15} aria-hidden />
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
        "relative flex cursor-pointer items-center justify-center rounded-full inset-ring inset-ring-ds-ink-900/20",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ds-brand-600",
        text ? "min-h-9 bg-white px-3.5 text-ds-body font-medium text-ds-ink-800 pointer-coarse:min-h-11" : "size-9 pointer-coarse:size-11",
        checked && "ring-2 ring-ds-brand-600 ring-offset-2",
      )}
      style={
        hex
          ? { backgroundColor: hex }
          : hatched
            ? { backgroundImage: "repeating-linear-gradient(135deg, var(--color-ds-ink-300) 0 3px, #ffffff 3px 7px)" }
            : undefined
      }
    >
      <input type="radio" name="google-post-color" value={value} checked={checked} onChange={onSelect} className="sr-only" />
      {text ? label : <span className="sr-only">{label}</span>}
      {/* Le choix se lit aussi sans la couleur de l'anneau : une coche au coin de la pastille */}
      {checked ? (
        <span aria-hidden className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-ds-brand-600 text-white ring-2 ring-white">
          <Check size={10} strokeWidth={3.5} />
        </span>
      ) : null}
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
      <div className="min-h-24 rounded-ds-sm bg-ds-ink-50 p-0.5 ring-1 ring-ds-ink-200 sm:p-2">
        <DayNumber value={dayNumber} isToday={isToday} />
      </div>
    );
  }
  const shown = items.slice(0, CHIP_MAX);
  const more = items.length - shown.length;
  return (
    <div className="min-h-24 rounded-ds-sm bg-white p-0.5 ring-1 ring-ds-section-line sm:p-2">
      <DayNumber value={dayNumber} isToday={isToday} />
      <div className="mt-0.5 space-y-1 sm:mt-1">
        {shown.map((item) => (
          <Chip key={item.id} item={item} onClick={() => onSelect(item)} />
        ))}
        {more > 0 ? <p className="px-1 text-xs text-ds-ink-600">+{more}</p> : null}
      </div>
    </div>
  );
}

/** Fond et encre de la pastille du calendrier selon le statut — doublés de l'icône du statut. */
const CHIP_TONE: Record<PostStatusKind, string> = {
  publie: "bg-ds-success-100 text-ds-success-900",
  telecharge: "bg-ds-section-tint-2 text-ds-section-ink",
  "a-publier": "bg-white text-ds-ink-900 inset-ring inset-ring-ds-ink-300",
};

function Chip({ item, onClick }: { item: GoogleCalendarItem; onClick: () => void }) {
  const { kind } = statusOf(item);
  const Icon = STATUS_ICON[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.topic}
      aria-label={itemLabel(item)}
      className={clsx(
        "flex min-h-9 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg border-l-4 px-0.5 py-1 text-left text-xs/4 shadow-sm ds-focus pointer-coarse:min-h-11",
        "sm:items-start sm:justify-start sm:px-1.5 sm:py-1.5",
        CHIP_TONE[kind],
      )}
      // Liseré à la couleur dominante du visuel du post
      style={{ borderLeftColor: item.accentColor }}
    >
      <Icon size={14} strokeWidth={2.5} aria-hidden className="shrink-0 sm:mt-px" />
      <span aria-hidden className="hidden min-w-0 flex-1 sm:block">
        <span className="line-clamp-2 font-medium">
          {item.source === "request" ? <Sparkles size={11} aria-hidden className="mr-1 inline-block align-[-1px]" /> : null}
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
        "m-0.5 inline-grid size-6 place-items-center rounded-full text-xs font-semibold ds-tnum sm:m-0",
        isToday ? "bg-ds-brand-600 text-white" : "text-ds-ink-700",
      )}
    >
      {value}
      {isToday ? <span className="sr-only"> (aujourd&apos;hui)</span> : null}
    </span>
  );
}
