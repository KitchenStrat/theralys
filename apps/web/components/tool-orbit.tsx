import { type CSSProperties } from "react";
import { Brand } from "./brand";
import { TOOLS } from "./tools";

/*
 * Les outils en orbite autour de Harmony, à la manière des anneaux de Saturne :
 * un anneau incliné, sur lequel les pastilles tournent sans s'arrêter. Elles
 * passent devant la sphère sur la moitié proche, derrière sur la moitié
 * lointaine (plus petites, plus pâles). Chaque pastille ouvre l'outil dans la
 * visite guidée ; le mouvement se fige au survol ou au clavier, le temps de
 * viser. Tout est en CSS (styles .saturn dans globals.css) : rien à charger.
 */
export function ToolOrbit({ className = "", style, onDark = false }: { className?: string; style?: CSSProperties; onDark?: boolean }) {
  return (
    <div data-reveal data-intro="orbit" style={style} className={`saturn ${onDark ? "saturn--dark" : ""} ${className}`}>
      <div className="saturn-tilt">
        <span aria-hidden className="saturn-ring saturn-ring--back" />
        <div aria-hidden className="saturn-planet">
          <span className="saturn-level">
            <Brand onDark />
          </span>
        </div>
        <span aria-hidden className="saturn-ring saturn-ring--front" />
        <ul aria-label="Les outils de Harmony">
          {TOOLS.map((tool, index) => (
            <li key={tool.id} className="saturn-item" style={{ "--i": index, "--n": TOOLS.length } as CSSProperties}>
              <a
                href="#outils"
                data-tool={tool.id}
                style={{ "--t-from": tool.colors.from, "--t-to": tool.colors.to } as CSSProperties}
                className="saturn-chip focus-ring inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-cream-200 bg-white p-1.5 text-sm font-semibold text-ink-900 shadow-sm transition hover:border-primary-300 hover:shadow-md lg:pr-3.5"
              >
                <span className="tool-chip grid h-8 w-8 place-items-center rounded-full lg:h-7 lg:w-7">
                  <tool.icon size={16} strokeWidth={2.25} aria-hidden />
                </span>
                <span className="sr-only lg:not-sr-only">{tool.short}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
