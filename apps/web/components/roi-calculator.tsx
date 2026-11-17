"use client";

import { useState, type CSSProperties } from "react";
import { Brand } from "./brand";
import { Kinetic } from "./kinetic";

/*
 * Simulateur de rentabilité. Il ne promet rien : le praticien pose ses propres
 * hypothèses (tarif, nouveaux patients venus d'internet, séances par patient)
 * et lit ce que cela représente face au prix de l'abonnement. Aucun taux de
 * conversion « constaté » n'entre dans le calcul.
 */
const PRICE = { min: 30, max: 150, step: 5, default: 60 };
const PATIENTS = { min: 1, max: 15, step: 1, default: 3 };
const SESSIONS = { min: 1, max: 10, step: 1, default: 3 };

const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")}\u00a0€`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;

function Slider({
  id,
  label,
  value,
  display,
  onChange,
  min,
  max,
  step,
  minLabel,
  maxLabel,
}: {
  id: string;
  label: string;
  value: number;
  /** Valeur lue à voix haute et affichée en grand (« 60 € », « 3 patients ») */
  display: string;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  minLabel: string;
  maxLabel: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-base font-semibold text-ink-900">
          {label}
        </label>
        <output htmlFor={id} className="font-display text-2xl font-extrabold whitespace-nowrap text-primary-700">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(event) => onChange(Number(event.target.value))}
        className="range mt-4"
        style={{ "--range-pct": `${pct}%` } as CSSProperties}
      />
      <div className="mt-2 flex justify-between text-sm text-ink-500">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

export function RoiCalculator({ monthlyCost, planLabel }: { monthlyCost: number; planLabel: string }) {
  const [price, setPrice] = useState(PRICE.default);
  const [patients, setPatients] = useState(PATIENTS.default);
  const [sessions, setSessions] = useState(SESSIONS.default);

  const revenue = price * patients * sessions;
  // Nombre de séances qui couvrent un mois d'abonnement
  const breakEven = Math.max(1, Math.ceil(monthlyCost / price));
  const ratio = revenue / monthlyCost;
  // Les deux barres partagent la même échelle : la plus longue des deux fait 100 %
  const scale = Math.max(revenue, monthlyCost);
  const revenueBar = Math.max(3, (revenue / scale) * 100);
  const costBar = Math.max(3, (monthlyCost / scale) * 100);

  return (
    <section id="simulateur" className="relative overflow-hidden py-24 md:py-28">
      <div aria-hidden data-parallax="0.06" className="absolute inset-0 -z-10">
        <div className="blob top-[6rem] left-[-10rem] h-[24rem] w-[24rem] bg-primary-200/50" />
        <div className="blob right-[-8rem] bottom-[-8rem] h-[26rem] w-[26rem] bg-[#c9f1e6]/60" style={{ animationDelay: "-9s" }} />
      </div>

      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-3xl text-center">
          <p data-reveal className="text-sm font-bold tracking-[0.18em] text-primary-700 uppercase">
            Simulateur
          </p>
          <h2
            data-reveal="kinetic"
            style={{ "--rv-delay": "80ms" } as CSSProperties}
            className="font-display mt-3 text-3xl leading-tight font-extrabold text-balance text-ink-900 md:text-5xl"
          >
            <Kinetic>
              À partir de combien de patients <Brand /> est-il rentable&nbsp;?
            </Kinetic>
          </h2>
          <p data-reveal style={{ "--rv-delay": "160ms" } as CSSProperties} className="mt-4 text-lg leading-relaxed text-pretty text-ink-700">
            Posez vos propres hypothèses&nbsp;: le calcul se met à jour sous vos yeux.
          </p>
        </div>

        <div
          data-reveal
          style={{ "--rv-delay": "220ms" } as CSSProperties}
          className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-[1fr_1.05fr] lg:gap-8"
        >
          {/* Les hypothèses du praticien */}
          <div className="grid content-between gap-8 rounded-3xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-card)] md:p-8">
            <Slider
              id="sim-price"
              label="Tarif de votre séance"
              value={price}
              display={euros(price)}
              onChange={setPrice}
              min={PRICE.min}
              max={PRICE.max}
              step={PRICE.step}
              minLabel={euros(PRICE.min)}
              maxLabel={euros(PRICE.max)}
            />
            <Slider
              id="sim-patients"
              label="Nouveaux patients venus d'internet, par mois"
              value={patients}
              display={plural(patients, "patient", "patients")}
              onChange={setPatients}
              min={PATIENTS.min}
              max={PATIENTS.max}
              step={PATIENTS.step}
              minLabel={String(PATIENTS.min)}
              maxLabel={String(PATIENTS.max)}
            />
            <Slider
              id="sim-sessions"
              label="Séances par patient, en moyenne"
              value={sessions}
              display={plural(sessions, "séance", "séances")}
              onChange={setSessions}
              min={SESSIONS.min}
              max={SESSIONS.max}
              step={SESSIONS.step}
              minLabel={String(SESSIONS.min)}
              maxLabel={String(SESSIONS.max)}
            />
          </div>

          {/* Le résultat ; sa phrase de synthèse est annoncée aux lecteurs d'écran à chaque changement */}
          <div className="card-gradient-border relative rounded-3xl p-6 shadow-[var(--shadow-pop)] md:p-8">
            <p className="text-base font-semibold text-ink-700">
              L&apos;abonnement {planLabel} est couvert dès
            </p>
            <p className="font-display mt-1 text-4xl leading-tight font-extrabold text-ink-900 md:text-5xl">
              {plural(breakEven, "séance", "séances")} <span className="text-2xl font-bold text-ink-700 md:text-3xl">par mois</span>
            </p>

            <dl className="mt-7 space-y-5">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-base font-medium text-ink-700">Ce que ces patients représentent</dt>
                  <dd className="font-display text-2xl font-extrabold whitespace-nowrap text-primary-700">{euros(revenue)}</dd>
                </div>
                <div aria-hidden className="mt-2 h-3 overflow-hidden rounded-full bg-cream-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600 transition-[width] duration-500 ease-out"
                    style={{ width: `${revenueBar}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-base font-medium text-ink-700">
                    Votre abonnement <Brand />
                  </dt>
                  <dd className="font-display text-2xl font-extrabold whitespace-nowrap text-ink-900">{euros(monthlyCost)}</dd>
                </div>
                <div aria-hidden className="mt-2 h-3 overflow-hidden rounded-full bg-cream-200">
                  <div className="h-full rounded-full bg-ink-500 transition-[width] duration-500 ease-out" style={{ width: `${costBar}%` }} />
                </div>
              </div>
            </dl>

            <p aria-live="polite" className="mt-6 rounded-2xl bg-primary-50 p-4 text-base leading-relaxed text-ink-900">
              Avec ces hypothèses, {plural(patients, "nouveau patient", "nouveaux patients")} par mois{" "}
              {patients > 1 ? "représentent" : "représente"}{" "}
              <strong className="font-bold">
                {ratio >= 1.5 ? `environ ${Math.round(ratio).toLocaleString("fr-FR")} fois` : ratio >= 1 ? "plus que" : "moins que"} le prix de
                l&apos;abonnement
              </strong>
              .
            </p>

            <a
              href="#demo"
              className="focus-ring mt-6 block rounded-full bg-primary-600 py-3.5 text-center text-base font-semibold text-white shadow-[0_16px_36px_-12px_rgb(3_123_189/0.85)] transition hover:-translate-y-0.5 hover:bg-primary-700"
            >
              Demander ma démo gratuite
            </a>
          </div>
        </div>

        <p data-reveal className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-ink-500">
          Simulation calculée à partir de vos propres hypothèses, sur le tarif de la formule {planLabel} en facturation annuelle
          ({euros(monthlyCost)} par mois). Harmony ne promet pas un nombre de patients&nbsp;: vos résultats dépendent de votre ville,
          de votre spécialité et de la concurrence.
        </p>
      </div>
    </section>
  );
}
