/**
 * Communes d'une région française (API publique « Découpage administratif »,
 * https://geo.api.gouv.fr, sans clé). La bibliothèque publicitaire Meta nomme
 * les villes ciblées sans leur département (« Épernay, France ») : la liste
 * des communes de la région du praticien permet de dire lesquelles sont dans
 * son département et dans sa région, et de chercher aussi les annonces des
 * villes voisines (les coordonnées des communes disent lesquelles sont
 * proches).
 */

import { distanceKm, normalizeAdsText } from "@theralys/shared";
import { trackApiCall } from "@theralys/shared/usage-runtime";

export const GEO_API_BASE = "https://geo.api.gouv.fr";
export const GEO_TIMEOUT_MS = 8_000;
/** Attente avant l'unique relance (ms). */
export const GEO_RETRY_DELAY_MS = 600;
/** Borne de sécurité sur la réponse (la plus grande région compte ≈ 5 000 communes). */
export const GEO_COMMUNES_MAX = 12_000;

export type FrCommune = { name: string; departmentCode: string; population: number; /** Centre de la commune (degrés), quand le référentiel le donne */ lat?: number; lng?: number };

export function regionCommunesUrl(regionCode: string): string {
  return `${GEO_API_BASE}/communes?codeRegion=${encodeURIComponent(regionCode)}&fields=nom,codeDepartement,population,centre&format=json`;
}

/** Centre d'une commune (`{ type: "Point", coordinates: [longitude, latitude] }`) ; null s'il manque ou sort des bornes. */
function centreFrom(value: unknown): { lat: number; lng: number } | null {
  const coordinates = value && typeof value === "object" ? (value as { coordinates?: unknown }).coordinates : null;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lng, lat] = coordinates as unknown[];
  if (typeof lng !== "number" || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** Entrée de l'API → commune ; null si le nom ou le département manque. */
export function communeFromItem(item: unknown): FrCommune | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as { nom?: unknown; codeDepartement?: unknown; population?: unknown; centre?: unknown };
  if (typeof raw.nom !== "string" || typeof raw.codeDepartement !== "string") return null;
  const name = raw.nom.replace(/\s+/g, " ").trim().slice(0, 80);
  const departmentCode = raw.codeDepartement.trim().toUpperCase();
  if (name === "" || !/^(\d{2,3}|2[AB])$/.test(departmentCode)) return null;
  const population = typeof raw.population === "number" && Number.isFinite(raw.population) ? Math.max(0, Math.trunc(raw.population)) : 0;
  const centre = centreFrom(raw.centre);
  return { name, departmentCode, population, ...(centre ?? {}) };
}

/**
 * Communes d'une région (code INSEE à deux chiffres), avec une relance. Lève
 * si les deux tentatives échouent (réseau, délai, réponse illisible) :
 * l'appelant s'en passe, la veille fonctionne sans l'index des communes.
 */
export async function fetchRegionCommunes(regionCode: string, opts: { fetchImpl?: typeof fetch; timeoutMs?: number; retryDelayMs?: number } = {}): Promise<FrCommune[]> {
  if (!/^\d{2}$/.test(regionCode)) throw new Error(`Code de région invalide : ${regionCode}`);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const attempt = async (): Promise<FrCommune[]> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? GEO_TIMEOUT_MS);
    try {
      const response = await fetchImpl(regionCommunesUrl(regionCode), { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw new Error(`geo.api.gouv.fr HTTP ${response.status}`);
      const json: unknown = await response.json();
      if (!Array.isArray(json)) throw new Error("geo.api.gouv.fr : réponse inattendue");
      return json.slice(0, GEO_COMMUNES_MAX).map(communeFromItem).filter((c): c is FrCommune => c !== null);
    } finally {
      clearTimeout(timer);
    }
  };
  // Registre des appels API : service public gratuit, compté pour l'activité
  return trackApiCall(
    { provider: "geo_api", operation: "communes", costSource: "free" },
    async () => {
      // Une relance : les coupures de connexion ponctuelles ne doivent pas priver la veille de son index local
      try {
        return await attempt();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, opts.retryDelayMs ?? GEO_RETRY_DELAY_MS));
        return attempt();
      }
    },
    (communes) => ({ units: communes.length }),
  );
}

/** Population à partir de laquelle une ville voisine vaut une recherche. */
export const NEARBY_CITY_MIN_POPULATION = 3_000;

/** Rayon des « alentours » du praticien (km) : les villes voisines y sont cherchées en priorité. */
export const NEARBY_CITY_RADIUS_KM = 30;

function located(commune: FrCommune): commune is FrCommune & { lat: number; lng: number } {
  return typeof commune.lat === "number" && typeof commune.lng === "number";
}

/**
 * Villes voisines du praticien, hors la sienne : la bibliothèque n'a pas de
 * filtre géographique, on y cherche donc aussi « métier + ville voisine ».
 * D'abord les deux plus peuplées à moins de NEARBY_CITY_RADIUS_KM (ses
 * alentours, quel que soit le département), puis la plus grande ville de son
 * département, puis le reste dans le même ordre. Sans coordonnées (ville
 * introuvable dans le référentiel) : les plus grandes villes du département.
 */
export function nearbyCitiesFrom(communes: readonly FrCommune[], departmentCode: string, city: string, max = 3): string[] {
  const own = normalizeAdsText(city);
  const byPopulation = (a: FrCommune, b: FrCommune) => b.population - a.population || a.name.localeCompare(b.name, "fr");
  const eligible = communes.filter((c) => c.population >= NEARBY_CITY_MIN_POPULATION && normalizeAdsText(c.name) !== own);
  const home = communes.find((c) => c.departmentCode === departmentCode && normalizeAdsText(c.name) === own && located(c));
  const close = home && located(home) ? eligible.filter((c) => located(c) && distanceKm(home, c) <= NEARBY_CITY_RADIUS_KM).sort(byPopulation) : [];
  const department = eligible.filter((c) => c.departmentCode === departmentCode).sort(byPopulation);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const commune of [...close.slice(0, 2), ...department.slice(0, 1), ...close.slice(2), ...department.slice(1)]) {
    const key = normalizeAdsText(commune.name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(commune.name);
  }
  return names.slice(0, Math.max(0, max));
}
