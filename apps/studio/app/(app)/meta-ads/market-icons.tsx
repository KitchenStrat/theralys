import type { ReactNode } from "react";

/**
 * Pictogrammes de la galerie du marché (SVG en ligne, trait de 1,75 px,
 * couleur du texte courant). Décoratifs : le libellé accessible est porté par
 * le bouton ou le texte voisin.
 */
const PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  bookmark: <path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.5a1 1 0 0 1 1-1z" />,
  trash: (
    <>
      <path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l.8 12a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9l.8-12" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l4.5-4.5 3.5 3.5 3-3 5 5" />
    </>
  ),
  video: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M10.2 9.4v5.2l4.4-2.6z" fill="currentColor" />
    </>
  ),
  carousel: (
    <>
      <rect x="7" y="5" width="10" height="14" rx="2" />
      <path d="M3.5 8v8M20.5 8v8" />
    </>
  ),
  text: <path d="M5 6.5h14M5 11h14M5 15.5h9" />,
  trend: (
    <>
      <path d="M4 16l5.5-5.5 3.5 3.5L20 7" />
      <path d="M14.5 7H20v5.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 1 0-13 0c0 5.4 6.5 11 6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  left: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  right: <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  external: (
    <>
      <path d="M13.5 5H19v5.5M19 5l-8 8" />
      <path d="M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />
    </>
  ),
  select: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M8.5 12.2l2.5 2.5 4.5-5" />
    </>
  ),
  undo: (
    <>
      <path d="M8 5L4 9l4 4" />
      <path d="M4.5 9H14a5.5 5.5 0 0 1 0 11h-3" />
    </>
  ),
  sparkle: <path d="M12 4l1.8 4.7L18.5 10.5 13.8 12.3 12 17l-1.8-4.7L5.5 10.5l4.7-1.8z" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-4 w-4", filled = false }: { name: IconName; className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/** Triangle de lecture plein (pastille des vidéos). */
export function PlayGlyph({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden focusable="false">
      <path d="M8.5 5.8v12.4a.8.8 0 0 0 1.2.7l10-6.2a.8.8 0 0 0 0-1.4l-10-6.2a.8.8 0 0 0-1.2.7z" />
    </svg>
  );
}

/** Anneau de focus commun aux commandes de la galerie. */
export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500";
