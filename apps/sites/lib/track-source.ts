import { SOCIAL_SOURCE_PARAMS, sourceFromReferrer, type AnalyticsSource } from "@theralys/shared";

/**
 * Provenance d'un événement à l'ingestion (`/api/track`).
 *
 * Page vue :
 * - pages suivantes de la session (ni `referrer` ni `src` dans le payload)
 *   → null (non renseigné) ;
 * - referrer sur l'un des hôtes du site lui-même (navigation interne, retour
 *   depuis une page du site) → null, jamais « autres sites » ;
 * - sinon `sourceFromReferrer` : le `src` (lien de bio, annonce Google)
 *   l'emporte, puis l'hôte du referrer, et un referrer vide vaut accès direct.
 *
 * Clics (RDV, appel) : le `src` de session mémorisé par le navigateur s'il
 * correspond à une provenance connue (`SOCIAL_SOURCE_PARAMS`), sinon null —
 * jamais « accès direct », le referrer n'étant pas significatif pour un clic.
 */
export function resolveTrackSource(
  payload: { type: "pageview" | "rdv_click" | "call_click"; referrer?: string | undefined; src?: string | undefined },
  ownHosts: readonly string[],
): AnalyticsSource | null {
  if (payload.type !== "pageview") return clickSource(payload.src);
  if (payload.referrer === undefined && payload.src === undefined) return null;
  if (!payload.src && isOwnHost(payload.referrer, ownHosts)) return null;
  return sourceFromReferrer(payload.referrer, payload.src);
}

/** Provenance d'un clic d'après le `src` de session : connue ou null, jamais « direct ». */
export function clickSource(src: string | undefined): AnalyticsSource | null {
  const key = src?.trim().toLowerCase();
  return key ? (SOCIAL_SOURCE_PARAMS[key] ?? null) : null;
}

/** Le referrer pointe-t-il sur le site lui-même ? (comparaison d'hôtes, sans port, insensible à la casse) */
export function isOwnHost(referrer: string | undefined, ownHosts: readonly string[]): boolean {
  if (!referrer) return false;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return false;
  }
  return ownHosts.some((own) => own !== "" && own.toLowerCase() === host);
}

/**
 * Hôtes considérés comme « le site » : l'hôte de la requête (celui que le
 * visiteur a tapé), le domaine personnalisé du site, l'hôte de SITES_BASE_URL
 * et DEMO_HOST (démos servies sous /<slug>).
 */
export function ownHostsFor(
  requestHost: string | null,
  site: { domain: string | null },
  env: Record<string, string | undefined> = process.env,
): string[] {
  const hosts = new Set<string>();
  const add = (value: string | null | undefined) => {
    const host = (value ?? "").split(":")[0]?.trim().toLowerCase();
    if (host) hosts.add(host);
  };
  add(requestHost);
  add(site.domain);
  if (env.SITES_BASE_URL) {
    try {
      add(new URL(env.SITES_BASE_URL).hostname);
    } catch {
      // SITES_BASE_URL malformée : ignorée
    }
  }
  add(env.DEMO_HOST);
  return [...hosts];
}
