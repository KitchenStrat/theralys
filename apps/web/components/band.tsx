import { type CSSProperties } from "react";
import { Brand } from "./brand";
import { WordRotator } from "./word-rotator";

const GOALS = [
  "être visible en premier sur Google.",
  "remplir votre agenda de rendez-vous.",
  "inspirer confiance dès le premier clic.",
  "développer votre cabinet sereinement.",
];

export function Band() {
  return (
    <section className="band-animated relative overflow-hidden py-24 text-white">
      {/* Grille lumineuse traversée par une vague de lumière */}
      <div aria-hidden className="absolute inset-0">
        <div className="grid-lines" />
        <div className="grid-wave-layer" />
      </div>

      <div className="relative mx-auto max-w-4xl px-5 text-center">
        <h2 data-reveal className="font-display text-3xl font-bold leading-tight md:text-5xl">
          <Brand onDark /> est la solution pour
          <span className="sr-only"> développer votre cabinet.</span>
          <WordRotator
            words={GOALS}
            className="mt-2 w-full max-w-full items-center justify-items-center text-2xl text-white [&>span]:max-w-full md:text-4xl md:[&>span]:truncate"
          />
        </h2>
        <p
          data-reveal
          style={{ "--rv-delay": "120ms" } as CSSProperties}
          className="mx-auto mt-5 max-w-xl text-lg text-white/85"
        >
          Voyez à quoi ressemblerait votre site : nous préparons une démo personnalisée
          pour votre cabinet, gratuitement.
        </p>
        <span data-reveal style={{ "--rv-delay": "220ms" } as CSSProperties} className="relative mt-8 inline-block">
          <span aria-hidden className="glow-halo" />
          <span aria-hidden className="glow-ring" />
          <a
            href="#demo"
            className="relative z-10 inline-block rounded-full bg-white px-8 py-4 text-base font-bold text-primary-700 shadow-[0_18px_45px_-12px_rgb(7_21_34/0.5)] transition hover:-translate-y-1 hover:shadow-[0_24px_55px_-12px_rgb(7_21_34/0.55)]"
          >
            Obtenir ma démo personnalisée
          </a>
        </span>
      </div>
    </section>
  );
}
