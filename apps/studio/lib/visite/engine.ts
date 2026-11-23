/**
 * Visite guidée du studio — logique pure, sans navigateur : quelles étapes
 * jouer, dans quel ordre, où poser la bulle, quand proposer une visite d'elle-
 * même, sous quelle clé noter qu'elle a été vue. Tout ce qui touche l'écran vit
 * dans `components/visite`.
 */

/** Les visites, par identifiant. L'ordre est celui de la navigation. */
export const TOUR_IDS = ["accueil", "mon-site", "publications", "reseaux-sociaux", "fiche-google", "google-ads", "meta-ads", "editeur"] as const;

export type TourId = (typeof TOUR_IDS)[number];

export function isTourId(value: unknown): value is TourId {
  return typeof value === "string" && (TOUR_IDS as readonly string[]).includes(value);
}

// ─── État « déjà vu » ────────────────────────────────────────────────────────

/**
 * Préfixe des clés d'une visite vue dans `onboarding_tasks` (une ligne par site
 * et par visite). Les clés historiques de cette table (`guided_tour`,
 * `verify_pages`…) et la marque des formules n'ont pas ce préfixe.
 */
export const TOUR_KEY_PREFIX = "tour:";

export function tourKey(id: TourId): string {
  return `${TOUR_KEY_PREFIX}${id}`;
}

/** La visite d'une clé de `onboarding_tasks` ; `null` pour toute autre ligne de la table. */
export function tourIdFromKey(key: string): TourId | null {
  if (!key.startsWith(TOUR_KEY_PREFIX)) return null;
  const id = key.slice(TOUR_KEY_PREFIX.length);
  return isTourId(id) ? id : null;
}

/** Visites vues, d'après les clés lues en base (les lignes étrangères aux visites sont ignorées). */
export function seenFromKeys(keys: readonly string[]): TourId[] {
  const seen = new Set<TourId>();
  for (const key of keys) {
    const id = tourIdFromKey(key);
    if (id) seen.add(id);
  }
  return TOUR_IDS.filter((id) => seen.has(id));
}

/** Clé du repli local (une liste par site : deux comptes sur le même navigateur ne se marchent pas dessus). */
export function localSeenKey(siteKey: string): string {
  return `hy:visite:vues:${siteKey}`;
}

/** Lit une liste de visites vues depuis sa forme enregistrée ; tout ce qui n'en est pas une est écarté. */
export function parseSeenList(raw: string | null | undefined): TourId[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return TOUR_IDS.filter((id) => value.includes(id));
  } catch {
    return [];
  }
}

// ─── Étapes ──────────────────────────────────────────────────────────────────

export type TourStep = {
  id: string;
  /**
   * Sélecteur de l'élément montré, ou plusieurs par ordre de préférence : le
   * premier qui est à l'écran l'emporte (une entrée de la barre latérale sur
   * ordinateur, le bouton « Plus » sur téléphone). Sans cible, la carte est
   * centrée.
   */
  target?: string | readonly string[];
  title: string;
  body: string;
  /** Phrase ajoutée quand la cible retenue n'est pas la première de la liste */
  fallbackNote?: string;
};

export type ResolvedStep = {
  id: string;
  /** Sélecteur retenu ; `null` : carte centrée */
  selector: string | null;
  title: string;
  body: string;
  /** Précision à afficher sous le texte (cible de repli) */
  note: string | null;
};

/**
 * Les étapes jouables : une étape ciblée dont aucune cible n'est à l'écran est
 * ignorée (formule qui n'ouvre pas la section, carte absente de cet état de la
 * page). `has` dit si un sélecteur désigne un élément visible.
 */
export function playableSteps(steps: readonly TourStep[], has: (selector: string) => boolean): ResolvedStep[] {
  const playable: ResolvedStep[] = [];
  for (const step of steps) {
    if (step.target === undefined) {
      playable.push({ id: step.id, selector: null, title: step.title, body: step.body, note: null });
      continue;
    }
    const candidates = typeof step.target === "string" ? [step.target] : step.target;
    const index = candidates.findIndex((selector) => has(selector));
    if (index < 0) continue;
    playable.push({
      id: step.id,
      selector: candidates[index] ?? null,
      title: step.title,
      body: step.body,
      note: index > 0 ? (step.fallbackNote ?? null) : null,
    });
  }
  return playable;
}

