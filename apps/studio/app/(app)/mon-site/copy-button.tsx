"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@theralys/ui";

/**
 * Bouton « Copier » : écrit le texte dans le presse-papiers et le confirme
 * quelques secondes. Si le navigateur refuse l'accès au presse-papiers, le
 * bouton le dit : le texte reste affiché à côté, à sélectionner à la main.
 */
export function CopyButton({ text, label, copiedLabel = "Copié", testId }: { text: string; label: string; copiedLabel?: string; testId?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 4000);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button type="button" variant="secondary" size="sm" onClick={copy} data-testid={testId}>
        {label}
      </Button>
      {/* Région vivante permanente : la confirmation y apparaît et est annoncée */}
      <span role="status" className="text-sm font-medium text-ink-900">
        {state === "copied" ? (
          <>
            <span aria-hidden className="text-success-500">
              ✓{" "}
            </span>
            {copiedLabel}
          </>
        ) : state === "failed" ? (
          "Copie impossible : sélectionnez le texte, puis copiez-le."
        ) : null}
      </span>
    </span>
  );
}
