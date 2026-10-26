import { clsx } from "clsx";

/** Note en étoiles (0..5, demi-étoile arrondie), avec nom accessible « 4,5 sur 5 ». */
export function Stars({ rating, className, size = "sm" }: { rating: number; className?: string; size?: "sm" | "md" }) {
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span
      role="img"
      aria-label={`${rounded.toLocaleString("fr-FR")} sur 5`}
      className={clsx("inline-flex items-center gap-0.5 text-warning-500", size === "md" ? "text-lg" : "text-sm", className)}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden className={i <= rounded ? "" : i - 0.5 === rounded ? "opacity-60" : "text-cream-300"}>
          ★
        </span>
      ))}
    </span>
  );
}
