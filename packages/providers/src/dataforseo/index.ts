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

/** Délai maximal d'une requête HTTP (ms) : au-delà, elle est abandonnée (AbortController). */
export const DATAFORSEO_TIMEOUT_MS = 60_000;
/** Requêtes simultanées pour une grille (DataForSEO tolère 30 appels en vol par compte). */
export const DATAFORSEO_CONCURRENCY = 8;
/** Rayon (m) autour du point d'observation pour la fiche et les avis (minimum DataForSEO : 199,9). */
export const DATAFORSEO_NEAR_RADIUS_M = 1000;
/** Critère géographique Google « France » : repli quand aucune coordonnée n'est connue. */
export const DATAFORSEO_FRANCE_LOCATION_CODE = 2250;

const STATUS_OK = 20000;
const STATUS_TASK_CREATED = 20100;
/** 40601 « Task Handed », 40602 « Task In Queue » : la tâche n'est pas encore terminée. */
const STATUS_PENDING = new Set([40601, 40602]);

/** Jour anglais → français (clés de `work_time.work_hours.timetable`). */
const DAYS_FR: Record<string, string> = {
  monday: "lundi",
  tuesday: "mardi",
  wednesday: "mercredi",
  thursday: "jeudi",
  friday: "vendredi",
  saturday: "samedi",
  sunday: "dimanche",
};

/** Libellés français des attributs Google courants pour un cabinet ; sinon l'identifiant est humanisé. */
const ATTRIBUTE_LABELS_FR: Record<string, string> = {
  wheelchair_accessible_entrance: "Entrée accessible PMR",
  wheelchair_accessible_parking_lot: "Parking accessible PMR",
  wheelchair_accessible_restroom: "Toilettes accessibles PMR",
  wheelchair_accessible_seating: "Places assises accessibles PMR",
  appointment_required: "Sur rendez-vous",
  appointments_recommended: "Rendez-vous recommandé",
  offers_online_appointments: "Rendez-vous en ligne",
  online_appointments: "Rendez-vous en ligne",
  online_care: "Consultations à distance",
  onsite_services: "Services sur place",
  identifies_as_women_owned: "Entreprise dirigée par une femme",
  lgbtq_friendly: "LGBTQ+ friendly",
  transgender_safespace: "Espace sûr pour les personnes trans",
  credit_cards: "Cartes bancaires acceptées",
  debit_cards: "Cartes de débit acceptées",
  nfc_mobile_payments: "Paiement sans contact",
  cash_only: "Espèces uniquement",
  checks: "Chèques acceptés",
  free_parking_lot: "Parking gratuit",
  free_street_parking: "Stationnement gratuit dans la rue",
  paid_parking_lot: "Parking payant",
  paid_street_parking: "Stationnement payant dans la rue",
  gender_neutral_restroom: "Toilettes non genrées",
  restroom: "Toilettes",
  wi_fi: "Wi-Fi",
  free_wi_fi: "Wi-Fi gratuit",
  language_assistance: "Aide linguistique",
};

// ─── Formes des réponses DataForSEO (sous-ensemble exploité) ─────────────────

type DfsTask<R> = {
  id?: string;
  status_code?: number;
  status_message?: string;
  cost?: number | null;
  result?: R[] | null;
};

type DfsResponse<R> = {
  status_code?: number;
  status_message?: string;
  cost?: number | null;
  tasks?: DfsTask<R>[] | null;
};

type DfsRating = { value?: number | null; votes_count?: number | null } | null;

type DfsTimeOfDay = { hour?: number; minute?: number } | null;
type DfsTimetable = Record<string, { open?: DfsTimeOfDay; close?: DfsTimeOfDay }[] | null> | null;
type DfsWorkTime = { work_hours?: { timetable?: DfsTimetable; current_status?: string | null } | null } | null;

export type DfsMapsItem = {
  type?: string;
  rank_absolute?: number | null;
  rank_group?: number | null;
  title?: string | null;
  place_id?: string | null;
  cid?: string | null;
  rating?: DfsRating;
  category?: string | null;
  total_photos?: number | null;
  is_claimed?: boolean | null;
};
type DfsMapsResult = { items?: DfsMapsItem[] | null };

