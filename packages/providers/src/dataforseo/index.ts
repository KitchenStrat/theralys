/**
 * DataForSEO (https://api.dataforseo.com/v3) : données publiques Google Maps
 * sans validation d'API Google — relevés de positions (SERP Maps) point par
 * point, fiche d'établissement (Business Data) et avis (tâches asynchrones).
 *
 * Auth : Basic base64(login:password), variables DATAFORSEO_LOGIN et
 * DATAFORSEO_PASSWORD. Sans elles (ou avec DATAFORSEO_MOCK=1), le mock
 * déterministe prend le relais : démos locales, tests, CI.
 *
 * Coûts (USD, facturés par DataForSEO et renvoyés dans chaque réponse
 * `tasks[].cost`) : Maps live advanced ≈ 0,002 $/tâche ; my_business_info
 * live ≈ 0,0054 $ ; avis ≈ 0,00075 $ par tranche de 10 (file standard).
 * `ProviderResult.costUsd` est le coût **réel** renvoyé par l'API (0 en mock),
 * à inscrire dans `google_usage` par l'appelant.
 *
 * Endpoints :
 * - POST /serp/google/maps/live/advanced  — tableau de tâches
 *   { keyword, location_coordinate: "lat,lng,14z", language_code: "fr", depth: 20 }
 *   → tasks[].result[0].items[] (type "maps_search" : rank_absolute, title,
 *   place_id, cid, rating{value,votes_count}, category, total_photos, is_claimed…)
 * - POST /business_data/google/my_business_info/live — { keyword: "cid:…" ou
 *   "place_id:…", location_coordinate: "lat,lng,1000", language_code: "fr" }
 *   → items[0] (title, description, category, additional_categories, address,
 *   phone, url, domain, total_photos, is_claimed, attributes, rating,
 *   rating_distribution, work_time, book_online_url, latitude, longitude…)
 * - POST /business_data/google/reviews/task_post — { keyword: "place_id:…",
 *   location_coordinate, language_code: "fr", depth, sort_by: "newest" }
 *   puis GET /business_data/google/reviews/task_get/{id} → items[]
 *   (review_id, rating.value, timestamp, profile_name, profile_image_url,
 *   review_text, owner_answer, owner_timestamp, review_url).
 */

import type { GeoPoint, GoogleMapsListing, GoogleProfileSnapshot } from "@theralys/shared";

// ─── Résultats ───────────────────────────────────────────────────────────────

export type ProviderMode = "dataforseo" | "mock";

export type ProviderResult<T> = {
  data: T;
  /** Coût réel facturé par DataForSEO (USD), 0 en mock */
  costUsd: number;
  mode: ProviderMode;
};

export type MapsSearchInput = {
  keyword: string;
  /** Point d'observation (centre d'une cellule de grille) */
  point: GeoPoint;
  /** Niveau de zoom Google Maps (GOOGLE_GRID.zoom) */
  zoom: number;
  /** Nombre de résultats (≤ 20 suffit : au-delà le rang n'a plus d'intérêt) */
  depth?: number;
};

export type BusinessInfoInput = {
  placeId: string | null;
  cid: string | null;
  /** Nom de la fiche (repli de recherche si ni placeId ni cid) */
  title: string | null;
  /** Position approximative (ville) pour désambiguïser */
  near: GeoPoint | null;
};

export type ReviewsTaskInput = {
  placeId: string | null;
  cid: string | null;
  near: GeoPoint | null;
  /** Multiple de 10 (GOOGLE_REVIEWS_SYNC_DEPTH) */
  depth: number;
};

export type GoogleReviewItem = {
  /** Identifiant stable DataForSEO (review_id) */
  sourceReviewId: string;
  authorName: string;
  authorPhotoUrl: string | null;
  /** 1..5 */
  rating: number;
  text: string;
  reviewedAt: Date | null;
  ownerReply: string | null;
  ownerRepliedAt: Date | null;
  reviewUrl: string | null;
};

export type ReviewsTaskResult =
  | { status: "pending" }
  | { status: "done"; reviews: GoogleReviewItem[]; total: number | null; rating: number | null }
  | { status: "error"; message: string };

