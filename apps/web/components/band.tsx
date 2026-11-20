import { type CSSProperties } from "react";
import { Brand } from "./brand";
import { WordRotator } from "./word-rotator";
import foret from "@/assets/photos/foret.jpg";
import { PhotoBackdrop } from "./photo-backdrop";

const TASKS = ["votre site internet.", "votre blog.", "votre fiche Google.", "vos réseaux sociaux.", "vos publicités."];

export function Band() {
  return (
    <section className="relative overflow-hidden bg-[#1a1512] py-28 text-white md:py-36">
      {/* Lumière du matin en forêt : la respiration de la page, avant les tarifs.
          Le voile est plus dense au centre, derrière le texte, et laisse la forêt respirer sur les bords. */}
      <PhotoBackdrop src={foret} position="50% 45%" veil="bg-[radial-gradient(ellipse_110%_80%_at_50%_50%,rgb(22_17_13/0.84)_0%,rgb(22_17_13/0.74)_60%,rgb(22_17_13/0.5)_100%)] md:bg-[radial-gradient(ellipse_62%_78%_at_50%_50%,rgb(22_17_13/0.82)_0%,rgb(22_17_13/0.7)_55%,rgb(22_17_13/0.46)_100%)]" />

      <div className="relative mx-auto max-w-4xl px-5 text-center">
        <h2 data-reveal className="font-display text-3xl leading-tight font-extrabold md:text-5xl">
          <Brand onDark /> s&apos;occupe de
          <span className="sr-only"> toute votre présence en ligne.</span>
          <WordRotator
            words={TASKS}
            interval={1700}
            className="mt-2 w-full max-w-full items-center justify-items-center text-3xl text-white md:text-5xl [&>span]:max-w-full"
          />
        </h2>
        <p data-reveal style={{ "--rv-delay": "120ms" } as CSSProperties} className="mx-auto mt-5 max-w-xl text-lg text-pretty text-white">
          Voyez ce que cela donnerait pour votre cabinet&nbsp;: nous préparons une démo personnalisée, gratuitement.
        </p>
        <span data-reveal style={{ "--rv-delay": "220ms" } as CSSProperties} className="relative mt-8 inline-block">
          <span aria-hidden className="glow-halo" />
          <span aria-hidden className="glow-ring" />
          <a
            href="#demo"
            className="focus-ring-dark relative z-10 inline-block rounded-full bg-white px-8 py-4 text-base font-bold text-primary-800 shadow-[0_18px_45px_-12px_rgb(7_21_34/0.5)] transition hover:-translate-y-1 hover:shadow-[0_24px_55px_-12px_rgb(7_21_34/0.55)]"
          >
            Obtenir ma démo personnalisée
          </a>
        </span>
      </div>
    </section>
  );
}
