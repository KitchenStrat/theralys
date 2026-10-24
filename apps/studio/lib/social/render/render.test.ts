import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import sharp from "sharp";
import { unzipSync } from "fflate";
import { ImageResponse } from "next/og";
import {
  FONT_PRESETS,
  SOCIAL_ACCENT_ROLES,
  SOCIAL_TEMPLATES,
  THEME_INTENSITIES,
  THEME_PRESETS,
  relativeLuminance,
  sizesFor,
  type SiteTheme,
} from "@theralys/shared";
import { buildZip } from "./bundle";
import { ASSETS_MAX_ENTRIES, assetSlot, blobPathname, pruneRenders, renderKey } from "./cache";
import { Brand, Pill, accentOn, photoGradient } from "./chrome";
import { FRAMES, fitBody, fitTitle } from "./frames";
import { loadFonts } from "./fonts";
import {
  clearImageCache,
  decodeDataUri,
  isAllowedImageUrl,
  loadImage,
  prepareImage,
  rewritePexelsUrl,
} from "./images";
import { renderSlide } from "./render";
import { RichBody, Title, cleanText, cleanTitle, mergePunctuation } from "./rich-text";
import { LONG_SLIDE, SMOKE_BRAND, SYMBOL_SLIDE, fixturePhoto, formatOf, smokeContext, smokePost } from "./fixtures";
import { photoGeometry } from "./templates";
import { contrastRatio, mix, onAccentColor, resolveSocialTheme, rgba, swatchesFor } from "./theme";

