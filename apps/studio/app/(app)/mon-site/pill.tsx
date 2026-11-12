import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

/**
 * Pastille d'état de l'écran « Mon site », à la forme des `Badge` du studio
 * mais avec un texte sombre : ces mentions portent une information (« corrigé
 * par vous », « vos outils s'appuient sur ce site ») et doivent rester
 * lisibles. Le texte dit l'état ; la teinte ne fait que l'accompagner.
 */
type Tone = "neutral" | "primary" | "success";

const TONES: Record<Tone, string> = {
  neutral: "bg-cream-200 text-ink-700",
  primary: "bg-primary-100 text-primary-800",
  success: "bg-success-100 text-ink-900",
};

export function Pill({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[tone], className)} {...props} />;
}