/**
 * Fournisseur « recherche locale » : une implémentation réelle (DataForSEO)
 * et un mock déterministe de même forme. Toute méthode peut lever (réseau,
 * 4xx/5xx, solde insuffisant) : l'appelant journalise et n'inscrit aucun coût.
 */
export interface LocalSearchProvider {
  readonly mode: ProviderMode;
  /**
   * Plusieurs tâches Maps en un appel (grille) : même ordre que `inputs`.
   * L'implémentation réelle découpe en lots (≤ 20 tâches par requête HTTP,
   * concurrence limitée) et renvoie le coût total.
   */
  mapsSearch(inputs: MapsSearchInput[]): Promise<ProviderResult<GoogleMapsListing[][]>>;
  /** Fiche d'établissement complète, null si introuvable. */
  businessInfo(input: BusinessInfoInput): Promise<ProviderResult<GoogleProfileSnapshot | null>>;
  /** Lance la récupération des avis ; le résultat se lit avec fetchReviewsTask. */
  postReviewsTask(input: ReviewsTaskInput): Promise<ProviderResult<{ taskId: string }>>;
  /** État d'une tâche d'avis (pending tant que DataForSEO n'a pas fini, ~1 à 5 min). */
  fetchReviewsTask(taskId: string): Promise<ProviderResult<ReviewsTaskResult>>;
}

export const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";

// ─── Mock déterministe ───────────────────────────────────────────────────────

/** Hachage 31 bits stable (même graine → mêmes rangs, mêmes avis). */
export function hash31(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h & 0x7fffffff;
}

const MOCK_COMPETITORS = [
  { title: "Cabinet Équilibre & Sérénité", cid: "mock-cid-1", rating: 4.8, votes: 61, category: "Sophrologue", totalPhotos: 14 },
  { title: "Espace Respire", cid: "mock-cid-2", rating: 4.9, votes: 27, category: "Praticien bien-être", totalPhotos: 9 },
  { title: "Marie Lenoir — Sophrologie", cid: "mock-cid-3", rating: 5, votes: 18, category: "Sophrologue", totalPhotos: 6 },
  { title: "Centre Harmonie du Corps", cid: "mock-cid-4", rating: 4.6, votes: 112, category: "Centre de bien-être", totalPhotos: 40 },
  { title: "Pause Zen Thérapies", cid: "mock-cid-5", rating: 4.7, votes: 9, category: "Praticien de médecine douce", totalPhotos: 3 },
  { title: "Atelier du Souffle", cid: "mock-cid-6", rating: 4.4, votes: 33, category: "Sophrologue", totalPhotos: 11 },
  { title: "Cabinet Lumière Intérieure", cid: "mock-cid-7", rating: 4.9, votes: 44, category: "Hypnothérapeute", totalPhotos: 21 },
];

/** Fiche mock « propre » : le cabinet relié (placeId de MockGooglePlacesProvider ou réel). */
export const MOCK_OWN_LISTING = { title: "Votre cabinet", placeId: "mock-own", cid: "mock-own-cid" } as const;

export class MockLocalSearchProvider implements LocalSearchProvider {
  readonly mode = "mock" as const;
  private readonly tasks = new Map<string, { postedAt: number; input: ReviewsTaskInput }>();

  constructor(private readonly own: { placeId: string | null; cid: string | null; title: string | null } = MOCK_OWN_LISTING) {}

  async mapsSearch(inputs: MapsSearchInput[]): Promise<ProviderResult<GoogleMapsListing[][]>> {
    const data = inputs.map((input, index) => {
      // Le cabinet est mieux classé près de son centre (index central de la grille) ; rang 1..20 ou absent
      const seed = hash31(`${input.keyword}|${input.point.lat.toFixed(3)}|${input.point.lng.toFixed(3)}`);
      const distanceFactor = Math.abs(index - Math.floor(inputs.length / 2)) / Math.max(1, inputs.length);
      const ownRank = Math.min(21, 1 + Math.floor((seed % 7) * (0.4 + distanceFactor * 2)));
      const order = [...MOCK_COMPETITORS].sort((a, b) => hash31(`${seed}${a.cid}`) - hash31(`${seed}${b.cid}`));
      const listings: GoogleMapsListing[] = [];
      let rank = 1;
      for (let i = 0; listings.length < Math.min(input.depth ?? 20, 8); i++) {
        if (rank === ownRank) {
          listings.push({ rank, title: this.own.title ?? MOCK_OWN_LISTING.title, placeId: this.own.placeId, cid: this.own.cid, rating: 4.9, votes: 34, category: "Sophrologue", totalPhotos: 7, isClaimed: true });
        } else {
          const c = order[i % order.length]!;
          listings.push({ rank, title: c.title, placeId: `mock-place-${c.cid}`, cid: c.cid, rating: c.rating, votes: c.votes, category: c.category, totalPhotos: c.totalPhotos, isClaimed: true });
        }
        rank += 1;
      }
      return listings;
    });
    return { data, costUsd: 0, mode: "mock" };
  }

