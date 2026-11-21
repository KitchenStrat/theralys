"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import clsx from "clsx";
import { Check, Info } from "lucide-react";
import { BrowserFrame, Capture, PhoneFrame } from "./frames";
import { Kinetic } from "./kinetic";
import { TOOLS, type Tool } from "./tools";
import { rich } from "./rich";
import { fr } from "./typo";

/** Durée d'affichage d'un outil quand la visite défile seule. */
const STEP_SECONDS = 9;

function toolVars(tool: Tool): CSSProperties {
  const { from, to, deepFrom, deepTo, soft, ink, accent } = tool.colors;
  return {
    "--t-from": from,
    "--t-to": to,
    "--t-deep-from": deepFrom,
    "--t-deep-to": deepTo,
    "--t-soft": soft,
    "--t-ink": ink,
    "--t-accent": accent,
  } as CSSProperties;
}

/**
 * Visite guidée : un onglet par outil, et pour chacun ce qu'il fait, ce qu'il
 * laisse au praticien, et une vraie capture de l'écran correspondant.
 *
 * La visite avance seule tant qu'elle est à l'écran et qu'on ne la touche pas :
 * c'est la fin de l'animation de la barre de l'onglet actif qui passe au
 * suivant (pas de minuterie à synchroniser). Elle attend au survol et au
 * focus, s'arrête pour de bon dès qu'on choisit un outil, et ne démarre jamais
 * en mouvement réduit.
 */
