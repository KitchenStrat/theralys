"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { BillingPeriod } from "@theralys/db/plans";

type BillingPeriodState = { period: BillingPeriod; setPeriod: (period: BillingPeriod) => void };

const BillingPeriodContext = createContext<BillingPeriodState | null>(null);

/**
 * La durée de facturation choisie dans la grille tarifaire. Elle est partagée
 * avec le simulateur, qui raisonne sur le prix de cette durée : changer de
 * durée dans les tarifs change le montant de l'abonnement dans le calcul.
 */
export function BillingPeriodProvider({ children, initial = "annual" }: { children: ReactNode; initial?: BillingPeriod }) {
  const [period, setPeriod] = useState<BillingPeriod>(initial);
  const value = useMemo(() => ({ period, setPeriod }), [period]);
  return <BillingPeriodContext.Provider value={value}>{children}</BillingPeriodContext.Provider>;
}

export function useBillingPeriod(): BillingPeriodState {
  const state = useContext(BillingPeriodContext);
  if (!state) throw new Error("useBillingPeriod s'utilise sous <BillingPeriodProvider>");
  return state;
}
