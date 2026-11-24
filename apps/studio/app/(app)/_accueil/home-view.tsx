import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { AnalyticsSource } from "@theralys/shared";
import { FeedbackBand } from "@/components/avis";
import { SetupChecklist, Stagger, type SectionKey } from "@/components/ds";
import { TourAutoStart } from "@/components/visite";
import { remainingSetupTasks, type NextStep, type SetupTask } from "@/lib/accueil";
import type { CalendarItem, Period } from "@/lib/data";
import { StatsPanel } from "../stats-panel";
import { Greeting } from "./greeting";
import { NextStepAside } from "./next-step";
import { checklistSteps } from "./setup";
import { Shortcuts } from "./shortcuts";
import { SiteCard } from "./site-card";
import { UpcomingCard } from "./upcoming-card";

export type HomeViewProps = {
  firstName: string;
  period: Period;
  /** Chiffres de la période pour le site de référence (`getDashboardStats`) */
  stats: {
    visitors: number;
    rdvClicks: number;
    visitorsChangePct: number | null;
    rdvClicksChangePct: number | null;
    daily: { day: string; visitors: number; rdvClicks: number }[];
    sources: { total: number; unit: "visitors" | "views"; rows: { source: AnalyticsSource; count: number; share: number }[] };
  };
  /** Le site de référence des outils : le site Harmony (`hosted`) ou celui du praticien (`external`) */
  site: { reference: "hosted" | "external" | "none"; address: string; viewHref: string };
  /** Le site du praticien est la référence et son code de mesure n'a encore envoyé aucune visite */
  awaitingMeasure: { address: string } | null;
  /** La formule ouvre la section Réseaux sociaux (lien de bio) */
  socialAccess: boolean;
  /** Prochains contenus du calendrier ; `null` : la formule n'ouvre pas le blog, la carte n'est pas montrée */
  upcoming: readonly CalendarItem[] | null;
  /** Étapes de mise en route proposées à ce compte, lues sur son état réel (`deriveSetupTasks`) */
  setup: readonly SetupTask[];
  /** La prochaine étape choisie (`pickNextStep`) ; `null` : pas de carte */
  nextStep: NextStep | null;
  /** Sections ouvertes par la formule, hors Accueil, dans l'ordre de la navigation */
  sections: readonly SectionKey[];
};

/**
 * Place de chaque carte de la page dans la grille à deux colonnes (`xl`) : la
 * première en face de la courbe (rangée 3), la deuxième en face de la
 * provenance (rangée 4), la troisième sur toute la largeur en dessous. Avec une
 * seule carte, c'est la provenance qui prend la largeur (`sourcesWide`).
 * Classes écrites en entier : Tailwind ne lit que celles-là.
 */
const ASIDE_SLOTS = ["xl:col-start-2 xl:row-start-3", "xl:col-start-2 xl:row-start-4", "xl:col-span-2 xl:row-start-5"] as const;
/** Rang de la carte qui prend toute la largeur. */
const WIDE_SLOT = 2;

/**
 * L'Accueil, une fois ses données lues : où en est l'activité, et quoi faire
 * maintenant. Dans l'ordre : le bandeau (salutation, période résumée,
 * prochaine étape), les chiffres clés, la mise en route tant qu'il en reste,
 * le site, les prochaines publications, puis un raccourci par section ouverte.
 *
 * Un seul bouton principal à l'écran : celui de la prochaine étape, ou à
 * défaut celui de la carte « Votre site ».
 */
export function HomeView({ firstName, period, stats, site, awaitingMeasure, socialAccess, upcoming, setup, nextStep, sections }: HomeViewProps) {
  // Les cartes de la page, dans l'ordre : la mise en route tant qu'il en reste, le site, les prochaines publications
  const aside: { key: string; render: (wide: boolean) => ReactNode }[] = [];
  if (remainingSetupTasks(setup) > 0) {
    aside.push({ key: "mise-en-route", render: () => <SetupChecklist steps={checklistSteps(setup, awaitingMeasure ? "install_measure" : null)} section="accueil" /> });
  }
  aside.push({ key: "site", render: () => <SiteCard {...site} emphasis={nextStep === null} /> });
  if (upcoming) aside.push({ key: "publications", render: (wide) => <UpcomingCard items={upcoming} wide={wide} /> });

  return (
    <>
    {/* La visite d'accueil se propose d'elle-même à la première connexion (repères `data-tour` ci-dessous) */}
    <TourAutoStart tour="accueil" />
    <Stagger className="space-y-6">
      <Greeting
        firstName={firstName}
        period={period}
        stats={stats}
        topSource={stats.sources.rows[0]?.source ?? null}
        // La prochaine étape cite déjà le prochain contenu quand elle porte sur lui
        nextPublication={nextStep?.kind === "review" || nextStep?.kind === "upcoming" ? null : (upcoming?.[0]?.date ?? null)}
        awaitingMeasure={awaitingMeasure}
        aside={nextStep ? <div data-tour="accueil-etape"><NextStepAside step={nextStep} /></div> : undefined}
      />

      {/*
        Deux colonnes à partir de `xl`, rangée par rangée. Le titre des chiffres et leurs tuiles prennent toute la largeur ;
        puis la courbe et la provenance ouvrent chacune une rangée à gauche, et les cartes de la page viennent en face
        (`ASIDE_SLOTS`). Deux cartes d'une même rangée ont la même hauteur : quelle que soit la longueur de chacune
        (provenance encore vide, trois publications à venir…), aucune colonne ne laisse de vide sous elle.

        Sans chiffres à montrer (code de mesure attendu), l'état qui les remplace prend toute la largeur et les cartes
        suivantes se rangent côte à côte dessous : une colonne de gauche presque vide ne dirait rien.
      */}
      <div className={clsx("grid gap-6", awaitingMeasure ? "items-start" : "xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]")}>
        <StatsPanel
          period={period}
          // Seulement ce que le panneau affiche : il est rendu dans le navigateur, ses données voyagent avec la page
          stats={{
            visitors: stats.visitors,
            rdvClicks: stats.rdvClicks,
            visitorsChangePct: stats.visitorsChangePct,
            rdvClicksChangePct: stats.rdvClicksChangePct,
            daily: stats.daily,
          }}
          sources={stats.sources}
          socialAccess={socialAccess}
          awaitingMeasure={awaitingMeasure}
          sourcesWide={aside.length === 1}
        />

        {/*
          Une colonne jusqu'à `xl` ; au-delà, chaque carte prend sa place dans la grille (`xl:contents`).
          `min-w-0` : une cellule ne s'élargit jamais au-delà de l'écran (titre de publication, adresse longue) ;
          `grid` : la carte remplit sa cellule, donc la hauteur de sa rangée.
        */}
        <div
          className={
            awaitingMeasure
              ? "grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] items-start gap-6 *:min-w-0"
              : "flex min-w-0 flex-col gap-6 xl:contents"
          }
        >
          {aside.map((card, index) => (
            <div key={card.key} data-tour={`accueil-${card.key}`} className={clsx("grid min-w-0", awaitingMeasure ? null : ASIDE_SLOTS[index])}>
              {card.render(!awaitingMeasure && index === WIDE_SLOT)}
            </div>
          ))}
        </div>
      </div>

      <Shortcuts sections={sections} />

      {/* « Votre avis » : ouvert à toutes les formules ; ne rend rien tant que l'espace n'est pas ouvert */}
      <FeedbackBand />
    </Stagger>
    </>
  );
}
