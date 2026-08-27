import { type ReactNode } from "react";
import clsx from "clsx";

/*
 * Mot-marque « Harmony » : police dédiée (Comfortaa), dégradé de bleus et
 * reflet lumineux qui traverse le mot (styles .brand-word dans globals.css).
 * `onDark` bascule sur le dégradé clair pour les fonds sombres ou bleus.
 */
export function Brand({ onDark = false, className = "" }: { onDark?: boolean; className?: string }) {
  return <span className={clsx("brand-word", onDark && "brand-word--dark", className)}>Harmony</span>;
}

/** Remplace chaque « Harmony » d'un texte brut par le mot-marque stylisé. */
export function brandify(text: string, onDark = false): ReactNode {
  const parts = text.split("Harmony");
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) => (i === 0 ? [part] : [<Brand key={i} onDark={onDark} />, part]));
}
