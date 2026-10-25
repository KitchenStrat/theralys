import { describe, expect, it } from "vitest";
import { DEFAULT_NOT_FOUND } from "@theralys/shared";
import { resolveNotFound } from "./not-found";

describe("resolveNotFound", () => {
  it("sans réglage, applique les défauts", () => {
    expect(resolveNotFound(undefined)).toEqual({
      title: DEFAULT_NOT_FOUND.title,
      message: DEFAULT_NOT_FOUND.message,
      buttonLabel: DEFAULT_NOT_FOUND.buttonLabel,
      showSpecialties: true,
    });
    expect(resolveNotFound(null)).toEqual(resolveNotFound({}));
  });

  it("prend les valeurs du studio quand elles sont renseignées", () => {
    expect(
      resolveNotFound({
        title: "Oups",
        message: "Cette page a déménagé.",
        buttonLabel: "Revenir",
        showSpecialties: false,
      }),
    ).toEqual({
      title: "Oups",
      message: "Cette page a déménagé.",
      buttonLabel: "Revenir",
      showSpecialties: false,
    });
  });

  it("un message explicitement vide reste vide (masqué), un message absent prend le défaut", () => {
    expect(resolveNotFound({ message: "" }).message).toBe("");
    expect(resolveNotFound({ message: "   " }).message).toBe("");
    expect(resolveNotFound({ title: "Oups" }).message).toBe(DEFAULT_NOT_FOUND.message);
  });

  it("titre et libellé du bouton vides retombent sur les défauts", () => {
    const resolved = resolveNotFound({ title: "  ", buttonLabel: "" });
    expect(resolved.title).toBe(DEFAULT_NOT_FOUND.title);
    expect(resolved.buttonLabel).toBe(DEFAULT_NOT_FOUND.buttonLabel);
  });

  it("nettoie les espaces autour des valeurs", () => {
    expect(resolveNotFound({ title: " Oups ", buttonLabel: " Retour " })).toMatchObject({
      title: "Oups",
      buttonLabel: "Retour",
    });
  });
});
