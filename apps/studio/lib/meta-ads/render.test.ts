import { describe, expect, it } from "vitest";
import type { MetaAdCreative } from "@theralys/shared";
import { isMetaAdsFormat, metaCreativeFilename, metaCreativeToSocialContent, renderableMetaCreative } from "./render";

const CREATIVE: MetaAdCreative = {
  id: "c2",
  angle: "education",
  name: "Pédagogie",
  primaryText: "Une séance, concrètement ? On respire, on relâche, on avance ensemble.",
  headline: "Découvrir la sophrologie",
  description: "Séances individuelles",
  cta: "LEARN_MORE",
  hook: "Comment se passe une séance ?",
  subline: "Respiration, détente et temps d'échange : 45 minutes guidées",
  photoId: "p3",
  template: "photo-titre",
  accentRole: "deep",
  altText: "Visuel d'annonce",
  landingPath: "/gestion-du-stress",
};

describe("metaCreativeToSocialContent", () => {
  it("une diapositive : accroche = titre, ligne secondaire = texte, photo résolue, légende = texte principal", () => {
    const content = metaCreativeToSocialContent(CREATIVE, "https://images.pexels.com/photos/1/pexels-photo-1.jpeg");
    expect(content.slides).toEqual([
      {
        role: "single",
        title: "Comment se passe une séance ?",
        body: "Respiration, détente et temps d'échange : 45 minutes guidées",
        imageUrl: "https://images.pexels.com/photos/1/pexels-photo-1.jpeg",
      },
    ]);
    expect(content.caption).toBe(CREATIVE.primaryText);
    expect(content.altText).toBe("Visuel d'annonce");
    expect(content.accentRole).toBe("deep");
    expect(content.hashtags).toEqual([]);
  });

  it("sans photo (photoId null ou URL inconnue), la diapositive n'a pas d'image", () => {
    expect(metaCreativeToSocialContent({ ...CREATIVE, photoId: null }, "https://example.com/p.jpg").slides[0]).not.toHaveProperty("imageUrl");
    expect(metaCreativeToSocialContent(CREATIVE, null).slides[0]).not.toHaveProperty("imageUrl");
    expect(metaCreativeToSocialContent(CREATIVE).slides[0]).not.toHaveProperty("imageUrl");
  });
});

describe("renderableMetaCreative", () => {
  it("désigne la table meta, l'analyse comme contenu et la créa comme variante du slot", () => {
    const analysis = { id: "00000000-0000-0000-0000-000000000001", siteId: "00000000-0000-0000-0000-00000000000a", assets: { version: 1, renders: {} } };
    const renderable = renderableMetaCreative(analysis, CREATIVE, "https://example.com/p.jpg");
    expect(renderable).toMatchObject({
      id: analysis.id,
      siteId: analysis.siteId,
      table: "meta",
      template: "photo-titre",
      accentColor: null,
      variant: "c2",
      assets: analysis.assets,
    });
    expect(renderable.content.slides[0]?.title).toBe(CREATIVE.hook);
  });
});

describe("formats et noms de fichiers", () => {
  it("isMetaAdsFormat accepte carré, portrait et story — pas le paysage des posts Google", () => {
    expect(isMetaAdsFormat("square")).toBe(true);
    expect(isMetaAdsFormat("portrait")).toBe(true);
    expect(isMetaAdsFormat("story")).toBe(true);
    expect(isMetaAdsFormat("landscape")).toBe(false);
    expect(isMetaAdsFormat(undefined)).toBe(false);
  });

  it("metaCreativeFilename est en ASCII et nomme la créa, l'angle et le format", () => {
    expect(metaCreativeFilename(CREATIVE, "carre", "jpg")).toBe("meta-c2-education-carre.jpg");
    expect(metaCreativeFilename({ id: "c1", angle: "temoignage" }, "kit", "zip")).toBe("meta-c1-temoignage-kit.zip");
  });
});
