/**
 * Fiche Google (Places API « New ») : recherche d'établissement et
 * récupération des vrais avis. Sans GOOGLE_PLACES_API_KEY, un mock
 * déterministe prend le relais (démos locales, tests).
 *
 * Coûts indicatifs : Text Search ~0,032 $/requête, Place Details avec avis
 * ~0,025 $/requête — négligeable à notre échelle.
 * Limite API : Google renvoie au maximum 5 avis (les plus pertinents).
 */

export type GooglePlaceResult = {
  placeId: string;
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
};

export type GooglePlaceReview = {
  sourceReviewId: string | null;
  authorName: string;
  rating: number;
  text: string;
  reviewedAt: Date | null;
};

export type GooglePlaceDetails = {
  rating: number | null;
  reviewCount: number | null;
  reviews: GooglePlaceReview[];
};

export interface GooglePlacesProvider {
  readonly mode: "google" | "mock";
  search(query: string): Promise<GooglePlaceResult[]>;
  fetchDetails(placeId: string): Promise<GooglePlaceDetails>;
}

const PLACES_BASE = "https://places.googleapis.com/v1";

export class RealGooglePlacesProvider implements GooglePlacesProvider {
  readonly mode = "google" as const;
  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<GooglePlaceResult[]> {
    if (query.trim().length < 3) return [];
    const response = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "fr", regionCode: "FR" }),
    });
    if (!response.ok) {
      throw new Error(`Places search ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const data = (await response.json()) as {
      places?: {
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        rating?: number;
        userRatingCount?: number;
      }[];
    };
    return (data.places ?? [])
      .filter((p) => p.id)
      .slice(0, 6)
      .map((p) => ({
        placeId: p.id!,
        name: p.displayName?.text ?? "Établissement",
        address: p.formattedAddress ?? "",
        rating: p.rating ?? 0,
        reviewCount: p.userRatingCount ?? 0,
      }));
  }

  async fetchDetails(placeId: string): Promise<GooglePlaceDetails> {
    const response = await fetch(
      `${PLACES_BASE}/places/${encodeURIComponent(placeId)}?languageCode=fr`,
      {
        headers: {
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": "id,rating,userRatingCount,reviews",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Places details ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const data = (await response.json()) as {
      rating?: number;
      userRatingCount?: number;
      reviews?: {
        name?: string;
        rating?: number;
        text?: { text?: string };
        originalText?: { text?: string };
        authorAttribution?: { displayName?: string };
        publishTime?: string;
      }[];
    };
    return {
      rating: data.rating ?? null,
      reviewCount: data.userRatingCount ?? null,
      reviews: (data.reviews ?? [])
        .map((r) => ({
          sourceReviewId: r.name ?? null,
          authorName: r.authorAttribution?.displayName ?? "Client Google",
          rating: Math.round(r.rating ?? 5),
          text: r.text?.text ?? r.originalText?.text ?? "",
          reviewedAt: r.publishTime ? new Date(r.publishTime) : null,
        }))
        .filter((r) => r.text.length > 0),
    };
  }
}

/** Mock déterministe : mêmes formes que l'API réelle, pour démos et tests. */
export class MockGooglePlacesProvider implements GooglePlacesProvider {
  readonly mode = "mock" as const;

  async search(query: string): Promise<GooglePlaceResult[]> {
    const q = query.trim();
    if (q.length < 3) return [];
    const base = q.charAt(0).toUpperCase() + q.slice(1);
    return [
      { placeId: `mock-${slugKey(q)}-1`, name: base, address: "12 rue des Lilas, France", rating: 4.9, reviewCount: 34 },
      { placeId: `mock-${slugKey(q)}-2`, name: `${base} — Cabinet du centre`, address: "3 place du Marché, France", rating: 4.7, reviewCount: 18 },
      { placeId: `mock-${slugKey(q)}-3`, name: `Espace bien-être ${base}`, address: "27 avenue de la Gare, France", rating: 5, reviewCount: 9 },
    ];
  }

  async fetchDetails(placeId: string): Promise<GooglePlaceDetails> {
    const authors = ["Camille D.", "Marie L.", "Thomas B.", "Sophie R.", "Nicolas P."];
    return {
      rating: 4.9,
      reviewCount: 34,
      reviews: authors.map((authorName, i) => ({
        sourceReviewId: `${placeId}-avis-${i + 1}`,
        authorName,
        rating: i === 3 ? 4 : 5,
        text: [
          "Un accueil chaleureux et une vraie écoute. Je ressors de chaque séance apaisé(e), je recommande vivement !",
          "Un moment hors du temps. Professionnalisme et bienveillance, je recommande les yeux fermés.",
          "Très à l'écoute et de grande douceur. Je ressors détendu(e) comme rarement.",
          "Cabinet facile d'accès et praticien(ne) très professionnel(le). Les séances me font beaucoup de bien.",
          "Une vraie parenthèse dans ma semaine, des conseils simples et efficaces à refaire chez soi.",
        ][i]!,
        reviewedAt: new Date(Date.UTC(2026, 5 - i, 12)),
      })),
    };
  }
}

export function createGooglePlacesProvider(
  env: NodeJS.ProcessEnv = process.env,
): GooglePlacesProvider {
  if (env.GOOGLE_PLACES_API_KEY) return new RealGooglePlacesProvider(env.GOOGLE_PLACES_API_KEY);
  return new MockGooglePlacesProvider();
}

function slugKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
}
