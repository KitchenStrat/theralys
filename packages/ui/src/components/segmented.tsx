"use client";

import { clsx } from "clsx";

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Libellé accessible du groupe (ex. « Taille du visuel ») */
  "aria-label"?: string;
  className?: string;
};

/**
 * Sélecteur à segments (pilule) : une option active à la fois.
 * Utilisé par les réglages du blog (voix, mode de publication) et par la
 * modale des contenus réseaux sociaux (taille du visuel).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  className,
}: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={clsx("flex rounded-full bg-cream-100 p-1", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={clsx(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            option.value === value
              ? "bg-white text-ink-900 shadow-sm ring-1 ring-cream-300"
              : "text-ink-500 hover:text-ink-900",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
