import { isGoogleAdsLanding, isMetaAdsLanding } from "@theralys/shared";

/**
 * Helpers du tracking maison côté navigateur (Tracker, RdvButton,
 * ConversionEvents) : provenance de la session et envoi des clics.
 */

/** Clé sessionStorage : `src` envoyé avec la première page vue de la session. */
export const SESSION_SOURCE_KEY = "hy_src";
/** Longueur maximale du `src` acceptée par /api/track (trackEventSchema). */
const SRC_MAX = 20;

/**
 * `src` à joindre à la première page vue : le paramètre explicite du lien de
 * bio (`?src=ig`), sinon `ads` quand l'URL porte la signature d'une annonce
 * Google (gclid, gbraid, wbraid ou UTM payant), sinon `meta` pour une annonce
 * Meta (fbclid ou UTM payant Facebook / Instagram). null sans aucun des trois.
 */
export function landingSource(search: string): string | null {
  const explicit = new URLSearchParams(search).get("src")?.slice(0, SRC_MAX);
  if (explicit) return explicit;
  if (isGoogleAdsLanding(search)) return "ads";
  return isMetaAdsLanding(search) ? "meta" : null;
}

/** Mémorise la provenance de la session pour les clics (RDV, appel) qui suivront. */
export function rememberSessionSource(src: string): void {
  try {
    window.sessionStorage.setItem(SESSION_SOURCE_KEY, src);
  } catch {
    // Navigation privée stricte : les clics de la session restent sans provenance
  }
}

export function readSessionSource(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_SOURCE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Envoie un clic (RDV ou téléphone) à /api/track avec le chemin courant et la
 * provenance de la session : sendBeacon (survit à la navigation qui suit),
 * repli fetch keepalive si le navigateur refuse la file.
 */
export function sendClickEvent(siteId: string, type: "rdv_click" | "call_click"): void {
  const payload: Record<string, string> = { siteId, type, path: window.location.pathname };
  const src = readSessionSource();
  if (src) payload.src = src;
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // sendBeacon indisponible : repli ci-dessous
  }
  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export type ClickedTarget = { href: string | null; track: string | null };

/** Lien ou bouton visé par un clic (plus proche ancêtre `a[href]` ou `[data-track]`) ; null sinon. */
export function clickedTarget(target: EventTarget | null): ClickedTarget | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("a[href], [data-track]");
  if (!el) return null;
  return { href: el.getAttribute("href"), track: el.getAttribute("data-track") };
}
