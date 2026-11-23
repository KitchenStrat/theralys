"use client";

import { useActionState, useEffect, useRef } from "react";
import { CircleCheck, KeyRound, TriangleAlert } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ds";
import { PasswordField } from "../../login/password-field";
import { changePassword, type ChangePasswordState } from "./password-actions";

/** « Mon compte » : changer son mot de passe (l'actuel est redemandé ; les autres appareils sont déconnectés). */
export function PasswordCard() {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(changePassword, {});
  const form = useRef<HTMLFormElement>(null);

  // Changement fait : les trois champs sont vidés
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  return (
    <Card as="section">
      <CardHeader
        icon={KeyRound}
        title="Mot de passe"
        description="Changer de mot de passe déconnecte les autres appareils où votre espace est ouvert."
      />
      <form ref={form} action={formAction} className="mt-5 grid max-w-xl gap-5">
        <PasswordField id="current" name="current" label="Mot de passe actuel" autoComplete="current-password" toggleLabel="Afficher le mot de passe actuel" />
        <PasswordField
          id="next"
          name="next"
          label="Nouveau mot de passe"
          autoComplete="new-password"
          minLength={8}
          hint="8 caractères minimum."
          toggleLabel="Afficher le nouveau mot de passe"
        />
        <PasswordField
          id="confirm"
          name="confirm"
          label="Confirmez le nouveau mot de passe"
          autoComplete="new-password"
          minLength={8}
          toggleLabel="Afficher la confirmation du mot de passe"
        />
        {state.error ? (
          <p role="alert" className="flex items-start gap-2.5 rounded-ds-sm bg-ds-danger-100 px-3.5 py-3 text-ds-body font-medium text-ds-danger-900">
            <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p role="status" className="flex items-start gap-2.5 rounded-ds-sm bg-ds-success-100 px-3.5 py-3 text-ds-body font-medium text-ds-success-900">
            <CircleCheck size={18} aria-hidden className="mt-0.5 shrink-0" />
            Mot de passe modifié.
          </p>
        ) : null}
        <div>
          <Button type="submit" variant="secondary" loading={pending} icon={<KeyRound size={18} aria-hidden />}>
            Changer mon mot de passe
          </Button>
        </div>
      </form>
    </Card>
  );
}
