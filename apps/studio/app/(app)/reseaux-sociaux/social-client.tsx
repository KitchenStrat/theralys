"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Download,
  Info,
  Plus,
  SlidersHorizontal,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button, LinkButton, PageHeader, Stagger } from "@/components/ds";
import { buildMonthGrid, monthLabelFr, shiftMonthParam } from "@/lib/calendar";
import type { SocialCalendarItem, SocialMonthState, SocialRequestUsage } from "@/lib/social/data";
import type { SocialSwatch } from "@/lib/social/render/theme";
import type { SocialSettingsView } from "@/lib/social/settings";
import type { SocialSiteLink } from "@/lib/social/site-link";
import { CalendarCard } from "./calendar-card";
import { DayModal } from "./day-modal";
import { MonthCard, monthViewOf } from "./month-card";
import { RequestBar } from "./request-bar";
import { BioLinkCard, ExportCard } from "./share-cards";
import { SocialPostModal } from "./social-post-modal";
import { SocialSettingsModal } from "./social-settings-modal";
import { SECTION_PURPOSE } from "./social-ui";

/** Les trois gestes de la règle de bas de page, rappelés en images. */
const RULE_STEPS: { icon: LucideIcon; label: string }[] = [
  { icon: Download, label: "Télécharger" },
  { icon: ClipboardPaste, label: "Coller" },
  { icon: Check, label: "Marquer publié" },
];

