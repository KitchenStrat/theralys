import { type CSSProperties } from "react";
import { BadgeCheck, Eye, KeyRound, MapPinned, Send, Sparkles } from "lucide-react";
import carte from "@/assets/captures/detail-carte.webp";
import prochaines from "@/assets/captures/detail-prochaines.webp";
import visuelA from "@/assets/captures/visuel-reseaux.webp";
import visuelB from "@/assets/captures/visuel-reseaux-2.webp";
import visuelC from "@/assets/captures/visuel-reseaux-3.webp";
import { Brand } from "./brand";
import { Kinetic } from "./kinetic";
import { ScrollWords } from "./scroll-words";
import { Capture } from "./frames";

/**
 * « Vous gardez la main » : les règles du produit, dites sans détour. Chaque
 * carte décrit un comportement réel du studio (qui publie, qui relit, ce qui
 * est mesuré), illustré par des morceaux d'écran.
 */
export function Control() {
  return (
    <section id="confiance" className="relative overflow-clip bg-night-900 py-24 text-white md:py-28">
      <div aria-hidden data-parallax="0.06" className="absolute inset-0">
        <div className="blob top-[-10rem] left-[-8rem] h-[26rem] w-[26rem] bg-primary-700/35" />
        <div className="blob right-[-6rem] bottom-[-10rem] h-[28rem] w-[28rem] bg-[#6a5bd6]/25" style={{ animationDelay: "-9s" }} />
      </div>

      <div className="relative mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <p data-reveal className="text-sm font-bold tracking-[0.18em] text-primary-300 uppercase">
            Vous gardez la main
          </p>
          <h2
            data-reveal="kinetic"
            style={{ "--rv-delay": "80ms" } as CSSProperties}
            className="font-display mt-3 text-3xl leading-tight font-extrabold text-balance md:text-5xl"
          >
            <Kinetic>
              <Brand onDark /> prépare. Vous décidez.
            </Kinetic>
          </h2>
          <p data-reveal style={{ "--rv-delay": "160ms" } as CSSProperties} className="mt-4 text-xl leading-relaxed font-medium text-pretty text-white">
            {/* La section rogne ses halos avec `overflow-clip`, pas `hidden` : un conteneur de défilement figerait l'animation de la phrase */}
            <ScrollWords>Rien ne se publie à votre place sans votre accord.</ScrollWords>
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-6">
          {/* Réseaux sociaux : rien ne part sans le praticien */}
          <article
            data-reveal
            data-spotlight
            className="bento spotlight md:col-span-4 md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-6"
          >
            <div>
              <span className="bento-icon">
                <Send size={20} aria-hidden />
              </span>
              <h3 className="font-display mt-4 text-2xl font-bold">Rien n&apos;est publié sur vos réseaux sans vous</h3>
              <p className="mt-2 leading-relaxed text-white/75">
                <Brand onDark /> prépare visuels et légendes. <strong className="font-semibold text-white">Vous postez.</strong>
              </p>
            </div>
            <div aria-hidden className="visual-fan relative mx-auto mt-7 h-44 w-64 md:mt-0 md:h-52 md:w-72">
              <span className="visual-fan-card left-0 -rotate-[9deg]">
                <Capture src={visuelB} alt="" sizes="150px" />
              </span>
              <span className="visual-fan-card left-1/2 z-10 -translate-x-1/2 -translate-y-2">
                <Capture src={visuelA} alt="" sizes="150px" />
              </span>
              <span className="visual-fan-card right-0 rotate-[9deg] overflow-hidden">
                <Capture src={visuelC} alt="" sizes="150px" className="object-cover object-bottom" />
              </span>
            </div>
          </article>

          <article data-reveal style={{ "--rv-delay": "90ms" } as CSSProperties} data-spotlight className="bento spotlight md:col-span-2">
            <span className="bento-icon">
              <Sparkles size={20} aria-hidden />
            </span>
            <h3 className="font-display mt-4 text-2xl font-bold">L&apos;IA est toujours signalée</h3>
            <p className="mt-2 leading-relaxed text-white/75">
              <strong className="font-semibold text-white">Vous savez toujours</strong> ce que vous relisez.
            </p>
            <p aria-hidden className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-3 py-1.5 text-sm font-semibold text-primary-900">
              <Sparkles size={15} strokeWidth={2.25} />
              Rédigé par l&apos;IA
            </p>
          </article>

          {/* Blog : chaque article se relit */}
          <article
            data-reveal
            data-spotlight
            className="bento spotlight overflow-hidden md:col-span-3 md:grid md:grid-cols-[1fr_auto] md:gap-6"
          >
            <div>
              <span className="bento-icon">
                <Eye size={20} aria-hidden />
              </span>
              <h3 className="font-display mt-4 text-2xl font-bold">Chaque article se relit avant de paraître</h3>
              <p className="mt-2 leading-relaxed text-white/75">
                Sept jours pour <strong className="font-semibold text-white">le modifier, le reporter ou le retirer</strong>.
              </p>
            </div>
            <div aria-hidden className="relative mx-auto mt-6 h-44 w-52 overflow-hidden rounded-2xl ring-1 ring-white/15 md:mt-0 md:-mb-12 md:h-60">
              <Capture src={prochaines} alt="" sizes="210px" />
              <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-night-900 to-transparent md:hidden" />
            </div>
          </article>

          {/* Fiche Google : des chiffres mesurés */}
          <article
            data-reveal
            style={{ "--rv-delay": "90ms" } as CSSProperties}
            data-spotlight
            className="bento spotlight overflow-hidden md:col-span-3 md:grid md:grid-cols-[1fr_auto] md:gap-6"
          >
            <div>
              <span className="bento-icon">
                <MapPinned size={20} aria-hidden />
              </span>
              <h3 className="font-display mt-4 text-2xl font-bold">Des chiffres mesurés, pas des promesses</h3>
              <p className="mt-2 leading-relaxed text-white/75">
                <strong className="font-semibold text-white">Votre place réelle</strong> sur Google Maps, vos vrais visiteurs.
              </p>
            </div>
            <div aria-hidden className="relative mx-auto mt-6 h-44 w-52 overflow-hidden rounded-2xl ring-1 ring-white/15 md:mt-0 md:h-48">
              <Capture src={carte} alt="" sizes="210px" className="h-full object-cover" />
            </div>
          </article>

          <article data-reveal data-spotlight className="bento spotlight md:col-span-3">
            <span className="bento-icon">
              <KeyRound size={20} aria-hidden />
            </span>
            <h3 className="font-display mt-4 text-2xl font-bold">Vos comptes restent les vôtres</h3>
            <p className="mt-2 leading-relaxed text-white/75">
              Google, Meta&nbsp;: <strong className="font-semibold text-white">vous restez propriétaire</strong>. Vos budgets vont aux plateformes.
            </p>
          </article>

          <article data-reveal style={{ "--rv-delay": "90ms" } as CSSProperties} data-spotlight className="bento spotlight md:col-span-3">
            <span className="bento-icon">
              <BadgeCheck size={20} aria-hidden />
            </span>
            <h3 className="font-display mt-4 text-2xl font-bold">Un lecteur de site qui se présente</h3>
            <p className="mt-2 leading-relaxed text-white/75">
              Il lit vos pages publiques <strong className="font-semibold text-white">sous son nom</strong>.{" "}
              <a href="/robot" className="focus-ring-dark rounded font-semibold text-primary-300 underline underline-offset-4 hover:text-white">
                Ce que fait notre lecteur
              </a>
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
