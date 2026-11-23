"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { ChartColumn, Check, FileText, Layers, Link2, MapPin, Megaphone, MonitorSmartphone, Plus, Server, Share2, type LucideIcon } from "lucide-react";
import type { BillingPeriod, FormulaId } from "@theralys/db/plans";
import { useBillingPeriod, type FormulaChoice } from "./billing-period";
import { CountTo } from "./count-to";
import { Kinetic } from "./kinetic";
import { MEDIA, gsap, useGSAP } from "./motion/gsap";
import { fr } from "./typo";

/** Le prix d'un choix (une formule, ou les deux) sur une durée de facturation. */
export type PlanPeriod = {
  id: BillingPeriod;
  /** € TTC par mois */
  price: number;
  /** € TTC par mois en mensuel : le prix de référence, barré quand la durée fait économiser */
  monthlyPrice: number;
  /** € TTC réglés à chaque échéance */
  total: number;
  /** « tous les trimestres », « tous les ans »… */
  cadence: string;
  /** Mois de mensuel économisés sur la durée d'engagement (0 : pas d'économie) */
  savedMonths: number;
  /** La même économie, en € TTC sur la durée d'engagement */
  savedAmount: number;
  /** La même économie, en pourcentage du mensuel */
  savedPercent: number;
  /** Durée d'engagement, en mois */
  commitmentMonths: number;
};

/** Ce que représente une ligne de formule : son pictogramme. */
export type FeatureIcon = "site" | "blog" | "pages" | "hosting" | "google" | "social" | "ads" | "link" | "stats";

/** Une ligne de ce que comprend une formule. */
export type FormulaFeature = {
  icon: FeatureIcon;
  text: string;
  /** Les lignes fortes de la formule : pastille pleine, texte appuyé */
  strong?: boolean;
};

/** Une formule, sérialisée côté serveur depuis @theralys/db (source unique). */
export type FormulaCard = {
  id: FormulaId;
  label: string;
  /** Ses prix, de la durée la plus courte à la plus longue */
  periods: PlanPeriod[];
  /** Ce qu'elle comprend, une ligne par outil */
  features: FormulaFeature[];
};

const TAGLINES: Record<FormulaId, string> = {
  site: "Votre site professionnel et son blog, pour être trouvé sur Google.",
  scale: "Tous les outils pour vous faire connaître, autour de votre site.",
};

const FEATURE_ICONS: Record<FeatureIcon, LucideIcon> = {
  site: MonitorSmartphone,
  blog: FileText,
  pages: Layers,
  hosting: Server,
  google: MapPin,
  social: Share2,
  ads: Megaphone,
  link: Link2,
  stats: ChartColumn,
};

const NBSP = String.fromCharCode(160);
const euros = (value: number) => `${value.toLocaleString("fr-FR")}${NBSP}€`;
/** « 4 mois offerts », « 1 mois offert ». */
const offered = (months: number) => `${months}${NBSP}mois offert${months > 1 ? "s" : ""}`;
/** La durée sur laquelle l'économie est comptée : l'engagement. */
const commitment = (months: number) => (months % 12 === 0 && months > 12 ? `${months / 12}${NBSP}ans` : `${months}${NBSP}mois`);

/**
 * Tarifs : une durée à choisir, deux formules à cocher — l'une, l'autre ou
 * les deux. Chaque carte donne son prix, ce que la durée fait économiser et
 * ce qu'elle comprend ; le bandeau du dessous additionne la sélection et dit
 * ce qu'on règle à l'échéance.
 */
