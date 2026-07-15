/**
 * Génération d'images d'articles (abstraction ImageProvider).
 *
 * Provider retenu au kickoff Phase 2 : fal.ai (FLUX.1 [schnell]) — facturé au
 * mégapixel (~0,003 $/MP), soit ≈ 0,0024 $ par image d'article en 1024×768,
 * contre 0,003 $ fixe chez Replicate. À l'échelle (100 clients Scale,
 * 208 articles/an) : ≈ 50 $/an vs 62 $/an.
 *
 * Sans FAL_API_KEY (ou avec IMAGE_PROVIDER=mock), le provider mock renvoie
 * une illustration SVG déterministe accordée au thème du site.
 */

export type ImageRequest = {
  /** Sujet de l'illustration, ex. le titre de l'article */
  subject: string;
  /** Ambiance visuelle, ex. « massage bien-être, huiles, lumière douce » */
  mood?: string;
  /** Couleur dominante du thème du site (hex), utilisée par le mock */
  themeColor?: string;
  width?: number;
  height?: number;
};

export type GeneratedImage = {
  url: string;
  aiGenerated: boolean;
  provider: "fal" | "mock";
};

export interface ImageProvider {
  generate(request: ImageRequest): Promise<GeneratedImage>;
}

const FAL_MODEL = "fal-ai/flux/schnell";

export class FalImageProvider implements ImageProvider {
  constructor(private readonly apiKey: string) {}

  async generate(request: ImageRequest): Promise<GeneratedImage> {
    const prompt = buildImagePrompt(request);
    const response = await fetch(`https://fal.run/${FAL_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_size: { width: request.width ?? 1024, height: request.height ?? 768 },
        num_images: 1,
        enable_safety_checker: true,
      }),
    });
    if (!response.ok) {
      throw new Error(`fal.ai ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const data = (await response.json()) as { images?: { url?: string }[] };
    const url = data.images?.[0]?.url;
    if (!url) throw new Error("fal.ai : réponse sans image");
    return { url, aiGenerated: true, provider: "fal" };
  }
}

/** Prompt d'image : photographie douce, jamais de visage reconnaissable. */
export function buildImagePrompt(request: ImageRequest): string {
  return [
    `Photographie éditoriale apaisante pour un blog de bien-être : ${request.subject}.`,
    request.mood ?? "Ambiance chaleureuse, lumière naturelle douce, tons neutres.",
    "Pas de texte, pas de logo, pas de visage reconnaissable en gros plan.",
  ].join(" ");
}

/**
 * Mock : SVG déterministe (dégradé + vagues) encodé en data URI.
 * Aucun stockage nécessaire, rendu identique pour une même entrée.
 */
export class MockImageProvider implements ImageProvider {
  async generate(request: ImageRequest): Promise<GeneratedImage> {
    const width = request.width ?? 1024;
    const height = request.height ?? 768;
    const color = request.themeColor ?? "#b05038";
    const seed = hashCode(request.subject);
    const waves = [0, 1, 2]
      .map((i) => {
        const amp = 40 + ((seed >> (i * 3)) % 50);
        const y = height * (0.45 + i * 0.18);
        return `<path d="M0 ${y} Q ${width / 4} ${y - amp}, ${width / 2} ${y} T ${width} ${y} V ${height} H 0 Z" fill="${color}" opacity="${0.12 + i * 0.1}"/>`;
      })
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.16"/><stop offset="100%" stop-color="${color}" stop-opacity="0.38"/></linearGradient></defs><rect width="${width}" height="${height}" fill="#faf6f0"/><rect width="${width}" height="${height}" fill="url(#g)"/>${waves}<circle cx="${width * 0.78}" cy="${height * 0.24}" r="${Math.min(width, height) * 0.09}" fill="${color}" opacity="0.35"/></svg>`;
    return {
      url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      aiGenerated: true,
      provider: "mock",
    };
  }
}

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function createImageProvider(env: NodeJS.ProcessEnv = process.env): ImageProvider {
  if (env.IMAGE_PROVIDER === "mock") return new MockImageProvider();
  if (env.FAL_API_KEY) return new FalImageProvider(env.FAL_API_KEY);
  return new MockImageProvider();
}
