"use client";

import { ScanSearch } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Card, StepProgress, useStepTimeline } from "@/components/ds";
import { stepLabel } from "./journey";
import { withStepAttributes } from "./step-attributes";
import { Eyebrow } from "./ui";

/**
 * Étapes de la lecture et leur durée habituelle, en secondes : la deuxième
 * commence 15 s après l'ouverture de l'écran, la troisième à 35 s. Un ordre
 * de grandeur : le serveur ne dit que « lecture en cours », la fin réelle
 * vient de lui (la page se relit). La dernière étape n'est donc jamais
 * montrée comme terminée (`useStepTimeline` s'y arrête). `details` : ce qui
 * se fait pendant l'étape, pour montrer le travail — des gestes, pas des
 * compteurs.
 */
const STEPS = [
  {
    label: "Lecture de vos pages",
    seconds: 15,
    details: ["Nous ouvrons vos pages publiques, comme le ferait un visiteur.", "Accueil, spécialités, tarifs, contact\u00a0: nous parcourons vos pages."],
  },
  {
    label: "Compréhension de votre activité",
    seconds: 20,
    details: ["Nous repérons vos spécialités et votre façon de travailler.", "Nous relevons vos tarifs, vos horaires et vos coordonnées."],
  },
  {
    label: "Préparation de votre profil",
    seconds: 40,
    details: ["Nous rangeons le tout par rubrique, pour que vous puissiez le relire.", "Encore quelques instants\u00a0: votre profil arrive."],
  },
] as const;

/** Durée d'affichage d'une précision, en secondes. */
const DETAIL_S = 7;
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
 *
 * Le dessin est celui de `StepProgress` (design system), avancé par
 * `useStepTimeline` ; les attributs que suivent les parcours automatisés
 * (`reading-step-N`, `data-state`) y sont ajoutés par `withStepAttributes`.
 */
export function ReadingPanel({ address, hasPrevious }: { address: string; /** Une lecture précédente a abouti : son profil reste en place */ hasPrevious: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [refreshing, startRefresh] = useTransition();
  const [rescues, setRescues] = useState(0);
  const { current: step, elapsed, inStep } = useStepTimeline(STEPS, true);
  const long = elapsed >= LONG_AFTER_S;

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

  const details = STEPS[step]?.details ?? [];
  const progress = withStepAttributes(
    // Appel direct, et non `<StepProgress />` : c'est l'arbre rendu qui reçoit les attributs des étapes
    StepProgress({
      as: "h2",
      icon: ScanSearch,
      title: (
        <>
          Nous lisons votre site
          <span className="mt-0.5 block font-sans text-base font-medium tracking-normal wrap-anywhere text-ds-ink-700">{address}</span>
        </>
      ),
      steps: STEPS,
      current: step,
      status: "running",
      estimate: "jusqu'à une minute environ",
      elapsed: Math.floor(elapsed),
      detail: details[Math.min(details.length - 1, Math.floor(inStep / DETAIL_S))],
      hint: (
        <>
          Vous pouvez quitter cette page&nbsp;: la lecture continue, et le résultat vous attendra ici.
          {hasPrevious ? " En attendant, votre profil actuel et vos corrections restent en place." : ""}
        </>
      ),
    }),
    {
      heading: "h2",
      titleId: "reading-title",
      listLabel: "Étapes de la lecture",
      attributes: (index) => ({ "data-testid": `reading-step-${index + 1}`, "data-state": index < step ? "done" : index === step ? "current" : "next" }),
    },
  );

  return (
    <section aria-labelledby="reading-title" data-testid="reading-panel">
      <Card padding="lg">
        <Eyebrow>{hasPrevious ? "Nouvelle lecture de votre site" : stepLabel("connecter")}</Eyebrow>
        <div className="mt-3">{progress}</div>
        {/* Région vivante permanente : le retard y est annoncé sans déplacer le focus (le changement d'étape l'est par `StepProgress`) */}
        <p className="text-ds-body font-medium text-ds-ink-800 [&:not(:empty)]:mt-4" role="status">
          {long ? "C'est un peu plus long que d'habitude\u00a0: la lecture continue." : null}
        </p>
      </Card>
    </section>
  );
}
