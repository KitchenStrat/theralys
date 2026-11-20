import { type CSSProperties } from "react";
import { ArrowRight, Check } from "lucide-react";
import accueil from "@/assets/captures/accueil.webp";
import mobileAccueil from "@/assets/captures/m-accueil.webp";
import visuel from "@/assets/captures/visuel-reseaux.webp";
import { Brand } from "./brand";
import { BrowserFrame, Capture, PhoneFrame } from "./frames";
import { HeroVideo } from "./hero-video";
import { Kinetic } from "./kinetic";
import { PostMock } from "./post-mock";
import { ScrollTilt } from "./scroll-tilt";
import { ToolOrbit } from "./tool-orbit";

const PROMISES = ["Démo personnalisée gratuite", "Frais de création offerts", "Aucune compétence technique"];

export function Hero() {
  return (
    <section className="relative">
      {/* La scène : des praticiens au travail, filmés en lumière naturelle, derrière le message.
          --hero-overlap : hauteur dont la capture de l'espace client, juste après, remonte sur la vidéo. */}
      <div className="hero-stage relative overflow-hidden rounded-b-[2rem] bg-[#1a1512] pt-28 pb-[calc(var(--hero-overlap)+2.5rem)] text-white [--hero-overlap:7rem] md:rounded-b-[3rem] md:pt-36 md:[--hero-overlap:14rem]">
        <HeroVideo />

      <div className="relative mx-auto max-w-4xl px-5 text-center">
        <p
          data-reveal
          className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-semibold text-white shadow-sm backdrop-blur"
        >
          <span aria-hidden className="dot-live h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
          La solution digitale tout-en-un des thérapeutes
        </p>
        <h1
          data-reveal="kinetic"
          style={{ "--rv-delay": "80ms" } as CSSProperties}
          className="font-display mt-6 text-[2.5rem] leading-[1.06] font-extrabold text-balance text-white drop-shadow-[0_2px_18px_rgb(7_21_34/0.35)] sm:text-5xl md:text-[4.1rem]"
        >
          <Kinetic>
            Tout le digital de votre cabinet, <span className="shimmer-text shimmer-light">enfin réuni.</span>
          </Kinetic>
        </h1>
        <p
          data-reveal
          style={{ "--rv-delay": "160ms" } as CSSProperties}
          className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-white/90 md:text-xl"
        >
          Site internet, blog, fiche Google, réseaux sociaux, publicité&nbsp;: <Brand onDark />{" "}
          <strong className="font-semibold text-white">s&apos;occupe de toute votre présence en ligne</strong> et vous montre ce
          qu&apos;elle vous rapporte. Vous restez concentré sur vos patients.
        </p>
      </div>

      {/* Les outils, d'un coup d'œil : ils tournent autour de Harmony comme les anneaux d'une planète,
          et chaque pastille ouvre l'outil dans la visite guidée */}
      <ToolOrbit onDark className="relative mt-5" style={{ "--rv-delay": "240ms" } as CSSProperties} />

      <div className="relative mx-auto max-w-4xl px-5 text-center">
        <div data-reveal style={{ "--rv-delay": "320ms" } as CSSProperties} className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#demo"
            data-magnetic
            className="cta focus-ring inline-flex items-center gap-2 rounded-full bg-primary-600 px-7 py-3.5 text-base font-semibold text-white shadow-[0_16px_36px_-12px_rgb(3_123_189/0.85)] transition hover:-translate-y-0.5 hover:bg-primary-700"
          >
            Demander ma démo gratuite
            <ArrowRight size={18} aria-hidden />
          </a>
          <a
            href="#outils"
            className="focus-ring-dark rounded-full border border-white/45 bg-white/10 px-7 py-3.5 text-base font-semibold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/20"
          >
            Découvrir les outils
          </a>
        </div>
        <ul
          data-reveal
          style={{ "--rv-delay": "400ms" } as CSSProperties}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-white/90"
        >
          {PROMISES.map((promise) => (
            <li key={promise} className="inline-flex items-center gap-1.5">
              <Check size={16} strokeWidth={2.5} className="text-[#86efac]" aria-hidden />
              {promise}
            </li>
          ))}
        </ul>
      </div>

      </div>

      {/* L'espace client, en vrai : l'accueil du studio, une publication prête à poster, la version téléphone.
          La capture remonte sur la vidéo : elle en sort à moitié, sur le fond clair de la page. */}
      <div data-reveal style={{ "--rv-delay": "200ms" } as CSSProperties} className="relative z-10 mx-auto -mt-28 max-w-6xl px-5 md:-mt-56">
        {/* Ordinateur et tablette */}
        <div className="relative hidden md:block">
          <ScrollTilt>
            <BrowserFrame>
              <Capture
                src={accueil}
                priority
                sizes="(min-width: 1200px) 1112px, (min-width: 768px) 94vw, 1px"
                alt="L'accueil de l'espace client Harmony : les visiteurs de la semaine, les clics de rendez-vous, la provenance des visites et la prochaine étape proposée."
              />
            </BrowserFrame>
          </ScrollTilt>
          {/* Une publication telle qu'elle paraîtra : le visuel préparé par Harmony, dans le fil du cabinet.
              Ancrée sous la liste des outils de la capture, elle déborde sous le cadre. */}
          <div data-parallax="0.06" className="absolute top-[71%] left-2 hidden w-56 lg:block xl:-left-12 xl:w-64">
            <PostMock
              className="float-slow -rotate-3"
              image={visuel}
              account="claire.sophrologue"
              place="Albi"
              initials="CD"
              pages={7}
              caption="Trois minutes, les yeux fermés : un exercice simple à glisser dans votre journée."
              hashtags={["sophrologie", "albi", "gestiondustress"]}
              label="Exemple de publication prête à poster : le carrousel « Cinq étapes pour relâcher la pression » préparé par Harmony, dans le fil Instagram d'une sophrologue. Sa première page pose le titre sur la photographie d'une personne assise face à la montagne ; suivent la légende et les mots-dièse."
            />
          </div>
          <div data-parallax="-0.05" className="absolute -right-2 -bottom-16 hidden w-48 lg:block xl:-right-8 xl:w-56">
            <PhoneFrame className="float-slower">
              <Capture src={mobileAccueil} sizes="224px" alt="Le même accueil sur un téléphone." />
            </PhoneFrame>
          </div>
        </div>
        {/* Téléphone : l'application telle qu'elle s'y affiche */}
        <div className="mx-auto w-64 md:hidden">
          <PhoneFrame>
            <Capture
              src={mobileAccueil}
              eager
              sizes="(min-width: 768px) 1px, 256px"
              alt="L'accueil de l'espace client Harmony sur un téléphone : les visiteurs de la semaine et la prochaine étape proposée."
            />
          </PhoneFrame>
        </div>
        {/* À partir de lg, la publication et le téléphone débordent sous le cadre : la légende reste entre les deux */}
        <p className="mt-8 pb-4 text-center text-sm text-ink-500 md:mt-10 lg:mx-auto lg:mt-12 lg:max-w-md lg:pb-52 xl:pb-60">
          Captures réelles de l&apos;espace client <Brand />, sur un compte de démonstration.
        </p>
      </div>
    </section>
  );
}
