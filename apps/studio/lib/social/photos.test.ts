import { describe, expect, it } from "vitest";
import type { FinalizedPost } from "@theralys/ai";
import type { SocialPostContent } from "@theralys/shared";
import { ACADEMY_OPEN, SECTION_GROUPS, allowedSections } from "@/components/ds/sections";
import { EMBEDDED_PHOTO_MAX_CHARS, keepUploadedPhoto, uploadedPhotoVerdict, withSourcedPhotos } from "./photos";
import type { SocialSettingsView } from "./settings";

const PRACTITIONER = { firstName: "Claire", lastName: "Martin", profession: "Sophrologue", practiceName: "Cabinet Martin", city: "Albi", gender: "feminin" as const };
const BLOB = "https://abc123.public.blob.vercel-storage.com/ma-photo.jpg";
const SITE_PHOTO = "https://images.pexels.com/photos/1/site.jpeg";

function content(overrides: { imageUrl?: string; imageOrigin?: "upload" | "site" | "stock" | "ai" } = {}): SocialPostContent {
  return {
    pillar: "conseil",
    accentRole: "primary",
    caption: "Une légende.",
    hashtags: [],
    altText: "Texte alternatif.",
    slides: [{ role: "single", title: "Respirer avant de dormir", body: "Trois minutes suffisent.", ...overrides }],
    sourceRefs: [],
    voice: { designation: "je", accord: "feminin", reader: "vous", tone: "chaleureux" },
    generator: "mock",
  };
}

const post = (template: FinalizedPost["template"], overrides: Parameters<typeof content>[0] = {}, photoWanted = false): FinalizedPost => ({
  scheduledFor: "2026-12-01",
  format: "static",
  template,
  pillar: "conseil",
  topic: "Le sommeil",
  content: content(overrides),
  ...(photoWanted ? { photoWanted: true } : {}),
});

const settings = (overrides: Partial<SocialSettingsView> = {}): SocialSettingsView => ({
  voice: { designation: "je", accord: "feminin", reader: "vous", tone: "chaleureux" },
  instructions: "",
  postDays: [2, 5],
  saved: false,
  photoSource: "stock",
  photoSourceAvailable: true,
  ...overrides,
});

const SITE = { id: "11111111-1111-4111-8111-111111111111", theme: { preset: "terracotta", fontPreset: "chaleureux" } } as Parameters<typeof withSourcedPhotos>[0];

describe("photo envoyée par le praticien", () => {
  it("n'est acceptée que si elle vient de l'envoi de fichiers : stockage, ou petite photo embarquée", () => {
    expect(uploadedPhotoVerdict(BLOB)).toBe("ok");
    expect(uploadedPhotoVerdict("data:image/jpeg;base64,AAAA")).toBe("ok");
    expect(uploadedPhotoVerdict("data:image/webp;base64,AAAA")).toBe("ok");
    // Une adresse quelconque, même d'un hôte connu des visuels, n'est pas une photo envoyée
    expect(uploadedPhotoVerdict(SITE_PHOTO)).toBe("refused");
    expect(uploadedPhotoVerdict("https://v3.fal.media/files/x.png")).toBe("refused");
    expect(uploadedPhotoVerdict("https://exemple.fr/photo.jpg")).toBe("refused");
    expect(uploadedPhotoVerdict("http://abc.public.blob.vercel-storage.com/a.jpg")).toBe("refused");
    expect(uploadedPhotoVerdict("javascript:alert(1)")).toBe("refused");
    // Ni dessin vectoriel (il peut porter des références extérieures), ni texte glissé dans l'adresse
    expect(uploadedPhotoVerdict("data:image/svg+xml;base64,AAAA")).toBe("refused");
    expect(uploadedPhotoVerdict('data:image/png;base64,AAAA"><script>')).toBe("refused");
    expect(uploadedPhotoVerdict("")).toBe("refused");
  });

  it("une photo embarquée trop lourde est refusée avec sa propre raison", () => {
    const heavy = `data:image/jpeg;base64,${"A".repeat(EMBEDDED_PHOTO_MAX_CHARS)}`;
    expect(uploadedPhotoVerdict(heavy)).toBe("too-heavy");
  });

  it("régénération : elle reste en place sur le nouveau visuel, qui devient « photo-titre » s'il était de texte", () => {
    const previous = content({ imageUrl: BLOB, imageOrigin: "upload" });
    const kept = keepUploadedPhoto(previous, post("affirmation", {}, true), PRACTITIONER);
    expect(kept.kept).toBe(true);
    expect(kept.post.template).toBe("photo-titre");
    expect(kept.post.content.slides[0]).toMatchObject({ imageUrl: BLOB, imageOrigin: "upload" });
    expect("photoWanted" in kept.post).toBe(false);
    // Le nouveau visuel avait reçu une photo du site : celle du praticien la remplace
    expect(keepUploadedPhoto(previous, post("photo-titre", { imageUrl: SITE_PHOTO }), PRACTITIONER).post.content.slides[0]!.imageUrl).toBe(BLOB);
  });

  it("régénération : même si le nouveau visuel est une carte de texte, sa photo reste — la carte se pose dessus", () => {
    const kept = keepUploadedPhoto(content({ imageUrl: BLOB, imageOrigin: "upload" }), post("liste-conseils"), PRACTITIONER);
    expect(kept.kept).toBe(true);
    expect(kept.post.template).toBe("photo-titre");
    expect(kept.post.content.plainTemplate).toBe("liste-conseils");
    expect(kept.post.content.slides[0]).toMatchObject({ imageUrl: BLOB, imageOrigin: "upload" });
  });

  it("régénération : rien à garder si la photo n'était pas la sienne", () => {
    const fromSite = post("photo-titre", { imageUrl: SITE_PHOTO });
    expect(keepUploadedPhoto(content({ imageUrl: SITE_PHOTO, imageOrigin: "stock" }), fromSite, PRACTITIONER)).toEqual({ post: fromSite, kept: false });
    expect(keepUploadedPhoto(content(), fromSite, PRACTITIONER)).toEqual({ post: fromSite, kept: false });
  });
});

