"use client";

import { useActionState } from "react";
import { LogIn, TriangleAlert } from "lucide-react";
import { Input, Label } from "@theralys/ui";
import { Button } from "@/components/ds";
import { PasswordField } from "./password-field";

type State = { error?: string };

export function LoginForm({
  action,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <Label htmlFor="email" className="text-ds-body! text-ds-ink-800!">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-describedby={state.error ? "login-erreur" : undefined}
          className="min-h-12 text-base!"
        />
      </div>
      <PasswordField id="password" name="password" label="Mot de passe" autoComplete="current-password" />
      {state.error ? (
        <p
          id="login-erreur"
          role="alert"
          className="flex items-start gap-2.5 rounded-ds-sm bg-ds-danger-100 px-3.5 py-3 text-ds-body font-medium text-ds-danger-900"
        >
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={pending} icon={<LogIn size={20} aria-hidden />} className="w-full">
        Se connecter
      </Button>
    </form>
  );
}
