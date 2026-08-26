"use client";

import { useState, type CSSProperties } from "react";
import clsx from "clsx";

const QUESTIONS = [
  {
    q: "Dois-je m'occuper de la technique ?",
    a: "Non, de rien du tout. Nom de domaine, hébergement, certificat de sécurité, mises à jour : Harmony gère l'intégralité de la technique. Vous validez votre site, nous le mettons en ligne, et il reste maintenu en permanence.",
  },
  {
    q: "Combien de temps faut-il pour être en ligne ?",
    a: "Quelques jours suffisent. Nous préparons d'abord une démo personnalisée de votre futur site. Une fois validée avec vous (textes, couleurs, photos), la mise en ligne est immédiate.",
  },
  {
    q: "Puis-je utiliser mon nom de domaine actuel ?",
    a: "Oui. Si vous possédez déjà un nom de domaine, vous nous l'indiquez depuis votre espace client et notre équipe s'occupe du rattachement complet (DNS, certificat). Sinon, nous achetons pour vous le domaine de votre choix — il est inclus dans l'abonnement.",
  },
  {
    q: "Comment fonctionne le blog automatisé ?",
    a: "Avec la formule Boost, jusqu'à 4 articles par semaine sont rédigés et publiés automatiquement sur les thématiques de votre pratique et les recherches locales de vos patients. Vous pouvez orienter les sujets, relire ou modifier chaque article depuis votre espace.",
  },
  {
    q: "Puis-je modifier mon site moi-même ?",
    a: "Oui, très simplement. Votre espace client vous permet de changer vos textes, photos, horaires, tarifs ou couleurs en quelques clics, sans aucune compétence technique. Et si vous préférez, nous le faisons pour vous.",
  },
  {
    q: "Y a-t-il un engagement ?",
    a: "Vous choisissez : une formule mensuelle sans engagement, résiliable à tout moment, ou une formule annuelle environ 30 % moins chère. Dans les deux cas, il n'y a aucun frais de création.",
  },
  {
    q: "Les avis Google apparaissent-ils sur mon site ?",
    a: "Oui, automatiquement. Vos avis Google sont synchronisés régulièrement et présentés sur votre site avec leur note et leur date — un élément de réassurance décisif pour les nouveaux patients.",
  },
  {
    q: "Comment suivez-vous mes résultats ?",
    a: "Votre tableau de bord montre les visites, les appels et les demandes d'itinéraire générés par votre site. Avec la formule Boost, vous suivez aussi la position de votre cabinet sur vos mots-clés Google, semaine après semaine.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-24">
      <p data-reveal className="text-center text-sm font-bold uppercase tracking-[0.2em] text-primary-600">
        FAQ
      </p>
      <h2
        data-reveal
        style={{ "--rv-delay": "80ms" } as CSSProperties}
        className="font-display mt-3 text-center text-3xl font-bold text-ink-900 md:text-5xl"
      >
        Tout ce que vous devez savoir
      </h2>

      <div className="mt-12 space-y-3">
        {QUESTIONS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div
              key={item.q}
              data-reveal
              style={{ "--rv-delay": `${i * 60}ms` } as CSSProperties}
              className={clsx(
                "overflow-hidden rounded-2xl border bg-white transition-colors duration-300",
                isOpen ? "border-primary-300 shadow-[var(--shadow-card)]" : "border-cream-200",
              )}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
              >
                <span className="font-semibold text-ink-900">{item.q}</span>
                <span
                  className={clsx(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                    isOpen ? "rotate-45 bg-primary-500 text-white" : "bg-primary-100 text-primary-600",
                  )}
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                  </svg>
                </span>
              </button>
              <div className={clsx("faq-panel", isOpen && "open")}>
                <div>
                  <p className="px-6 pb-5 leading-relaxed text-ink-700">{item.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Une porte de sortie chaleureuse pour les questions restantes */}
      <div
        data-reveal
        className="mt-10 flex flex-col items-center justify-between gap-5 rounded-2xl border border-cream-200 bg-white px-6 py-5 shadow-[var(--shadow-card)] sm:flex-row"
      >
        <div className="flex items-center gap-4">
          <div className="flex -space-x-2.5">
            {[
              { initial: "C", classes: "from-primary-400 to-primary-600" },
              { initial: "A", classes: "from-[#7cc9a8] to-[#3d9a72]" },
              { initial: "S", classes: "from-primary-500 to-primary-800" },
            ].map((avatar) => (
              <span
                key={avatar.initial}
                className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${avatar.classes} text-sm font-bold text-white ring-2 ring-white`}
              >
                {avatar.initial}
              </span>
            ))}
          </div>
          <div>
            <p className="font-semibold text-ink-900">Une question supplémentaire&nbsp;?</p>
            <p className="text-sm text-ink-500">Notre équipe est là pour vous accompagner.</p>
          </div>
        </div>
        <a
          href="#demo"
          className="group flex items-center gap-2 whitespace-nowrap rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-primary-600"
        >
          Nous contacter
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <path d="M2 8h11M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    </section>
  );
}
