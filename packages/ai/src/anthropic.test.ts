import { describe, expect, it } from "vitest";
import { parseModelJson } from "./anthropic";

describe("parseModelJson", () => {
  it("parse un JSON valide tel quel", () => {
    expect(parseModelJson('{"titre":"Sophrologie à Albi"}')).toEqual({
      titre: "Sophrologie à Albi",
    });
  });

  it("retire les balises de code autour du JSON", () => {
    expect(parseModelJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it("échappe les retours à la ligne bruts dans les chaînes", () => {
    const raw = '{"texte":"Première ligne.\nDeuxième ligne.","n":1}';
    expect(parseModelJson(raw)).toEqual({
      texte: "Première ligne.\nDeuxième ligne.",
      n: 1,
    });
  });

  it("échappe tabulations, retours chariot et autres caractères de contrôle", () => {
    const raw = '{"texte":"a\tb\rcd"}';
    expect(parseModelJson(raw)).toEqual({ texte: "a\tb\rcd" });
  });

  it("ne touche pas aux caractères de contrôle hors des chaînes", () => {
    const raw = '{\n  "liste": [\n    "un\ndeux",\n    "trois"\n  ]\n}';
    expect(parseModelJson(raw)).toEqual({ liste: ["un\ndeux", "trois"] });
  });

  it("gère les guillemets échappés avant un caractère de contrôle", () => {
    const raw = '{"texte":"il dit \\"bonjour\\"\net partit"}';
    expect(parseModelJson(raw)).toEqual({ texte: 'il dit "bonjour"\net partit' });
  });

  it("laisse remonter l'erreur si le JSON est vraiment invalide", () => {
    expect(() => parseModelJson("pas du json")).toThrow();
  });
});
