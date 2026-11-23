"use client";

import { useEffect, useId, useState } from "react";
import { Button, Input } from "@theralys/ui";

/**
 * Lien d'invitation à transmettre au commercial. Le serveur ne rend que son
 * chemin ; l'adresse du back-office est celle de la page où l'admin se
 * trouve. Le lien n'est affiché qu'ici, une fois : il n'est gardé nulle part.
 */
export function InviteLink({ path }: { path: string }) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setUrl(`${window.location.origin}${path}`);
    setCopied(false);
  }, [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Presse-papiers refusé par le navigateur : le lien est sélectionné, prêt à être copié à la main
      const field = document.getElementById(id);
      if (field instanceof HTMLInputElement) field.select();
    }
  }

  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50 p-3">
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">
        Lien d&apos;invitation
      </label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <Input id={id} readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 basis-48 font-mono !text-xs" />
        <Button type="button" onClick={() => void copy()} disabled={!url}>
          {copied ? "Lien copié" : "Copier le lien"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink-700" aria-live="polite">
        {copied ? "Copié. " : ""}Valable 7 jours, pour une seule utilisation : le commercial y choisit son mot de passe. Ce lien ne sera plus affiché ; s&apos;il se perd, demandez-en un nouveau.
      </p>
    </div>
  );
}
