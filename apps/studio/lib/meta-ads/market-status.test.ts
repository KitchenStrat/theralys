import { describe, expect, it } from "vitest";
import { MARKET_FAILED, marketErrorOf, marketFailureSentence, marketUnavailableNotice } from "./market-status";

const TOKEN = "Le jeton Meta est invalide ou expiré : contactez Harmony.";

describe("marketUnavailableNotice", () => {
  it("client sans jeton : en attente d'activation, sans invitation à relancer", () => {
    const notice = marketUnavailableNotice({ provider: "none", error: null, siteType: "client", generationMissing: false });
    expect(notice.title).toBe("Veille en attente d'activation du jeton Meta.");
    expect(notice.detail).toContain("Harmony active");
    expect(notice.retry).toBe(false);
  });

  it("démo sans mock ni jeton : indisponible dans cet environnement, rien à relancer", () => {
    const notice = marketUnavailableNotice({ provider: "none", error: null, siteType: "demo", generationMissing: false });
    expect(notice.title).toBe("Veille indisponible dans cet environnement.");
    expect(notice.detail).not.toMatch(/relancez/i);
    expect(notice.retry).toBe(false);
  });

  it("fournisseur présent et erreur : le message du service est affiché, pour une démo comme pour un client", () => {
    for (const siteType of ["demo", "client"] as const) {
      const notice = marketUnavailableNotice({ provider: "meta", error: TOKEN, siteType, generationMissing: false });
      expect(notice.title).toBe(`${MARKET_FAILED}.`);
      expect(notice.detail.startsWith(TOKEN)).toBe(true);
      expect(notice.detail).toContain("restent disponibles");
      expect(notice.retry).toBe(true);
    }
  });

  it("l'erreur de génération n'est pas attribuée à la veille", () => {
    const notice = marketUnavailableNotice({ provider: "mock", error: "Les annonces n'ont pas pu être générées : relancez la génération.", siteType: "demo", generationMissing: true });
    expect(notice.title).toBe("La veille du marché n'est pas disponible pour cette analyse.");
    expect(notice.detail).not.toContain("annonces n'ont pas pu");
    expect(notice.retry).toBe(true);
  });

  it("sans erreur ni fournisseur manquant : relance conseillée", () => {
    const notice = marketUnavailableNotice({ provider: "meta", error: "  ", siteType: "client", generationMissing: false });
    expect(notice.detail).toMatch(/Relancez l'analyse/);
  });
});

describe("marketFailureSentence", () => {
  it("reprend le message du service, ponctué", () => {
    expect(marketFailureSentence({ provider: "meta", error: TOKEN, siteType: "client", generationMissing: false })).toBe(`${MARKET_FAILED} : ${TOKEN}`);
    expect(marketFailureSentence({ provider: "meta", error: "Bibliothèque injoignable", siteType: "client", generationMissing: false })).toBe(`${MARKET_FAILED} : Bibliothèque injoignable.`);
  });

  it("sans jeton : attente d'activation (client) ou environnement sans fournisseur (démo)", () => {
    expect(marketFailureSentence({ provider: "none", error: null, siteType: "client", generationMissing: false })).toContain("en attente d'activation par Harmony");
    expect(marketFailureSentence({ provider: "none", error: null, siteType: "demo", generationMissing: false })).toContain("aucun fournisseur disponible");
  });

  it("ligne illisible ou erreur de génération : phrase générique", () => {
    expect(marketFailureSentence({ provider: null, error: null, siteType: "client", generationMissing: false })).toBe(`${MARKET_FAILED}.`);
    expect(marketFailureSentence({ provider: "meta", error: "Les annonces n'ont pas pu être générées.", siteType: "client", generationMissing: true })).toBe(`${MARKET_FAILED}.`);
  });

  it("marketErrorOf ignore le fournisseur absent, la génération en échec et les blancs", () => {
    expect(marketErrorOf({ provider: "meta", error: ` ${TOKEN} `, generationMissing: false })).toBe(TOKEN);
    expect(marketErrorOf({ provider: "none", error: TOKEN, generationMissing: false })).toBeNull();
    expect(marketErrorOf({ provider: "meta", error: TOKEN, generationMissing: true })).toBeNull();
    expect(marketErrorOf({ provider: "meta", error: "", generationMissing: false })).toBeNull();
  });
});