  async businessInfo(input: BusinessInfoInput): Promise<ProviderResult<GoogleProfileSnapshot | null>> {
    if (!input.placeId && !input.cid && !input.title) return { data: null, costUsd: 0, mode: "mock" };
    const seed = hash31(input.placeId ?? input.cid ?? input.title ?? "");
    const data: GoogleProfileSnapshot = {
      source: "mock",
      fetchedAt: new Date().toISOString(),
      placeId: input.placeId,
      cid: input.cid ?? `mock-cid-${seed % 1000}`,
      title: input.title ?? MOCK_OWN_LISTING.title,
      description: seed % 3 === 0 ? null : "Sophrologue certifiée, je vous accompagne vers plus de sérénité au quotidien : gestion du stress, sommeil, préparation aux examens. Séances individuelles au cabinet ou en visio, sur rendez-vous.",
      category: "Sophrologue",
      additionalCategories: seed % 2 === 0 ? ["Praticien bien-être"] : [],
      address: "12 rue des Lilas, 81000 Albi",
      phone: seed % 4 === 0 ? null : "05 63 00 00 00",
      website: seed % 5 === 0 ? null : "https://exemple-harmony.fr",
      isClaimed: seed % 6 !== 0,
      rating: 4.9,
      votes: 34,
      ratingDistribution: { "1": 0, "2": 0, "3": 1, "4": 2, "5": 31 },
      totalPhotos: 3 + (seed % 12),
      hasHours: seed % 7 !== 0,
      hours: { lundi: ["09:00–19:00"], mardi: ["09:00–19:00"], mercredi: ["09:00–12:00"], jeudi: ["09:00–19:00"], vendredi: ["09:00–17:00"] },
      attributes: seed % 2 === 0 ? ["Sur rendez-vous", "Accès PMR"] : [],
      bookOnlineUrl: null,
      mainImage: null,
      location: input.near ?? { lat: 43.9289, lng: 2.1464 },
    };
    return { data, costUsd: 0, mode: "mock" };
  }

  async postReviewsTask(input: ReviewsTaskInput): Promise<ProviderResult<{ taskId: string }>> {
    const taskId = `mock-task-${hash31(JSON.stringify(input))}-${this.tasks.size + 1}`;
    this.tasks.set(taskId, { postedAt: Date.now(), input });
    return { data: { taskId }, costUsd: 0, mode: "mock" };
  }

  async fetchReviewsTask(taskId: string): Promise<ProviderResult<ReviewsTaskResult>> {
    // Les tâches inconnues (autre processus) sont considérées terminées : le mock n'a pas d'état durable
    const task = this.tasks.get(taskId);
    const depth = task?.input.depth ?? 10;
    const reviews = mockReviews(taskId, Math.min(depth, 12));
    return { data: { status: "done", reviews, total: 34, rating: 4.9 }, costUsd: 0, mode: "mock" };
  }
}

