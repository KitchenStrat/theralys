import { type CSSProperties } from "react";
import { MiniAutopilot, MiniSearch, MiniSite, MiniStats } from "./vignettes";

const CARDS = [
  {
    tag: "Votre image",
    title: "Un site web à votre image",
    text: "Couleurs, textes, photos, spécialités : un site élégant est généré pour votre pratique, puis ajusté avec vous jusqu'à ce qu'il vous ressemble vraiment.",
    vignette: <MiniSite />,
  },
  {
    tag: "Vos résultats",
    title: "Suivez votre croissance",
    text: "Visites, appels, demandes d'itinéraire : un tableau de bord limpide vous montre, chaque semaine, ce que votre site vous rapporte concrètement.",
    vignette: <MiniStats />,
  },
  {
    tag: "Votre visibilité",
    title: "1ᵉʳ sur Google, durablement",
    text: "Pages de spécialités dédiées, référencement local, données structurées, avis synchronisés : tout est pensé pour installer votre cabinet en tête des recherches.",
    vignette: <MiniSearch />,
  },
  {
    tag: "Votre SEO",
    title: "SEO en autopilote",
    text: "Jusqu'à 4 articles par semaine, écrits et publiés automatiquement sur les sujets que vos patients recherchent — votre site travaille même quand vous dormez.",
    vignette: <MiniAutopilot />,
  },
];

export function Features() {
  return (
    <section id="fonctionnalites" className="mx-auto max-w-6xl px-5 py-24">
      <p data-reveal className="text-center text-sm font-bold uppercase tracking-[0.2em] text-primary-600">
        Une seule solution, tout inclus
      </p>
      <h2
        data-reveal
        style={{ "--rv-delay": "80ms" } as CSSProperties}
        className="font-display mx-auto mt-3 max-w-2xl text-center text-3xl font-bold text-ink-900 md:text-5xl"
      >
        Pourquoi les praticiens choisissent Harmony&nbsp;?
      </h2>
      <p
        data-reveal
        style={{ "--rv-delay": "160ms" } as CSSProperties}
        className="mx-auto mt-4 max-w-2xl text-center text-lg text-ink-700"
      >
        Parce qu'un beau site ne suffit pas : il doit être trouvé. Harmony s'occupe des deux.
      </p>

      <div className="mt-14 grid gap-6 md:grid-cols-2">
        {CARDS.map((card, i) => (
          <article
            key={card.title}
            data-reveal
            style={{ "--rv-delay": `${i * 110}ms` } as CSSProperties}
            data-spotlight
            className="lift spotlight group overflow-hidden rounded-3xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-card)] md:p-8"
          >
            <span className="inline-block rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-700">
              {card.tag}
            </span>
            <h3 className="font-display mt-4 text-2xl font-bold text-ink-900">{card.title}</h3>
            <p className="mt-2.5 leading-relaxed text-ink-700">{card.text}</p>
            <div className="mt-6 transition-transform duration-500 group-hover:scale-[1.02]">
              {card.vignette}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
