"use client";

import { Radar } from "lucide-react";
import { useEffect, useState } from "react";
import { StepProgress, type TimedStep } from "@/components/ds";

/**
 * Étapes de l'analyse, dans l'ordre où le service les enchaîne : relevé de la
 * bibliothèque publicitaire, diagnostic, puis annonces, plan vidéo et plan de
 * campagne. L'analyse ne remonte pas son avancement : les durées sont des
 * repères (deux minutes au plus en tout), et la dernière étape ne se termine
 * jamais seule — c'est la réponse du service qui conclut.
 */
export const ANALYSIS_STEPS: readonly TimedStep[] = [
  {
    label: "Relevé des annonces autour de vous",
    seconds: 35,
    details: ["Recherche dans la bibliothèque publicitaire Meta", "Classement par zone et par durée de diffusion", "Lecture des angles et des accroches"],
  },
  {
    label: "Diagnostic de votre cabinet",
    seconds: 8,
    details: ["Pixel, page Facebook, prise de rendez-vous, avis", "Calcul du budget conseillé"],
  },
  {
    label: "Rédaction de vos annonces",
    seconds: 30,
    details: ["Choix d'un angle par annonce", "Texte principal, titre et description", "Accroche posée sur le visuel"],
  },
  {
    label: "Plan vidéo",
    seconds: 25,
    details: ["Trois vidéos courtes à tourner vous-même", "Script seconde par seconde"],
  },
  {
    label: "Plan de campagne",
    seconds: 22,
    details: ["Objectif, zone et audiences", "Budget et plan de test", "Jalons à 7, 30 et 60 jours"],
  },
];

/** Étapes d'une génération seule (annonces, plan vidéo et plan de campagne), sans nouvelle veille. */
export const GENERATION_STEPS: readonly TimedStep[] = [
  {
    label: "Rédaction de vos annonces",
    seconds: 25,
    details: ["Choix d'un angle par annonce", "Texte principal, titre et description", "Accroche posée sur le visuel"],
  },
  {
    label: "Plan vidéo",
    seconds: 20,
    details: ["Trois vidéos courtes à tourner vous-même", "Script seconde par seconde"],
  },
  {
    label: "Plan de campagne",
    seconds: 15,
    details: ["Objectif, zone et audiences", "Budget et plan de test"],
  },
];

/** Secondes écoulées depuis `startedAt` (`Date.now()`), relues quatre fois par seconde. */
function useElapsedSince(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  return startedAt === null ? 0 : Math.max(0, (now - startedAt) / 1000);
}

/**
 * Attente de l'analyse lancée depuis cette page. Le chronomètre part de
 * l'heure du lancement (`startedAt`) et non du montage du composant : il reste
 * juste quand on change d'onglet pendant l'attente. (`GenerationProgress`, du
 * design system, compte depuis son propre montage ; la présentation est celle
 * de `StepProgress`.) À ne rendre que pendant l'attente, hors de toute région
 * `aria-live` : `StepProgress` annonce lui-même chaque changement d'étape.
 */
export function AnalysisProgress({ startedAt, where, className }: { startedAt: number | null; /** Ce qui se mettra à jour à la fin, sous l'attente */ where: string; className?: string }) {
  const elapsed = useElapsedSince(startedAt);
  let current = 0;
  let before = 0;
  for (let i = 0; i < ANALYSIS_STEPS.length - 1; i++) {
    const seconds = ANALYSIS_STEPS[i]?.seconds ?? 0;
    if (elapsed < before + seconds) break;
    before += seconds;
    current = i + 1;
  }
  const details = ANALYSIS_STEPS[current]?.details;
  // Une précision toutes les 3 s, puis la dernière reste affichée : pas de retour en arrière
  const detail = details && details.length > 0 ? details[Math.min(details.length - 1, Math.floor((elapsed - before) / 3))] : undefined;
  return (
    <StepProgress
      className={className}
      icon={Radar}
      title="Nous analysons votre marché et préparons vos annonces"
      steps={ANALYSIS_STEPS}
      current={current}
      estimate="jusqu'à deux minutes"
      elapsed={Math.floor(elapsed)}
      detail={detail}
      hint={where}
    />
  );
}
