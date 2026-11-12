import { describe, expect, it } from "vitest";
import { EXTERNAL_CMS, EXTERNAL_MEASURE_OPTOUT } from "@theralys/shared";
import { installGuides, measureAnchorUrl, measureState, measureStatusLabel, privacyParagraph } from "./measure";

describe("état du code de mesure", () => {
  it("une visite reçue l'emporte sur le code simplement repéré", () => {
    expect(measureState({ seenAt: new Date("2026-11-12T09:00:00Z"), detectedOnSite: false })).toBe("seen");
    expect(measureState({ seenAt: new Date("2026-11-12T09:00:00Z"), detectedOnSite: true })).toBe("seen");
    expect(measureState({ seenAt: null, detectedOnSite: true })).toBe("detected");
    expect(measureState({ seenAt: null, detectedOnSite: false })).toBe("missing");
  });

  it("libellés de l'écran", () => {
    expect(measureStatusLabel("seen", "12 novembre 2026")).toBe("Première visite reçue le 12 novembre 2026");
    expect(measureStatusLabel("seen", null)).toBe("Première visite reçue");
    expect(measureStatusLabel("detected", null)).toBe("Code repéré dans vos pages, en attente d'une première visite");
    expect(measureStatusLabel("missing", null)).toBe("Pas encore installé");
  });
});

describe("refus de la mesure", () => {
  it("l'ancre suit l'adresse du site, avec une barre quand le site est à la racine", () => {
    expect(measureAnchorUrl("https://www.cabinet-exemple.fr", "#mesure-off")).toBe("https://www.cabinet-exemple.fr/#mesure-off");
    expect(measureAnchorUrl("https://www.cabinet-exemple.fr/", "#mesure-off")).toBe("https://www.cabinet-exemple.fr/#mesure-off");
    expect(measureAnchorUrl("https://exemple.fr/cabinet", "#mesure-on")).toBe("https://exemple.fr/cabinet#mesure-on");
  });

  it("le paragraphe dit ce qui est mesuré, l'absence de cookie, et donne les deux adresses du contrat", () => {
    const text = privacyParagraph("https://www.cabinet-exemple.fr");
    expect(text).toContain("Mesure d'audience");
    expect(text).toContain("aucun cookie");
    expect(text).toContain("aucun suivi publicitaire");
    expect(text).toContain(`https://www.cabinet-exemple.fr/${EXTERNAL_MEASURE_OPTOUT.off}`);
    expect(text).toContain(`https://www.cabinet-exemple.fr/${EXTERNAL_MEASURE_OPTOUT.on}`);
    expect(text).toContain("#mesure-off");
    // Texte brut, prêt à coller : ni balise ni mise en forme
    expect(text).not.toMatch(/[<>*_]/);
  });
});

describe("installGuides", () => {
  it("l'outil repéré vient d'abord et n'est pas répété dans les autres", () => {
    const { detected, others } = installGuides("wix");
    expect(detected?.id).toBe("wix");
    expect(detected?.label).toBe("Wix");
    expect(others.map((guide) => guide.id)).toEqual(["wordpress", "squarespace", "jimdo", "webador", "webflow", "google_sites", "other"]);
  });

  it("sans outil repéré, tous les outils sont proposés, « autre outil » en dernier", () => {
    const { detected, others } = installGuides(undefined);
    expect(detected).toBeNull();
    expect(others.map((guide) => guide.id)).toEqual(["wordpress", "wix", "squarespace", "jimdo", "webador", "webflow", "google_sites", "other"]);
    expect(others.at(-1)?.label).toBe("Autre outil, ou site fait sur mesure");
  });

  it("Google Sites : pas d'étapes, mais une explication", () => {
    const { detected } = installGuides("google_sites");
    expect(detected?.possible).toBe(false);
    expect(detected?.steps).toEqual([]);
    expect(detected?.note).toContain("ne permet pas");
  });

  it("chaque outil que le lecteur sait reconnaître a son pas-à-pas", () => {
    for (const cms of EXTERNAL_CMS) {
      const { detected } = installGuides(cms);
      expect(detected?.id).toBe(cms);
      if (detected?.possible) expect(detected.steps.length).toBeGreaterThan(0);
      else expect(detected?.note).toMatch(/\S/);
    }
  });

  it("un outil hors de la liste commune (Shopify) n'apparaît que s'il a été repéré", () => {
    expect(installGuides("shopify").detected?.id).toBe("shopify");
    expect(installGuides(undefined).others.some((guide) => guide.id === "shopify")).toBe(false);
  });
});
