import type { Metadata } from "next";
import type { Site } from "@theralys/db";
import { activeExternalSite, isHostedSiteHidden, isSameSiteHost } from "@theralys/shared";

/**
 * Indexation du site hébergé par les moteurs de recherche — une seule règle
 * pour les métadonnées de toutes les pages, `robots.txt` et le plan du site.
 *
 * Trois cas :
 * - démo : jamais indexée, et son parcours est interdit (`Disallow`) ;
 * - site client : indexé, parcours autorisé, plan du site annoncé ;
 * - site client masqué (le propre site du client est la référence des
 *   outils) : pages en `noindex`, plan du site vide, mais parcours autorisé —
 *   un moteur qui n'a plus le droit de relire les pages ne verrait jamais le
 *   `noindex`, et un site déjà indexé resterait dans ses résultats.
 */

/** Ce que les règles d'indexation lisent d'un site. */
export type IndexedSite = Pick<Site, "type" | "theme" | "domain">;

/**
 * Le site hébergé est-il masqué derrière le site du client ? Oui tant que ce
 * dernier est la référence des outils (`isHostedSiteHidden`) — deux sites pour
 * un même cabinet se concurrenceraient dans les résultats. Sauf si le domaine
 * du site hébergé est celui de l'adresse connectée : le client a fait pointer
 * ce domaine vers le site hébergé, qui est donc devenu son site. Le masquer
 * le ferait disparaître des moteurs sans rien laisser à sa place.
 */
function isHiddenBehindOwnSite(site: Pick<Site, "theme" | "domain">): boolean {
  if (!isHostedSiteHidden(site.theme)) return false;
  const external = activeExternalSite(site.theme);
  const sameSite = Boolean(external && site.domain && isSameSiteHost(`https://${site.domain}`, external.url));
  return !sameSite;
}

/**
 * Le site hébergé peut-il être indexé ? Seulement un site client, et pas
 * tant qu'il est masqué derrière le propre site du client. Le site masqué
 * reste servi à qui en a le lien. Une démo n'est jamais indexée.
 */
export function isIndexable(site: IndexedSite): boolean {
  return site.type === "client" && !isHiddenBehindOwnSite(site);
}

/**
 * Les moteurs peuvent-ils parcourir le site ? Tout site client, même masqué :
 * c'est en relisant ses pages qu'un moteur découvre leur `noindex` et les
 * retire de ses résultats. Seules les démos sont fermées au parcours.
 */
export function isCrawlable(site: Pick<Site, "type">): boolean {
  return site.type === "client";
}

/** Directive des pages d'un site qui ne doit pas être indexé. */
export const NOINDEX = { index: false, follow: false } as const satisfies Metadata["robots"];

/**
 * Directive `robots` des métadonnées d'un site : `noindex, nofollow` s'il ne
 * doit pas être indexé, sinon rien (comportement par défaut des moteurs).
 * Posée par le layout du site, elle vaut pour toutes ses pages ; une page qui
 * fixe sa propre directive doit repartir de celle-ci.
 */
export function robotsMetadata(site: IndexedSite): Metadata["robots"] | undefined {
  return isIndexable(site) ? undefined : NOINDEX;
}

/**
 * Contenu de `robots.txt` pour un hôte : `site` est le site servi sur ce
 * domaine, s'il y en a un (aucun sur l'hôte des démos).
 * - pas de site, ou démo → tout est interdit ;
 * - site client indexé → parcours autorisé, plan du site annoncé ;
 * - site client masqué → parcours autorisé, sans plan du site (il est vide).
 */
export function robotsTxt(site: IndexedSite | null | undefined, host: string): string {
  if (!site || !isCrawlable(site)) return "User-agent: *\nDisallow: /\n";
  if (!isIndexable(site)) return "User-agent: *\nAllow: /\n";
  return `User-agent: *\nAllow: /\n\nSitemap: https://${host}/sitemap.xml\n`;
}
