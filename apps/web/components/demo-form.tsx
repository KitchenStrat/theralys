"use client";

import { useState, useTransition, type CSSProperties, type FormEvent } from "react";
import { requestDemo } from "@/app/actions";
import { rich } from "./rich";
import { Kinetic } from "./kinetic";
import montagnes from "@/assets/photos/montagnes.jpg";
import { PhotoBackdrop } from "./photo-backdrop";

const STEPS = [
  {
    title: "Nous préparons votre démo",
    text: "Un site complet pour votre pratique et votre ville, et **un aperçu de vos outils** : pas une maquette générique.",
  },
  {
    title: "Nous vous la présentons",
    text: "Vous découvrez **votre futur espace**, et nous ajustons ensemble ce qui doit l'être.",
  },
  {
    title: "Vous décidez, sereinement",
    text: "La démo est **gratuite et sans engagement**. Si elle vous plaît, tout peut partir en ligne.",
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
    "w-full rounded-xl border border-ink-300 bg-white px-4 py-3 text-base text-ink-900 placeholder:text-ink-500 outline-none transition focus:border-primary-600 focus:ring-4 focus:ring-primary-200";

  return (
    <section id="demo" className="relative overflow-hidden py-24">
      {/* Brume du matin sur les montagnes, très éclaircie : le formulaire reste au premier plan */}
      <PhotoBackdrop src={montagnes} position="50% 60%" veil="bg-[linear-gradient(180deg,rgb(251_253_255/0.96)_0%,rgb(251_253_255/0.74)_40%,rgb(251_253_255/0.8)_75%,rgb(251_253_255/0.97)_100%)]" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2">
        <div>
          <h2
            data-reveal="kinetic"
            className="font-display text-3xl leading-tight font-bold text-balance text-ink-900 md:text-5xl"
          >
            <Kinetic>Voyez ce que cela donne pour votre cabinet</Kinetic>
          </h2>
          <div className="mt-10 space-y-7">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                data-reveal
                style={{ "--rv-delay": `${140 + i * 110}ms` } as CSSProperties}
                className="flex gap-4"
              >
                <span className="font-title flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-600 text-base font-bold text-white shadow-[0_10px_22px_-8px_rgb(3_123_189/0.7)]">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-title text-lg font-bold text-ink-900">{step.title}</h3>
                  <p className="mt-1 leading-relaxed text-ink-700">{rich(step.text)}</p>
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
            <div role="status" className="py-10 text-center">
              <span className="pop-in mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-100">
                <svg viewBox="0 0 24 24" className="h-8 w-8 text-success-500" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path
                    className="check-draw"
                    pathLength={1}
                    d="m5 12.5 4.5 4.5L19 7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <h3 className="font-display mt-5 text-2xl font-bold text-ink-900">
                Demande bien reçue&nbsp;!
              </h3>
              <p className="mx-auto mt-2 max-w-sm leading-relaxed text-ink-700">
                Nous préparons votre démo personnalisée et revenons vers vous très vite
                pour vous la présenter.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              <h3 className="font-title text-xl font-bold text-ink-900">
                Demander ma démo gratuite
              </h3>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="lead-name" className="mb-1.5 block text-sm font-medium text-ink-700">
                    Votre nom <span aria-hidden>*</span>
                    <span className="sr-only"> (obligatoire)</span>
                  </label>
                  <input id="lead-name" name="name" required autoComplete="name" placeholder="Claire Dupont" className={inputClass} />
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
                  <input id="lead-email" name="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="lead-phone" className="mb-1.5 block text-sm font-medium text-ink-700">
                    Téléphone
                  </label>
                  <input id="lead-phone" name="phone" type="tel" autoComplete="tel" placeholder="06 12 34 56 78" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="lead-site" className="mb-1.5 block text-sm font-medium text-ink-700">
                    Votre site actuel, si vous en avez un
                  </label>
                  <input id="lead-site" name="currentSite" inputMode="url" autoComplete="url" placeholder="www.mon-cabinet.fr" className={inputClass} />
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
              {error ? (
                <p role="alert" className="mt-4 text-base font-medium text-[#b91c1c]">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className="focus-ring mt-6 w-full rounded-full bg-primary-600 py-4 text-base font-semibold text-white shadow-md shadow-black/15 transition-[background-color,border-color,color,scale] active:scale-[0.98] hover:bg-primary-700 disabled:opacity-60"
              >
                {busy ? "Envoi en cours…" : "Recevoir ma démo gratuite"}
              </button>
              <p className="mt-3 text-center text-sm text-ink-500">
                Gratuit, sans engagement. Vos coordonnées servent uniquement à vous recontacter.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
