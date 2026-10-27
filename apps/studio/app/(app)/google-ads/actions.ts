"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, hasGoogleAds, sites, type PlanId } from "@theralys/db";
import { regenerateGoogleAdsPlan, runGoogleAdsAnalysis } from "@theralys/jobs";
import {
  GOOGLE_ADS_ANALYSES_PER_MONTH,
  GOOGLE_ADS_INSTRUCTIONS_MAX,
  GOOGLE_ADS_PLAN_REGENERATIONS_PER_MONTH,
  cleanSocialInstructions,
  type SiteTracking,
} from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { validateAdsTracking } from "@/lib/google-ads/tracking";
import { instructionsRefusal } from "@/lib/social/compliance";
import { isMissingSchemaError } from "@/lib/social/data";

const PATH = "/google-ads";
const NOT_INCLUDED = "La section Google Ads n'est pas incluse dans votre formule.";
const NOT_ACTIVATED = "Cette section est en cours d'activation — réessayez dans quelques minutes.";
const ANALYSIS_QUOTA = `Vous avez utilisé vos ${GOOGLE_ADS_ANALYSES_PER_MONTH} analyses du mois — la prochaine sera possible le mois prochain.`;
const BUDGET_REACHED = "Le budget mensuel de votre fiche est atteint — l'analyse pourra être relancée le mois prochain.";
const ANALYSIS_BUSY = "Une analyse est déjà en cours — patientez une minute.";
const NO_PROVIDER = "L'analyse Google Ads n'est pas encore activée sur cette plateforme.";
const REGEN_QUOTA = `Vous avez utilisé vos ${GOOGLE_ADS_PLAN_REGENERATIONS_PER_MONTH} régénérations du mois.`;
const REGEN_BUSY = "Une régénération est déjà en cours — patientez un instant.";
const NO_ANALYSIS = "Lancez d'abord une analyse depuis l'onglet Diagnostic.";

/** Les démos présentent l'offre complète ; les clients suivent leur formule (Scale). */
function adsAccess(site: { type: string; plan: PlanId }): boolean {
  return site.type === "demo" || hasGoogleAds(site.plan);
}

// ─── Analyse ─────────────────────────────────────────────────────────────────

export async function launchAdsAnalysis(): Promise<{ error?: string; message?: string }> {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  if (!adsAccess(site)) return { error: NOT_INCLUDED };
  const started = Date.now();
  try {
    const outcome = await runGoogleAdsAnalysis(getDb(), site.id, { now: new Date() });
    revalidatePath(PATH);
    if (outcome.status === "done") {
      console.info("[google-ads] analyse lancée depuis le studio", { siteId: site.id, analysisId: outcome.analysisId, ms: Date.now() - started });
      return { message: "Analyse terminée : diagnostic, mots-clés et plan d'action mis à jour." };
    }
    if (outcome.status === "error") {
      console.error("[google-ads] analyse en erreur", { siteId: site.id, analysisId: outcome.analysisId, message: outcome.message });
      return { error: "L'analyse a échoué — réessayez dans un instant." };
    }
    switch (outcome.reason) {
      case "quota":
        return { error: ANALYSIS_QUOTA };
      case "budget":
        return { error: BUDGET_REACHED };
      case "busy":
        return { error: ANALYSIS_BUSY };
      case "no_provider":
        return { error: NO_PROVIDER };
      case "no_access":
        return { error: NOT_INCLUDED };
    }
  } catch (err) {
    if (isMissingSchemaError(err)) return { error: NOT_ACTIVATED };
    console.error("[google-ads] analyse échouée", { siteId: site.id, ms: Date.now() - started, err });
    return { error: "L'analyse a échoué — réessayez dans un instant." };
  }
}

// ─── Plan d'action ───────────────────────────────────────────────────────────

const regenerateSchema = z.object({ instructions: z.string().max(GOOGLE_ADS_INSTRUCTIONS_MAX * 4).optional() });

export async function regenerateAdsPlan(input: unknown): Promise<{ error?: string; remaining?: number }> {
  const session = await requireClient();
  const parsed = regenerateSchema.safeParse(input);
  if (!parsed.success) return { error: "Requête invalide." };
  const site = await getSite(session.siteId);
  if (!adsAccess(site)) return { error: NOT_INCLUDED };

  const instructions = cleanSocialInstructions(parsed.data.instructions).slice(0, GOOGLE_ADS_INSTRUCTIONS_MAX);
  if (instructions !== "") {
    const refusal = instructionsRefusal(instructions, "Vos instructions");
    if (refusal) return { error: refusal };
  }
  const started = Date.now();
  try {
    const outcome = await regenerateGoogleAdsPlan(getDb(), site.id, { now: new Date(), ...(instructions === "" ? {} : { instructions }) });
    if (outcome.status === "done") {
      console.info("[google-ads] plan régénéré depuis le studio", { siteId: site.id, withInstructions: instructions !== "", ms: Date.now() - started });
      revalidatePath(PATH);
      return { remaining: outcome.remaining };
    }
    if (outcome.status === "error") {
      console.error("[google-ads] régénération en erreur", { siteId: site.id, message: outcome.message });
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
    console.error("[google-ads] régénération échouée", { siteId: site.id, ms: Date.now() - started, err });
    return { error: "La régénération a échoué — réessayez dans un instant." };
  }
}

// ─── Suivi des conversions ───────────────────────────────────────────────────

/**
 * Identifiant AW-… et libellés de conversion écrits dans `site.theme.tracking`
 * sous verrou de ligne (transaction + SELECT … FOR UPDATE, comme
 * `updateSiteSettings`) : la transformation part de l'état le plus frais, les
 * autres réglages de suivi (bandeau, GA, GTM, Meta) sont conservés.
 */
export async function saveAdsTracking(input: unknown): Promise<{ error?: string; message?: string }> {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  if (!adsAccess(site)) return { error: NOT_INCLUDED };
  const checked = validateAdsTracking(input);
  if (!checked.ok) return { error: checked.error };
  const { googleAdsId, labels } = checked.value;

  const db = getDb();
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.select({ theme: sites.theme }).from(sites).where(eq(sites.id, site.id)).for("update");
    if (!row) return false;
    const tracking: SiteTracking = { ...row.theme.tracking };
    if (googleAdsId) tracking.googleAdsId = googleAdsId;
    else delete tracking.googleAdsId;
    if (labels) tracking.googleAdsConversions = labels;
    else delete tracking.googleAdsConversions;
    await tx
      .update(sites)
      .set({ theme: { ...row.theme, tracking: Object.keys(tracking).length > 0 ? tracking : undefined }, updatedAt: new Date() })
      .where(eq(sites.id, site.id));
    return true;
  });
  if (!updated) return { error: "Site introuvable." };
  console.info("[google-ads] suivi des conversions enregistré", { siteId: site.id, tag: Boolean(googleAdsId), labels: labels ? Object.keys(labels).length : 0 });
  revalidatePath(PATH);
  // Les réglages de l'éditeur affichent aussi l'identifiant Google Ads
  revalidatePath("/editor");
  return {
    message: googleAdsId
      ? labels
        ? "Suivi enregistré : votre site envoie les conversions à Google Ads après consentement."
        : "Identifiant enregistré : ajoutez vos libellés pour que les conversions remontent."
      : "Suivi Google Ads retiré.",
  };
}
