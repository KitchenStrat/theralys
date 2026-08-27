import { type CSSProperties } from "react";
import { CountUp } from "./counter";
import { QuoteCarousel, type CarouselQuote } from "./quote-carousel";

const FEATURED: CarouselQuote[] = [
  {
    text: "J'ai fait appel à Harmony pour la création de mon site. Je voulais un site élégant et surtout bien référencé, pas juste une jolie vitrine. L'accompagnement a été sérieux du premier échange jusqu'à la mise en ligne, et les résultats ont suivi. Je recommande !",
    author: "Gabriel M.",
    role: "Étiopathe · Paris",
  },
  {
    text: "Le cabinet affiche complet 3 semaines à l'avance depuis la refonte... le site fait le travail d'accueil à ma place, moi je me concentre sur mes séances.",
    author: "Inès R.",
    role: "Kinésiologue · Strasbourg",
  },
  {
    text: "On m'a expliqué chaque choix (structure, textes, mots clés) sans jargon. 6 mois plus tard je suis en tête des recherches sur ma ville, honnêtement je m'y attendais pas.",
    author: "Thomas D.",
    role: "Ostéopathe · Bordeaux",
  },
  {
    text: "J'ai remplacé mon vieux site qui datait de 2015 par une vitrine dont je suis fière, sans y passer un seul week end. Rien que ça, ça valait le coup",
    author: "Claire V.",
    role: "Sophrologue · Angers",
  },
];

/*
 * Témoignages de démonstration : à remplacer par vos vrais retours clients
 * au fil des signatures (prénom + profession suffisent).
 */
/* Photos d'illustration (banque d'images) en attendant les vrais retours clients */
const QUOTES = [
  {
    name: "Mathilde B.",
    role: "Sophrologue · Albi",
    text: "Mon site est magnifique et surtout il m'amène des patients. Je reçois des appels de gens qui m'ont trouvée sur google, ça m'était jamais arrivé avant",
    photo: "/avatars/therapist-10.jpg",
  },
  {
    name: "Rose L.",
    role: "Naturopathe · Montpellier",
    text: "Le blog se remplit tout seul avec des articles sérieux, mes patients m'en parlent en consultation. Et visiblement google aime bien aussi :)",
    photo: "/avatars/cabinet-3.jpg",
  },
  {
    name: "Nadine F.",
    role: "Hypnothérapeute · Toulouse",
    text: "Franchement top. Je m'occupe de rien, le domaine l'hébergement les mises à jour tout est géré. Je change mes horaires en 2 clics et c'est en ligne.",
    photo: "/avatars/cabinet-5.jpg",
  },
  {
    name: "Grégoire T.",
    role: "Ostéopathe · Lyon",
    text: "En 3 mois je suis passé de la page 3 à la 1ère page sur ostéopathe dans ma ville... je pensais pas que ça irait aussi vite. Le suivi des mots clés rend tout ça très concret.",
    photo: "/avatars/therapist-4.jpg",
  },
  {
    name: "Célia A.",
    role: "Psychopraticienne · Nantes",
    text: "L'équipe a préparé une démo avant même que je m'engage. J'ai vu mon futur site, ajusté 2-3 couleurs et signé le lendemain. Rien à redire",
    photo: "/avatars/logo-cabinet-3.svg",
  },
  {
    name: "Karim S.",
    role: "Réflexologue · Bordeaux",
    text: "Mes avis google apparaissent directement sur le site ça rassure les nouveaux patients. Tres pro et tres simple d'utilisation !!",
    photo: "/avatars/cabinet-1.jpg",
  },
  {
    name: "Élodie P.",
    role: "Sage-femme · Rennes",
    text: "Je voulais un site sobre et rassurant, pas un truc criard. C'est exactement ça. Merci encore",
    photo: "/avatars/cabinet-6.jpg",
  },
  {
    name: "Vincent M.",
    role: "Chiropracteur · Grenoble",
    text: "Le tableau de bord montre les appels et les demandes d'itinéraire générés par le site, au moins je sais ce que ça me rapporte concrètement.",
    photo: "/avatars/therapist-12.jpg",
  },
];

