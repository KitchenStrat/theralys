"use client";

import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, Label } from "@theralys/ui";

/**
 * Champ de mot de passe avec son libellé et un bouton « Afficher » : voir ce
 * qu'on tape évite bien des erreurs de saisie. Le bouton ne soumet rien, et le
 * champ garde `id`, `name` et `autoComplete` pour les gestionnaires de mots de passe.
 */
export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  minLength,
  hint,
  toggleLabel = "Afficher le mot de passe",
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  /** Aide sous le champ (« 8 caractères minimum. ») */
  hint?: ReactNode;
  /** Nom du bouton « œil », à préciser quand la page porte deux champs */
  toggleLabel?: string;
}) {
  const [visible, setVisible] = useState(false);
  const hintId = `${id}-aide`;
  return (
    <div>
      <Label htmlFor={id} className="text-ds-body! text-ds-ink-800!">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          aria-describedby={hint ? hintId : undefined}
          className="min-h-12 pr-12 text-base!"
        />
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-pressed={visible}
          aria-label={toggleLabel}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-ds-ink-600 ds-focus-inset hover:text-ds-ink-900"
        >
          {visible ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
        </button>
      </div>
      {hint ? (
        <p id={hintId} className="mt-1.5 text-ds-meta text-ds-ink-600">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
