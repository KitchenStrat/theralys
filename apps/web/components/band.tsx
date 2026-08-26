import { type CSSProperties } from "react";

export function Band() {
  return (
    <section className="band-animated relative overflow-hidden py-20 text-white">
      <div className="relative mx-auto max-w-4xl px-5 text-center">
        <h2 data-reveal className="font-display text-3xl font-bold leading-tight md:text-5xl">
          Harmony est la solution pour être visible en premier sur Google.
        </h2>
        <p
          data-reveal
          style={{ "--rv-delay": "120ms" } as CSSProperties}
          className="mx-auto mt-4 max-w-xl text-lg text-white/85"
        >
          Voyez à quoi ressemblerait votre site : nous préparons une démo personnalisée
          pour votre cabinet, gratuitement.
        </p>
        <a
          data-reveal
          style={{ "--rv-delay": "220ms" } as CSSProperties}
          href="#demo"
          className="mt-8 inline-block rounded-full bg-white px-8 py-4 text-base font-bold text-primary-700 shadow-[0_18px_45px_-12px_rgb(7_21_34/0.5)] transition hover:-translate-y-1 hover:shadow-[0_24px_55px_-12px_rgb(7_21_34/0.55)]"
        >
          Obtenir ma démo personnalisée
        </a>
      </div>
    </section>
  );
}
