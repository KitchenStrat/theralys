"use client";

import { type CSSProperties } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";
import type { BillingPeriod } from "@theralys/db/plans";
import { useBillingPeriod } from "./billing-period";
import { CountTo } from "./count-to";
import { Kinetic } from "./kinetic";
import { fr } from "./typo";

/** Le prix d'une formule sur une durée de facturation. */
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

/** Données de formule sérialisées côté serveur depuis @theralys/db (source unique). */
export type PlanCard = {
  id: string;
  label: string;
  /** Les durées proposées pour la formule, de la plus courte à la plus longue */
  periods: PlanPeriod[];
  homeSpecialties: number;
  maxMotifPages: number;
  blogArticlesPerWeek: number;
  blogArticlesPerYear: number;
  academy: boolean;
  socialMedia: boolean;
  googleProfile: boolean;
  googleAds: boolean;
  metaAds: boolean;
};

const TAGLINES: Record<string, string> = {
  starter: "Votre site professionnel et vos statistiques.",
  scale: "Toute la solution, du site à la publicité.",
};

/** Ce que toute formule comprend. */
const BASE = [
  "Site professionnel clé en main, ou le vôtre connecté",
  "Avis Google affichés sur votre site",
  "Statistiques : visites, appels, rendez-vous",
  "Hébergement et nom de domaine inclus",
];

/** Les outils qu'une formule ajoute au socle, lus dans sa définition : une ligne par section du studio. */
function extras(plan: PlanCard): string[] {
  const ads = [plan.googleAds && "Google Ads", plan.metaAds && "Meta Ads"].filter(Boolean).join(" et ");
  return [
    plan.blogArticlesPerWeek > 0 && `Blog SEO : ${plan.blogArticlesPerYear} articles par an`,
    plan.googleProfile && "Fiche Google : audit, visibilité, avis",
    plan.socialMedia && "Réseaux sociaux : contenus prêts à poster",
    ads && `${ads} : diagnostic et plan d'action`,
    plan.maxMotifPages > 0 && `${plan.maxMotifPages} pages de spécialités dédiées`,
  ].filter((line): line is string => Boolean(line));
}

const euros = (value: number) => `${value.toLocaleString("fr-FR")}\u00a0€`;

/**
 * Tarifs : une durée à choisir, deux cartes. Chaque carte tient en quatre
 * lignes de lecture : le prix par mois, ce qu'on règle à l'échéance (et ce
 * qu'on économise), ce que la formule comprend, le bouton.
 */