describe("photos d'après le réglage", () => {
  it("tant que le réglage n'existe pas en base : rien n'est changé, les visuels gardent les photos du site", async () => {
    const posts = [post("photo-titre", { imageUrl: SITE_PHOTO }), post("affirmation", {}, true)];
    const result = await withSourcedPhotos(SITE, settings({ photoSourceAvailable: false, photoSource: "ai" }), PRACTITIONER, posts, "plan:2026-12");
    expect(result.map((item) => item.template)).toEqual(["photo-titre", "affirmation"]);
    expect(result[0]!.content.slides[0]).toEqual(posts[0]!.content.slides[0]);
    expect(result.some((item) => "photoWanted" in item)).toBe(false);
  });

  it("réglage en place (fournisseurs de démonstration, sans réseau) : chaque visuel à photo reçoit la sienne, dite à son origine", async () => {
    const posts = [post("photo-titre", { imageUrl: SITE_PHOTO }), post("affirmation", {}, true), post("liste-conseils")];
    const env = { ...process.env };
    process.env.IMAGE_PROVIDER = "mock";
    process.env.STOCK_IMAGE_PROVIDER = "mock";
    process.env.AI_MOCK = "1";
    try {
      const stock = await withSourcedPhotos(SITE, settings({ photoSource: "stock" }), PRACTITIONER, posts, "plan:2026-12");
      expect(stock.map((item) => item.content.slides[0]!.imageOrigin)).toEqual(["stock", "stock", undefined]);
      expect(stock.map((item) => item.template)).toEqual(["photo-titre", "photo-titre", "liste-conseils"]);
      expect(stock[0]!.content.slides[0]!.imageUrl).toMatch(/^data:image\/svg\+xml;base64,/);
      const ai = await withSourcedPhotos(SITE, settings({ photoSource: "ai" }), PRACTITIONER, posts, "plan:2026-12");
      expect(ai.map((item) => item.content.slides[0]!.imageOrigin)).toEqual(["ai", "ai", undefined]);
      const mixed = await withSourcedPhotos(SITE, settings({ photoSource: "mixed" }), PRACTITIONER, posts, "plan:2026-12");
      expect(new Set(mixed.slice(0, 2).map((item) => item.content.slides[0]!.imageOrigin))).toEqual(new Set(["stock", "ai"]));
    } finally {
      process.env = env;
    }
  });
});

describe("photos d'après le réglage, en production sans clé d'images", () => {
  it("la rédaction est réelle mais les fournisseurs d'images n'ont pas de clé : aucune illustration factice, la photo du site reste", async () => {
    const posts = [post("photo-titre", { imageUrl: SITE_PHOTO }), post("affirmation", {}, true)];
    const env = { ...process.env };
    delete process.env.AI_MOCK;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.FAL_API_KEY;
    delete process.env.PEXELS_API_KEY;
    delete process.env.IMAGE_PROVIDER;
    delete process.env.STOCK_IMAGE_PROVIDER;
    try {
      for (const photoSource of ["stock", "ai", "mixed"] as const) {
        const result = await withSourcedPhotos(SITE, settings({ photoSource }), PRACTITIONER, posts, "plan:2026-12");
        expect(result[0]!.content.slides[0], photoSource).toMatchObject({ imageUrl: SITE_PHOTO, imageOrigin: "site" });
        expect(result[1]!.template).toBe("affirmation");
        expect(result[1]!.content.slides[0]!.imageUrl).toBeUndefined();
      }
    } finally {
      process.env = env;
    }
  });
});

describe("Académie", () => {
  const access = { publications: true, social: true, google: true, googleAds: true, metaAds: true };

  it("pas encore ouverte : absente de la navigation, et son groupe « Apprendre » avec elle", () => {
    expect(ACADEMY_OPEN).toBe(false);
    const sections = allowedSections(access);
    expect(sections).not.toContain("academie");
    expect(sections).toEqual(["accueil", "mon-site", "publications", "reseaux-sociaux", "fiche-google", "google-ads", "meta-ads", "compte"]);
    const learn = SECTION_GROUPS.find((group) => group.key === "apprendre");
    expect(learn?.sections.filter((key) => sections.includes(key))).toEqual([]);
  });
});
