import { clsx } from "clsx";
import type { AnalyticsSource } from "@theralys/shared";
import { SetupChecklist, Stagger, type SectionKey } from "@/components/ds";
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
  site: { reference: "hosted" | "external"; address: string; viewHref: string };
  /** Le site du praticien est la référence et son code de mesure n'a encore envoyé aucune visite */
  awaitingMeasure: { address: string } | null;
  /** La formule ouvre la section Réseaux sociaux (lien de bio) */
  socialAccess: boolean;
  /** Prochains contenus du calendrier ; `null` : la formule n'ouvre pas le blog, la carte n'est pas montrée */
  upcoming: readonly CalendarItem[] | null;
  /** Étapes de mise en route proposées à ce compte (`availableSetupTasks`) */
  setup: readonly SetupTask[];
  /** La prochaine étape choisie (`pickNextStep`) ; `null` : pas de carte */
  nextStep: NextStep | null;
  /** Sections ouvertes par la formule, hors Accueil, dans l'ordre de la navigation */
  sections: readonly SectionKey[];
};

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
  return (
    <Stagger className="space-y-6">
      <Greeting
        firstName={firstName}
        period={period}
        stats={stats}
        topSource={stats.sources.rows[0]?.source ?? null}
        // La prochaine étape cite déjà le prochain contenu quand elle porte sur lui
        nextPublication={nextStep?.kind === "review" || nextStep?.kind === "upcoming" ? null : (upcoming?.[0]?.date ?? null)}
        awaitingMeasure={awaitingMeasure}
        aside={nextStep ? <NextStepAside step={nextStep} /> : undefined}
      />

      {/*
        Deux colonnes à partir de `xl` : les chiffres à gauche (leur titre et leurs tuiles sur toute la largeur), le reste à
        droite. Sans chiffres à montrer (code de mesure attendu), l'état qui les remplace prend toute la largeur et les cartes
        suivantes se rangent côte à côte dessous : une colonne de gauche presque vide ne dirait rien.
      */}
      <div className={clsx("grid items-start gap-6", awaitingMeasure ? "" : "xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]")}>
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
        />

        {/* `min-w-0` : une colonne ne s'élargit jamais au-delà de l'écran (titre de publication, adresse longue) */}
        <div
          className={
            awaitingMeasure
              ? "grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] items-start gap-6 *:min-w-0"
              : "min-w-0 space-y-6"
          }
        >
          {remainingSetupTasks(setup) > 0 ? <SetupChecklist steps={checklistSteps(setup)} section="accueil" /> : null}
          <SiteCard {...site} emphasis={nextStep === null} />
          {upcoming ? <UpcomingCard items={upcoming} /> : null}
        </div>
      </div>

      <Shortcuts sections={sections} />
    </Stagger>
  );
}
