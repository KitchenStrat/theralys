import { describe, expect, it } from "vitest";
import { META_PIXEL_ID_ERROR, metaTrackingForm, normalizePixelId, validateMetaTracking } from "./tracking";

describe("validateMetaTracking", () => {
  it("accepte un identifiant numérique de 10 à 20 chiffres, espaces retirés", () => {
    expect(validateMetaTracking({ metaPixelId: " 1234 5678 9012 3456 " })).toEqual({ ok: true, value: { metaPixelId: "1234567890123456" } });
    expect(validateMetaTracking({ metaPixelId: "1234567890" })).toEqual({ ok: true, value: { metaPixelId: "1234567890" } });
  });

  it("extrait l'identifiant collé depuis l'extrait de code fbq('init', '…')", () => {
    expect(validateMetaTracking({ metaPixelId: "fbq('init', '9876543210123');" })).toEqual({ ok: true, value: { metaPixelId: "9876543210123" } });
  });

  it("vide = Pixel retiré", () => {
    expect(validateMetaTracking({ metaPixelId: "" })).toEqual({ ok: true, value: { metaPixelId: null } });
    expect(validateMetaTracking({})).toEqual({ ok: true, value: { metaPixelId: null } });
  });

  it("refuse un identifiant mal formé", () => {
    expect(validateMetaTracking({ metaPixelId: "123456789" })).toEqual({ ok: false, error: META_PIXEL_ID_ERROR });
    expect(validateMetaTracking({ metaPixelId: "AW-1234567890" })).toEqual({ ok: false, error: META_PIXEL_ID_ERROR });
    expect(validateMetaTracking({ metaPixelId: "123456789012345678901" })).toEqual({ ok: false, error: META_PIXEL_ID_ERROR });
  });

  it("refuse une entrée qui n'est pas un objet", () => {
    expect(validateMetaTracking("1234567890123456").ok).toBe(false);
    expect(validateMetaTracking(null).ok).toBe(false);
  });
});

describe("normalisations", () => {
  it("normalizePixelId retire les espaces et garde un nombre nu tel quel", () => {
    expect(normalizePixelId("12 34 56 78 90 12")).toBe("123456789012");
    expect(normalizePixelId("abc")).toBe("abc");
  });

  it("metaTrackingForm reflète le suivi du site, vide par défaut", () => {
    expect(metaTrackingForm(undefined)).toEqual({ metaPixelId: "" });
    expect(metaTrackingForm({ metaPixelId: "1234567890123456" })).toEqual({ metaPixelId: "1234567890123456" });
  });
});
