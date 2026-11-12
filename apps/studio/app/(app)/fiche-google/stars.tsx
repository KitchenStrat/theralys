import { clsx } from "clsx";
import { Star } from "lucide-react";

const SIZE = { sm: 16, md: 20, lg: 24 } as const;

/**
 * Note en étoiles (0..5, demi-étoile arrondie), avec nom accessible « 4,5 sur 5 ».
 * Étoile pleine : ambre vif cerné d'un ambre foncé (le contour porte le contraste) ;
 * une demi-étoile est la même étoile, masquée à mi-largeur.
 */
export function Stars({ rating, className, size = "sm" }: { rating: number; className?: string; size?: keyof typeof SIZE }) {
  const rounded = Math.round(rating * 2) / 2;
  const px = SIZE[size];
  return (
    <span
      role="img"
      aria-label={`${rounded.toLocaleString("fr-FR")} sur 5`}
      className={clsx("inline-flex shrink-0 items-center gap-0.5 align-middle", className)}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = i <= rounded ? 1 : i - 0.5 === rounded ? 0.5 : 0;
        return (
          <span key={i} aria-hidden className="relative block" style={{ width: px, height: px }}>
            <Star size={px} strokeWidth={1.75} className="absolute inset-0 fill-ds-ink-100 text-ds-ink-300" />
            {fill > 0 ? (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={px} strokeWidth={1.75} className="max-w-none fill-ds-warning-500 text-ds-warning-700" />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
