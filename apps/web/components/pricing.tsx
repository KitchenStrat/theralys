"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
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

/* Icônes des caractéristiques (traits 20×20, couleur héritée du badge) */
const ICONS: Record<string, ReactNode> = {
  article: (
    <>
      <path d="M5.5 2.75h6.25l3.25 3.25v11.25H5.5z" strokeLinejoin="round" />
      <path d="M11.5 2.75V6.5h3.5M8 10h4.5M8 13h4.5" strokeLinecap="round" />
    </>
  ),
  layers: (
    <>
      <path d="m10 3 7 3.75L10 10.5 3 6.75 10 3Z" strokeLinejoin="round" />
      <path d="m3 10.5 7 3.75 7-3.75M3 14l7 3.75L17 14" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  search: (
    <>
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="m12.75 12.75 4 4M7 8.75h3.5M8.75 7v3.5" strokeLinecap="round" />
    </>
  ),
  site: (
    <>
      <rect x="2.75" y="3.75" width="14.5" height="10" rx="1.5" />
      <path d="M7.5 17h5M10 13.75V17M2.75 7h14.5" strokeLinecap="round" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </>
  ),
  star: (
    <path
      d="m10 2.75 2.2 4.55 5 .7-3.65 3.5.9 4.95L10 14.1l-4.45 2.35.9-4.95-3.65-3.5 5-.7L10 2.75Z"
      strokeLinejoin="round"
    />
  ),
  chart: <path d="M3.5 16.5h13M5.75 16.5v-6M10 16.5V5.5M14.25 16.5v-4" strokeLinecap="round" />,
  server: (
    <>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M2.75 10h14.5M10 2.75c-4.5 4.5-4.5 10 0 14.5 4.5-4.5 4.5-10 0-14.5Z" strokeLinecap="round" />
    </>
  ),
};

type Feature = { text: string; included: boolean; highlight: boolean; icon: string };

/*
 * Les trois différenciateurs (blog SEO, pages dédiées, suivi des mots-clés)
 * ouvrent la liste, mis en avant quand la formule les inclut, élégamment
 * grisés sinon.
 */
function featureList(plan: PlanCard): Feature[] {
  return [
    {
      text:
        plan.blogArticlesPerWeek > 0
          ? `${plan.blogArticlesPerYear} articles de blog SEO / an`
          : "Articles de blog SEO automatisés",
      included: plan.blogArticlesPerWeek > 0,
      highlight: true,
      icon: "article",
    },
    {
      text:
        plan.maxMotifPages > 0
          ? `${plan.maxMotifPages} pages de spécialités dédiées (SEO local)`
          : "Pages de spécialités dédiées",
      included: plan.maxMotifPages > 0,
      highlight: true,
      icon: "layers",
    },
    {
      text: "Suivi des mots-clés Google",
      included: plan.searchConsoleAccess,
      highlight: true,
      icon: "search",
    },
    { text: "Site professionnel complet, livré clé en main", included: true, highlight: false, icon: "site" },
    {
      text: `${plan.homeSpecialties} spécialités présentées sur votre accueil`,
      included: true,
      highlight: false,
      icon: "grid",
    },
    { text: "Avis Google synchronisés sur votre site", included: true, highlight: false, icon: "star" },
    { text: "Statistiques de visites et d'appels", included: true, highlight: false, icon: "chart" },
    { text: "Hébergement, nom de domaine et SSL inclus", included: true, highlight: false, icon: "server" },
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
              data-spotlight
              className={clsx(
                "lift spotlight relative rounded-3xl p-8",
                popular
                  ? "card-gradient-border card-lumen"
                  : "border border-cream-200 bg-white shadow-[var(--shadow-card)]",
              )}
            >
              {popular ? <span aria-hidden className="card-comet" /> : null}
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
              <ul className="mt-6 space-y-3">
                {featureList(plan).map((feature) => (
                  <li key={feature.icon} className="flex items-center gap-3 text-sm">
                    <span
                      className={clsx(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                        !feature.included
                          ? "bg-cream-100 text-ink-300"
                          : feature.highlight
                            ? "bg-primary-500 text-white shadow-[0_6px_16px_-6px_rgb(14_151_221/0.75)]"
                            : "bg-primary-100 text-primary-600",
                      )}
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className="h-4.5 w-4.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        aria-hidden
                      >
                        {ICONS[feature.icon]}
                      </svg>
                    </span>
                    <span
                      className={clsx(
                        !feature.included
                          ? "text-ink-300 line-through decoration-ink-300"
                          : feature.highlight
                            ? "font-bold text-ink-900"
                            : "text-ink-700",
                      )}
                    >
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
