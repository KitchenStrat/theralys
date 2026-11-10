/**
 * Chargement des visuels de la veille courante, par lots : le studio les
 * charge de lui-même à l'ouverture de l'onglet « Marché » (veille antérieure
 * aux visuels, recherche interrompue, clé ajoutée après coup), sans attendre
 * une nouvelle analyse. Chaque lot est court (les visuels apparaissent au fil
 * de l'eau), réservé sur le quota mensuel du site et exclusif (un seul lot à
 * la fois par site).
 */

import { getDb, type Site } from "@theralys/db";
import { currentMarket, enrichSiteAdsMedia, loadMetaLibrary, mediaProviderFor, planAdsMedia, type SiteMediaEnrichment } from "@theralys/jobs";
import { VISUALS_LOAD_FAILED } from "./market-view";
import { createMetaMediaStore } from "./media-store";

/** Annonces cherchées par lot : assez peu pour qu'un lot réponde en quelques secondes. */
export const META_VISUALS_BATCH = 12;

export const VISUALS_MESSAGES = {
  unavailable: "Votre bibliothèque est en cours d'activation — réessayez dans quelques minutes.",
  noProvider: "Les visuels des annonces ne sont pas encore activés.",
  busy: "Les visuels sont déjà en cours de chargement — patientez une minute.",
  quota: "Le quota mensuel de visuels est atteint — ils reviendront le mois prochain.",
  blocked: "Les visuels sont momentanément indisponibles — réessayez plus tard.",
  failed: VISUALS_LOAD_FAILED,
} as const;

export type VisualsBatch = {
  /** Refus ou échec à montrer au praticien ; le chargement s'arrête */
  error?: string;
  /** Annonces cherchées dans ce lot (à ne pas représenter au lot suivant) */
  attempted: string[];
  /** Annonces de ce lot qui ont maintenant un visuel */
  found: number;
  /** Recherches comptées sur le quota */
  lookups: number;
  /** Annonces affichées encore sans recherche aboutie après ce lot */
  missing: number;
  /** Inutile d'enchaîner un autre lot (plus rien à chercher, quota atteint, fournisseur indisponible) */
  stop: boolean;
};

const EMPTY: VisualsBatch = { attempted: [], found: 0, lookups: 0, missing: 0, stop: true };

/**
 * Issue d'un lot, d'après ce que le service a fait : message d'erreur quand
 * rien n'a pu être cherché (autre lot en cours, quota atteint, fournisseur
 * indisponible), sinon le décompte et l'indication de poursuivre ou non.
 */
export function visualsBatchOutcome(attempted: readonly string[], enriched: Pick<SiteMediaEnrichment, "mediaByAdId" | "lookups" | "blocked" | "unavailable" | "busy" | "overQuota">, missing: number): VisualsBatch {
  if (enriched.unavailable) return { ...EMPTY, error: VISUALS_MESSAGES.unavailable };
  if (enriched.busy) return { ...EMPTY, missing, error: VISUALS_MESSAGES.busy };
  const found = attempted.filter((id) => (enriched.mediaByAdId[id]?.items.length ?? 0) > 0).length;
  const base: VisualsBatch = { attempted: [...attempted], found, lookups: enriched.lookups, missing, stop: true };
  if (enriched.lookups === 0 && enriched.overQuota > 0) return { ...base, error: VISUALS_MESSAGES.quota };
  if (enriched.blocked && found === 0) return { ...base, error: VISUALS_MESSAGES.blocked };
  // On enchaîne tant que le lot a avancé sans encombre et qu'il reste des annonces à chercher
  return { ...base, stop: enriched.blocked || enriched.overQuota > 0 || missing === 0 };
}

/**
 * Cherche les visuels d'un lot d'annonces affichées de la veille courante
 * qui n'en ont pas encore : ni les annonces supprimées, ni celles que le
 * filtre de pertinence masque, ni celles déjà tentées pendant ce chargement
 * (`exclude` : une annonce en échec n'est pas cherchée deux fois de suite).
 */
export async function loadVisualsBatch(site: Pick<Site, "id">, opts: { exclude?: readonly string[]; limit?: number; now?: Date } = {}): Promise<VisualsBatch> {
  const db = getDb();
  const now = opts.now ?? new Date();
  const [market, library] = await Promise.all([currentMarket(db, site.id), loadMetaLibrary(db, site.id)]);
  if (!library.available) return { ...EMPTY, error: VISUALS_MESSAGES.unavailable };
  const provider = mediaProviderFor(process.env, market.providerMode);
  if (!provider) return { ...EMPTY, error: VISUALS_MESSAGES.noProvider };
  const dismissed = new Set(library.dismissedIds);
  const displayed = [...market.ads.keys()].filter((id) => !dismissed.has(id));
  const pendingOf = async () => {
    const plan = await planAdsMedia(db, displayed, { now, source: provider.mode });
    return plan.unavailable ? null : plan.pending;
  };
  const pending = await pendingOf();
  if (pending === null) return { ...EMPTY, error: VISUALS_MESSAGES.unavailable };
  const excluded = new Set(opts.exclude ?? []);
  const attempted = pending.filter((id) => !excluded.has(id)).slice(0, Math.max(1, opts.limit ?? META_VISUALS_BATCH));
  if (attempted.length === 0) return { ...EMPTY, missing: pending.length };
  const enriched = await enrichSiteAdsMedia(db, site.id, attempted, { provider, store: createMetaMediaStore(), now, exclusive: true });
  const after = enriched.busy || enriched.unavailable ? pending : ((await pendingOf()) ?? pending);
  const outcome = visualsBatchOutcome(attempted, enriched, after.length);
  console.info("[meta-ads] visuels chargés depuis le studio", { siteId: site.id, attempted: attempted.length, found: outcome.found, lookups: enriched.lookups, missing: outcome.missing, blocked: enriched.blocked, busy: enriched.busy, overQuota: enriched.overQuota });
  return outcome;
}
