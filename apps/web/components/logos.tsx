import { type CSSProperties } from "react";

/**
 * Bandeau défilant : là où le cabinet devient visible. Marques citées en
 * texte (pas de logos embarqués) — Google, Maps, et les assistants IA qui
 * s'appuient sur un site bien structuré pour recommander un praticien.
 */
const PLATFORMS = [
  "Google",
  "Google Maps",
  "ChatGPT",
  "Claude",
  "Perplexity",
  "Gemini",
  "Bing",
  "Mistral",
];

export function Logos() {
  const row = [...PLATFORMS, ...PLATFORMS];
  return (
    <section className="border-y border-cream-200 bg-white/60 py-8 backdrop-blur">
      <p data-reveal className="text-center text-sm font-medium text-ink-500">
        Votre cabinet, visible partout où vos patients cherchent
      </p>
      <div
        data-reveal
        className="marquee mt-5"
        style={{ "--marquee-speed": "30s" } as CSSProperties}
      >
        <div className="marquee-track items-center gap-3 pr-3">
          {row.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="whitespace-nowrap rounded-full border border-cream-200 bg-white px-5 py-2 font-display text-base font-semibold text-ink-700 shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:text-primary-700"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
