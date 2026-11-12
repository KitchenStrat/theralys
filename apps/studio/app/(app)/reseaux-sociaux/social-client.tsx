"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { clsx } from "clsx";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Clock,
  Copy,
  Download,
  FileDown,
  FileSpreadsheet,
  History,
  Info,
  LayoutList,
  Link2,
  Plus,
  SlidersHorizontal,
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
  PageHeader,
  ProgressRing,
  Stagger,
  type TimedStep,
} from "@/components/ds";
import { WEEKDAYS, buildMonthGrid, formatDayFr, monthLabelFr, monthNameFr, ofMonthFr, shiftMonthParam } from "@/lib/calendar";
import type { SocialCalendarItem, SocialMonthState, SocialRequestUsage } from "@/lib/social/data";
import type { SocialSwatch } from "@/lib/social/render/theme";
import type { SocialSettingsView } from "@/lib/social/settings";
import { bioLinksOf, type SocialSiteLink } from "@/lib/social/site-link";
import { planSocialMonth } from "./actions";
import { DayModal } from "./day-modal";
import { RequestBar } from "./request-bar";
import { SocialPostModal } from "./social-post-modal";
import { SocialSettingsModal } from "./social-settings-modal";
import {
  ContentRow,
  CustomBadge,
  CustomIcon,
  Disclosure,
  DownloadLink,
  ErrorNote,
  FORMAT_LABEL,
  FormatTile,
  STATUS_META,
  itemLabel,
  statusOf,
  type ContentStatusKey,
} from "./social-ui";

/** Puces affichées par jour avant « +N autres ». */
const CHIP_MAX = 3;
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
type MonthView = "past" | "too-far" | "ending" | "plan" | "complete" | "ready";

