"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button, Card, FieldHint, Input, Label } from "@theralys/ui";
import { tokenFromHash } from "@/lib/crm/invitation-link";
import { acceptInvitation, inspectInvitation, type InvitationState } from "./actions";

type State = InvitationState | { kind: "loading" };

/**
 * Le lien d'invitation porte son jeton dans le fragment de l'adresse : il est
 * lu ici, dans le navigateur, puis confié aux actions de la page. Selon ce
 * qu'il vaut : le formulaire du mot de passe, ou la marche à suivre.
 */
export function InvitationForm() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const found = tokenFromHash(window.location.hash);
    setToken(found);
    if (!found) {
      setState({ kind: "invalid" });
      return;
    }
    let cancelled = false;
    inspectInvitation(found)
      .then((result) => {
        if (!cancelled) setState(result);
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "invalid" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const result = await acceptInvitation({ token, password: form.get("password"), confirm: form.get("confirm") });
    // En cas de succès l'action redirige vers le CRM : on n'arrive ici que sur erreur
    setSubmitting(false);
    if (result?.error) setError(result.error);
  }

  if (state.kind === "loading") {
    return (
      <Card className="p-6">
        <p role="status" className="text-sm text-ink-700">
          Vérification de votre lien…
        </p>
      </Card>
    );
  }

  if (state.kind === "ok") {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-bold text-ink-900">Bienvenue {state.firstName}</h1>
        <p className="mt-1 text-sm text-ink-700">
          Choisissez le mot de passe de votre espace (<span className="[overflow-wrap:anywhere]">{state.email}</span>).
        </p>
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="password">Mot de passe</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={200} required />
            <FieldHint>8 caractères minimum.</FieldHint>
          </div>
          <div>
            <Label htmlFor="confirm">Confirmez le mot de passe</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={200} required />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger-500">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Création…" : "Créer mon mot de passe et entrer"}
          </Button>
        </form>
      </Card>
    );
  }

  if (state.kind === "used") {
    return (
      <Notice title="Compte déjà activé">
        <p className="mt-2 text-sm text-ink-700">Votre mot de passe a déjà été créé : connectez-vous simplement.</p>
        <LoginLink primary />
      </Notice>
    );
  }

  if (state.kind === "disabled") {
    return (
      <Notice title="Accès désactivé">
        <p className="mt-2 text-sm text-ink-700">Cet accès a été désactivé. Voyez avec votre responsable.</p>
      </Notice>
    );
  }

  return (
    <Notice title="Lien expiré ou invalide">
      <p className="mt-2 text-sm text-ink-700">Ce lien d&apos;invitation n&apos;est plus valable. Demandez-en un nouveau à votre responsable.</p>
      <p className="mt-5 border-t border-cream-200 pt-4 text-sm text-ink-700">Vous avez déjà créé votre mot de passe ?</p>
      <LoginLink />
    </Notice>
  );
}

/** État sans formulaire : le titre de la page (son seul `h1`) et ce qu'il reste à faire. */
function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-6">
      <h1 className="text-xl font-bold text-ink-900">{title}</h1>
      {children}
    </Card>
  );
}

function LoginLink({ primary }: { primary?: boolean }) {
  return (
    <Link
      href="/login"
      className={
        primary
          ? "mt-5 flex min-h-11 w-full items-center justify-center rounded-full bg-primary-500 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-600"
          : "mt-3 flex min-h-11 w-full items-center justify-center rounded-full border border-ink-300 bg-white px-4 text-sm font-medium text-ink-900 hover:bg-cream-100"
      }
    >
      Se connecter
    </Link>
  );
}
