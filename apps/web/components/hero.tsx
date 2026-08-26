import { type CSSProperties } from "react";
import { MiniKpi, MiniReview, MiniSite } from "./vignettes";

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-32 md:pb-28 md:pt-40">
      {/* Halos animés */}
      <div aria-hidden className="absolute inset-0 -z-10">
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
            <span className="wordmark">créé et référencé</span> pour vous.
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
        </div>

        {/* Composition produit flottante */}
        <div
          data-reveal
          style={{ "--rv-delay": "220ms" } as CSSProperties}
          className="relative mx-auto w-full max-w-md lg:max-w-none"
        >
          <div className="float-slow">
            <MiniSite />
          </div>
          <MiniReview className="float-slower absolute -left-6 -bottom-8 hidden sm:block" />
          <MiniKpi className="float-slow absolute -right-4 -top-8 hidden sm:block" />
        </div>
      </div>
    </section>
  );
}
