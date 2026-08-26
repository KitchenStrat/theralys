"use client";

import { useEffect, useState, type CSSProperties } from "react";
import clsx from "clsx";

export type CarouselQuote = {
  text: string;
  author: string;
  role: string;
};

/**
 * Grande citation en carrousel : avance seule toutes les quelques secondes,
 * se met en pause au survol, et reste pilotable aux points et aux flèches.
 * Pas d'avance automatique si l'utilisateur réduit les animations.
 */
export function QuoteCarousel({ quotes }: { quotes: CarouselQuote[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % quotes.length), 6500);
    return () => clearInterval(id);
  }, [paused, quotes.length]);

  const quote = quotes[index];
  if (!quote) return null;

  return (
    <div
      data-reveal
      style={{ "--rv-delay": "160ms" } as CSSProperties}
      className="mx-auto mt-10 max-w-3xl px-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div key={index} className="quote-in min-h-44 text-center md:min-h-36">
        <blockquote className="font-display text-xl font-medium leading-relaxed text-white/90 md:text-2xl">
          «&nbsp;{quote.text}&nbsp;»
        </blockquote>
        <p className="mt-4 text-sm text-white/60">
          {quote.author} — {quote.role}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label="Témoignage précédent"
          onClick={() => setIndex((index + quotes.length - 1) % quotes.length)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:border-white/40 hover:text-white"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          {quotes.map((item, i) => (
            <button
              key={item.author}
              type="button"
              aria-label={`Témoignage ${i + 1}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={clsx(
                "h-2 rounded-full transition-all duration-400",
                i === index ? "w-7 bg-primary-300" : "w-2 bg-white/25 hover:bg-white/45",
              )}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Témoignage suivant"
          onClick={() => setIndex((index + 1) % quotes.length)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:border-white/40 hover:text-white"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="m6 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
