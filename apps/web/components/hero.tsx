import { type CSSProperties } from "react";
import { Tilt } from "./tilt";
import { MiniGauge, MiniKpi, MiniReview, MiniSite } from "./vignettes";

const AVATARS = [
  { initial: "C", classes: "from-primary-400 to-primary-600" },
  { initial: "S", classes: "from-[#7cc9a8] to-[#3d9a72]" },
  { initial: "N", classes: "from-primary-300 to-primary-500" },
  { initial: "G", classes: "from-[#f0b45c] to-[#d98a1f]" },
  { initial: "É", classes: "from-primary-500 to-primary-800" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-32 md:pb-28 md:pt-40">
      {/* Halos animés */}
      <div aria-hidden data-parallax="0.06" className="absolute inset-0 -z-10">
        <div className="blob left-[-10rem] top-[-6rem] h-[26rem] w-[26rem] bg-primary-200/70" />
        <div
          className="blob right-[-8rem] top-[4rem] h-[30rem] w-[30rem] bg-primary-300/50"
          style={{ animationDelay: "-7s" }}
        />
        <div
          className="blob bottom-[-12rem] left-[30%] h-[24rem] w-[24rem] bg-[#dbeee6]"
          style={{ animationDelay: "-13s" }}
        />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p
            data-reveal
            className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/80 px-4 py-1.5 text-xs font-semibold text-primary-700 shadow-sm backdrop-blur"
          >
            <span className="dot-live h-1.5 w-1.5 rounded-full bg-success-500" />
            Sites &amp; référencement pour thérapeutes
          </p>
          <h1
            data-reveal
            style={{ "--rv-delay": "90ms" } as CSSProperties}
            className="font-display mt-5 text-4xl font-bold leading-[1.08] text-ink-900 md:text-6xl"
          >
            Votre site de thérapeute,{" "}
            <span className="shimmer-text shimmer-blue">créé et référencé</span> pour vous.
          </h1>
          <p
            data-reveal
            style={{ "--rv-delay": "180ms" } as CSSProperties}
            className="mt-6 max-w-xl text-lg leading-relaxed text-ink-700"
          >
            Site professionnel élégant, pages de spécialités, blog optimisé SEO, avis Google
            synchronisés : Harmony construit votre présence en ligne et la fait grandir —
            pendant que vous restez concentré sur vos patients.
          </p>
          <div
            data-reveal
            style={{ "--rv-delay": "270ms" } as CSSProperties}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <a
              href="#demo"
              className="rounded-full bg-primary-500 px-7 py-3.5 text-base font-semibold text-white shadow-[0_16px_36px_-12px_rgb(14_151_221/0.8)] transition hover:-translate-y-0.5 hover:bg-primary-600"
            >
              Demander une démo gratuite
            </a>
            <a
              href="#tarifs"
              className="rounded-full border border-ink-300 bg-white/70 px-7 py-3.5 text-base font-semibold text-ink-700 backdrop-blur transition hover:-translate-y-0.5 hover:border-primary-300 hover:text-primary-700"
            >
              Voir les tarifs
            </a>
          </div>
          <p
            data-reveal
            style={{ "--rv-delay": "360ms" } as CSSProperties}
            className="mt-6 flex items-center gap-2 text-sm text-ink-500"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4 text-success-500" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="8" cy="8" r="6.5" />
              <path d="m5.2 8.3 1.9 1.9 3.7-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Livré clé en main — zéro technique de votre côté
          </p>
          <div
            data-reveal
            style={{ "--rv-delay": "440ms" } as CSSProperties}
            className="mt-6 flex items-center gap-3.5"
          >
            <div className="flex -space-x-2.5">
              {AVATARS.map((avatar) => (
                <span
                  key={avatar.initial + avatar.classes}
                  className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ${avatar.classes} text-xs font-bold text-white ring-2 ring-cream-50`}
                >
                  {avatar.initial}
                </span>
              ))}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">
                <span className="tracking-wider text-gold-400">★★★★★</span> 4,9/5
              </p>
              <p className="text-xs text-ink-500">Plus de 800 praticiens accompagnés</p>
            </div>
          </div>
        </div>

        {/* Composition produit flottante */}
        <div
          data-reveal
          style={{ "--rv-delay": "220ms" } as CSSProperties}
          className="relative mx-auto w-full max-w-md lg:max-w-none"
        >
          <Tilt>
            <div className="float-slow">
              <MiniSite />
            </div>
          </Tilt>
          <div data-parallax="0.05" className="absolute -left-6 -bottom-8 hidden sm:block">
            <MiniReview className="float-slower" />
          </div>
          <div data-parallax="-0.07" className="absolute -right-4 -top-8 hidden sm:block">
            <MiniKpi className="float-slow" />
          </div>
          <div data-parallax="0.1" className="absolute -right-8 bottom-20 hidden lg:block">
            <MiniGauge className="float-slower" />
          </div>
        </div>
      </div>
    </section>
  );
}
