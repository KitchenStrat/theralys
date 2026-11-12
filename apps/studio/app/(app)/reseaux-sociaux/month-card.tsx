"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { clsx } from "clsx";
import {
  ArrowRight,
  CalendarClock,
  CalendarX,
  CircleDot,
  Clock,
  History,
  LayoutList,
  Sparkles,
  Undo2,
} from "lucide-react";
import {
  AiBadge,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  GenerationProgress,
  InlineSuccess,
  LinkButton,
  NBSP,
  ProgressRing,
  type TimedStep,
} from "@/components/ds";
import { formatDayFr, monthNameFr, ofMonthFr } from "@/lib/calendar";
import type { SocialCalendarItem, SocialMonthState } from "@/lib/social/data";
import { planSocialMonth } from "./actions";
import {
  ContentRow,
  CustomBadge,
  ErrorNote,
  FORMAT_LABEL,
  STATUS_META,
  itemLabel,
  statusOf,
  type ContentStatusKey,
} from "./social-ui";

/** Au-delà, la liste des contenus du mois défile (à partir de 640 px ; sur mobile elle tient lieu de calendrier). */
const LIST_SCROLL_FROM = 8;

/**
 * Étapes de la préparation d'un mois (environ une minute, un seul appel) : la
 * tâche ne remonte pas son avancement, le rythme est donc estimé d'après les
 * durées habituelles, et la dernière étape dure jusqu'à la réponse.
 */
const PLAN_STEPS: TimedStep[] = [
  { label: "Lecture de votre site", seconds: 8, details: ["Vos spécialités", "Votre page À propos", "Vos articles"] },
  { label: "Rédaction des légendes", seconds: 25 },
  { label: "Mise en page dans vos couleurs", seconds: 15 },
  { label: "Vérification et enregistrement", seconds: 10 },
];

/** Ce que la carte « Vos contenus du mois » présente — états exclusifs (§6.2), dans cet ordre. */
export type MonthView = "past" | "too-far" | "ending" | "plan" | "complete" | "ready";

export function monthViewOf({
  isPast,
  isCurrent,
  tooFar,
  state,
}: {
  isPast: boolean;
  isCurrent: boolean;
  tooFar: boolean;
  state: SocialMonthState;
}): MonthView {
  const prepared = state.calendarCount > 0;
  const canPlan = state.freeSlots.length > 0 && !tooFar;
  if (isPast) return "past";
  if (tooFar && !prepared) return "too-far";
  if (isCurrent && state.slots.length < 2 && !prepared) return "ending";
  if (canPlan && !prepared) return "plan";
  if (canPlan) return "complete";
  if (prepared) return "ready";
  return "ending";
}

