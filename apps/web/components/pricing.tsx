"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import clsx from "clsx";
import { BadgePercent, CalendarCheck, GraduationCap, Info } from "lucide-react";
import type { BillingPeriod } from "@theralys/db/plans";
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
  starter: "Votre site professionnel, clé en main, et vos statistiques.",
  scale: "Toute la solution : site, blog, fiche Google, réseaux sociaux et publicité.",
};

/* Icônes des caractéristiques (traits 20×20, couleur héritée du badge) */
const ICONS: Record<string, ReactNode> = {
  share: (
    <>
      <circle cx="5" cy="10" r="2.25" />
      <circle cx="14.5" cy="4.75" r="2.25" />
      <circle cx="14.5" cy="15.25" r="2.25" />
      <path d="m7 8.9 5.5-3.1M7 11.1l5.5 3.1" strokeLinecap="round" />
    </>
  ),
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
  bulb: (
    <>
      <path d="M10 2.75a5.25 5.25 0 0 1 3 9.55c-.8.6-1.25 1.2-1.25 2.2h-3.5c0-1-.45-1.6-1.25-2.2a5.25 5.25 0 0 1 3-9.55Z" strokeLinejoin="round" />
      <path d="M8.25 17.25h3.5" strokeLinecap="round" />
    </>
  ),
  cap: (
    <>
      <path d="m10 3.5 8 3.5-8 3.5-8-3.5 8-3.5Z" strokeLinejoin="round" />
      <path d="M5.5 9.25v4C5.5 14.75 7.5 16 10 16s4.5-1.25 4.5-2.75v-4M18 7v4" strokeLinecap="round" />
    </>
  ),
  link: (
    <path
      d="M8.5 11.5a3.25 3.25 0 0 0 4.6 0l2.4-2.4a3.25 3.25 0 0 0-4.6-4.6l-.9.9M11.5 8.5a3.25 3.25 0 0 0-4.6 0l-2.4 2.4a3.25 3.25 0 0 0 4.6 4.6l.9-.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  megaphone: (
    <>
      <path d="M3.5 8.25v3.5l8.75 3.5V4.75L3.5 8.25Z" strokeLinejoin="round" />
      <path d="M6 12.75v2.5a1.5 1.5 0 0 0 3 0V14M15 7.5a3.25 3.25 0 0 1 0 5" strokeLinecap="round" />
    </>
  ),
  pin: (
    <>
      <path d="M10 17.25s-5.25-4.9-5.25-9A5.25 5.25 0 0 1 15.25 8.25c0 4.1-5.25 9-5.25 9Z" strokeLinejoin="round" />
      <circle cx="10" cy="8.25" r="1.9" />
    </>
  ),
};

type Feature = { text: string; included: boolean; highlight: boolean; icon: string };

/*
 * Ce que comprend une formule, outil par outil. Les outils réservés à Scale
 * ouvrent la liste : mis en avant quand la formule les inclut, grisés sinon.
 * Chaque ligne décrit une section réelle du studio.
 */
function featureList(plan: PlanCard): Feature[] {
  return [
    {
      text:
        plan.blogArticlesPerWeek > 0
          ? `Blog SEO : ${plan.blogArticlesPerYear} articles par an, rédigés pour vous`
          : "Blog SEO : articles rédigés pour vous",
      included: plan.blogArticlesPerWeek > 0,
      highlight: true,
      icon: "article",
    },
    {
      text: "Fiche Google : audit, carte de visibilité, avis et posts",
      included: plan.googleProfile,
      highlight: true,
      icon: "pin",
    },
    {
      text: "Réseaux sociaux : vos contenus du mois, prêts à poster",
      included: plan.socialMedia,
      highlight: true,
      icon: "share",
    },
    {
      text: "Google Ads : diagnostic, mots-clés et plan d'action",
      included: plan.googleAds,
      highlight: true,
      icon: "bulb",
    },
    {
      text: "Meta Ads : veille, annonces et plan de campagne",
      included: plan.metaAds,
      highlight: true,
      icon: "megaphone",
    },
    {
      text:
        plan.maxMotifPages > 0
          ? `${plan.maxMotifPages} pages de spécialités dédiées (référencement local)`
          : "Pages de spécialités dédiées",
      included: plan.maxMotifPages > 0,
      highlight: true,
      icon: "layers",
    },
    { text: "Site professionnel complet, livré clé en main", included: true, highlight: false, icon: "site" },
    { text: "Ou votre site existant, connecté à vos outils", included: true, highlight: false, icon: "link" },
    {
      text: `${plan.homeSpecialties} spécialités présentées sur votre accueil`,
      included: true,
      highlight: false,
      icon: "grid",
    },
    { text: "Avis Google affichés sur votre site", included: true, highlight: false, icon: "star" },
    { text: "Statistiques : visites, appels, clics de rendez-vous", included: true, highlight: false, icon: "chart" },
    { text: "Hébergement, nom de domaine et certificat de sécurité", included: true, highlight: false, icon: "server" },
    { text: "Académie : premières formations en préparation", included: plan.academy, highlight: false, icon: "cap" },
  ];
}

/** Ce que la formule comprend d'abord, ce qu'elle ne comprend pas ensuite (ordre conservé dans chaque groupe). */
function orderedFeatures(plan: PlanCard): Feature[] {
  const features = featureList(plan);
  return [...features.filter((feature) => feature.included), ...features.filter((feature) => !feature.included)];
}

const euros = (value: number) => `${value.toLocaleString("fr-FR")}\u00a0€`;

