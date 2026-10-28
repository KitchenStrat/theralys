"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, metaAdsAnalyses, sites } from "@theralys/db";
import { getMetaAdsUsage, regenerateMetaAds as regenerateMetaAdsJob, runMetaAdsAnalysis } from "@theralys/jobs";
import { META_ADS_ANALYSES_PER_MONTH, META_ADS_INSTRUCTIONS_MAX, META_ADS_REGENERATIONS_PER_MONTH, cleanSocialInstructions, type SiteTracking } from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { metaAccess } from "@/lib/meta-ads/access";
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

/** Message du service (déjà en français) terminé par une ponctuation, sinon le repli. */
function sentence(message: string, fallback: string): string {
  const text = message.trim();
  if (text === "") return fallback;
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

// ─── Analyse ─────────────────────────────────────────────────────────────────

export async function launchMetaAnalysis(): Promise<{ error?: string; message?: string; remaining?: number }> {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  if (!metaAccess(site)) return { error: NOT_INCLUDED };
  const started = Date.now();
  const now = new Date();
  try {
    const outcome = await runMetaAdsAnalysis(getDb(), site.id, { now });
    revalidatePath(PATH);
    if (outcome.status === "done") {
      console.info("[meta-ads] analyse lancée depuis le studio", { siteId: site.id, analysisId: outcome.analysisId, marketAvailable: outcome.marketAvailable, ms: Date.now() - started });
      const market = outcome.marketAvailable ? "veille du marché, " : "";
      return {
        message: outcome.generationError
          ? `Analyse terminée : ${market}diagnostic mis à jour. ${sentence(outcome.generationError, "")}`.trim()
          : `Analyse terminée : ${market}diagnostic, annonces, plan vidéo et plan de campagne mis à jour.`,
      };
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

/** URLs Blob des visuels rendus de la dernière analyse aboutie (à supprimer après une régénération, qui remet `assets` à zéro). */
async function renderedBlobUrls(siteId: string): Promise<string[]> {
  const rows = await getDb().query.metaAdsAnalyses.findMany({
    where: eq(metaAdsAnalyses.siteId, siteId),
    columns: { assets: true, status: true },
  });
  return rows
    .filter((r) => r.status === "done")
    .flatMap((r) => Object.values(r.assets.renders).map((render) => render.url))
    .filter((url): url is string => typeof url === "string" && url !== "");
}

/** Suppression best-effort des rendus Blob devenus orphelins (jamais bloquante). */
async function deleteBlobRenders(urls: string[]): Promise<void> {
  if (urls.length === 0 || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { del } = await import("@vercel/blob");
    await del([...new Set(urls)]);
  } catch (err) {
    console.warn("[meta-ads] suppression des rendus Blob orphelins impossible :", err);
  }
}

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
    // Les rendus Blob des créas remplacées sont relus avant l'appel (le service remet `assets` à zéro) puis supprimés
    const previousRenders = await renderedBlobUrls(site.id);
    const outcome = await regenerateMetaAdsJob(getDb(), site.id, { now: new Date(), ...(instructions === "" ? {} : { instructions }) });
    if (outcome.status === "done") {
      console.info("[meta-ads] annonces régénérées depuis le studio", { siteId: site.id, withInstructions: instructions !== "", ms: Date.now() - started });
      await deleteBlobRenders(previousRenders);
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
 * sont conservés. Vide = Pixel retiré.
 */
export async function saveMetaTracking(input: unknown): Promise<{ error?: string; message?: string }> {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  if (!metaAccess(site)) return { error: NOT_INCLUDED };
  const checked = validateMetaTracking(input);
  if (!checked.ok) return { error: checked.error };
  const { metaPixelId } = checked.value;

  const db = getDb();
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
  if (!metaPixelId) return { message: "Pixel Meta retiré : votre site n'envoie plus d'événement à Meta." };
  // Sans bandeau cookies, le Pixel et les événements partent sans consentement : le message le dit
  return {
    message: updated.cookieBanner
      ? "Pixel enregistré : votre site envoie les événements Schedule (clic RDV) et Contact (téléphone, e-mail) à Meta après consentement (bandeau cookies actif)."
      : "Pixel enregistré : votre site envoie les événements à Meta dès l'arrivée du visiteur, car votre bandeau cookies est désactivé — réactivez-le dans l'éditeur (Paramètres → Tracking) pour rester conforme.",
  };
}
