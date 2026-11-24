"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { callablePhone } from "@theralys/shared/demo-request";
import { completeDemoRequest, requestDemo } from "@/app/actions";
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

const INPUT =
  "w-full rounded-xl border border-ink-300 bg-white px-4 py-3 text-base text-ink-900 placeholder:text-ink-500 outline-none transition focus:border-primary-600 focus:ring-4 focus:ring-primary-200 aria-[invalid=true]:border-[#b91c1c]";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-700";
const SUBMIT =
  "focus-ring w-full rounded-full bg-primary-600 py-4 text-base font-semibold text-white shadow-md shadow-black/15 transition-[background-color,border-color,color,scale] active:scale-[0.98] hover:bg-primary-700 disabled:opacity-60";

type FieldError = { field: "name" | "phone" | "email" | "form"; message: string };

function Check() {
  return (
    <span className="pop-in mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-100">
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-success-500" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <path className="check-draw" pathLength={1} d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Required() {
  return (
    <>
      {" "}
      <span aria-hidden>*</span>
      <span className="sr-only"> (obligatoire)</span>
    </>
  );
}

/** Piège anti-robots, invisible pour les humains. */
function Trap() {
  return <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />;
}

/**
 * La demande de démo, en deux temps : quatre champs pour être rappelé (le nom
 * et le téléphone suffisent), puis, la demande partie, des précisions
 * facultatives pour préparer la démo. La même carte sert dans la fenêtre
 * ouverte par les boutons « démo » et en bas de page.
 */
export function DemoFormCard({ idPrefix, title, onClose }: { idPrefix: string; title: ReactNode; onClose?: () => void }) {
  const [step, setStep] = useState<"form" | "details" | "done">("form");
  const [ref, setRef] = useState<string | null>(null);
  const [error, setError] = useState<FieldError | null>(null);
  const [busy, startTransition] = useTransition();
  const received = useRef<HTMLHeadingElement>(null);
  const id = (name: string) => `${idPrefix}-${name}`;
  const errorOf = (field: FieldError["field"]) => (error?.field === field ? error.message : null);

  // L'étape change : le titre de la nouvelle étape reçoit le focus (clavier, lecteurs d'écran)
  useEffect(() => {
    if (step !== "form") received.current?.focus({ preventScroll: true });
  }, [step]);

  function fail(form: HTMLFormElement, next: FieldError) {
    setError(next);
    if (next.field !== "form") form.querySelector<HTMLElement>(`[name="${next.field}"]`)?.focus();
  }

  function onRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    if (String(data.name ?? "").trim().length < 2) return fail(form, { field: "name", message: "Indiquez votre nom." });
    if (!callablePhone(String(data.phone ?? ""))) return fail(form, { field: "phone", message: "Indiquez un numéro de téléphone valide (10 chiffres)." });
    startTransition(async () => {
      try {
        const outcome = await requestDemo(data);
        if (!outcome.ok) return fail(form, { field: outcome.field, message: outcome.error });
        setRef(outcome.ref);
        setStep(outcome.ref ? "details" : "done");
      } catch {
        setError({ field: "form", message: "Votre demande n'a pas pu partir — vérifiez votre connexion et réessayez." });
      }
    });
  }

  function onDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    startTransition(async () => {
      try {
        const outcome = await completeDemoRequest({ ...data, ref });
        if (!outcome.ok) return fail(form, { field: outcome.field, message: outcome.error });
        setStep("done");
      } catch {
        setError({ field: "form", message: "Vos précisions n'ont pas pu partir — vérifiez votre connexion et réessayez." });
      }
    });
  }

  if (step === "form") {
    return (
      <form onSubmit={onRequest} noValidate data-demo-step="form">
        {title}
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4">
          <div className="col-span-2">
            <label htmlFor={id("name")} className={LABEL}>
              Votre nom
              <Required />
            </label>
            <input id={id("name")} name="name" required autoComplete="name" placeholder="Claire Dupont" aria-invalid={errorOf("name") ? true : undefined} aria-describedby={errorOf("name") ? id("name-error") : undefined} className={INPUT} />
            {errorOf("name") ? (
              <p id={id("name-error")} role="alert" className="mt-1.5 text-sm font-medium text-[#b91c1c]">
                {errorOf("name")}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor={id("profession")} className={LABEL}>
              Votre métier
            </label>
            <input id={id("profession")} name="profession" autoComplete="organization-title" placeholder="Sophrologue" className={`${INPUT} min-w-0`} />
          </div>
          <div>
            <label htmlFor={id("city")} className={LABEL}>
              Votre ville
            </label>
            <input id={id("city")} name="city" autoComplete="address-level2" placeholder="Albi" className={`${INPUT} min-w-0`} />
          </div>
          <div className="col-span-2">
            <label htmlFor={id("phone")} className={LABEL}>
              Votre téléphone
              <Required />
            </label>
            <input id={id("phone")} name="phone" type="tel" inputMode="tel" required autoComplete="tel" placeholder="06 12 34 56 78" aria-invalid={errorOf("phone") ? true : undefined} aria-describedby={errorOf("phone") ? id("phone-error") : undefined} className={INPUT} />
            {errorOf("phone") ? (
              <p id={id("phone-error")} role="alert" className="mt-1.5 text-sm font-medium text-[#b91c1c]">
                {errorOf("phone")}
              </p>
            ) : null}
          </div>
          <Trap />
        </div>
        {errorOf("form") ? (
          <p role="alert" className="mt-4 text-base font-medium text-[#b91c1c]">
            {errorOf("form")}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={`${SUBMIT} mt-6`}>
          {busy ? "Envoi en cours…" : "Recevoir ma démo gratuite"}
        </button>
        <p className="mt-3 text-center text-sm text-ink-500">Gratuit, sans engagement. Nous vous rappelons pour vous la présenter.</p>
      </form>
    );
  }

  return (
    <div data-demo-step={step}>
      <div role="status" className="text-center">
        <Check />
        <h3 ref={received} tabIndex={-1} className="font-display mt-4 text-2xl font-bold text-ink-900 outline-none">
          {step === "done" && ref ? <>Merci, c&apos;est ajouté&nbsp;!</> : <>Demande bien reçue&nbsp;!</>}
        </h3>
        <p className="mx-auto mt-2 max-w-sm leading-relaxed text-ink-700">Nous préparons votre démo personnalisée et vous rappelons très vite pour vous la présenter.</p>
      </div>

      {step === "details" ? (
        <form onSubmit={onDetails} noValidate className="mt-6 border-t border-cream-200 pt-6">
          <p className="font-title text-lg font-bold text-ink-900">
            Pour une démo qui vous ressemble <span className="text-base font-medium text-ink-500">(facultatif)</span>
          </p>
          <div className="mt-4 grid gap-4">
            <div>
              <label htmlFor={id("email")} className={LABEL}>
                Votre e-mail
              </label>
              <input id={id("email")} name="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" aria-invalid={errorOf("email") ? true : undefined} aria-describedby={errorOf("email") ? id("email-error") : undefined} className={INPUT} />
              {errorOf("email") ? (
                <p id={id("email-error")} role="alert" className="mt-1.5 text-sm font-medium text-[#b91c1c]">
                  {errorOf("email")}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor={id("site")} className={LABEL}>
                Votre site actuel, si vous en avez un
              </label>
              <input id={id("site")} name="currentSite" inputMode="url" autoComplete="url" placeholder="www.mon-cabinet.fr" className={INPUT} />
            </div>
            <div>
              <label htmlFor={id("message")} className={LABEL}>
                Un mot sur votre pratique
              </label>
              <textarea id={id("message")} name="message" rows={3} maxLength={2000} placeholder="Sophrologie, gestion du stress et sommeil, en cabinet et à distance…" className={INPUT} />
            </div>
            <Trap />
          </div>
          {errorOf("form") ? (
            <p role="alert" className="mt-4 text-base font-medium text-[#b91c1c]">
              {errorOf("form")}
            </p>
          ) : null}
          <button type="submit" disabled={busy} className={`${SUBMIT} mt-6`}>
            {busy ? "Envoi en cours…" : "Ajouter ces précisions"}
          </button>
          {onClose ? (
            <button type="button" onClick={onClose} className="focus-ring mt-2 w-full rounded-full py-3 text-base font-semibold text-ink-700 hover:text-ink-900">
              Plus tard
            </button>
          ) : null}
        </form>
      ) : onClose ? (
        <button type="button" onClick={onClose} className={`${SUBMIT} mt-7`}>
          Fermer
        </button>
      ) : null}
    </div>
  );
}

export function DemoForm() {
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
          data-testid="demo-bas-de-page"
          style={{ "--rv-delay": "180ms" } as CSSProperties}
          className="rounded-3xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-pop)] sm:p-8"
        >
          <DemoFormCard idPrefix="lead" title={<h3 className="font-title text-xl font-bold text-ink-900">Demander ma démo gratuite</h3>} />
        </div>
      </div>
    </section>
  );
}
