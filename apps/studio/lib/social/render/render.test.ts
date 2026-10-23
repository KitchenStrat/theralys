import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { unzipSync } from "fflate";
import {
  FONT_PRESETS,
  SOCIAL_ACCENT_ROLES,
  THEME_INTENSITIES,
  THEME_PRESETS,
  relativeLuminance,
  type SiteTheme,
} from "@theralys/shared";
import { buildZip } from "./bundle";
import { assetSlot, pruneRenders, renderKey } from "./cache";
import { accentOn } from "./chrome";
import { FRAMES, fitBody, fitTitle } from "./frames";
import { loadFonts } from "./fonts";
import { clearImageCache, decodeDataUri, isAllowedImageUrl, prepareImage, rewritePexelsUrl } from "./images";
import { renderSlide } from "./render";
import { mergePunctuation } from "./rich-text";
import { fixturePhoto, smokeContext, smokePost } from "./fixtures";
import { photoGeometry } from "./templates";
import { contrastRatio, mix, onAccentColor, resolveSocialTheme, rgba, swatchesFor } from "./theme";

const square = FRAMES.square;

describe("frames", () => {
  it("fitTitle décroît avec la longueur", () => {
    expect(fitTitle("Respirer avant de réagir", square)).toBe(64);
    expect(fitTitle("x".repeat(32), square)).toBe(64);
    expect(fitTitle("x".repeat(33), square)).toBe(Math.round(64 * 0.86));
    expect(fitTitle("x".repeat(56), square)).toBe(Math.round(64 * 0.86));
    expect(fitTitle("x".repeat(57), square)).toBe(Math.round(64 * 0.74));
    expect(fitTitle("x".repeat(81), square)).toBe(Math.round(64 * 0.64));
    expect(fitTitle("x".repeat(81), FRAMES.story)).toBe(Math.round(84 * 0.64));
  });

  it("fitBody réduit au-delà de 160 caractères", () => {
    expect(fitBody("court", square)).toBe(34);
    expect(fitBody("x".repeat(161), square)).toBe(Math.round(34 * 0.9));
  });
});

