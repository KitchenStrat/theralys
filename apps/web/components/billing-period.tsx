"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { BillingPeriod, FormulaId } from "@theralys/db/plans";

/** Les formules cochées dans les tarifs : l'une, l'autre ou les deux — jamais aucune. */
export type FormulaSelection = Record<FormulaId, boolean>;
/** Le choix qui en découle : une formule seule, ou les deux. */
export type FormulaChoice = FormulaId | "both";

type BillingPeriodState = {
  period: BillingPeriod;
  setPeriod: (period: BillingPeriod) => void;
  selection: FormulaSelection;
  /** Coche ou décoche une formule. Décocher la seule formule cochée bascule sur l'autre : il en reste toujours une. */
  toggleFormula: (formula: FormulaId) => void;
  choice: FormulaChoice;
};

const BillingPeriodContext = createContext<BillingPeriodState | null>(null);

const OTHER: Record<FormulaId, FormulaId> = { site: "scale", scale: "site" };

/**
 * La durée de facturation et les formules choisies dans la grille tarifaire.
 * Elles sont partagées avec le simulateur, qui raisonne sur le prix de ce
 * choix : changer de durée ou de formules dans les tarifs change le montant
 * de l'abonnement dans le calcul.
 */
export function BillingPeriodProvider({ children, initial = "annual" }: { children: ReactNode; initial?: BillingPeriod }) {
  const [period, setPeriod] = useState<BillingPeriod>(initial);
  const [selection, setSelection] = useState<FormulaSelection>({ site: true, scale: true });
  const toggleFormula = useCallback((formula: FormulaId) => {
    setSelection((current) => {
      const next = { ...current, [formula]: !current[formula] };
      if (!next.site && !next.scale) next[OTHER[formula]] = true;
      return next;
    });
  }, []);
  const value = useMemo<BillingPeriodState>(
    () => ({ period, setPeriod, selection, toggleFormula, choice: selection.site && selection.scale ? "both" : selection.site ? "site" : "scale" }),
    [period, selection, toggleFormula],
  );
  return <BillingPeriodContext.Provider value={value}>{children}</BillingPeriodContext.Provider>;
}

export function useBillingPeriod(): BillingPeriodState {
  const state = useContext(BillingPeriodContext);
  if (!state) throw new Error("useBillingPeriod s'utilise sous <BillingPeriodProvider>");
  return state;
}
