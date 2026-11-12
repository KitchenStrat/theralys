"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";
import { Modal } from "@theralys/ui";
import { Button, GenerationProgress, InlineSuccess } from "@/components/ds";
import { META_ADS_INSTRUCTIONS_MAX } from "@theralys/shared";
import { regenerateMetaAds } from "./actions";
import { GENERATION_STEPS } from "./analysis-progress";

const noop = () => undefined;

/**
 * Instructions + Régénérer les annonces (créas, plan vidéo et plan de
 * campagne) : même pattern que la régénération du plan Google Ads
 * (instructions libres, quota mensuel, message de confirmation,
 * rafraîchissement de la page). La veille et le diagnostic sont conservés.
 */
export function RegenerateModal({
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
      const result = await regenerateMetaAds({ instructions });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (typeof result.remaining === "number") setRemaining(result.remaining);
      setMessage("Annonces régénérées : créas, plan vidéo et plan de campagne mis à jour.");
      router.refresh();
    });
  }

  return (
    <Modal
      open
      // Pendant la génération, ni Échap ni le clic hors boîte ne ferment la modale (le résultat s'affiche ici)
      onClose={pending ? noop : onClose}
      title="Instructions pour vos annonces"
      footer={
        <>
          <Button variant="quiet" onClick={onClose} disabled={pending}>
            Fermer
          </Button>
          <Button
            onClick={regenerate}
            loading={pending}
            disabled={remaining <= 0}
            title={remaining <= 0 ? "Quota mensuel de régénérations atteint" : undefined}
            icon={<Sparkles size={18} aria-hidden />}
          >
            {pending ? "Préparation…" : "Régénérer les annonces"}
          </Button>
        </>
      }
    >
      <p className="text-ds-body text-ds-ink-700">
        Facultatif : ce que vous voulez changer (une spécialité à mettre en avant, un ton, une photo à privilégier, une page
        d&apos;atterrissage, des expressions à éviter — par exemple « sans tarif »). La veille et le diagnostic sont conservés ; les créas,
        le plan vidéo et le plan de campagne sont réécrits, et les visuels rendus à nouveau.
      </p>
      <label htmlFor="meta-instructions" className="mt-4 block text-ds-body font-semibold text-ds-ink-900">
        Vos instructions
      </label>
      <textarea
        id="meta-instructions"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value.slice(0, META_ADS_INSTRUCTIONS_MAX))}
        maxLength={META_ADS_INSTRUCTIONS_MAX}
        rows={4}
        disabled={pending}
        placeholder="Ex. : mettez en avant la gestion du stress, pas de mention de tarif, ton plus direct."
        className="mt-2 w-full rounded-ds-sm border border-ds-ink-450 bg-white px-3 py-2 text-base text-ds-ink-900 placeholder:text-ds-ink-500 disabled:bg-ds-ink-50"
      />
      <p className="mt-2 text-ds-meta text-ds-ink-600 ds-tnum">
        {instructions.length} / {META_ADS_INSTRUCTIONS_MAX} · {remaining} régénération{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""} ce mois-ci
      </p>
      {/* L'attente : étapes nommées et durée annoncée, à la place d'un simple indicateur */}
      {pending ? (
        <div className="mt-4 rounded-ds-md bg-ds-ink-50 p-4 inset-ring inset-ring-ds-ink-200">
          <GenerationProgress section="meta-ads" title="Nous réécrivons vos annonces" steps={GENERATION_STEPS} running estimate="jusqu'à une minute" />
        </div>
      ) : null}
      {error ? (
        <p className="mt-4 flex items-start gap-2 text-ds-body font-medium text-ds-danger-700" role="alert">
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
      {message ? <InlineSuccess className="mt-4">{message}</InlineSuccess> : null}
    </Modal>
  );
}
