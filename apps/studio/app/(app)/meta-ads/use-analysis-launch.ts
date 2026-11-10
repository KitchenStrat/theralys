"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { MetaAdsAnalysisView, MetaAdsUsageView } from "@/lib/meta-ads/data";
import { launchMetaAnalysis } from "./actions";

/** Analyse lancée ailleurs (autre onglet, autre session) : la page se relit à cet intervalle jusqu'à la fin */
const RUNNING_REFRESH_MS = 10_000;

export type AnalysisLaunch = {
  /** Lancement parti de cette page, en attente de sa réponse */
  pending: boolean;
  /** Une analyse tourne (ici ou ailleurs) */
  running: boolean;
  /** Une analyse tourne, lancée depuis un autre onglet ou une autre session */
  runningElsewhere: boolean;
  /** Il reste des analyses ce mois-ci */
  canLaunch: boolean;
  error: string | null;
  message: string | null;
  launch: () => void;
};

/**
 * Lancement de l'analyse Meta Ads, partagé par les onglets « Diagnostic » et
 * « Marché » : un seul état pour toute la section, quel que soit l'onglet
 * d'où l'analyse est lancée ou suivie.
 */
export function useAnalysisLaunch({ latest, usage }: { latest: MetaAdsAnalysisView | null; usage: MetaAdsUsageView }): AnalysisLaunch {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const runningElsewhere = latest?.status === "running" && !pending;
  const running = pending || latest?.status === "running";
  const canLaunch = usage.analysesRemaining > 0;

  // Analyse en cours lancée ailleurs : rien ne la rafraîchirait sinon — relecture périodique jusqu'à la fin
  useEffect(() => {
    if (!runningElsewhere) return;
    const timer = setInterval(() => router.refresh(), RUNNING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [runningElsewhere, router]);

  function launch() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await launchMetaAnalysis();
      if (result.error) {
        const remaining = typeof result.remaining === "number" ? ` Il vous reste ${result.remaining} analyse${result.remaining > 1 ? "s" : ""} ce mois-ci.` : "";
        setError(`${result.error}${remaining}`);
        // La ligne en erreur et le quota consommé sont relus
        router.refresh();
        return;
      }
      setMessage(result.message ?? "Analyse terminée.");
      router.refresh();
    });
  }

  return { pending, running, runningElsewhere, canLaunch, error, message, launch };
}
