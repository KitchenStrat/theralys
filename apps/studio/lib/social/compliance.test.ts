import { describe, expect, it } from "vitest";
import { captionRefusal, forbiddenWord, instructionsRefusal } from "./compliance";

describe("instructionsRefusal", () => {
  it("accepte une instruction ordinaire, une négation et une citation", () => {
    expect(instructionsRefusal("Insistez sur la respiration, une légende plus courte.")).toBeNull();
    // Interdictions : on ne juge pas ce que le praticien refuse
    expect(instructionsRefusal("Ne jamais promettre de guérison.")).toBeNull();
    expect(instructionsRefusal("Éviter les mots « guérir » et « traitement ».")).toBeNull();
    expect(instructionsRefusal("Sans promesse de résultat garanti.")).toBeNull();
    // Un sigle en capitales dans une consigne n'est pas une « majuscule criée »
    expect(instructionsRefusal("Mentionner la méthode RNCP et le cabinet.")).toBeNull();
    expect(instructionsRefusal("   ")).toBeNull();
  });

  it("refuse une demande positive de vocabulaire interdit, avec le mot et le sujet du message", () => {
    const refusal = instructionsRefusal("Dites que la séance guérit l'anxiété.", "Vos instructions");
    expect(refusal).toMatch(/^Vos instructions contiennent un terme que la réglementation/);
    expect(refusal).toContain("«");
    expect(instructionsRefusal("Dites que la séance guérit l'anxiété.")).toMatch(/^Vos consignes contiennent/);
  });

  it("refuse une formulation contraire aux règles sociales", () => {
    const refusal = instructionsRefusal("Montrer un avant/après spectaculaire.", "Vos instructions");
    expect(refusal).toMatch(/^Vos instructions contiennent une formulation que nous n'employons pas sur les réseaux/);
  });
});

describe("captionRefusal et forbiddenWord", () => {
  it("légende acceptable, vocabulaire interdit, règle sociale", () => {
    expect(captionRefusal("Trois respirations pour relâcher les épaules.")).toBeNull();
    expect(captionRefusal("Cette séance guérit le stress.")).toMatch(/^Votre légende contient un terme/);
    expect(captionRefusal("Avant/après garanti !")).toMatch(/^Votre légende contient/);
    expect(forbiddenWord("rien d'interdit ici")).toBeNull();
    expect(typeof forbiddenWord("on guérit tout")).toBe("string");
  });
});
