/**
 * Réseaux sociaux : variantes de légende par réseau, provenance des visites,
 * quotas de régénération. Fonctions pures (testées), sans dépendance.
 */

export const SOCIAL_NETWORKS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]["id"];

export function isSocialNetwork(value: unknown): value is SocialNetwork {
  return typeof value === "string" && SOCIAL_NETWORKS.some((n) => n.id === value);
}

/** Instructions libres pour régénérer un contenu social (caractères). */
export const SOCIAL_POST_INSTRUCTIONS_MAX = 500;
/** Régénérations de contenus sociaux (avec instructions) par site et par mois. */
export const SOCIAL_REGENERATIONS_PER_MONTH = 20;
/** Hashtags conservés sur Facebook et LinkedIn (Instagram garde tous les siens). */
export const SOCIAL_HASHTAGS_OUTSIDE_INSTAGRAM = 3;

/** Paramètre `src` à mettre dans le lien de bio (ex. `?src=ig`) → provenance. */
export const SOCIAL_SOURCE_PARAMS: Record<string, AnalyticsSource> = {
  ig: "instagram",
  fb: "facebook",
  li: "linkedin",
  gbp: "google",
};

export const ANALYTICS_SOURCES = ["instagram", "facebook", "linkedin", "google", "direct", "other"] as const;
export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number];

export const ANALYTICS_SOURCE_LABELS: Record<AnalyticsSource, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  google: "Google",
  direct: "Accès direct",
  other: "Autres sites",
};

/**
 * Lien à placer dans la bio d'un réseau : l'URL publique du site avec `src`.
 * Les visites ainsi tracées apparaissent dans la provenance du studio.
 */
export function bioLinkFor(siteUrl: string, network: SocialNetwork): string {
  const param = network === "instagram" ? "ig" : network === "facebook" ? "fb" : "li";
  try {
    const url = new URL(siteUrl);
    url.searchParams.set("src", param);
    return url.toString();
  } catch {
    return `${siteUrl}${siteUrl.includes("?") ? "&" : "?"}src=${param}`;
  }
}

/**
 * Provenance d'une visite : le paramètre `src` du lien de bio l'emporte, puis
 * l'hôte du referrer ; sans referrer → accès direct.
 */
export function sourceFromReferrer(referrer: string | null | undefined, src: string | null | undefined): AnalyticsSource {
  if (src && SOCIAL_SOURCE_PARAMS[src.toLowerCase()]) return SOCIAL_SOURCE_PARAMS[src.toLowerCase()]!;
  if (!referrer || referrer.trim() === "") return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "other";
  }
  const match = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (match("instagram.com")) return "instagram";
  if (match("facebook.com") || match("fb.me") || match("fb.com") || match("messenger.com")) return "facebook";
  if (match("linkedin.com") || match("lnkd.in")) return "linkedin";
  if (/(^|\.)google\.[a-z.]+$/.test(host) || match("googleusercontent.com") || match("goo.gl")) return "google";
  return "other";
}

export type CaptionSource = { caption: string; hashtags: readonly string[] };

/**
 * Légende prête à coller pour un réseau donné :
 * - Instagram : la légende telle quelle (ligne « lien dans ma bio ») + tous
 *   les hashtags ;
 * - Facebook et LinkedIn : la ligne « bio » remplacée par le lien du site
 *   (avec `src`), au plus 3 hashtags.
 * `bioLine` est la ligne exacte insérée par le générateur.
 */
export function captionFor(network: SocialNetwork, content: CaptionSource, siteUrl: string, bioLine: string): string {
  const hashtags = content.hashtags.filter((h) => h.trim() !== "");
  if (network === "instagram") {
    return [content.caption.trim(), hashtags.join(" ")].filter((p) => p !== "").join("\n\n");
  }
  const link = bioLinkFor(siteUrl, network);
  const replaced = content.caption
    .split(/\n{2,}/)
    .map((p) => (p.trim() === bioLine.trim() ? `Pour prendre rendez-vous : ${link}` : p))
    .join("\n\n")
    .trim();
  const withLink = replaced.includes(link) ? replaced : `${replaced}\n\nPour prendre rendez-vous : ${link}`;
  const kept = hashtags.slice(0, SOCIAL_HASHTAGS_OUTSIDE_INSTAGRAM).join(" ");
  return [withLink, kept].filter((p) => p !== "").join("\n\n");
}
