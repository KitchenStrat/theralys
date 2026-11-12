"use client";

import Link, { useLinkStatus } from "next/link";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { CalendarDays, ChevronLeft, ChevronRight, Eye, Globe, Settings, Undo2, type LucideIcon } from "lucide-react";
import {
  AiBadge,
  Button,
  Card,
  EmptyState,
  IconBadge,
  LinkButton,
  PageHeader,
  ProgressBar,
  Spinner,
  Stagger,
  plural,
} from "@/components/ds";
import { buildMonthGrid, formatDayFr, monthNameFr } from "@/lib/calendar";
import type { CalendarItem } from "@/lib/data";
import { ArticleModal } from "./article-modal";
import { ArticleStatusPill } from "./article-status";
import { BlogSettingsModal, type BlogSettingsValue } from "./blog-settings-modal";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/**
 * Site du client quand il est la référence des outils : les articles
 * paraissent toujours sur le blog du site Harmony, le praticien les reprend
 * sur son propre site.
 */
export type OwnSiteNotice = {
  /** Adresse du site du client, sans protocole (« www.mon-cabinet.fr ») */
  address: string;
  /** Le site Harmony est masqué des moteurs de recherche (réglage par défaut dans ce mode) */
  hostedHidden: boolean;
};

export function PublicationsClient({
  year,
  month,
  items,
  settings,
  monthlyQuota,
  defaultThemeLabels,
  ownSite = null,
}: {
  year: number;
  month: number;
  items: CalendarItem[];
  settings: BlogSettingsValue | null;
  monthlyQuota: number;
  /** Thématiques proposées par défaut : les spécialités du site de référence */
  defaultThemeLabels: string[];
  /** `null` : le site Harmony est la référence, la section ne change pas */
  ownSite?: OwnSiteNotice | null;
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

  // Résumé du mois affiché : ce que montre déjà le calendrier, compté
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const monthName = monthNameFr(`${monthKey}-01`);
  const currentMonthKey = todayIso.slice(0, 7);
  const isCurrentMonth = monthKey === currentMonthKey;
  const counts = useMemo(() => {
    const tally = { published: 0, draft: 0, scheduled: 0, withdrawn: 0 };
    for (const item of items) tally[item.status === "planned" ? "scheduled" : item.status] += 1;
    return tally;
  }, [items]);
  // Les articles retirés ne paraîtront pas : ils ne comptent pas dans le programme du mois
  const expected = items.length - counts.withdrawn;
  const hasAi = items.some((item) => item.aiGenerated);
  // Le premier article déjà rédigé qui attend sa publication : c'est lui qu'on propose de relire
  const nextUp = useMemo(
    () =>
      items
        .filter((item) => item.kind === "article" && (item.status === "draft" || item.status === "scheduled"))
        .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
    [items],
  );

  return (
    <>
      <Stagger className="space-y-6">
        <PageHeader
          section="publications"
          action={
            nextUp ? (
              <Button icon={<Eye size={18} aria-hidden />} onClick={() => setSelected(nextUp)}>
                Relire le prochain article
              </Button>
            ) : undefined
          }
          secondary={
            <Button variant="secondary" icon={<Settings size={18} aria-hidden />} onClick={() => setSettingsOpen(true)}>
              Paramètres
            </Button>
          }
        />

        {ownSite ? <OwnSiteBanner ownSite={ownSite} /> : null}

        <Card as="section" padding="none" aria-labelledby="calendrier-mois">
          {/* En-tête de la feuille du mois : mois affiché, navigation, résumé */}
          <div className="rounded-t-ds-card border-b border-ds-section-line/70 bg-ds-section-tint p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <nav aria-label="Mois affiché" className="flex items-center gap-1.5 sm:gap-2.5">
                <MonthLink href={`/publications?mois=${prev}`} label="Mois précédent" icon={ChevronLeft} />
                <h2
                  id="calendrier-mois"
                  className="min-w-40 text-center font-ds-display text-xl/7 font-bold text-ds-section-ink capitalize sm:min-w-52 sm:text-2xl/8"
                >
                  {monthLabel}
                </h2>
                <MonthLink href={`/publications?mois=${next}`} label="Mois suivant" icon={ChevronRight} />
              </nav>
              {isCurrentMonth ? null : (
                <LinkButton href="/publications" variant="quiet" size="sm" icon={<Undo2 size={16} aria-hidden />}>
                  Revenir à ce mois-ci
                </LinkButton>
              )}
            </div>
            <p className="mt-3 max-w-[70ch] text-base text-ds-ink-700 text-pretty">
              {expected > 0 ? (
                <>
                  <strong className="font-semibold text-ds-ink-900">{plural(expected, "article", "articles")}</strong> en{" "}
                  {monthName}.{" "}
                </>
              ) : null}
              Notre IA spécialisée rédige chaque article <strong className="font-semibold text-ds-ink-900">7 jours avant</strong>{" "}
              sa date de publication.
            </p>
            {expected > 0 ? (
              <ProgressBar
                className="mt-4 [--ds-progress-track:var(--color-white)]"
                value={counts.published}
                max={expected}
                label="Avancement du mois"
                valueText={`${plural(counts.published, "publié", "publiés")} sur ${expected}`}
              />
            ) : null}
          </div>

          {/* `key` : le contenu du mois arrive en fondu, les flèches gardent le focus */}
          <div key={monthKey} className="p-3 ds-fade-in sm:p-6">
            {items.length === 0 ? (
              <EmptyMonth
                past={monthKey < currentMonthKey}
                isCurrentMonth={isCurrentMonth}
                monthLabel={monthLabel}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            ) : (
              <>
                <ul aria-label="Légende" className="flex flex-wrap items-center gap-x-2 gap-y-2 px-1 sm:px-0">
                  {counts.published > 0 ? (
                    <li>
                      <ArticleStatusPill status="published">{plural(counts.published, "publié", "publiés")}</ArticleStatusPill>
                    </li>
                  ) : null}
                  {counts.draft > 0 ? (
                    <li>
                      <ArticleStatusPill status="draft">{plural(counts.draft, "brouillon", "brouillons")}</ArticleStatusPill>
                    </li>
                  ) : null}
                  {counts.scheduled > 0 ? (
                    <li>
                      <ArticleStatusPill status="scheduled">{plural(counts.scheduled, "planifié", "planifiés")}</ArticleStatusPill>
                    </li>
                  ) : null}
                  {counts.withdrawn > 0 ? (
                    <li>
                      <ArticleStatusPill status="withdrawn">{plural(counts.withdrawn, "retiré", "retirés")}</ArticleStatusPill>
                    </li>
                  ) : null}
                  {/* Dans le calendrier, la marque de l'IA est abrégée : la légende la déplie */}
                  {hasAi ? (
                    <li className="flex items-center gap-1.5">
                      <AiBadge>IA</AiBadge>
                      <span className="text-ds-meta text-ds-ink-600">Rédigé par l&apos;IA</span>
                    </li>
                  ) : null}
                </ul>

                <div aria-hidden className="mt-5 hidden grid-cols-7 gap-2 xl:grid">
                  {WEEKDAYS.map((weekday, index) => (
                    <span
                      key={weekday}
                      className={clsx(
                        "px-2.5 text-xs font-semibold tracking-wider uppercase",
                        index >= 5 ? "text-ds-ink-500" : "text-ds-section-accent",
                      )}
                    >
                      {weekday}
                    </span>
                  ))}
                </div>

                {/* Une seule liste : une ligne par jour sous 1 280 px, une grille de sept colonnes au-delà */}
                <ol className="mt-4 grid gap-2 xl:mt-2 xl:grid-cols-7">
                  {weeks.flat().map((day, index) =>
                    day === null ? (
                      <li key={`hors-mois-${index}`} aria-hidden className="hidden xl:block" />
                    ) : (
                      <CalendarDay
                        key={day}
                        iso={day}
                        isToday={day === todayIso}
                        items={byDate.get(day) ?? []}
                        onSelect={setSelected}
                      />
                    ),
                  )}
                </ol>
              </>
            )}
          </div>
        </Card>
      </Stagger>

      {/* Hors de la cascade : une fenêtre ne doit ni attendre son tour ni monter avec les blocs */}
      <ArticleModal item={selected} ownSite={ownSite !== null} onClose={() => setSelected(null)} />
      <BlogSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initial={settings}
        monthlyQuota={monthlyQuota}
        defaultThemeLabels={defaultThemeLabels}
      />
    </>
  );
}

/** Flèche de changement de mois : bouton rond de 44 px, indicateur pendant le chargement du mois. */
function MonthLink({ href, label, icon }: { href: string; label: string; icon: LucideIcon }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-ds-brand-800 shadow-sm inset-ring inset-ring-ds-ink-300 ds-focus ds-press hover:bg-ds-brand-50"
    >
      <MonthLinkIcon icon={icon} />
    </Link>
  );
}

function MonthLinkIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus();
  return pending ? <Spinner className="size-5" /> : <Icon size={22} aria-hidden />;
}

/**
 * Bandeau de la section quand le site du client est la référence : où
 * paraissent les articles, et comment les publier sur son propre site.
 */
function OwnSiteBanner({ ownSite }: { ownSite: OwnSiteNotice }) {
  return (
    <div className="flex items-start gap-3.5 rounded-ds-card bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70 sm:p-5">
      <IconBadge icon={Globe} tone="soft" size="md" className="bg-white" />
      <p role="note" className="min-w-0 flex-1 text-base text-ds-ink-700 text-pretty">
        {ownSite.hostedHidden
          ? "Vos articles sont toujours rédigés ici et paraissent sur le blog de votre site Harmony, masqué des moteurs de recherche tant que vos outils s'appuient sur votre propre site."
          : "Vos articles sont toujours rédigés ici et paraissent sur le blog de votre site Harmony."}{" "}
        Pour les publier {ownSite.hostedHidden ? "" : "aussi "}sur{" "}
        <strong className="font-semibold break-words text-ds-ink-900">{ownSite.address}</strong>, ouvrez un article et
        choisissez « Copier l&apos;article », puis collez-le dans l&apos;éditeur de votre site.
      </p>
    </div>
  );
}

