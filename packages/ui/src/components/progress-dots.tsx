import { clsx } from "clsx";

export type ProgressDot = { label: string; done: boolean };

/**
 * Les 4 pastilles d'avancement de génération d'une démo
 * (accueil, motifs, avis, articles).
 */
export function ProgressDots({ dots }: { dots: ProgressDot[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {dots.map((dot) => (
        <span
          key={dot.label}
          title={`${dot.label} : ${dot.done ? "généré" : "en attente"}`}
          className={clsx(
            "h-2.5 w-2.5 rounded-full",
            dot.done ? "bg-success-500" : "bg-ink-300",
          )}
        />
      ))}
    </div>
  );
}
