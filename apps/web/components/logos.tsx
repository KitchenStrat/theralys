import { type CSSProperties } from "react";

/**
 * Bandeau défilant : là où un cabinet se fait trouver aujourd'hui. Logos
 * servis depuis /public/logos : la recherche, les cartes, les réseaux et les
 * assistants IA, qui s'appuient sur un site bien structuré pour recommander
 * un praticien.
 */
const PLATFORMS = [
  { name: "Google", logo: "/logos/google.svg" },
  { name: "Google Maps", logo: "/logos/google-maps.svg" },
  { name: "Instagram", logo: "/logos/instagram.svg" },
  { name: "Facebook", logo: "/logos/meta.svg" },
  { name: "ChatGPT", logo: "/logos/chatgpt.svg" },
  { name: "Claude", logo: "/logos/claude.svg" },
  { name: "Bing", logo: "/logos/bing.svg" },
];

export function Logos() {
  // La boucle translate la piste de -50 % : chaque moitié doit être plus
  // large que l'écran, sinon un vide apparaît sur les grands écrans.
  // 6 séquences par moitié couvrent jusqu'à un écran 4K.
  const row = Array.from({ length: 12 }, () => PLATFORMS).flat();
  return (
    <section className="border-y border-cream-200 bg-white/70 py-8 backdrop-blur">
      <p data-reveal className="px-5 text-center text-base font-medium text-ink-700">
        Présent là où vos futurs patients vous cherchent
      </p>
      <div data-reveal aria-hidden className="marquee mt-5" style={{ "--marquee-speed": "110s" } as CSSProperties}>
        <div className="marquee-track items-center gap-3 pr-3">
          {row.map((platform, i) => (
            <span
              key={`${platform.name}-${i}`}
              className="font-title flex items-center gap-2.5 rounded-full border border-cream-200 bg-white px-5 py-2 text-base font-semibold whitespace-nowrap text-ink-700 shadow-sm"
            >
              <img src={platform.logo} alt="" loading="lazy" className="h-5 w-auto" />
              {platform.name}
            </span>
          ))}
        </div>
      </div>
      {/* La même liste, une seule fois, pour les lecteurs d'écran */}
      <p className="sr-only">{PLATFORMS.map((platform) => platform.name).join(", ")}.</p>
    </section>
  );
}