const MOCK_REVIEW_TEXTS = [
  "Un accueil chaleureux et une vraie écoute. Je ressors de chaque séance apaisée, je recommande vivement !",
  "Très à l'écoute et d'une grande douceur. Les exercices sont simples à refaire chez soi.",
  "Cabinet facile d'accès, praticienne ponctuelle et professionnelle. Les séances me font beaucoup de bien.",
  "Une vraie parenthèse dans ma semaine. Explications claires, je comprends enfin ce que je fais.",
  "Rendez-vous obtenu rapidement, séance agréable, mais le tarif reste un peu élevé pour moi.",
  "Je n'ai pas accroché : séance correcte mais j'attendais plus d'échanges. Locaux agréables cependant.",
  "Bienveillance et professionnalisme. J'ai retrouvé un meilleur sommeil au bout de quelques semaines.",
  "Difficile de joindre le cabinet par téléphone, mais une fois sur place, tout était parfait.",
  "Un suivi attentif entre les séances, des conseils adaptés. Merci pour votre accompagnement.",
  "Praticienne à l'écoute, horaires souples. Je recommande pour la gestion du stress.",
  "Bonne expérience globale, salle d'attente un peu bruyante.",
  "Excellente approche, très pédagogue. Je repars avec des outils concrets.",
];
const MOCK_AUTHORS = ["Camille D.", "Marie L.", "Thomas B.", "Sophie R.", "Nicolas P.", "Julie M.", "Antoine G.", "Léa F.", "Hugo V.", "Chloé T.", "Paul S.", "Inès K."];

export function mockReviews(seedText: string, count: number): GoogleReviewItem[] {
  const seed = hash31(seedText);
  return Array.from({ length: count }, (_, i) => {
    const text = MOCK_REVIEW_TEXTS[i % MOCK_REVIEW_TEXTS.length]!;
    const rating = i === 4 ? 4 : i === 5 ? 3 : i === 7 ? 4 : 5;
    const daysAgo = 6 + i * 23 + (seed % 5);
    const reviewedAt = new Date(Date.now() - daysAgo * 86_400_000);
    const answered = i % 3 === 0;
    return {
      sourceReviewId: `mock-review-${seed % 10000}-${i + 1}`,
      authorName: MOCK_AUTHORS[i % MOCK_AUTHORS.length]!,
      authorPhotoUrl: null,
      rating,
      text,
      reviewedAt,
      ownerReply: answered ? "Merci beaucoup pour votre retour, c'est un plaisir de vous accompagner. À bientôt au cabinet !" : null,
      ownerRepliedAt: answered ? new Date(reviewedAt.getTime() + 2 * 86_400_000) : null,
      reviewUrl: `https://www.google.com/maps/reviews/mock-${seed % 10000}-${i + 1}`,
    };
  });
}

// ─── Implémentation réelle ───────────────────────────────────────────────────

/**
 * Client DataForSEO réel — contrat ; implémentation complète (lots, retries,
 * normalisation des réponses, coût réel) dans le lot « fournisseur ».
 */
export class DataForSeoProvider implements LocalSearchProvider {
  readonly mode = "dataforseo" as const;
  constructor(
    private readonly login: string,
    private readonly password: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  protected authHeader(): string {
    return `Basic ${Buffer.from(`${this.login}:${this.password}`).toString("base64")}`;
  }

  async mapsSearch(_inputs: MapsSearchInput[]): Promise<ProviderResult<GoogleMapsListing[][]>> {
    void this.fetchImpl;
    throw new Error("DataForSeoProvider.mapsSearch : à implémenter");
  }
  async businessInfo(_input: BusinessInfoInput): Promise<ProviderResult<GoogleProfileSnapshot | null>> {
    throw new Error("DataForSeoProvider.businessInfo : à implémenter");
  }
  async postReviewsTask(_input: ReviewsTaskInput): Promise<ProviderResult<{ taskId: string }>> {
    throw new Error("DataForSeoProvider.postReviewsTask : à implémenter");
  }
  async fetchReviewsTask(_taskId: string): Promise<ProviderResult<ReviewsTaskResult>> {
    throw new Error("DataForSeoProvider.fetchReviewsTask : à implémenter");
  }
}

export function createLocalSearchProvider(
  env: NodeJS.ProcessEnv = process.env,
  own?: { placeId: string | null; cid: string | null; title: string | null },
): LocalSearchProvider {
  const mock = env.DATAFORSEO_MOCK === "1" || env.DATAFORSEO_MOCK === "true";
  if (!mock && env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD) {
    return new DataForSeoProvider(env.DATAFORSEO_LOGIN, env.DATAFORSEO_PASSWORD);
  }
  return new MockLocalSearchProvider(own);
}
