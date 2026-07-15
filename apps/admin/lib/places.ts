/**
 * Recherche de fiche Google (formulaire de création de démo).
 * Abstraction avec implémentation mock — la vraie API Places arrive quand la
 * clé sera disponible ; l'enrichissement complet (avis, photos, horaires) se
 * fait pendant la préparation de la démo.
 */

export type PlaceResult = {
  placeId: string;
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
};

export interface PlacesProvider {
  search(query: string): Promise<PlaceResult[]>;
}

class MockPlacesProvider implements PlacesProvider {
  async search(query: string): Promise<PlaceResult[]> {
    const q = query.trim();
    if (q.length < 3) return [];
    const base = q.charAt(0).toUpperCase() + q.slice(1);
    return [
      {
        placeId: `mock-${slugKey(q)}-1`,
        name: base,
        address: "12 rue des Lilas, France",
        rating: 4.9,
        reviewCount: 34,
      },
      {
        placeId: `mock-${slugKey(q)}-2`,
        name: `${base} — Cabinet du centre`,
        address: "3 place du Marché, France",
        rating: 4.7,
        reviewCount: 18,
      },
      {
        placeId: `mock-${slugKey(q)}-3`,
        name: `Espace bien-être ${base}`,
        address: "27 avenue de la Gare, France",
        rating: 5,
        reviewCount: 9,
      },
    ];
  }
}

function slugKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
}

export function getPlacesProvider(): PlacesProvider {
  // Un provider Google réel viendra se brancher ici (GOOGLE_PLACES_API_KEY)
  return new MockPlacesProvider();
}
