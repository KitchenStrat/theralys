import { createHash } from "node:crypto";

/**
 * Règles communes aux deux mesures d'audience — `/api/track` (site hébergé)
 * et `/api/m` (site du client) : reconnaissance des robots et identifiant
 * anonyme de visiteur. Une seule définition, pour que les deux mesures
 * comptent les visiteurs de la même façon.
 */

/** Robots (crawlers, aperçus, sondes) reconnus à leur User-Agent. */
export const BOT_UA = /bot|crawl|spider|slurp|lighthouse|headless|prerender|vercel-screenshot|monitor/i;

/** Les robots ne comptent ni en visiteurs ni en clics : leurs événements sont écartés à l'ingestion. */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  return BOT_UA.test(userAgent ?? "");
}

/**
 * Identifiant anonyme de visiteur, sans cookie ni stockage dans le
 * navigateur : empreinte hachée (sel secret, jour, IP, navigateur, périmètre)
 * à la façon des outils de mesure d'audience exemptés de consentement.
 * Le jour entre dans le calcul : l'identifiant change chaque jour et ne peut
 * pas être recoupé d'un jour sur l'autre. `scope` est la composante propre au
 * site mesuré : un même visiteur n'a pas le même identifiant d'un site à
 * l'autre. L'IP et le User-Agent ne servent qu'au calcul — ils ne sont ni
 * stockés ni journalisés.
 */
export function anonymousVisitorId(
  headers: Headers,
  scope: string,
  opts: { now?: Date; salt?: string } = {},
): string {
  const day = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "0.0.0.0";
  const userAgent = headers.get("user-agent") ?? "";
  const salt = opts.salt ?? process.env.AUTH_SECRET ?? "harmony-analytics";
  return `anon-${createHash("sha256")
    .update(`${salt}:${day}:${ip}:${userAgent}:${scope}`)
    .digest("hex")
    .slice(0, 32)}`;
}
