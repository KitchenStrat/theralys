import { describe, expect, it } from "vitest";
import { ADS_TUTORIAL, adsTutorial } from "@/app/(app)/google-ads/tutorial";

const textOf = (steps: { title: string; summary: string; items: string[]; note?: string }[]): string =>
  steps.map((step) => [step.title, step.summary, ...step.items, step.note ?? ""].join("\n")).join("\n");

/** Ce qui suppose le site Harmony : formulaire du studio, éditeur, bloc Résultats, balise chargée par le site. */
const HOSTED_ONLY = /formulaire|éditeur|site Harmony|bloc « Résultats »|le site charge la balise/;

describe("adsTutorial — variante du tuto selon le site où mènent les annonces", () => {
  it("site Harmony : les étapes d'origine, telles quelles", () => {
    expect(adsTutorial(false)).toBe(ADS_TUTORIAL);
    const text = textOf(adsTutorial(false));
    expect(text).toContain("votre site Harmony envoie les clics après consentement");
    expect(text).toContain("Collez l'identifiant AW-… et les 3 libellés dans le formulaire « Suivi des conversions » ci-dessous");
    expect(text).toContain("le bloc « Résultats » affiche les visites, clics RDV et appels venus des annonces");
  });

  it("site du client : mêmes étapes dans le même ordre, seules celles qui supposent le site Harmony changent", () => {
    const external = adsTutorial(true);
    expect(external.map((step) => step.id)).toEqual(ADS_TUTORIAL.map((step) => step.id));
    const changed = external.filter((step, index) => step !== ADS_TUTORIAL[index]).map((step) => step.id);
    expect(changed).toEqual(["conversions", "appels", "checklist"]);
    // « l'étape 9 » et « l'étape 8 », citées dans les variantes, désignent toujours la mesure des conversions et le budget
    expect(external[8]?.id).toBe("conversions");
    expect(external[7]?.id).toBe("budget");
    // Le bloc sous le tuto reste annoncé par l'étape des conversions
    expect(external[8]?.copy).toBe("tracking");
  });

  it("site du client : plus rien ne renvoie au formulaire, à l'éditeur ni au bloc Résultats", () => {
    expect(textOf(adsTutorial(true))).not.toMatch(HOSTED_ONLY);
    // Garde-fou du test lui-même : ces formulations existent bien dans le tuto du site Harmony
    expect(textOf(ADS_TUTORIAL)).toMatch(HOSTED_ONLY);
  });

  it("site du client : la balise s'installe sur son site, avec un bandeau cookies, et se contrôle dans Google Ads", () => {
    const conversions = adsTutorial(true)[8];
    const text = textOf(conversions ? [conversions] : []);
    expect(text).toContain("Harmony n'héberge pas ce site");
    expect(text).toContain("« Clic sur le lien de rendez-vous »");
    expect(text).toContain("« Clic sur le numéro de téléphone »");
    expect(text).toContain("avec le réglage Google de l'outil qui a servi à créer votre site, ou avec Google Tag Manager");
    expect(text).toContain("une balise publicitaire ne doit se charger qu'après l'accord du visiteur");
    expect(text).toContain("depuis « Mon site »");
    expect(text).toContain("seul votre compte Google Ads le montre");
    // Rien n'est promis : ces actions comptent des clics, pas des rendez-vous
    expect(text).toContain("pas des rendez-vous pris ni des appels aboutis");
  });
});
