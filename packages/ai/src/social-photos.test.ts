import { afterEach, describe, expect, it, vi } from "vitest";
import type { SocialFormat, SocialPillar, SocialPostContent, SocialTemplate } from "@theralys/shared";
import type { ImageProvider, ImageRequest } from "./images";
import type { FinalizedPost } from "./social";
import { applyCoverPhoto, removeCoverPhoto, sourceSocialPhotos, uploadedCoverPhoto, type SocialPhotoOptions } from "./social-photos";
import type { StockImageProvider } from "./stock";

const BRAND = { firstName: "Claire", profession: "Sophrologue" };
const SITE_PHOTO = "https://images.pexels.com/photos/1/site.jpeg?w=960&h=1152";
const OWN_PHOTO = "https://abc123.public.blob.vercel-storage.com/cabinet.jpg";
const ARTICLE_PHOTO = "https://images.pexels.com/photos/2/article.jpeg";

function post(overrides: { template?: SocialTemplate; pillar?: SocialPillar; format?: SocialFormat; imageUrl?: string; imageOrigin?: "site" | "upload"; photoWanted?: boolean; topic?: string; date?: string } = {}): FinalizedPost {
  const template = overrides.template ?? "photo-titre";
  const pillar = overrides.pillar ?? "specialite";
  const content: SocialPostContent = {
    pillar,
    accentRole: "primary",
    caption: "Une légende.",
    hashtags: ["#sophrologie"],
    altText: "Texte alternatif écrit par le modèle.",
    slides: [
      {
        role: template.startsWith("carrousel") ? "cover" : "single",
        title: "Mieux dormir avant la rentrée",
        body: "Trois repères simples.",
        ...(overrides.imageUrl ? { imageUrl: overrides.imageUrl } : {}),
        ...(overrides.imageOrigin ? { imageOrigin: overrides.imageOrigin } : {}),
      },
      ...(template.startsWith("carrousel") ? [{ role: "page" as const, title: "Étape 1", body: "Respirer." }] : []),
    ],
    sourceRefs: [],
    voice: { designation: "je", accord: "feminin", reader: "vous", tone: "chaleureux" },
    generator: "mock",
  };
  return {
    scheduledFor: overrides.date ?? "2026-12-01",
    format: overrides.format ?? "static",
    template,
    pillar,
    topic: overrides.topic ?? "Le sommeil avant la rentrée",
    content,
    ...(overrides.photoWanted ? { photoWanted: true } : {}),
  };
}

/** Fournisseurs simulés : chaque appel est gardé, chaque photo porte son rang. */
function providers(behaviour: { stock?: "ok" | "none" | "fail"; ai?: "ok" | "fail" | "bad-host" } = {}) {
  const stockCalls: { query: string; width: number; height: number; seed?: string }[] = [];
  const aiCalls: ImageRequest[] = [];
  const stock: StockImageProvider = {
    mode: "pexels",
    find: async (request) => {
      stockCalls.push(request);
      if (behaviour.stock === "fail") throw new Error("Pexels 500");
      if (behaviour.stock === "none") return null;
      return { url: `https://images.pexels.com/photos/9${stockCalls.length}/stock.jpeg`, provider: "pexels" };
    },
  };
  const images: ImageProvider = {
    generate: async (request) => {
      aiCalls.push(request);
      if (behaviour.ai === "fail") throw new Error("fal.ai 503");
      return { url: behaviour.ai === "bad-host" ? "https://ailleurs.exemple/ia.png" : `https://v3.fal.media/files/ia-${aiCalls.length}.png`, aiGenerated: true, provider: "fal" };
    },
  };
  return { stock, images, stockCalls, aiCalls };
}

const options = (source: SocialPhotoOptions["source"], seed = "site-1:2026-12"): SocialPhotoOptions => ({ source, practitioner: BRAND, themeColor: "#0e97dd", seed });
const cover = (item: FinalizedPost) => item.content.slides[0]!;

afterEach(() => vi.restoreAllMocks());

