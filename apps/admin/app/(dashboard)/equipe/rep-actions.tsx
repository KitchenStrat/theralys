"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Label, Modal, Select } from "@theralys/ui";
import { UNASSIGNED } from "@/lib/crm/filters";
import type { RepStatus } from "@/lib/crm/team-stats";
import { reassignRepContacts, renewRepInvitation, setRepDisabled } from "./actions";
import { InviteLink } from "./invite-link";

type Rep = { id: string; name: string; status: RepStatus; prospects: number };

/**
 * Ce que l'admin fait du compte d'un commercial : lui donner un nouveau lien
 * d'invitation, le désactiver ou le réactiver, réattribuer ses prospects.
 * `others` : les commerciaux à qui ses prospects peuvent passer.
 */
export function RepActions({ rep, others }: { rep: Rep; others: { id: string; name: string }[] }) {
  const router = useRouter();
  const [working, startWork] = useTransition();
  const [invitePath, setInvitePath] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [target, setTarget] = useState(UNASSIGNED);

  const say = (text: string, error = false) => setMessage({ text, error });

  const renew = () => {
    if (rep.status === "active" && !window.confirm(`Donner un nouveau lien à ${rep.name} ? Son mot de passe actuel cessera de fonctionner et il sera déconnecté : il en choisira un nouveau avec le lien.`)) return;
    startWork(async () => {
      const result = await renewRepInvitation({ id: rep.id });
      if (result.ok) {
        setInvitePath(result.invitePath);
        setMessage(null);
        router.refresh();
      } else say(result.error, true);
    });
  };

  const toggle = () => {
    const disable = rep.status !== "disabled";
    if (disable && !window.confirm(`Désactiver le compte de ${rep.name} ? Il est déconnecté aussitôt et ne peut plus se connecter. Ses prospects et son historique restent.`)) return;
    startWork(async () => {
      const result = await setRepDisabled({ id: rep.id, disabled: disable });
      if (result.ok) {
        setInvitePath(null);
        say(disable ? "Compte désactivé." : "Compte réactivé.");
        router.refresh();
      } else say(result.error, true);
    });
  };

  const reassign = () => {
    setReassigning(false);
    startWork(async () => {
      const result = await reassignRepContacts({ fromId: rep.id, toId: target === UNASSIGNED ? null : target });
      if (result.ok) {
        const to = others.find((other) => other.id === target)?.name;
        say(`${result.count.toLocaleString("fr-FR")} prospect${result.count > 1 ? "s" : ""} ${to ? `${result.count > 1 ? "attribués" : "attribué"} à ${to}` : result.count > 1 ? "ne sont plus attribués" : "n'est plus attribué"}.`);
        router.refresh();
      } else say(result.error, true);
    });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {rep.status === "disabled" ? null : (
          <Button variant="secondary" size="sm" disabled={working} onClick={renew}>
            Nouveau lien d&apos;invitation
          </Button>
        )}
        {rep.prospects > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={working}
            onClick={() => {
              setTarget(UNASSIGNED);
              setReassigning(true);
            }}
          >
            Réattribuer ses prospects
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" disabled={working} onClick={toggle}>
          {rep.status === "disabled" ? "Réactiver" : "Désactiver"}
        </Button>
      </div>
      {invitePath ? (
        <div className="mt-3">
          <InviteLink path={invitePath} />
        </div>
      ) : null}
      {message ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "mt-2 text-sm text-danger-500" : "mt-2 text-sm text-ink-700"}>
          {message.text}
        </p>
      ) : null}

      <Modal
        open={reassigning}
        onClose={() => setReassigning(false)}
        title="Réattribuer ses prospects"
        footer={
          <div data-touch className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setReassigning(false)}>
              Annuler
            </Button>
            <Button onClick={reassign}>Réattribuer</Button>
          </div>
        }
      >
        <div data-touch>
          <p className="text-sm text-ink-700">
            Les {rep.prospects.toLocaleString("fr-FR")} prospect{rep.prospects > 1 ? "s" : ""} de {rep.name} (corbeille comprise) passent à la personne choisie. Leur historique est conservé, et chaque fiche note le changement.
          </p>
          <div className="mt-4">
            <Label htmlFor={`rep-reassign-${rep.id}`}>Nouveau commercial</Label>
            <Select id={`rep-reassign-${rep.id}`} value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value={UNASSIGNED}>Personne (non attribués)</option>
              {others.map((other) => (
                <option key={other.id} value={other.id}>
                  {other.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
