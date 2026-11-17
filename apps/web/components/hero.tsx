import { type CSSProperties } from "react";
import { ArrowRight, Check } from "lucide-react";
import accueil from "@/assets/captures/accueil.webp";
import mobileAccueil from "@/assets/captures/m-accueil.webp";
import visuel from "@/assets/captures/visuel-reseaux.webp";
import { Brand } from "./brand";
import { BrowserFrame, Capture, PhoneFrame } from "./frames";
import { Kinetic } from "./kinetic";
import { PostMock } from "./post-mock";
import { ScrollTilt } from "./scroll-tilt";
import { TOOLS } from "./tools";

const PROMISES = ["Démo personnalisée gratuite", "Frais de création offerts", "Aucune compétence technique"];

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 md:pt-36">
      {/* Halos animés et trame discrète */}
      <div aria-hidden data-parallax="0.05" className="absolute inset-0 -z-10">
        <div className="hero-grid" />
        <div className="blob top-[-8rem] left-[-10rem] h-[28rem] w-[28rem] bg-primary-200/70" />
        <div className="blob top-[2rem] right-[-9rem] h-[30rem] w-[30rem] bg-[#cfc9f7]/55" style={{ animationDelay: "-7s" }} />
        <div className="blob top-[26rem] left-[32%] h-[26rem] w-[26rem] bg-[#c9f1e6]/70" style={{ animationDelay: "-13s" }} />
      </div>

      <div className="mx-auto max-w-4xl px-5 text-center">
        <p
          data-reveal
          className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/80 px-4 py-1.5 text-sm font-semibold text-primary-700 shadow-sm backdrop-blur"
        >
          <span aria-hidden className="dot-live h-1.5 w-1.5 rounded-full bg-success-500" />
          La solution digitale tout-en-un des thérapeutes
        </p>
        <h1
          data-reveal="kinetic"
          style={{ "--rv-delay": "80ms" } as CSSProperties}
          className="font-display mt-6 text-[2.5rem] leading-[1.06] font-extrabold text-balance text-ink-900 sm:text-5xl md:text-[4.1rem]"
        >
          <Kinetic>
            Tout le digital de votre cabinet, <span className="shimmer-text shimmer-blue">enfin réuni.</span>
          </Kinetic>
        </h1>
        <p
          data-reveal
          style={{ "--rv-delay": "160ms" } as CSSProperties}
          className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-ink-700 md:text-xl"
        >
          Site internet, blog, fiche Google, réseaux sociaux, publicité&nbsp;: <Brand />{" "}
          <strong className="font-semibold text-ink-900">s&apos;occupe de toute votre présence en ligne</strong> et vous montre ce
          qu&apos;elle vous rapporte. Vous restez concentré sur vos patients.
        </p>

        {/* Les outils, d'un coup d'œil : chaque pastille ouvre l'outil dans la visite guidée */}
        <ul
          data-reveal
          style={{ "--rv-delay": "240ms" } as CSSProperties}
          aria-label="Les outils de Harmony"
          className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2"
        >
          {TOOLS.map((tool, index) => (
            <li key={tool.id}>
              <a
                href="#outils"
                data-tool={tool.id}
                style={{ "--t-from": tool.colors.from, "--t-to": tool.colors.to, "--chip-delay": `${index * 70}ms` } as CSSProperties}
                className="chip-pop focus-ring group inline-flex min-h-11 items-center gap-2 rounded-full border border-cream-200 bg-white/90 py-1.5 pr-3.5 pl-1.5 text-sm font-semibold text-ink-900 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md"
              >
                <span className="tool-chip grid h-7 w-7 place-items-center rounded-full">
                  <tool.icon size={15} strokeWidth={2.25} aria-hidden />
                </span>
                {tool.short}
              </a>
            </li>
          ))}
        </ul>

        <div data-reveal style={{ "--rv-delay": "320ms" } as CSSProperties} className="mt-9 flex flex-wrap items-center justify-center gap-3">
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
            className="focus-ring rounded-full border border-ink-300 bg-white/70 px-7 py-3.5 text-base font-semibold text-ink-900 backdrop-blur transition hover:-translate-y-0.5 hover:border-primary-300 hover:text-primary-700"
          >
            Découvrir les outils
          </a>
        </div>
        <ul
          data-reveal
          style={{ "--rv-delay": "400ms" } as CSSProperties}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-ink-700"
        >
          {PROMISES.map((promise) => (
            <li key={promise} className="inline-flex items-center gap-1.5">
              <Check size={16} strokeWidth={2.5} className="text-success-600" aria-hidden />
              {promise}
            </li>
          ))}
        </ul>
      </div>

      {/* L'espace client, en vrai : l'accueil du studio, une publication prête à poster, la version téléphone */}
      <div data-reveal style={{ "--rv-delay": "200ms" } as CSSProperties} className="relative mx-auto mt-14 max-w-6xl px-5 md:mt-16">
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
