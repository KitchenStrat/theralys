import { clsx } from "clsx";

/**
 * Indicateur d'activité (seule animation en boucle admise). En mouvement réduit
 * l'anneau reste fixe : le texte voisin dit ce qui est en cours. `label` fournit
 * ce texte aux lecteurs d'écran quand rien d'autre ne le dit.
 */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={clsx("inline-grid shrink-0 place-items-center", className ?? "size-4")}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-full ds-spin">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
