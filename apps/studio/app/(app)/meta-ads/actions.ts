"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, metaAdsAnalyses, sites } from "@theralys/db";
import {
  adsReferenceOf,
  dismissMetaAds,
  getMetaAdsUsage,
  keepMetaAds,
  regenerateMetaAds as regenerateMetaAdsJob,
  restoreMetaAds,
  runMetaAdsAnalysis,
  type LibraryOutcome,
} from "@theralys/jobs";
import {
  META_ADS_ANALYSES_PER_MONTH,
  META_ADS_INSTRUCTIONS_MAX,
  META_ADS_REGENERATIONS_PER_MONTH,
  META_LIBRARY_BULK_MAX,
  META_LIBRARY_KEPT_MAX,
  cleanSocialInstructions,
  type SiteTracking,
} from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { metaAccess } from "@/lib/meta-ads/access";
import { marketFailureSentence } from "@/lib/meta-ads/market-status";
import { createMetaMediaStore } from "@/lib/meta-ads/media-store";
import { validateMetaTracking } from "@/lib/meta-ads/tracking";
import { instructionsRefusal } from "@/lib/social/compliance";
import { isMissingSchemaError } from "@/lib/social/data";

const PATH = "/meta-ads";
const NOT_INCLUDED = "La section Meta Ads n'est pas incluse dans votre formule.";
const NOT_ACTIVATED = "Cette section est en cours d'activation — réessayez dans quelques minutes.";
const ANALYSIS_QUOTA = `Vous avez utilisé vos ${META_ADS_ANALYSES_PER_MONTH} analyses du mois — la prochaine sera possible le mois prochain.`;
const ANALYSIS_BUSY = "Une analyse est déjà en cours — patientez une minute.";
const REGEN_QUOTA = `Vous avez utilisé vos ${META_ADS_REGENERATIONS_PER_MONTH} régénérations du mois.`;
const REGEN_BUSY = "Une régénération est déjà en cours — patientez un instant.";
const NO_ANALYSIS = "Lancez d'abord une analyse depuis l'onglet Diagnostic.";
const ANALYSIS_FAILED = "L'analyse a échoué — réessayez dans un instant.";
const ANALYSIS_COUNTED = "Cette analyse est décomptée de votre quota mensuel.";
const OWN_SITE_TRACKING =
  "Vos outils s'appuient désormais sur votre propre site : ce réglage n'agit que sur votre site Harmony. Suivez le pas-à-pas de cet onglet pour installer le Pixel sur votre site.";