export function SocialClient({
  year,
  month,
  items,
  state,
  usage,
  swatches,
  siteName,
  siteLink,
  bioLine,
  regenRemaining,
  initialPostId,
  todayIso,
  requestDates,
  settings,
}: {
  year: number;
  month: number;
  items: SocialCalendarItem[];
  state: SocialMonthState;
  usage: SocialRequestUsage;
  swatches: SocialSwatch[];
  siteName: string;
  /** Site de référence (lien de bio, légendes Facebook/LinkedIn) : adresse, et liens avec ou sans `src` */
  siteLink: SocialSiteLink;
  /** Ligne « lien dans ma bio » exacte insérée par le générateur */
  bioLine: string;
  /** Régénérations (instructions + ton) restantes ce mois-ci */
  regenRemaining: number;
  /** `?post=<id>` : contenu à ouvrir au chargement (lien profond), s'il est dans le mois */
  initialPostId: string | null;
  /** Jour civil Europe/Paris */
  todayIso: string;
  requestDates: { default: string; min: string; max: string };
  /** Réglages « Paramétrage » effectifs (voix, consignes, jours de publication) */
  settings: SocialSettingsView;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [fromDay, setFromDay] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Contenu créé par la barre, ou désigné par `?post=` : la modale s'ouvre dès qu'il figure dans `items`
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(initialPostId);
  // Lien profond (e-mail, agenda) vers un contenu absent du mois affiché : un message, pas une erreur, décidé au chargement
  const [missingDeepLink, setMissingDeepLink] = useState(
    () => initialPostId !== null && !items.some((i) => i.id === initialPostId),
  );

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
  const view = monthViewOf({ isPast, isCurrent, tooFar, state });

  // Moment de réussite du mois (tout est publié) : s'il survient pendant qu'une fenêtre est
  // ouverte, il est retenu jusqu'à sa fermeture — sinon il se jouerait derrière elle.
  const visibleCount = state.published + state.downloaded + state.toDownload;
  const allPublished = visibleCount > 0 && state.published === visibleCount;
  const overlayOpen = selected !== null || dayOpen !== null || settingsOpen;
  const [knownAllPublished, setKnownAllPublished] = useState(allPublished);
  const [successHeld, setSuccessHeld] = useState(false);
  if (knownAllPublished !== allPublished) {
    setKnownAllPublished(allPublished);
    setSuccessHeld(allPublished && overlayOpen);
  } else if (successHeld && !overlayOpen) {
    setSuccessHeld(false);
  }

  function openFromDay(item: SocialCalendarItem) {
    setFromDay(dayOpen);
    setDayOpen(null);
    setSelectedId(item.id);
  }

  function openItem(item: SocialCalendarItem) {
    setFromDay(null);
    setSelectedId(item.id);
  }

  /** « Demander un contenu » : amène la carte de demande à l'écran, curseur dans le champ du sujet. */
  function goToRequest() {
    document.getElementById("demande-sur-mesure")?.scrollIntoView({ block: "start" });
    document.getElementById("social-topic")?.focus({ preventScroll: true });
  }

  return (
    <>
      <Stagger className="space-y-6">
        <PageHeader
          section="reseaux-sociaux"
          purpose={SECTION_PURPOSE}
          action={
            // Simple raccourci vers la carte de demande, donc secondaire : le bouton principal de la page reste
            // « Créer ce contenu » (ou « Préparer mon mois »). À partir de 1 280 px la carte est à côté de la
            // liste : le raccourci n'a plus lieu d'être.
            <Button
              className="xl:hidden"
              variant="secondary"
              icon={<Plus size={18} aria-hidden />}
              onClick={goToRequest}
            >
              Demander un contenu
            </Button>
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <nav
                aria-label="Mois affiché"
                className="inline-flex items-center rounded-full bg-white p-1 shadow-sm inset-ring inset-ring-ds-section-line"
              >
                <Link
                  href={`/reseaux-sociaux?mois=${shiftMonthParam(year, month, -1)}`}
                  aria-label="Mois précédent"
                  className="grid size-11 place-items-center rounded-full text-ds-brand-800 ds-focus ds-press hover:bg-ds-section-tint-2"
                >
                  <ChevronLeft size={22} aria-hidden />
                </Link>
                <span className="min-w-36 px-1 text-center font-ds-display text-lg font-bold text-ds-section-ink capitalize sm:min-w-40">
                  {monthLabelFr(year, month)}
                </span>
                <Link
                  href={`/reseaux-sociaux?mois=${shiftMonthParam(year, month, 1)}`}
                  aria-label="Mois suivant"
                  className="grid size-11 place-items-center rounded-full text-ds-brand-800 ds-focus ds-press hover:bg-ds-section-tint-2"
                >
                  <ChevronRight size={22} aria-hidden />
                </Link>
              </nav>
              {isCurrent ? null : (
                <LinkButton href="/reseaux-sociaux" variant="quiet" size="sm" icon={<Undo2 size={16} aria-hidden />}>
                  Revenir à ce mois-ci
                </LinkButton>
              )}
            </div>
            {/* Visible quel que soit l'état du mois : voix, consignes et jours de publication */}
            <Button
              variant="secondary"
              size="sm"
              icon={<SlidersHorizontal size={16} aria-hidden />}
              onClick={() => setSettingsOpen(true)}
              title={settings.saved ? "Voix, consignes et jours de publication enregistrés" : undefined}
            >
              Paramétrage
              {settings.saved ? (
                <>
                  <span aria-hidden className="ml-2 inline-block size-2 rounded-full bg-ds-section-accent align-middle" />
                  <span className="sr-only"> (réglages personnalisés)</span>
                </>
              ) : null}
            </Button>
          </div>
        </PageHeader>

        {missingDeepLink ? <MissingDeepLinkNotice onClose={() => setMissingDeepLink(false)} /> : null}

        {/* Le mois : un seul bloc de la cascade, remonté (donc rejoué) à chaque changement de mois. Le
            calendrier, masqué sous 640 px, n'est pas un enfant direct de la cascade : son entrée ne se
            rejoue pas quand la fenêtre franchit ce seuil. */}
        <div key={monthParam} className="space-y-6">
          {/* grid-cols-1 = minmax(0,1fr) : un sujet long ne doit pas élargir la colonne sur mobile */}
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <MonthCard
              monthParam={monthParam}
              view={view}
              state={state}
              items={items}
              nextMonthParam={shiftMonthParam(year, month, 1)}
              siteName={siteName}
              todayIso={todayIso}
              isCurrent={isCurrent}
              celebrate={allPublished && !successHeld}
              onSelect={openItem}
            />
            <RequestBar
              swatches={swatches}
              usage={usage}
              dates={requestDates}
              monthParam={monthParam}
              todayIso={todayIso}
              onCreated={(postId) => setPendingOpenId(postId)}
              secondaryAction={view === "plan"}
            />
          </div>

          <CalendarCard
            monthParam={monthParam}
            year={year}
            weeks={weeks}
            byDate={byDate}
            todayIso={todayIso}
            onSelect={openItem}
            onMore={setDayOpen}
          />
        </div>

        <div className={clsx("grid grid-cols-1 items-start gap-6", items.length > 0 && "xl:grid-cols-2")}>
          <ExportCard monthParam={monthParam} count={items.length} />
          <BioLinkCard siteLink={siteLink} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-ds-md bg-ds-section-tint px-4 py-3.5 ring-1 ring-ds-section-line/70 sm:px-5">
          <p className="flex min-w-0 flex-[1_1_22rem] items-start gap-2.5 text-ds-body text-ds-ink-700">
            <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
            <span>
              Harmony ne publie pas à votre place : téléchargez le visuel, collez la légende, et
              marquez le contenu comme publié.
            </span>
          </p>
          <ol aria-hidden className="flex flex-wrap items-center gap-2 text-ds-meta font-medium text-ds-section-ink">
            {RULE_STEPS.map(({ icon: Icon, label }, index) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full bg-white py-1 pr-3 pl-1 inset-ring inset-ring-ds-section-line"
              >
                <span className="grid size-5 place-items-center rounded-full bg-ds-section-tint-2 text-xs font-bold">
                  {index + 1}
                </span>
                <Icon size={14} />
                {label}
              </li>
            ))}
          </ol>
        </div>
      </Stagger>

      {/* Hors de la cascade : la fenêtre partagée n'a pas de portail, aucun ancêtre ne doit bouger sous elle */}
      <SocialSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} initial={settings} />
      <DayModal
        date={dayOpen}
        items={dayOpen ? (byDate.get(dayOpen) ?? []) : []}
        onClose={() => setDayOpen(null)}
        onSelect={openFromDay}
      />
      <SocialPostModal
        item={selected}
        todayIso={todayIso}
        siteLink={siteLink}
        bioLine={bioLine}
        regenRemaining={regenRemaining}
        defaultTone={settings.voice.tone}
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
    </>
  );
}

/**
 * « Ce contenu n'est plus dans ce mois » : le lien profond (`?post=`) d'un
 * e-mail ou d'un agenda vise un contenu reporté ou retiré. Affiché une fois,
 * refermable.
 */
function MissingDeepLinkNotice({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-ds-md bg-white px-4 py-3 text-ds-body text-ds-ink-800 shadow-ds-card ring-1 ring-ds-section-line"
    >
      <span className="flex min-w-0 items-start gap-2.5">
        <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
        <span>Ce contenu n&apos;est plus dans ce mois (reporté ou retiré).</span>
      </span>
      <Button variant="quiet" size="sm" onClick={onClose} aria-label="Fermer ce message">
        Fermer
      </Button>
    </div>
  );
}