/** « 12 mois » → « Engagement 12 mois minimum » ; « 36 mois » → « Engagement de 3 ans ». */
function commitmentLabel(months: number, minimum: number): string {
  if (months <= minimum) return `Engagement ${minimum} mois minimum`;
  return months % 12 === 0 ? `Engagement de ${months / 12} ans` : `Engagement de ${months} mois`;
}

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
  const [period, setPeriod] = useState<BillingPeriod>("annual");
  const index = Math.max(0, periods.findIndex((option) => option.id === period));
  const periodLabel = periods[index]?.label ?? "";

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
      <p
        data-reveal
        style={{ "--rv-delay": "160ms" } as CSSProperties}
        className="mx-auto mt-4 max-w-xl text-center text-lg text-ink-700"
      >
        L&apos;hébergement et votre nom de domaine sont inclus dans les deux formules. Plus la durée est longue, plus le prix par
        mois baisse.
      </p>

      {/* Durée de facturation : le curseur glisse d'une durée à l'autre */}
      <div data-reveal style={{ "--rv-delay": "220ms" } as CSSProperties} className="mt-9 flex justify-center">
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

      {/* Ce qui vaut pour toutes les formules et toutes les durées */}
      <ul data-reveal style={{ "--rv-delay": "260ms" } as CSSProperties} className="mt-5 flex flex-wrap justify-center gap-2.5 text-sm font-semibold">
        <li className="inline-flex items-center gap-2 rounded-full bg-success-100 px-3.5 py-1.5 text-[#14532d]">
          <GraduationCap size={16} aria-hidden />
          Frais de création et formation offerts
        </li>
        <li className="inline-flex items-center gap-2 rounded-full bg-primary-100 px-3.5 py-1.5 text-primary-800">
          <CalendarCheck size={16} aria-hidden />
          Engagement {minCommitmentMonths} mois minimum
        </li>
      </ul>

      <div className="mx-auto mt-10 grid max-w-4xl gap-8 md:grid-cols-2">
        {plans.map((plan, i) => {
          const popular = plan.id === "scale";
          // Une formule qui n'existe pas sur la durée choisie montre son tarif annuel, et le dit
          const offered = plan.periods.find((entry) => entry.id === period);
          const shown = offered ?? plan.periods.find((entry) => entry.id === "annual") ?? plan.periods[0];
          if (!shown) return null;
          const shownLabel = periods.find((option) => option.id === shown.id)?.label ?? "";
          return (
            <article
              key={plan.id}
              data-reveal
              style={{ "--rv-delay": `${i * 120}ms` } as CSSProperties}
              data-spotlight
              className={clsx(
                "lift spotlight relative flex flex-col rounded-3xl p-8",
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
              <p className="mt-1.5 min-h-12 text-base text-ink-700">{fr(TAGLINES[plan.id] ?? "")}</p>
              <div className="mt-5 flex items-end gap-2">
                {/* Le prix file vers sa nouvelle valeur au changement de durée */}
                <span className="font-display text-5xl font-bold text-ink-900 tabular-nums">
                  <CountTo value={shown.price} format={euros} />
                </span>
                <span className="pb-1.5 text-sm text-ink-500">TTC / mois</span>
              </div>
              {/* La ligne garde sa hauteur en mensuel : la carte ne saute pas d'une durée à l'autre */}
              <p className="mt-2 min-h-7">
                {shown.savedMonths > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-100 px-3 py-1 text-sm font-bold whitespace-nowrap text-[#14532d]">
                    <BadgePercent size={15} aria-hidden />
                    {shown.savedMonths} mois d&apos;économies
                  </span>
                ) : null}
              </p>
              <p className="mt-2 text-sm text-ink-700">
                {shown.total === shown.price ? (
                  <>Réglés {shown.cadence}.</>
                ) : (
                  <>
                    Soit{" "}
                    <strong className="font-semibold text-ink-900 tabular-nums">
                      <CountTo value={shown.total} format={euros} />
                    </strong>{" "}
                    {shown.cadence}.
                  </>
                )}{" "}
                {commitmentLabel(shown.commitmentMonths, minCommitmentMonths)}.
              </p>
              {offered ? null : (
                <p className="mt-2.5 flex items-start gap-2 rounded-xl bg-cream-100 px-3 py-2 text-sm text-ink-700">
                  <Info size={16} className="mt-0.5 shrink-0 text-primary-700" aria-hidden />
                  <span>
                    {plan.label} n&apos;existe pas en formule «&nbsp;{periodLabel}&nbsp;»&nbsp;: voici son tarif {shownLabel.toLowerCase()}.
                  </span>
                </p>
              )}
              <ul className="mt-6 mb-8 space-y-3">
                {orderedFeatures(plan).map((feature, order) => (
                  <li key={feature.text} className="flex items-center gap-3 text-base">
                    <span
                      style={{ "--draw-delay": `${order * 60}ms` } as CSSProperties}
                      className={clsx(
                        "draw flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                        !feature.included
                          ? "bg-cream-100 text-ink-500"
                          : feature.highlight
                            ? "bg-primary-600 text-white shadow-[0_6px_16px_-6px_rgb(3_123_189/0.75)]"
                            : "bg-primary-100 text-primary-700",
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
                          ? "text-ink-500 line-through decoration-ink-300"
                          : feature.highlight
                            ? "font-bold text-ink-900"
                            : "text-ink-700",
                      )}
                    >
                      {feature.included ? null : <span className="sr-only">Non compris : </span>}
                      {fr(feature.text)}
                    </span>
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
      <p data-reveal className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-ink-500">
        Prix TTC. La somme de la durée choisie est réglée d&apos;avance à chaque échéance. Les budgets publicitaires Google et Meta
        ne sont pas compris dans l&apos;abonnement&nbsp;: si vous choisissez de faire de la publicité, ils sont réglés directement
        aux plateformes.
      </p>
    </section>
  );
}
