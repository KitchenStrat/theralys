import { describe, expect, it } from "vitest";
import { deArticle, elideDe, withArticle } from "./french";
import { exerciseFor, practiceFamily } from "./exercises";

describe("withArticle — article défini par heuristique de genre et de nombre", () => {
  it("féminins en -tion/-té/-ie/-ure/-ance/-ence, masculins par défaut", () => {
    expect(withArticle("gestion du stress")).toBe("la gestion du stress");
    expect(withArticle("préparation mentale")).toBe("la préparation mentale");
    expect(withArticle("confiance en soi")).toBe("la confiance en soi");
    expect(withArticle("sérénité")).toBe("la sérénité");
    expect(withArticle("réflexologie plantaire")).toBe("la réflexologie plantaire");
    expect(withArticle("posture")).toBe("la posture");
    expect(withArticle("sommeil")).toBe("le sommeil");
    expect(withArticle("massage sportif")).toBe("le massage sportif");
    expect(withArticle("stress")).toBe("le stress");
  });

  it("élision devant une voyelle ou un h, pluriels en -s/-x", () => {
    expect(withArticle("accompagnement périnatal")).toBe("l'accompagnement périnatal");
    expect(withArticle("ancrage")).toBe("l'ancrage");
    expect(withArticle("hypnose")).toBe("l'hypnose");
    expect(withArticle("émotions")).toBe("les émotions");
    expect(withArticle("troubles du sommeil")).toBe("les troubles du sommeil");
    expect(withArticle("douleurs chroniques")).toBe("les douleurs chroniques");
    expect(withArticle("corps")).toBe("le corps");
    expect(withArticle("exercices de respiration")).toBe("les exercices de respiration");
  });

  it("coordination traitée membre à membre, déterminant existant conservé, casse gardée", () => {
    expect(withArticle("sommeil et récupération")).toBe("le sommeil et la récupération");
    expect(withArticle("gestion du stress et des émotions")).toBe("la gestion du stress et des émotions");
    expect(withArticle("enfants et adolescents")).toBe("les enfants et les adolescents");
    expect(withArticle("la sophrologie")).toBe("la sophrologie");
    expect(withArticle("l'hypnose")).toBe("l'hypnose");
    expect(withArticle("votre sommeil")).toBe("votre sommeil");
    expect(withArticle("Gestion du stress")).toBe("la Gestion du stress");
    expect(withArticle("  ")).toBe("");
  });

  it("deArticle : contraction du/des, « de la », « de l' »", () => {
    expect(deArticle("sommeil")).toBe("du sommeil");
    expect(deArticle("émotions")).toBe("des émotions");
    expect(deArticle("gestion du stress")).toBe("de la gestion du stress");
    expect(deArticle("accompagnement périnatal")).toBe("de l'accompagnement périnatal");
    expect(deArticle("sommeil et récupération")).toBe("du sommeil et de la récupération");
    expect(elideDe("hypnose")).toBe("d'hypnose");
    expect(elideDe("sophrologie")).toBe("de sophrologie");
  });
});

describe("exerciseFor — un exercice par famille de pratique", () => {
  it("familles résolues depuis le métier saisi librement", () => {
    expect(practiceFamily("Sophrologue")).toBe("sophrologie");
    expect(practiceFamily("Hypnothérapeute")).toBe("hypnose");
    expect(practiceFamily("Naturopathe")).toBe("naturopathie");
    expect(practiceFamily("Masseuse bien-être")).toBe("massage");
    expect(practiceFamily("Énergéticienne")).toBe("autre");
  });

  it("respiration abdominale (sophrologie), ancrage 5-4-3-2-1 (hypnose), pause hydratation (naturopathie), 4-2-6 sinon ; accordé au lecteur", () => {
    const vous = { reader: "vous" as const };
    expect(exerciseFor("Sophrologue", vous).name).toBe("la respiration abdominale");
    expect(exerciseFor("Sophrologue", vous).steps.join(" ")).toMatch(/4 secondes.*6 secondes/);
    expect(exerciseFor("Sophrologue", vous).steps.join(" ")).not.toMatch(/2 secondes/);
    expect(exerciseFor("Hypnothérapeute", vous).name).toBe("l'ancrage sensoriel 5-4-3-2-1");
    expect(exerciseFor("Hypnothérapeute", vous).steps.join(" ")).toMatch(/5 choses.*4 choses.*3 sons.*2 odeurs.*1 goût/);
    expect(exerciseFor("Naturopathe", vous).name).toBe("la pause hydratation et marche");
    expect(exerciseFor("Naturopathe", vous).steps[0]).toContain("verre d'eau");
    expect(exerciseFor("Ostéopathe", vous).name).toBe("la respiration 4-2-6");
    expect(exerciseFor("Ostéopathe", vous).steps.join(" ")).toMatch(/4 secondes.*2 secondes.*6 secondes/);
    expect(exerciseFor("Sophrologue", { reader: "tu" }).steps[0]).toBe("Assieds-toi confortablement, pieds à plat sur le sol.");
    expect(exerciseFor("Hypnothérapeute", { reader: "tu" }).steps[1]).toBe("Nomme 5 choses que tu vois autour de toi.");
  });
});
