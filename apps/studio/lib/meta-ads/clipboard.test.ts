import { describe, expect, it } from "vitest";
import { META_ADS_LANDING_SUFFIX, type MetaAdCreative, type MetaAdsPlan, type MetaVideoBrief } from "@theralys/shared";
import { ctaLabel, formatMetaLines, landingUrl, metaCreativeTxt, metaLandingPages, metaLandingSuffix, metaLandingUrl, metaVideoScriptTxt, type MetaLanding } from "./clipboard";

const CREATIVE: MetaAdCreative = {
  id: "c1",
  angle: "reassurance",
  name: "Réassurance",
  primaryText: "Prendre un moment pour soi, c'est déjà un premier pas.",
  headline: "Sophrologie à Albi",
  description: "Rendez-vous en ligne",
  cta: "BOOK_NOW",
  hook: "Un temps pour souffler",
  subline: "Séances à Albi",
  photoId: "p1",
  template: "photo-titre",
  accentRole: "primary",
  altText: "Photo du cabinet",
  landingPath: "/gestion-du-stress",
};

/** Site Harmony : pages de spécialité sous « /motifs/<slug> », suffixe de provenance du plan */
const HOSTED: MetaLanding = {
  site: {
    domain: "claire.harmony-web.fr",
    pages: [{ path: "/" }, { path: "/motifs/gestion-du-stress", slug: "gestion-du-stress" }, { path: "/motifs/sommeil", slug: "sommeil" }],
  },
  suffix: META_ADS_LANDING_SUFFIX,
};

/** Site du client : chemins réels de ses pages, aucun suffixe (le plan n'en porte pas) */
const EXTERNAL: MetaLanding = {
  site: {
    domain: "www.claire-sophrologie.fr",
    pages: [{ path: "/" }, { path: "/accompagnements/stress", slug: "gestion-du-stress" }, { path: "/sommeil?lang=fr", slug: "sommeil" }],
  },
  suffix: "",
};

/** Analyse du site du client qui n'est plus la référence : son adresse n'est plus connue */
const UNKNOWN: MetaLanding = { site: { domain: null, pages: [] }, suffix: "" };

const planWith = (landingSuffix?: string): Pick<MetaAdsPlan, "campaign"> => ({
  campaign: {
    name: "Meta – Albi",
    geo: { city: "Albi", radiusKm: 15, note: "" },
    ages: { min: 25, max: 65 },
    gender: "all",
    placements: "Advantage+",
    language: "fr",
    schedule: "En continu",
    ...(landingSuffix === undefined ? {} : { landingSuffix }),
  },
});

describe("formatMetaLines", () => {
  it("une ligne par texte, espaces repliés, vides et doublons retirés", () => {
    expect(formatMetaLines(["Un temps  pour souffler", "", " un temps pour souffler ", "Et si vous essayiez ?"])).toBe("Un temps pour souffler\nEt si vous essayiez ?");
  });
});

describe("metaLandingSuffix", () => {
  it("suit ce que dit le plan : le suffixe qu'il porte, y compris vide", () => {
    expect(metaLandingSuffix(planWith("?src=meta"), false)).toBe("?src=meta");
    expect(metaLandingSuffix(planWith("?utm_source=meta"), false)).toBe("?utm_source=meta");
    expect(metaLandingSuffix(planWith(""), false)).toBe("");
    // Le plan décide, même pour le site du client
    expect(metaLandingSuffix(planWith("?src=meta"), true)).toBe("?src=meta");
  });

  it("plan muet ou absent : le suffixe habituel pour le site Harmony (plans d'avant ce champ), aucun pour le site du client", () => {
    expect(metaLandingSuffix(planWith(), false)).toBe(META_ADS_LANDING_SUFFIX);
    expect(metaLandingSuffix(null, false)).toBe(META_ADS_LANDING_SUFFIX);
    expect(metaLandingSuffix(undefined, false)).toBe("?src=meta");
    expect(metaLandingSuffix(planWith(), true)).toBe("");
    expect(metaLandingSuffix(null, true)).toBe("");
  });
});

