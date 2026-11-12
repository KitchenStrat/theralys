"use client";

import { useEffect, useState } from "react";
import { StepProgress, type ProgressStep, type StepProgressProps } from "./step-progress";

export type TimedStep = ProgressStep & {
  /** Durée typique observée de l'étape, en secondes */
  seconds: number;
  /**
   * Ce qui se fait pendant l'étape, affiché l'un après l'autre (3 s chacun) :
   * des gestes (« Choix des sujets de la semaine »), pas des compteurs — le
   * rythme est estimé, un « 3 sur 8 » serait inventé.
   */
  details?: readonly string[];
};

/**
 * Avancement estimé d'une tâche dont on ne connaît pas la progression réelle :
 * les étapes défilent selon leurs durées typiques et la dernière ne se termine
 * jamais seule — c'est la fin réelle de la tâche qui conclut. `elapsed` compte
 * les secondes depuis le passage de `running` à vrai.
 */
export function useStepTimeline(
  steps: readonly { seconds: number }[],
  running: boolean,
): { current: number; elapsed: number; inStep: number } {
  const [elapsed, setElapsed] = useState(0);
  // Remise à zéro au moment où la tâche (re)démarre, pendant le rendu : aucun instant affiché avec l'ancien chronomètre
  const [wasRunning, setWasRunning] = useState(running);
  if (wasRunning !== running) {
    setWasRunning(running);
    if (running) setElapsed(0);
  }

  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    const id = window.setInterval(() => setElapsed((performance.now() - start) / 1000), 250);
    return () => window.clearInterval(id);
  }, [running]);

  let current = 0;
  let before = 0;
  for (let i = 0; i < steps.length - 1; i++) {
    const seconds = steps[i]?.seconds ?? 0;
    if (elapsed < before + seconds) break;
    before += seconds;
    current = i + 1;
  }
  return { current, elapsed, inStep: elapsed - before };
}

export type GenerationProgressProps = Omit<StepProgressProps, "steps" | "current" | "status" | "elapsed" | "detail"> & {
  steps: readonly TimedStep[];
  /** La tâche tourne */
  running: boolean;
  /** La tâche a réussi */
  done?: boolean;
  /** La tâche a échoué */
  failed?: boolean;
};

/**
 * `StepProgress` prêt à l'emploi pour une génération de 30 à 90 s lancée par
 * une action serveur : passer `running` pendant l'attente, puis `done` (ou
 * `failed`) à la réponse.
 */
export function GenerationProgress({ steps, running, done = false, failed = false, ...props }: GenerationProgressProps) {
  const { current, elapsed, inStep } = useStepTimeline(steps, running);
  const details = steps[current]?.details;
  // Une précision toutes les 3 s, puis la dernière reste affichée : pas de retour en arrière
  const detail = details && details.length > 0 ? details[Math.min(details.length - 1, Math.floor(inStep / 3))] : undefined;
  return (
    <StepProgress
      steps={steps}
      current={done ? steps.length : current}
      status={done ? "done" : failed ? "error" : "running"}
      elapsed={running || done || failed ? Math.floor(elapsed) : undefined}
      detail={running ? detail : undefined}
      {...props}
    />
  );
}
