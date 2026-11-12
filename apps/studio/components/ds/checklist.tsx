import { clsx } from "clsx";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { LinkButton } from "./button";
import { ProgressRing } from "./progress";
import type { SectionKey } from "./sections";

export type ChecklistStep = {
  id: string;
  label: string;
  /** Ce que l'étape apporte, en une phrase (affichée pour l'étape en cours) */
  description?: string;
  done: boolean;
  /** Où mène l'étape, et le libellé de son bouton */
  href?: string;
  actionLabel?: string;
};

export type SetupChecklistProps = {
  title?: string;
  steps: readonly ChecklistStep[];
  /** Phrase sous le titre ; par défaut, le décompte des étapes */
  summary?: ReactNode;
  section?: SectionKey;
  /** Repliée au chargement (ouverte par défaut tant qu'il reste des étapes) */
  defaultOpen?: boolean;
  className?: string;
};

/**
 * Liste de mise en route : un anneau de progression, trois à cinq étapes, une
 * seule étape mise en avant (la première non faite) avec son bouton. Les
 * étapes déjà faites restent visibles : la progression acquise motive.
 * Repliable sans script (`<details>`).
 */
export function SetupChecklist({
  title = "Mise en route",
  steps,
  summary,
  section,
  defaultOpen,
  className,
}: SetupChecklistProps) {
  const total = steps.length;
  const done = steps.filter((step) => step.done).length;
  const currentId = steps.find((step) => !step.done)?.id;
  const remaining = total - done;
  const countText = `${done} étape${done > 1 ? "s" : ""} sur ${total}`;

  return (
    <details
      open={defaultOpen ?? remaining > 0}
      data-ds-section={section}
      className={clsx("group/checklist rounded-ds-card bg-white shadow-ds-card ring-1 ring-ds-ink-900/5", className)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-4 rounded-ds-card p-5 ds-focus sm:p-6 [&::-webkit-details-marker]:hidden">
        <ProgressRing value={done} max={total} label={title} valueText={countText} size={60} thickness={7}>
          <span className="text-base font-bold text-ds-ink-900 ds-tnum">
            {done}
            <span className="text-ds-ink-500">/{total}</span>
          </span>
        </ProgressRing>
        <span className="min-w-0 flex-1">
          <span className="block font-ds-display text-lg/7 font-bold text-ds-ink-900 sm:text-xl/7">{title}</span>
          <span className="block text-ds-body text-ds-ink-600">
            {summary ??
              (remaining === 0
                ? "Tout est en place. Bravo !"
                : `${countText} — plus que ${remaining} pour être prêt.`)}
          </span>
        </span>
        <ChevronDown
          size={20}
          aria-hidden
          className="shrink-0 text-ds-ink-500 transition-transform duration-ds-base ease-ds-out group-open/checklist:rotate-180 motion-reduce:transition-none"
        />
      </summary>

      <ol className="space-y-1 px-3 pb-4 sm:px-4 sm:pb-5">
        {steps.map((step, index) => {
          const current = step.id === currentId;
          return (
            <li
              key={step.id}
              aria-current={current ? "step" : undefined}
              className={clsx(
                "flex gap-3.5 rounded-ds-md px-2.5 py-2.5",
                current && "bg-ds-section-tint ring-1 ring-ds-section-line/70",
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-ds-meta font-semibold",
                  step.done
                    ? "bg-ds-success-600 text-white"
                    : current
                      ? "bg-ds-section-gradient-deep text-ds-section-on-deep shadow-ds-glow"
                      : "bg-white text-ds-ink-600 inset-ring inset-ring-ds-ink-300",
                )}
              >
                {step.done ? <Check size={16} strokeWidth={3} /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={clsx("text-base", current ? "font-semibold text-ds-ink-900" : "text-ds-ink-700")}>
                  {step.label}
                  <span className="sr-only">{step.done ? " — fait" : current ? " — étape en cours" : " — à faire"}</span>
                </p>
                {current && step.description ? (
                  <p className="mt-0.5 text-ds-body text-ds-ink-600">{step.description}</p>
                ) : null}
                {current && step.href ? (
                  <LinkButton
                    href={step.href}
                    size="sm"
                    className="mt-3"
                    iconRight={<ArrowRight size={16} aria-hidden />}
                  >
                    {step.actionLabel ?? "Continuer"}
                  </LinkButton>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
