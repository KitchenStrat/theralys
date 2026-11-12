"use client";

import { clsx } from "clsx";
import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, InlineSuccess, type ButtonProps } from "@/components/ds";

/**
 * Bouton « Copier » : écrit le texte dans le presse-papiers et le confirme
 * deux secondes et demie — la coche du design system (`InlineSuccess`) vient
 * recouvrir le bouton, qui garde sa place, sa taille et le focus — ou signale
 * l'échec (navigateur sans accès au presse-papiers) avec une invitation à
 * copier à la main. Le même partout dans Google Ads et Meta Ads.
 */
export function CopyButton({
  text,
  label,
  copiedLabel = "Copié !",
  variant = "secondary",
  size = "sm",
  className,
  ...props
}: Omit<ButtonProps, "onClick" | "children" | "icon" | "iconRight" | "loading"> & {
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
    <span className={clsx("relative inline-flex max-w-full", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        icon={<Copy size={size === "sm" ? 16 : 18} aria-hidden />}
        onClick={copy}
        aria-live="polite"
        {...props}
        disabled={props.disabled || text.trim() === ""}
      >
        {state === "failed" ? "Copie impossible — sélectionnez le texte" : label}
      </Button>
      {state === "copied" ? (
        // Recouvre la face du bouton sans le retirer : ni saut de mise en page, ni perte du focus (l'anneau reste visible autour).
        // Pas de fondu : le libellé du bouton et « Copié ! » ne doivent jamais se lire l'un sur l'autre ; seule la coche surgit.
        <span
          className={clsx(
            "pointer-events-none absolute inset-0 grid place-items-center overflow-hidden bg-white inset-ring inset-ring-ds-success-600/45",
            size === "sm" ? "rounded-[1.125rem] pointer-coarse:rounded-[1.375rem]" : size === "lg" ? "rounded-3xl" : "rounded-[1.375rem]",
          )}
        >
          <InlineSuccess className="whitespace-nowrap">{copiedLabel}</InlineSuccess>
        </span>
      ) : null}
    </span>
  );
}
