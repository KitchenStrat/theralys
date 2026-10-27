import { describe, expect, it } from "vitest";
import { conversionKindOf, conversionSendTo } from "./conversions";

describe("conversionKindOf", () => {
  it("bouton RDV (data-track), téléphone (tel:) et e-mail (mailto:), une seule action par clic", () => {
    expect(conversionKindOf({ track: "rdv", href: "https://calendly.com/x" })).toBe("rdv");
    expect(conversionKindOf({ track: "rdv", href: "#contact" })).toBe("rdv");
    expect(conversionKindOf({ track: null, href: "tel:0639980123" })).toBe("call");
    expect(conversionKindOf({ track: null, href: " TEL:+33639980123" })).toBe("call");
    expect(conversionKindOf({ track: null, href: "mailto:claire@exemple.fr" })).toBe("email");
    // data-track l'emporte sur le href
    expect(conversionKindOf({ track: "rdv", href: "tel:0639980123" })).toBe("rdv");
  });

  it("aucune action pour les autres liens, data-track inconnus ou sans cible", () => {
    expect(conversionKindOf({ track: null, href: "/motifs/sommeil" })).toBeNull();
    expect(conversionKindOf({ track: null, href: "https://instagram.com/x" })).toBeNull();
    expect(conversionKindOf({ track: "menu", href: null })).toBeNull();
    expect(conversionKindOf({ track: null, href: null })).toBeNull();
    expect(conversionKindOf(null)).toBeNull();
  });
});

describe("conversionSendTo", () => {
  const labels = { rdv: "AbCdEfGhIj", call: " KlMnOpQrSt ", email: "" };

  it("compose AW-…/<libellé> pour les actions renseignées, null sinon", () => {
    expect(conversionSendTo("AW-1234567890", labels, "rdv")).toBe("AW-1234567890/AbCdEfGhIj");
    expect(conversionSendTo("AW-1234567890", labels, "call")).toBe("AW-1234567890/KlMnOpQrSt");
    expect(conversionSendTo("AW-1234567890", labels, "email")).toBeNull();
    expect(conversionSendTo("AW-1234567890", undefined, "rdv")).toBeNull();
    expect(conversionSendTo("AW-1234567890", null, "call")).toBeNull();
  });
});
