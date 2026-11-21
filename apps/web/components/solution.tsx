import { type CSSProperties } from "react";
import { ChartNoAxesCombined, LayoutGrid, Sparkles, type LucideIcon } from "lucide-react";
import { Brand } from "./brand";
import { Kinetic } from "./kinetic";
import { TOOLS } from "./tools";
import { rich } from "./rich";

const BENEFITS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: LayoutGrid,
    title: "Un seul espace",
    text: "Site, blog, fiche Google, réseaux sociaux, publicité, statistiques : **un seul accès, un seul abonnement**.",
  },
  {
    icon: Sparkles,
    title: "Le travail est préparé pour vous",
    text: "Articles rédigés, visuels créés, plans d'action écrits : **il vous reste à relire, ajuster et valider**.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Vous savez ce que ça donne",
    text: "Visites, appels, clics de rendez-vous, provenance : **vos chiffres, expliqués sans jargon**.",
  },
];

/* Schéma : les outils en cercle autour de Harmony (repère 600 × 600, centre 300 ; 300) */
const SIZE = 600;
const CENTER = SIZE / 2;
const RADIUS = 222;

const NODES = TOOLS.map((tool, index) => {
  const angle = (-90 + (index * 360) / TOOLS.length) * (Math.PI / 180);
  const x = CENTER + RADIUS * Math.cos(angle);
  const y = CENTER + RADIUS * Math.sin(angle);
  // Faisceau légèrement courbe, du centre vers l'outil
  const bend = index % 2 === 0 ? 26 : -26;
  const mx = (CENTER + x) / 2 + bend * Math.cos(angle + Math.PI / 2);
  const my = (CENTER + y) / 2 + bend * Math.sin(angle + Math.PI / 2);
  return { tool, x, y, path: `M ${CENTER} ${CENTER} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}` };
});

export function Solution() {
  return (
    <section id="solution" className="relative overflow-hidden py-24 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        <div>
          <h2
            data-reveal="kinetic"
            className="font-display text-3xl leading-tight font-bold text-balance text-ink-900 md:text-[2.75rem]"
          >
            <Kinetic>Vous êtes thérapeute. Pas webmaster, rédacteur, community manager et publicitaire.</Kinetic>
          </h2>
          <p data-reveal style={{ "--rv-delay": "160ms" } as CSSProperties} className="mt-5 text-xl leading-relaxed font-semibold text-pretty text-ink-900">
            Avec Harmony, tout est au même endroit, et le gros du travail est fait pour vous.
          </p>

          <ul className="mt-9 space-y-6">
            {BENEFITS.map((benefit, index) => (
              <li
                key={benefit.title}
                data-reveal
                style={{ "--rv-delay": `${240 + index * 100}ms` } as CSSProperties}
                className="flex gap-4"
              >
                <span className="draw grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-100 text-primary-700 ring-1 ring-primary-200">
                  <benefit.icon size={22} aria-hidden />
                </span>
                <div>
                  <h3 className="font-title text-xl font-bold text-ink-900">{benefit.title}</h3>
                  <p className="mt-1 leading-relaxed text-ink-700">{rich(benefit.text)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Tout part de Harmony : les sept outils, chacun relié au centre */}
        <div data-hub className="relative mx-auto aspect-square w-full max-w-[34rem]">
          <svg aria-hidden viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full">
            <circle cx={CENTER} cy={CENTER} r={RADIUS} className="hub-orbit" />
            <circle cx={CENTER} cy={CENTER} r={132} className="hub-orbit hub-orbit--inner" />
            {/* Une liaison par outil, à sa couleur : elle se trace depuis Harmony à l'entrée dans l'écran (cf. `MotionDirector`) */}
            {NODES.map(({ tool, path }) => (
              <path key={tool.id} d={path} className="hub-line" style={{ stroke: tool.colors.from }} />
            ))}
          </svg>

          <div className="absolute top-1/2 left-1/2 grid h-[27%] w-[27%] -translate-x-1/2 -translate-y-1/2 place-items-center">
            <span className="hub-core grid h-full w-full place-items-center rounded-full text-[clamp(0.95rem,3.4vw,1.5rem)]">
              <Brand onDark />
            </span>
          </div>

          <ul aria-label="Les outils réunis dans Harmony">
            {NODES.map(({ tool, x, y }) => (
              <li
                key={tool.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${(x / SIZE) * 100}%`, top: `${(y / SIZE) * 100}%` }}
              >
                <span
                  className="hub-node flex flex-col items-center gap-1.5 rounded-2xl border border-cream-200 bg-white px-2 py-2 text-center shadow-[var(--shadow-card)] sm:px-3 sm:py-2.5"
                  style={{ "--t-from": tool.colors.from, "--t-to": tool.colors.to } as CSSProperties}
                >
                  <span className="tool-chip grid h-9 w-9 place-items-center rounded-xl sm:h-11 sm:w-11">
                    <tool.icon size={20} strokeWidth={2.1} aria-hidden />
                  </span>
                  <span className="text-[0.7rem] leading-tight font-semibold whitespace-nowrap text-ink-900 sm:text-sm">{tool.short}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
