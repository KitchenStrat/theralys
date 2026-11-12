import type { Metadata } from "next";
import type { Site } from "@theralys/db";
import { isHostedSiteHidden } from "@theralys/shared";

/**
 * Indexation du site hébergé par les moteurs de recherche — une seule règle
 * pour les métadonnées de toutes les pages, `robots.txt` et le plan du site.
 */

/**
 * Le site hébergé peut-il être indexé ? Seulement un site client, et pas
 * tant que le site du client est la référence des outils (`isHostedSiteHidden`) :
 * deux sites pour un même cabinet se concurrenceraient dans les résultats.
 * Le site masqué reste servi à qui en a le lien. Une démo n'est jamais
 * indexée.
 */
export function isIndexable(site: Pick<Site, "type" | "theme">): boolean {
  return site.type === "client" && !isHostedSiteHidden(site.theme);
}

/** Directive des pages d'un site qui ne doit pas être indexé. */
export const NOINDEX = { index: false, follow: false } as const satisfies Metadata["robots"];

/**
 * Directive `robots` des métadonnées d'un site : `noindex, nofollow` s'il ne
 * doit pas être indexé, sinon rien (comportement par défaut des moteurs).
 * Posée par le layout du site, elle vaut pour toutes ses pages ; une page qui
 * fixe sa propre directive doit repartir de celle-ci.
 */
export function robotsMetadata(site: Pick<Site, "type" | "theme">): Metadata["robots"] | undefined {
  return isIndexable(site) ? undefined : NOINDEX;
}
