import { clsx } from "clsx";
import type { CSSProperties } from "react";

/**
 * Bloc de squelette : il tient la place du contenu pendant un chargement et
 * reprend sa forme (jamais le message d'un état vide). Le reflet qui le
 * traverse est un indicateur de chargement ; il disparaît en mouvement réduit.
 */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={clsx("ds-skeleton block", className)} style={style} />;
}

const WIDTHS = ["100%", "92%", "78%", "96%", "64%"];

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden className={clsx("block space-y-2.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: i === lines - 1 ? "58%" : WIDTHS[i % WIDTHS.length] }} />
      ))}
    </span>
  );
}

/** Tuile de chiffre en attente : pastille, libellé, valeur, courbe. */
export function KpiTileSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={clsx("rounded-ds-card bg-white p-5 shadow-ds-card ring-1 ring-ds-ink-900/5 sm:p-6", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-ds-sm" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="mt-5 h-9 w-24" />
      <Skeleton className="mt-3 h-5 w-40 rounded-full" />
      <Skeleton className="mt-5 h-10 w-full" />
    </div>
  );
}

/** Carte en attente : un titre et quelques lignes. */
export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={clsx("rounded-ds-card bg-white p-5 shadow-ds-card ring-1 ring-ds-ink-900/5 sm:p-6", className)}>
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-11 rounded-ds-sm" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-48 max-w-full" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
      </div>
      <SkeletonText lines={lines} className="mt-6" />
    </div>
  );
}

/**
 * Squelette d'une page de section, prêt pour un fichier `loading.tsx` :
 * bandeau d'en-tête, rangée de tuiles, cartes. Annonce « Chargement » aux
 * lecteurs d'écran.
 */
export function PageSkeleton({ tiles = 4, cards = 2 }: { tiles?: number; cards?: number }) {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Chargement de la page…</span>
      <div aria-hidden className="flex items-center gap-4 rounded-ds-band bg-white/70 p-5 ring-1 ring-ds-ink-200 sm:p-7">
        <Skeleton className="size-14 rounded-ds-md" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-7 w-56 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>
      {tiles > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: tiles }, (_, i) => (
            <KpiTileSkeleton key={i} />
          ))}
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: cards }, (_, i) => (
          <CardSkeleton key={i} lines={4} />
        ))}
      </div>
    </div>
  );
}
