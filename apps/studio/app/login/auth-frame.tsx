import { ChartNoAxesCombined, Globe, ListChecks, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Ce que le praticien retrouve une fois connecté — vrai pour toutes les formules. */
const POINTS: { icon: LucideIcon; text: string }[] = [
  { icon: Globe, text: "Votre site, modifiable en quelques clics" },
  { icon: ChartNoAxesCombined, text: "Vos visites, suivies jour après jour" },
  { icon: ListChecks, text: "Vos prochaines étapes, toujours indiquées" },
];

/**
 * Cadre des pages hors coquille (connexion, création du mot de passe) : le
 * dégradé de marque en panneau latéral sur grand écran, en bandeau au-dessus
 * de la carte sur téléphone. `ds-scope` donne aux composants partagés les
 * couleurs du design system. Racine en `role="main"` et non en `<main>` : la
 * feuille partagée anime `main > * > *` par une règle qu'on ne peut pas
 * surcharger (même raison que dans la coquille).
 */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div
      role="main"
      className="ds-scope grid min-h-dvh grid-rows-[auto_1fr] bg-ds-ink-50 text-base text-ds-ink-900 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:grid-rows-1"
    >
      {/* Le seul aplat en dégradé de l'écran : dégradé de marque profond, blanc ≥ 4,5:1 partout */}
      <div className="relative isolate overflow-hidden bg-ds-brand-gradient px-6 pt-9 pb-20 text-white sm:px-10 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <span aria-hidden className="ds-band-art-deep -z-10" />
        <p className="text-center lg:text-left">
          {/* Le mot-marque, en blanc : même police que `.ds-brand-word` */}
          <span className="font-[family-name:Comfortaa,ui-sans-serif,system-ui,sans-serif] text-4xl font-bold tracking-[-0.02em] lg:text-5xl">
            Harmony
          </span>
          <span className="mt-1 block text-base font-medium lg:hidden">Votre espace praticien</span>
        </p>
        <div className="hidden lg:block">
          <p className="font-ds-display text-[2.5rem]/[1.15] font-extrabold tracking-tight text-balance">
            Bienvenue dans votre espace praticien
          </p>
          <p className="mt-4 max-w-[36ch] text-lg/7 text-pretty">
            Tout ce qui fait vivre votre cabinet en ligne, réuni au même endroit.
          </p>
          <ul className="mt-9 space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3.5 text-lg/7 font-medium">
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-ds-sm bg-ds-brand-950/30">
                  <Icon size={22} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-col items-center px-4 pb-10 sm:px-6 lg:justify-center lg:py-12">
        {/* Sur téléphone, la carte mord sur le bandeau (`relative` : elle passe au-dessus de lui) */}
        <div className="relative -mt-12 w-full max-w-md lg:mt-0">{children}</div>
      </div>
    </div>
  );
}
