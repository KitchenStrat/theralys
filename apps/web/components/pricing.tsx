"use client";

import { type CSSProperties } from "react";
import clsx from "clsx";
import { Check, Plus } from "lucide-react";
import type { BillingPeriod, FormulaId } from "@theralys/db/plans";
import { useBillingPeriod, type FormulaChoice } from "./billing-period";
import { CountTo } from "./count-to";
import { Kinetic } from "./kinetic";
import { fr } from "./typo";

/** Le prix d'un choix (une formule, ou les deux) sur une durée de facturation. */
export type PlanPeriod = {
  id: BillingPeriod;
  /** € TTC par mois */
  price: number;
  /** € TTC réglés à chaque échéance */
  total: number;
  /** « tous les trimestres », « tous les ans »… */
  cadence: string;
  /** Mois de mensuel économisés sur la durée d'engagement (0 : pas d'économie) */
  savedMonths: number;
  /** Durée d'engagement, en mois */
  commitmentMonths: number;
};

/** Une formule, sérialisée côté serveur depuis @theralys/db (source unique). */
export type FormulaCard = {
  id: FormulaId;
  label: string;
  /** Ses prix, de la durée la plus courte à la plus longue */
  periods: PlanPeriod[];
  /** Ce qu'elle comprend, une ligne par outil */
  features: string[];
};

const TAGLINES: Record<FormulaId, string> = {
  site: "Votre site professionnel et son blog, pour être trouvé sur Google.",
  scale: "Tous les outils pour vous faire connaître, autour de votre site.",
};

const euros = (value: number) => `${value.toLocaleString("fr-FR")}${String.fromCharCode(160)}€`;

