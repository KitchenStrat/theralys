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
 * Applications Android qui ouvrent le site dans leur navigateur intégré : le
 * referrer est alors `android-app://<paquet>` (Instagram, Facebook et
 * Messenger, LinkedIn, l'application Google et Gmail).
 */
export const ANDROID_APP_SOURCES: Record<string, AnalyticsSource> = {
  "com.instagram.android": "instagram",
  "com.facebook.katana": "facebook",
  "com.facebook.orca": "facebook",
  "com.linkedin.android": "linkedin",
  "com.google.android.googlequicksearchbox": "google",
  "com.google.android.gm": "google",
};

/**
 * Provenance d'une visite : le paramètre `src` du lien de bio l'emporte, puis
 * l'application Android (`android-app://`) ou l'hôte du referrer ; sans
 * referrer → accès direct.
 */
export function sourceFromReferrer(referrer: string | null | undefined, src: string | null | undefined): AnalyticsSource {
  if (src && SOCIAL_SOURCE_PARAMS[src.toLowerCase()]) return SOCIAL_SOURCE_PARAMS[src.toLowerCase()]!;
  if (!referrer || referrer.trim() === "") return "direct";
  const app = /^android-app:\/\/([a-z0-9_.]+)/i.exec(referrer.trim());
  if (app) return ANDROID_APP_SOURCES[app[1]!.toLowerCase()] ?? "other";
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

/** Un paragraphe « lien dans ma bio » (ligne du générateur ou variante libre : « Lien dans ma bio 👆 »). */
const BIO_LINE_RE = /lien.*bio/i;
const URL_RE = /https?:\/\/[^\s<>"'«»()]+/gi;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** La légende cite-t-elle déjà une URL du site (même hôte, `www.` ignoré) ? */
export function mentionsSiteUrl(caption: string, siteUrl: string): boolean {
  const host = hostOf(siteUrl);
  if (!host) return false;
  for (const match of caption.matchAll(URL_RE)) {
    if (hostOf(match[0]) === host) return true;
  }
  return false;
}

/**
 * Légende prête à coller pour un réseau donné :
 * - Instagram : la légende telle quelle (ligne « lien dans ma bio ») + tous
 *   les hashtags ;
 * - Facebook et LinkedIn : tout paragraphe « lien dans ma bio » (détection
 *   souple, la ligne exacte du générateur `bioLine` comprise) remplacé par le
 *   lien du site (avec `src`) ; sans ligne bio, le lien est ajouté en fin de
 *   légende sauf si une URL du site y figure déjà ; au plus 3 hashtags.
 */
export function captionFor(network: SocialNetwork, content: CaptionSource, siteUrl: string, bioLine: string): string {
  const hashtags = content.hashtags.filter((h) => h.trim() !== "");
  if (network === "instagram") {
    return [content.caption.trim(), hashtags.join(" ")].filter((p) => p !== "").join("\n\n");
  }
  const linkLine = `Pour prendre rendez-vous : ${bioLinkFor(siteUrl, network)}`;
  const isBioLine = (p: string) => p.trim() !== "" && (p.trim() === bioLine.trim() || BIO_LINE_RE.test(p));
  let replaced = false;
  const body = content.caption
    .split(/\n{2,}/)
    .map((p) => {
      if (!isBioLine(p)) return p;
      replaced = true;
      return linkLine;
    })
    .join("\n\n")
    .trim();
  const withLink = replaced || mentionsSiteUrl(body, siteUrl) ? body : `${body}\n\n${linkLine}`;
  const kept = hashtags.slice(0, SOCIAL_HASHTAGS_OUTSIDE_INSTAGRAM).join(" ");
  return [withLink, kept].filter((p) => p !== "").join("\n\n");
}
