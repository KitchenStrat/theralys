import { describe, expect, it } from "vitest";
import { checkEthicalCompliance, checkEthicalComplianceDeep } from "./guardrails";

describe("checkEthicalCompliance", () => {
  it("signale les promesses de guérison", () => {
    const r = checkEthicalCompliance("Ce massage guérit le dos et garantit la guérison.");
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === "promesse de guérison")).toBe(true);
  });

  it("signale le vocabulaire médical", () => {
    expect(checkEthicalCompliance("Je soigne vos douleurs.").ok).toBe(false);
    expect(checkEthicalCompliance("Un traitement efficace.").ok).toBe(false);
    expect(checkEthicalCompliance("Après un diagnostic complet.").ok).toBe(false);
  });

  it("signale les allégations sur des pathologies", () => {
    expect(checkEthicalCompliance("Utile contre la dépression.").ok).toBe(false);
    expect(checkEthicalCompliance("Recommandé en cas d'arthrose.").ok).toBe(false);
  });

  it("signale les promesses de résultat", () => {
    expect(checkEthicalCompliance("Résultats garantis dès la première séance !").ok).toBe(false);
    expect(checkEthicalCompliance("Une méthode 100 % efficace.").ok).toBe(false);
    expect(checkEthicalCompliance("Efficace contre le stress.").ok).toBe(false);
  });

  it("ne signale pas le vocabulaire bien-être légitime", () => {
    const ok = checkEthicalCompliance(
      "Je vous accompagne pour favoriser la détente et contribuer à votre équilibre. " +
        "Un décor soigné, préparé soigneusement. Cette pratique ne se substitue pas à un avis médical.",
    );
    expect(ok.ok).toBe(true);
    expect(ok.violations).toHaveLength(0);
  });

  it("vérifie récursivement les structures", () => {
    const r = checkEthicalComplianceDeep({
      sections: [{ title: "OK", items: [{ answer: "Ce soin guérit tout." }] }],
    });
    expect(r.ok).toBe(false);
  });
});
