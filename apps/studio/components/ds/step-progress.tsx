import { clsx } from "clsx";
import { Check, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { formatElapsed } from "./format";
import { IconBadge } from "./icon-badge";
import { ProgressBar } from "./progress";
import type { SectionKey } from "./sections";
import { Spinner } from "./spinner";
import { InlineSuccess } from "./success";

export type ProgressStep = {
  /** Nom de l'étape, dans le vocabulaire du praticien : « Rédaction des légendes » */
  label: string;
};

export type StepProgressProps = {
  /** Ce qui est en train d'être fait : « Nous préparons vos contenus de janvier » */
  title: ReactNode;
  steps: readonly ProgressStep[];
  /** Rang de l'étape en cours (à partir de 0) ; `steps.length` quand tout est terminé */
  current: number;
  status?: "running" | "done" | "error";
  /** Durée annoncée, honnête : « environ 1 minute » */
  estimate?: string;
  /** Secondes écoulées (affichées « 0:42 ») */
  elapsed?: number;
  /** Détail de l'étape en cours, pour montrer le travail : « Publication 3 sur 8 » si l'avancement est réel */
  detail?: ReactNode;
  /** Rassure sur l'attente : « Vous pouvez quitter cette page, le résultat vous attendra ici. » */
  hint?: ReactNode;
  /** Message de fin (statut `done`) et d'échec (statut `error`) */
  doneMessage?: ReactNode;
  errorMessage?: ReactNode;
  /** Actions : « Annuler », « Voir le résultat », « Réessayer » */
  footer?: ReactNode;
  icon?: LucideIcon;
  section?: SectionKey;
  /** Niveau du titre */
  as?: "h2" | "h3";
  className?: string;
};

/**
 * Attente d'une génération longue (30 à 90 s) : des étapes nommées, l'étape en
 * cours mise en avant avec ce qui s'y fait, une durée annoncée et le temps
 * écoulé — pas de pourcentage inventé. Chaque changement d'étape est annoncé
 * aux lecteurs d'écran, une seule fois.
 *
 * Composant de présentation : `current` et `elapsed` viennent de l'appelant
 * (avancement réel de la tâche, ou `GenerationProgress` qui les estime).
 */
export function StepProgress({
  title,
  steps,
  current,
  status = "running",
  estimate,
  elapsed,
  detail,
  hint,
  doneMessage = "C'est prêt.",
  errorMessage = "La préparation s'est interrompue. Rien n'est perdu : vous pouvez relancer.",
  footer,
  icon = Sparkles,
  section,
  as: Heading = "h3",
  className,
}: StepProgressProps) {
  const total = steps.length;
  const done = status === "done";
  const failed = status === "error";
  const index = done ? total : Math.min(Math.max(0, current), total - 1);
  const running = status === "running";
  const activeLabel = steps[index]?.label;
  const stepText = done ? "Terminé" : `Étape ${index + 1} sur ${total}`;
  const estimateText = running && estimate ? `${estimate.charAt(0).toUpperCase()}${estimate.slice(1)}` : null;

  return (
    <div data-ds-section={section} aria-busy={running} className={clsx("min-w-0", className)}>
      <div className="flex items-start gap-3.5">
        <IconBadge icon={icon} size="md" />
        <div className="min-w-0 flex-1">
          <Heading className="font-ds-display text-lg/7 font-bold text-ds-ink-900 text-balance">{title}</Heading>
          {estimateText || elapsed !== undefined ? (
            <p className="text-ds-body text-ds-ink-600">
              {estimateText}
              {estimateText && elapsed !== undefined ? " · " : null}
              {elapsed !== undefined ? (
                <>
                  {/* Chiffres tabulaires sur le seul chronomètre : il ne tremble pas en avançant */}
                  <span className="ds-tnum">{formatElapsed(elapsed)}</span> {elapsed >= 120 ? "écoulées" : "écoulée"}
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      <ProgressBar
        className="mt-4"
        value={done ? total : index + (running ? 0.4 : 0)}
        max={total}
        label={stepText}
        valueText={stepText}
        hideValueText
        busy={running}
      />

      {/* Annonce : une par changement d'étape, jamais le chronomètre */}
      <p role="status" className="sr-only">
        {done ? "Terminé." : failed ? "Interrompu." : `${stepText} : ${activeLabel ?? ""}`}
      </p>

      <ol className="mt-4 space-y-1">
        {steps.map((step, i) => {
          const isDone = i < index || done;
          const isCurrent = i === index && !done;
          return (
            <li
              key={step.label}
              aria-current={isCurrent ? "step" : undefined}
              className={clsx(
                "flex items-start gap-3 rounded-ds-sm px-2.5 py-2",
                isCurrent && !failed && "bg-ds-section-tint",
                isCurrent && failed && "bg-ds-danger-100",
              )}
            >
              <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center">
                {isDone ? (
                  <span className="grid size-6 place-items-center rounded-full bg-ds-success-600 text-white ds-pop">
                    <Check size={14} strokeWidth={3} />
                  </span>
                ) : isCurrent && failed ? (
                  <TriangleAlert size={20} className="text-ds-danger-700" />
                ) : isCurrent ? (
                  <Spinner className="size-5 text-ds-section-accent" />
                ) : (
                  <span className="size-3 rounded-full inset-ring-2 inset-ring-ds-ink-300" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={clsx(
                    "text-base",
                    isCurrent ? "font-semibold text-ds-ink-900" : isDone ? "text-ds-ink-700" : "text-ds-ink-600",
                  )}
                >
                  {step.label}
                  <span className="sr-only">{isDone ? " — fait" : isCurrent ? " — en cours" : " — à venir"}</span>
                </p>
                {isCurrent && !failed && detail ? (
                  <p className="text-ds-body text-ds-ink-600" aria-hidden>
                    {detail}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {done ? <InlineSuccess size="md" className="mt-4">{doneMessage}</InlineSuccess> : null}
      {failed ? (
        <p role="alert" className="mt-4 flex items-start gap-2 text-ds-body font-medium text-ds-danger-700">
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
          {errorMessage}
        </p>
      ) : null}
      {running && hint ? <p className="mt-4 text-ds-body text-ds-ink-600">{hint}</p> : null}
      {footer ? <div className="mt-4 flex flex-wrap items-center gap-2">{footer}</div> : null}
    </div>
  );
}
