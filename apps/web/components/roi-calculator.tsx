"use client";

import { useState, useTransition, type CSSProperties, type FormEvent } from "react";
import { ESTIMATE_BOUNDS, ESTIMATE_PERIOD_PHRASES, estimateEuros as euros, estimatePlural as plural, roiComparison, roiFigures } from "@theralys/db/estimate";
import type { BillingPeriod } from "@theralys/db/plans";
import { emailEstimate } from "@/app/actions";
import { useBillingPeriod, type FormulaChoice } from "./billing-period";
import { Kinetic } from "./kinetic";

/*
 * Simulateur de rentabilité. Il ne promet rien : le praticien pose ses propres
 * hypothèses (tarif, nouveaux patients venus d'internet, séances par patient)
 * et lit ce que cela représente face au prix de l'abonnement. Aucun taux de
 * conversion « constaté » n'entre dans le calcul.
 *
 * Le prix de l'abonnement est celui de la durée de facturation choisie dans la
 * grille tarifaire, juste au-dessus : passer en mensuel ou sur 3 ans là-haut
 * change le montant et le seuil de rentabilité ici.
 *
 * Les bornes et le calcul viennent de `@theralys/db/estimate`, que l'e-mail
 * « Recevoir mon estimation » partage : la page et l'e-mail disent la même
 * chose.
 */
const { price: PRICE, patients: PATIENTS, sessions: SESSIONS } = ESTIMATE_BOUNDS;

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
        <output htmlFor={id} className="font-title text-2xl font-bold whitespace-nowrap text-primary-700">
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

export function RoiCalculator({
  prices,
  labels,
  byEmail = false,
}: {
  /** Le prix par mois de chaque choix (une formule seule, ou les deux) sur chacune des durées de facturation */
  prices: Record<FormulaChoice, { id: BillingPeriod; price: number }[]>;
  /** Le nom de chaque choix : « Site », « Scale », « Site + Scale » */
  labels: Record<FormulaChoice, string>;
  /** L'estimation peut partir par e-mail (service d'envoi configuré) : sinon, la page ne le propose pas */
  byEmail?: boolean;
}) {
  // Le calcul suit le choix fait dans les tarifs : les formules cochées, sur la durée choisie
  const { period, choice } = useBillingPeriod();
  const planLabel = labels[choice];
  const offered = prices[choice];
  const current = offered.find((entry) => entry.id === period) ?? offered.find((entry) => entry.id === "annual") ?? offered[0];
  const monthlyCost = current?.price ?? 0;
  const periodPhrase = current ? ESTIMATE_PERIOD_PHRASES[current.id] : "";
  // La synthèse n'est annoncée que pendant qu'on manipule le simulateur, pas quand la durée change depuis les tarifs
  const [engaged, setEngaged] = useState(false);
  const [price, setPrice] = useState<number>(PRICE.default);
  const [patients, setPatients] = useState<number>(PATIENTS.default);
  const [sessions, setSessions] = useState<number>(SESSIONS.default);

  // Le revenu, le nombre de séances qui couvrent un mois d'abonnement, et leur rapport
  const { revenue, breakEven, ratio } = roiFigures(price, patients, sessions, monthlyCost);
  // Les deux barres partagent la même échelle : la plus longue des deux fait 100 %
  const scale = Math.max(revenue, monthlyCost);
  const revenueBar = Math.max(3, (revenue / scale) * 100);
  const costBar = Math.max(3, (monthlyCost / scale) * 100);

  return (
    <section id="simulateur" className="relative overflow-hidden py-24 md:py-28">

      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            data-reveal="kinetic"
            className="font-display text-3xl leading-tight font-bold text-balance text-ink-900 md:text-5xl"
          >
            <Kinetic>
              À partir de combien de patients Harmony est-il rentable&nbsp;?
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
          <div
            onFocus={() => setEngaged(true)}
            onBlur={() => setEngaged(false)}
            className="grid content-between gap-8 rounded-3xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-card)] md:p-8"
          >
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
          <div className="relative rounded-3xl border border-cream-300 bg-white p-6 shadow-[var(--shadow-card)] md:p-8">
            <p className="text-base font-semibold text-ink-700">
              L&apos;abonnement {planLabel} est couvert dès
            </p>
            <p className="font-display mt-1 text-4xl leading-tight font-bold text-ink-900 md:text-5xl">
              {plural(breakEven, "séance", "séances")} <span className="text-2xl font-bold text-ink-700 md:text-3xl">par mois</span>
            </p>

            <dl className="mt-7 space-y-5">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-base font-medium text-ink-700">Ce que ces patients représentent</dt>
                  <dd className="font-title text-2xl font-bold whitespace-nowrap text-primary-700">{euros(revenue)}</dd>
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
                    Votre abonnement Harmony <span className="whitespace-nowrap text-ink-500">{periodPhrase}</span>
                  </dt>
                  <dd className="font-title text-2xl font-bold whitespace-nowrap text-ink-900">{euros(monthlyCost)}</dd>
                </div>
                <div aria-hidden className="mt-2 h-3 overflow-hidden rounded-full bg-cream-200">
                  <div className="h-full rounded-full bg-ink-500 transition-[width] duration-500 ease-out" style={{ width: `${costBar}%` }} />
                </div>
              </div>
            </dl>

            <p aria-live={engaged ? "polite" : "off"} className="mt-6 rounded-2xl bg-primary-50 p-4 text-base leading-relaxed text-ink-900">
              Avec ces hypothèses, {plural(patients, "nouveau patient", "nouveaux patients")} par mois{" "}
              {patients > 1 ? "représentent" : "représente"}{" "}
              <strong className="font-bold">
                {roiComparison(ratio)} le prix de l&apos;abonnement
              </strong>
              .
            </p>

            <a
              href="#demo"
              className="focus-ring mt-6 block rounded-full bg-primary-600 py-3.5 text-center text-base font-semibold text-white shadow-md shadow-black/15 transition-[background-color,border-color,color,scale] active:scale-[0.98] hover:bg-primary-700"
            >
              Demander ma démo gratuite
            </a>
          </div>
        </div>

        {byEmail && current ? <EstimateByEmail estimate={{ price, patients, sessions, choice, period: current.id }} /> : null}

        <p data-reveal className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-ink-500">
          Simulation sur vos propres hypothèses, au tarif {planLabel} {periodPhrase} ({euros(monthlyCost)} par mois). Harmony ne
          promet pas un nombre de patients&nbsp;: vos résultats dépendent de votre ville, de votre spécialité et de la concurrence.
        </p>
      </div>
    </section>
  );
}