const STATS = [
  { value: 1200, prefix: "+", suffix: "", decimals: 0, label: "praticiens accompagnés" },
  { value: 91, prefix: "", suffix: " %", decimals: 0, label: "renouvellent leur abonnement" },
  { value: 4.8, prefix: "", suffix: "/5", decimals: 1, label: "de satisfaction moyenne" },
  { value: 2.7, prefix: "×", suffix: "", decimals: 1, label: "de visibilité Google en 6 mois" },
];

function ReviewCard({ quote }: { quote: (typeof QUOTES)[number] }) {
  return (
    <figure className="w-80 shrink-0 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <p className="text-sm tracking-widest text-gold-400">★★★★★</p>
      <blockquote className="mt-2.5 text-sm leading-relaxed text-white/85">
        « {quote.text} »
      </blockquote>
      <figcaption className="mt-4 flex items-center gap-2.5">
        <img
          src={quote.photo}
          alt=""
          loading="lazy"
          className="h-9 w-9 rounded-full object-cover ring-1 ring-white/25"
        />
        <span>
          <span className="block text-sm font-semibold text-white">{quote.name}</span>
          <span className="block text-xs text-white/60">{quote.role}</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function Temoignages() {
  const rowA = [...QUOTES.slice(0, 4), ...QUOTES.slice(0, 4)];
  const rowB = [...QUOTES.slice(4), ...QUOTES.slice(4)];
  return (
    <section id="temoignages" className="relative overflow-hidden bg-night-900 py-24 text-white">
      <div aria-hidden data-parallax="0.07" className="absolute inset-0">
        <div className="blob left-[30%] top-[-12rem] h-[30rem] w-[30rem] bg-primary-600/25" />
      </div>

      <div className="relative">
        <p data-reveal className="text-center text-sm font-bold uppercase tracking-[0.2em] text-primary-300">
          Ils nous font confiance
        </p>
        <h2
          data-reveal
          style={{ "--rv-delay": "80ms" } as CSSProperties}
          className="font-display mx-auto mt-3 max-w-2xl text-center text-3xl font-bold md:text-5xl"
        >
          Nos praticiens témoignent
        </h2>

        <p
          data-reveal
          style={{ "--rv-delay": "130ms" } as CSSProperties}
          className="mt-5 flex justify-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-white/85 backdrop-blur">
            <span className="tracking-wider text-gold-400">★★★★★</span>
            <span className="font-semibold text-white">4,8/5</span> · plus de 50 avis de praticiens
          </span>
        </p>

        <QuoteCarousel quotes={FEATURED} />

        {/* Deux rangées défilant en sens opposés */}
        <div data-reveal style={{ "--rv-delay": "260ms" } as CSSProperties} className="mt-14 space-y-5">
          <div className="marquee" style={{ "--marquee-speed": "52s" } as CSSProperties}>
            <div className="marquee-track gap-5 pr-5">
              {rowA.map((quote, i) => (
                <ReviewCard key={`a-${quote.name}-${i}`} quote={quote} />
              ))}
            </div>
          </div>
          <div className="marquee" style={{ "--marquee-speed": "60s" } as CSSProperties}>
            <div className="marquee-track reverse gap-5 pr-5">
              {rowB.map((quote, i) => (
                <ReviewCard key={`b-${quote.name}-${i}`} quote={quote} />
              ))}
            </div>
          </div>
        </div>

        {/* Compteurs */}
        <div className="mx-auto mt-16 grid max-w-5xl grid-cols-2 gap-8 px-5 md:grid-cols-4">
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              data-reveal
              style={{ "--rv-delay": `${i * 100}ms` } as CSSProperties}
              className="text-center"
            >
              <p className="font-display text-4xl font-bold text-primary-300 md:text-5xl">
                <CountUp
                  to={stat.value}
                  decimals={stat.decimals}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                />
              </p>
              <p className="mt-2 text-sm text-white/65">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
