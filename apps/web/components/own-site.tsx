import { type CSSProperties } from "react";
import mobileSite from "@/assets/captures/m-site.webp";
import siteExistant from "@/assets/captures/site-existant.webp";
import { Kinetic } from "./kinetic";
import { BrowserFrame, Capture, PhoneFrame } from "./frames";
import { rich } from "./rich";
import { SectionCta } from "./section-cta";

const STEPS = [
  { title: "Connecter", text: "Indiquez **l'adresse de votre site**." },
  { title: "Relire", text: "**Vérifiez** ce qui en a été compris." },
  { title: "Activer", text: "**Un clic**, et vos outils s'y appuient." },
  { title: "Mesurer", text: "**Un code à coller** pour suivre ses visites." },
];

/** Le praticien a déjà un site : il le garde, les outils s'y branchent. */
export function OwnSite() {
  return (
    <section id="deja-un-site" className="relative overflow-hidden bg-[#effbf7] py-24 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <div>
          <h2
            data-reveal="kinetic"
            className="font-display text-3xl leading-tight font-bold text-balance text-[#034239] md:text-5xl"
          >
            <span className="block">
              <Kinetic>Gardez votre site.</Kinetic>
            </span>{" "}
            <Kinetic from={3}>
              Harmony s&apos;y branche.
            </Kinetic>
          </h2>
          <p data-reveal style={{ "--rv-delay": "160ms" } as CSSProperties} className="mt-4 text-lg leading-relaxed text-pretty text-ink-700">
            Rien ne vous oblige à en changer&nbsp;: <strong className="font-semibold text-ink-900">vos outils s&apos;appuient sur votre site actuel</strong>.
          </p>

          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                data-reveal
                style={{ "--rv-delay": `${220 + index * 80}ms` } as CSSProperties}
                className="rounded-2xl border border-[#c9eee2] bg-white p-4 shadow-sm"
              >
                <p className="flex items-center gap-2.5">
                  <span className="font-title grid h-8 w-8 place-items-center rounded-full bg-[#127a6b] text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="font-title text-lg font-bold text-[#034239]">{step.title}</span>
                </p>
                <p className="mt-2 text-base leading-relaxed text-ink-700">{rich(step.text)}</p>
              </li>
            ))}
          </ol>

          <p data-reveal className="mt-6 text-base leading-relaxed text-ink-700">
            Votre site n&apos;est jamais modifié.{" "}
            <a
              href="/robot"
              className="focus-ring rounded font-semibold text-[#0b5f54] underline underline-offset-4 hover:text-[#034239]"
            >
              Ce que fait notre lecteur
            </a>
          </p>
        </div>

        <div data-reveal style={{ "--rv-delay": "180ms" } as CSSProperties}>
          <div className="hidden md:block">
            <BrowserFrame className="border-[#c9eee2]">
              <Capture
                src={siteExistant}
                sizes="(min-width: 1200px) 620px, (min-width: 1024px) 52vw, (min-width: 768px) 92vw, 1px"
                alt="La section « Mon site » de Harmony : le formulaire pour connecter un site existant et les quatre étapes de la connexion."
              />
            </BrowserFrame>
          </div>
          <div className="mx-auto w-60 md:hidden">
            <PhoneFrame>
              <Capture
                src={mobileSite}
                sizes="(min-width: 768px) 1px, 240px"
                alt="La section « Mon site » de Harmony sur un téléphone, avec la connexion d'un site existant."
              />
            </PhoneFrame>
          </div>
        </div>

        {/* Un bouton de démo à la fin de chaque grande section */}
        <SectionCta grid text="Gardez votre site, et voyez ce que Harmony y ajoute." />
      </div>
    </section>
  );
}
