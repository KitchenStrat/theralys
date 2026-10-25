import { FOOTER_SOCIAL_NETWORKS, type SiteSocialLinks } from "@theralys/shared";

export type SocialNetworkKey = keyof SiteSocialLinks;

/**
 * Validation d'un lien de réseau social du pied de page (côté studio et côté
 * serveur) : vide = non renseigné ; sinon une URL `https://` dont l'hôte est
 * le domaine du réseau ou un sous-domaine (`www.`, `m.`, `fr.`…).
 * Retourne un message d'erreur en français, ou null si le lien est valide.
 */
export function socialUrlError(key: SocialNetworkKey, url: string): string | null {
  const network = FOOTER_SOCIAL_NETWORKS.find((n) => n.key === key);
  if (!network) return "Réseau inconnu";
  const value = url.trim();
  if (value === "") return null;
  if (!/^https:\/\//i.test(value)) {
    return `Le lien ${network.label} doit commencer par https://`;
  }
  let hostname: string;
  try {
    hostname = new URL(value).hostname.toLowerCase();
  } catch {
    return `Lien ${network.label} invalide`;
  }
  const host = network.host.toLowerCase();
  if (hostname !== host && !hostname.endsWith(`.${host}`)) {
    return `Le lien doit pointer vers ${network.host} (ex. https://www.${network.host}/votre-page)`;
  }
  return null;
}

/** Première erreur rencontrée parmi les liens saisis, ou null. */
export function firstSocialError(links: Partial<Record<SocialNetworkKey, string>>): string | null {
  for (const network of FOOTER_SOCIAL_NETWORKS) {
    const error = socialUrlError(network.key, links[network.key] ?? "");
    if (error) return error;
  }
  return null;
}

/**
 * Liens nettoyés pour le JSONB du site : clés vides retirées, `undefined`
 * si aucun réseau n'est renseigné (le pied de page ne les affiche pas).
 */
export function normalizeSocialLinks(
  links: Partial<Record<SocialNetworkKey, string>>,
): SiteSocialLinks | undefined {
  const result: SiteSocialLinks = {};
  let any = false;
  for (const network of FOOTER_SOCIAL_NETWORKS) {
    const value = (links[network.key] ?? "").trim();
    if (value) {
      result[network.key] = value;
      any = true;
    }
  }
  return any ? result : undefined;
}
