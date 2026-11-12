import { clsx } from "clsx";
import type { CSSProperties } from "react";
import { formatNumber } from "./format";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export type AnimatedNumberProps = {
  value: number;
  /** Options `Intl.NumberFormat` (locale `fr-FR`) : décimales, style… */
  format?: Intl.NumberFormatOptions;
  prefix?: string;
  suffix?: string;
  /** Retard avant le départ, en millisecondes (pour suivre la cascade d'une page) */
  delay?: number;
  className?: string;
};

/**
 * Chiffre clé animé : à l'arrivée, chaque chiffre roule de 0 jusqu'à sa valeur
 * (800 ms, une seule fois). Composant serveur, sans script : la valeur est dans
 * le HTML, l'animation est en CSS (translation seule) et n'existe pas en
 * mouvement réduit. Les lecteurs d'écran lisent le nombre en clair.
 *
 * Changer `value` rejoue l'animation (la clé remonte l'élément).
 */
export function AnimatedNumber({ value, format, prefix = "", suffix = "", delay, className }: AnimatedNumberProps) {
  const text = `${prefix}${formatNumber(value, format)}${suffix}`;
  let rank = 0;
  return (
    <span className={clsx("inline-block", className)}>
      <span className="sr-only">{text}</span>
      <span
        key={text}
        aria-hidden
        className="ds-odo"
        style={delay === undefined ? undefined : ({ "--ds-odo-delay": `${delay}ms` } as CSSProperties)}
      >
        {Array.from(text).map((char, index) =>
          char >= "0" && char <= "9" ? (
            <span
              key={index}
              className="ds-odo-col"
              style={{ "--ds-d": Number(char), "--ds-i": rank++ } as CSSProperties}
            >
              <span className="ds-odo-ghost">{char}</span>
              <span className="ds-odo-strip">
                {DIGITS.map((digit) => (
                  <span key={digit}>{digit}</span>
                ))}
              </span>
            </span>
          ) : (
            <span key={index}>{char}</span>
          ),
        )}
      </span>
    </span>
  );
}
