/**
 * Recherche de fiche Google (formulaires démo). Délègue au provider partagé :
 * API Places réelle avec GOOGLE_PLACES_API_KEY, mock déterministe sinon.
 */

import { createGooglePlacesProvider, type GooglePlaceResult, type GooglePlacesProvider } from "@theralys/providers/google";
import { withApiUsage } from "@theralys/shared/usage-runtime";

export type PlaceResult = GooglePlaceResult;

/** Fournisseur dont les appels sont rattachés à la recherche d'établissements (registre des appels API). */
export function getPlacesProvider(): GooglePlacesProvider {
  const provider = createGooglePlacesProvider();
  return {
    mode: provider.mode,
    search: (query) => withApiUsage({ feature: "prospecting" }, () => provider.search(query)),
    fetchDetails: (placeId) => withApiUsage({ feature: "prospecting" }, () => provider.fetchDetails(placeId)),
  };
}