/** Message du service (déjà en français) terminé par une ponctuation, sinon le repli. */
function sentence(message: string, fallback: string): string {
  const text = message.trim();
  if (text === "") return fallback;
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

// ─── Analyse ─────────────────────────────────────────────────────────────────

/**
 * Phrase de fin d'analyse quand la veille manque : le fournisseur et le
 * message utilisateur sont relus sur la ligne enregistrée (le service ne les
 * renvoie pas) ; ligne illisible → phrase générique, jamais une erreur.
 */
async function marketFailureFor(analysisId: string, siteType: "demo" | "client", generationMissing: boolean): Promise<string> {
  let row: { provider: string; error: string | null } | undefined;
  try {
    row = await getDb().query.metaAdsAnalyses.findFirst({ where: eq(metaAdsAnalyses.id, analysisId), columns: { provider: true, error: true } });
  } catch (err) {
    console.error("[meta-ads] état de la veille illisible après l'analyse", { analysisId, err });
  }
  return marketFailureSentence({ provider: row?.provider ?? null, error: row?.error ?? null, siteType, generationMissing });
}

export async function launchMetaAnalysis(): Promise<{ error?: string; message?: string; remaining?: number }> {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  if (!metaAccess(site)) return { error: NOT_INCLUDED };
  const started = Date.now();
  const now = new Date();
  try {
    const outcome = await runMetaAdsAnalysis(getDb(), site.id, { now, mediaStore: createMetaMediaStore() });
    revalidatePath(PATH);
    if (outcome.status === "done") {
      console.info("[meta-ads] analyse lancée depuis le studio", { siteId: site.id, analysisId: outcome.analysisId, marketAvailable: outcome.marketAvailable, ms: Date.now() - started });
      const market = outcome.marketAvailable ? "veille du marché, " : "";
      const parts = [
        outcome.generationError
          ? `Analyse terminée : ${market}diagnostic mis à jour. ${sentence(outcome.generationError, "")}`.trim()
          : `Analyse terminée : ${market}diagnostic, annonces, plan vidéo et plan de campagne mis à jour.`,
      ];
      // Veille absente : dite explicitement (jeton en attente, échec signalé par le service…) plutôt que passée sous silence
      if (!outcome.marketAvailable) parts.push(await marketFailureFor(outcome.analysisId, site.type, Boolean(outcome.generationError)));
      return { message: parts.join(" ") };
    }
    if (outcome.status === "error") {
      console.error("[meta-ads] analyse en erreur", { siteId: site.id, analysisId: outcome.analysisId, message: outcome.message });
      // Refus avant lancement (message utilisateur du service) : rien n'est décompté
      if (outcome.analysisId === null) return { error: sentence(outcome.message, ANALYSIS_FAILED) };
      // Échec après lancement : l'analyse compte dans le quota, le solde est renvoyé
      let remaining: number | undefined;
      try {
        remaining = (await getMetaAdsUsage(getDb(), site.id, now)).analysesRemaining;
      } catch (usageErr) {
        console.error("[meta-ads] quota illisible après échec", { siteId: site.id, err: usageErr });
      }
      return { error: `${sentence(outcome.message, ANALYSIS_FAILED)} ${ANALYSIS_COUNTED}`, ...(remaining === undefined ? {} : { remaining }) };
    }
    switch (outcome.reason) {
      case "quota":
        return { error: ANALYSIS_QUOTA };
      case "busy":
        return { error: ANALYSIS_BUSY };
      case "no_access":
        return { error: NOT_INCLUDED };
    }
  } catch (err) {
    if (isMissingSchemaError(err)) return { error: NOT_ACTIVATED };
    console.error("[meta-ads] analyse échouée", { siteId: site.id, ms: Date.now() - started, err });
    return { error: ANALYSIS_FAILED };
  }
}

// ─── Annonces, plan vidéo et plan : régénération ─────────────────────────────

const regenerateSchema = z.object({ instructions: z.string().max(META_ADS_INSTRUCTIONS_MAX * 4).optional() });

/**
 * Régénère créas, plan vidéo et plan de campagne (veille conservée, diagnostic
 * recalculé par le service avec l'état courant du site, Pixel compris). Les
 * rendus Blob des créas remplacées ne sont pas supprimés : leurs chemins sont
 * déterministes (`meta/<siteId>/<analysisId>/…`) et réécrits en place au
 * prochain rendu ; `assets` est remis à vide par le service.
 */
export async function regenerateMetaAds(input: unknown): Promise<{ error?: string; remaining?: number }> {
  const session = await requireClient();
  const parsed = regenerateSchema.safeParse(input);
  if (!parsed.success) return { error: "Requête invalide." };
  const site = await getSite(session.siteId);
  if (!metaAccess(site)) return { error: NOT_INCLUDED };

  const instructions = cleanSocialInstructions(parsed.data.instructions).slice(0, META_ADS_INSTRUCTIONS_MAX);
  if (instructions !== "") {
    const refusal = instructionsRefusal(instructions, "Vos instructions");
    if (refusal) return { error: refusal };
  }
  const started = Date.now();
  try {
    const outcome = await regenerateMetaAdsJob(getDb(), site.id, { now: new Date(), ...(instructions === "" ? {} : { instructions }) });
    if (outcome.status === "done") {
      console.info("[meta-ads] annonces régénérées depuis le studio", { siteId: site.id, withInstructions: instructions !== "", ms: Date.now() - started });
      revalidatePath(PATH);
      return { remaining: outcome.remaining };
    }
    if (outcome.status === "error") {
      console.error("[meta-ads] régénération en erreur", { siteId: site.id, message: outcome.message });
      return { error: "La régénération a échoué — réessayez dans un instant. Votre quota n'a pas été décompté." };
    }
    switch (outcome.reason) {
      case "quota":
        return { error: REGEN_QUOTA };
      case "busy":
        return { error: REGEN_BUSY };
      case "no_analysis":
        return { error: NO_ANALYSIS };
      case "no_access":
        return { error: NOT_INCLUDED };
    }
  } catch (err) {
    if (isMissingSchemaError(err)) return { error: NOT_ACTIVATED };
    console.error("[meta-ads] régénération échouée", { siteId: site.id, ms: Date.now() - started, err });
    return { error: "La régénération a échoué — réessayez dans un instant." };
  }
}

// ─── Pixel Meta ──────────────────────────────────────────────────────────────

/**
 * Identifiant du Pixel écrit dans `site.theme.tracking` sous verrou de ligne
 * (transaction + SELECT … FOR UPDATE, comme `saveAdsTracking` et
 * `updateSiteSettings`) : la transformation part de l'état le plus frais, les
 * autres réglages de suivi (bandeau, GA, GTM, Google Ads et ses libellés)
 * sont conservés. Vide = Pixel retiré. `metaPixelId` renvoie la valeur
 * enregistrée (normalisée) pour resynchroniser le formulaire.
 *
 * Refusé quand les outils s'appuient sur le site du client : le formulaire
 * n'y est plus proposé (rien ne s'installe sur ce site depuis le studio), et
 * un envoi venu d'un écran resté ouvert annoncerait à tort que « votre site »
 * envoie les événements. L'écran est relu pour montrer le pas-à-pas.
 */
export async function saveMetaTracking(input: unknown): Promise<{ error?: string; message?: string; metaPixelId?: string | null }> {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  if (!metaAccess(site)) return { error: NOT_INCLUDED };
  const checked = validateMetaTracking(input);
  if (!checked.ok) return { error: checked.error };
  const { metaPixelId } = checked.value;

  const db = getDb();
  if (await adsReferenceOf(db, site)) {
    revalidatePath(PATH);
    return { error: OWN_SITE_TRACKING };
  }
  const updated = await db.transaction(async (tx): Promise<{ cookieBanner: boolean } | null> => {
    const [row] = await tx.select({ theme: sites.theme }).from(sites).where(eq(sites.id, site.id)).for("update");
    if (!row) return null;
    const tracking: SiteTracking = { ...row.theme.tracking };
    if (metaPixelId) tracking.metaPixelId = metaPixelId;
    else delete tracking.metaPixelId;
    await tx
      .update(sites)
      .set({ theme: { ...row.theme, tracking: Object.keys(tracking).length > 0 ? tracking : undefined }, updatedAt: new Date() })
      .where(eq(sites.id, site.id));
    return { cookieBanner: tracking.cookieBanner !== false };
  });
  if (!updated) return { error: "Site introuvable." };
  console.info("[meta-ads] Pixel enregistré", { siteId: site.id, pixel: Boolean(metaPixelId) });
  revalidatePath(PATH);
  // Les réglages de l'éditeur affichent aussi l'identifiant du Pixel
  revalidatePath("/editor");
  if (!metaPixelId) return { metaPixelId: null, message: "Pixel Meta retiré : votre site n'envoie plus d'événement à Meta." };
  // Sans bandeau cookies, le Pixel et les événements partent sans consentement : le message le dit
  return {
    metaPixelId,
    message: updated.cookieBanner
      ? "Pixel enregistré : votre site envoie les événements Schedule (clic RDV) et Contact (téléphone, e-mail) à Meta après consentement (bandeau cookies actif)."
      : "Pixel enregistré : votre site envoie les événements à Meta dès l'arrivée du visiteur, car votre bandeau cookies est désactivé — réactivez-le dans l'éditeur (Paramètres → Tracking) pour rester conforme.",
  };
}

// ─── Bibliothèque personnelle : garder, supprimer, restaurer ─────────────────

const adIdsSchema = z.object({ adIds: z.array(z.string().regex(/^\d{5,25}$/)).min(1).max(META_LIBRARY_BULK_MAX) });

const LIBRARY_UNAVAILABLE = "Votre bibliothèque est en cours d'activation — réessayez dans quelques minutes.";
const UNKNOWN_AD = "Cette annonce ne fait plus partie de votre veille — rechargez la page.";
const LIBRARY_FULL = `Votre bibliothèque est pleine (${META_LIBRARY_KEPT_MAX} exemples) — retirez-en avant d'en garder d'autres.`;

/** Refus du service (annonce inconnue, bibliothèque pleine, tables absentes) → message pour le praticien ; null si l'action a abouti. */
function libraryRefusal(outcome: LibraryOutcome): string | null {
  if (outcome.status === "done") return null;
  switch (outcome.reason) {
    case "unknown_ad":
      return UNKNOWN_AD;
    case "full":
      return LIBRARY_FULL;
    case "unavailable":
      return LIBRARY_UNAVAILABLE;
    case "empty":
      return "Aucune annonce sélectionnée.";
    case "too_many":
      return `Trop d'annonces à la fois — ${META_LIBRARY_BULK_MAX} au plus par action.`;
  }
}

type LibraryResult = { error?: string; message?: string };

async function libraryAction(input: unknown, label: string, run: (siteId: string, adIds: string[]) => Promise<LibraryOutcome>, done: (count: number) => string): Promise<LibraryResult> {
  const session = await requireClient();
  const parsed = adIdsSchema.safeParse(input);
  if (!parsed.success) return { error: "Requête invalide." };
  const site = await getSite(session.siteId);
  if (!metaAccess(site)) return { error: NOT_INCLUDED };
  const started = Date.now();
  try {
    const outcome = await run(site.id, parsed.data.adIds);
    const refusal = libraryRefusal(outcome);
    if (refusal) return { error: refusal };
    revalidatePath(PATH);
    const count = outcome.status === "done" ? outcome.count : 0;
    console.info(`[meta-ads] bibliothèque : ${label}`, { siteId: site.id, count, ms: Date.now() - started });
    return { message: done(count) };
  } catch (err) {
    console.error(`[meta-ads] bibliothèque : ${label} en échec`, { siteId: site.id, ms: Date.now() - started, err });
    return { error: "L'action a échoué — réessayez dans un instant." };
  }
}

/**
 * « Garder comme exemple » : l'annonce, son analyse et ses visuels sont
 * conservés indéfiniment dans la bibliothèque du site (vidéos copiées ; un
 * lien expiré est rafraîchi chez le fournisseur de la veille courante).
 */
export async function keepMarketAds(input: unknown): Promise<LibraryResult> {
  return libraryAction(
    input,
    "exemple(s) gardé(s)",
    (siteId, adIds) => keepMetaAds(getDb(), siteId, adIds, { store: createMetaMediaStore(), now: new Date() }),
    (count) => (count > 1 ? `${count} annonces gardées dans votre bibliothèque.` : count === 1 ? "Annonce gardée dans votre bibliothèque." : "Déjà dans votre bibliothèque."),
  );
}

/** « Supprimer » : l'annonce quitte la veille et ne reviendra pas aux analyses suivantes. */
export async function dismissMarketAds(input: unknown): Promise<LibraryResult> {
  return libraryAction(
    input,
    "annonce(s) supprimée(s)",
    (siteId, adIds) => dismissMetaAds(getDb(), siteId, adIds, { store: createMetaMediaStore(), now: new Date() }),
    (count) => (count > 1 ? `${count} annonces supprimées de votre veille.` : "Annonce supprimée de votre veille."),
  );
}

/** Retire un exemple de la bibliothèque, ou annule une suppression : l'annonce retrouve sa place dans la veille. */
export async function restoreMarketAds(input: unknown): Promise<LibraryResult> {
  return libraryAction(
    input,
    "annonce(s) restaurée(s)",
    (siteId, adIds) => restoreMetaAds(getDb(), siteId, adIds, { store: createMetaMediaStore() }),
    (count) => (count > 1 ? `${count} annonces retirées de votre bibliothèque.` : "Annonce retirée de votre bibliothèque."),
  );
}
