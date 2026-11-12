"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
/** Délai entre deux relectures de la page, jusqu'à la fin de la lecture. */
const REFRESH_MS = 3000;
/**
 * Une relecture restée sans réponse aussi longtemps est tenue pour perdue
 * (réseau instable). Bien au-delà du temps de réponse d'un serveur lent :
 * relancer trop tôt ferait abandonner une réponse qui allait arriver.
 */
const REFRESH_LOST_MS = 45_000;

/**
 * Lecture du site en cours : ce qui est fait, combien de temps cela prend,
 * et l'assurance que la page peut être quittée. Monté seulement pendant une
 * lecture : dès qu'elle se termine, la page relue affiche le résultat et ce
 * composant disparaît avec ses minuteries.
 */
export function ReadingPanel({ address, hasPrevious }: { address: string; /** Une lecture précédente a abouti : son profil reste en place */ hasPrevious: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState(0);
  const [long, setLong] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [rescues, setRescues] = useState(0);

  // La page se relit toutes les 3 secondes, une relecture à la fois : la suivante n'est programmée qu'une fois la
  // précédente arrivée. Lancées à intervalle fixe, les relectures s'empileraient dès que le serveur répond
  // lentement, et l'écran attendrait la dernière de la file pour montrer le résultat.
  useEffect(() => {
    if (refreshing) return;
    // Onglet en arrière-plan : inutile d'interroger le serveur, la page se relit au retour
    const refresh = () => {
      if (document.visibilityState === "visible") startRefresh(() => router.refresh());
    };
    const timer = setTimeout(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshing, router]);

  // Une relecture perdue bloquerait toutes les suivantes (le routeur les traite une à une) et l'écran resterait figé
  // sur « lecture en cours ». Une navigation vers cette même page passe devant elle et ramène l'état du moment,
  // sans recharger la page. Elle est retentée tant que rien ne revient, en attendant chaque fois plus longtemps :
  // un serveur simplement très lent finit toujours par être entendu.
  useEffect(() => {
    if (!refreshing) return;
    const timer = setTimeout(
      () => {
        setRescues((count) => count + 1);
        startRefresh(() => router.replace(pathname, { scroll: false }));
      },
      REFRESH_LOST_MS * (rescues + 1),
    );
    return () => clearTimeout(timer);
  }, [refreshing, rescues, router, pathname]);

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
        <p className="mt-1 wrap-anywhere text-base font-medium text-ink-900">{address}</p>

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
          Cela prend jusqu&apos;à une minute environ. Vous pouvez quitter cette page&nbsp;: la lecture continue, et le résultat vous attendra ici.
          {hasPrevious ? " En attendant, votre profil actuel et vos corrections restent en place." : ""}
        </p>
        {/* Région vivante permanente : l'avancement y est annoncé sans déplacer le focus */}
        <p className="mt-2 text-sm text-ink-700" role="status">
          {long ? "C'est un peu plus long que d'habitude\u00a0: la lecture continue." : <span className="sr-only">{`Étape ${step + 1} sur ${STEPS.length} : ${STEPS[step]}.`}</span>}
        </p>
      </Card>
    </section>
  );
}
