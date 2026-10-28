import { describe, expect, it } from "vitest";
import { landingSource } from "./track-client";

describe("landingSource", () => {
  it("src explicite du lien de bio, borné à 20 caractères", () => {
    expect(landingSource("?src=ig")).toBe("ig");
    expect(landingSource("?utm_source=google&src=fb&gclid=x")).toBe("fb");
    expect(landingSource(`?src=${"x".repeat(30)}`)).toBe("x".repeat(20));
  });

  it("annonce Google (gclid, gbraid, wbraid ou UTM payant) sans src explicite → ads", () => {
    expect(landingSource("?gclid=test")).toBe("ads");
    expect(landingSource("?gbraid=1")).toBe("ads");
    expect(landingSource("?wbraid=1")).toBe("ads");
    expect(landingSource("?utm_source=google&utm_medium=cpc")).toBe("ads");
    expect(landingSource("?utm_source=Google&utm_medium=PPC&utm_campaign=x")).toBe("ads");
  });

  it("annonce Meta (fbclid ou UTM payant Facebook / Instagram) sans src explicite → meta", () => {
    expect(landingSource("?fbclid=test")).toBe("meta");
    expect(landingSource("?utm_source=facebook&utm_medium=cpc")).toBe("meta");
    expect(landingSource("?utm_source=Instagram&utm_medium=paid_social&utm_campaign=x")).toBe("meta");
    // le src explicite l'emporte ; à signatures Google et Meta réunies, Google prime
    expect(landingSource("?src=fb&fbclid=abc")).toBe("fb");
    expect(landingSource("?gclid=x&fbclid=y")).toBe("ads");
  });

  it("rien sans src ni signature d'annonce", () => {
    expect(landingSource("")).toBeNull();
    expect(landingSource("?src=")).toBeNull();
    expect(landingSource("?utm_source=google&utm_medium=organic")).toBeNull();
    expect(landingSource("?utm_source=newsletter")).toBeNull();
    // publication organique Facebook / Instagram : pas une annonce
    expect(landingSource("?utm_source=facebook&utm_medium=social")).toBeNull();
  });
});