/**
 * Tarifs : une durée à choisir, deux formules à cocher — l'une, l'autre ou
 * les deux. Chaque carte donne son prix et ce qu'elle comprend ; le bandeau
 * du dessous additionne la sélection et dit ce qu'on règle à l'échéance.
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
  const index = Math.max(0, periods.findIndex((option) => option.id === period));
  const at = (entries: PlanPeriod[]) => entries.find((entry) => entry.id === period) ?? entries[0];
  const total = at(totals[choice]);
  const chosen = formulas.filter((formula) => selection[formula.id]);

  return (
    <section id="tarifs" className="mx-auto max-w-6xl px-5 py-24">
      <p data-reveal className="text-center text-sm font-bold uppercase tracking-[0.18em] text-primary-700">
        Tarifs
      </p>
      <h2
        data-reveal="kinetic"
        style={{ "--rv-delay": "80ms" } as CSSProperties}
        className="font-display mx-auto mt-3 max-w-2xl text-center text-3xl font-bold text-ink-900 md:text-5xl"
      >
        <Kinetic>Deux formules, à combiner</Kinetic>
      </h2>
      <p data-reveal style={{ "--rv-delay": "120ms" } as CSSProperties} className="mx-auto mt-4 max-w-xl text-center text-base text-ink-700">
        Prenez l&apos;une, l&apos;autre, ou les deux.
      </p>

      {/* Durée de facturation : le curseur glisse d'une durée à l'autre */}
      <div data-reveal style={{ "--rv-delay": "160ms" } as CSSProperties} className="mt-8 flex justify-center">
        <div
          role="group"
          aria-label="Durée de facturation"
          className="relative grid w-full max-w-md rounded-full border border-cream-300 bg-white p-1 shadow-sm"
          style={{ gridTemplateColumns: `repeat(${periods.length}, minmax(0, 1fr))` }}
        >
          <span
            aria-hidden
            className="absolute inset-y-1 left-1 rounded-full bg-primary-600 transition-transform duration-300"
            style={{ width: `calc((100% - 0.5rem) / ${periods.length})`, transform: `translateX(${index * 100}%)` }}
          />
          {periods.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPeriod(option.id)}
              aria-pressed={period === option.id}
              className={clsx(
                "focus-ring relative z-10 min-h-11 rounded-full px-1 py-2.5 text-sm font-semibold transition-colors duration-300",
                period === option.id ? "text-white" : "text-ink-700 hover:text-primary-700",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <p data-reveal style={{ "--rv-delay": "200ms" } as CSSProperties} className="mt-4 text-center text-sm font-medium text-ink-700">
        Frais de création et formation offerts <span aria-hidden>·</span> Engagement {minCommitmentMonths} mois minimum
      </p>

      <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
        {formulas.map((formula, i) => {
          const selected = selection[formula.id];
          const shown = at(formula.periods);
          if (!shown) return null;
          return (
            // L'apparition au défilement est portée par cette enveloppe, dont les classes ne changent jamais : celles de la
            // carte changent quand on la coche, et React réécrirait alors la classe posée par l'observateur.
            <div key={formula.id} data-reveal style={{ "--rv-delay": `${i * 120}ms` } as CSSProperties} className="flex">
            <article
              data-spotlight
              data-formula={formula.id}
              data-selected={selected}
              className={clsx(
                "lift spotlight relative flex w-full flex-col rounded-3xl p-7 sm:p-8",
                selected ? "card-gradient-border card-lumen" : "border border-cream-300 bg-white shadow-[var(--shadow-card)]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-2xl font-bold text-ink-900">Formule {formula.label}</h3>
                {/* La coche dit l'état ; le bouton du bas le change */}
                <span
                  aria-hidden
                  className={clsx(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition-colors duration-300",
                    selected ? "border-primary-600 bg-primary-600 text-white" : "border-ink-300 bg-white text-transparent",
                  )}
                >
                  <Check size={18} strokeWidth={3} />
                </span>
              </div>
              <p className="mt-1 text-base text-ink-700">{fr(TAGLINES[formula.id])}</p>

              <div className="mt-5 flex items-end gap-2">
                {/* Le prix file vers sa nouvelle valeur au changement de durée */}
                <span className="font-display text-5xl font-bold text-ink-900 tabular-nums">
                  <CountTo value={shown.price} format={euros} />
                </span>
                <span className="pb-1.5 text-sm text-ink-500">TTC / mois</span>
              </div>

              <ul className="mt-6 mb-7 space-y-2.5 border-t border-cream-200 pt-6">
                {formula.features.map((feature, order) => (
                  <li key={feature} className="flex items-start gap-2.5 text-base text-ink-700">
                    <span
                      style={{ "--draw-delay": `${order * 70}ms` } as CSSProperties}
                      className={clsx(
                        "draw mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full",
                        selected ? "bg-primary-600 text-white" : "bg-primary-100 text-primary-700",
                      )}
                    >
                      <Check size={13} strokeWidth={3} aria-hidden />
                    </span>
                    {fr(feature)}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => toggleFormula(formula.id)}
                aria-pressed={selected}
                data-testid={`formule-${formula.id}`}
                className={clsx(
                  "focus-ring mt-auto flex min-h-12 items-center justify-center gap-2 rounded-full px-5 py-3 text-center text-base font-semibold transition hover:-translate-y-0.5",
                  selected
                    ? "border border-primary-300 bg-primary-50 text-primary-800 hover:border-primary-400"
                    : "border border-ink-300 text-ink-700 hover:border-primary-300 hover:text-primary-700",
                )}
              >
                {selected ? <Check size={18} strokeWidth={2.5} aria-hidden /> : <Plus size={18} strokeWidth={2.5} aria-hidden />}
                {selected ? "Dans ma sélection" : `Ajouter la formule ${formula.label}`}
              </button>
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
            <p className="text-sm font-semibold tracking-wide text-primary-200 uppercase">Votre sélection</p>
            <p className="font-display mt-1 text-2xl font-bold" data-testid="pricing-total-label">
              {chosen.map((formula) => formula.label).join(" + ")}
            </p>
            {/* Les deux formules : le détail de l'addition */}
            <p className="mt-1 min-h-5 text-sm text-white/80">
              {chosen.length > 1 ? chosen.map((formula) => `${formula.label} ${euros(at(formula.periods)?.price ?? 0)}`).join(" + ") : null}
            </p>
          </div>
          <div className="min-w-0">
            <p className="flex items-end gap-2">
              <span className="font-display text-5xl font-bold tabular-nums" data-testid="pricing-total-price">
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
                      <span className="font-semibold whitespace-nowrap text-[#7fe3c4] max-sm:block">{total.savedMonths} mois d&apos;économies</span>
                    </>
                  ) : null}
                </>
              )}
            </p>
          </div>
          <a
            href="#demo"
            data-magnetic
            className="focus-ring-dark cta block w-full rounded-full bg-primary-600 px-8 py-3.5 text-center text-base font-semibold text-white shadow-[0_14px_30px_-10px_rgb(3_123_189/0.8)] transition hover:-translate-y-0.5 hover:bg-primary-500 sm:w-auto"
          >
            Demander une démo
          </a>
        </div>
      ) : null}
      <p data-reveal className="mx-auto mt-7 max-w-2xl text-center text-sm text-ink-500">
        Dans chaque formule&nbsp;: statistiques et avis Google. Prix TTC, réglés d&apos;avance à chaque échéance. Budgets publicitaires Google et Meta non compris.
      </p>
    </section>
  );
}
