import { COMPACT_WIDTH, localSeenKey, parseSeenList, type Rect, type TourId } from "@/lib/visite/engine";

/**
 * Visite guidée — ce qui se lit dans la page et dans le navigateur : la cible
 * d'une étape, les fenêtres ouvertes, le repli local de l'état « déjà vu ».
 * Tout accès au stockage est protégé : navigation privée ou stockage refusé ne
 * font jamais tomber une page.
 */

/** Un élément est montrable s'il occupe de la place à l'écran (ni `display: none`, ni masqué, ni vide). */
function isShown(element: Element): boolean {
  if (element.getClientRects().length === 0) return false;
  const box = element.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return false;
  return getComputedStyle(element).visibility !== "hidden";
}

/**
 * La cible d'un sélecteur : le premier élément correspondant qui est à
 * l'écran. La barre latérale et la barre basse portent les mêmes repères ;
 * seule celle qui est affichée répond.
 */
export function findTarget(selector: string): HTMLElement | null {
  let matches: NodeListOf<HTMLElement>;
  try {
    matches = document.querySelectorAll<HTMLElement>(selector);
  } catch {
    return null;
  }
  for (const element of matches) {
    if (isShown(element)) return element;
  }
  return null;
}

export function rectOf(element: Element): Rect {
  const box = element.getBoundingClientRect();
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

/**
 * Amène la cible dans la partie dégagée de l'écran, sans animation (la carte
 * arrive ensuite en fondu). Une cible fixe (barre basse, barre latérale) ne
 * bouge pas ; un onglet hors de vue dans sa rangée y est ramené.
 *
 * `reserve` : la hauteur dont la carte a besoin. Sur téléphone, où elle se pose
 * au-dessus ou au-dessous de la cible, une cible déjà visible mais sans cette
 * place d'aucun côté remonte en haut de l'écran : la carte tient alors dessous
 * au lieu de la recouvrir.
 */
export function bringIntoView(element: HTMLElement, reserve = 0): void {
  const box = element.getBoundingClientRect();
  const height = window.innerHeight;
  const width = document.documentElement.clientWidth;
  const compact = width < COMPACT_WIDTH;
  // Marges : sur téléphone, la barre du haut et la barre basse recouvrent les bords de la fenêtre
  const top = compact ? 72 : 24;
  const bottom = compact ? 88 : 24;
  const visible = box.top >= top && box.bottom <= height - bottom && box.left >= 0 && box.right <= width;
  const room = !compact || box.top >= reserve || height - box.bottom >= reserve;
  if (visible && room) return;
  // Haut de la cible en haut de la zone dégagée : le défilement (page, rangée d'onglets, panneau) est laissé au
  // navigateur, et la coquille réserve déjà la place de sa barre du haut (`scroll-padding-top`) — une petite marge suffit
  const previous = element.style.scrollMarginTop;
  element.style.scrollMarginTop = "8px";
  element.scrollIntoView({ block: "start", inline: "center", behavior: "instant" });
  element.style.scrollMarginTop = previous;
}

/** Une fenêtre modale est ouverte (fenêtre partagée, assistant, feuille « Plus »). */
export function modalIsOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]') !== null;
}

/** La page est affichée dans une iframe (aperçu) : aucune visite ne s'y propose. */
export function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

// ─── Repli local ─────────────────────────────────────────────────────────────

export function readLocalSeen(siteKey: string): TourId[] {
  try {
    return parseSeenList(window.localStorage.getItem(localSeenKey(siteKey)));
  } catch {
    return [];
  }
}

export function writeLocalSeen(siteKey: string, seen: readonly TourId[]): void {
  try {
    window.localStorage.setItem(localSeenKey(siteKey), JSON.stringify(seen));
  } catch {
    // Stockage indisponible : l'état reste en mémoire pour la durée de la page
  }
}

const snoozeFlag = (siteKey: string, tour: TourId) => `hy:visite:plus-tard:${siteKey}:${tour}`;
const snoozeCount = (siteKey: string, tour: TourId) => `hy:visite:reports:${siteKey}:${tour}`;

/** « Plus tard » a été choisi pendant cette session de navigation. */
export function isSnoozed(siteKey: string, tour: TourId): boolean {
  try {
    return window.sessionStorage.getItem(snoozeFlag(siteKey, tour)) === "1";
  } catch {
    return false;
  }
}

/** Nombre de reports déjà notés sur ce navigateur. */
export function readSnoozes(siteKey: string, tour: TourId): number {
  try {
    const value = Number(window.localStorage.getItem(snoozeCount(siteKey, tour)));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export function writeSnooze(siteKey: string, tour: TourId, snoozes: number): void {
  try {
    window.sessionStorage.setItem(snoozeFlag(siteKey, tour), "1");
  } catch {
    // Sans stockage de session, la visite se reproposera à la prochaine page : le compteur ci-dessous y met fin
  }
  try {
    window.localStorage.setItem(snoozeCount(siteKey, tour), String(snoozes));
  } catch {
    // Rien à faire
  }
}
