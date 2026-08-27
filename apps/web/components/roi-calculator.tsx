"use client";

import { useState, type CSSProperties } from "react";

/*
 * Simulateur de revenus : le visiteur règle son trafic et son tarif de
 * séance, et compare en direct ce que convertit un site Harmony
 * (8 à 12 % des visiteurs) face à un site vitrine classique (0 à 3 %).
 */
const VISITORS = { min: 100, max: 2000, step: 50, default: 500 };
const PRICE = { min: 30, max: 120, step: 5, default: 60 };

/* Plafond commun des barres : le revenu max atteignable (2000 visiteurs × 120 € × 12 %) */
const BAR_CEILING = VISITORS.max * PRICE.max * 0.12;

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

function Slider({
  id,
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step,
}: {
  id: string;
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink-700">
          {label}
        </label>
        <span className="font-display whitespace-nowrap text-2xl font-bold text-ink-900">
          {fmt(value)}
          <span className="ml-1 text-sm font-semibold text-ink-500">{unit}</span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="range mt-3"
        style={{ "--range-pct": `${pct}%` } as CSSProperties}
      />
      <div className="mt-1.5 flex justify-between text-xs text-ink-500">
        <span>
          {fmt(min)} {unit}
        </span>
        <span>
          {fmt(max)} {unit}
        </span>
      </div>
    </div>
  );
}