function monthViewOf({
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
          purpose="Vos contenus du mois, prêts à poster : nous les préparons, vous les publiez."
          action={
            // À partir de 1 280 px la carte de demande est à côté de la liste : le raccourci n'a plus lieu d'être
            <Button
              className="xl:hidden"
              variant={view === "plan" ? "secondary" : "primary"}
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
          <ol
            aria-hidden
            className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-ds-meta font-medium text-ds-section-ink"
          >
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 inset-ring inset-ring-ds-section-line">
              <Download size={14} /> Télécharger
            </li>
            <li>
              <ChevronRight size={14} className="text-ds-ink-500" />
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 inset-ring inset-ring-ds-section-line">
              <ClipboardPaste size={14} /> Coller
            </li>
            <li>
              <ChevronRight size={14} className="text-ds-ink-500" />
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 inset-ring inset-ring-ds-section-line">
              <Check size={14} /> Marquer publié
            </li>
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

/**
 * Export du mois vers un planificateur (CSV : une ligne par contenu à venir,
 * non publié, et par réseau) ou un agenda (ICS : un événement par contenu du
 * mois). Rien à exporter sans contenu.
 */
function ExportCard({ monthParam, count }: { monthParam: string; count: number }) {
  if (count === 0) return null;
  const href = (format: "csv" | "ics") => `/api/social/export?mois=${monthParam}&format=${format}`;
  return (
    <Card as="section" aria-labelledby="export-titre">
      <CardHeader
        icon={FileDown}
        title={<span id="export-titre">Exporter le mois</span>}
        description="Pour programmer vos contenus dans un planificateur, ou les retrouver dans votre agenda."
      />
      <div className="mt-4 flex flex-wrap gap-2.5">
        <DownloadLink href={href("csv")} icon={<FileSpreadsheet size={18} aria-hidden />}>
          Exporter le mois (CSV planificateur)
        </DownloadLink>
        <DownloadLink href={href("ics")} icon={<CalendarPlus size={18} aria-hidden />}>
          Ajouter à mon agenda (ICS)
        </DownloadLink>
      </div>
      <Disclosure summary="Comment utiliser ces fichiers ?" className="mt-4">
        <p>
          Importez le CSV dans Metricool, Buffer ou Later : les contenus à venir, non publiés, une ligne par contenu et
          par réseau, avec la légende du réseau. À l&apos;import, faites correspondre les colonnes date, heure, texte,
          image_url et réseau à celles de votre planificateur. L&apos;ICS ajoute chaque contenu du mois à votre agenda,
          avec un lien vers cette page.
        </p>
        <p>
          image_url : lien public du visuel (préparé à l&apos;export) ; vide si le visuel n&apos;a pas pu être préparé.
        </p>
      </Disclosure>
    </Card>
  );
}

/**
 * « Votre lien de bio ». Site hébergé : l'URL du site avec `?src=ig`
 * (Instagram ; `fb` pour Facebook), pour que les visites venues des réseaux
 * apparaissent dans la provenance des statistiques. Site du client en
 * référence : son adresse seule, la même pour tous les réseaux — la
 * provenance est alors relevée par le code de mesure installé sur son site,
 * qui ne lit pas les paramètres d'une adresse.
 */
function BioLinkCard({ siteLink }: { siteLink: SocialSiteLink }) {
  const [copied, setCopied] = useState<"instagram" | "facebook" | null>(null);
  const [failed, setFailed] = useState(false);
  const { main, facebook } = bioLinksOf(siteLink);

  async function copy(network: "instagram" | "facebook", link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setFailed(false);
      setCopied(network);
      setTimeout(() => setCopied((c) => (c === network ? null : c)), 2000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <Card as="section" aria-labelledby="lien-bio-titre">
      <CardHeader
        icon={Link2}
        title={<span id="lien-bio-titre">Votre lien de bio</span>}
        description={
          facebook
            ? "Mettez ce lien dans votre bio Instagram : les visites qui en viennent apparaissent dans vos statistiques."
            : "Un seul lien pour tous vos réseaux : l'adresse de votre site."
        }
      />
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {/* L'adresse entière reste lisible : elle passe à la ligne plutôt que d'être coupée */}
        <code
          className="min-w-0 flex-[1_1_14rem] rounded-ds-sm bg-ds-section-tint px-3 py-2.5 text-ds-meta break-all text-ds-ink-800 inset-ring inset-ring-ds-section-line"
          title={main}
        >
          {main}
        </code>
        <Button
          size="sm"
          variant="secondary"
          icon={copied === "instagram" ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          onClick={() => copy("instagram", main)}
          aria-label={facebook ? "Copier le lien de bio Instagram" : "Copier le lien de bio"}
        >
          {copied === "instagram" ? "Copié !" : "Copier"}
        </Button>
        {facebook ? (
          <Button
            size="sm"
            variant="quiet"
            icon={copied === "facebook" ? <Check size={16} aria-hidden /> : undefined}
            onClick={() => copy("facebook", facebook)}
            aria-label="Copier le lien de bio Facebook"
          >
            {copied === "facebook" ? "Copié !" : "Version Facebook"}
          </Button>
        ) : null}
        {/* Le nom accessible des boutons ne change pas : la copie est annoncée ici */}
        <span role="status" className="sr-only">
          {copied === "instagram" ? "Lien de bio copié." : copied === "facebook" ? "Lien de bio Facebook copié." : ""}
        </span>
      </div>
      {failed ? (
        <ErrorNote className="mt-3">Copie impossible — sélectionnez le lien et copiez-le manuellement.</ErrorNote>
      ) : null}
      {facebook ? (
        <Disclosure summary="Et pour Facebook ?" className="mt-4">
          <p>
            Même lien pour Facebook, avec <code className="rounded bg-ds-ink-100 px-1 py-0.5 text-ds-meta">src=fb</code>.
          </p>
        </Disclosure>
      ) : (
        <Disclosure summary="Comment sont comptées les visites ?" className="mt-4">
          <p>
            La provenance des visites apparaît dans vos statistiques une fois le code de mesure installé sur votre site
            (rubrique{" "}
            <Link href="/mon-site" className="rounded font-semibold text-ds-brand-700 underline underline-offset-2 ds-focus">
              Mon site
            </Link>
            ).
          </p>
        </Disclosure>
      )}
    </Card>
  );
}

/** « 3 contenus » : accord simple du nom. */
function countOf(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

/**
 * Carte « Vos contenus du mois » : ce que présente le mois (`view`), la
 * progression (à télécharger, téléchargés, publiés), puis la liste des contenus.
 */
function MonthCard({
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

  const free = state.freeSlots.length;
  const monthName = monthNameFr(`${monthParam}-01`);
  const waiting = (
    <div className="rounded-ds-md bg-white p-4 shadow-ds-card ring-1 ring-ds-ink-900/5 ds-fade-in sm:p-5">
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
        {pending ? (
          <div className="p-3 sm:p-4">{waiting}</div>
        ) : (
          <EmptyState icon={Sparkles} title="Préparez votre mois en un clic" className="pb-5 sm:pb-6">
            Harmony lit votre site — vos spécialités, votre page À propos, vos articles — et prépare {free} contenus
            prêts à poster, dans vos couleurs. Vous n&apos;avez plus qu&apos;à télécharger et coller la légende.
          </EmptyState>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3 px-5 pb-6 sm:pb-8">
          <Button icon={<Sparkles size={18} aria-hidden />} loading={pending} onClick={plan}>
            Préparer mon mois de contenus
          </Button>
          <Badge tone="sun" icon={Clock}>
            Environ une minute
          </Badge>
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
        {pending ? <div className="mt-4">{waiting}</div> : null}
        <div className="mt-4">
          <Button variant="secondary" icon={<Sparkles size={18} aria-hidden />} loading={pending} onClick={plan}>
            Compléter le mois ({countOf(free, "contenu")} manquant{free > 1 ? "s" : ""})
          </Button>
        </div>
      </MonthSummary>
    );
  } else {
    const readyTitle = `Votre mois est prêt : ${countOf(state.calendarCount, "contenu")}${
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
        title={<span id="contenus-du-mois-titre">Vos contenus du mois</span>}
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
  return (
    <div className="mt-5 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <span className="rounded-full bg-white p-1.5 shadow-sm">
          <ProgressRing
            value={state.published}
            max={Math.max(total, 1)}
            label="Contenus publiés ce mois-ci"
            valueText={`${state.published} sur ${total}`}
            size={84}
            thickness={9}
          >
            <span className="block font-ds-display text-xl font-bold text-ds-section-ink ds-tnum">
              {state.published}
              <span className="text-ds-ink-600">/{total}</span>
            </span>
            <span className="mt-1 block text-xs font-medium text-ds-ink-600">
              publié{state.published > 1 ? "s" : ""}
            </span>
          </ProgressRing>
        </span>
        <div className="min-w-0 flex-[1_1_14rem]">
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
            <li>
              <Badge tone={STATUS_META["a-telecharger"].tone} icon={STATUS_META["a-telecharger"].icon}>
                {state.toDownload} à télécharger
              </Badge>
            </li>
            <li>
              <Badge tone={STATUS_META.telecharge.tone} icon={STATUS_META.telecharge.icon}>
                {countOf(state.downloaded, "téléchargé")}
              </Badge>
            </li>
            <li>
              <Badge tone={STATUS_META.publie.tone} icon={STATUS_META.publie.icon}>
                {countOf(state.published, "publié")}
              </Badge>
            </li>
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
          items.length > LIST_SCROLL_FROM && "sm:max-h-[31rem] sm:overflow-y-auto sm:pr-1",
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
                  {isToday ? <Badge tone="section">Aujourd&apos;hui</Badge> : null}
                </p>
              ) : null}
              <ContentRow
                item={item}
                label={`${formatDayFr(item.date, "day")} — ${itemLabel(item)} — ${status.label}`}
                onClick={() => onSelect(item)}
                meta={
                  <>
                    <span className="hidden sm:inline">
                      {isToday ? (
                        <strong className="font-semibold text-ds-section-accent">Aujourd&apos;hui</strong>
                      ) : (
                        formatDayFr(item.date)
                      )}
                      {" · "}
                    </span>
                    <span>
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
function CalendarCard({
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
 * de format et icône de statut empilées, cible de 44 px. Large : vignette,
 * sujet sur deux lignes, icône de statut. Nom accessible complet.
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
        "xl:min-h-0 xl:flex-row xl:items-start xl:justify-start xl:gap-1.5 xl:p-1.5",
        look.frame,
      )}
    >
      <FormatTile format={item.format} size="xs" accentColor={item.accentColor} />
      <span aria-hidden className="hidden min-w-0 flex-1 xl:block">
        <span className="line-clamp-2 text-ds-meta/[1.125rem] font-medium text-ds-ink-900">{item.topic}</span>
      </span>
      <span aria-hidden className="flex shrink-0 items-center gap-1 xl:flex-col xl:pt-0.5">
        {item.source === "request" ? <CustomIcon size={13} className="text-ds-section-accent" /> : null}
        <StatusIcon size={14} strokeWidth={2.5} className={look.icon} />
      </span>
    </button>
  );
}
