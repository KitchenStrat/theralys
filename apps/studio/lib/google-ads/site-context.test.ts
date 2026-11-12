import { describe, expect, it } from "vitest";
import type { ExternalReference } from "@theralys/jobs";
import { EMPTY_EXTERNAL_FACTS, EMPTY_EXTERNAL_PROFILE, type PageSections } from "@theralys/shared";
import { analysisSiteOf } from "./analysis-site";
import { adsSiteContextFrom, siteDomainOf, type HostedMotifRow } from "./site-context";

const SECTIONS: PageSections = [{ type: "richText", body: "Texte de la page." }];

const MOTIFS: HostedMotifRow[] = [
  { slug: "sommeil", title: "Sommeil et récupération", sections: SECTIONS, position: 2 },
  { slug: "gestion-du-stress", title: "Gestion du stress", sections: SECTIONS, position: 1 },
  { slug: "confiance-en-soi", title: "Confiance en soi", sections: SECTIONS, position: 3 },
  { slug: "page-vide", title: "Page jamais générée", sections: [], position: 4 },
];

const SITE = { type: "demo" as const, plan: "scale" as const, theme: { preset: "sauge" as const, fontPreset: "moderne" as const, disabledMotifs: ["confiance-en-soi"] } };

const HOSTED_URL = "https://demo.harmony-web.fr/claire-dupont";

const REFERENCE: ExternalReference = {
  setting: { url: "https://www.claire-sophrologie.fr", active: true },
  source: "crawl",
  measureSeenAt: null,
  profile: {
    ...EMPTY_EXTERNAL_PROFILE,
    headline: "Sophrologue à Albi",
    specialties: [
      { slug: "gestion-du-stress", title: "Gestion du stress", excerpt: "", url: "https://www.claire-sophrologie.fr/accompagnements/stress", headings: [], faq: [] },
      { slug: "sommeil", title: "Sommeil", excerpt: "", headings: [], faq: [] },
    ],
  },
  facts: { ...EMPTY_EXTERNAL_FACTS, cms: "wix", tags: { googleAdsId: "AW-1234567890", consentBanner: true } },
};

describe("siteDomainOf", () => {
  it("retire le protocole et la barre finale, garde le chemin sous lequel le site est servi", () => {
    expect(siteDomainOf("https://www.claire-sophrologie.fr/")).toBe("www.claire-sophrologie.fr");
    expect(siteDomainOf("http://localhost:3000/claire-dupont")).toBe("localhost:3000/claire-dupont");
    expect(siteDomainOf(HOSTED_URL)).toBe("demo.harmony-web.fr/claire-dupont");
  });
});

describe("adsSiteContextFrom", () => {
  it("site Harmony seul : accueil puis pages de spécialité en ligne sous « /motifs/<slug> », dans l'ordre du site", () => {
    const context = adsSiteContextFrom({ site: SITE, hostedUrl: HOSTED_URL, referenceUrl: HOSTED_URL, motifRows: MOTIFS, reference: null });
    expect(context.externalTracking).toBeNull();
    expect(context.sources.external).toBeNull();
    expect(context.sources.hosted).toEqual({
      domain: "demo.harmony-web.fr/claire-dupont",
      // « confiance-en-soi » est désactivée, « page-vide » n'a aucune section : ni l'une ni l'autre n'est en ligne
      pages: [{ path: "/" }, { path: "/motifs/gestion-du-stress", slug: "gestion-du-stress" }, { path: "/motifs/sommeil", slug: "sommeil" }],
    });
  });

  it("site du client en référence : son adresse, ses pages réelles et le relevé de sa dernière lecture — le site Harmony reste décrit", () => {
    const context = adsSiteContextFrom({ site: SITE, hostedUrl: HOSTED_URL, referenceUrl: "https://www.claire-sophrologie.fr", motifRows: MOTIFS, reference: REFERENCE });
    expect(context.sources.hosted.domain).toBe("demo.harmony-web.fr/claire-dupont");
    expect(context.sources.external).toEqual({
      domain: "www.claire-sophrologie.fr",
      // La spécialité sans page à elle (« sommeil ») n'est pas une page d'atterrissage
      pages: [{ path: "/" }, { path: "/accompagnements/stress", slug: "gestion-du-stress" }],
    });
    expect(context.externalTracking).toEqual({
      address: "www.claire-sophrologie.fr",
      cms: "wix",
      googleAdsTag: true,
      tagManager: false,
      metaPixel: false,
      consentBanner: true,
      measureSnippet: false,
      codeRead: true,
    });
    // Texte collé, visites déjà reçues : le relevé le dit
    const pasted = adsSiteContextFrom({ site: SITE, hostedUrl: HOSTED_URL, referenceUrl: "https://www.claire-sophrologie.fr", motifRows: MOTIFS, reference: { ...REFERENCE, source: "pasted", measureSeenAt: new Date("2026-11-12T09:00:00Z") } });
    expect(pasted.externalTracking).toMatchObject({ codeRead: false, measureSnippet: true });
  });

  it("une analyse du site Harmony garde l'adresse du site Harmony après la connexion du site du client, et inversement", () => {
    const connected = adsSiteContextFrom({ site: SITE, hostedUrl: HOSTED_URL, referenceUrl: "https://www.claire-sophrologie.fr", motifRows: MOTIFS, reference: REFERENCE });
    expect(analysisSiteOf({}, connected.sources)).toMatchObject({ mode: "hosted", domain: "demo.harmony-web.fr/claire-dupont", outdated: true });
    expect(analysisSiteOf({ externalSite: true }, connected.sources)).toMatchObject({ mode: "external", domain: "www.claire-sophrologie.fr", outdated: false });
    const hostedOnly = adsSiteContextFrom({ site: SITE, hostedUrl: HOSTED_URL, referenceUrl: HOSTED_URL, motifRows: MOTIFS, reference: null });
    expect(analysisSiteOf({ externalSite: true }, hostedOnly.sources)).toMatchObject({ mode: "external", domain: null, outdated: true });
  });
});
