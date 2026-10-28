import { describe, expect, it } from "vitest";
import type { MetaAdCreative, MetaVideoBrief } from "@theralys/shared";
import { ctaLabel, formatMetaLines, landingUrl, metaCreativeTxt, metaVideoScriptTxt } from "./clipboard";

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

describe("formatMetaLines", () => {
  it("une ligne par texte, espaces repliés, vides et doublons retirés", () => {
    expect(formatMetaLines(["Un temps  pour souffler", "", " un temps pour souffler ", "Et si vous essayiez ?"])).toBe("Un temps pour souffler\nEt si vous essayiez ?");
  });
});

describe("landingUrl", () => {
  it("construit l'URL publique, accueil sans barre finale", () => {
    expect(landingUrl("claire.harmony-web.fr", "/")).toBe("https://claire.harmony-web.fr");
    expect(landingUrl("https://claire.harmony-web.fr/", "/gestion-du-stress")).toBe("https://claire.harmony-web.fr/gestion-du-stress");
    expect(landingUrl("claire.harmony-web.fr", "sommeil")).toBe("https://claire.harmony-web.fr/sommeil");
  });
});

describe("metaCreativeTxt", () => {
  it("reprend les champs du Gestionnaire de publicités dans l'ordre, libellé du bouton en français", () => {
    const txt = metaCreativeTxt(CREATIVE, "claire.harmony-web.fr");
    expect(txt).toBe(
      [
        "=== Texte principal ===\nPrendre un moment pour soi, c'est déjà un premier pas.",
        "=== Titre ===\nSophrologie à Albi",
        "=== Description ===\nRendez-vous en ligne",
        "=== Bouton ===\nRéserver",
        "=== Page d'atterrissage ===\nhttps://claire.harmony-web.fr/gestion-du-stress",
        "=== Texte alternatif ===\nPhoto du cabinet",
      ].join("\n\n") + "\n",
    );
  });

  it("omet la description et le texte alternatif vides", () => {
    const txt = metaCreativeTxt({ ...CREATIVE, description: "", altText: " " }, "claire.harmony-web.fr");
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
