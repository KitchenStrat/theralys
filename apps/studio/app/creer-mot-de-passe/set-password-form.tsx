"use client";

import { useState } from "react";
import { KeyRound, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ds";
import { PasswordField } from "../login/password-field";
import { setPassword } from "./actions";

export function SetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const result = await setPassword({
      token,
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
    // En cas de succès l'action redirige — on n'arrive ici que sur erreur
    setSubmitting(false);
    if (result?.error) setError(result.error);
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-5">
      <PasswordField
        id="password"
        name="password"
        label="Mot de passe"
        autoComplete="new-password"
        minLength={8}
        hint="8 caractères minimum."
      />
      <PasswordField
        id="confirm"
        name="confirm"
        label="Confirmez le mot de passe"
        autoComplete="new-password"
        minLength={8}
        toggleLabel="Afficher la confirmation du mot de passe"
      />
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-ds-sm bg-ds-danger-100 px-3.5 py-3 text-ds-body font-medium text-ds-danger-900"
        >
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={submitting} icon={<KeyRound size={20} aria-hidden />} className="w-full">
        Créer mon mot de passe et entrer
      </Button>
    </form>
  );
}