/**
 * Une visite n'a de sens que si elle montre quelque chose : sans aucune étape
 * ciblée jouable (page en erreur, état vide inattendu), elle n'est pas lancée.
 */
export function worthPlaying(steps: readonly ResolvedStep[]): boolean {
  return steps.some((step) => step.selector !== null);
}

/** Rang de l'étape suivante ; `null` : c'était la dernière, la visite se termine. */
export function stepAfter(index: number, count: number): number | null {
  const next = index + 1;
  return next < count ? next : null;
}

/** Rang de l'étape précédente ; `null` : c'était la première. */
export function stepBefore(index: number): number | null {
  return index > 0 ? index - 1 : null;
}

/**
 * Typographie française d'un texte de visite : espace insécable avant
 * « : ; ? ! » et à l'intérieur des guillemets — sur un écran étroit, une ligne
 * ne commence jamais par un signe de ponctuation.
 */
export function frenchSpacing(text: string): string {
  return text.replace(/ ([:;?!»])/g, "\u00a0$1").replace(/« /g, "«\u00a0");
}

// ─── Lancement automatique ───────────────────────────────────────────────────

export type AutoStartInput = {
  tour: TourId;
  /** Visites vues d'après la base ; `null` : l'état n'a pas pu être lu */
  seenServer: readonly TourId[] | null;
  /** Visites vues d'après le navigateur (repli) */
  seenLocal: readonly TourId[];
  /** Session ouverte par l'équipe (mode support) */
  support: boolean;
  /** Une fenêtre modale est ouverte */
  modalOpen: boolean;
  /** Une visite est déjà en cours */
  activeTour: TourId | null;
  /** La page est affichée dans une iframe (aperçu) */
  framed: boolean;
  /** L'utilisateur a remis cette visite à plus tard pendant cette session de navigation */
  snoozed: boolean;
};

/** La visite d'accueil : elle passe avant toutes les autres. */
export const HOME_TOUR: TourId = "accueil";

/**
 * Une visite se propose d'elle-même une seule fois, à la première ouverture de
 * sa page — jamais à l'équipe en mode support, jamais par-dessus une fenêtre ou
 * une autre visite, jamais dans une iframe. État illisible : on s'abstient
 * (mieux vaut ne rien proposer que reproposer à chaque page pendant une panne).
 *
 * La visite d'accueil passe d'abord : tant qu'elle n'a pas été vue (jamais
 * proposée, ou remise à plus tard), la visite d'un espace attend. Qui la
 * refuse pour de bon n'est pas relancé page après page (`snoozeOutcome`).
 */
export function shouldAutoStart(input: AutoStartInput): boolean {
  if (input.support || input.modalOpen || input.framed || input.snoozed) return false;
  if (input.activeTour !== null) return false;
  if (input.seenServer === null) return false;
  const seen = new Set<TourId>([...input.seenServer, ...input.seenLocal]);
  if (seen.has(input.tour)) return false;
  return input.tour === HOME_TOUR || seen.has(HOME_TOUR);
}

/**
 * « Plus tard » sur la fenêtre de bienvenue : la visite est reproposée à la
 * prochaine session, une fois. Au deuxième report, toutes les visites sont
 * tenues pour vues (`dismissAll`) : on ne relance pas quelqu'un qui a dit non
 * deux fois, ni ici ni dans chaque espace. Elles restent relançables à la main.
 */
export const MAX_SNOOZES = 2;

export function snoozeOutcome(previousSnoozes: number): { snoozes: number; dismissAll: boolean } {
  const snoozes = Math.max(0, previousSnoozes) + 1;
  return { snoozes, dismissAll: snoozes >= MAX_SNOOZES };
}

// ─── Placement de la carte ───────────────────────────────────────────────────

export type Rect = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Side = "top" | "bottom" | "left" | "right" | "center";
export type Placement = { top: number; left: number; side: Side };