describe("landingUrl", () => {
  it("construit l'URL publique avec le suffixe de provenance ?src=meta", () => {
    expect(landingUrl("claire.harmony-web.fr", "/", "?src=meta")).toBe("https://claire.harmony-web.fr/?src=meta");
    expect(landingUrl("https://claire.harmony-web.fr/", "/gestion-du-stress", "?src=meta")).toBe("https://claire.harmony-web.fr/gestion-du-stress?src=meta");
    expect(landingUrl("claire.harmony-web.fr", "sommeil", "src=meta")).toBe("https://claire.harmony-web.fr/sommeil?src=meta");
  });

  it("ajoute le suffixe à une page qui porte déjà des paramètres", () => {
    expect(landingUrl("claire.harmony-web.fr", "/sommeil?utm_campaign=hiver", "?src=meta")).toBe("https://claire.harmony-web.fr/sommeil?utm_campaign=hiver&src=meta");
  });

  it("sans suffixe, l'adresse reste telle quelle (site du client)", () => {
    expect(landingUrl("www.claire-sophrologie.fr", "/", "")).toBe("https://www.claire-sophrologie.fr/");
    expect(landingUrl("www.claire-sophrologie.fr", "/sommeil?lang=fr", "")).toBe("https://www.claire-sophrologie.fr/sommeil?lang=fr");
    expect(landingUrl("www.claire-sophrologie.fr/cabinet", "/sommeil", " ")).toBe("https://www.claire-sophrologie.fr/cabinet/sommeil");
  });
});

describe("metaLandingUrl", () => {
  it("site Harmony : l'ancien chemin « /<slug> » d'une créa enregistrée est rendu sous « /motifs/<slug> », avec le suffixe du plan", () => {
    expect(metaLandingUrl(HOSTED, "/gestion-du-stress")).toBe("https://claire.harmony-web.fr/motifs/gestion-du-stress?src=meta");
    expect(metaLandingUrl(HOSTED, "/motifs/sommeil")).toBe("https://claire.harmony-web.fr/motifs/sommeil?src=meta");
    expect(metaLandingUrl(HOSTED, "/")).toBe("https://claire.harmony-web.fr/?src=meta");
  });

  it("page disparue depuis : l'accueil du même site, jamais une adresse introuvable", () => {
    expect(metaLandingUrl(HOSTED, "/hypnose")).toBe("https://claire.harmony-web.fr/?src=meta");
    expect(metaLandingUrl(EXTERNAL, "/ancienne-page")).toBe("https://www.claire-sophrologie.fr/");
  });

  it("site du client : chemin réel de la page, adresse nue (aucun ?src=meta)", () => {
    expect(metaLandingUrl(EXTERNAL, "/accompagnements/stress")).toBe("https://www.claire-sophrologie.fr/accompagnements/stress");
    expect(metaLandingUrl(EXTERNAL, "/sommeil?lang=fr")).toBe("https://www.claire-sophrologie.fr/sommeil?lang=fr");
    expect(metaLandingUrl(EXTERNAL, "/")).toBe("https://www.claire-sophrologie.fr/");
  });

  it("adresse du site de l'analyse inconnue : aucune adresse composée", () => {
    expect(metaLandingUrl(UNKNOWN, "/accompagnements/stress")).toBeNull();
    expect(metaLandingUrl(UNKNOWN, "/")).toBeNull();
  });
});

describe("metaLandingPages", () => {
  const creatives = [
    { name: "Réassurance", landingPath: "/gestion-du-stress" },
    { name: "Pédagogie", landingPath: "/motifs/gestion-du-stress" },
    { name: "Ancrage local", landingPath: "/" },
  ];

  it("dédoublonne sur l'adresse composée et garde l'ordre des créas", () => {
    expect(metaLandingPages(HOSTED, creatives)).toEqual([
      { url: "https://claire.harmony-web.fr/motifs/gestion-du-stress?src=meta", creativeNames: ["Réassurance", "Pédagogie"] },
      { url: "https://claire.harmony-web.fr/?src=meta", creativeNames: ["Ancrage local"] },
    ]);
  });

  it("site du client : adresses nues ; adresse inconnue : aucune page", () => {
    expect(metaLandingPages(EXTERNAL, [{ name: "Réassurance", landingPath: "/accompagnements/stress" }])).toEqual([
      { url: "https://www.claire-sophrologie.fr/accompagnements/stress", creativeNames: ["Réassurance"] },
    ]);
    expect(metaLandingPages(UNKNOWN, creatives)).toEqual([]);
  });
});

