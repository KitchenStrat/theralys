"use client";

import { useEffect, useState, type CSSProperties, type FocusEvent } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { rich } from "./rich";

export type CarouselQuote = {
  text: string;
  author: string;
  role: string;
};

/**
 * Grande citation en carrousel : elle avance seule toutes les quelques
 * secondes, attend au survol et tant que le focus clavier est dedans, et se
 * pilote aux points et aux flèches. Les citations sont empilées dans la même
 * case : la hauteur ne bouge pas, quelle que soit la longueur de la citation
 * affichée. Pas d'avance automatique en mouvement réduit.
 */
export function QuoteCarousel({ quotes }: { quotes: CarouselQuote[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((current) => (current + 1) % quotes.length), 6500);
    return () => clearInterval(id);
  }, [paused, quotes.length]);

  if (quotes.length === 0) return null;

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
  }

  return (
    <div
      data-reveal
      style={{ "--rv-delay": "160ms" } as CSSProperties}
      role="group"
      aria-roledescription="carrousel"
      aria-label="Témoignages à la une"
      className="mx-auto mt-10 max-w-3xl px-5"
      onPointerEnter={(event) => event.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={onBlur}
    >
      <div className="relative rounded-3xl border border-cream-200 bg-white px-5 pt-12 pb-7 shadow-[var(--shadow-pop)] sm:px-10">
        <span
          aria-hidden
          className="absolute -top-6 left-1/2 grid h-12 w-12 -translate-x-1/2 place-items-center rounded-2xl bg-gradient-to-br from-primary-500 to-[#2f6dd3] text-white shadow-lg"
        >
          <Quote size={22} strokeWidth={2.2} />
        </span>
        {/* Les citations courtes se centrent dans la hauteur de la plus longue */}
        <div className="grid items-center text-center">
          {quotes.map((quote, i) => (
            <figure key={quote.author} aria-hidden={i !== index} className={clsx("[grid-area:1/1]", i === index ? "quote-in" : "invisible")}>
              <blockquote className="font-display text-xl leading-relaxed font-semibold text-pretty text-ink-900 md:text-2xl">
                «&nbsp;{rich(quote.text)}&nbsp;»
              </blockquote>
              <figcaption className="mt-5 text-base text-ink-700">
                <span className="font-semibold text-ink-900">{quote.author}</span>
                <span aria-hidden> · </span>
                {quote.role}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-center gap-1">
          <button
            type="button"
            aria-label="Témoignage précédent"
            onClick={() => setIndex((index + quotes.length - 1) % quotes.length)}
            className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-full border border-cream-300 text-ink-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 max-[359px]:hidden"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <div className="flex items-center">
            {quotes.map((item, i) => (
              <button
                key={item.author}
                type="button"
                aria-label={`Témoignage ${i + 1} sur ${quotes.length}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className="focus-ring group grid h-11 w-11 place-items-center rounded-full"
              >
                <span
                  className={clsx(
                    "block h-2 rounded-full transition-colors duration-200",
                    i === index ? "w-7 bg-primary-600" : "w-2 bg-ink-300 group-hover:bg-primary-400",
                  )}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Témoignage suivant"
            onClick={() => setIndex((index + 1) % quotes.length)}
            className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-full border border-cream-300 text-ink-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 max-[359px]:hidden"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