/** Largeur sous laquelle la carte devient une feuille pleine largeur (téléphone). */
export const COMPACT_WIDTH = 640;

/** Marge autour de la cible dans la découpe, en pixels. */
export const HOLE_PADDING = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Découpe autour de la cible : son rectangle élargi de `padding`, rogné à la
 * fenêtre (une cible collée au bord garde une découpe entièrement visible).
 */
export function holeRect(target: Rect, viewport: Size, padding = HOLE_PADDING): Rect {
  const left = Math.max(0, target.left - padding);
  const top = Math.max(0, target.top - padding);
  const right = Math.min(viewport.width, target.left + target.width + padding);
  const bottom = Math.min(viewport.height, target.top + target.height + padding);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * Où poser la carte pour qu'elle ne recouvre pas ce qu'elle montre.
 *
 * - Sans cible : au centre.
 * - Téléphone (`viewport.width < COMPACT_WIDTH`) : la carte prend la largeur ;
 *   elle se place sous la cible s'il y a la place, sinon au-dessus. Devant une
 *   cible trop haute pour l'un et l'autre, elle se colle en bas de l'écran si
 *   le début de la cible est visible (son titre reste lisible), en haut sinon.
 * - Ordinateur : à droite ou à gauche d'une cible étroite (entrée de menu,
 *   bouton), sinon dessous ou dessus ; faute de place, en bas de l'écran.
 *
 * Les coordonnées sont celles de la fenêtre (carte en `position: fixed`).
 */
export function placeCard(input: { target: Rect | null; viewport: Size; card: Size; gap?: number; margin?: number }): Placement {
  const { target, viewport, card } = input;
  const gap = input.gap ?? 14;
  const margin = input.margin ?? 12;
  const maxLeft = viewport.width - card.width - margin;
  const maxTop = viewport.height - card.height - margin;

  if (target === null) {
    return { top: clamp((viewport.height - card.height) / 2, margin, maxTop), left: clamp((viewport.width - card.width) / 2, margin, maxLeft), side: "center" };
  }

  const above = target.top;
  const below = viewport.height - (target.top + target.height);
  const before = target.left;
  const after = viewport.width - (target.left + target.width);
  const fitsBelow = below >= card.height + gap + margin;
  const fitsAbove = above >= card.height + gap + margin;
  const alignedLeft = clamp(target.left, margin, maxLeft);

  if (viewport.width < COMPACT_WIDTH) {
    const left = clamp((viewport.width - card.width) / 2, margin, maxLeft);
    if (fitsBelow) return { top: target.top + target.height + gap, left, side: "bottom" };
    if (fitsAbove) return { top: target.top - gap - card.height, left, side: "top" };
    // La cible occupe presque tout l'écran : la carte en recouvre la fin plutôt que le début
    const startsInView = target.top >= 0 && target.top <= viewport.height / 2;
    return startsInView ? { top: clamp(maxTop, margin, maxTop), left, side: "bottom" } : { top: margin, left, side: "top" };
  }

  const narrow = target.width <= viewport.width * 0.4;
  const centeredTop = clamp(target.top + target.height / 2 - card.height / 2, margin, maxTop);
  if (narrow && after >= card.width + gap + margin) return { top: centeredTop, left: target.left + target.width + gap, side: "right" };
  if (fitsBelow) return { top: target.top + target.height + gap, left: alignedLeft, side: "bottom" };
  if (fitsAbove) return { top: target.top - gap - card.height, left: alignedLeft, side: "top" };
  if (narrow && before >= card.width + gap + margin) return { top: centeredTop, left: target.left - gap - card.width, side: "left" };
  if (after >= card.width + gap + margin) return { top: centeredTop, left: target.left + target.width + gap, side: "right" };
  if (before >= card.width + gap + margin) return { top: centeredTop, left: target.left - gap - card.width, side: "left" };
  // Nulle part où tenir sans recouvrir : en bas de l'écran, alignée sur la cible
  return { top: clamp(maxTop, margin, maxTop), left: alignedLeft, side: "bottom" };
}