export type DfsBusinessItem = {
  type?: string;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  additional_categories?: (string | null)[] | null;
  cid?: string | null;
  place_id?: string | null;
  address?: string | null;
  phone?: string | null;
  url?: string | null;
  main_image?: string | null;
  total_photos?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  is_claimed?: boolean | null;
  attributes?: { available_attributes?: Record<string, (string | null)[] | null> | null } | null;
  rating?: DfsRating;
  rating_distribution?: Record<string, number | null> | null;
  work_time?: DfsWorkTime;
  book_online_url?: string | null;
};
type DfsBusinessResult = { items?: DfsBusinessItem[] | null };

export type DfsReviewItem = {
  type?: string;
  review_id?: string | null;
  review_text?: string | null;
  timestamp?: string | null;
  rating?: DfsRating;
  profile_name?: string | null;
  profile_image_url?: string | null;
  owner_answer?: string | null;
  owner_timestamp?: string | null;
  review_url?: string | null;
};
type DfsReviewsResult = {
  reviews_count?: number | null;
  rating?: DfsRating;
  items?: DfsReviewItem[] | null;
};

// ─── Normalisation ───────────────────────────────────────────────────────────

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** « lat,lng,14z » (Maps : zoom de 3z à 21z). */
function mapsCoordinate(point: GeoPoint, zoom: number): string {
  return `${point.lat},${point.lng},${Math.max(3, Math.min(21, Math.round(zoom)))}z`;
}

/** Fiche et avis : « lat,lng,rayon(m) » autour du point, sinon le critère géographique France. */
function nearLocation(near: GeoPoint | null): { location_coordinate: string } | { location_code: number } {
  return near
    ? { location_coordinate: `${near.lat},${near.lng},${DATAFORSEO_NEAR_RADIUS_M}` }
    : { location_code: DATAFORSEO_FRANCE_LOCATION_CODE };
}

/**
 * Dates DataForSEO « 2024-05-15 14:09:32 +00:00 » (ou ISO 8601) → Date ;
 * null si absente ou invalide.
 */
