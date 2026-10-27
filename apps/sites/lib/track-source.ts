import { sourceFromReferrer, type AnalyticsSource } from "@theralys/shared";

/**
 * Provenance d'une page vue à l'ingestion (`/api/track`) :
 * - pages suivantes de la session (ni `referrer` ni `src` dans le payload) et
 *   clics RDV → null (non renseigné) ;
 * - referrer sur l'un des hôtes du site lui-même (navigation interne, retour
 *   depuis une page du site) → null, jamais « autres sites » ;
 * - sinon `sourceFromReferrer` : le `src` du lien de bio l'emporte, puis
 *   l'hôte du referrer, et un referrer vide vaut accès direct.
 */
export function resolveTrackSource(
  payload: { type: "pageview" | "rdv_click" | "call_click"; referrer?: string | undefined; src?: string | undefined },
  ownHosts: readonly string[],
): AnalyticsSource | null {
  if (payload.type !== "pageview") return null;
  if (payload.referrer === undefined && payload.src === undefined) return null;
  if (!payload.src && isOwnHost(payload.referrer, ownHosts)) return null;
  return sourceFromReferrer(payload.referrer, payload.src);
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