export function Pricing({
  formulas,
  totals,
  periods,
  minCommitmentMonths,
}: {
  formulas: FormulaCard[];
  /** Les prix de chaque choix : une formule seule, ou les deux */
  totals: Record<FormulaChoice, PlanPeriod[]>;
  /** Les durées du sélecteur, dans l'ordre */
  periods: { id: BillingPeriod; label: string }[];
  minCommitmentMonths: number;
}) {
  // Partagés avec le simulateur, qui calcule sur le prix du choix fait ici
  const { period, setPeriod, selection, toggleFormula, choice } = useBillingPeriod();
  const at = (entries: PlanPeriod[]) => entries.find((entry) => entry.id === period) ?? entries[0];
  const total = at(totals[choice]);
  const chosen = formulas.filter((formula) => selection[formula.id]);

  // Le bandeau accuse réception d'un changement de sélection : son libellé et son détail remontent de quelques pixels
  const section = useRef<HTMLElement>(null);
  const settled = useRef(false);
  const { contextSafe } = useGSAP(
    () => {
      if (!settled.current) {
        settled.current = true;
        return;
      }
      if (window.matchMedia(MEDIA.calm).matches) return;
      gsap.fromTo("[data-total-text]", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.05, overwrite: true, clearProps: "transform,opacity" });
    },
    { dependencies: [choice], scope: section },
  );
  // La coche de la carte marque le clic, qu'on coche ou qu'on décoche
  const toggle = contextSafe((formula: FormulaId) => {
    toggleFormula(formula);
    if (window.matchMedia(MEDIA.calm).matches) return;
    gsap.fromTo(`[data-formula="${formula}"] [data-check]`, { scale: 0.72 }, { scale: 1, duration: 0.3, overwrite: true, clearProps: "transform" });
  });

  return (
    <section ref={section} id="tarifs" className="mx-auto max-w-6xl px-5 py-24">
      <h2
        data-reveal="kinetic"
        className="font-display mx-auto max-w-2xl text-center text-3xl font-bold text-ink-900 md:text-5xl"
      >
        <Kinetic>Deux formules, à combiner</Kinetic>
      </h2>
      <p data-reveal style={{ "--rv-delay": "120ms" } as CSSProperties} className="mx-auto mt-4 max-w-xl text-center text-base text-ink-700">
        Prenez l&apos;une, l&apos;autre, ou les deux.
      </p>

      <div data-reveal style={{ "--rv-delay": "160ms" } as CSSProperties} className="mt-8 flex justify-center">
        <PeriodPicker
          periods={periods.map((option) => ({ ...option, savedMonths: totals[choice].find((entry) => entry.id === option.id)?.savedMonths ?? 0 }))}
          period={period}
          onChange={setPeriod}
        />
      </div>
      <p data-reveal style={{ "--rv-delay": "200ms" } as CSSProperties} className="mt-4 text-center text-sm font-medium text-ink-700">
        Frais de création et formation offerts. Engagement de {minCommitmentMonths} mois minimum.
      </p>

      <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
        {formulas.map((formula, i) => {
          const selected = selection[formula.id];
          const shown = at(formula.periods);
          if (!shown) return null;
          const discounted = shown.savedAmount > 0;
          return (
            // L'apparition au défilement est portée par cette enveloppe, dont les classes ne changent jamais : celles de la
            // carte changent quand on la coche, et React réécrirait alors la classe posée par l'observateur.
            <div key={formula.id} data-reveal style={{ "--rv-delay": `${i * 120}ms` } as CSSProperties} className="flex">
              <article
                data-formula={formula.id}
                data-selected={selected}
                className={clsx(
                  "relative isolate flex w-full flex-col overflow-hidden rounded-3xl border-2 bg-white p-7 shadow-[var(--shadow-card)] transition-colors duration-200 sm:p-8",
                  selected ? "border-primary-600" : "border-cream-300",
                )}
              >
                {/* La carte cochée s'éclaire depuis son coin */}
                <span
                  aria-hidden
                  className={clsx(
                    "pointer-events-none absolute -top-32 -right-32 -z-10 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,var(--color-primary-200),transparent)] transition-opacity duration-300",
                    selected ? "opacity-80" : "opacity-0",
                  )}
                />
                <div className="flex items-start justify-between gap-3">
                  <h3 className="pt-1.5 text-sm font-bold tracking-[0.18em] text-ink-900 uppercase">Formule {formula.label}</h3>
                  {/* La coche dit l'état ; le bouton sous le prix le change */}
                  <span
                    aria-hidden
                    data-check
                    className={clsx(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200",
                      selected ? "border-primary-600 bg-primary-600 text-white" : "border-ink-300 bg-white text-transparent",
                    )}
                  >
                    <Check size={18} strokeWidth={3} />
                  </span>
                </div>
                <p className="mt-2 text-base text-ink-700">{fr(TAGLINES[formula.id])}</p>

                {/* Le prix : celui du mensuel barré, celui de la durée en grand, puis ce qu'on économise et ce qu'on règle.
                    Chaque ligne garde sa hauteur en mensuel : les cartes ne bougent pas d'une durée à l'autre. */}
                <div className="mt-5" data-testid={`prix-${formula.id}`}>
                  <p className="h-5 text-sm text-ink-500 tabular-nums">
                    {discounted ? (
                      <>
                        <span className="sr-only">Au lieu de </span>
                        <s>{euros(shown.monthlyPrice)}/mois</s>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 flex items-end gap-2">
                    {/* Le prix file vers sa nouvelle valeur au changement de durée */}
                    <span className="font-title text-5xl font-bold text-ink-900 tabular-nums sm:text-6xl">
                      <CountTo value={shown.price} format={euros} />
                    </span>
                    <span className="pb-1.5 text-sm text-ink-500 sm:pb-2">TTC / mois</span>
                  </p>
                  <p className="mt-2.5 min-h-5 text-sm">
                    {discounted ? (
                      <span className="font-semibold text-success-600">
                        Économie de{" "}
                        <span className="tabular-nums">
                          <CountTo value={shown.savedAmount} format={euros} />
                        </span>{" "}
                        sur {commitment(shown.commitmentMonths)} (−{shown.savedPercent}
                        {NBSP}%)
                      </span>
                    ) : (
                      <span className="text-ink-500">Réglé chaque mois</span>
                    )}
                  </p>
                  <p className="mt-0.5 min-h-4 text-xs text-ink-500">
                    {discounted ? (
                      <>
                        Réglé d&apos;avance, soit{" "}
                        <span className="tabular-nums">
                          <CountTo value={shown.total} format={euros} />
                        </span>{" "}
                        {shown.cadence}
                      </>
                    ) : null}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => toggle(formula.id)}
                  aria-pressed={selected}
                  data-testid={`formule-${formula.id}`}
                  className={clsx(
                    "focus-ring mt-6 flex min-h-12 items-center justify-center gap-2 rounded-full border px-5 py-3 text-center text-base font-semibold transition-[background-color,border-color,color,scale] active:scale-[0.98]",
                    selected
                      ? "border-primary-300 bg-primary-50 text-primary-800 hover:border-primary-400"
                      : "border-ink-900 bg-ink-900 text-white hover:border-night-700 hover:bg-night-700",
                  )}
                >
                  {selected ? <Check size={18} strokeWidth={2.5} aria-hidden /> : <Plus size={18} strokeWidth={2.5} aria-hidden />}
                  {selected ? "Dans ma sélection" : `Ajouter la formule ${formula.label}`}
                </button>

                <ul className="mt-7 space-y-3 border-t border-cream-200 pt-6">
                  {formula.features.map((feature, order) => {
                    const Icon = FEATURE_ICONS[feature.icon];
                    return (
                      <li key={feature.text} className={clsx("flex items-start gap-3 text-base", feature.strong ? "font-semibold text-ink-900" : "text-ink-700")}>
                        <span
                          style={{ "--draw-delay": `${order * 70}ms` } as CSSProperties}
                          className={clsx(
                            "draw grid h-9 w-9 shrink-0 place-items-center rounded-full",
                            feature.strong ? "bg-primary-600 text-white" : "bg-primary-100 text-primary-700",
                          )}
                        >
                          <Icon size={18} strokeWidth={2} aria-hidden />
                        </span>
                        <span className="pt-1.5">{fr(feature.text)}</span>
                      </li>
                    );
                  })}
                </ul>
              </article>
            </div>
          );
        })}
      </div>

      {/* La sélection, additionnée : ce qu'on paie par mois et ce qu'on règle à l'échéance */}
      {total ? (
        <div
          data-reveal
          data-testid="pricing-total"
          data-choice={choice}
          className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-between gap-x-8 gap-y-5 rounded-3xl bg-ink-900 p-7 text-white sm:p-8"
        >
          <div className="min-w-0">
            <p className="flex min-h-6 flex-wrap items-center gap-2 text-sm font-semibold text-primary-200">
              Votre sélection
              {choice === "both" ? <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold text-white">Offre complète</span> : null}
            </p>
            <p data-total-text className="font-title mt-1 text-2xl font-bold" data-testid="pricing-total-label">
              {chosen.map((formula) => formula.label).join(" + ")}
            </p>
            {/* Les deux formules : le détail de l'addition */}
            <p data-total-text className="mt-1 min-h-5 text-sm text-white/80">
              {chosen.length > 1 ? chosen.map((formula) => `${formula.label} ${euros(at(formula.periods)?.price ?? 0)}`).join(" + ") : null}
            </p>
          </div>
          <div className="min-w-0">
            <p className="flex items-end gap-2">
              {total.savedAmount > 0 ? (
                <span className="pb-1.5 text-lg text-white/65 tabular-nums">
                  <span className="sr-only">Au lieu de </span>
                  <s>{euros(total.monthlyPrice)}</s>
                </span>
              ) : null}
              <span className="font-title text-5xl font-bold tabular-nums" data-testid="pricing-total-price">
                <CountTo value={total.price} format={euros} />
              </span>
              <span className="pb-1.5 text-sm text-white/80">TTC / mois</span>
            </p>
            {/* Une seule ligne sous le prix : ce qu'on règle à l'échéance, et ce qu'on y gagne. Elle garde sa hauteur en mensuel. */}
            <p className="mt-2 min-h-5 text-sm text-white/90" data-testid="pricing-total-detail">
              {total.total === total.price ? null : (
                <>
                  Soit{" "}
                  <strong className="font-semibold text-white tabular-nums">
                    <CountTo value={total.total} format={euros} />
                  </strong>{" "}
                  {total.cadence}
                  {total.savedMonths > 0 ? (
                    <>
                      {/* Sur téléphone, l'économie passe à la ligne : pas de point médian laissé en bout de ligne */}
                      <span aria-hidden className="max-sm:hidden">
                        {" "}
                        ·
                      </span>{" "}
                      <span className="font-semibold whitespace-nowrap text-[#7fe3c4] max-sm:block">{offered(total.savedMonths)}</span>
                    </>
                  ) : null}
                </>
              )}
            </p>
          </div>
          <a
            href="#demo"
            className="focus-ring-dark cta block w-full rounded-full bg-primary-600 px-8 py-3.5 text-center text-base font-semibold text-white transition-[background-color,scale] hover:bg-primary-500 active:scale-[0.98] sm:w-auto"
          >
            Demander une démo
          </a>
        </div>
      ) : null}
      <p data-reveal className="mx-auto mt-7 max-w-2xl text-center text-sm text-ink-500">
        Prix TTC, réglés d&apos;avance à chaque échéance. Budgets publicitaires Google et Meta non compris.
      </p>
    </section>
  );
}

/** Place du curseur ; `glide` : il y glisse (changement de durée) ou s'y pose d'un coup (écran redimensionné). */
type Cursor = { x: number; y: number; width: number; height: number; glide: boolean };

/**
 * Durée de facturation : une pastille par durée, avec les mois qu'elle offre.
 * Le curseur sombre glisse de l'une à l'autre ; il est posé sur la pastille
 * active d'après sa place réelle, sur une ligne (grand écran) comme sur deux
 * (téléphone). Avant cette mesure, la pastille active porte elle-même le fond.
 */
function PeriodPicker({
  periods,
  period,
  onChange,
}: {
  periods: { id: BillingPeriod; label: string; savedMonths: number }[];
  period: BillingPeriod;
  onChange: (period: BillingPeriod) => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<Cursor | null>(null);

  useEffect(() => {
    const root = group.current;
    if (!root) return;
    const place = (glide: boolean) => {
      const active = root.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!active) return;
      const next = { x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight, glide };
      setCursor((current) => (current && current.x === next.x && current.y === next.y && current.width === next.width && current.height === next.height ? current : next));
    };
    // Une durée vient d'être choisie : le curseur glisse jusqu'à elle
    place(true);
    // La place des pastilles change avec l'écran et à l'arrivée de la police : le curseur suit sans glisser
    const observer = new ResizeObserver(() => place(false));
    observer.observe(root);
    return () => observer.disconnect();
  }, [period]);

  return (
    <div
      ref={group}
      role="group"
      aria-label="Durée de facturation"
      className="relative grid w-full max-w-md grid-cols-2 gap-1 rounded-[1.75rem] border border-cream-300 bg-white p-1.5 shadow-sm md:inline-flex md:w-auto md:max-w-none md:rounded-full"
    >
      {cursor ? (
        <span
          aria-hidden
          data-period-cursor
          className={clsx(
            "pointer-events-none absolute top-0 left-0 rounded-full bg-ink-900",
            cursor.glide && "transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          )}
          style={{ width: cursor.width, height: cursor.height, transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
        />
      ) : null}
      {periods.map((option) => {
        const active = period === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            data-testid={`duree-${option.id}`}
            className={clsx(
              "focus-ring relative z-10 flex min-h-14 flex-col items-center justify-center gap-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-300 md:min-h-11 md:flex-row md:gap-2 md:py-1.5",
              option.savedMonths > 0 && "md:pr-1.5",
              active ? "text-white" : "text-ink-700 hover:text-primary-700",
              active && !cursor && "bg-ink-900",
            )}
          >
            <span>{option.label}</span>
            {option.savedMonths > 0 ? (
              <span
                className={clsx(
                  "rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap transition-colors duration-300",
                  active ? "bg-[#7fe3c4] text-ink-900" : "bg-success-100 text-success-700",
                )}
              >
                {offered(option.savedMonths)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
