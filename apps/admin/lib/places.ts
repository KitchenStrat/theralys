/**
 * Recherche de fiche Google (formulaires démo). Délègue au provider partagé :
 * API Places réelle avec GOOGLE_PLACES_API_KEY, mock déterministe sinon.
 */

import { createGooglePlacesProvider, type GooglePlaceResult } from "@theralys/providers/google";

export type PlaceResult = GooglePlaceResult;

export function getPlacesProvider() {
  return createGooglePlacesProvider();
}
