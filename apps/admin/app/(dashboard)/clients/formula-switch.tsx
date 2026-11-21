"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FORMULAS, FORMULA_DEFINITIONS, planFormulas, type FormulaId, type PlanId } from "@theralys/db/plans";
import { setClientFormulas } from "./actions";

/**
 * Formules d'un client : Site, Scale, ou les deux. Un clic ajoute ou retire
 * une formule ; il en reste toujours au moins une.
 */
export function FormulaSwitch({ siteId, plan, clientName }: { siteId: string; plan: PlanId; clientName: string }) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const active = planFormulas(plan);

  const toggle = (formula: FormulaId) => {
    const next = active.includes(formula) ? active.filter((entry) => entry !== formula) : FORMULAS.filter((entry) => entry === formula || active.includes(entry));
    if (next.length === 0) return;
    const label = FORMULA_DEFINITIONS[formula].label;
    if (active.includes(formula) && !window.confirm(`Retirer la formule ${label} à ${clientName} ? Les outils de cette formule ne lui seront plus accessibles.`)) return;
    startSaving(async () => {
      const result = await setClientFormulas({ siteId, formulas: next });
      setError("error" in result ? result.error : null);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="flex gap-1.5" role="group" aria-label={`Formules de ${clientName}`}>
        {FORMULAS.map((formula) => {
          const on = active.includes(formula);
          const last = on && active.length === 1;
          return (
            <button
              key={formula}
              type="button"
              aria-pressed={on}
              disabled={saving || last}
              title={last ? "Un client garde au moins une formule" : on ? `Retirer la formule ${FORMULA_DEFINITIONS[formula].label}` : `Ajouter la formule ${FORMULA_DEFINITIONS[formula].label}`}
              onClick={() => toggle(formula)}
              className={
                on
                  ? "rounded-full border border-primary-500 bg-primary-500 px-2.5 py-0.5 text-xs font-semibold text-white disabled:opacity-90"
                  : "rounded-full border border-dashed border-ink-300 bg-white px-2.5 py-0.5 text-xs font-medium text-ink-500 hover:border-primary-400 hover:text-primary-700 disabled:opacity-50"
              }
            >
              {FORMULA_DEFINITIONS[formula].label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
