/**
 * Polices des visuels (§4.1) : 12 TTF sous licence OFL dans
 * `apps/studio/assets/fonts/` (titre Bold + corps Regular/Bold par preset),
 * lues par `fs.readFile` (pas de `fetch(file://)` : échoue sous undici) et
 * mémoïsées par processus. `next.config.ts` les embarque via
 * `outputFileTracingIncludes` pour les routes `/api/social/*`.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FontPreset } from "@theralys/shared";

export type SocialFont = {
  name: "Heading" | "Body";
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
};

const FONT_FILES: Record<FontPreset, { heading: string; body: string; bodyBold: string }> = {
  chaleureux: { heading: "Lora-Bold.ttf", body: "OpenSans-Regular.ttf", bodyBold: "OpenSans-Bold.ttf" },
  classique: {
    heading: "LibreBaskerville-Bold.ttf",
    body: "SourceSans3-Regular.ttf",
    bodyBold: "SourceSans3-Bold.ttf",
  },
  moderne: { heading: "Figtree-Bold.ttf", body: "Inter-Regular.ttf", bodyBold: "Inter-Bold.ttf" },
  elegant: { heading: "PlayfairDisplay-Bold.ttf", body: "Lato-Regular.ttf", bodyBold: "Lato-Bold.ttf" },
};

/** Dossier des polices : relatif au cwd du processus (apps/studio en dev comme sur Vercel). */
export function fontsDir(): string {
  return path.join(process.cwd(), "assets", "fonts");
}

const fileCache = new Map<string, Promise<Buffer>>();

function readFont(file: string): Promise<Buffer> {
  const cached = fileCache.get(file);
  if (cached) return cached;
  const pending = readFile(path.join(fontsDir(), file)).catch((err: unknown) => {
    // Un échec de lecture ne doit pas empoisonner le cache
    fileCache.delete(file);
    throw err;
  });
  fileCache.set(file, pending);
  return pending;
}

/**
 * Polices satori d'un preset (`Heading` 700, `Body` 400 et 700) ; preset
 * inconnu → « chaleureux ».
 */
export async function loadFonts(fontPreset: string | null | undefined): Promise<SocialFont[]> {
  const files = FONT_FILES[fontPreset as FontPreset] ?? FONT_FILES.chaleureux;
  const [heading, body, bodyBold] = await Promise.all([
    readFont(files.heading),
    readFont(files.body),
    readFont(files.bodyBold),
  ]);
  return [
    { name: "Heading", data: heading, weight: 700, style: "normal" },
    { name: "Body", data: body, weight: 400, style: "normal" },
    { name: "Body", data: bodyBold, weight: 700, style: "normal" },
  ];
}