describe("theme", () => {
  it("onAccent est lisible sur les 12 palettes × 3 intensités × 4 rôles", () => {
    for (const preset of THEME_PRESETS) {
      for (const intensity of THEME_INTENSITIES) {
        for (const accentRole of SOCIAL_ACCENT_ROLES) {
          const theme = resolveSocialTheme({ preset, fontPreset: "chaleureux", intensity }, null, accentRole);
          const lum = relativeLuminance(theme.accent);
          expect([theme.text, "#ffffff"], `${preset}/${intensity}/${accentRole}`).toContain(theme.onAccent);
          if (lum >= 0.45) expect(theme.onAccent).toBe(theme.text);
          // Contraste minimal 3:1 (texte large) entre l'accent et son texte
          expect(contrastRatio(theme.accent, theme.onAccent), `${preset}/${intensity}/${accentRole} contraste`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("accentColor (hex validé) prime sur accentRole, sinon le rôle", () => {
    const theme: SiteTheme = { preset: "lavande", fontPreset: "chaleureux" };
    expect(resolveSocialTheme(theme, "#C26A7D", "primary").accent).toBe("#c26a7d");
    expect(resolveSocialTheme(theme, "rouge", "primaryDark").accent).toBe("#57477c");
    expect(resolveSocialTheme(theme, null, "soft").accent).toBe("#eae4f4");
    expect(resolveSocialTheme(theme, null, "soft").onAccent).toBe("#322b45");
    expect(resolveSocialTheme({ ...theme, logoUrl: "data:image/png;base64,AA==" }, null, "deep").logoUrl).toBe(
      "data:image/png;base64,AA==",
    );
  });

  it("onAccentColor bascule sur le texte du thème quand le blanc fait moins de 3:1", () => {
    expect(onAccentColor("#6f5b9c", "#322b45")).toBe("#ffffff");
    expect(onAccentColor("#bb945a", "#3f3222")).toBe("#3f3222");
    expect(onAccentColor("#eae4f4", "#322b45")).toBe("#322b45");
    expect(onAccentColor("rouge", "#322b45")).toBe("#322b45");
  });

  it("mix / rgba / swatchesFor", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("nope", "#ffffff", 0.5)).toBe("nope");
    expect(rgba("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    const swatches = swatchesFor({ preset: "lavande", fontPreset: "chaleureux" });
    expect(swatches.map((s) => s.label)).toEqual(["Couleur principale", "Foncée", "Profonde", "Douce", "Claire"]);
    expect(swatches.map((s) => s.hex)).toEqual(["#6f5b9c", "#57477c", "#292138", "#eae4f4", "#f7f5fa"]);
  });
});

describe("images", () => {
  it("n'accepte que les hôtes de la liste blanche et les data:URI image", () => {
    expect(isAllowedImageUrl("https://images.pexels.com/photos/1/a.jpeg")).toBe(true);
    expect(isAllowedImageUrl("https://fal.media/files/x.png")).toBe(true);
    expect(isAllowedImageUrl("https://v3.fal.media/files/x.png")).toBe(true);
    expect(isAllowedImageUrl("https://abc.public.blob.vercel-storage.com/sites/x.jpg")).toBe(true);
    expect(isAllowedImageUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(true);
    expect(isAllowedImageUrl("https://example.com/x.jpg")).toBe(false);
    expect(isAllowedImageUrl("http://images.pexels.com/x.jpg")).toBe(false);
    expect(isAllowedImageUrl("https://evil.fal.media.example.com/x.jpg")).toBe(false);
    expect(isAllowedImageUrl("data:text/html,<b>")).toBe(false);
    expect(isAllowedImageUrl("file:///etc/passwd")).toBe(false);
  });

  it("réécrit les URLs Pexels avec la taille utile", () => {
    const url = rewritePexelsUrl("https://images.pexels.com/photos/1/a.jpeg?w=4000&h=3000", 1080, 1350);
    const params = new URL(url).searchParams;
    expect(params.get("w")).toBe("1080");
    expect(params.get("h")).toBe("1350");
    expect(params.get("fit")).toBe("crop");
    expect(rewritePexelsUrl("https://fal.media/x.png", 1, 1)).toBe("https://fal.media/x.png");
  });

  it("decodeDataUri gère base64 et percent-encoding", () => {
    expect(decodeDataUri("data:image/svg+xml;base64,PHN2Zz4=")?.toString()).toBe("<svg>");
    expect(decodeDataUri("data:image/svg+xml,%3Csvg%3E")?.toString()).toBe("<svg>");
    expect(decodeDataUri("not a data uri")).toBeNull();
  });

  it("prepareImage refuse un hôte hors liste et un data: corrompu (→ null)", async () => {
    clearImageCache();
    expect(await prepareImage("https://example.com/x.jpg", 100, 100)).toBeNull();
    expect(await prepareImage("data:image/png;base64,AAAA", 100, 100)).toBeNull();
    expect(await prepareImage(null, 100, 100)).toBeNull();
  });

  it("prepareImage rasterise un SVG data:URI en JPEG aux dimensions demandées", async () => {
    const out = await prepareImage(fixturePhoto(1, 400, 300), 320, 240);
    expect(out).toMatch(/^data:image\/jpeg;base64,/);
    const meta = await sharp(Buffer.from(out!.split(",")[1]!, "base64")).metadata();
    expect([meta.width, meta.height]).toEqual([320, 240]);
    // Logo : PNG « contain » sans agrandissement
    const logo = await prepareImage(fixturePhoto(2, 520, 112), 260, 56, "contain");
    expect(logo).toMatch(/^data:image\/png;base64,/);
    const logoMeta = await sharp(Buffer.from(logo!.split(",")[1]!, "base64")).metadata();
    expect(logoMeta.width).toBeLessThanOrEqual(260);
    expect(logoMeta.height).toBeLessThanOrEqual(56);
  });
});

describe("rich-text", () => {
  it("mergePunctuation recolle la ponctuation française", () => {
    const words = mergePunctuation([
      { word: "Pas", bold: false },
      { word: "tout", bold: false },
      { word: ":", bold: false },
      { word: "«", bold: false },
      { word: "oui", bold: true },
      { word: "»", bold: true },
      { word: "60", bold: false },
      { word: "%", bold: false },
    ]);
    expect(words.map((w) => w.word)).toEqual(["Pas", "tout :", "« oui »", "60 %"]);
    expect(words.map((w) => w.bold)).toEqual([false, false, true, false]);
  });
});

describe("chrome", () => {
  it("accentOn replie sur primaryDark quand l'accent se confond avec la surface", () => {
    const soft = resolveSocialTheme({ preset: "sauge", fontPreset: "chaleureux" }, null, "soft");
    expect(accentOn(soft, soft.soft)).toEqual({ bg: soft.primaryDark, fg: "#ffffff" });
    const primary = resolveSocialTheme({ preset: "sauge", fontPreset: "chaleureux" }, null, "primary");
    expect(accentOn(primary, primary.soft)).toEqual({ bg: primary.accent, fg: primary.onAccent });
  });
});

describe("templates", () => {
  it("photoGeometry suit le template, la taille et le rôle", () => {
    expect(photoGeometry("photo-titre", "square", "single")).toEqual({ w: 1080, h: 1080 });
    expect(photoGeometry("photo-titre", "story", "single")).toEqual({ w: 1080, h: 960 });
    expect(photoGeometry("story-rappel", "story", "single")).toEqual({ w: 1080, h: 960 });
    expect(photoGeometry("carrousel-etapes", "portrait", "cover")).toEqual({ w: 1080, h: 1350 });
    expect(photoGeometry("carrousel-etapes", "portrait", "page")).toBeNull();
    expect(photoGeometry("affirmation", "square", "single")).toBeNull();
    expect(photoGeometry("avis", "square", "single")).toBeNull();
  });
});

describe("cache", () => {
  const ctx = smokeContext("chaleureux");
  const base = { post: smokePost("question-reponse"), ctx, size: "square" as const, slideIndex: 0, preview: false };

  it("renderKey est stable et sensible à chaque ingrédient", () => {
    const key = renderKey(base);
    expect(key).toMatch(/^[0-9a-f]{20}$/);
    expect(renderKey(base)).toBe(key);
    expect(renderKey({ ...base, preview: true })).not.toBe(key);
    expect(renderKey({ ...base, size: "portrait" })).not.toBe(key);
    expect(renderKey({ ...base, post: { ...base.post, accentColor: "#c26a7d" } })).not.toBe(key);
    expect(renderKey({ ...base, ctx: { ...ctx, brand: { ...ctx.brand, city: "Toulouse" } } })).not.toBe(key);
    expect(renderKey({ ...base, ctx: { ...ctx, siteTheme: { preset: "ocean", fontPreset: "moderne" } } })).not.toBe(key);
    const slides = base.post.content.slides.map((s) => ({ ...s, title: "Autre titre" }));
    expect(renderKey({ ...base, post: { ...base.post, content: { ...base.post.content, slides } } })).not.toBe(key);
  });

  it("assetSlot et pruneRenders", () => {
    expect(assetSlot("square", 2, true)).toBe("square:2:preview");
    const renders = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [
        `square:${i}:full`,
        { key: `k${i}`, url: null, bytes: 1, renderedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString() },
      ]),
    );
    const kept = pruneRenders(renders);
    expect(Object.keys(kept)).toHaveLength(12);
    expect(kept["square:14:full"]).toBeDefined();
    expect(kept["square:0:full"]).toBeUndefined();
  });
});

describe("rendu", () => {
  it("charge les 4 presets de polices (Heading 700, Body 400/700)", async () => {
    for (const preset of FONT_PRESETS) {
      const fonts = await loadFonts(preset);
      expect(fonts.map((f) => `${f.name}:${f.weight}`)).toEqual(["Heading:700", "Body:400", "Body:700"]);
      for (const f of fonts) expect(f.data.length).toBeGreaterThan(10_000);
    }
    expect((await loadFonts("inconnu"))[0]!.data).toBe((await loadFonts("chaleureux"))[0]!.data);
  });

  it("rend un JPEG 1080×1080 et un aperçu 540 px", async () => {
    const full = await renderSlide({ post: smokePost("liste-conseils"), ctx: smokeContext("moderne"), size: "square", slideIndex: 0, preview: false });
    const meta = await sharp(full.data).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1080, 1080]);
    expect(full.data.length).toBeLessThan(250 * 1024);
    const preview = await renderSlide({ post: smokePost("liste-conseils"), ctx: smokeContext("moderne"), size: "square", slideIndex: 0, preview: true });
    const pmeta = await sharp(preview.data).metadata();
    expect([pmeta.width, pmeta.height]).toEqual([540, 540]);
    expect(preview.data.length).toBeLessThan(80 * 1024);
  });

  it("refuse une diapositive hors limites", async () => {
    await expect(
      renderSlide({ post: smokePost("affirmation"), ctx: smokeContext("elegant"), size: "square", slideIndex: 3, preview: false }),
    ).rejects.toThrow(/Diapositive 3 introuvable/);
  });
});

// Garde-fou : fflate reste utilisable sur des Buffer Node (ZIP des téléchargements)
describe("fflate", () => {
  it("unzipSync relit un ZIP sans compression", () => {
    const zip = buildZip([{ name: "a.txt", data: Buffer.from("abc") }]);
    expect(Object.keys(unzipSync(zip))).toEqual(["a.txt"]);
  });
});