/** Mois sans aucun article : dit pourquoi, et ce qui apparaîtra. */
function EmptyMonth({
  past,
  isCurrentMonth,
  monthLabel,
  onOpenSettings,
}: {
  past: boolean;
  isCurrentMonth: boolean;
  monthLabel: string;
  onOpenSettings: () => void;
}) {
  if (past) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={`Aucun article en ${monthLabel}`}
        action={
          <LinkButton href="/publications" variant="secondary" icon={<Undo2 size={18} aria-hidden />}>
            Revenir à ce mois-ci
          </LinkButton>
        }
      >
        Votre blog n&apos;avait pas d&apos;article ce mois-là. Les mois qui suivent gardent la trace de tout ce qui a été
        publié.
      </EmptyState>
    );
  }
  return (
    <EmptyState
      icon={CalendarDays}
      title={isCurrentMonth ? "Aucun article prévu ce mois-ci" : `Rien de programmé pour ${monthLabel}`}
      action={
        isCurrentMonth ? (
          <Button variant="secondary" icon={<Settings size={18} aria-hidden />} onClick={onOpenSettings}>
            Régler mon blog
          </Button>
        ) : (
          <LinkButton href="/publications" variant="secondary" icon={<Undo2 size={18} aria-hidden />}>
            Revenir à ce mois-ci
          </LinkButton>
        )
      }
    >
      Les sujets de votre blog sont choisis quelques semaines à l&apos;avance : ils apparaîtront ici d&apos;eux-mêmes, puis
      chaque article sera rédigé 7 jours avant sa date.
    </EmptyState>
  );
}

/** Repère « Aujourd'hui » : un mot dans la liste, une étiquette posée sur le bord de la case dans la grille. */
function TodayTag() {
  return (
    <span className="block text-ds-meta font-semibold text-ds-section-accent xl:absolute xl:-top-2.5 xl:left-2 xl:z-10 xl:rounded-full xl:bg-ds-section-gradient-deep xl:px-2 xl:py-0.5 xl:text-xs xl:text-ds-section-on-deep xl:shadow-sm">
      Aujourd&apos;hui
    </span>
  );
}

