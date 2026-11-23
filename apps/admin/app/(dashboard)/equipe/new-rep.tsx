"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, FieldHint, Input, Label, Modal } from "@theralys/ui";
import { createRep } from "./actions";
import { InviteLink } from "./invite-link";

/** Création du compte d'un commercial : son nom, son e-mail, puis le lien d'invitation à lui transmettre. */
export function NewRepButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; invitePath: string } | null>(null);

  function show() {
    setName("");
    setEmail("");
    setError(null);
    setCreated(null);
    setOpen(true);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    const result = await createRep({ name, email });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCreated({ name: name.trim(), invitePath: result.invitePath });
    router.refresh();
  }

  return (
    <>
      <Button variant={variant} onClick={show}>
        <Plus size={16} strokeWidth={2.6} aria-hidden className="-ml-0.5" />
        Nouveau commercial
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={created ? "Compte créé" : "Nouveau commercial"}>
        <div data-touch>
          {created ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-900">
                Le compte de <strong className="font-semibold">{created.name}</strong> est créé. Il n&apos;a pas encore de mot de passe : transmettez-lui ce lien pour qu&apos;il choisisse le sien.
              </p>
              <InviteLink path={created.invitePath} />
              <div className="flex justify-end">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Fermer
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div>
                <Label htmlFor="rep-name">Prénom et nom</Label>
                <Input id="rep-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="off" required />
              </div>
              <div>
                <Label htmlFor="rep-email">E-mail</Label>
                <Input id="rep-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} autoComplete="off" required />
                <FieldHint>Son identifiant de connexion.</FieldHint>
              </div>
              <p className="text-sm text-ink-700">Il ne verra que le CRM, et seulement les prospects qui lui sont attribués.</p>
              {error ? (
                <p role="alert" className="text-sm text-danger-500">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Création…" : "Créer le compte"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </>
  );
}
