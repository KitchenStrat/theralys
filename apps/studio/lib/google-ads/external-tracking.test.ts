import { describe, expect, it } from "vitest";
import { EXTERNAL_CMS, EXTERNAL_SITE_CHECK_DETAILS } from "@theralys/shared";
import {
  ADS_BANNER_UNKNOWN,
  ADS_RESULTS_ACCOUNT,
  EXTERNAL_RESULTS,
  READING_LIMIT,
  REREAD_REMINDER,
  externalSiteTracking,
  ADS_BANNER_UNREAD,
  googleAdsFindings,
  tagInstallAdvice,
  tagInstallIntro,
  type ExternalSiteTracking,
} from "./external-tracking";

const NOTHING: ExternalSiteTracking = { address: "www.claire-sophrologie.fr", cms: null, googleAdsTag: false, tagManager: false, metaPixel: false, consentBanner: false, measureSnippet: false, codeRead: true };

describe("externalSiteTracking", () => {
  it("relève ce que la dernière lecture a repéré ; un identifiant vide ne compte pas", () => {
    expect(externalSiteTracking("www.claire-sophrologie.fr", { tags: {} })).toEqual(NOTHING);
    expect(
      externalSiteTracking("www.claire-sophrologie.fr", {
        cms: "wordpress",
        tags: { googleAdsId: "AW-1234567890", googleTagManagerId: " ", metaPixelId: "1234567890123456", consentBanner: true, measureSnippet: true },
      }),
    ).toEqual({ address: "www.claire-sophrologie.fr", cms: "wordpress", googleAdsTag: true, tagManager: false, metaPixel: true, consentBanner: true, measureSnippet: true, codeRead: true });
  });

  it("code de mesure : en place dès qu'une visite a été reçue, même si la lecture du code ne l'a pas repéré", () => {
    // Balise posée depuis la dernière lecture, ou par un outil que la lecture ne voit pas : les visites reçues font foi
    expect(externalSiteTracking("www.claire-sophrologie.fr", { tags: {} }, { measureSeenAt: new Date("2026-11-12T09:00:00Z") }).measureSnippet).toBe(true);
    expect(externalSiteTracking("www.claire-sophrologie.fr", { tags: {} }, { measureSeenAt: null }).measureSnippet).toBe(false);
    expect(externalSiteTracking("www.claire-sophrologie.fr", { tags: { measureSnippet: true } }, { measureSeenAt: null }).measureSnippet).toBe(true);
  });

  it("texte collé par le praticien : le code des pages n'a jamais été lu", () => {
    expect(externalSiteTracking("www.claire-sophrologie.fr", { tags: {} }, { source: "pasted" }).codeRead).toBe(false);
    expect(externalSiteTracking("www.claire-sophrologie.fr", { tags: {} }, { source: "crawl" }).codeRead).toBe(true);
  });
});

describe("googleAdsFindings — relevé affiché à la place du formulaire de suivi", () => {
  it("rien de repéré : balise à installer, bandeau et conversions à vérifier — avec les textes du diagnostic", () => {
    expect(googleAdsFindings(NOTHING)).toEqual([
      { id: "tag", label: "Balise Google Ads sur le site", status: "todo", detail: EXTERNAL_SITE_CHECK_DETAILS.adsTagTodo },
      { id: "consent", label: "Bandeau cookies", status: "unknown", detail: ADS_BANNER_UNKNOWN },
      { id: "conversions", label: "Conversions mesurées", status: "unknown", detail: EXTERNAL_SITE_CHECK_DETAILS.conversionsUnknown },
    ]);
  });

  it("code du site jamais lu : rien n'est dit « à installer » — balise et bandeau inconnus, avec leurs propres textes", () => {
    expect(googleAdsFindings({ ...NOTHING, codeRead: false })).toEqual([
      { id: "tag", label: "Balise Google Ads sur le site", status: "unknown", detail: EXTERNAL_SITE_CHECK_DETAILS.adsTagUnread },
      { id: "consent", label: "Bandeau cookies", status: "unknown", detail: ADS_BANNER_UNREAD },
      { id: "conversions", label: "Conversions mesurées", status: "unknown", detail: EXTERNAL_SITE_CHECK_DETAILS.conversionsUnknown },
    ]);
  });

  it("balise et bandeau repérés ; les conversions restent invérifiables depuis le site", () => {
    const findings = googleAdsFindings({ ...NOTHING, googleAdsTag: true, consentBanner: true });
    expect(findings.map((f) => f.status)).toEqual(["ok", "ok", "unknown"]);
    expect(findings[0]?.detail).toBe(EXTERNAL_SITE_CHECK_DETAILS.adsTagOk);
    expect(findings[1]?.detail).toBe(EXTERNAL_SITE_CHECK_DETAILS.cookieBannerOk);
  });

  it("Google Tag Manager seul : la balise peut passer par lui, comme dans le diagnostic", () => {
    const [tag] = googleAdsFindings({ ...NOTHING, tagManager: true });
    expect(tag).toMatchObject({ status: "ok", detail: EXTERNAL_SITE_CHECK_DETAILS.tagManagerOk });
  });

  it("le rappel renvoie à « Mon site » et la limite de la lecture au compte publicitaire : rien n'est promis", () => {
    expect(REREAD_REMINDER).toContain("« Mon site »");
    expect(READING_LIMIT).toContain("votre compte publicitaire");
    expect(ADS_BANNER_UNKNOWN).toContain("après l'accord du visiteur");
  });
});

