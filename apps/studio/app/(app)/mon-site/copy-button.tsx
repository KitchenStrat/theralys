"use client";

import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ds";
import { SuccessMark } from "./ui";

/**
 * Bouton « Copier » : écrit le texte dans le presse-papiers et le confirme
 * quelques secondes. Si le navigateur refuse l'accès au presse-papiers, le
 * bouton le dit : le texte reste affiché à côté, à sélectionner à la main.
 */
export function CopyButton({
  text,
  label,
  copiedLabel = "Copié",
  testId,
  variant = "secondary",
}: {
  text: string;
  label: string;
  copiedLabel?: string;
  testId?: string;
  /** `primary` quand copier est la prochaine chose à faire sur l'écran */
  variant?: "primary" | "secondary";
}) {
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
    <span className="inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-2">
      <Button type="button" variant={variant} size={variant === "primary" ? "md" : "sm"} icon={<Copy size={variant === "primary" ? 18 : 16} aria-hidden />} onClick={copy} data-testid={testId}>
        {label}
      </Button>
      {/* Région vivante permanente : la confirmation y apparaît et est annoncée */}
      <span role="status" className="inline-flex items-center gap-2 text-ds-body font-semibold text-ds-success-900">
        {state === "copied" ? (
          <>
            <SuccessMark />
            {copiedLabel}
          </>
        ) : state === "failed" ? (
          <span className="font-medium text-ds-ink-900">Copie impossible&nbsp;: sélectionnez le texte, puis copiez-le.</span>
        ) : null}
      </span>
    </span>
  );
}
