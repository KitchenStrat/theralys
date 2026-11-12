import type { ChecklistStep } from "@/components/ds";
import type { MeasureState } from "@/lib/external-site/measure";

/**
 * Le parcours « connecter son propre site », en quatre étapes : connecter,
 * relire, activer, mesurer. Module pur : il dit, à partir de l'état rendu par
 * le service, ce qui est fait et la seule chose à faire ensuite. Affiché par
 * la liste « Votre parcours » (`SetupChecklist` du design system) et repris en
 * surtitre des cartes de l'écran.
 */

export type JourneyInput =
  /** Lecture en cours, ou première lecture en échec : le site n'est pas encore connecté */
  | { screen: "reading" | "error" }
  /** Site lu : `active` les outils s'appuient sur lui, `usable` son profil est exploitable, `measure` état du code de mesure */
  | { screen: "ready"; active: boolean; usable: boolean; measure: MeasureState };

export type Journey = {
  steps: ChecklistStep[];
  /** Liste repliée d'office (lecture en cours : le panneau de lecture a ses propres étapes) ; absente : ouverte tant qu'il reste à faire */
  open?: boolean;
  /** Phrase sous le titre, quand le décompte par défaut ne convient pas */
  summary?: string;
};

/** Les quatre étapes, dans l'ordre de l'écran. Les ancres sont celles des cartes. */
export const JOURNEY_STEPS = [
  { id: "connecter", label: "Connecter votre site", short: "Connecter" },
  { id: "relire", label: "Relire votre profil", short: "Relire" },
  { id: "activer", label: "Activer votre site", short: "Activer" },
  { id: "mesurer", label: "Mesurer ses visites", short: "Mesurer" },
] as const;

export type JourneyStepId = (typeof JOURNEY_STEPS)[number]["id"];

/** Surtitre de la carte d'une étape : « Étape 2 · Relire ». */
export function stepLabel(id: JourneyStepId): string {
  const index = JOURNEY_STEPS.findIndex((item) => item.id === id);
  return `Étape ${index + 1} · ${JOURNEY_STEPS[index]?.short ?? ""}`;
}

const step = (id: JourneyStepId, done: boolean, description?: string): ChecklistStep => {
  const def = JOURNEY_STEPS.find((item) => item.id === id);
  return { id, label: def?.label ?? id, done, description };
};

export function journeyOf(input: JourneyInput): Journey {
  if (input.screen !== "ready") {
    const reading = input.screen === "reading";
    return {
      steps: [
        step("connecter", false, reading ? "Nous lisons vos pages : rien à faire pour l'instant." : "La lecture n'a pas abouti : choisissez comment continuer."),
        step("relire", false),
        step("activer", false),
        step("mesurer", false),
      ],
      open: reading ? false : undefined,
      summary: reading ? "La lecture de votre site est en cours." : undefined,
    };
  }

  const { active, usable, measure } = input;
  // Relire n'a pas de bouton « terminé » : l'étape est tenue pour faite quand le praticien active son site.
  // Un profil redevenu incomplet la rouvre, même site activé (les contenus retombent alors sur le site Harmony).
  const review = !usable
    ? active
      ? "Votre profil est incomplet : complétez-le pour que vos contenus s'appuient de nouveau sur votre site."
      : "Il manque des informations à votre profil : complétez-le pour pouvoir activer votre site."
    : "Vérifiez ce que nous avons compris de votre site et corrigez ce qui doit l'être. Quand tout est juste, activez votre site.";
  return {
    steps: [
      step("connecter", true),
      step("relire", active && usable, review),
      step("activer", active, "D'un clic, vos contenus, vos liens et vos statistiques s'appuient sur votre site."),
      step(
        "mesurer",
        measure === "seen",
        measure === "detected"
          ? "Le code est repéré sur votre site : ouvrez votre site, puis vérifiez qu'une première visite arrive."
          : "Collez un petit code sur votre site pour suivre ses visites ici.",
      ),
    ],
  };
}

/** L'étape à mettre en avant : la première qui reste à faire (`null` : tout est en place). */
export function currentStep(journey: Journey): JourneyStepId | null {
  return (journey.steps.find((item) => !item.done)?.id as JourneyStepId | undefined) ?? null;
}