describe("tagInstallAdvice — où installer la balise selon l'outil du site", () => {
  it("chaque outil reconnu a un conseil, pour la balise Google comme pour le Pixel Meta", () => {
    for (const cms of EXTERNAL_CMS) {
      for (const tag of ["google", "meta"] as const) {
        const advice = tagInstallAdvice(cms, tag);
        expect(advice.tool).not.toBeNull();
        expect(advice.text.length).toBeGreaterThan(40);
        expect(advice.text).toContain(tag === "google" ? "balise Google" : "Pixel Meta");
      }
    }
  });

  it("Wix : la balise ne passe pas par le « Code personnalisé », mais par les intégrations marketing", () => {
    expect(tagInstallAdvice("wix", "google")).toEqual({
      tool: "Wix",
      possible: true,
      text: "Sur Wix, la balise Google ne fonctionne pas une fois collée dans le « Code personnalisé » : connectez-la depuis les « Intégrations marketing » de votre tableau de bord Wix.",
    });
    expect(tagInstallAdvice("wix", "meta").text).toBe(
      "Sur Wix, le Pixel Meta ne fonctionne pas une fois collé dans le « Code personnalisé » : connectez-le depuis les « Intégrations marketing » de votre tableau de bord Wix.",
    );
  });

  it("Google Sites : l'installation n'est pas possible, et le conseil dit quoi faire à la place", () => {
    const google = tagInstallAdvice("google_sites", "google");
    expect(google.possible).toBe(false);
    expect(google.text).toContain("la balise Google ne peut pas y être installée");
    expect(google.text).toContain("suivez-les alors sur les clics");
    const meta = tagInstallAdvice("google_sites", "meta");
    expect(meta.possible).toBe(false);
    expect(meta.text).toContain("le Pixel Meta ne peut pas y être installé.");
    expect(meta.text).toContain("objectif « Trafic »");
  });

  it("outil non reconnu : conseil général, et l'introduction le dit", () => {
    const advice = tagInstallAdvice(null, "google");
    expect(advice).toMatchObject({ tool: null, possible: true });
    expect(advice.text).toContain("Si quelqu'un s'occupe de votre site, transmettez-lui le code de la balise Google.");
    expect(tagInstallIntro(advice)).toBe("Nous n'avons pas reconnu l'outil qui a servi à créer votre site.");
    expect(tagInstallIntro(tagInstallAdvice("squarespace", "meta"))).toBe("Votre site semble créé avec Squarespace.");
  });

  it("aucun conseil ne renvoie vers l'éditeur ni vers un réglage du studio", () => {
    for (const cms of [...EXTERNAL_CMS, null]) {
      for (const tag of ["google", "meta"] as const) expect(tagInstallAdvice(cms, tag).text).not.toMatch(/éditeur|studio|Harmony/i);
    }
  });
});

describe("bloc Résultats du site du client", () => {
  it("dit pourquoi les visites ne sont pas rattachées aux annonces et où lire chaque chiffre", () => {
    expect(EXTERNAL_RESULTS.reason).toContain("sans l'accord de vos visiteurs");
    expect(EXTERNAL_RESULTS.site).toContain("l'accueil du studio");
    expect(EXTERNAL_RESULTS.measureMissing).toContain("« Mon site »");
    expect(ADS_RESULTS_ACCOUNT).toContain("votre compte Google Ads");
  });
});