describe("fournir les photos d'après le réglage", () => {
  it("banque d'images : la photo d'ambiance du site laisse la place à une photo choisie pour le sujet, sans appel à l'IA", async () => {
    const fake = providers();
    const [result] = await sourceSocialPhotos([post({ imageUrl: SITE_PHOTO })], options("stock"), fake);
    expect(cover(result!)).toMatchObject({ imageUrl: "https://images.pexels.com/photos/91/stock.jpeg", imageOrigin: "stock" });
    expect(result!.template).toBe("photo-titre");
    // Le visuel portait déjà une photo : le texte alternatif du modèle reste
    expect(result!.content.altText).toBe("Texte alternatif écrit par le modèle.");
    expect(fake.aiCalls).toHaveLength(0);
    expect(fake.stockCalls[0]).toMatchObject({ query: "peaceful sleep rest cozy bedroom", width: 1088, height: 1360 });
  });

  it("IA : une image générée pour le sujet, sans visage, qui laisse la place du titre — sans appel à la banque d'images", async () => {
    const fake = providers();
    const [result] = await sourceSocialPhotos([post({ imageUrl: SITE_PHOTO, format: "story" })], options("ai"), fake);
    expect(cover(result!)).toMatchObject({ imageUrl: "https://v3.fal.media/files/ia-1.png", imageOrigin: "ai" });
    expect(fake.stockCalls).toHaveLength(0);
    expect(fake.aiCalls[0]).toMatchObject({ width: 1088, height: 1936, themeColor: "#0e97dd" });
    expect(fake.aiCalls[0]!.subject).toContain("peaceful sleep rest cozy bedroom");
    expect(fake.aiCalls[0]!.subject).toContain("empty space in the lower third");
    // Pas de `mood` : le générateur d'images garde sa consigne par défaut, sans visage en gros plan
    expect(fake.aiCalls[0]!.mood).toBeUndefined();
  });

  it("mixte : les deux origines alternent d'un contenu au suivant", async () => {
    const fake = providers();
    const posts = ["2026-12-01", "2026-12-04", "2026-12-08", "2026-12-11"].map((date) => post({ imageUrl: SITE_PHOTO, date, topic: `Sujet du ${date}` }));
    const result = await sourceSocialPhotos(posts, options("mixed"), fake);
    const origins = result.map((item) => cover(item).imageOrigin);
    expect(origins.filter((origin) => origin === "stock")).toHaveLength(2);
    expect(origins.filter((origin) => origin === "ai")).toHaveLength(2);
    expect(origins[0]).not.toBe(origins[1]);
    expect(origins[1]).not.toBe(origins[2]);
  });

  it("mixte : quand une origine ne donne rien, l'autre prend le relais", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const noStock = providers({ stock: "none" });
    const posts = [post({ imageUrl: SITE_PHOTO, date: "2026-12-01" }), post({ imageUrl: SITE_PHOTO, date: "2026-12-04" })];
    expect((await sourceSocialPhotos(posts, options("mixed"), noStock)).map((item) => cover(item).imageOrigin)).toEqual(["ai", "ai"]);
    const noAi = providers({ ai: "fail" });
    expect((await sourceSocialPhotos(posts, options("mixed"), noAi)).map((item) => cover(item).imageOrigin)).toEqual(["stock", "stock"]);
  });

  it("IA seule ou banque seule : jamais de débordement de l'une sur l'autre ; sans résultat, la photo du site reste", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const aiDown = providers({ ai: "fail" });
    const [kept] = await sourceSocialPhotos([post({ imageUrl: SITE_PHOTO })], options("ai"), aiDown);
    expect(cover(kept!)).toMatchObject({ imageUrl: SITE_PHOTO, imageOrigin: "site" });
    expect(aiDown.stockCalls).toHaveLength(0);
    const stockDown = providers({ stock: "fail" });
    const [alsoKept] = await sourceSocialPhotos([post({ imageUrl: SITE_PHOTO })], options("stock"), stockDown);
    expect(cover(alsoKept!)).toMatchObject({ imageUrl: SITE_PHOTO, imageOrigin: "site" });
    expect(stockDown.aiCalls).toHaveLength(0);
  });

  it("une image servie depuis un hôte inconnu n'est pas retenue", async () => {
    const fake = providers({ ai: "bad-host" });
    const [result] = await sourceSocialPhotos([post({ imageUrl: SITE_PHOTO })], options("ai"), fake);
    expect(cover(result!).imageUrl).toBe(SITE_PHOTO);
  });

  it("ne sont jamais remplacées : la photo envoyée par le praticien, celle de son site, la couverture d'un article", async () => {
    const fake = providers();
    const result = await sourceSocialPhotos(
      [
        post({ imageUrl: OWN_PHOTO, imageOrigin: "upload" }),
        post({ imageUrl: OWN_PHOTO }),
        post({ imageUrl: ARTICLE_PHOTO, pillar: "nouvel_article" }),
        post({ imageUrl: ARTICLE_PHOTO, pillar: "article" }),
        post({ imageUrl: ARTICLE_PHOTO, template: "carrousel-article", format: "carousel", pillar: "conseil" }),
      ],
      options("ai"),
      fake,
    );
    expect(result.map((item) => cover(item).imageUrl)).toEqual([OWN_PHOTO, OWN_PHOTO, ARTICLE_PHOTO, ARTICLE_PHOTO, ARTICLE_PHOTO]);
    expect(result.map((item) => cover(item).imageOrigin)).toEqual(["upload", "site", "site", "site", "site"]);
    expect(fake.aiCalls).toHaveLength(0);
  });

  it("un visuel qui voulait une photo que le site n'avait pas la reçoit : il redevient « photo-titre », son texte alternatif est réécrit", async () => {
    const fake = providers();
    const [result] = await sourceSocialPhotos([post({ template: "affirmation", photoWanted: true })], options("stock"), fake);
    expect(result!.template).toBe("photo-titre");
    expect(cover(result!).imageOrigin).toBe("stock");
    expect(result!.content.altText).toBe("Photo d'ambiance avec, en surimpression, le titre « Mieux dormir avant la rentrée » et la signature Claire, sophrologue.");
    expect("photoWanted" in result!).toBe(false);
  });

  it("…et reste un visuel de texte si aucune photo n'est trouvée ; l'indication de passage ne ressort jamais", async () => {
    const fake = providers({ stock: "none" });
    const [result] = await sourceSocialPhotos([post({ template: "affirmation", photoWanted: true })], options("stock"), fake);
    expect(result!.template).toBe("affirmation");
    expect(cover(result!).imageUrl).toBeUndefined();
    expect("photoWanted" in result!).toBe(false);
  });

  it("fournisseur sans clé (illustrations de démonstration) : jamais posées sur un vrai contenu, la photo du site reste", async () => {
    const stock: StockImageProvider = { mode: "mock", find: vi.fn(async () => ({ url: "data:image/svg+xml;base64,AAAA", provider: "mock" as const })) };
    const images: ImageProvider = { generate: vi.fn(async () => ({ url: "data:image/svg+xml;base64,BBBB", aiGenerated: true, provider: "mock" as const })) };
    for (const source of ["stock", "ai", "mixed"] as const) {
      const [real] = await sourceSocialPhotos([post({ imageUrl: SITE_PHOTO })], options(source), { stock, images });
      expect(cover(real!), source).toMatchObject({ imageUrl: SITE_PHOTO, imageOrigin: "site" });
    }
    // La banque d'images sans clé n'est même pas interrogée
    expect(stock.find).not.toHaveBeenCalled();
    // En démonstration (tout le contenu l'est), elles servent
    const [demo] = await sourceSocialPhotos([post({ imageUrl: SITE_PHOTO })], { ...options("stock"), allowPlaceholders: true }, { stock, images });
    expect(cover(demo!)).toMatchObject({ imageUrl: "data:image/svg+xml;base64,AAAA", imageOrigin: "stock" });
  });

  it("les visuels de texte ne reçoivent pas de photo ; carrousels et stories à photo, si", async () => {
    const fake = providers();
    const result = await sourceSocialPhotos(
      [
        post({ template: "affirmation" }),
        post({ template: "question-reponse" }),
        post({ template: "liste-conseils" }),
        post({ template: "avis", pillar: "avis" }),
        post({ template: "carrousel-etapes", format: "carousel" }),
        post({ template: "story-rappel", format: "story" }),
      ],
      options("stock"),
      fake,
    );
    expect(result.map((item) => Boolean(cover(item).imageUrl))).toEqual([false, false, false, false, true, true]);
    expect(result.map((item) => item.template)).toEqual(["affirmation", "question-reponse", "liste-conseils", "avis", "carrousel-etapes", "story-rappel"]);
    // La photo va sur la couverture, pas sur les pages
    expect(result[4]!.content.slides[1]!.imageUrl).toBeUndefined();
    expect(fake.stockCalls).toHaveLength(2);
  });

  it("l'ordre des contenus est gardé, et deux préparations du même sujet ne demandent pas la même photo", async () => {
    const first = providers();
    const posts = Array.from({ length: 7 }, (_, i) => post({ imageUrl: SITE_PHOTO, date: `2026-12-${String(i + 1).padStart(2, "0")}`, topic: `Sujet ${i}` }));
    const result = await sourceSocialPhotos(posts, options("stock"), first);
    expect(result.map((item) => item.topic)).toEqual(posts.map((item) => item.topic));
    expect(result.every((item) => cover(item).imageOrigin === "stock")).toBe(true);
    const second = providers();
    await sourceSocialPhotos(posts.slice(0, 1), options("stock", "site-1:autre-essai"), second);
    expect(second.stockCalls[0]!.seed).not.toBe(first.stockCalls.find((call) => call.seed?.includes("Sujet 0"))!.seed);
  });
});

