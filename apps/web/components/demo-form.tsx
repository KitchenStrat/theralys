"use client";

import { useState, useTransition, type CSSProperties, type FormEvent } from "react";
import { requestDemo } from "@/app/actions";

const STEPS = [
  {
    title: "Nous préparons votre démo",
    text: "Un site complet, généré pour votre pratique et votre ville — pas une maquette générique.",
  },
  {
    title: "Vous découvrez votre futur site",
    text: "On ajuste ensemble les couleurs, les textes et les photos jusqu'à ce qu'il vous ressemble.",
  },
  {
    title: "Vous décidez, sereinement",
    text: "La démo est gratuite et sans engagement. Si elle vous plaît, votre site part en ligne.",
  },
];

export function DemoForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    startTransition(async () => {
      const outcome = await requestDemo(data);
      if (outcome.ok) setSent(true);
      else setError(outcome.error);
    });
  }

  const inputClass =
    "w-full rounded-xl border border-cream-300 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-300 outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-100";

  return (
    <section id="demo" className="relative overflow-hidden py-24">
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="blob right-[-10rem] top-[-4rem] h-[26rem] w-[26rem] bg-primary-200/60" />
        <div className="blob bottom-[-10rem] left-[-8rem] h-[24rem] w-[24rem] bg-[#dbeee6]" style={{ animationDelay: "-11s" }} />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2">
        <div>
          <p data-reveal className="text-sm font-bold uppercase tracking-[0.2em] text-primary-600">
            Démo gratuite
          </p>
          <h2
            data-reveal
            style={{ "--rv-delay": "80ms" } as CSSProperties}
            className="font-display mt-3 text-3xl font-bold text-ink-900 md:text-5xl"
          >
            Voyez votre futur site avant de décider
          </h2>
          <div className="mt-10 space-y-7">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                data-reveal
                style={{ "--rv-delay": `${140 + i * 110}ms` } as CSSProperties}
                className="flex gap-4"
              >
                <span className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500 text-base font-bold text-white shadow-[0_10px_22px_-8px_rgb(14_151_221/0.7)]">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold text-ink-900">{step.title}</h3>
                  <p className="mt-1 leading-relaxed text-ink-700">{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          data-reveal
          style={{ "--rv-delay": "180ms" } as CSSProperties}
          className="rounded-3xl border border-cream-200 bg-white p-8 shadow-[var(--shadow-pop)]"
        >
          {sent ? (
            <div className="py-10 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-100">
                <svg viewBox="0 0 24 24" className="h-8 w-8 text-success-500" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h3 className="font-display mt-5 text-2xl font-bold text-ink-900">
                Demande bien reçue !
              </h3>
              <p className="mx-auto mt-2 max-w-sm leading-relaxed text-ink-700">
                Nous préparons votre démo personnalisée et revenons vers vous très vite
                pour vous la présenter.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              <h3 className="font-display text-xl font-bold text-ink-900">
                Demander ma démo gratuite
              </h3>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="lead-name" className="mb-1.5 block text-sm font-medium text-ink-700">
                    Votre nom *
                  </label>
                  <input id="lead-name" name="name" required placeholder="Claire Dupont" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="lead-profession" className="mb-1.5 block text-sm font-medium text-ink-700">
                    Profession
                  </label>
                  <input id="lead-profession" name="profession" placeholder="Sophrologue" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="lead-city" className="mb-1.5 block text-sm font-medium text-ink-700">
                    Ville
                  </label>
                  <input id="lead-city" name="city" placeholder="Albi" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="lead-email" className="mb-1.5 block text-sm font-medium text-ink-700">
                    E-mail
                  </label>
                  <input id="lead-email" name="email" type="email" placeholder="vous@exemple.fr" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="lead-phone" className="mb-1.5 block text-sm font-medium text-ink-700">
                    Téléphone
                  </label>
                  <input id="lead-phone" name="phone" type="tel" placeholder="06 12 34 56 78" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="lead-message" className="mb-1.5 block text-sm font-medium text-ink-700">
                    Un mot sur votre pratique (facultatif)
                  </label>
                  <textarea
                    id="lead-message"
                    name="message"
                    rows={3}
                    placeholder="Sophrologie, gestion du stress et sommeil, en cabinet et à distance…"
                    className={inputClass}
                  />
                </div>
                {/* Piège anti-robots, invisible pour les humains */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="hidden"
                />
              </div>
              {error ? <p className="mt-4 text-sm font-medium text-[#dc2626]">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="mt-6 w-full rounded-full bg-primary-500 py-4 text-base font-semibold text-white shadow-[0_16px_36px_-12px_rgb(14_151_221/0.8)] transition hover:-translate-y-0.5 hover:bg-primary-600 disabled:opacity-60"
              >
                {busy ? "Envoi en cours…" : "Recevoir ma démo gratuite"}
              </button>
              <p className="mt-3 text-center text-xs text-ink-500">
                Gratuit, sans engagement. Vos coordonnées servent uniquement à vous recontacter.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
