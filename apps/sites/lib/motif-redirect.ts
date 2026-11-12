import { isLegalPageSlug } from "@theralys/shared";

/**
 * Réparation des anciens liens publicitaires. Les outils ont longtemps donné
 * aux praticiens, pour leurs annonces, des adresses d'atterrissage de la
 * forme `/<slug>` alors que les pages de spécialité sont servies sous
 * `/motifs/<slug>` : ces liens, déjà en ligne dans des campagnes Google Ads
 * ou Meta, menaient à la page introuvable. Ils sont redirigés définitivement
 * vers la bonne page, paramètres de campagne conservés.
 *
 * Fonctions pures : la page ne fait que réunir les valeurs et rediriger.
 */

/** Paramètres d'adresse tels que Next les donne à une page. */
export type PageSearchParams = Record<string, string | string[] | undefined>;

/**
 * Paramètres d'une requête → `?a=1&b=2` (chaîne vide sans paramètre), dans
 * l'ordre reçu, valeurs répétées comprises : `gclid`, `fbclid`, `utm_*` et
 * `src` doivent arriver intacts sur la page de destination, c'est d'eux que
 * dépend l'attribution des annonces.
 */
export function searchString(params: PageSearchParams): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) search.append(name, item);
  }
  const text = search.toString();
  return text === "" ? "" : `?${text}`;
}

/**
 * Adresse vers laquelle rediriger un chemin à un seul segment (`/<segment>`
 * sous le site), ou `null` s'il doit garder son comportement habituel :
 * - page légale → `null` (elle est servie à ce niveau) ;
 * - segment égal au slug d'une page de spécialité en ligne (`motifSlugs` :
 *   activée, générée, comprise dans la formule) → `/motifs/<slug>` avec les
 *   paramètres de la requête ;
 * - tout autre segment — slug inconnu, page désactivée — → `null` (page
 *   introuvable, comme avant).
 */
export function legacyMotifRedirect(input: {
  /** Segment demandé (`params.legal`) */
  segment: string;
  /** Slugs des pages de spécialité en ligne du site */
  motifSlugs: readonly string[];
  /** Préfixe public des chemins du site (`publicPathPrefix`, lib/site-paths.ts) : la redirection vise le chemin que voit le visiteur */
  prefix: string;
  searchParams: PageSearchParams;
}): string | null {
  const { segment, motifSlugs, prefix, searchParams } = input;
  if (isLegalPageSlug(segment) || !motifSlugs.includes(segment)) return null;
  return `${prefix}/motifs/${encodeURIComponent(segment)}${searchString(searchParams)}`;
}