/** Le jour : une tuile datée dans la liste (numéro et jour de la semaine), un simple numéro dans la grille. */
function DayMark({ iso, isToday }: { iso: string; isToday: boolean }) {
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  return (
    <span
      aria-hidden
      className={clsx(
        "grid size-12 shrink-0 place-items-center rounded-ds-sm text-center leading-none xl:size-7 xl:rounded-full",
        isToday
          ? "bg-ds-section-gradient-deep text-ds-section-on-deep"
          : "bg-ds-section-tint-2 text-ds-section-ink xl:bg-transparent xl:text-ds-ink-700",
      )}
    >
      <span>
        <span className="block text-lg/5 font-bold ds-tnum xl:text-ds-meta xl:font-semibold">{Number(iso.slice(8, 10))}</span>
        <span className="mt-0.5 block text-xs font-medium xl:hidden">{weekday}</span>
      </span>
    </span>
  );
}

function CalendarDay({
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
  const fullDate = formatDayFr(iso, "long");

  if (items.length === 0) {
    // Jour sans article : une case de la grille seulement — sauf aujourd'hui, qui reste un repère dans la liste
    if (!isToday) {
      return (
        <li aria-hidden className="hidden min-h-16 rounded-ds-md bg-ds-section-tint p-2.5 ring-1 ring-ds-section-line/50 xl:block">
          <DayMark iso={iso} isToday={false} />
        </li>
      );
    }
    return (
      <li
        aria-current="date"
        className="relative flex min-h-16 items-center gap-3 rounded-ds-md bg-ds-section-tint p-3 ring-2 ring-ds-section-accent xl:block xl:p-2.5"
      >
        <DayMark iso={iso} isToday />
        <span className="min-w-0 xl:mt-1.5 xl:block">
          <TodayTag />
          <span className="sr-only">{fullDate}. </span>
          <span className="block text-ds-body text-ds-ink-700 xl:text-ds-meta">Pas d&apos;article ce jour.</span>
        </span>
      </li>
    );
  }

  return (
    <li
      aria-current={isToday ? "date" : undefined}
      className={clsx(
        "relative flex flex-col rounded-ds-md bg-white shadow-ds-card xl:min-h-36 xl:ds-lift",
        isToday ? "ring-2 ring-ds-section-accent" : "ring-1 ring-ds-ink-900/5",
      )}
    >
      {items.map((item, index) => (
        <button
          key={item.articleId ?? item.entryId ?? `${item.date}-${index}`}
          type="button"
          onClick={() => onSelect(item)}
          className={clsx(
            "flex w-full flex-1 items-center gap-3 p-3 text-left ds-focus ds-press hover:bg-ds-section-tint xl:flex-col xl:items-stretch xl:gap-0 xl:p-2.5 xl:hover:bg-transparent",
            index === 0 ? "rounded-t-ds-md" : "border-t border-ds-ink-200",
            index === items.length - 1 && "rounded-b-ds-md",
          )}
        >
          <span className="sr-only">{fullDate}. </span>
          {/* Dans la grille, cette rangée porte le numéro du jour et la marque de l'IA ; dans la liste, la tuile datée seule */}
          <span className="flex shrink-0 items-center justify-between gap-1">
            <DayMark iso={iso} isToday={isToday} />
            {item.aiGenerated ? (
              <span className="hidden xl:inline-flex">
                <AiBadge>IA</AiBadge>
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1 xl:mt-1.5 xl:flex xl:flex-col">
            {isToday && index === 0 ? <TodayTag /> : null}
            <span className="line-clamp-2 text-base font-semibold text-ds-ink-900 xl:line-clamp-3 xl:text-ds-meta">{item.title}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5 xl:mt-auto xl:pt-2">
              <ArticleStatusPill status={item.status} />
              {/* Dans la liste, la marque de l'IA suit le statut : la case de la grille est trop étroite pour les deux */}
              {item.aiGenerated ? (
                <span className="inline-flex xl:hidden">
                  <AiBadge>IA</AiBadge>
                </span>
              ) : null}
            </span>
          </span>
        </button>
      ))}
    </li>
  );
}
