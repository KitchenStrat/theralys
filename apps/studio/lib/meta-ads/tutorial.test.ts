import { describe, expect, it } from "vitest";
import { META_TUTORIAL, metaTutorial } from "@/app/(app)/meta-ads/tutorial";

const textOf = (steps: { title: string; summary: string; items: string[]; note?: string }[]): string =>
  steps.map((step) => [step.title, step.summary, ...step.items, step.note ?? ""].join("\n")).join("\n");

/** Ce qui suppose le site Harmony : formulaire du studio, éditeur, suffixe d'adresse lu par le site, bloc Résultats. */
const HOSTED_ONLY = /formulaire|éditeur|site Harmony|src=meta|bloc « Résultats »|collez-le dans/;

describe("metaTutorial — variante du tuto selon le site où mènent les annonces", () => {
  it("site Harmony : les étapes d'origine, telles quelles", () => {
    expect(metaTutorial(false)).toBe(META_TUTORIAL);
    const text = textOf(metaTutorial(false));
    expect(text).toContain("votre site Harmony charge le Pixel et envoie les événements, vous n'avez aucun code à poser");
    expect(text).toContain("avec le suffixe ?src=meta — le bouton Copier l'URL l'ajoute déjà");
    expect(text).toContain("mesurés par votre site grâce au suffixe ?src=meta des annonces");
  });

  it("site du client : mêmes étapes dans le même ordre, seules celles qui supposent le site Harmony changent", () => {
    const external = metaTutorial(true);
    expect(external.map((step) => step.id)).toEqual(META_TUTORIAL.map((step) => step.id));
    const changed = external.filter((step, index) => step !== META_TUTORIAL[index]).map((step) => step.id);
    expect(changed).toEqual(["pixel", "evenements", "campagne", "audience", "annonces", "videos", "resultats"]);
    // « l'étape 2 », « l'étape 3 » et « l'étape 4 », citées dans les variantes, désignent toujours le Pixel, sa vérification et la campagne
    expect(external.slice(1, 4).map((step) => step.id)).toEqual(["pixel", "evenements", "campagne"]);
    // Les blocs de données à coller restent attachés aux mêmes étapes
    expect(external.map((step) => step.copy)).toEqual(META_TUTORIAL.map((step) => step.copy));
  });

  it("site du client : plus rien ne renvoie au formulaire, à l'éditeur, au suffixe ?src=meta ni au bloc Résultats", () => {
    expect(textOf(metaTutorial(true))).not.toMatch(HOSTED_ONLY);
    // Garde-fou du test lui-même : ces formulations existent bien dans le tuto du site Harmony
    expect(textOf(META_TUTORIAL)).toMatch(HOSTED_ONLY);
  });

  it("site du client : le Pixel s'installe sur son site, avec un bandeau cookies, et se contrôle chez Meta", () => {
    const [, pixel, events, campaign, , , ads] = metaTutorial(true);
    const pixelText = textOf(pixel ? [pixel] : []);
    expect(pixelText).toContain("Harmony n'héberge pas ce site");
    expect(pixelText).toContain("avec le réglage Meta ou Facebook de l'outil qui a servi à créer votre site");
    expect(pixelText).toContain("le Pixel ne doit se charger qu'après l'accord du visiteur");
    expect(pixelText).toContain("depuis « Mon site »");
    expect(textOf(events ? [events] : [])).toContain("seul le Gestionnaire d'événements le montre");
    // Sans Pixel ni événement, le tuto ne promet pas de conversions : objectif Trafic
    expect(textOf(campaign ? [campaign] : [])).toContain("choisissez l'objectif « Trafic »");
    // L'adresse se colle telle quelle : aucun suffixe à ajouter
    expect(textOf(ads ? [ads] : [])).toContain("telle quelle, sans rien y ajouter");
  });
});
