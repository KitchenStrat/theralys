/**
 * Script de fumée du rendu (§8.1) : 9 templates × tailles autorisées × 4
 * presets de police sur une fixture (site de démo), images écrites hors
 * dépôt (SOCIAL_SMOKE_DIR, sinon apps/studio/.smoke/ — gitignoré), avec le
 * temps et le poids de chaque image ; échoue au-delà de 1,5 s ou 250 Ko.
 *
 *   SOCIAL_SMOKE=1 pnpm --filter @theralys/studio exec vitest run \
 *     --config lib/social/render/vitest.config.ts smoke
 *
 * (tsx n'est pas dans l'espace de travail : le script s'exécute via vitest,
 * qui compile le JSX des templates.)
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FONT_PRESETS, SOCIAL_TEMPLATES, sizesFor, type SocialSize, type ThemePreset } from "@theralys/shared";
import { SMOKE_SLIDES, STRESS_SLIDE, fixturePhoto, formatOf, singleSlide, smokeContext, smokePost } from "./fixtures";
import { renderSlide, type RenderContext, type RenderablePost } from "./render";

export const SMOKE_MAX_MS = 1_500;
export const SMOKE_MAX_BYTES = 250 * 1024;

export type SmokeCase = {
  name: string;
  post: RenderablePost;
  ctx: RenderContext;
  size: SocialSize;
  slideIndex: number;
};

/** Matrice : templates × tailles autorisées × presets (+ variantes logo, sans photo, stress). */
export function smokeCases(): SmokeCase[] {
  const cases: SmokeCase[] = [];
  const presets: ThemePreset[] = ["lavande", "terracotta", "ocean", "ambre"];
  FONT_PRESETS.forEach((fontPreset, p) => {
    const ctx = smokeContext(fontPreset, presets[p] ?? "lavande", p === 1);
    for (const template of SOCIAL_TEMPLATES) {
      const post = smokePost(template);
      for (const size of sizesFor(formatOf(template), template)) {
        post.content.slides.forEach((_, slideIndex) => {
          cases.push({ name: `${fontPreset}-${template}-${size}-${slideIndex}`, post, ctx, size, slideIndex });
        });
      }
    }
  });
  const ctx = smokeContext("chaleureux", "sauge");
  cases.push({ name: "variante-story-rappel-sans-photo-story-0", post: smokePost("story-rappel", singleSlide({ ...SMOKE_SLIDES["story-rappel"][0]!, imageUrl: undefined })), ctx, size: "story", slideIndex: 0 });
  cases.push({ name: "variante-accent-soft-affirmation-square-0", post: { ...smokePost("affirmation"), content: { ...smokePost("affirmation").content, accentRole: "soft" } }, ctx, size: "square", slideIndex: 0 });
  cases.push({ name: "variante-accent-deep-avis-square-0", post: { ...smokePost("avis"), content: { ...smokePost("avis").content, accentRole: "deep" } }, ctx, size: "square", slideIndex: 0 });
  cases.push({ name: "variante-accent-soft-liste-conseils-square-0", post: { ...smokePost("liste-conseils"), content: { ...smokePost("liste-conseils").content, accentRole: "soft" } }, ctx, size: "square", slideIndex: 0 });
  cases.push({ name: "variante-accent-hex-question-reponse-square-0", post: { ...smokePost("question-reponse"), accentColor: "#c26a7d" }, ctx, size: "square", slideIndex: 0 });
  for (const template of ["affirmation", "question-reponse", "liste-conseils", "photo-titre", "story-rappel"] as const) {
    const slide = template === "photo-titre" || template === "story-rappel" ? { ...STRESS_SLIDE, imageUrl: fixturePhoto(11) } : STRESS_SLIDE;
    for (const size of sizesFor(formatOf(template), template)) {
      cases.push({ name: `stress-${template}-${size}-0`, post: smokePost(template, [slide]), ctx, size, slideIndex: 0 });
    }
  }
  return cases;
}

export type SmokeResult = { name: string; ms: number; bytes: number; width: number; height: number };

export async function runSmoke(outDir: string): Promise<SmokeResult[]> {
  await mkdir(outDir, { recursive: true });
  const results: SmokeResult[] = [];
  // Échauffement (wasm satori + polices) : non compté
  await renderSlide({ post: smokePost("affirmation"), ctx: smokeContext("chaleureux"), size: "square", slideIndex: 0, preview: false });
  for (const c of smokeCases()) {
    const started = performance.now();
    const image = await renderSlide({ post: c.post, ctx: c.ctx, size: c.size, slideIndex: c.slideIndex, preview: false });
    const ms = Math.round(performance.now() - started);
    const meta = await sharp(image.data).metadata();
    await writeFile(path.join(outDir, `${c.name}.jpg`), image.data);
    results.push({ name: c.name, ms, bytes: image.data.length, width: meta.width ?? 0, height: meta.height ?? 0 });
  }
  return results;
}

describe.skipIf(!process.env.SOCIAL_SMOKE)("script de fumée du rendu", () => {
  it("rend la matrice sous 1,5 s et 250 Ko par image", async () => {
    const outDir = process.env.SOCIAL_SMOKE_DIR ?? path.join(process.cwd(), ".smoke");
    const results = await runSmoke(outDir);
    const lines = results.map((r) => `${r.name.padEnd(56)} ${String(r.ms).padStart(5)} ms ${String(Math.round(r.bytes / 1024)).padStart(4)} Ko ${r.width}x${r.height}`);
    await writeFile(path.join(outDir, "rapport.txt"), `${lines.join("\n")}\n`);
    console.info(`[smoke] ${results.length} images dans ${outDir}\n${lines.join("\n")}`);
    const slow = results.filter((r) => r.ms > SMOKE_MAX_MS).map((r) => `${r.name} (${r.ms} ms)`);
    const heavy = results.filter((r) => r.bytes > SMOKE_MAX_BYTES).map((r) => `${r.name} (${Math.round(r.bytes / 1024)} Ko)`);
    expect(slow, "images trop lentes").toEqual([]);
    expect(heavy, "images trop lourdes").toEqual([]);
    for (const r of results) {
      const size = r.name.includes("-story-") ? { w: 1080, h: 1920 } : r.name.includes("-portrait-") ? { w: 1080, h: 1350 } : { w: 1080, h: 1080 };
      expect({ name: r.name, w: r.width, h: r.height }).toEqual({ name: r.name, w: size.w, h: size.h });
    }
  }, 600_000);
});
