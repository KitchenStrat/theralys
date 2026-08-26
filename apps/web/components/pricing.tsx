"use client";

import { useState, type CSSProperties } from "react";
import clsx from "clsx";

/** Données de formule sérialisées côté serveur depuis @theralys/db (source unique). */
export type PlanCard = {
  id: string;
  label: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  homeSpecialties: number;
  maxMotifPages: number;
  blogArticlesPerWeek: number;
  blogArticlesPerYear: number;
  searchConsoleAccess: boolean;
};

const TAGLINES: Record<string, string> = {
  starter: "L'essentiel pour exister en ligne avec élégance.",
  boost: "La croissance en automatique : SEO, blog et suivi complet.",
};

function featureList(plan: PlanCard): { text: string; included: boolean }[] {
  return [
    { text: "Site professionnel complet, livré clé en main", included: true },
    { text: `${plan.homeSpecialties} spécialités présentées sur votre accueil`, included: true },
    {
      text:
        plan.maxMotifPages > 0
          ? `${plan.maxMotifPages} pages de spécialités dédiées (SEO local)`
          : "Pages de spécialités dédiées",
      included: plan.maxMotifPages > 0,
    },
    {
      text:
        plan.blogArticlesPerWeek > 0
          ? `Blog automatisé : ${plan.blogArticlesPerWeek} articles/semaine (${plan.blogArticlesPerYear}/an)`
          : "Blog automatisé",
      included: plan.blogArticlesPerWeek > 0,
    },
    { text: "Suivi des mots-clés Google", included: plan.searchConsoleAccess },
    { text: "Avis Google synchronisés sur votre site", included: true },
    { text: "Statistiques de visites et d'appels", included: true },
    { text: "Hébergement, nom de domaine et SSL inclus", included: true },
  ];
}

export function Pricing({ plans }: { plans: PlanCard[] }) {
  const [period, setPeriod] = useState<"annual" | "monthly">("annual");

  return (
    <section id="tarifs" className="mx-auto max-w-6xl px-5 py-24">
      <p data-reveal className="text-center text-sm font-bold uppercase tracking-[0.2em] text-primary-600">
        Des tarifs simples, tout compris
      </p>
      <h2
        data-reveal
        style={{ "--rv-delay": "80ms" } as CSSProperties}
        className="font-display mx-auto mt-3 max-w-2xl text-center text-3xl font-bold text-ink-900 md:text-5xl"
      >
        Choisissez votre rythme de croissance
      </h2>
      <p
        data-reveal
        style={{ "--rv-delay": "160ms" } as CSSProperties}
        className="mx-auto mt-4 max-w-xl text-center text-lg text-ink-700"
      >
        Aucun frais de création. Deux formules, et tout est inclus — jusqu'à
        l'hébergement et votre nom de domaine.
      </p>

      {/* Bascule mensuel / annuel */}
      <div data-reveal style={{ "--rv-delay": "220ms" } as CSSProperties} className="mt-9 flex justify-center">
        <div className="relative flex rounded-full border border-cream-300 bg-white p-1 shadow-sm">
          <span
            aria-hidden
            className={clsx(
              "absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-full bg-primary-500 transition-all duration-300",
              period === "monthly" ? "left-1" : "left-[calc(50%+0.05rem)]",
            )}
          />
          {(
            [
              { id: "monthly", label: "Mensuel" },
              { id: "annual", label: "Annuel −30 %" },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPeriod(option.id)}
              className={clsx(
                "relative z-10 w-36 rounded-full py-2.5 text-sm font-semibold transition-colors duration-300",
                period === option.id ? "text-white" : "text-ink-700 hover:text-primary-700",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-8 md:grid-cols-2">
        {plans.map((plan, i) => {
          const popular = plan.id === "boost";
          const price = period === "annual" ? plan.annualMonthlyPrice : plan.monthlyPrice;
          return (
            <article
              key={plan.id}
              data-reveal
              style={{ "--rv-delay": `${i * 120}ms` } as CSSProperties}
              className={clsx(
                "lift relative rounded-3xl p-8",
                popular
                  ? "card-gradient-border shadow-[var(--shadow-pop)]"
                  : "border border-cream-200 bg-white shadow-[var(--shadow-card)]",
              )}
            >
              {popular ? (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary-500 px-4 py-1 text-xs font-bold uppercase tracking-wide text-white shadow">
                  Le plus choisi
                </span>
              ) : null}
              <h3 className="font-display text-2xl font-bold text-ink-900">{plan.label}</h3>
              <p className="mt-1.5 min-h-12 text-sm text-ink-500">{TAGLINES[plan.id] ?? ""}</p>
              <div className="mt-5 flex items-end gap-2">
                <span key={`${plan.id}-${period}`} className="font-display animate-[price-in_0.35s_ease] text-5xl font-bold text-ink-900">
                  {price}&nbsp;€
                </span>
                <span className="pb-1.5 text-sm text-ink-500">/ mois</span>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                {period === "annual"
                  ? "Engagement 12 mois — le meilleur tarif"
                  : "Sans engagement, résiliable à tout moment"}
              </p>
              <ul className="mt-6 space-y-2.5">
                {featureList(plan).map((feature) => (
                  <li key={feature.text} className="flex items-start gap-2.5 text-sm">
                    {feature.included ? (
                      <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="m2.5 8.5 3.5 3.5 7-8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M3 8h10" strokeLinecap="round" />
                      </svg>
                    )}
                    <span className={feature.included ? "text-ink-700" : "text-ink-500 line-through decoration-ink-300"}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>
              <a
                href="#demo"
                className={clsx(
                  "mt-8 block rounded-full py-3.5 text-center text-base font-semibold transition hover:-translate-y-0.5",
                  popular
                    ? "bg-primary-500 text-white shadow-[0_14px_30px_-10px_rgb(14_151_221/0.8)] hover:bg-primary-600"
                    : "border border-ink-300 text-ink-700 hover:border-primary-300 hover:text-primary-700",
                )}
              >
                Demander une démo
              </a>
            </article>
          );
        })}
      </div>
      <style>{`@keyframes price-in { from { opacity: 0; translate: 0 8px; } to { opacity: 1; translate: 0 0; } }`}</style>
    </section>
  );
}
