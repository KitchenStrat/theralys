"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Modal, Spinner } from "@theralys/ui";
import { GOOGLE_ADS_INSTRUCTIONS_MAX } from "@theralys/shared";
import { regenerateAdsPlan } from "./actions";

/**
 * Instructions + Régénérer le plan d'action : même pattern que la
 * régénération d'un post Google (instructions libres, quota mensuel, message
 * de confirmation, rafraîchissement de la page).
 */
export function PlanRegenerateModal({
  open,
  onClose,
  remaining,
  currentInstructions,
}: {
  open: boolean;
  onClose: () => void;
  remaining: number;
  currentInstructions: string | null;
}) {
  if (!open) return null;
  return <ModalBody onClose={onClose} remaining={remaining} currentInstructions={currentInstructions} />;
}

function ModalBody({ onClose, remaining: initialRemaining, currentInstructions }: { onClose: () => void; remaining: number; currentInstructions: string | null }) {
  const router = useRouter();
  const [instructions, setInstructions] = useState(currentInstructions ?? "");
  const [remaining, setRemaining] = useState(initialRemaining);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function regenerate() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await regenerateAdsPlan({ instructions });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (typeof result.remaining === "number") setRemaining(result.remaining);
      setMessage("Plan régénéré : campagne, groupes d'annonces et annonces mis à jour.");
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Instructions pour le plan d'action"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Fermer
          </Button>
          <Button onClick={regenerate} disabled={pending || remaining <= 0} title={remaining <= 0 ? "Quota mensuel de régénérations atteint" : undefined}>
            {pending ? (
              <>
                <Spinner className="text-white" /> Préparation…
              </>
            ) : (
              "✦ Régénérer le plan"
            )}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-700">
        Facultatif : ce que vous voulez changer (une spécialité à mettre en avant, un ton, une page d&apos;atterrissage, des
        expressions à éviter — par exemple « sans tarif »). Les mots-clés et le diagnostic sont conservés ; seul le plan est
        réécrit.
      </p>
      <label htmlFor="ads-plan-instructions" className="mt-4 block text-sm font-semibold text-ink-900">
        Vos instructions
      </label>
      <textarea
        id="ads-plan-instructions"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value.slice(0, GOOGLE_ADS_INSTRUCTIONS_MAX))}
        maxLength={GOOGLE_ADS_INSTRUCTIONS_MAX}
        rows={4}
        disabled={pending}
        placeholder="Ex. : mettez en avant la gestion du stress, pas de groupe sur les tarifs, ton plus direct."
        className="mt-2 w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-sm text-ink-900 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
      />
      <p className="mt-2 text-xs text-ink-500">
        {instructions.length} / {GOOGLE_ADS_INSTRUCTIONS_MAX} · {remaining} régénération{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""} ce mois-ci
      </p>
      {error ? (
        <p className="mt-3 text-sm text-danger-500" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 text-sm text-success-500" role="status">
          {message}
        </p>
      ) : null}
    </Modal>
  );
}
