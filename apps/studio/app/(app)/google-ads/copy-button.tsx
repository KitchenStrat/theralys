"use client";

import { useEffect, useRef, useState } from "react";
import { Button, type ButtonProps } from "@theralys/ui";

/**
 * Bouton « Copier » : écrit le texte dans le presse-papiers et confirme deux
 * secondes (« ✓ Copié ! »), ou signale l'échec (navigateur sans accès au
 * presse-papiers) avec une invitation à copier à la main.
 */
export function CopyButton({
  text,
  label,
  copiedLabel = "✓ Copié !",
  variant = "secondary",
  size = "sm",
  ...props
}: Omit<ButtonProps, "onClick" | "children"> & {
  text: string;
  label: string;
  copiedLabel?: string;
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
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={copy}
      disabled={props.disabled || text.trim() === ""}
      aria-live="polite"
      {...props}
    >
      {state === "copied" ? copiedLabel : state === "failed" ? "Copie impossible — sélectionnez le texte" : label}
    </Button>
  );
}
