"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Card, Spinner } from "@theralys/ui";

const STEPS = ["Lecture de vos pages", "Compréhension de votre activité", "Préparation de votre profil"] as const;

/**
 * Passage d'une étape à la suivante, en secondes depuis l'ouverture de
 * l'écran. Un ordre de grandeur : le serveur ne dit que « lecture en cours »,
 * la fin réelle vient de lui (la page se relit). La dernière étape n'est donc
 * jamais montrée comme terminée.
 */
const STEP_STARTS_S = [0, 15, 35] as const;
/** Au-delà, la lecture dure plus que d'habitude : l'écran le dit. */
const LONG_AFTER_S = 75;
/** La page se relit à cet intervalle jusqu'à la fin de la lecture. */
const REFRESH_MS = 3000;

/**
 * Lecture du site en cours : ce qui est fait, combien de temps cela prend,
 * et l'assurance que la page peut être quittée. Monté seulement pendant une
 * lecture : dès qu'elle se termine, la page relue affiche le résultat et ce
 * composant disparaît avec ses minuteries.
 */
export function ReadingPanel({ address, hasPrevious }: { address: string; /** Une lecture précédente a abouti : son profil reste en place */ hasPrevious: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [long, setLong] = useState(false);

  useEffect(() => {
    // Onglet en arrière-plan : inutile d'interroger le serveur, la page se relit au retour
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  useEffect(() => {
    const timers = [
      ...STEP_STARTS_S.slice(1).map((seconds, index) => setTimeout(() => setStep(index + 1), seconds * 1000)),
      setTimeout(() => setLong(true), LONG_AFTER_S * 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <section aria-labelledby="reading-title" data-testid="reading-panel">
      <Card className="p-6 md:p-7">
        <h2 id="reading-title" className="flex items-center gap-2.5 text-xl font-semibold">
          <Spinner /> Nous lisons votre site
        </h2>
        <p className="mt-1 break-all text-base font-medium text-ink-900">{address}</p>

        <ol className="mt-5 space-y-3" aria-label="Étapes de la lecture">
          {STEPS.map((label, index) => {
            const state = index < step ? "done" : index === step ? "current" : "next";
            return (
              <li key={label} className="flex items-center gap-3" aria-current={state === "current" ? "step" : undefined} data-testid={`reading-step-${index + 1}`} data-state={state}>
                <span
                  aria-hidden
                  className={clsx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    state === "done" && "bg-success-100 text-success-500",
                    state === "current" && "bg-primary-500 text-white",
                    state === "next" && "bg-cream-200 text-ink-500",
                  )}
                >
                  {state === "done" ? "✓" : index + 1}
                </span>
                <span className={clsx("text-base", state === "next" ? "text-ink-500" : "font-medium text-ink-900")}>
                  {label}
                  <span className={clsx("ml-2 text-sm font-normal", state === "current" ? "text-primary-700" : "text-ink-500")}>
                    {state === "done" ? "fait" : state === "current" ? "en cours…" : "à venir"}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-5 max-w-2xl text-base text-ink-700">
          Cela prend jusqu&apos;à une minute environ. Vous pouvez quitter cette page : la lecture continue, et le résultat vous attendra ici.
          {hasPrevious ? " En attendant, votre profil actuel et vos corrections restent en place." : ""}
        </p>
        {/* Région vivante permanente : l'avancement y est annoncé sans déplacer le focus */}
        <p className="mt-2 text-sm text-ink-700" role="status">
          {long ? "C'est un peu plus long que d'habitude : la lecture continue." : <span className="sr-only">{`Étape ${step + 1} sur ${STEPS.length} : ${STEPS[step]}.`}</span>}
        </p>
      </Card>
    </section>
  );
}
