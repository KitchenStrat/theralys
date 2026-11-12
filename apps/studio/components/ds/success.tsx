import { clsx } from "clsx";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

export type InlineSuccessProps = {
  children: ReactNode;
  /** Précision facultative, sous le message */
  detail?: ReactNode;
  /** `sm` : à côté d'un bouton ; `md` : en tête d'un bloc terminé */
  size?: "sm" | "md";
  className?: string;
};

/**
 * Confirmation discrète : la coche surgit, une onde chaude s'élargit une fois,
 * le message reste. Annoncée aux lecteurs d'écran (`role="status"`) sans
 * prendre le focus. À monter au moment où l'action réussit — l'animation joue
 * au montage, une seule fois.
 */
export function InlineSuccess({ children, detail, size = "sm", className }: InlineSuccessProps) {
  return (
    <div role="status" className={clsx("inline-flex items-center", size === "sm" ? "gap-2.5" : "gap-3.5", className)}>
      <span
        aria-hidden
        className={clsx(
          "relative grid shrink-0 place-items-center rounded-full bg-ds-success-600 text-white ds-pop",
          size === "sm" ? "size-6" : "size-10",
        )}
      >
        <span className="ds-success-ripple" />
        <Check size={size === "sm" ? 14 : 22} strokeWidth={3} />
      </span>
      <span className="min-w-0">
        <span className={clsx("block font-semibold text-ds-success-900", size === "sm" ? "text-ds-body" : "text-base")}>
          {children}
        </span>
        {detail ? <span className="block text-ds-body text-ds-ink-600">{detail}</span> : null}
      </span>
    </div>
  );
}
