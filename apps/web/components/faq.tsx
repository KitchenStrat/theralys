"use client";

import { useState, type CSSProperties } from "react";
import clsx from "clsx";
import { rich } from "./rich";
import { Kinetic } from "./kinetic";
import { fr } from "./typo";

const QUESTIONS = [
  {
    q: "Harmony, c'est un site internet ou plus que cela ?",
    a: "**Les deux.** Harmony crée et héberge votre site, puis s'occupe de ce qui le fait vivre : articles de blog, fiche Google, contenus pour vos réseaux sociaux, accompagnement publicitaire et statistiques. Tout se retrouve dans un seul espace, avec un seul abonnement.",
  },
  {
    q: "J'ai déjà un site : puis-je utiliser Harmony ?",
    a: "**Oui, et vous le gardez.** Prenez la formule Scale seule et indiquez l'adresse de votre site dans votre espace : Harmony lit ses pages publiques pour comprendre votre activité, et vos contenus pour les réseaux sociaux, votre fiche Google et vos publicités s'appuient ensuite sur lui. Un petit code à coller permet de suivre ses visites.",
  },
  {
    q: "Puis-je prendre une seule formule ?",
    a: "**Oui.** Site et Scale se prennent séparément ou ensemble. **Site** : votre site professionnel et son blog. **Scale** : fiche Google, réseaux sociaux et publicité, sur votre site Harmony ou sur le vôtre. Vous pouvez ajouter l'autre formule plus tard.",
  },
  {
    q: "Dois-je m'occuper de la technique ?",
    a: "**Non, de rien du tout.** Nom de domaine, hébergement, certificat de sécurité, mises à jour : Harmony gère l'intégralité de la technique. Vous validez votre site, nous le mettons en ligne, et il reste maintenu en permanence.",
  },
  {
    q: "Qui publie sur mes réseaux sociaux ?",
    a: "**Vous.** Harmony prépare chaque mois vos visuels, carrousels et stories avec leur légende ; vous téléchargez, vous collez, vous postez depuis vos propres comptes. Rien n'est publié à votre place, et vous pouvez modifier chaque légende avant de la poster.",
  },
  {
    q: "Les articles du blog sont-ils écrits par une IA ?",
    a: "**Oui, par une IA spécialisée** (formule Site), à partir de vos spécialités, de votre ville et des thématiques que vous choisissez. Chaque article est rédigé sept jours avant sa date : vous pouvez le relire, le modifier, le reporter ou le retirer. Dans votre espace, un contenu rédigé par l'IA est toujours signalé.",
  },
  {
    q: "La publicité est-elle comprise dans l'abonnement ?",
    a: "**L'accompagnement, oui**, avec la formule Scale : diagnostic, mots-clés à viser, annonces prêtes à diffuser et plan d'action, pour Google comme pour Facebook et Instagram. **Le budget publicitaire, lui, est réglé directement à Google ou à Meta**, depuis vos propres comptes. Et rien ne vous oblige à en faire.",
  },
  {
    q: "Combien de temps faut-il pour être en ligne ?",
    a: "**Quelques jours suffisent le plus souvent.** Nous préparons d'abord une démo personnalisée de votre futur site. Une fois validée avec vous (textes, couleurs, photos), la mise en ligne est immédiate.",
  },
  {
    q: "Puis-je utiliser mon nom de domaine actuel ?",
    a: "**Oui.** Si vous possédez déjà un nom de domaine, vous nous l'indiquez depuis votre espace client et notre équipe s'occupe du rattachement complet. Sinon, nous achetons pour vous le domaine de votre choix : il est inclus dans la formule Site.",
  },
  {
    q: "Y a-t-il un engagement ?",
    a: "**Oui, de 12 mois minimum**, que vous régliez chaque mois, chaque trimestre ou chaque année. La formule sur 3 ans vous engage pour 3 ans, au prix par mois le plus bas. Dans tous les cas, **les frais de création et la formation sont offerts**.",
  },
  {
    q: "Comment savoir ce que cela me rapporte ?",
    a: "Votre espace montre **vos visiteurs, les clics sur votre prise de rendez-vous, les appels** et la provenance de chaque visite : Google, Instagram, Facebook, publicité. Avec la formule Scale, une carte vous montre aussi votre place dans Google Maps face aux cabinets voisins, mot-clé par mot-clé.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-24">
      <p data-reveal className="text-center text-base font-semibold text-primary-700">
        Questions fréquentes
      </p>
      <h2
        data-reveal="kinetic"
        style={{ "--rv-delay": "80ms" } as CSSProperties}
        className="font-display mt-3 text-center text-3xl leading-tight font-bold text-balance text-ink-900 md:text-5xl"
      >
        <Kinetic>Tout ce que vous devez savoir</Kinetic>
      </h2>

      <div className="mt-12 space-y-3">
        {QUESTIONS.map((item, i) => {
          const isOpen = open === i;
          return (
            /*
             * data-reveal vit sur un conteneur dont la classe ne change
             * jamais : la classe .is-in ajoutée par l'observer survit aux
             * re-rendus React déclenchés par l'ouverture/fermeture.
             */
            <div key={item.q} data-reveal style={{ "--rv-delay": `${i * 60}ms` } as CSSProperties}>
              <div
                className={clsx(
                  "overflow-hidden rounded-2xl border bg-white transition-colors duration-300",
                  isOpen ? "border-primary-300 shadow-[var(--shadow-card)]" : "border-cream-200",
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-reponse-${i}`}
                  className="focus-ring flex w-full items-center justify-between gap-4 rounded-2xl px-6 py-5 text-left"
                >
                  <span className="text-lg font-semibold text-ink-900">{fr(item.q)}</span>
                  <span
                    className={clsx(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-[background-color,color,rotate] duration-200",
                      isOpen ? "rotate-45 bg-primary-600 text-white" : "bg-primary-100 text-primary-700",
                    )}
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
                <div id={`faq-reponse-${i}`} inert={!isOpen} className={clsx("faq-panel", isOpen && "open")}>
                  <div>
                    <p className="px-6 pb-5 text-base leading-relaxed text-ink-700">{rich(item.a)}</p>
                  </div>
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
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-100 text-primary-700">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M4 5.5h16v10.5H9.5L5.5 19.5V16H4V5.5Z" strokeLinejoin="round" />
              <path d="M8 9.5h8M8 12.5h5" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="text-lg font-semibold text-ink-900">Une autre question&nbsp;?</p>
            <p className="text-base text-ink-700">Posez-la dans votre demande de démo : nous y répondons.</p>
          </div>
        </div>
        <a
          href="#demo"
          className="focus-ring group flex items-center gap-2 whitespace-nowrap rounded-full bg-ink-900 px-6 py-3 text-base font-semibold text-white transition-[background-color,border-color,color,scale] active:scale-[0.98] hover:bg-primary-700"
        >
          Demander ma démo
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
