import { type CSSProperties } from "react";
import { BrowserFrame } from "./vignettes";

const PILLARS = [
  {
    title: "Livré clé en main",
    text: "Nom de domaine, hébergement, certificat SSL, mise en ligne : nous gérons toute la technique. Vous validez votre site, il est en ligne.",
    icon: (
      <path d="M12 3 4 7v5c0 4.4 3.4 8.5 8 9.5 4.6-1 8-5.1 8-9.5V7l-8-4Zm-1.5 12.5-3-3 1.4-1.4 1.6 1.6 4.1-4.2 1.4 1.4-5.5 5.6Z" />
    ),
  },
  {
    title: "Un SEO qui travaille pour vous",
    text: "Blog automatisé, avis Google synchronisés, pages locales, suivi des mots-clés : votre référencement progresse chaque semaine, sans que vous y pensiez.",
    icon: (
      <path d="M4 19h16v2H4v-2Zm2-2 4-5 3 3 5-7 2 1.5-6.5 9L10 15l-2.5 3L6 17Z" />
    ),
  },
  {
    title: "Une interface simple d'utilisation",
    text: "Un back office pensé pour les praticiens : modifiez vos textes, photos, horaires ou tarifs en deux clics — sans aucune compétence technique.",
    icon: (
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 4a7 7 0 0 1-.1 1.2l2 1.6-2 3.4-2.4-1a7.4 7.4 0 0 1-2 1.2L16 21h-4l-.4-2.6a7.4 7.4 0 0 1-2.1-1.2l-2.4 1-2-3.4 2-1.6A7 7 0 0 1 7 12c0-.4 0-.8.1-1.2l-2-1.6 2-3.4 2.4 1a7.4 7.4 0 0 1 2-1.2L12 3h4l.4 2.6a7.4 7.4 0 0 1 2.1 1.2l2.4-1 2 3.4-2 1.6c.1.4.1.8.1 1.2Z" />
    ),
  },
];

export function Presence() {
  return (
    <section className="relative overflow-hidden bg-night-900 py-24 text-white">
      <div aria-hidden className="absolute inset-0">
        <div className="blob left-[-8rem] top-[-10rem] h-[26rem] w-[26rem] bg-primary-700/30" />
        <div
          className="blob bottom-[-10rem] right-[-6rem] h-[28rem] w-[28rem] bg-primary-500/20"
          style={{ animationDelay: "-9s" }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-5">
        <p data-reveal className="text-sm font-bold uppercase tracking-[0.2em] text-primary-300">
          Zéro charge mentale
        </p>
        <h2
          data-reveal
          style={{ "--rv-delay": "80ms" } as CSSProperties}
          className="font-display mt-3 max-w-xl text-3xl font-bold md:text-5xl"
        >
          Votre présence web, de A à Z
        </h2>

        <div className="mt-14 grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-8">
            {PILLARS.map((pillar, i) => (
              <div
                key={pillar.title}
                data-reveal
                style={{ "--rv-delay": `${120 + i * 120}ms` } as CSSProperties}
                className="flex gap-4"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-500/15 text-primary-300 ring-1 ring-primary-500/30">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
                    {pillar.icon}
                  </svg>
                </span>
                <div>
                  <h3 className="font-display text-xl font-bold">{pillar.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-white/70">{pillar.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Maquette du back office Harmony */}
          <div data-reveal style={{ "--rv-delay": "200ms" } as CSSProperties} className="float-slow">
            <BrowserFrame url="app.harmony-web.fr" className="border-white/10">
              <div className="grid grid-cols-[86px_1fr] bg-cream-50">
                <div className="border-r border-cream-200 bg-white p-3">
                  <p className="wordmark font-display text-xs font-bold">Harmony</p>
                  <div className="mt-3 space-y-1.5">
                    {["Accueil", "Éditeur", "Publications", "Mots-clés", "Compte"].map(
                      (item, i) => (
                        <p
                          key={item}
                          className={
                            i === 1
                              ? "rounded-md bg-primary-100 px-2 py-1 text-[8px] font-bold text-primary-700"
                              : "px-2 py-1 text-[8px] font-medium text-ink-500"
                          }
                        >
                          {item}
                        </p>
                      ),
                    )}
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-ink-900">Mon site</p>
                    <span className="flex items-center gap-1 rounded-full bg-success-100 px-2 py-0.5 text-[7px] font-bold text-success-500">
                      <span className="dot-live h-1 w-1 rounded-full bg-success-500" /> En ligne
                    </span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    {[
                      { label: "Visites", value: "1 284" },
                      { label: "Appels", value: "512" },
                      { label: "Avis Google", value: "4,9 ★" },
                    ].map((kpi) => (
                      <div key={kpi.label} className="rounded-lg border border-cream-200 bg-white p-2">
                        <p className="text-[7px] text-ink-500">{kpi.label}</p>
                        <p className="font-display text-sm font-bold text-ink-900">{kpi.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2.5 rounded-lg border border-cream-200 bg-white p-2.5">
                    <p className="text-[8px] font-bold text-ink-900">Prochains articles</p>
                    {["Lun. — Gérer le stress au travail", "Jeu. — Mieux dormir naturellement"].map(
                      (row) => (
                        <div key={row} className="mt-1.5 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary-400" />
                          <span className="text-[8px] text-ink-700">{row}</span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </BrowserFrame>
          </div>
        </div>
      </div>
    </section>
  );
}
