import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

type Tone = "success" | "info" | "warning" | "danger" | "neutral" | "primary";

const TONES: Record<Tone, string> = {
  success: "bg-success-100 text-success-500",
  info: "bg-info-100 text-info-500",
  warning: "bg-warning-100 text-warning-500",
  danger: "bg-danger-100 text-danger-500",
  neutral: "bg-cream-200 text-ink-700",
  primary: "bg-primary-100 text-primary-600",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: Tone };

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