/** « 3 contenus » : accord simple du nom. */
function countOf(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

/**
 * Carte « Vos contenus du mois » : ce que présente le mois (`view`), la
 * progression (à télécharger, téléchargés, publiés), puis la liste des contenus.
 */
export function MonthCard({
  monthParam,
  view,
  state,
  items,
  nextMonthParam,
  siteName,
  todayIso,
  isCurrent,
  celebrate,
  onSelect,
}: {
  monthParam: string;
  view: MonthView;
  state: SocialMonthState;
  items: SocialCalendarItem[];
  nextMonthParam: string;
  siteName: string;
  todayIso: string;
  isCurrent: boolean;
  /** Tout est publié, et le moment de réussite peut se jouer (aucune fenêtre ouverte) */
  celebrate: boolean;
  onSelect: (item: SocialCalendarItem) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Préparation réussie pendant cette visite : le résumé du mois arrive avec sa coche
  const [justPlanned, setJustPlanned] = useState(false);

  function plan() {
    setError(null);
    startTransition(async () => {
      const result = await planSocialMonth({ month: monthParam });
      if (result.error) {
        setError(result.error);
        return;
      }
      setJustPlanned(true);
      router.refresh();
    });
  }

  // Une erreur met fin à l'attente à l'écran, même si la transition se clôt un instant plus tard
  const preparing = pending && error === null;
  // L'attente remplace le texte au-dessus du bouton : elle est amenée à l'écran si elle en dépasse (mobile)
  const waitingRef = useRef<HTMLDivElement>(null);
  // Le bouton, inactif pendant la préparation, a perdu le focus : à la réponse, il revient sur le
  // bouton (échec : on peut relancer) ou, s'il a disparu (mois prêt), sur le titre de la carte.
  const wasPreparing = useRef(false);
  useEffect(() => {
    if (preparing) waitingRef.current?.scrollIntoView({ block: "nearest" });
    if (wasPreparing.current && !preparing && document.activeElement === document.body) {
      const target =
        document.querySelector<HTMLElement>('[data-focus="plan"]:not(:disabled)') ??
        document.getElementById("contenus-du-mois-titre");
      target?.focus({ preventScroll: true });
    }
    wasPreparing.current = preparing;
  }, [preparing]);
  const free = state.freeSlots.length;
  const monthName = monthNameFr(`${monthParam}-01`);
  const waiting = (
    <div
      ref={waitingRef}
      className="scroll-mt-24 rounded-ds-md bg-white p-4 shadow-ds-card ring-1 ring-ds-ink-900/5 ds-fade-in sm:p-5"
    >
      <GenerationProgress
        title={`Harmony prépare vos contenus ${ofMonthFr(`${monthParam}-01`)}`}
        steps={PLAN_STEPS}
        running
        estimate="environ une minute"
        hint="Ne fermez pas la page."
      />
    </div>
  );
  let body: ReactNode;

  if (view === "past") {
    body =
      items.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="Aucun contenu ce mois-ci."
          action={
            <LinkButton href="/reseaux-sociaux" variant="secondary" icon={<Undo2 size={18} aria-hidden />}>
              Revenir à ce mois-ci
            </LinkButton>
          }
        >
          Ce mois est passé, et rien n&apos;y avait été préparé. Vos contenus à venir sont dans le mois en cours.
        </EmptyState>
      ) : (
        <MonthSummary
          state={state}
          celebrate={celebrate}
          monthName={monthName}
          title={
            <span className="inline-flex items-center gap-2">
              <History size={20} aria-hidden className="shrink-0 text-ds-section-accent" />
              Historique de vos contenus.
            </span>
          }
        />
      );
  } else if (view === "too-far") {
    body = (
      <EmptyState
        icon={CalendarClock}
        title="Ce mois est encore loin"
        action={
          <LinkButton href="/reseaux-sociaux" variant="secondary" icon={<Undo2 size={18} aria-hidden />}>
            Revenir à ce mois-ci
          </LinkButton>
        }
      >
        Vous pourrez le préparer 4 mois à l&apos;avance.
      </EmptyState>
    );
  } else if (view === "ending") {
    body = (
      <EmptyState
        icon={CalendarClock}
        title="Ce mois touche à sa fin"
        action={
          <LinkButton
            href={`/reseaux-sociaux?mois=${nextMonthParam}`}
            variant="secondary"
            iconRight={<ArrowRight size={18} aria-hidden />}
          >
            Préparer le mois prochain
          </LinkButton>
        }
      >
        Préparez plutôt le mois prochain.
      </EmptyState>
    );
  } else if (view === "plan") {
    body = (
      <div className="mt-5 rounded-ds-md bg-ds-section-tint ring-1 ring-ds-section-line/70">
        {preparing ? (
          <div className="p-3 sm:p-4">{waiting}</div>
        ) : (
          <EmptyState icon={Sparkles} title="Préparez votre mois en un clic" className="pb-5 sm:pb-6">
            Harmony lit votre site — vos spécialités, votre page À propos, vos articles — et prépare {free} contenus
            prêts à poster, dans vos couleurs. Vous n&apos;avez plus qu&apos;à télécharger et coller la légende.
          </EmptyState>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3 px-5 pb-6 sm:pb-8">
          <Button icon={<Sparkles size={18} aria-hidden />} loading={preparing} data-focus="plan" onClick={plan}>
            Préparer mon mois de contenus
          </Button>
          {/* Pendant l'attente, la durée est déjà annoncée au-dessus */}
          {preparing ? null : (
            <Badge tone="sun" icon={Clock}>
              Environ une minute
            </Badge>
          )}
        </div>
      </div>
    );
  } else if (view === "complete") {
    body = (
      <MonthSummary
        state={state}
        celebrate={false}
        monthName={monthName}
        title={`${countOf(state.calendarCount, "contenu")} déjà prêt${state.calendarCount > 1 ? "s" : ""}`}
      >
        {preparing ? <div className="mt-4">{waiting}</div> : null}
        <div className="mt-4">
          <Button
            variant="secondary"
            icon={<Sparkles size={18} aria-hidden />}
            loading={preparing}
            data-focus="plan"
            onClick={plan}
          >
            Compléter le mois ({countOf(free, "contenu")} manquant{free > 1 ? "s" : ""})
          </Button>
        </div>
      </MonthSummary>
    );
  } else {
    const readyTitle = `Votre mois est prêt${NBSP}: ${countOf(state.calendarCount, "contenu")}${
      state.requestCount > 0 ? ` + ${state.requestCount} sur mesure` : ""
    }`;
    body = (
      <MonthSummary
        state={state}
        celebrate={celebrate}
        monthName={monthName}
        title={justPlanned ? <InlineSuccess size="md">{readyTitle}</InlineSuccess> : readyTitle}
      />
    );
  }

  return (
    <Card as="section" aria-labelledby="contenus-du-mois-titre">
      <CardHeader
        icon={LayoutList}
        title={
          <span id="contenus-du-mois-titre" tabIndex={-1} className="rounded ds-focus">
            Vos contenus du mois
          </span>
        }
        description={siteName}
        action={items.length > 0 ? <AiBadge>Préparés par l&apos;IA</AiBadge> : undefined}
      />
      {body}
      {error ? <ErrorNote className="mt-4">{error}</ErrorNote> : null}
      <MonthList items={items} todayIso={todayIso} markToday={isCurrent} onSelect={onSelect} />
    </Card>
  );
}

/**
 * Résumé du mois : anneau des contenus publiés, compteurs des trois états
 * (mêmes pastilles que dans la liste), et le moment de réussite quand tout est publié.
 */
function MonthSummary({
  title,
  state,
  celebrate,
  monthName,
  children,
}: {
  title: ReactNode;
  state: SocialMonthState;
  celebrate: boolean;
  monthName: string;
  children?: ReactNode;
}) {
  const total = state.published + state.downloaded + state.toDownload;
  // Les trois états, dans l'ordre du parcours ; un compteur à zéro n'est pas affiché
  const counters: { key: ContentStatusKey; count: number; text: string }[] = [
    { key: "a-telecharger", count: state.toDownload, text: `${state.toDownload} à télécharger` },
    { key: "telecharge", count: state.downloaded, text: countOf(state.downloaded, "téléchargé") },
    { key: "publie", count: state.published, text: countOf(state.published, "publié") },
  ];
  return (
    <div className="mt-5 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-4 sm:gap-x-5">
        <span className="rounded-full bg-white p-1.5 shadow-sm">
          <ProgressRing
            value={state.published}
            max={Math.max(total, 1)}
            label="Contenus publiés ce mois-ci"
            valueText={`${state.published} sur ${total}`}
            size={92}
            thickness={9}
          >
            <span
              className={clsx(
                "block font-ds-display font-bold text-ds-section-ink ds-tnum",
                total < 10 ? "text-xl" : "text-lg",
              )}
            >
              {state.published}
              <span className="text-ds-ink-600">/{total}</span>
            </span>
            <span className="mt-1 block text-xs font-medium text-ds-ink-600">
              publié{state.published > 1 ? "s" : ""}
            </span>
          </ProgressRing>
        </span>
        {/* Le message de réussite, plus long, passe sous l'anneau quand la place manque */}
        <div className={clsx("min-w-0", celebrate ? "flex-[1_1_15rem]" : "flex-[1_1_9rem]")}>
          {celebrate ? (
            <InlineSuccess
              size="md"
              detail={`${total > 1 ? `Vos ${total} contenus sont marqués` : "Votre contenu est marqué"} comme publié${total > 1 ? "s" : ""}. Bravo !`}
            >
              Tout est publié pour {monthName}
            </InlineSuccess>
          ) : (
            <div className="font-ds-display text-lg/7 font-bold text-ds-section-ink">{title}</div>
          )}
          <ul aria-label="Avancement du mois" className="mt-3 flex flex-wrap gap-2">
            {counters
              .filter((counter) => counter.count > 0)
              .map((counter) => (
                <li key={counter.key}>
                  <Badge tone={STATUS_META[counter.key].tone} icon={STATUS_META[counter.key].icon}>
                    {counter.text}
                  </Badge>
                </li>
              ))}
          </ul>
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * Liste des contenus du mois (vignette de format, sujet, date, statut). À
 * partir de 640 px : liste compacte, défilable au-delà de 8, en regard du
 * calendrier. En dessous, la grille du calendrier ne tient pas : cette liste
 * en tient lieu, avec un intertitre par jour et le jour courant repéré.
 */
function MonthList({
  items,
  todayIso,
  markToday,
  onSelect,
}: {
  items: SocialCalendarItem[];
  todayIso: string;
  /** Mois en cours : le jour courant est repéré dans la liste */
  markToday: boolean;
  onSelect: (item: SocialCalendarItem) => void;
}) {
  if (items.length === 0) return null;
  // Aujourd'hui sans contenu : un repère entre les contenus passés et ceux à venir (mobile)
  const todayHasContent = items.some((item) => item.date === todayIso);
  const firstUpcoming = markToday && !todayHasContent ? items.findIndex((item) => item.date > todayIso) : -1;
  const todayAfterAll = markToday && !todayHasContent && firstUpcoming === -1;
  const todayMarker = (
    <p className="flex items-center gap-2.5 px-2 pt-3 pb-1 text-ds-meta font-semibold text-ds-section-accent sm:hidden">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-ds-section-accent" />
      Aujourd&apos;hui, {formatDayFr(todayIso, "day")} : rien de prévu
      <span aria-hidden className="h-px min-w-4 flex-1 bg-ds-section-line" />
    </p>
  );
  return (
    <>
      <ul
        aria-label="Contenus du mois"
        className={clsx(
          "mt-5 sm:space-y-0.5",
          // Liste longue : elle défile, et son bas s'estompe pour le dire (le dernier contenu remonte au-dessus du fondu)
          items.length > LIST_SCROLL_FROM &&
            "sm:max-h-[31rem] sm:scroll-pb-12 sm:overflow-y-auto sm:pr-1 sm:pb-10 sm:[mask-image:linear-gradient(to_bottom,#000_calc(100%-3rem),transparent)]",
        )}
      >
        {items.map((item, index) => {
          const status = statusOf(item);
          const isToday = markToday && item.date === todayIso;
          const startsDay = index === 0 || items[index - 1]?.date !== item.date;
          return (
            <li key={item.id} className="min-w-0">
              {index === firstUpcoming ? todayMarker : null}
              {startsDay ? (
                <p
                  className={clsx(
                    "flex flex-wrap items-center gap-2 px-2 pt-3 pb-1 text-ds-body font-semibold sm:hidden",
                    isToday ? "text-ds-section-accent" : "text-ds-ink-700",
                  )}
                >
                  <span className="inline-block first-letter:uppercase">{formatDayFr(item.date, "long")}</span>
                  {isToday ? (
                    <Badge tone="section" icon={CircleDot}>
                      Aujourd&apos;hui
                    </Badge>
                  ) : null}
                </p>
              ) : null}
              <ContentRow
                item={item}
                label={`${formatDayFr(item.date, "day")} — ${itemLabel(item)} — ${status.label}`}
                onClick={() => onSelect(item)}
                meta={
                  <>
                    <span>
                      {/* Sur mobile, la date est l'intertitre du jour */}
                      <span className="hidden sm:inline">
                        {isToday ? (
                          <strong className="font-semibold text-ds-section-accent">Aujourd&apos;hui</strong>
                        ) : (
                          formatDayFr(item.date)
                        )}
                        {" · "}
                      </span>
                      {FORMAT_LABEL[item.format]}
                      {item.format === "carousel" ? ` · ${item.slideCount} pages` : ""}
                    </span>
                    {item.source === "request" ? <CustomBadge /> : null}
                  </>
                }
              />
            </li>
          );
        })}
      </ul>
      {todayAfterAll ? todayMarker : null}
    </>
  );
}
