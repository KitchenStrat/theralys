import { clsx } from "clsx";
import { Sun, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { SectionKey } from "./sections";

export type GreetingBandProps = {
  /** La salutation — le `h1` de l'Accueil : « Bonjour Claire » */
  title: ReactNode;
  /** Surtitre : la date du jour */
  eyebrow?: ReactNode;
  /** Icône du surtitre, sur sa pastille chaude */
  eyebrowIcon?: LucideIcon;
  /** La phrase d'état : un chiffre, une comparaison, sans jargon */
  children?: ReactNode;
  /** Repères sous la phrase (`GreetingChip`) : site en ligne, formule… */
  footer?: ReactNode;
  /** À droite (sous le texte sur mobile) : la carte « prochaine étape » */
  aside?: ReactNode;
  section?: SectionKey;
  /** Étend l'identité de la section à toute la coquille (halos du fond) */
  ambient?: boolean;
  className?: string;
};

/**
 * Bandeau d'accueil : le seul grand aplat en dégradé de l'écran. Dégradé
 * profond de la section (blanc ≥ 4,5:1 partout, halos compris), salutation,
 * phrase d'état, et la prochaine étape à portée de main.
 */
export function GreetingBand({
  title,
  eyebrow,
  eyebrowIcon: EyebrowIcon = Sun,
  children,
  footer,
  aside,
  section = "accueil",
  ambient = true,
  className,
}: GreetingBandProps) {
  return (
    <header
      data-ds-section={section}
      data-ds-ambient={ambient ? "" : undefined}
      className={clsx(
        "relative isolate overflow-hidden rounded-ds-band bg-ds-section-gradient-deep p-6 text-white shadow-ds-card sm:p-8 xl:p-10",
        className,
      )}
    >
      <span aria-hidden className="ds-band-art-deep -z-10" />
      {/* Deux colonnes à partir de `xl` : dans la coquille, le contenu fait alors au moins 920 px */}
      <div className={clsx("grid items-center gap-7", aside ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] xl:gap-10" : "")}>
        <div className="min-w-0">
          {eyebrow ? (
            <p className="flex items-center gap-2.5 text-ds-body font-semibold">
              <span aria-hidden className="grid size-7 place-items-center rounded-full bg-ds-sun-400 text-ds-brand-950">
                <EyebrowIcon size={16} strokeWidth={2.5} />
              </span>
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-3 font-ds-display text-[2rem]/10 font-extrabold tracking-tight text-balance sm:text-[2.5rem]/[1.15]">
            {title}
          </h1>
          {children ? <div className="mt-3 max-w-[54ch] text-lg/7 text-pretty">{children}</div> : null}
          {footer ? <div className="mt-5 flex flex-wrap items-center gap-2">{footer}</div> : null}
        </div>
        {aside ? <div className="min-w-0">{aside}</div> : null}
      </div>
    </header>
  );
}

/** Repère du bandeau d'accueil : pastille assombrie (jamais éclaircie) sous un texte blanc. */
export function GreetingChip({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-ds-brand-950/30 px-3 text-ds-meta font-medium text-white">
      {Icon ? <Icon size={14} strokeWidth={2.25} aria-hidden /> : null}
      {children}
    </span>
  );
}
