import { describe, expect, it } from "vitest";
import {
  LANDING_UNAVAILABLE,
  analysisSiteNotice,
  analysisSiteOf,
  currentSiteMode,
  landingDisplay,
  landingHref,
  landingPathOf,
  type AdsSiteSources,
} from "./analysis-site";

const HOSTED_SITE = {
  domain: "claire.harmony-web.fr",
  pages: [{ path: "/" }, { path: "/motifs/gestion-du-stress", slug: "gestion-du-stress" }, { path: "/motifs/sommeil", slug: "sommeil" }],
};
/** Site du client : chemins réels, sans rapport avec l'identifiant de la spécialité */
const OWN_SITE = {
  domain: "www.claire-sophrologie.fr",
  pages: [{ path: "/" }, { path: "/accompagnements/stress", slug: "gestion-du-stress" }, { path: "/sommeil?lang=fr", slug: "troubles-du-sommeil" }],
};

const HOSTED_ONLY: AdsSiteSources = { hosted: HOSTED_SITE, external: null };
const OWN_CONNECTED: AdsSiteSources = { hosted: HOSTED_SITE, external: OWN_SITE };

describe("analysisSiteOf — à quel site se rapporte une analyse", () => {
  it("le site du moment est celui du client dès qu'il est la référence, sinon le site Harmony", () => {
    expect(currentSiteMode(HOSTED_ONLY)).toBe("hosted");
    expect(currentSiteMode(OWN_CONNECTED)).toBe("external");
  });

  it("bilan du site Harmony, site Harmony en référence : adresse et pages du site Harmony, rien à signaler", () => {
    expect(analysisSiteOf({}, HOSTED_ONLY)).toEqual({ mode: "hosted", domain: "claire.harmony-web.fr", pages: HOSTED_SITE.pages, outdated: false });
    expect(analysisSiteOf({ externalSite: false }, HOSTED_ONLY).mode).toBe("hosted");
  });

  it("bilan du site du client (externalSite), ce site en référence : son adresse et ses pages", () => {
    expect(analysisSiteOf({ externalSite: true }, OWN_CONNECTED)).toEqual({ mode: "external", domain: "www.claire-sophrologie.fr", pages: OWN_SITE.pages, outdated: false });
  });

  it("site connecté depuis l'analyse : le bilan reste celui du site Harmony, avec son adresse — jamais celle du site du client", () => {
    const site = analysisSiteOf({}, OWN_CONNECTED);
    expect(site).toEqual({ mode: "hosted", domain: "claire.harmony-web.fr", pages: HOSTED_SITE.pages, outdated: true });
    expect(landingDisplay(site, "/motifs/sommeil")).toBe("claire.harmony-web.fr/motifs/sommeil");
  });

  it("site retiré depuis l'analyse : l'adresse du site du client n'est plus connue, celle du site Harmony ne la remplace pas", () => {
    const site = analysisSiteOf({ externalSite: true }, HOSTED_ONLY);
    expect(site).toEqual({ mode: "external", domain: null, pages: [], outdated: true });
    expect(landingDisplay(site, "/accompagnements/stress")).toBeNull();
    expect(landingHref(site, "/accompagnements/stress")).toBeNull();
  });

  it("aucune analyse aboutie : le site du moment, sans écart", () => {
    expect(analysisSiteOf(null, HOSTED_ONLY)).toMatchObject({ mode: "hosted", domain: "claire.harmony-web.fr", outdated: false });
    expect(analysisSiteOf(undefined, OWN_CONNECTED)).toMatchObject({ mode: "external", domain: "www.claire-sophrologie.fr", outdated: false });
  });
});