describe("poser et retirer la photo d'un contenu", () => {
  const stored = (template: SocialTemplate, imageUrl?: string) => {
    const base = post({ template, ...(imageUrl ? { imageUrl } : {}) });
    return { template: base.template, content: base.content, id: "post-1" };
  };

  it("sur un visuel « affirmation » : il devient « photo-titre », la photo est dite envoyée par le praticien", () => {
    const result = applyCoverPhoto(stored("affirmation"), { url: OWN_PHOTO, origin: "upload" }, BRAND);
    expect(result).toMatchObject({ id: "post-1", template: "photo-titre" });
    expect(result.content.slides[0]).toMatchObject({ imageUrl: OWN_PHOTO, imageOrigin: "upload" });
    expect(result.content.altText).toContain("Photo d'ambiance");
    expect(uploadedCoverPhoto(result.content)).toEqual({ url: OWN_PHOTO, origin: "upload" });
  });

  it("sur un visuel qui avait déjà une photo : seule la photo change", () => {
    const before = stored("photo-titre", SITE_PHOTO);
    const result = applyCoverPhoto(before, { url: OWN_PHOTO, origin: "upload" }, BRAND);
    expect(result.template).toBe("photo-titre");
    expect(result.content.altText).toBe(before.content.altText);
    expect(result.content.caption).toBe(before.content.caption);
  });

  it("sur une carte de texte : elle devient un « photo-titre », son titre et son texte sur la photo, et se souvient de son modèle", () => {
    for (const template of ["question-reponse", "liste-conseils", "infos-pratiques", "avis"] as const) {
      const before = stored(template);
      const withPhoto = applyCoverPhoto(before, { url: OWN_PHOTO, origin: "upload" }, BRAND);
      expect(withPhoto.template, template).toBe("photo-titre");
      expect(withPhoto.content.plainTemplate).toBe(template);
      expect(withPhoto.content.slides[0]).toMatchObject({ title: before.content.slides[0]!.title, body: before.content.slides[0]!.body, imageUrl: OWN_PHOTO });
      expect(withPhoto.content.altText).toContain("Photo d'ambiance");
      // La photo retirée : la carte retrouve son modèle, sans trace du passage
      const back = removeCoverPhoto(withPhoto, BRAND);
      expect(back.template, template).toBe(template);
      expect(back.content).not.toHaveProperty("plainTemplate");
      expect(back.content.slides[0]).not.toHaveProperty("imageUrl");
    }
  });

  it("changer une photo déjà posée ne fait pas oublier le modèle d'origine", () => {
    const first = applyCoverPhoto(stored("liste-conseils"), { url: OWN_PHOTO, origin: "upload" }, BRAND);
    const second = applyCoverPhoto(first, { url: "https://abc123.public.blob.vercel-storage.com/autre.jpg", origin: "upload" }, BRAND);
    expect(second.template).toBe("photo-titre");
    expect(second.content.plainTemplate).toBe("liste-conseils");
    expect(removeCoverPhoto(second, BRAND).template).toBe("liste-conseils");
  });

  it("retirer : « photo-titre » redevient « affirmation » ; un carrousel garde son modèle, sans photo", () => {
    const single = removeCoverPhoto(applyCoverPhoto(stored("affirmation"), { url: OWN_PHOTO, origin: "upload" }, BRAND), BRAND);
    expect(single.template).toBe("affirmation");
    expect(single.content.slides[0]).not.toHaveProperty("imageUrl");
    expect(single.content.slides[0]).not.toHaveProperty("imageOrigin");
    expect(single.content.altText).toContain("fond de couleur dégradé");
    expect(uploadedCoverPhoto(single.content)).toBeNull();
    const carousel = removeCoverPhoto(stored("carrousel-etapes", SITE_PHOTO), BRAND);
    expect(carousel.template).toBe("carrousel-etapes");
    expect(carousel.content.slides[0]).not.toHaveProperty("imageUrl");
    expect(carousel.content.altText).not.toContain("sur photo");
    // Rien à retirer : le contenu est rendu tel quel
    const none = stored("affirmation");
    expect(removeCoverPhoto(none, BRAND)).toBe(none);
  });

  it("une photo du site n'est pas prise pour une photo envoyée", () => {
    expect(uploadedCoverPhoto(stored("photo-titre", SITE_PHOTO).content)).toBeNull();
  });
});
