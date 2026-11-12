import { clsx } from "clsx";
import { Route, ShieldCheck } from "lucide-react";
import { Card, SetupChecklist } from "@/components/ds";
import { frenchSpacing } from "@/lib/external-site/format";
import { type Journey } from "./journey";

/** Hauteur de la colonne du parcours, en nombre de cartes longées (classes écrites en entier : Tailwind ne les devine pas). */
const ROW_SPAN: Record<number, string> = {
  1: "xl:row-span-1",
  2: "xl:row-span-2",
  3: "xl:row-span-3",
  4: "xl:row-span-4",
  5: "xl:row-span-5",
};

/**
 * « Votre parcours » : où l'on en est des quatre étapes, et la seule chose à
 * faire ensuite. Sous l'en-tête sur un écran étroit ; à partir de 1 280 px,
 * dans la colonne de droite, où la liste reste à l'écran pendant que l'on
 * fait défiler les cartes (`sticky`, sans transformation : la fenêtre de
 * déconnexion reste positionnée dans la page).
 */
export function JourneyAside({ journey, rows }: { journey: Journey; rows: number }) {
  return (
    <aside aria-label="Votre parcours" className={clsx("min-w-0 xl:col-start-2 xl:row-start-2", ROW_SPAN[rows])} data-testid="journey">
      <div className="xl:sticky xl:top-6">
        <SetupChecklist title="Votre parcours" steps={journey.steps} summary={journey.summary} defaultOpen={journey.open} />
      </div>
    </aside>
  );
}

const OUTLINE = [
  { title: "Connecter", text: "Vous indiquez l'adresse : nous lisons vos pages publiques, en une minute environ." },
  { title: "Relire", text: "Vous vérifiez ce que nous avons compris de votre activité, et vous corrigez si besoin." },
  { title: "Activer", text: "D'un clic, vos contenus, vos liens et vos statistiques s'appuient sur votre site." },
  { title: "Mesurer", text: "Un petit code à coller sur votre site, pour suivre ses visites ici." },
] as const;

/**
 * Avant toute connexion : ce qui se passera, en quatre étapes — les mêmes que
 * celles de « Votre parcours » ensuite. Une explication, pas une liste de
 * tâches : rien n'est demandé à qui garde son site Harmony.
 */
export function JourneyOutline() {
  return (
    <aside aria-labelledby="outline-title" className="min-w-0">
      <Card variant="tinted" padding="lg" className="h-full">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[0.625rem] bg-white text-ds-section-accent ring-1 ring-ds-section-line">
            <Route size={18} strokeWidth={2} />
          </span>
          <h2 id="outline-title" className="font-ds-display text-lg/7 font-bold text-ds-section-ink sm:text-xl/7">
            Comment ça se passe
          </h2>
        </div>
        {/* Le chiffre fait partie du texte lu : la liste n'a pas de puce propre */}
        <ol className="mt-5 space-y-4">
          {OUTLINE.map((item, index) => (
            <li key={item.title} className="flex gap-3.5">
              <span className={clsx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-white text-ds-meta font-bold text-ds-section-ink ring-1 ring-ds-section-line ds-tnum")}>{index + 1}</span>
              <p className="min-w-0 text-ds-body text-ds-ink-700">
                <span className="block text-base font-semibold text-ds-ink-900">{item.title}</span>
                {frenchSpacing(item.text)}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-5 flex items-start gap-2.5 border-t border-ds-section-line pt-4 text-ds-body text-ds-ink-700">
          <ShieldCheck size={18} aria-hidden className="mt-[3px] shrink-0 text-ds-section-accent" />
          Rien n&apos;est modifié sur votre site, et vous pouvez revenir à votre site Harmony à tout moment.
        </p>
      </Card>
    </aside>
  );
}
