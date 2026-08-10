/**
 * Banque d'images (Pexels) pour les pages secondaires et les articles de blog :
 * de vraies photos adaptées au sujet, là où la génération IA reste réservée
 * aux trois photos principales de la page d'accueil.
 *
 * Pexels : API gratuite (200 req/h, 20 000 req/mois), photos libres
 * d'utilisation commerciale sans attribution, servies par leur CDN avec
 * recadrage à la volée. Sans PEXELS_API_KEY, un mock SVG déterministe prend
 * le relais (démos locales, tests).
 */

import { MockImageProvider, type ImageProvider } from "./images";

export type StockImage = {
  url: string;
  provider: "pexels" | "mock";
};

export interface StockImageProvider {
  readonly mode: "pexels" | "mock";
  /** Cherche une photo adaptée à la requête ; null si aucun résultat. */
  find(request: {
    query: string;
    width: number;
    height: number;
    /** Graine de variation : deux pages au même sujet reçoivent des photos différentes. */
    seed?: string;
  }): Promise<StockImage | null>;
}

export class PexelsStockProvider implements StockImageProvider {
  readonly mode = "pexels" as const;
  constructor(private readonly apiKey: string) {}

  async find(request: {
    query: string;
    width: number;
    height: number;
    seed?: string;
  }): Promise<StockImage | null> {
    const orientation = request.width >= request.height ? "landscape" : "portrait";
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(request.query)}&per_page=10&orientation=${orientation}`,
      { headers: { Authorization: this.apiKey } },
    );
    if (!response.ok) {
      throw new Error(`Pexels ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const data = (await response.json()) as {
      photos?: { src?: { original?: string } }[];
    };
    const photos = (data.photos ?? []).filter((p) => p.src?.original);
    if (photos.length === 0) return null;
    const pick = photos[hashCode(request.seed ?? request.query) % photos.length]!;
    // Recadrage exact par le CDN Pexels (paramètres imgix)
    const url = `${pick.src!.original}?auto=compress&cs=tinysrgb&fit=crop&w=${request.width}&h=${request.height}`;
    return { url, provider: "pexels" };
  }
}

/** Mock : réutilise l'illustration SVG déterministe du provider d'images. */
export class MockStockProvider implements StockImageProvider {
  readonly mode = "mock" as const;
  private readonly inner = new MockImageProvider();

  async find(request: {
    query: string;
    width: number;
    height: number;
    seed?: string;
  }): Promise<StockImage | null> {
    const image = await this.inner.generate({
      subject: `${request.query} ${request.seed ?? ""}`,
      width: request.width,
      height: request.height,
    });
    return { url: image.url, provider: "mock" };
  }
}

export function createStockImageProvider(
  env: NodeJS.ProcessEnv = process.env,
): StockImageProvider {
  if (env.STOCK_IMAGE_PROVIDER === "mock") return new MockStockProvider();
  if (env.PEXELS_API_KEY) return new PexelsStockProvider(env.PEXELS_API_KEY);
  return new MockStockProvider();
}

/**
 * Photo de banque d'abord, génération IA en repli : les pages gardent
 * toujours une image, même si Pexels est indisponible ou sans résultat.
 */
export async function findStockOrGenerate(
  stock: StockImageProvider,
  fallback: ImageProvider,
  request: {
    query: string;
    subject: string;
    seed?: string;
    themeColor?: string;
    width: number;
    height: number;
  },
): Promise<{ url: string; aiGenerated: boolean } | null> {
  try {
    const found = await stock.find({
      query: request.query,
      width: request.width,
      height: request.height,
      seed: request.seed,
    });
    if (found) return { url: found.url, aiGenerated: false };
  } catch (err) {
    console.warn(`[stock] recherche Pexels impossible (« ${request.query} ») :`, err);
  }
  try {
    const generated = await fallback.generate({
      subject: request.subject,
      themeColor: request.themeColor,
      width: request.width,
      height: request.height,
    });
    return { url: generated.url, aiGenerated: true };
  } catch (err) {
    console.warn(`[stock] repli IA impossible (« ${request.subject} ») :`, err);
    return null;
  }
}

/**
 * Requête de recherche anglaise dérivée d'un sujet français — utilisée quand
 * le modèle n'a pas fourni de `imageQuery` (repli, mock, anciens contenus).
 */
const QUERY_MAP: [RegExp, string][] = [
  [/stress|surmenage|burn.?out|charge mentale|pression/, "stress relief calm nature meditation"],
  [/sommeil|insomnie|dormir|nuit/, "peaceful sleep rest cozy bedroom"],
  [/dos|lombaire|cervical|articul|douleur|tension/, "back pain relief massage therapy"],
  [/anxi[ée]t[ée]|angoisse|peur|phobie/, "calm breathing serenity misty lake"],
  [/[ée]motion|humeur/, "emotional wellbeing peaceful nature"],
  [/confiance|estime/, "confident person sunrise open landscape"],
  [/grossesse|p[ée]rinatal|maternit[ée]|post.?partum|accouchement/, "pregnancy wellness serene mother"],
  [/enfant|adolescent|scolaire|b[ée]b[ée]/, "child calm outdoors gentle"],
  [/tabac|fumer|addiction|d[ée]pendance/, "freedom fresh air deep breath field"],
  [/poids|alimentation|digestion|intestin/, "healthy food fresh vegetables table"],
  [/fatigue|[ée]nergie|vitalit[ée]|[ée]puisement/, "morning energy nature soft light"],
  [/concentration|m[ée]moire|examen|travail/, "quiet focus desk plant window"],
  [/massage|toucher/, "relaxing massage spa towels"],
  [/hypno/, "hypnotherapy relaxation therapy session"],
  [/sophro|respiration|relaxation|coh[ée]rence/, "breathing exercise relaxation outdoors"],
  [/yoga|m[ée]ditation|pleine conscience/, "yoga meditation peaceful studio"],
  [/r[ée]flexo|pied|plantaire/, "foot reflexology massage"],
  [/reiki|[ée]nerg[ée]tique|magn[ée]tis|chakra/, "energy healing hands soft light"],
  [/naturopath|plante|phyto|huile|aromath/, "medicinal herbs natural remedies"],
  [/acupunct/, "acupuncture treatment wellness"],
  [/ost[ée]o|chiro|kin[ée]|manipulation/, "manual therapy practitioner care"],
  [/sport|performance|r[ée]cup[ée]ration/, "athlete stretching recovery outdoor"],
  [/couple|famille|relation/, "couple communication support"],
  [/deuil|s[ée]paration|perte/, "comfort supportive hands soft light"],
  [/m[ée]nopause|hormon|cycle|f[ée]minin/, "mature woman wellbeing serene"],
];

export function stockQueryFor(subject: string, profession?: string): string {
  const haystack = `${subject} ${profession ?? ""}`.toLowerCase();
  for (const [pattern, query] of QUERY_MAP) {
    if (pattern.test(haystack)) return query;
  }
  return "wellness serenity nature soft light";
}

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