export function parseDataForSeoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(value.trim());
  const iso = m ? `${m[1]}T${m[2]}${m[3] ?? "Z"}` : value.trim();
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** « wheelchair_accessible_entrance » → « Entrée accessible PMR » ; inconnu → « Wheelchair accessible entrance ». */
export function attributeLabel(id: string): string {
  const key = id.trim().toLowerCase();
  const known = ATTRIBUTE_LABELS_FR[key];
  if (known) return known;
  const words = key.replace(/[_\s]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Horaires par jour en français (« 09:00–12:00 ») ; null si la structure n'est pas celle attendue. */
function hoursFromTimetable(timetable: DfsTimetable | undefined): Record<string, string[]> | null {
  if (!timetable || typeof timetable !== "object") return null;
  const hours: Record<string, string[]> = {};
  for (const [day, ranges] of Object.entries(timetable)) {
    const label = DAYS_FR[day.toLowerCase()];
    if (!label || !Array.isArray(ranges)) continue;
    const lines: string[] = [];
    for (const range of ranges) {
      const open = range?.open;
      const close = range?.close;
      if (typeof open?.hour !== "number" || typeof close?.hour !== "number") continue;
      lines.push(`${pad2(open.hour)}:${pad2(open.minute ?? 0)}–${pad2(close.hour)}:${pad2(close.minute ?? 0)}`);
    }
    if (lines.length > 0) hours[label] = lines;
  }
  return hours;
}

function ratingDistribution(value: DfsBusinessItem["rating_distribution"]): GoogleProfileSnapshot["ratingDistribution"] {
  if (!value || typeof value !== "object") return null;
  const out = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let any = false;
  for (const star of ["1", "2", "3", "4", "5"] as const) {
    const n = numberOrNull(value[star]);
    if (n !== null) {
      out[star] = n;
      any = true;
    }
  }
  return any ? out : null;
}

/** Items « maps_search » d'un point → liste ordonnée par `rank_absolute`, ≤ depth. */
export function normalizeMapsItems(items: DfsMapsItem[], depth: number): GoogleMapsListing[] {
  return items
    .filter((item) => (item.type === undefined || item.type === "maps_search") && textOrNull(item.title) !== null)
    .map((item, index) => ({
      rank: numberOrNull(item.rank_absolute) ?? numberOrNull(item.rank_group) ?? index + 1,
      title: item.title!.trim(),
      placeId: textOrNull(item.place_id),
      cid: textOrNull(item.cid),
      rating: numberOrNull(item.rating?.value),
      votes: numberOrNull(item.rating?.votes_count),
      category: textOrNull(item.category),
      totalPhotos: numberOrNull(item.total_photos),
      isClaimed: typeof item.is_claimed === "boolean" ? item.is_claimed : null,
    }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, depth);
}

/** Item « google_business_info » → instantané de la fiche (`source: "dataforseo"`). */
export function snapshotFromBusinessItem(item: DfsBusinessItem, fetchedAt: Date): GoogleProfileSnapshot {
  const workTime = item.work_time;
  const hours = hoursFromTimetable(workTime?.work_hours?.timetable);
  const hasHours = workTime === undefined ? null : hours !== null && Object.keys(hours).length > 0;
  const available = item.attributes?.available_attributes;
  const attributes =
    available && typeof available === "object"
      ? [
          ...new Set(
            Object.values(available)
              .flatMap((list) => (Array.isArray(list) ? list : []))
              .filter((id): id is string => typeof id === "string" && id.trim() !== "")
              .map(attributeLabel),
          ),
        ]
      : [];
  const lat = numberOrNull(item.latitude);
  const lng = numberOrNull(item.longitude);
  return {
    source: "dataforseo",
    fetchedAt: fetchedAt.toISOString(),
    placeId: textOrNull(item.place_id),
    cid: textOrNull(item.cid),
    title: textOrNull(item.title) ?? "",
    description: typeof item.description === "string" ? item.description.trim() : null,
    category: textOrNull(item.category),
    additionalCategories: (item.additional_categories ?? [])
      .filter((c): c is string => typeof c === "string" && c.trim() !== "")
      .map((c) => c.trim()),
    address: textOrNull(item.address),
    phone: textOrNull(item.phone),
    website: textOrNull(item.url),
    isClaimed: typeof item.is_claimed === "boolean" ? item.is_claimed : null,
    rating: numberOrNull(item.rating?.value),
    votes: numberOrNull(item.rating?.votes_count),
    ratingDistribution: ratingDistribution(item.rating_distribution),
    totalPhotos: numberOrNull(item.total_photos),
    hasHours,
    hours: hours && Object.keys(hours).length > 0 ? hours : null,
    attributes,
    bookOnlineUrl: textOrNull(item.book_online_url),
    mainImage: textOrNull(item.main_image),
    location: lat !== null && lng !== null ? { lat, lng } : null,
  };
}

/** Item « google_reviews_search » → avis normalisé ; null sans `review_id`. */
export function reviewFromItem(item: DfsReviewItem): GoogleReviewItem | null {
  const id = textOrNull(item.review_id);
  if (!id || (item.type !== undefined && item.type !== "google_reviews_search")) return null;
  const rating = Math.round(numberOrNull(item.rating?.value) ?? 5);
  return {
    sourceReviewId: id,
    authorName: textOrNull(item.profile_name) ?? "Client Google",
    authorPhotoUrl: textOrNull(item.profile_image_url),
    rating: Math.max(1, Math.min(5, rating)),
    text: typeof item.review_text === "string" ? item.review_text.trim() : "",
    reviewedAt: parseDataForSeoDate(item.timestamp),
    ownerReply: textOrNull(item.owner_answer),
    ownerRepliedAt: parseDataForSeoDate(item.owner_timestamp),
    reviewUrl: textOrNull(item.review_url),
  };
}

/**
 * Applique `fn` à chaque élément avec au plus `limit` exécutions simultanées ;
 * résultats dans l'ordre des entrées. À la première erreur, plus aucune tâche
 * n'est lancée et l'erreur est propagée.
 */
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index]!, index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.name === "AbortError" ? "délai dépassé" : err.message.slice(0, 200);
  return String(err).slice(0, 200);
}

// ─── Client ──────────────────────────────────────────────────────────────────

export type DataForSeoOptions = {
  /** Délai par requête (ms), défaut DATAFORSEO_TIMEOUT_MS */
  timeoutMs?: number;
  /** Requêtes simultanées pour une grille, défaut DATAFORSEO_CONCURRENCY */
  concurrency?: number;
};

/**
 * Client DataForSEO réel. Chaque endpoint « live » n'accepte qu'une tâche par
 * appel HTTP : une grille de 49 points = 49 appels, lancés avec une
 * concurrence bornée (résultats dans l'ordre des entrées). Délai de 60 s par
 * requête, une nouvelle tentative sur erreur 5xx ou réseau. Les erreurs sont
 * explicites (`DataForSEO <endpoint> <statut>: <message>`) et ne contiennent
 * jamais les identifiants. Le coût rendu est la somme des `tasks[].cost`
 * renvoyés par l'API.
 */
export class DataForSeoProvider implements LocalSearchProvider {
  readonly mode = "dataforseo" as const;
  private readonly timeoutMs: number;
  private readonly concurrency: number;

  constructor(
    private readonly login: string,
    private readonly password: string,
    private readonly fetchImpl: typeof fetch = fetch,
    options: DataForSeoOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DATAFORSEO_TIMEOUT_MS;
    this.concurrency = options.concurrency ?? DATAFORSEO_CONCURRENCY;
  }

  protected authHeader(): string {
    return `Basic ${Buffer.from(`${this.login}:${this.password}`).toString("base64")}`;
  }

  /**
   * Un appel HTTP (JSON) : délai, une nouvelle tentative sur 5xx ou erreur
   * réseau, statut général vérifié (20000). Renvoie les tâches et le coût total.
   */
  protected async request<R>(
    endpoint: string,
    init: { method: "GET" | "POST"; body?: unknown },
  ): Promise<{ tasks: DfsTask<R>[]; cost: number }> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        let response: Response;
        try {
          response = await this.fetchImpl(`${DATAFORSEO_BASE}${endpoint}`, {
            method: init.method,
            headers: {
              Authorization: this.authHeader(),
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
            signal: controller.signal,
          });
        } catch (err) {
          lastError = new Error(`DataForSEO ${endpoint} réseau: ${describeError(err)}`);
          continue;
        }
        if (response.status >= 500) {
          lastError = new Error(`DataForSEO ${endpoint} ${response.status}: ${await this.bodyExcerpt(response)}`);
          continue;
        }
        if (!response.ok) {
          throw new Error(`DataForSEO ${endpoint} ${response.status}: ${await this.bodyExcerpt(response)}`);
        }
        const json = (await response.json()) as DfsResponse<R>;
        if (json.status_code !== STATUS_OK) {
          throw new Error(
            `DataForSEO ${endpoint} ${json.status_code ?? "?"}: ${json.status_message ?? "réponse invalide"}`,
          );
        }
        const tasks = json.tasks ?? [];
        return { tasks, cost: round6(tasks.reduce((sum, task) => sum + (numberOrNull(task.cost) ?? 0), 0)) };
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new Error(`DataForSEO ${endpoint}: échec`);
  }

  private async bodyExcerpt(response: Response): Promise<string> {
    try {
      const text = (await response.text()).replace(/\s+/g, " ").trim();
      return text === "" ? response.statusText || "sans détail" : text.slice(0, 200);
    } catch {
      return response.statusText || "sans détail";
    }
  }

  private taskError(endpoint: string, task: DfsTask<unknown> | undefined): Error {
    return new Error(
      `DataForSEO ${endpoint} ${task?.status_code ?? "?"}: ${task?.status_message ?? "tâche absente de la réponse"}`,
    );
  }

  async mapsSearch(inputs: MapsSearchInput[]): Promise<ProviderResult<GoogleMapsListing[][]>> {
    const endpoint = "/serp/google/maps/live/advanced";
    const results = await mapConcurrent(inputs, this.concurrency, async (input) => {
      const depth = Math.max(1, Math.min(100, input.depth ?? 20));
      const { tasks, cost } = await this.request<DfsMapsResult>(endpoint, {
        method: "POST",
        body: [
          {
            keyword: input.keyword,
            location_coordinate: mapsCoordinate(input.point, input.zoom),
            language_code: "fr",
            depth,
          },
        ],
      });
      const task = tasks[0];
      if (!task || task.status_code !== STATUS_OK) throw this.taskError(endpoint, task);
      return { listings: normalizeMapsItems(task.result?.[0]?.items ?? [], depth), cost };
    });
    return {
      data: results.map((r) => r.listings),
      costUsd: round6(results.reduce((sum, r) => sum + r.cost, 0)),
      mode: "dataforseo",
    };
  }

  async businessInfo(input: BusinessInfoInput): Promise<ProviderResult<GoogleProfileSnapshot | null>> {
    const endpoint = "/business_data/google/my_business_info/live";
    const keyword = input.cid
      ? `cid:${input.cid}`
      : input.placeId
        ? `place_id:${input.placeId}`
        : textOrNull(input.title);
    if (!keyword) return { data: null, costUsd: 0, mode: "dataforseo" };
    const { tasks, cost } = await this.request<DfsBusinessResult>(endpoint, {
      method: "POST",
      body: [{ keyword, ...nearLocation(input.near), language_code: "fr" }],
    });
    const task = tasks[0];
    if (!task || task.status_code !== STATUS_OK) throw this.taskError(endpoint, task);
    const item = (task.result?.[0]?.items ?? []).find(
      (it) => it.type === undefined || it.type === "google_business_info",
    );
    return { data: item ? snapshotFromBusinessItem(item, new Date()) : null, costUsd: cost, mode: "dataforseo" };
  }

  async postReviewsTask(input: ReviewsTaskInput): Promise<ProviderResult<{ taskId: string }>> {
    const endpoint = "/business_data/google/reviews/task_post";
    if (!input.placeId && !input.cid) {
      throw new Error(`DataForSEO ${endpoint}: identifiant de fiche manquant (place_id ou cid)`);
    }
    const depth = Math.max(10, Math.ceil(input.depth / 10) * 10);
    const { tasks, cost } = await this.request<unknown>(endpoint, {
      method: "POST",
      body: [
        {
          ...(input.placeId ? { place_id: input.placeId } : { cid: input.cid }),
          ...nearLocation(input.near),
          language_code: "fr",
          depth,
          sort_by: "newest",
        },
      ],
    });
    const task = tasks[0];
    const created = task?.status_code === STATUS_TASK_CREATED || task?.status_code === STATUS_OK;
    if (!task?.id || !created) throw this.taskError(endpoint, task);
    return { data: { taskId: task.id }, costUsd: cost, mode: "dataforseo" };
  }

  async fetchReviewsTask(taskId: string): Promise<ProviderResult<ReviewsTaskResult>> {
    if (!/^[A-Za-z0-9-]{1,80}$/.test(taskId)) {
      throw new Error("DataForSEO /business_data/google/reviews/task_get: identifiant de tâche invalide");
    }
    const endpoint = `/business_data/google/reviews/task_get/${taskId}`;
    const { tasks, cost } = await this.request<DfsReviewsResult>(endpoint, { method: "GET" });
    const task = tasks[0];
    if (!task) {
      return { data: { status: "error", message: "tâche absente de la réponse" }, costUsd: cost, mode: "dataforseo" };
    }
    if (task.status_code !== undefined && STATUS_PENDING.has(task.status_code)) {
      return { data: { status: "pending" }, costUsd: cost, mode: "dataforseo" };
    }
    if (task.status_code !== STATUS_OK) {
      const message = `${task.status_code ?? "?"}: ${task.status_message ?? "erreur inconnue"}`.slice(0, 200);
      return { data: { status: "error", message }, costUsd: cost, mode: "dataforseo" };
    }
    const result = task.result?.[0];
    const reviews = (result?.items ?? []).map(reviewFromItem).filter((r): r is GoogleReviewItem => r !== null);
    return {
      data: {
        status: "done",
        reviews,
        total: numberOrNull(result?.reviews_count),
        rating: numberOrNull(result?.rating?.value),
      },
      costUsd: cost,
      mode: "dataforseo",
    };
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
