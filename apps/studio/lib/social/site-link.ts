/**
 * Lien vers le site du praticien tel que les réseaux sociaux le reçoivent
 * (lien de bio, légendes Facebook et LinkedIn, exports) : quelle adresse, et
 * avec ou sans paramètre de provenance.
 *
 * - Site hébergé : son adresse, avec `?src=ig|fb|li`. Le site lit ce
 *   paramètre et range la visite sous le bon réseau.
 * - Site du client en référence : son adresse seule. Le code de mesure
 *   installé chez lui ne lit jamais les paramètres d'une adresse (règles de
 *   consentement) ; il reconnaît le réseau au site d'où vient le visiteur.
 *
 * L'adresse et le mode se décident ensemble, sur le même réglage
 * (`site.theme.externalSite`) : un lien vers le site du client ne porte
 * jamais `src`, un lien vers le site hébergé le porte toujours. Fonctions
 * pures, testées sans base.
 */

import { activeExternalSite, bioLinkFor, referenceSiteUrl, type SiteLinkOptions, type SiteTheme } from "@theralys/shared";

/**
 * Lien vers le site de référence, pour les réseaux sociaux : l'adresse et la
 * façon de la composer vont ensemble, pour qu'aucun appelant ne mette `src`
 * sur le site du client ni ne l'oublie sur le site hébergé.
 */
export type SocialSiteLink = {
  /** Adresse de référence, avec protocole, sans barre finale : site du client s'il est la référence, sinon site hébergé */
  url: string;
  /** `true` : les liens portent `?src=…` (site hébergé) ; `false` : l'adresse seule (site du client) */
  sourceParam: boolean;
};

/**
 * Lien du site d'après son réglage. `hostedUrl` : adresse du site hébergé
 * (`siteUrl(site)`). Même règle d'adresse que `publicSiteUrl` (`lib/data.ts`).
 */
export function socialSiteLink(hostedUrl: string, theme: Pick<SiteTheme, "externalSite"> | null | undefined): SocialSiteLink {
  return { url: referenceSiteUrl(hostedUrl, theme), sourceParam: activeExternalSite(theme) === null };
}

/** Options à donner à `bioLinkFor`, `captionFor`, `plannerRows` et `captionTxt` pour ce lien. */
export function linkOptionsOf(link: SocialSiteLink): SiteLinkOptions {
  return { sourceParam: link.sourceParam };
}

/** Liens proposés par la carte « Votre lien de bio ». */
export type BioLinks = {
  /** Lien montré et copié en premier : celui d'Instagram, ou le lien unique */
  main: string;
  /** Variante Facebook (`?src=fb`) ; `null` quand un seul lien vaut pour tous les réseaux */
  facebook: string | null;
};

/**
 * Liens de la carte « Votre lien de bio » : un par réseau tant qu'ils portent
 * `src`, un seul sinon — proposer une « version Facebook » identique à
 * l'autre n'aurait pas de sens.
 */
export function bioLinksOf(link: SocialSiteLink): BioLinks {
  const options = linkOptionsOf(link);
  return {
    main: bioLinkFor(link.url, "instagram", options),
    facebook: link.sourceParam ? bioLinkFor(link.url, "facebook", options) : null,
  };
}