export function Tour() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  // Mouvement réduit : la visite ne défile pas d'elle-même
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setAuto(false);
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? false), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Les pastilles d'outil ailleurs dans la page (`a[data-tool]`) ouvrent le bon onglet
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>("a[data-tool]");
      if (!link) return;
      const index = TOOLS.findIndex((tool) => tool.id === link.dataset.tool);
      if (index < 0) return;
      setActive(index);
      setAuto(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Sur téléphone, l'onglet actif reste visible dans la bande qui défile (sans faire bouger la page)
  useEffect(() => {
    const strip = stripRef.current;
    const tab = tabRefs.current[active];
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({ left: tab.offsetLeft - (strip.clientWidth - tab.clientWidth) / 2, behavior: reduced ? "auto" : "smooth" });
  }, [active]);

  const choose = useCallback((index: number) => {
    setActive(index);
    setAuto(false);
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = TOOLS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = active === last ? 0 : active + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = active === 0 ? last : active - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    choose(next);
    tabRefs.current[next]?.focus();
  }

  const running = auto && inView && !hovered;

  return (
    <section id="outils" className="relative overflow-hidden bg-white py-24 md:py-28">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cream-300 to-transparent" />
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-3xl text-center">
          <p data-reveal className="text-base font-semibold text-primary-700">
            La visite guidée
          </p>
          <h2
            data-reveal="kinetic"
            style={{ "--rv-delay": "80ms" } as CSSProperties}
            className="font-display mt-3 text-3xl leading-tight font-bold text-balance text-ink-900 md:text-5xl"
          >
            <Kinetic>Sept outils. Un seul espace.</Kinetic>
          </h2>
          <p data-reveal style={{ "--rv-delay": "160ms" } as CSSProperties} className="mt-4 text-lg leading-relaxed text-pretty text-ink-700">
            Chaque outil fait une chose précise pour votre cabinet. Voici ce que vous trouverez dans votre espace, captures
            d&apos;écran à l&apos;appui.
          </p>
        </div>

        <div
          ref={rootRef}
          data-reveal
          data-running={running}
          data-auto={auto}
          style={{ "--rv-delay": "200ms", "--tour-step": `${STEP_SECONDS}s` } as CSSProperties}
          className="tour mt-12 lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-start lg:gap-8"
          onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocusCapture={() => setHovered(true)}
          onBlurCapture={() => setHovered(false)}
        >
          <div className="lg:sticky lg:top-24">
            <div
              ref={stripRef}
              role="tablist"
              aria-label="Les outils de Harmony"
              aria-orientation="horizontal"
              onKeyDown={onKeyDown}
              className="tour-strip -mx-5 flex gap-2 overflow-x-auto px-5 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
            >
              {TOOLS.map((tool, index) => {
                const selected = index === active;
                return (
                  <button
                    key={tool.id}
                    ref={(node) => {
                      tabRefs.current[index] = node;
                    }}
                    type="button"
                    role="tab"
                    id={`${baseId}-tab-${tool.id}`}
                    aria-selected={selected}
                    aria-controls={`${baseId}-panel-${tool.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => choose(index)}
                    style={toolVars(tool)}
                    className={clsx(
                      "tour-tab focus-ring relative flex shrink-0 items-center gap-3 rounded-2xl border py-2.5 pr-4 pl-2.5 text-left transition duration-300 lg:w-full lg:py-3 lg:pl-3",
                      selected
                        ? "border-[color-mix(in_oklab,var(--t-from)_45%,white)] bg-[var(--t-soft)] shadow-[var(--shadow-card)]"
                        : "border-transparent bg-cream-100/70 hover:bg-cream-100 lg:bg-transparent",
                    )}
                  >
                    <span className={clsx("tool-chip grid h-10 w-10 shrink-0 place-items-center rounded-xl transition duration-300", !selected && "opacity-90 saturate-[0.85]")}>
                      <tool.icon size={20} strokeWidth={2.1} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className={clsx("font-display block text-base font-bold whitespace-nowrap", selected ? "text-[var(--t-ink)]" : "text-ink-900")}>
                        {tool.name}
                      </span>
                    </span>
                    {/* La barre se remplit pendant l'affichage de l'outil ; à son terme, la visite passe au suivant */}
                    <span aria-hidden className="tour-track absolute inset-x-3 bottom-1 h-[3px] overflow-hidden rounded-full lg:inset-x-4 lg:bottom-1.5">
                      {selected ? (
                        <span
                          key={`${tool.id}-${auto}`}
                          className="tour-progress block h-full w-full rounded-full"
                          onAnimationEnd={() => setActive((current) => (current + 1) % TOOLS.length)}
                        />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tous les panneaux partagent la même case : la hauteur ne bouge pas d'un outil à l'autre */}
          <div className="mt-6 grid lg:mt-0">
            {TOOLS.map((tool, index) => {
              const selected = index === active;
              return (
                <div
                  key={tool.id}
                  role="tabpanel"
                  id={`${baseId}-panel-${tool.id}`}
                  aria-labelledby={`${baseId}-tab-${tool.id}`}
                  inert={!selected}
                  style={toolVars(tool)}
                  className={clsx(
                    "tour-panel col-start-1 row-start-1 rounded-3xl border border-cream-200 bg-[var(--t-soft)] p-5 sm:p-7 lg:p-8",
                    selected ? "is-active" : "pointer-events-none",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tool-deep inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white">
                      {tool.name}
                    </span>
                  </div>
                  <h3 className="font-display mt-4 max-w-2xl text-2xl leading-snug font-bold text-balance text-[var(--t-ink)] md:text-3xl">
                    {fr(tool.promise)}
                  </h3>
                  <ul className="mt-5 grid gap-3 md:grid-cols-3 md:gap-5">
                    {tool.points.map((point, order) => (
                      <li
                        key={point}
                        style={{ "--p": order } as CSSProperties}
                        className="tour-point flex gap-2.5 text-base leading-relaxed text-ink-700 md:flex-col md:gap-2"
                      >
                        <span className="tool-chip mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full md:mt-0">
                          <Check size={14} strokeWidth={3} aria-hidden />
                        </span>
                        <span>{rich(point)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 flex items-start gap-2 text-sm leading-relaxed text-[var(--t-ink)]">
                    <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
                    {fr(tool.note)}
                  </p>

                  {/* La capture : l'écran d'ordinateur dès la tablette, l'écran de téléphone en dessous */}
                  <div className="tour-shot mt-7 hidden md:block">
                    <BrowserFrame>
                      <Capture src={tool.desktop} alt={tool.alt} sizes="(min-width: 1200px) 760px, (min-width: 1024px) 62vw, (min-width: 768px) 88vw, 1px" />
                    </BrowserFrame>
                  </div>
                  <div className="tour-shot mx-auto mt-7 w-60 md:hidden">
                    <PhoneFrame>
                      <Capture src={tool.mobile} alt={tool.mobileAlt ?? tool.alt} sizes="(min-width: 768px) 1px, 240px" />
                    </PhoneFrame>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
