/**
 * Chemins publics d'un site : ceux que le visiteur voit dans son navigateur,
 * et donc ceux que doivent porter les liens internes et les redirections.
 *
 * Un même site est servi de deux façons (cf. `middleware.ts`) :
 * - sur l'hôte des démos, sous `/<slug>/…` ;
 * - sur le domaine du client, à la racine : le middleware réécrit alors
 *   `/<chemin>` en `/<domaine>/<chemin>` pour atteindre le segment `[site]`.
 *   Cette réécriture est interne : un lien qui reprendrait le domaine en
 *   préfixe serait réécrit une seconde fois et mènerait à la page introuvable.
 *
 * Fonctions pures, sans lecture de la requête.
 */

/**
 * Préfixe public des chemins d'un site, déduit de la clé du segment `[site]` :
 * - la clé est un slug → `/<slug>` (hôte des démos) ;
 * - la clé est un domaine → préfixe vide (site servi à la racine de son
 *   domaine).
 *
 * Même distinction que `getSiteByKey` : une clé qui contient un point est un
 * domaine, un slug n'en contient jamais. La décision ne dépend que de la clé —
 * pas des en-têtes de la requête — pour ne rien imposer au mode de rendu des
 * pages. Sur l'hôte des démos, un site s'adresse toujours par son slug : une
 * adresse `/<domaine>/…` tapée à la main sur cet hôte s'afficherait, mais ses
 * liens viseraient la racine du domaine.
 */
export function publicPathPrefix(siteKey: string): string {
  let key = siteKey;
  try {
    key = decodeURIComponent(siteKey);
  } catch {
    // Clé mal encodée : jugée telle quelle
  }
  return key.includes(".") ? "" : `/${siteKey}`;
}

/**
 * Chemin de l'accueil d'un site pour un préfixe donné. Un préfixe vide ne
 * peut pas servir de lien tel quel : `href=""` désigne la page en cours, pas
 * l'accueil — c'est `/` sur le domaine d'un client. Les ancres de l'accueil
 * s'y ajoutent (`/#contact`, `/<slug>#contact`).
 */
export function homePath(prefix: string): string {
  return prefix === "" ? "/" : prefix;
}
