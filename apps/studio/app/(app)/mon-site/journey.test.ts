import { describe, expect, it } from "vitest";
import { JOURNEY_STEPS, currentStep, journeyOf, stepLabel } from "./journey";

const done = (input: Parameters<typeof journeyOf>[0]) => journeyOf(input).steps.map((step) => step.done);

describe("journeyOf — le parcours « connecter son propre site »", () => {
  it("toujours les quatre étapes, dans l'ordre de l'écran", () => {
    for (const input of [{ screen: "reading" }, { screen: "error" }, { screen: "ready", active: true, usable: true, measure: "seen" }] as const) {
      expect(journeyOf(input).steps.map((step) => step.id)).toEqual(JOURNEY_STEPS.map((step) => step.id));
    }
  });

  it("surtitres des cartes : le rang et le nom court de l'étape", () => {
    expect(JOURNEY_STEPS.map((step) => stepLabel(step.id))).toEqual(["Étape 1 · Connecter", "Étape 2 · Relire", "Étape 3 · Activer", "Étape 4 · Mesurer"]);
  });

  it("lecture en cours ou première lecture en échec : rien n'est fait, l'étape en cours est la connexion", () => {
    for (const screen of ["reading", "error"] as const) {
      const journey = journeyOf({ screen });
      expect(journey.steps.map((step) => step.done)).toEqual([false, false, false, false]);
      expect(currentStep(journey)).toBe("connecter");
    }
    // Pendant la lecture, la liste est repliée : le panneau de lecture a ses propres étapes
    expect(journeyOf({ screen: "reading" }).open).toBe(false);
    expect(journeyOf({ screen: "error" }).open).toBeUndefined();
    expect(journeyOf({ screen: "error" }).steps[0]?.description).toContain("n'a pas abouti");
  });

  it("site lu, pas encore activé : la relecture est l'étape en cours, jusqu'à l'activation", () => {
    const journey = journeyOf({ screen: "ready", active: false, usable: true, measure: "missing" });
    expect(journey.steps.map((step) => step.done)).toEqual([true, false, false, false]);
    expect(currentStep(journey)).toBe("relire");
    expect(journey.steps[1]?.description).toContain("activez votre site");
  });

  it("profil incomplet : l'étape « relire » reste ouverte, même site activé, et dit quoi faire", () => {
    const inactive = journeyOf({ screen: "ready", active: false, usable: false, measure: "missing" });
    expect(currentStep(inactive)).toBe("relire");
    expect(inactive.steps[1]?.description).toContain("pour pouvoir activer");
    const active = journeyOf({ screen: "ready", active: true, usable: false, measure: "missing" });
    expect(active.steps.map((step) => step.done)).toEqual([true, false, true, false]);
    expect(currentStep(active)).toBe("relire");
    expect(active.steps[1]?.description).toContain("s'appuient de nouveau sur votre site");
  });

  it("site activé : il reste à mesurer, puis tout est en place", () => {
    expect(done({ screen: "ready", active: true, usable: true, measure: "missing" })).toEqual([true, true, true, false]);
    expect(currentStep(journeyOf({ screen: "ready", active: true, usable: true, measure: "missing" }))).toBe("mesurer");
    expect(journeyOf({ screen: "ready", active: true, usable: true, measure: "detected" }).steps[3]?.description).toContain("repéré");
    const complete = journeyOf({ screen: "ready", active: true, usable: true, measure: "seen" });
    expect(complete.steps.every((step) => step.done)).toBe(true);
    expect(currentStep(complete)).toBeNull();
  });

  it("code de mesure installé avant l'activation : l'étape est faite, la relecture reste l'étape en cours", () => {
    const journey = journeyOf({ screen: "ready", active: false, usable: true, measure: "seen" });
    expect(journey.steps.map((step) => step.done)).toEqual([true, false, false, true]);
    expect(currentStep(journey)).toBe("relire");
  });
});
