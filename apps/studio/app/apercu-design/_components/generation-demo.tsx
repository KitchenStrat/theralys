"use client";

import { Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, GenerationProgress, StepProgress, type SectionKey, type TimedStep } from "@/components/ds";

type Mode = "fige" | "en-cours" | "termine";

/**
 * Démonstration de l'attente d'une génération longue. Au repos, l'état est figé
 * à mi-parcours (capture reproductible) ; « Voir l'animation » rejoue toute la
 * séquence en accéléré, jusqu'au message de réussite.
 */
export function GenerationDemo({
  title,
  steps,
  detail,
  doneMessage,
  section,
}: {
  title: string;
  steps: readonly string[];
  detail: string;
  doneMessage: string;
  section?: SectionKey;
}) {
  const [mode, setMode] = useState<Mode>("fige");
  // En accéléré : 2,5 s par étape au lieu de 8 à 20 s
  const timed: TimedStep[] = steps.map((label) => ({ label, seconds: 2.5, details: [detail] }));
  const total = timed.reduce((sum, step) => sum + step.seconds, 0);

  useEffect(() => {
    if (mode !== "en-cours") return;
    const id = window.setTimeout(() => setMode("termine"), total * 1000);
    return () => window.clearTimeout(id);
  }, [mode, total]);

  const hint = "Vous pouvez quitter cette page : le résultat vous attendra ici.";

  if (mode === "fige") {
    return (
      <StepProgress
        section={section}
        title={title}
        steps={timed}
        current={Math.min(2, steps.length - 1)}
        estimate="environ 1 minute"
        elapsed={42}
        detail={detail}
        hint={hint}
        footer={
          <Button variant="secondary" size="sm" icon={<Play size={16} aria-hidden />} onClick={() => setMode("en-cours")}>
            Voir l'animation
          </Button>
        }
      />
    );
  }
  return (
    <GenerationProgress
      section={section}
      title={title}
      steps={timed}
      running={mode === "en-cours"}
      done={mode === "termine"}
      estimate="environ 15 secondes (démonstration accélérée)"
      hint={hint}
      doneMessage={doneMessage}
      footer={
        mode === "termine" ? (
          <Button variant="secondary" size="sm" icon={<RotateCcw size={16} aria-hidden />} onClick={() => setMode("fige")}>
            Revenir à l'état figé
          </Button>
        ) : (
          <Button variant="quiet" size="sm" onClick={() => setMode("fige")}>
            Annuler
          </Button>
        )
      }
    />
  );
}
