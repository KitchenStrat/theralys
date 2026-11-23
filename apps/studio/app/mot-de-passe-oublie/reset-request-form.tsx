"use client";

import { useActionState } from "react";
import { MailCheck, Send, TriangleAlert } from "lucide-react";
import { Input, Label } from "@theralys/ui";
import { Button } from "@/components/ds";
import type { ResetRequestState } from "./actions";

export function ResetRequestForm({
  action,
}: {
  action: (previous: ResetRequestState, formData: FormData) => Promise<ResetRequestState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  if (state.done) {
    return (
      <div role="status" className="mt-6 flex items-start gap-3 rounded-ds-md bg-ds-success-100 p-4 text-ds-body text-ds-success-900">
        <MailCheck size={22} aria-hidden className="mt-0.5 shrink-0" />
        <p>
          Si un espace existe à cette adresse, un e-mail vient de partir avec un lien valable une heure. Pensez à regarder dans
          vos courriers indésirables.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div>
        <Label htmlFor="email" className="text-ds-body! text-ds-ink-800!">
          Email de votre espace
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-describedby={state.error ? "reset-erreur" : undefined}
          className="min-h-12 text-base!"
        />
      </div>
      {state.error ? (
        <p
          id="reset-erreur"
          role="alert"
          className="flex items-start gap-2.5 rounded-ds-sm bg-ds-danger-100 px-3.5 py-3 text-ds-body font-medium text-ds-danger-900"
        >
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={pending} icon={<Send size={20} aria-hidden />} className="w-full">
        Recevoir le lien
      </Button>
    </form>
  );
}