/**
 * « Recevoir mon estimation par e-mail » : les hypothèses en cours partent
 * avec l'adresse ; le calcul est refait côté serveur avant l'envoi.
 */
function EstimateByEmail({ estimate }: { estimate: { price: number; patients: number; sessions: number; choice: FormulaChoice; period: BillingPeriod } }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const email = String(data.email ?? "").trim();
    if (!/^\S+@\S+\.\S{2,}$/.test(email)) {
      setError("Indiquez une adresse e-mail valide.");
      form.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
      return;
    }
    startTransition(async () => {
      try {
        const outcome = await emailEstimate({ email, website: data.website, estimate });
        if (outcome.ok) setSentTo(email);
        else setError(outcome.error);
      } catch {
        setError("L'envoi a échoué — vérifiez votre connexion et réessayez.");
      }
    });
  }

  const SHELL = "mx-auto mt-6 max-w-5xl rounded-3xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)] md:px-8 md:py-6";
  if (sentTo) {
    return (
      <p role="status" data-testid="estimation-envoyee" className={`${SHELL} text-base leading-relaxed text-ink-900`}>
        C&apos;est parti&nbsp;: votre estimation arrive à <strong className="font-semibold break-all">{sentTo}</strong>. Pensez à regarder vos courriers indésirables.
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate data-reveal data-testid="estimation-par-email" className={`${SHELL} grid items-center gap-x-8 gap-y-3 lg:grid-cols-[1fr_1.05fr]`}>
      <div>
        <label htmlFor="sim-email" className="font-title text-lg font-bold text-ink-900">
          Recevoir mon estimation par e-mail
        </label>
        <p id="sim-email-note" className="mt-1 text-sm leading-relaxed text-ink-500">
          Vos hypothèses et le calcul, à garder sous la main. Un conseiller peut vous recontacter à ce sujet.
        </p>
      </div>
      <div>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            id="sim-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="vous@exemple.fr"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "sim-email-error sim-email-note" : "sim-email-note"}
            className="min-h-12 w-full min-w-0 flex-1 rounded-full border border-ink-300 bg-white px-5 py-3 text-base text-ink-900 placeholder:text-ink-500 outline-none transition focus:border-primary-600 focus:ring-4 focus:ring-primary-200"
          />
          {/* Piège anti-robots, invisible pour les humains */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <button
            type="submit"
            disabled={busy}
            className="focus-ring min-h-12 shrink-0 rounded-full border border-primary-600 bg-white px-6 py-3 text-base font-semibold text-primary-800 transition-[background-color,scale] hover:bg-primary-50 active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Envoi…" : "Envoyer"}
          </button>
        </div>
        {error ? (
          <p id="sim-email-error" role="alert" className="mt-2 text-sm font-medium text-[#b91c1c]">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