describe("chemins et adresses d'atterrissage d'un plan enregistré", () => {
  const hosted = analysisSiteOf({}, HOSTED_ONLY);
  const own = analysisSiteOf({ externalSite: true }, OWN_CONNECTED);

  it("site Harmony : l'ancien chemin « /<slug> » est montré sous « /motifs/<slug> », l'adresse qui fonctionne", () => {
    expect(landingPathOf(hosted, "/gestion-du-stress")).toBe("/motifs/gestion-du-stress");
    expect(landingPathOf(hosted, "/Sommeil/")).toBe("/motifs/sommeil");
    expect(landingDisplay(hosted, "/gestion-du-stress")).toBe("claire.harmony-web.fr/motifs/gestion-du-stress");
    expect(landingHref(hosted, "/sommeil")).toBe("https://claire.harmony-web.fr/motifs/sommeil");
  });

  it("site Harmony : un chemin déjà correct et l'accueil sont rendus tels quels", () => {
    expect(landingPathOf(hosted, "/motifs/sommeil")).toBe("/motifs/sommeil");
    expect(landingDisplay(hosted, "/")).toBe("claire.harmony-web.fr/");
    expect(landingHref(hosted, "/")).toBe("https://claire.harmony-web.fr/");
  });

  it("page disparue depuis, ou chemin qui n'a jamais été une page : l'accueil", () => {
    expect(landingPathOf(hosted, "/hypnose")).toBe("/");
    expect(landingPathOf(hosted, "/motifs/hypnose")).toBe("/");
    expect(landingPathOf(own, "/ancienne-page")).toBe("/");
    expect(landingPathOf({ pages: [] }, "/sommeil")).toBe("/");
  });

  it("site du client : le chemin réel de la page, casse et paramètres conservés, sous son propre domaine", () => {
    expect(landingPathOf(own, "/Accompagnements/Stress/")).toBe("/accompagnements/stress");
    expect(landingDisplay(own, "/sommeil?lang=fr")).toBe("www.claire-sophrologie.fr/sommeil?lang=fr");
    expect(landingHref(own, "/accompagnements/stress")).toBe("https://www.claire-sophrologie.fr/accompagnements/stress");
    expect(landingHref(own, "/")).toBe("https://www.claire-sophrologie.fr/");
  });

  it("site du client servi sous un chemin : les pages s'y accolent", () => {
    const prefixed = { domain: "www.maison-de-sante.fr/claire", pages: [{ path: "/" }, { path: "/sommeil", slug: "sommeil" }] };
    expect(landingDisplay(prefixed, "/sommeil")).toBe("www.maison-de-sante.fr/claire/sommeil");
    expect(landingHref(prefixed, "/")).toBe("https://www.maison-de-sante.fr/claire/");
  });
});

describe("analysisSiteNotice — analyse préparée pour un autre site", () => {
  const subject = "le diagnostic, le plan d'action et les pages d'atterrissage";

  it("rien à dire tant que l'analyse et la référence parlent du même site", () => {
    expect(analysisSiteNotice(analysisSiteOf({}, HOSTED_ONLY), { subject })).toBeNull();
    expect(analysisSiteNotice(analysisSiteOf({ externalSite: true }, OWN_CONNECTED), { subject })).toBeNull();
    expect(analysisSiteNotice(analysisSiteOf(null, OWN_CONNECTED), { subject })).toBeNull();
  });

  it("site connecté depuis : invite à relancer l'analyse et dit que les adresses restent celles du site Harmony", () => {
    const notice = analysisSiteNotice(analysisSiteOf({}, OWN_CONNECTED), { subject, currentAddress: "www.claire-sophrologie.fr" });
    expect(notice).toEqual({
      title: "Cette analyse a été préparée pour votre site Harmony.",
      detail:
        "Depuis, vos outils s'appuient sur votre propre site (www.claire-sophrologie.fr). Relancez l'analyse pour que le diagnostic, le plan d'action et les pages d'atterrissage correspondent à ce site. En attendant, les adresses affichées ici restent celles de votre site Harmony.",
    });
    // Sans adresse connue, la phrase reste correcte
    expect(analysisSiteNotice(analysisSiteOf({}, OWN_CONNECTED), { subject })?.detail).toContain("sur votre propre site. Relancez l'analyse");
  });

  it("site retiré depuis : invite à relancer l'analyse et dit que les adresses ne sont plus affichées", () => {
    const notice = analysisSiteNotice(analysisSiteOf({ externalSite: true }, HOSTED_ONLY), { subject: "le diagnostic, les annonces et les pages d'atterrissage" });
    expect(notice).toEqual({
      title: "Cette analyse a été préparée pour votre propre site.",
      detail:
        "Depuis, vos outils ne s'appuient plus sur ce site. Relancez l'analyse pour que le diagnostic, les annonces et les pages d'atterrissage correspondent à votre site Harmony. En attendant, les adresses des pages d'atterrissage ne sont pas affichées.",
    });
  });

  it("le texte affiché à la place d'une adresse inconnue invite lui aussi à relancer l'analyse", () => {
    expect(LANDING_UNAVAILABLE).toContain("relançant l'analyse");
  });
});
