/**
 * Communes d'une région française (API publique « Découpage administratif »,
 * https://geo.api.gouv.fr, sans clé). La bibliothèque publicitaire Meta nomme
 * les villes ciblées sans leur département (« Épernay, France ») : la liste
 * des communes de la région du praticien permet de dire lesquelles sont dans
 * son département et dans sa région, et de chercher aussi les annonces des
 * grandes villes voisines.
 */

import { normalizeAdsText } from "@theralys/shared";

export const GEO_API_BASE = "https://geo.api.gouv.fr";
export const GEO_TIMEOUT_MS = 8_000;
/** Attente avant l'unique relance (ms). */
export const GEO_RETRY_DELAY_MS = 600;
/** Borne de sécurité sur la réponse (la plus grande région compte ≈ 5 000 communes). */
export const GEO_COMMUNES_MAX = 12_000;

export type FrCommune = { name: string; departmentCode: string; population: number };

export function regionCommunesUrl(regionCode: string): string {
  return `${GEO_API_BASE}/communes?codeRegion=${encodeURIComponent(regionCode)}&fields=nom,codeDepartement,population&format=json`;
}

/** Entrée de l'API → commune ; null si le nom ou le département manque. */
export function communeFromItem(item: unknown): FrCommune | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as { nom?: unknown; codeDepartement?: unknown; population?: unknown };
  if (typeof raw.nom !== "string" || typeof raw.codeDepartement !== "string") return null;
  const name = raw.nom.replace(/\s+/g, " ").trim().slice(0, 80);
  const departmentCode = raw.codeDepartement.trim().toUpperCase();
  if (name === "" || !/^(\d{2,3}|2[AB])$/.test(departmentCode)) return null;
  const population = typeof raw.population === "number" && Number.isFinite(raw.population) ? Math.max(0, Math.trunc(raw.population)) : 0;
  return { name, departmentCode, population };
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
  // Une relance : les coupures de connexion ponctuelles ne doivent pas priver la veille de son index local
  try {
    return await attempt();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, opts.retryDelayMs ?? GEO_RETRY_DELAY_MS));
    return attempt();
  }
}

/** Population à partir de laquelle une ville voisine vaut une recherche. */
export const NEARBY_CITY_MIN_POPULATION = 3_000;

/**
 * Plus grandes villes du département, hors celle du praticien : la
 * bibliothèque n'a pas de filtre géographique, on y cherche donc aussi
 * « métier + ville voisine ».
 */
export function nearbyCitiesFrom(communes: readonly FrCommune[], departmentCode: string, city: string, max = 3): string[] {
  const own = normalizeAdsText(city);
  return communes
    .filter((c) => c.departmentCode === departmentCode && c.population >= NEARBY_CITY_MIN_POPULATION && normalizeAdsText(c.name) !== own)
    .sort((a, b) => b.population - a.population || a.name.localeCompare(b.name, "fr"))
    .slice(0, max)
    .map((c) => c.name);
}
