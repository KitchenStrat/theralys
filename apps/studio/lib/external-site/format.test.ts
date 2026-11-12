import { describe, expect, it } from "vitest";
import { EXTERNAL_PAGE_KINDS } from "@theralys/shared";
import { PAGE_KIND_LABELS, detectedItems, formatDayParis, formatMomentParis, frenchSpacing, plural, readingHint, readsRemaining, readsRemainingLabel, siteAddressLabel } from "./format";

describe("frenchSpacing", () => {
  it("rend insécable l'espace avant « : ; ? ! » et à l'intérieur des guillemets", () => {
    expect(frenchSpacing("Vous avez déjà un site ?")).toBe("Vous avez déjà un site\u00a0?");
    expect(frenchSpacing("C'est noté : cliquez sur « Vérifier » ; puis patientez !")).toBe("C'est noté\u00a0: cliquez sur «\u00a0Vérifier\u00a0»\u00a0; puis patientez\u00a0!");
  });

  it("ne touche ni aux adresses web ni à un texte déjà mis en forme", () => {
    expect(frenchSpacing("Nous lirons le site https://www.cabinet-exemple.fr")).toBe("Nous lirons le site https://www.cabinet-exemple.fr");
    expect(frenchSpacing("Par exemple : www.mon-cabinet.fr/contact?page=2")).toBe("Par exemple\u00a0: www.mon-cabinet.fr/contact?page=2");
    const once = frenchSpacing("Ouvrez « Paramètres » : c'est là.");
    expect(frenchSpacing(once)).toBe(once);
    expect(frenchSpacing("")).toBe("");
  });
});

describe("readingHint", () => {
  it("adresse d'accueil : le site entier sera lu", () => {
    expect(readingHint("https://www.cabinet-exemple.fr")).toBe("Nous lirons le site https://www.cabinet-exemple.fr");
  });

  it("adresse qui porte un chemin : seule cette partie du site sera lue, et l'aide dit comment lire le site entier", () => {
    const hint = readingHint("https://www.maison-de-sante.fr/praticiens/dupont");
    expect(hint).toBe("Nous lirons https://www.maison-de-sante.fr/praticiens/dupont et les pages rangées sous cette adresse. Pour lire tout votre site, indiquez seulement son adresse d'accueil.");
    expect(readingHint("https://www.cabinet-exemple.fr/fr")).toContain("les pages rangées sous cette adresse");
  });

  it("site hébergé sous un dossier (Google Sites) : son adresse est ce dossier, rien à signaler — sauf si une page y est désignée", () => {
    expect(readingHint("https://sites.google.com/view/cabinet-dupont")).toBe("Nous lirons le site https://sites.google.com/view/cabinet-dupont");
    expect(readingHint("https://sites.google.com/view/cabinet-dupont/tarifs")).toContain("les pages rangées sous cette adresse");
  });
});

describe("siteAddressLabel", () => {
  it("retire le protocole et la barre finale", () => {
    expect(siteAddressLabel("https://www.cabinet-exemple.fr")).toBe("www.cabinet-exemple.fr");
    expect(siteAddressLabel("https://www.cabinet-exemple.fr/")).toBe("www.cabinet-exemple.fr");
    expect(siteAddressLabel("http://localhost:3037/claire-dupont/")).toBe("localhost:3037/claire-dupont");
    expect(siteAddressLabel("https://cabinet-exemple.fr/sophrologie")).toBe("cabinet-exemple.fr/sophrologie");
  });
});

describe("dates au fuseau de Paris", () => {
  it("le jour est celui de Paris, pas celui du serveur", () => {
    // 23 h 30 UTC le 11 novembre : déjà le 12 à Paris
    expect(formatDayParis(new Date("2026-11-11T23:30:00Z"))).toBe("12 novembre 2026");
    expect(formatDayParis(new Date("2026-07-01T12:00:00Z"))).toBe("1 juillet 2026");
  });

  it("l'heure est écrite à la française, avec des espaces insécables", () => {
    expect(formatMomentParis(new Date("2026-11-12T09:32:00Z"))).toBe("12 novembre 2026 à 10 h 32");
    // Heure d'été, et minutes sur deux chiffres
    expect(formatMomentParis(new Date("2026-07-01T07:05:00Z"))).toBe("1 juillet 2026 à 9 h 05");
    // Minuit à Paris : 0 h, jamais 24 h
    expect(formatMomentParis(new Date("2026-11-11T23:00:00Z"))).toBe("12 novembre 2026 à 0 h 00");
  });
});

describe("lectures du mois", () => {
  it("accord au pluriel à partir de deux", () => {
    expect(plural(0, "lecture", "lectures")).toBe("lecture");
    expect(plural(1, "lecture", "lectures")).toBe("lecture");
    expect(plural(2, "lecture", "lectures")).toBe("lectures");
  });

  it("le reste ne descend jamais sous zéro", () => {
    expect(readsRemaining({ used: 2, limit: 6 })).toBe(4);
    expect(readsRemaining({ used: 6, limit: 6 })).toBe(0);
    expect(readsRemaining({ used: 9, limit: 6 })).toBe(0);
  });

  it("le libellé donne le reste et le plafond, puis explique quand tout est utilisé", () => {
    expect(readsRemainingLabel({ used: 2, limit: 6 })).toBe("Il vous reste 4 lectures ce mois-ci (sur 6).");
    expect(readsRemainingLabel({ used: 5, limit: 6 })).toBe("Il vous reste 1 lecture ce mois-ci (sur 6).");
    expect(readsRemainingLabel({ used: 6, limit: 6 })).toBe("Vous avez utilisé vos 6 lectures de ce mois : la prochaine sera possible le mois prochain.");
  });
});

describe("PAGE_KIND_LABELS", () => {
  it("chaque nature de page du contrat a son libellé", () => {
    for (const kind of EXTERNAL_PAGE_KINDS) expect(PAGE_KIND_LABELS[kind]).toMatch(/\S/);
    expect(Object.keys(PAGE_KIND_LABELS).sort()).toEqual([...EXTERNAL_PAGE_KINDS].sort());
  });
});

describe("detectedItems", () => {
  it("rien de repéré : quatre lignes, toutes « non »", () => {
    const items = detectedItems({ tags: {} });
    expect(items.map((item) => item.id)).toEqual(["cms", "google", "meta", "consent"]);
    expect(items.every((item) => !item.found)).toBe(true);
    expect(items.map((item) => item.detail)).toEqual(["non reconnu", "non repérée", "non repéré", "non repéré"]);
  });

  it("nomme l'outil de création et les balises Google repérées, sans leurs identifiants", () => {
    const items = detectedItems({
      cms: "wordpress",
      tags: { googleAnalyticsId: "G-ABCDEF1234", googleAdsId: "AW-1234567890", metaPixelId: "123456789012345", consentBanner: true },
    });
    expect(items.every((item) => item.found)).toBe(true);
    expect(items[0]?.detail).toBe("WordPress");
    expect(items[1]?.detail).toBe("repérée (Google Analytics, Google Ads)");
    expect(items[2]?.detail).toBe("repéré");
    expect(items[3]?.detail).toBe("repéré");
    expect(JSON.stringify(items)).not.toMatch(/G-ABCDEF1234|AW-1234567890|123456789012345/);
  });

  it("un bandeau absent ou non renseigné n'est pas « repéré »", () => {
    expect(detectedItems({ tags: { consentBanner: false } })[3]?.found).toBe(false);
    expect(detectedItems({ tags: { googleTagManagerId: "GTM-ABCD123" } })[1]?.detail).toBe("repérée (Google Tag Manager)");
  });
});
