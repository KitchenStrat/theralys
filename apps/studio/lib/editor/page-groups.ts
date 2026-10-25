import { PLANS, canAddMotifPage, type PlanId } from "@theralys/db/plans";
import type { GeneratingMotif } from "@theralys/shared";

/** Page telle que le panneau Pages la reçoit (sans ses sections). */
export type EditorPageRef = {
  id: string;
  type: string;
  slug: string;
  title: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
};

export type MotifRowStatus = "enabled" | "disabled" | "generating" | "error";

/** Au-delà de ce délai sans résultat, une génération est considérée en échec. */
export const GENERATION_STALE_MS = 10 * 60_000;
export const GENERATION_STALE_MESSAGE = "La préparation a pris trop de temps.";

/**
 * Génération périmée : entrée sans erreur dont `startedAt` est trop ancien
 * (processus interrompu, délai serveur dépassé) → relance ou suppression
 * proposées, sondage arrêté.
 */
export function isGenerationStale(entry: GeneratingMotif, now: number = Date.now()): boolean {
  if (entry.error) return false;
  const started = Date.parse(entry.startedAt);
  return !Number.isFinite(started) || now - started > GENERATION_STALE_MS;
}

/** Entrée de génération « effective » : une génération périmée devient une erreur. */
export function effectiveGeneration(entry: GeneratingMotif, now: number = Date.now()): GeneratingMotif {
  return isGenerationStale(entry, now) ? { ...entry, error: GENERATION_STALE_MESSAGE } : entry;
}

/** Ligne d'une page de spécialité dans le panneau Pages. */
export type MotifRow = {
  page: EditorPageRef;
  /** Activée (servie sur le site public) — faux pendant la génération */
  enabled: boolean;
  /** Entrée de génération en cours ou en erreur, le cas échéant */
  generating: GeneratingMotif | null;
  status: MotifRowStatus;
};

export type PageGroups = {
  home: EditorPageRef | null;
  motifs: MotifRow[];
  /** Pages de spécialité activées (prêtes et en ligne) */
  enabledCount: number;
  /** Pages de spécialité existantes, génération comprise */
  motifCount: number;
  /** Plafond de pages de spécialité de la formule */
  maxMotifPages: number;
  /** Peut-on ajouter une page (formule) ? */
  canAdd: boolean;
  /** Une génération est-elle en cours (hors erreurs) ? → sondage */
  isGenerating: boolean;
};

/**
 * Regroupe les pages pour le panneau Pages : accueil, pages de spécialité
 * (avec état activée / désactivée / en préparation / en erreur) et compteurs.
 * Les entrées de génération sans page correspondante sont ignorées.
 */
export function groupEditorPages(
  pages: EditorPageRef[],
  opts: { disabledMotifs: string[]; generatingMotifs: GeneratingMotif[]; plan: PlanId; now?: number },
): PageGroups {
  const disabled = new Set(opts.disabledMotifs);
  const now = opts.now ?? Date.now();
  const generating = new Map(opts.generatingMotifs.map((g) => [g.slug, effectiveGeneration(g, now)]));
  const home = pages.find((p) => p.type === "home") ?? null;
  const motifs: MotifRow[] = pages
    .filter((p) => p.type === "motif")
    .map((page) => {
      const gen = generating.get(page.slug) ?? null;
      const enabled = !disabled.has(page.slug) && gen === null;
      const status: MotifRowStatus = gen ? (gen.error ? "error" : "generating") : enabled ? "enabled" : "disabled";
      return { page, enabled, generating: gen, status };
    });
  const motifCount = motifs.length;
  return {
    home,
    motifs,
    enabledCount: motifs.filter((m) => m.status === "enabled").length,
    motifCount,
    maxMotifPages: PLANS[opts.plan].maxMotifPages,
    canAdd: canAddMotifPage(opts.plan, motifCount),
    isGenerating: motifs.some((m) => m.status === "generating"),
  };
}

/** Libellé « n/N activées » du groupe Pages de spécialité. */
export function motifCounterLabel(groups: Pick<PageGroups, "enabledCount" | "motifCount">): string {
  const plural = groups.enabledCount > 1 ? "activées" : "activée";
  return `${groups.enabledCount}/${groups.motifCount} ${plural}`;
}

/** Peut-on ajouter une carte sur l'accueil (section Spécialités) ? */
export function canAddHomeCard(homeSpecialtiesCount: number, plan: PlanId): boolean {
  return homeSpecialtiesCount < PLANS[plan].homeSpecialties;
}