describe("metaCreativeTxt", () => {
  it("reprend les champs du Gestionnaire de publicités dans l'ordre, libellé du bouton en français", () => {
    const txt = metaCreativeTxt({ ...CREATIVE, landingPath: "/motifs/gestion-du-stress" }, HOSTED);
    expect(txt).toBe(
      [
        "=== Texte principal ===\nPrendre un moment pour soi, c'est déjà un premier pas.",
        "=== Titre ===\nSophrologie à Albi",
        "=== Description ===\nRendez-vous en ligne",
        "=== Bouton ===\nRéserver",
        "=== Page d'atterrissage ===\nhttps://claire.harmony-web.fr/motifs/gestion-du-stress?src=meta",
        "=== Texte alternatif ===\nPhoto du cabinet",
      ].join("\n\n") + "\n",
    );
  });

  it("créa enregistrée avec l'ancien chemin « /<slug> » : le kit donne l'adresse qui fonctionne", () => {
    expect(metaCreativeTxt(CREATIVE, HOSTED)).toContain("=== Page d'atterrissage ===\nhttps://claire.harmony-web.fr/motifs/gestion-du-stress?src=meta\n");
  });

  it("site du client : la page d'atterrissage est sur ce site, sans suffixe", () => {
    const txt = metaCreativeTxt({ ...CREATIVE, landingPath: "/accompagnements/stress" }, EXTERNAL);
    expect(txt).toContain("=== Page d'atterrissage ===\nhttps://www.claire-sophrologie.fr/accompagnements/stress\n");
    expect(txt).not.toContain("src=meta");
    expect(txt).not.toContain("harmony-web");
  });

  it("adresse du site de l'analyse inconnue : la page d'atterrissage est omise, les autres champs restent", () => {
    const txt = metaCreativeTxt(CREATIVE, UNKNOWN);
    expect(txt).not.toContain("=== Page d'atterrissage ===");
    expect(txt).toContain("=== Bouton ===\nRéserver\n\n=== Texte alternatif ===\nPhoto du cabinet\n");
  });

  it("omet la description et le texte alternatif vides", () => {
    const txt = metaCreativeTxt({ ...CREATIVE, description: "", altText: " " }, HOSTED);
    expect(txt).not.toContain("=== Description ===");
    expect(txt).not.toContain("=== Texte alternatif ===");
  });

  it("ctaLabel connaît tous les boutons", () => {
    expect(ctaLabel("LEARN_MORE")).toBe("En savoir plus");
    expect(ctaLabel("CONTACT_US")).toBe("Nous contacter");
  });
});

describe("metaVideoScriptTxt", () => {
  it("accroche, temps forts seconde par seconde, bouton et texte à coller", () => {
    const video: MetaVideoBrief = {
      id: "v1",
      title: "Visite du cabinet",
      angle: "local",
      goal: "Montrer le lieu.",
      durationSeconds: 30,
      format: "9:16",
      hook: "Bienvenue au cabinet.",
      beats: [
        { at: 0, say: "Bienvenue !", onScreen: "Visite", shot: "Face caméra" },
        { at: 12, say: "La pièce des séances.", onScreen: "Les séances", shot: "Panoramique" },
      ],
      shotList: [],
      doSay: [],
      dontSay: [],
      cta: "CONTACT_US",
      caption: "Une visite en 30 secondes.",
    };
    const txt = metaVideoScriptTxt(video);
    expect(txt).toContain("=== Visite du cabinet (30 s, 9:16) ===\nMontrer le lieu.");
    expect(txt).toContain("=== Accroche (3 premières secondes) ===\nBienvenue au cabinet.");
    expect(txt).toContain("00 s — Bienvenue !\n   À l'écran : Visite\n   Plan : Face caméra");
    expect(txt).toContain("12 s — La pièce des séances.");
    expect(txt).toContain("=== Bouton ===\nNous contacter");
    expect(txt.endsWith("=== Texte à coller ===\nUne visite en 30 secondes.\n")).toBe(true);
  });
});
