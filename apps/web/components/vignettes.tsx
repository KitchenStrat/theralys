import { type CSSProperties, type ReactNode } from "react";
import { CountUp } from "./counter";

/*
 * Maquettes produit dessinées en pur CSS/SVG (aucune image externe) :
 * elles évoquent les vrais écrans Harmony — site de praticien, tableau
 * de bord, résultat Google, blog en autopilote — et s'animent à
 * l'apparition (tracé de courbe, barres qui poussent, badges qui pulsent).
 */

export function BrowserFrame({
  url,
  children,
  className = "",
}: {
  url: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-[0_30px_80px_-30px_rgb(12_74_110/0.4)] ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-cream-200 bg-cream-100 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#fca5a5]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#fcd34d]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#86efac]" />
        <span className="ml-3 flex flex-1 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[10px] font-medium text-ink-500">
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-success-500" fill="currentColor" aria-hidden>
            <path d="M6 1a3 3 0 0 0-3 3v1H2.5A1.5 1.5 0 0 0 1 6.5v3A1.5 1.5 0 0 0 2.5 11h7A1.5 1.5 0 0 0 11 9.5v-3A1.5 1.5 0 0 0 9.5 5H9V4a3 3 0 0 0-3-3Zm2 4H4V4a2 2 0 1 1 4 0v1Z" />
          </svg>
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Mini site de thérapeute : l'aperçu du produit fini. */
export function MiniSite() {
  return (
    <BrowserFrame url="cabinet-sophrologie-albi.fr">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-primary-400" />
            <span className="skeleton-line h-1.5 w-14 text-ink-900" />
          </div>
          <div className="flex items-center gap-2">
            <span className="skeleton-line h-1.5 w-8 text-ink-900" />
            <span className="skeleton-line h-1.5 w-8 text-ink-900" />
            <span className="skeleton-line h-1.5 w-8 text-ink-900" />
            <span className="rounded-full bg-primary-500 px-2.5 py-1 text-[8px] font-semibold text-white">
              Prendre RDV
            </span>
          </div>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl bg-gradient-to-br from-[#dbeee6] via-[#cfe8f5] to-[#b7e2fb] p-4">
          <div className="max-w-[60%]">
            <div className="skeleton-line h-2.5 w-full bg-ink-900 opacity-70" />
            <div className="skeleton-line mt-1.5 h-2.5 w-3/4 bg-ink-900 opacity-70" />
            <div className="skeleton-line mt-2.5 h-1.5 w-full text-ink-700" />
            <div className="skeleton-line mt-1 h-1.5 w-5/6 text-ink-700" />
            <div className="mt-3 flex gap-1.5">
              <span className="rounded-full bg-ink-900/80 px-2.5 py-1 text-[7px] font-semibold text-white">
                Prendre rendez-vous
              </span>
              <span className="rounded-full border border-ink-900/30 px-2.5 py-1 text-[7px] font-semibold text-ink-900/70">
                Découvrir
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {["Gestion du stress", "Sommeil", "Confiance en soi"].map((label) => (
            <div key={label} className="rounded-lg border border-cream-200 bg-cream-50 p-2">
              <span className="block h-4 w-4 rounded-full bg-primary-100 text-center text-[8px] leading-4 text-primary-600">
                ✦
              </span>
              <p className="mt-1.5 text-[7px] font-semibold text-ink-900">{label}</p>
              <div className="skeleton-line mt-1 h-1 w-full text-ink-500" />
              <div className="skeleton-line mt-0.5 h-1 w-2/3 text-ink-500" />
            </div>
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}

const GOLD_STARS = "★★★★★";

/** Carte avis Google flottante. */
export function MiniReview({ className = "" }: { className?: string }) {
  return (
    <div
      className={`w-52 rounded-2xl border border-cream-200 bg-white p-3.5 shadow-[0_20px_50px_-20px_rgb(12_74_110/0.45)] ${className}`}
    >
      <div className="flex items-center gap-2">
        <img
          src="/avatars/therapist-8.jpg"
          alt=""
          loading="lazy"
          className="h-7 w-7 rounded-full object-cover"
        />
        <div>
          <p className="text-[10px] font-semibold text-ink-900">Marie L.</p>
          <p className="text-[8px] text-ink-500">il y a 2 semaines</p>
        </div>
        <span className="ml-auto text-xs font-bold text-[#4285f4]">G</span>
      </div>
      <p className="mt-1.5 text-[10px] tracking-wider text-gold-400">{GOLD_STARS}</p>
      <p className="mt-1 text-[9px] leading-relaxed text-ink-700">
        « Une écoute exceptionnelle, je recommande vivement ce cabinet. »
      </p>
    </div>
  );
}

/** Tuile de statistiques flottante : visites + point « en direct ». */
export function MiniKpi({ className = "" }: { className?: string }) {
  return (
    <div
      className={`w-44 rounded-2xl border border-cream-200 bg-white p-3.5 shadow-[0_20px_50px_-20px_rgb(12_74_110/0.45)] ${className}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-medium text-ink-500">Visites ce mois</p>
        <span className="dot-live h-1.5 w-1.5 rounded-full bg-success-500" />
      </div>
      <p className="font-display mt-0.5 text-xl font-bold text-ink-900">1 284</p>
      <p className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold text-success-500">
        <svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden>
          <path d="M5 1 9 6H6v3H4V6H1L5 1Z" />
        </svg>
        +18 % vs mois dernier
      </p>
    </div>
  );
}

/** Jauge circulaire flottante : le score SEO se remplit à l'apparition. */
export function MiniGauge({ className = "" }: { className?: string }) {
  const circumference = 2 * Math.PI * 26;
  const score = 98;
  return (
    <div
      className={`w-44 rounded-2xl border border-cream-200 bg-white p-3.5 shadow-[0_20px_50px_-20px_rgb(12_74_110/0.45)] ${className}`}
    >
      <p className="text-[9px] font-medium text-ink-500">Score SEO de votre site</p>
      <div className="mt-1.5 flex items-center gap-3">
        <svg viewBox="0 0 60 60" className="h-14 w-14 -rotate-90" aria-hidden>
          <circle cx="30" cy="30" r="26" fill="none" stroke="#e6eff7" strokeWidth="6" />
          <circle
            cx="30"
            cy="30"
            r="26"
            fill="none"
            stroke="#0e97dd"
            strokeWidth="6"
            strokeLinecap="round"
            className="gauge-arc"
            style={
              {
                "--gauge-c": `${circumference.toFixed(2)}`,
                "--gauge-off": `${(circumference * (1 - score / 100)).toFixed(2)}`,
              } as CSSProperties
            }
          />
        </svg>
        <div>
          <p className="font-display text-xl font-bold leading-tight text-ink-900">
            <CountUp to={score} duration={1900} />
            <span className="text-xs font-semibold text-ink-500">/100</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold text-success-500">
            <svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden>
              <path d="M5 1 9 6H6v3H4V6H1L5 1Z" />
            </svg>
            +12 pts ce trimestre
          </p>
        </div>
      </div>
    </div>
  );
}

/** Vignette « Suivez votre croissance » : tuiles + courbe qui se trace. */
export function MiniStats() {
  return (
    <div className="rounded-xl border border-cream-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: "Visites", value: "1 284", delta: "+18 %" },
          { label: "Appels reçus", value: "512", delta: "+12 %" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg bg-cream-100 p-2.5">
            <p className="text-[9px] font-medium text-ink-500">{kpi.label}</p>
            <p className="font-display text-lg font-bold leading-tight text-ink-900">{kpi.value}</p>
            <p className="flex items-center gap-0.5 text-[9px] font-semibold text-success-500">
              <svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden>
                <path d="M5 1 9 6H6v3H4V6H1L5 1Z" />
              </svg>
              {kpi.delta}
            </p>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 260 72" className="mt-3 w-full" aria-hidden>
        <defs>
          <linearGradient id="statfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0e97dd" stopOpacity="0.22" />
            <stop offset="1" stopColor="#0e97dd" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[18, 36, 54].map((y) => (
          <line key={y} x1="0" x2="260" y1={y} y2={y} stroke="#e6eff7" strokeWidth="1" />
        ))}
        <path
          className="spark-fill"
          d="M4 58 C 40 54, 62 44, 92 42 C 122 40, 140 30, 170 26 C 200 22, 228 16, 256 10 L 256 72 L 4 72 Z"
          fill="url(#statfill)"
        />
        <path
          className="spark-path"
          d="M4 58 C 40 54, 62 44, 92 42 C 122 40, 140 30, 170 26 C 200 22, 228 16, 256 10"
          fill="none"
          stroke="#0e97dd"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength="1"
        />
        <circle cx="256" cy="10" r="3.5" fill="#0e97dd" className="dot-blue" />
      </svg>
    </div>
  );
}

/** Vignette « 1er sur Google » : page de résultats avec le cabinet en tête. */
export function MiniSearch() {
  return (
    <div className="rounded-xl border border-cream-200 bg-white p-4">
      <div className="flex items-center gap-2 rounded-full border border-cream-200 bg-cream-50 px-3 py-1.5">
        <span className="text-xs font-bold text-[#4285f4]">G</span>
        <span className="text-[10px] text-ink-700">sophrologue albi</span>
        <svg viewBox="0 0 12 12" className="ml-auto h-3 w-3 text-primary-500" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="5" cy="5" r="3.5" />
          <path d="m8 8 3 3" strokeLinecap="round" />
        </svg>
      </div>
      <div className="relative mt-3 rounded-lg border border-primary-200 bg-primary-50 p-3">
        <span className="absolute -top-2 right-3 rounded-full bg-primary-500 px-2 py-0.5 text-[8px] font-bold text-white shadow">
          1ʳᵉ position
        </span>
        <div className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-primary-400 to-primary-600" />
          <span className="text-[9px] text-ink-500">cabinet-sophrologie-albi.fr</span>
        </div>
        <p className="mt-1 text-[11px] font-semibold text-[#1a0dab]">
          Sophrologue à Albi — Cabinet Claire Dupont
        </p>
        <div className="skeleton-line mt-1.5 h-1.5 w-full text-ink-700" />
        <div className="skeleton-line mt-1 h-1.5 w-4/5 text-ink-700" />
        <p className="mt-1.5 text-[9px] tracking-wider text-gold-400">
          {GOLD_STARS} <span className="text-ink-500">4,9 · 47 avis</span>
        </p>
      </div>
      {[2, 3].map((rank) => (
        <div key={rank} className="mt-2 rounded-lg border border-cream-200 p-2.5 opacity-55">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-cream-300" />
            <span className="skeleton-line h-1.5 w-24 text-ink-500" />
          </div>
          <div className="skeleton-line mt-1.5 h-1.5 w-3/5 text-ink-700" />
        </div>
      ))}
    </div>
  );
}

/** Vignette « SEO en autopilote » : articles publiés + mots-clés qui montent. */
export function MiniAutopilot() {
  const articles = [
    { title: "Gérer le stress au travail : 5 clés", day: "Lun." },
    { title: "Sommeil : retrouver des nuits sereines", day: "Mar." },
    { title: "Sophrologie et préparation mentale", day: "Jeu." },
    { title: "Respiration : l'exercice des 4 temps", day: "Ven." },
  ];
  const keywords = [
    { label: "sophrologue albi", width: "92%" },
    { label: "gestion du stress", width: "74%" },
    { label: "troubles du sommeil", width: "58%" },
  ];
  return (
    <div className="rounded-xl border border-cream-200 bg-white p-4">
      <div className="space-y-1.5">
        {articles.map((article, i) => (
          <div
            key={article.title}
            data-reveal
            style={{ "--rv-delay": `${200 + i * 130}ms` } as CSSProperties}
            className="flex items-center gap-2 rounded-lg bg-cream-100 px-2.5 py-1.5"
          >
            <span className="w-7 text-[8px] font-bold uppercase text-primary-600">{article.day}</span>
            <span className="flex-1 truncate text-[9px] font-medium text-ink-900">{article.title}</span>
            <span className="flex items-center gap-1 rounded-full bg-success-100 px-1.5 py-0.5 text-[7px] font-bold text-success-500">
              <svg viewBox="0 0 10 10" className="h-1.5 w-1.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="m1.5 5.5 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Publié
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[8px] font-bold uppercase tracking-wide text-ink-500">
        Vos mots-clés sur Google
      </p>
      <div className="mt-1.5 space-y-1.5">
        {keywords.map((keyword, i) => (
          <div key={keyword.label} className="flex items-center gap-2">
            <span className="w-24 truncate text-[9px] text-ink-700">{keyword.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream-200">
              <div
                className="grow-x h-full rounded-full bg-primary-500"
                style={{ width: keyword.width, "--bar-delay": `${400 + i * 150}ms` } as CSSProperties}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
