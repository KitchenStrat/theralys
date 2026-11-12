import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StepProgress } from "@/components/ds/step-progress";
import { withStepAttributes } from "./step-attributes";

// La configuration de test du studio ne règle pas la transformation JSX : les composants du design system y sont
// compilés en appels `React.createElement`, qui attendent `React` en variable globale (Next, lui, s'en passe).
(globalThis as { React?: typeof React }).React = React;

const STEPS = [{ label: "Lecture de vos pages" }, { label: "Compréhension de votre activité" }, { label: "Préparation de votre profil" }];

/** Le rendu de `StepProgress`, enrichi comme le fait le panneau de lecture. */
function render(current: number): string {
  const tree = withStepAttributes(StepProgress({ as: "h2", title: "Nous lisons votre site", steps: STEPS, current, status: "running", elapsed: 12 }), {
    heading: "h2",
    titleId: "reading-title",
    listLabel: "Étapes de la lecture",
    attributes: (index) => ({ "data-testid": `reading-step-${index + 1}`, "data-state": index < current ? "done" : index === current ? "current" : "next" }),
  });
  return renderToStaticMarkup(React.createElement("div", null, tree));
}

/** Les balises ouvrantes `<li …>` du rendu, dans l'ordre. */
const items = (html: string): string[] => html.match(/<li[^>]*>/g) ?? [];

describe("withStepAttributes — les repères des parcours automatisés sur le rendu de StepProgress", () => {
  it("chaque étape porte son `data-testid` et son état, sur le même élément que `aria-current`", () => {
    const html = render(1);
    const lis = items(html);
    expect(lis).toHaveLength(3);
    lis.forEach((li, index) => expect(li).toContain(`data-testid="reading-step-${index + 1}"`));
    expect(lis.map((li) => /data-state="(\w+)"/.exec(li)?.[1])).toEqual(["done", "current", "next"]);
    expect(lis.map((li) => li.includes('aria-current="step"'))).toEqual([false, true, false]);
  });

  it("la dernière étape n'est jamais montrée terminée tant que la tâche tourne", () => {
    const lis = items(render(2));
    expect(lis.map((li) => /data-state="(\w+)"/.exec(li)?.[1])).toEqual(["done", "done", "current"]);
    expect(lis[2]).toContain('aria-current="step"');
  });

  it("l'arbre enrichi se rend sans avertissement de React (clés des étapes conservées)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(0);
    render(2);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("le titre garde son identifiant (la section est nommée par lui) et la liste son nom accessible", () => {
    const html = render(0);
    expect(html).toMatch(/<h2[^>]*id="reading-title"[^>]*>Nous lisons votre site<\/h2>/);
    expect(html).toMatch(/<ol[^>]*aria-label="Étapes de la lecture"/);
    // Le dessin reste celui du design system : la jauge et l'annonce d'étape sont toujours là
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("Étape 1 sur 3");
  });
});
