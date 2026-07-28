"use client";

import { useState } from "react";
import { Button, Spinner } from "@theralys/ui";
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
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-xl border border-ink-300 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
        <p className="mt-1 text-xs text-ink-500">8 caractères minimum.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium">
          Confirmez le mot de passe
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-xl border border-ink-300 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      </div>
      {error ? <p className="text-sm text-danger-500">{error}</p> : null}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? <Spinner className="text-white" /> : null}
        {submitting ? "Création…" : "Créer mon mot de passe et entrer"}
      </Button>
    </form>
  );
}
