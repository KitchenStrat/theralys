"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "@theralys/ui";
import { GOOGLE_ADS_INSTRUCTIONS_MAX } from "@theralys/shared";
import { Button, GenerationProgress, InlineSuccess, type TimedStep } from "@/components/ds";
import { regenerateAdsPlan } from "./actions";
import { FinePrint, Notice } from "./ads-ui";

const noop = () => undefined;

/**
 * Ce que fait la rédaction du plan, dans l'ordre, avec la durée habituelle de
 * chaque étape : le service ne remonte pas son avancement, l'attente le montre
 * d'après ces durées (la dernière étape ne se termine qu'à la vraie fin).
 */
export const PLAN_STEPS: readonly TimedStep[] = [
  { label: "Lecture du diagnostic et des mots-clés", seconds: 6 },
  { label: "Structure de la campagne", seconds: 12, details: ["Zone, calendrier et enchères", "Budget quotidien"] },
  {
    label: "Groupes d'annonces et annonces",
    seconds: 26,
    details: ["Un groupe par intention de recherche", "Titres et descriptions de chaque annonce", "Liens annexes et accroches"],
  },
  { label: "Jalons et conseils", seconds: 16, details: ["Ce qu'il faut faire à 7, 30, 60 et 90 jours"] },
];

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
      // Pendant la génération, ni Échap ni le clic hors boîte ne ferment la modale (le résultat s'affiche ici)
      onClose={pending ? noop : onClose}
      title="Instructions pour le plan d'action"
      footer={
        <>
          <Button type="button" variant="quiet" onClick={onClose} disabled={pending}>
            Fermer
          </Button>
          <Button
            type="button"
            icon={<Sparkles size={18} aria-hidden />}
            onClick={regenerate}
            loading={pending}
            disabled={remaining <= 0}
            title={remaining <= 0 ? "Quota mensuel de régénérations atteint" : undefined}
          >
            {pending ? "Préparation…" : "Régénérer le plan"}
          </Button>
        </>
      }
    >
      <p className="text-ds-body text-ds-ink-700">
        Facultatif : ce que vous voulez changer (une spécialité à mettre en avant, un ton, une page d&apos;arrivée, des expressions à
        éviter — par exemple « sans tarif »). Les mots-clés et le diagnostic sont conservés ; seul le plan est réécrit.
      </p>
      <label htmlFor="ads-plan-instructions" className="mt-4 block text-ds-body font-semibold text-ds-ink-900">
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
        className="mt-2 w-full rounded-ds-sm border border-ds-ink-450 bg-white px-3.5 py-2.5 text-base text-ds-ink-900 placeholder:text-ds-ink-500 disabled:bg-ds-ink-50 disabled:text-ds-ink-600"
      />
      <FinePrint className="mt-2">
        <span className="ds-tnum">
          {instructions.length} / {GOOGLE_ADS_INSTRUCTIONS_MAX}
        </span>{" "}
        · {remaining} régénération{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""} ce mois-ci
      </FinePrint>
      {pending ? (
        <div className="mt-4 rounded-ds-md bg-ds-ink-50 p-4 ring-1 ring-ds-ink-200">
          <GenerationProgress
            title="Nous réécrivons votre plan d'action"
            steps={PLAN_STEPS}
            running
            estimate="jusqu'à une minute"
            hint="Gardez cette fenêtre ouverte : le résultat s'affichera ici."
          />
        </div>
      ) : null}
      {error ? (
        <Notice tone="danger" role="alert" className="mt-4">
          {error}
        </Notice>
      ) : null}
      {message ? <InlineSuccess className="mt-4">{message}</InlineSuccess> : null}
    </Modal>
  );
}