export function RoiCalculator() {
  const [visitors, setVisitors] = useState(VISITORS.default);
  const [price, setPrice] = useState(PRICE.default);

  const harmonyPatientsMin = Math.round(visitors * 0.08);
  const harmonyPatientsMax = Math.round(visitors * 0.12);
  const classicPatientsMax = Math.round(visitors * 0.03);
  const harmonyRevenueMin = harmonyPatientsMin * price;
  const harmonyRevenueMax = harmonyPatientsMax * price;
  const classicRevenueMax = classicPatientsMax * price;

  const harmonyBar = Math.max(4, (harmonyRevenueMax / BAR_CEILING) * 100);
  const classicBar = Math.max(1.5, (classicRevenueMax / BAR_CEILING) * 100);

  return (
    <section id="simulateur" className="relative overflow-hidden py-24">
      <div aria-hidden data-parallax="0.06" className="absolute inset-0 -z-10">
        <div className="blob left-[-10rem] top-[6rem] h-[24rem] w-[24rem] bg-primary-200/50" />
        <div className="blob bottom-[-8rem] right-[-8rem] h-[26rem] w-[26rem] bg-[#dbeee6]" style={{ animationDelay: "-9s" }} />
      </div>

      <div className="mx-auto max-w-6xl px-5">
        <p data-reveal className="text-center text-sm font-bold uppercase tracking-[0.2em] text-primary-600">
          Simulateur de revenus
        </p>
        <h2
          data-reveal
          style={{ "--rv-delay": "80ms" } as CSSProperties}
          className="font-display mx-auto mt-3 max-w-3xl text-center text-3xl font-bold text-ink-900 md:text-5xl"
        >
          « Calculez combien mon site Harmony me rapportera »
        </h2>
        <p
          data-reveal
          style={{ "--rv-delay": "160ms" } as CSSProperties}
          className="mx-auto mt-4 max-w-2xl text-center text-lg text-ink-700"
        >
          Déplacez les curseurs : le comparatif s'actualise en direct.
        </p>

        {/* Curseurs */}
        <div
          data-reveal
          style={{ "--rv-delay": "220ms" } as CSSProperties}
          className="mx-auto mt-12 grid max-w-3xl gap-8 rounded-3xl border border-cream-200 bg-white p-7 shadow-[var(--shadow-card)] sm:grid-cols-2 md:p-8"
        >
          <Slider
            id="sim-visitors"
            label="Visiteurs sur votre site"
            unit="/ mois"
            value={visitors}
            onChange={setVisitors}
            min={VISITORS.min}
            max={VISITORS.max}
            step={VISITORS.step}
          />
          <Slider
            id="sim-price"
            label="Tarif de votre séance"
            unit="€"
            value={price}
            onChange={setPrice}
            min={PRICE.min}
            max={PRICE.max}
            step={PRICE.step}
          />
        </div>

        {/* Comparatif */}
        <div
          data-reveal
          style={{ "--rv-delay": "300ms" } as CSSProperties}
          className="relative mx-auto mt-10 grid max-w-5xl items-stretch gap-6 md:grid-cols-[1.15fr_0.85fr] md:gap-10"
        >
          {/* Pastille VS à la jonction des deux cartes */}
          <div
            aria-hidden
            className="absolute left-[calc(57.7%-0.5rem)] top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border-4 border-cream-50 bg-night-900 font-display text-sm font-bold text-white shadow-[var(--shadow-pop)] md:flex"
          >
            VS
          </div>

          {/* Côté Harmony : la vedette */}
          <article className="card-gradient-border relative rounded-3xl p-7 shadow-[var(--shadow-pop)] md:p-9">
            <span className="absolute -top-3.5 left-7 inline-flex items-center gap-2 rounded-full bg-primary-500 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow">
              <span className="dot-live h-1.5 w-1.5 rounded-full bg-white" />
              Avec votre site Harmony
            </span>
            <span className="absolute -top-3 right-5 rotate-6 rounded-xl bg-night-900 px-3 py-1.5 text-xs font-bold text-white shadow-lg">
              jusqu'à ×4 de RDV
            </span>

            <p className="mt-3 inline-block rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-700">
              8 à 12 % des visiteurs deviennent patients
            </p>

            <p className="mt-6 text-sm font-medium text-ink-500">Nouveaux patients / mois</p>
            <p className="font-display mt-1 text-4xl font-bold text-ink-900 md:text-5xl">
              {fmt(harmonyPatientsMin)} à {fmt(harmonyPatientsMax)}
            </p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-cream-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600 transition-[width] duration-500 ease-out"
                style={{ width: `${harmonyBar}%` }}
              />
            </div>

            <p className="mt-7 text-sm font-medium text-ink-500">Revenus générés / mois</p>
            <p className="font-display mt-1 text-3xl font-bold text-primary-600 md:text-4xl">
              {fmt(harmonyRevenueMin)} € à {fmt(harmonyRevenueMax)} €
            </p>
            <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-success-100 px-3 py-1 text-sm font-bold text-success-500">
              <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="currentColor" aria-hidden>
                <path d="M5 1 9 6H6v3H4V6H1L5 1Z" />
              </svg>
              soit jusqu'à {fmt(harmonyRevenueMax * 12)} € par an
            </p>

            <a
              href="#demo"
              className="mt-7 block rounded-full bg-primary-500 py-3.5 text-center text-base font-semibold text-white shadow-[0_16px_36px_-12px_rgb(14_151_221/0.8)] transition hover:-translate-y-0.5 hover:bg-primary-600"
            >
              Je veux ces résultats — voir ma démo
            </a>
          </article>

          {/* Côté site classique : volontairement en retrait */}
          <article className="relative self-center rounded-3xl border border-cream-200 bg-white/70 p-7 opacity-80 md:p-8">
            <span className="absolute -top-3.5 left-7 rounded-full bg-ink-300 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-ink-700">
              Site vitrine classique
            </span>

            <p className="mt-3 inline-block rounded-full bg-cream-100 px-3 py-1 text-xs font-bold text-ink-500">
              0 à 3 % de conversion
            </p>

            <p className="mt-6 text-sm font-medium text-ink-500">Nouveaux patients / mois</p>
            <p className="font-display mt-1 text-3xl font-bold text-ink-500">
              0 à {fmt(classicPatientsMax)}
            </p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-cream-200">
              <div
                className="h-full rounded-full bg-ink-300 transition-[width] duration-500 ease-out"
                style={{ width: `${classicBar}%` }}
              />
            </div>

            <p className="mt-7 text-sm font-medium text-ink-500">Revenus générés / mois</p>
            <p className="font-display mt-1 text-2xl font-bold text-ink-500">
              0 € à {fmt(classicRevenueMax)} €
            </p>
            <p className="mt-4 text-sm leading-relaxed text-ink-500">
              Un site qui n'est ni trouvé ni pensé pour convertir laisse passer la
            quasi-totalité de ses visiteurs.
            </p>
          </article>
        </div>

        <p
          data-reveal
          className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-ink-500"
        >
          Estimations indicatives : taux de conversion moyens constatés sur les sites
          Harmony (8 à 12 %) et sur les sites vitrines traditionnels (0 à 3 %). Vos
          résultats dépendent de votre ville, de votre spécialité et de votre trafic.
        </p>
      </div>
    </section>
  );
}
