import { describe, expect, it } from "vitest";
import {
  ADS_ID_ERROR,
  ADS_LABELS_WITHOUT_ID_ERROR,
  adsTrackingForm,
  normalizeAdsId,
  normalizeConversionLabel,
  validateAdsTracking,
} from "./tracking";

describe("validateAdsTracking", () => {
  it("accepte un identifiant AW-… et des libellés, normalisés", () => {
    const result = validateAdsTracking({ googleAdsId: " aw-1234567890 ", rdv: "AbC-dEfGhIjK", call: "AW-1234567890/XyZ_12345", email: "" });
    expect(result).toEqual({
      ok: true,
      value: { googleAdsId: "AW-1234567890", labels: { rdv: "AbC-dEfGhIjK", call: "XyZ_12345" } },
    });
  });

  it("tout vide = suivi retiré", () => {
    expect(validateAdsTracking({ googleAdsId: "", rdv: "", call: "", email: "" })).toEqual({
      ok: true,
      value: { googleAdsId: null, labels: null },
    });
  });

  it("refuse un identifiant mal formé", () => {
    expect(validateAdsTracking({ googleAdsId: "G-ABCDEF", rdv: "", call: "", email: "" })).toEqual({ ok: false, error: ADS_ID_ERROR });
    expect(validateAdsTracking({ googleAdsId: "AW-12", rdv: "", call: "", email: "" })).toEqual({ ok: false, error: ADS_ID_ERROR });
  });

  it("refuse un libellé mal formé, avec le type de conversion dans le message", () => {
    const result = validateAdsTracking({ googleAdsId: "AW-1234567890", rdv: "ab!", call: "", email: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Prendre rendez-vous");
  });

  it("refuse des libellés sans identifiant", () => {
    expect(validateAdsTracking({ googleAdsId: "", rdv: "AbCdEfGhIj", call: "", email: "" })).toEqual({
      ok: false,
      error: ADS_LABELS_WITHOUT_ID_ERROR,
    });
  });

  it("refuse une entrée qui n'est pas un objet", () => {
    expect(validateAdsTracking("AW-1234567890").ok).toBe(false);
    expect(validateAdsTracking(null).ok).toBe(false);
  });
});

describe("normalisations", () => {
  it("normalizeAdsId remet le préfixe en majuscules et retire les espaces", () => {
    expect(normalizeAdsId("aw-123 456")).toBe("AW-123456");
    expect(normalizeAdsId("AW-1234567890")).toBe("AW-1234567890");
  });

  it("normalizeConversionLabel garde la partie après la barre oblique", () => {
    expect(normalizeConversionLabel("AW-1234567890/AbCdEf-ghIJ")).toBe("AbCdEf-ghIJ");
    expect(normalizeConversionLabel(" AbCdEf-ghIJ ")).toBe("AbCdEf-ghIJ");
  });

  it("adsTrackingForm reflète le suivi du site, vide par défaut", () => {
    expect(adsTrackingForm(undefined)).toEqual({ googleAdsId: "", rdv: "", call: "", email: "" });
    expect(adsTrackingForm({ googleAdsId: "AW-1234567890", googleAdsConversions: { call: "XyZ_12345" } })).toEqual({
      googleAdsId: "AW-1234567890",
      rdv: "",
      call: "XyZ_12345",
      email: "",
    });
  });
});
