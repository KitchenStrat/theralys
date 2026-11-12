"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, type ButtonProps } from "@/components/ds";

/**
 * Bouton « Copier » de la section Meta Ads : même fonctionnement que celui de
 * Google Ads (écrit le texte dans le presse-papiers, confirme deux secondes,
 * ou invite à sélectionner le texte quand le navigateur refuse l'accès au
 * presse-papiers), dessiné avec le bouton et les icônes du design system pour
 * que tous les « Copier » et « Télécharger » de la section se ressemblent.
 */
export function CopyButton({
  text,
  label,
  copiedLabel = "Copié !",
  variant = "secondary",
  size = "sm",
  ...props
}: Omit<ButtonProps, "onClick" | "children" | "icon" | "loading"> & {
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
      // La coche surgit à la confirmation ; le libellé change aussi : jamais l'icône seule
      icon={state === "copied" ? <Check size={16} strokeWidth={2.5} aria-hidden className="ds-pop" /> : <Copy size={16} aria-hidden />}
      {...props}
    >
      {state === "copied" ? copiedLabel : state === "failed" ? "Copie impossible — sélectionnez le texte" : label}
    </Button>
  );
}
