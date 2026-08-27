import { type CSSProperties } from "react";

/**
 * Bandeau défilant : là où le cabinet devient visible. Logos officiels
 * servis depuis /public/logos — Google, Maps, et les assistants IA qui
 * s'appuient sur un site bien structuré pour recommander un praticien.
 */
const PLATFORMS = [
  { name: "Google", logo: "/logos/google.svg" },
  { name: "Google Maps", logo: "/logos/google-maps.svg" },
  { name: "ChatGPT", logo: "/logos/chatgpt.svg" },
  { name: "Claude", logo: "/logos/claude.svg" },
  { name: "Perplexity", logo: "/logos/perplexity.svg" },
  { name: "Gemini", logo: "/logos/gemini.svg" },
  { name: "Bing", logo: "/logos/bing.svg" },
  { name: "Mistral", logo: "/logos/mistral.svg" },
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
          {row.map((platform, i) => (
            <span
              key={`${platform.name}-${i}`}
              className="flex items-center gap-2.5 whitespace-nowrap rounded-full border border-cream-200 bg-white px-5 py-2 font-display text-base font-semibold text-ink-700 shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:text-primary-700"
            >
              <img src={platform.logo} alt="" loading="lazy" className="h-5 w-auto" />
              {platform.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
