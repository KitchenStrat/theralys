import { Skeleton } from "@/components/ds";

/**
 * Pendant le chargement de la section : la silhouette du calendrier (bandeau,
 * en-tête du mois, lignes de jours sous 1 280 px, grille de sept colonnes
 * au-delà) plutôt que le squelette générique à tuiles de chiffres.
 */
export default function Loading() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Chargement du calendrier…</span>
      <div aria-hidden className="flex items-center gap-4 rounded-ds-band bg-white/70 p-5 ring-1 ring-ds-ink-200 sm:p-7">
        <Skeleton className="size-14 shrink-0 rounded-ds-md" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <Skeleton className="h-7 w-56 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>
      <div aria-hidden className="rounded-ds-card bg-white shadow-ds-card ring-1 ring-ds-ink-900/5">
        <div className="space-y-4 border-b border-ds-ink-200 p-4 sm:p-6">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="h-7 w-44" />
            <Skeleton className="size-11 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-2.5 w-full rounded-full" />
        </div>
        <div className="grid gap-2 p-3 sm:p-6 xl:grid-cols-7">
          {Array.from({ length: 14 }, (_, i) => (
            <Skeleton key={i} className={i >= 6 ? "hidden h-36 rounded-ds-md xl:block" : "h-20 rounded-ds-md xl:h-36"} />
          ))}
        </div>
      </div>
    </div>
  );
}