const square = FRAMES.square;
const PEXELS = "https://images.pexels.com/photos/1/pexels-photo-1.jpeg";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Hauteur d'encre (px) d'un élément rendu par satori sur fond blanc, à la largeur donnée. */
async function inkHeight(element: ReactElement, width: number, height: number): Promise<{ w: number; h: number }> {
  const fonts = await loadFonts("chaleureux");
  const wrapped = createElement(
    "div",
    { style: { display: "flex", width, height, backgroundColor: "#ffffff", color: "#000000" } },
    element,
  );
  const png = Buffer.from(await new ImageResponse(wrapped, { width, height, fonts }).arrayBuffer());
  const { info } = await sharp(png).trim({ background: "#ffffff", threshold: 20 }).toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height };
}

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

  it("data:URI : types et plafonds (JPEG/PNG/WebP/AVIF ≤ 4 Mo décodés, SVG ≤ 200 Ko)", () => {
    const b64 = (decodedBytes: number) => "A".repeat(Math.ceil((decodedBytes * 4) / 3));
    expect(isAllowedImageUrl("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
    expect(isAllowedImageUrl("data:image/webp;base64,UklGRg==")).toBe(true);
    expect(isAllowedImageUrl("data:image/avif;base64,AAAAHGZ0eXA=")).toBe(true);
    expect(isAllowedImageUrl("data:image/gif;base64,R0lGODlh")).toBe(false);
    expect(isAllowedImageUrl("data:image/bmp;base64,Qk0=")).toBe(false);
    expect(isAllowedImageUrl("data:image/x-icon;base64,AAAB")).toBe(false);
    expect(isAllowedImageUrl(`data:image/svg+xml;base64,${b64(200 * 1024)}`)).toBe(true);
    expect(isAllowedImageUrl(`data:image/svg+xml;base64,${b64(200 * 1024 + 4)}`)).toBe(false);
    expect(isAllowedImageUrl(`data:image/svg+xml,${"%3C".repeat(70_000)}`)).toBe(false);
    expect(isAllowedImageUrl(`data:image/png;base64,${b64(200 * 1024 + 4)}`)).toBe(true);
    expect(isAllowedImageUrl(`data:image/png;base64,${b64(4 * 1024 * 1024 + 4)}`)).toBe(false);
    expect(decodeDataUri("data:image/gif;base64,R0lGODlh")).toBeNull();
    expect(decodeDataUri(`data:image/svg+xml;base64,${b64(200 * 1024 + 4)}`)).toBeNull();
    expect(decodeDataUri("data:image/png;base64,iVBORw0KGgo=")?.length).toBe(8);
  });

  it("loadImage : 3xx jamais suivie, 5xx et délai = échec transitoire, hôte hors liste ou data: invalide = refus définitif", async () => {
    clearImageCache();
    const redirect = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/latest/meta-data" } }),
    );
    globalThis.fetch = redirect;
    expect(await loadImage(PEXELS, 100, 100)).toEqual({ status: "failed" });
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });

    globalThis.fetch = vi.fn<typeof fetch>(async () => new Response("oops", { status: 503 }));
    expect(await loadImage(PEXELS, 100, 100)).toEqual({ status: "failed" });
    globalThis.fetch = vi.fn<typeof fetch>(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect(await loadImage(PEXELS, 100, 100)).toEqual({ status: "failed" });
    globalThis.fetch = vi.fn<typeof fetch>(
      async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect(await loadImage(PEXELS, 100, 100)).toEqual({ status: "failed" });

    const forbidden = vi.fn<typeof fetch>(async () => {
      throw new Error("ne doit pas être appelé");
    });
    globalThis.fetch = forbidden;
    expect(await loadImage("https://example.com/x.jpg", 100, 100)).toEqual({ status: "refused" });
    expect(await loadImage(null, 100, 100)).toEqual({ status: "refused" });
    expect(await loadImage("data:image/png;base64,AAAA", 100, 100)).toEqual({ status: "refused" });
    expect(await loadImage("data:image/gif;base64,R0lGODlh", 100, 100)).toEqual({ status: "refused" });
    expect(forbidden).not.toHaveBeenCalled();

    const jpeg = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#336699" } }).jpeg().toBuffer();
    globalThis.fetch = vi.fn<typeof fetch>(
      async () => new Response(new Uint8Array(jpeg), { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    const ok = await loadImage(PEXELS, 120, 80);
    expect(ok.status).toBe("ok");
    if (ok.status === "ok") {
      const meta = await sharp(Buffer.from(ok.dataUri.split(",")[1]!, "base64")).metadata();
      expect([meta.width, meta.height]).toEqual([120, 80]);
    }
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
    expect(words.map((w) => w.word)).toEqual(["Pas", "tout\u00a0:", "«\u00a0oui\u00a0»", "60\u00a0%"]);
    expect(words.map((w) => w.bold)).toEqual([false, false, true, false]);
  });

  it("cleanText retire les symboles hors polices : flèches → tiret, coches et puces retirées, puces en tête → « - »", () => {
    expect(cleanText("Respirer → relâcher ✓ ▸ étape ➜ suite ⟶ fin")).toBe("Respirer – relâcher étape – suite – fin");
    expect(cleanText("✓ Inspirer\n→ Tenir\n▸ Expirer\n✅ Fin\n① Encore")).toBe("- Inspirer\n- Tenir\n- Expirer\n- Fin\n- Encore");
    expect(cleanText("Répéter ① ② ③ fois, Ω ≤ 3 min\u2009; ⌚ 20 h ✗ jamais")).toBe("Répéter fois, 3 min ; 20 h jamais");
    expect(cleanText("Durée\u202f: 60\u202f% ✔\ufe0f ok")).toBe("Durée\u00a0: 60\u00a0% ok");
    expect(cleanTitle("✓ Trois conseils ★")).toBe("Trois conseils");
    expect(cleanTitle("**Respirer**\n→ relâcher")).toBe("Respirer – relâcher");
    // Ce que les 12 polices couvrent reste intact (© ® ™ sont retirés en amont par stripEmoji)
    const safe = "« Déjà » : l'œuvre… — 60 % à 12 €, “ok” ’ ‹ › • † 2¹ ½ n°1 + ≠ −";
    expect(cleanText(safe)).toBe(safe);
  });
});

describe("chrome", () => {
  it("photoGradient garde du contraste avec le fond quand l'accent est clair (soft, pastille « Claire »)", () => {
    for (const preset of THEME_PRESETS) {
      const soft = resolveSocialTheme({ preset, fontPreset: "chaleureux" }, null, "soft");
      const light = resolveSocialTheme({ preset, fontPreset: "chaleureux" }, soft.background, "primary");
      for (const theme of [soft, light]) {
        const stops = photoGradient(theme).match(/#[0-9a-f]{6}/g) ?? [];
        expect(stops).toHaveLength(2);
        for (const stop of stops) expect(contrastRatio(stop, theme.background), `${preset} ${stop}`).toBeGreaterThanOrEqual(1.5);
      }
      const primary = resolveSocialTheme({ preset, fontPreset: "chaleureux" }, null, "primary");
      expect(photoGradient(primary)).toContain(primary.accent);
    }
  });

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
  const base = {
    post: smokePost("question-reponse"),
    ctx,
    size: "square" as const,
    slideIndex: 0,
    preview: false,
    reviewRating: null,
  };

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

  it("renderKey suit la note Google, l'adresse, la note de l'avis et le nombre de pages (tous dessinés)", () => {
    const key = renderKey(base);
    expect(renderKey({ ...base, ctx: { ...ctx, google: { rating: 3.9, reviewCount: 41 } } })).not.toBe(key);
    expect(renderKey({ ...base, ctx: { ...ctx, google: { rating: 4.9, reviewCount: 28 } } })).not.toBe(key);
    expect(renderKey({ ...base, ctx: { ...ctx, google: null } })).not.toBe(key);
    expect(renderKey({ ...base, ctx: { ...ctx, address: "2 place du Vigan, 81000 Albi" } })).not.toBe(key);
    expect(renderKey({ ...base, ctx: { ...ctx, address: null } })).not.toBe(key);
    expect(renderKey({ ...base, reviewRating: 2 })).not.toBe(key);
    expect(renderKey({ ...base, reviewRating: 5 })).not.toBe(key);
    const slides = [...base.post.content.slides, { ...base.post.content.slides[0]!, role: "page" as const }];
    expect(renderKey({ ...base, post: { ...base.post, content: { ...base.post.content, slides } } })).not.toBe(key);
  });

  it("assetSlot, blobPathname et pruneRenders (28 entrées : un carrousel complet tient)", () => {
    expect(assetSlot("square", 2, true)).toBe("square:2:preview");
    expect(blobPathname("site-1", "post-1", "square:2:preview")).toBe("social/site-1/post-1/square-2-preview.jpg");
    expect(ASSETS_MAX_ENTRIES).toBeGreaterThanOrEqual(7 * 2 * 2);
    const renders = Object.fromEntries(
      Array.from({ length: 31 }, (_, i) => [
        `square:${i}:full`,
        { key: `k${i}`, url: `https://blob/${i}.jpg`, bytes: 1, renderedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString() },
      ]),
    );
    const { kept, evicted } = pruneRenders(renders);
    expect(Object.keys(kept)).toHaveLength(28);
    expect(kept["square:30:full"]).toBeDefined();
    expect(kept["square:2:full"]).toBeUndefined();
    expect(Object.keys(evicted).sort()).toEqual(["square:0:full", "square:1:full", "square:2:full"]);
    expect(evicted["square:0:full"]?.url).toBe("https://blob/0.jpg");
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

  it("lineClamp borne un titre de 300 caractères à 3 lignes (ellipse) et une ligne grasse à sa hauteur", async () => {
    const title = await inkHeight(createElement(Title, { text: LONG_SLIDE.title, size: 40, maxLines: 3, color: "#000000" }), 600, 1400);
    expect(title.h).toBeGreaterThan(2 * 40); // il y a bien plusieurs lignes…
    expect(title.h).toBeLessThanOrEqual(Math.ceil(3 * 40 * 1.08) + 6); // …mais au plus trois
    const body = await inkHeight(
      createElement(RichBody, {
        text: `**Trois respirations** ${LONG_SLIDE.body.replace(/\n/g, " ")}`,
        size: 30,
        maxLines: 2,
        color: "#000000",
        strong: "#000000",
      }),
      600,
      1400,
    );
    expect(body.h).toBeGreaterThan(30);
    expect(body.h).toBeLessThanOrEqual(Math.ceil(2 * 30 * 1.35) + 4);
    const plain = await inkHeight(
      createElement(RichBody, { text: LONG_SLIDE.body.replace(/\n/g, " "), size: 30, maxLines: 2, color: "#000000", strong: "#000000" }),
      600,
      1400,
    );
    expect(plain.h).toBeLessThanOrEqual(Math.ceil(2 * 30 * 1.35) + 4);
  });

  it("lineClamp borne la pastille et la rangée de marque à une ligne, sans dépasser la largeur", async () => {
    const pill = await inkHeight(createElement(Pill, { text: LONG_SLIDE.badge!, bg: "#000000", fg: "#ffffff", size: 24 }), 600, 400);
    expect(pill.w).toBeLessThanOrEqual(600);
    expect(pill.h).toBeLessThanOrEqual(24 + 2 * Math.round(24 * 0.42) + 2);
    const theme = resolveSocialTheme({ preset: "lavande", fontPreset: "chaleureux" }, null, "primary");
    const brand = { ...SMOKE_BRAND, firstName: "Marie-Clémentine", lastName: "de Saint-Exupéry-Lamartine-Dupont-Durand" };
    const row = await inkHeight(createElement(Brand, { brand, frame: FRAMES.square, theme, tone: "light", logo: null }), 600, 400);
    expect(row.w).toBeLessThanOrEqual(600);
    expect(row.h).toBeLessThanOrEqual(56 + 2);
  });

  it("ne fait aucun appel réseau sur la matrice : polices embarquées, symboles nettoyés, images en data:URI", async () => {
    clearImageCache();
    const forbidden = vi.fn<typeof fetch>(async () => {
      throw new Error("réseau interdit pendant le rendu");
    });
    globalThis.fetch = forbidden;
    for (const fontPreset of FONT_PRESETS) {
      const ctx = smokeContext(fontPreset, "lavande", true);
      for (const template of SOCIAL_TEMPLATES) {
        const size = sizesFor(formatOf(template), template)[0]!;
        const image = await renderSlide({ post: smokePost(template), ctx, size, slideIndex: 0, preview: true, reviewRating: 4 });
        expect(image.degraded, `${fontPreset}/${template}`).toBe(false);
      }
      const symbols = await renderSlide({
        post: smokePost("question-reponse", [SYMBOL_SLIDE]),
        ctx,
        size: "square",
        slideIndex: 0,
        preview: true,
      });
      expect(symbols.degraded).toBe(false);
    }
    expect(forbidden).not.toHaveBeenCalled();
  }, 120_000);
});

// Garde-fou : fflate reste utilisable sur des Buffer Node (ZIP des téléchargements)
describe("fflate", () => {
  it("unzipSync relit un ZIP sans compression", () => {
    const zip = buildZip([{ name: "a.txt", data: Buffer.from("abc") }]);
    expect(Object.keys(unzipSync(zip))).toEqual(["a.txt"]);
  });
});
