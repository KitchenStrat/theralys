import { describe, expect, it } from "vitest";
import { ESTIMATE_BOUNDS, buildEstimate, checkEstimateInput, estimateEmail, estimateLeadNotes, estimateSentence, roiComparison, roiFigures } from "./estimate";
import { PLAN_COMPLETE, PLAN_SITE, planPrice } from "./plans";

/** Espaces insécables (fine ou non) ramenées à l'espace : les montants se comparent en clair. */
const plain = (text: string) => text.replace(new RegExp(`[${String.fromCharCode(160)}${String.fromCharCode(8239)}]`, "g"), " ");

const INPUT = { price: 60, patients: 10, sessions: 3, choice: "both", period: "annual" } as const;

describe("simulateur de rentabilité : le calcul", () => {
  it("revenu, seuil de rentabilité et rapport au prix de l'abonnement", () => {
    expect(roiFigures(60, 10, 3, 99)).toEqual({ revenue: 1800, breakEven: 2, ratio: 1800 / 99 });
    // Le seuil est d'au moins une séance, et s'arrondit toujours à la séance supérieure
    expect(roiFigures(150, 1, 1, 59).breakEven).toBe(1);
    expect(roiFigures(30, 1, 1, 61).breakEven).toBe(3);
  });

  it("le rapport se dit en clair", () => {
    expect(roiComparison(18.2)).toBe("environ 18 fois");
    expect(roiComparison(1.5)).toBe("environ 2 fois");
    expect(roiComparison(1.2)).toBe("plus que");
    expect(roiComparison(0.6)).toBe("moins que");
  });

  it("le prix vient de la définition des formules, sur la durée choisie", () => {
    const estimate = buildEstimate(INPUT);
    expect(estimate).toMatchObject({ planLabel: "Site + Scale", monthlyCost: planPrice(PLAN_COMPLETE, "annual"), periodPhrase: "en annuel", revenue: 1800 });
    expect(buildEstimate({ ...INPUT, choice: "site", period: "monthly" })).toMatchObject({ planLabel: "Site", monthlyCost: planPrice(PLAN_SITE, "monthly"), periodPhrase: "en mensuel" });
    expect(estimate!.breakEven).toBe(Math.ceil(estimate!.monthlyCost / 60));
  });
});

describe("simulateur : hypothèses venues du navigateur", () => {
  it("acceptées quand chaque valeur est une position de son curseur", () => {
    expect(checkEstimateInput(INPUT)).toEqual(INPUT);
    expect(checkEstimateInput({ ...INPUT, price: ESTIMATE_BOUNDS.price.max, patients: ESTIMATE_BOUNDS.patients.max, sessions: ESTIMATE_BOUNDS.sessions.min })).not.toBeNull();
  });

  it("refusées hors bornes, hors pas, ou avec une formule ou une durée inconnue", () => {
    for (const wrong of [
      { price: 25 },
      { price: 62 },
      { price: 155 },
      { price: "60" },
      { patients: 0 },
      { patients: 41 },
      { patients: 2.5 },
      { sessions: 11 },
      { choice: "premium" },
      { period: "weekly" },
    ]) {
      expect(checkEstimateInput({ ...INPUT, ...wrong }), JSON.stringify(wrong)).toBeNull();
    }
    expect(checkEstimateInput(null)).toBeNull();
    expect(checkEstimateInput("60")).toBeNull();
  });
});

describe("simulateur : l'estimation envoyée", () => {
  const estimate = buildEstimate(INPUT)!;
  const cost = estimate.monthlyCost.toLocaleString("fr-FR");

  it("la phrase de synthèse s'accorde au nombre de patients", () => {
    expect(estimateSentence(estimate)).toBe(`Avec ces hypothèses, 10 nouveaux patients par mois représentent environ ${Math.round(estimate.ratio)} fois le prix de l'abonnement.`);
    expect(estimateSentence(buildEstimate({ ...INPUT, patients: 1, sessions: 1, price: 30 })!)).toMatch(/^Avec ces hypothèses, 1 nouveau patient par mois représente moins que le prix/);
  });

  it("l'e-mail reprend les hypothèses, le calcul, la mise en garde et le lien vers la démo", () => {
    const mail = estimateEmail(estimate, "https://www.harmony-web.fr/");
    expect(mail.subject).toBe(`Votre estimation Harmony : couvert dès ${estimate.breakEven} séances par mois`);
    const text = plain(mail.text);
    expect(text).toContain("- Tarif de votre séance : 60 €");
    expect(text).toContain("- Nouveaux patients venus d'internet : 10 par mois");
    expect(text).toContain("- Séances par patient : 3 en moyenne");
    expect(text).toContain("- Ce que ces patients représentent : 1 800 € par mois");
    expect(text).toContain(`- Votre abonnement Harmony (Site + Scale, en annuel) : ${cost} € par mois`);
    expect(text).toContain(`- L'abonnement est couvert dès : ${estimate.breakEven} séances par mois`);
    expect(text).toContain("Harmony ne promet pas un nombre de patients");
    expect(text).toContain("https://www.harmony-web.fr/#demo");
    // La version mise en forme dit la même chose, et ne porte qu'un lien : la demande de démo
    const html = plain(mail.html);
    expect(html).toContain("1 800 € par mois");
    expect(html).toContain(estimateSentence(estimate));
    expect(html.match(/href="([^"]+)"/g)).toEqual(['href="https://www.harmony-web.fr/#demo"']);
    expect(html).not.toMatch(/<script|javascript:/i);
  });

  it("le CRM retient l'estimation en une phrase", () => {
    expect(plain(estimateLeadNotes(estimate))).toBe(
      `Estimation du simulateur : séance à 60 €, 10 nouveaux patients par mois, 3 séances par patient — 1 800 € par mois face à un abonnement Site + Scale en annuel à ${cost} €, couvert dès ${estimate.breakEven} séances.`,
    );
  });
});