export function Pricing({
  plans,
  periods,
  minCommitmentMonths,
}: {
  plans: PlanCard[];
  /** Les durées du sélecteur, dans l'ordre */
  periods: { id: BillingPeriod; label: string }[];
  minCommitmentMonths: number;
}) {
  // Partagée avec le simulateur, qui calcule sur le prix de la durée choisie ici
  const { period, setPeriod } = useBillingPeriod();
  const index = Math.max(0, periods.findIndex((option) => option.id === period));
  const periodLabel = periods[index]?.label ?? "";
  // La formule de base : les autres se décrivent par ce qu'elles lui ajoutent
  const base = plans.find((plan) => extras(plan).length === 0);

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
        <Kinetic>Deux formules, tout compris</Kinetic>
      </h2>

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
        {plans.map((plan, i) => {
          const popular = plan.id === "scale";
          // Une formule qui n'existe pas sur la durée choisie montre son tarif annuel, et le dit
          const offered = plan.periods.find((entry) => entry.id === period);
          const shown = offered ?? plan.periods.find((entry) => entry.id === "annual") ?? plan.periods[0];
          if (!shown) return null;
          const shownLabel = periods.find((option) => option.id === shown.id)?.label ?? "";
          const added = extras(plan);
          const features = added.length > 0 ? added : BASE;
          return (
            <article
              key={plan.id}
              data-reveal
              style={{ "--rv-delay": `${i * 120}ms` } as CSSProperties}
              data-spotlight
              className={clsx(
                "lift spotlight relative flex flex-col rounded-3xl p-7 sm:p-8",
                popular
                  ? "card-gradient-border card-lumen"
                  : "border border-cream-200 bg-white shadow-[var(--shadow-card)]",
              )}
            >
              {popular ? <span aria-hidden className="card-comet" /> : null}
              {popular ? (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary-600 px-4 py-1 text-xs font-bold uppercase tracking-wide text-white shadow">
                  La solution complète
                </span>
              ) : null}
              <h3 className="font-display text-2xl font-bold text-ink-900">{plan.label}</h3>
              <p className="mt-1 text-base text-ink-700">{fr(TAGLINES[plan.id] ?? "")}</p>

              <div className="mt-5 flex items-end gap-2">
                {/* Le prix file vers sa nouvelle valeur au changement de durée */}
                <span className="font-display text-5xl font-bold text-ink-900 tabular-nums">
                  <CountTo value={shown.price} format={euros} />
                </span>
                <span className="pb-1.5 text-sm text-ink-500">TTC / mois</span>
              </div>
              {/* Une seule ligne sous le prix : ce qu'on règle à l'échéance, et ce qu'on y gagne. Elle garde sa hauteur en mensuel. */}
              <p className="mt-2 min-h-10 text-sm text-ink-700 sm:min-h-5">
                {shown.total === shown.price ? null : (
                  <>
                    Soit{" "}
                    <strong className="font-semibold text-ink-900 tabular-nums">
                      <CountTo value={shown.total} format={euros} />
                    </strong>{" "}
                    {shown.cadence}
                    {shown.savedMonths > 0 ? (
                      <>
                        {/* Sur téléphone, l'économie passe à la ligne : pas de point médian laissé en bout de ligne */}
                        <span aria-hidden className="max-sm:hidden">
                          {" "}
                          ·
                        </span>{" "}
                        <span className="font-semibold whitespace-nowrap text-success-600 max-sm:block">{shown.savedMonths} mois d&apos;économies</span>
                      </>
                    ) : null}
                  </>
                )}
              </p>
              {offered ? null : (
                <p className="mt-1 text-sm text-ink-500">
                  Tarif {shownLabel.toLowerCase()}&nbsp;: {plan.label} n&apos;existe pas en «&nbsp;{periodLabel}&nbsp;».
                </p>
              )}

              <ul className="mt-6 mb-7 space-y-2.5 border-t border-cream-200 pt-6">
                {added.length > 0 && base ? <li className="text-sm font-semibold text-ink-900">Tout {base.label}, et en plus&nbsp;:</li> : null}
                {features.map((feature, order) => (
                  <li key={feature} className="flex items-start gap-2.5 text-base text-ink-700">
                    <span
                      style={{ "--draw-delay": `${order * 70}ms` } as CSSProperties}
                      className={clsx(
                        "draw mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full",
                        popular ? "bg-primary-600 text-white" : "bg-primary-100 text-primary-700",
                      )}
                    >
                      <Check size={13} strokeWidth={3} aria-hidden />
                    </span>
                    {fr(feature)}
                  </li>
                ))}
              </ul>
              <a
                href="#demo"
                data-magnetic={popular || undefined}
                className={clsx(
                  "focus-ring mt-auto block rounded-full py-3.5 text-center text-base font-semibold transition hover:-translate-y-0.5",
                  popular && "cta",
                  popular
                    ? "bg-primary-600 text-white shadow-[0_14px_30px_-10px_rgb(3_123_189/0.8)] hover:bg-primary-700"
                    : "border border-ink-300 text-ink-700 hover:border-primary-300 hover:text-primary-700",
                )}
              >
                Demander une démo
              </a>
            </article>
          );
        })}
      </div>
      <p data-reveal className="mx-auto mt-7 max-w-2xl text-center text-sm text-ink-500">
        Prix TTC, réglés d&apos;avance à chaque échéance. Budgets publicitaires Google et Meta non compris.
      </p>
    </section>
  );
}
