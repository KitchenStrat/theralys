import type { CSSProperties } from "react";
import Image, { type StaticImageData } from "next/image";
import { Star } from "lucide-react";
import cabinet1 from "@/assets/temoignages/cabinet-1.jpg";
import cabinet3 from "@/assets/temoignages/cabinet-3.jpg";
import cabinet5 from "@/assets/temoignages/cabinet-5.jpg";
import cabinet6 from "@/assets/temoignages/cabinet-6.jpg";
import logoCabinet3 from "@/assets/temoignages/logo-cabinet-3.svg";
import therapist10 from "@/assets/temoignages/therapist-10.jpg";
import therapist12 from "@/assets/temoignages/therapist-12.jpg";
import therapist4 from "@/assets/temoignages/therapist-4.jpg";
import { QuoteCarousel, type CarouselQuote } from "./quote-carousel";
import { fr } from "./typo";

/*
 * TÉMOIGNAGES PROVISOIRES. Les textes, les prénoms et les portraits ci-dessous
 * sont des contenus d'illustration (portraits de banque d'images), là pour
 * juger du rendu de la section. Ils ne sont affichés que sur la page d'aperçu
 * (`/apercu`, non indexée), jamais sur la page publique.
 *
 * Pour publier la section : remplacer ces contenus par de vrais retours
 * (prénom, métier, ville, texte, accord de la personne), puis passer
 * `testimonials` à `<Landing />` dans `app/page.tsx`.
 */
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

type Review = { name: string; role: string; text: string; photo: StaticImageData };

const REVIEWS: Review[] = [
  {
    name: "Mathilde B.",
    role: "Sophrologue · Albi",
    text: "Mon site est magnifique et surtout il m'amène des patients. Je reçois des appels de gens qui m'ont trouvée sur google, ça m'était jamais arrivé avant",
    photo: therapist10,
  },
  {
    name: "Rose L.",
    role: "Naturopathe · Montpellier",
    text: "Le blog se remplit tout seul avec des articles sérieux, mes patients m'en parlent en consultation. Et visiblement google aime bien aussi :)",
    photo: cabinet3,
  },
  {
    name: "Nadine F.",
    role: "Hypnothérapeute · Toulouse",
    text: "Franchement top. Je m'occupe de rien, le domaine l'hébergement les mises à jour tout est géré. Je change mes horaires en 2 clics et c'est en ligne.",
    photo: cabinet5,
  },
  {
    name: "Grégoire T.",
    role: "Ostéopathe · Lyon",
    text: "En 3 mois je suis passé de la page 3 à la 1ère page sur ostéopathe dans ma ville... je pensais pas que ça irait aussi vite. Le suivi sur Google Maps rend tout ça très concret.",
    photo: therapist4,
  },
  {
    name: "Célia A.",
    role: "Psychopraticienne · Nantes",
    text: "L'équipe a préparé une démo avant même que je m'engage. J'ai vu mon futur site, ajusté 2-3 couleurs et signé le lendemain. Rien à redire",
    photo: logoCabinet3,
  },
  {
    name: "Karim S.",
    role: "Réflexologue · Bordeaux",
    text: "Mes avis google apparaissent directement sur le site ça rassure les nouveaux patients. Tres pro et tres simple d'utilisation !!",
    photo: cabinet1,
  },
  {
    name: "Élodie P.",
    role: "Sage-femme · Rennes",
    text: "Je voulais un site sobre et rassurant, pas un truc criard. C'est exactement ça. Merci encore",
    photo: cabinet6,
  },
  {
    name: "Vincent M.",
    role: "Chiropracteur · Grenoble",
    text: "Le tableau de bord montre les appels et les clics de rendez-vous générés par le site, au moins je sais ce que ça me rapporte concrètement.",
    photo: therapist12,
  },
];

/** Chaque moitié de piste doit dépasser la largeur de l'écran : six passages de quatre cartes couvrent jusqu'au 4K. */
const LOOPS = 6;

function ReviewCard({ review }: { review: Review }) {
  return (
    <figure className="flex w-[19rem] shrink-0 flex-col rounded-2xl border border-cream-200 bg-white p-5 shadow-[var(--shadow-card)] sm:w-80">
      <p role="img" aria-label="Note : 5 sur 5" className="flex gap-0.5 text-[#f5a524]">
        {Array.from({ length: 5 }, (_, star) => (
          <Star key={star} size={16} fill="currentColor" strokeWidth={0} aria-hidden />
        ))}
      </p>
      <blockquote className="mt-3 flex-1 text-base leading-relaxed text-ink-700">«&nbsp;{fr(review.text)}&nbsp;»</blockquote>
      <figcaption className="mt-4 flex items-center gap-3">
        <Image src={review.photo} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover ring-2 ring-primary-100" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink-900">{review.name}</span>
          <span className="block text-sm text-ink-500">{review.role}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/** Une rangée qui défile : le premier passage est lu, les suivants ne servent qu'à boucler. */
function ReviewRow({ reviews, speed, reverse = false }: { reviews: Review[]; speed: string; reverse?: boolean }) {
  return (
    <div className="marquee" style={{ "--marquee-speed": speed } as CSSProperties}>
      <ul className={`marquee-track reviews-track gap-5 py-2 pr-5${reverse ? " reverse" : ""}`}>
        {Array.from({ length: LOOPS }, (_, loop) =>
          reviews.map((review) => (
            <li key={`${loop}-${review.name}`} aria-hidden={loop > 0 || undefined} className="flex">
              <ReviewCard review={review} />
            </li>
          )),
        )}
      </ul>
    </div>
  );
}

/**
 * « Nos praticiens témoignent » : une citation à la une, puis deux rangées
 * d'avis qui défilent en sens opposés (elles attendent au survol, et se
 * rangent en grille fixe en mouvement réduit).
 */
export function Testimonials() {
  return (
    <section id="temoignages" className="relative overflow-hidden bg-gradient-to-b from-white via-primary-50 to-white py-24 md:py-28">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cream-300 to-transparent" />
      <div aria-hidden className="blob top-10 left-[12%] h-72 w-72 bg-primary-200/50" />
      <div aria-hidden className="blob right-[10%] bottom-24 h-72 w-72 bg-[#c9d6ff]/45" />

      <div className="relative">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <p data-reveal className="text-sm font-bold tracking-[0.18em] text-primary-700 uppercase">
            Ils nous font confiance
          </p>
          <h2
            data-reveal
            style={{ "--rv-delay": "80ms" } as CSSProperties}
            className="font-display mt-3 text-3xl leading-tight font-extrabold text-balance text-ink-900 md:text-5xl"
          >
            Nos praticiens témoignent
          </h2>
        </div>

        <QuoteCarousel quotes={FEATURED} />

        <div data-reveal style={{ "--rv-delay": "240ms" } as CSSProperties} className="mt-12 space-y-3">
          <ReviewRow reviews={REVIEWS.slice(0, 4)} speed="150s" />
          <ReviewRow reviews={REVIEWS.slice(4)} speed="175s" reverse />
        </div>
      </div>
    </section>
  );
}
