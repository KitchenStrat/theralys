"use client";

import { useActionState } from "react";
import { Button, Card, Input, Label } from "@theralys/ui";

type State = { error?: string };

export function LoginForm({
  action,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {state.error ? <p className="text-sm text-danger-500">{state.error}</p> : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
    </Card>
  );
}
