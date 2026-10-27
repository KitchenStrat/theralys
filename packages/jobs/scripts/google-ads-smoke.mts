/**
 * Test de fumée « Google Ads » de bout en bout, sur la base locale et en mode
 * mock (aucun identifiant DataForSEO ni Anthropic requis) :
 *
 *   export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/theralys \
 *          AUTH_SECRET=… AI_MOCK=1 DATAFORSEO_MOCK=1 SITES_BASE_URL=http://localhost:3000
 *   pnpm --filter @theralys/jobs exec tsx scripts/google-ads-smoke.mts [--cleanup]
 *
 * Le fichier `.env` de la racine est chargé : s'il contient des identifiants
 * DataForSEO, le fournisseur réel est appelé et facturé (≈ 0,18 $ par
 * analyse) — exporter `DATAFORSEO_MOCK=1` pour forcer le mock. Le site visé
 * doit être une démo (`SMOKE_SITE_SLUG`, défaut : claire-dupont-sophrologue-albi) :
 * sur un site client, le mock est refusé (`no_provider`).
 *
 * Déroulé : charge le contexte du site (métier, ville, spécialités, contact,
 * suivi, fiche, mots-clés suivis, pages d'atterrissage), affiche l'usage du
 * mois, lance une analyse complète avec une instruction (quota mensuel de
 * 2 analyses : au-delà, `quota`), affiche diagnostic, mots-clés, prévision,
 * plan et coût, régénère le plan avec l'instruction « Sans tarif » (quota de
 * 5 par mois), puis affiche l'usage du mois.
 *
 * Avec `--cleanup`, retire les lignes créées par ce passage (analyses
 * `google_ads_analyses` et usages `google_usage` kinds ads_keywords /
 * ads_plan du site depuis le début du script) ; rien d'autre n'est touché.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { and, eq, gte, inArray } from "drizzle-orm";
import { adsPlanIssues } from "@theralys/shared";
import { getDb, googleAdsAnalyses, googleUsage, sites } from "@theralys/db";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const { getGoogleAdsUsage, loadGoogleAdsContext, regenerateGoogleAdsPlan, runGoogleAdsAnalysis } = await import("../src/google-ads.ts");

const SLUG = process.env.SMOKE_SITE_SLUG ?? "claire-dupont-sophrologue-albi";
const cleanup = process.argv.includes("--cleanup");
const start = new Date();

const db = getDb();
const site = await db.query.sites.findFirst({ where: eq(sites.slug, SLUG) });
if (!site) throw new Error(`Site « ${SLUG} » introuvable : lancez le seed (pnpm db:seed).`);

const dfsMock = process.env.DATAFORSEO_MOCK === "1" || !process.env.DATAFORSEO_LOGIN;
console.log(`Site ${site.slug} (${site.type}, ${site.plan}) — IA : ${process.env.AI_MOCK === "1" ? "mock" : "selon ANTHROPIC_API_KEY"}, DataForSEO : ${dfsMock ? "mock" : "réel (facturé)"}`);

// 1. Contexte
const ctx = await loadGoogleAdsContext(db, site.id);
console.log(
  `→ contexte : ${ctx.profession} à ${ctx.city || "(ville inconnue)"}, ${ctx.specialties.length} spécialité(s), téléphone ${ctx.phone ? "oui" : "non"}, réservation ${ctx.bookingUrl ? "oui" : "non"}, balise Ads ${ctx.tracking.googleAdsId ?? "absente"}, fiche ${ctx.profile.linked ? `reliée (note ${ctx.profile.rating ?? "?"}, ${ctx.profile.votes ?? "?"} avis, audit ${ctx.profile.auditScore ?? "?"})` : "non reliée"}, benchmark ${ctx.benchmark ? `note médiane ${ctx.benchmark.medianRating}, ${ctx.benchmark.medianVotes} avis` : "aucun"}, ${ctx.trackedKeywords.length} mot(s)-clé(s) suivi(s), ${ctx.landingPages.length} page(s) d'atterrissage`,
);

// 2. Usage avant
const before = await getGoogleAdsUsage(db, site.id, start);
console.log(`→ usage du mois : ${before.analysesUsed} analyse(s) (${before.analysesRemaining} restante(s)), ${before.planRegenUsed} régénération(s) (${before.planRegenRemaining} restante(s))`);

// 3. Analyse complète
const outcome = await runGoogleAdsAnalysis(db, site.id, { instructions: "Mettre en avant la gestion du stress", now: start });
if (outcome.status !== "done") throw new Error(`runGoogleAdsAnalysis : ${JSON.stringify(outcome)}`);
const analysis = await db.query.googleAdsAnalyses.findFirst({ where: eq(googleAdsAnalyses.id, outcome.analysisId) });
if (!analysis || !analysis.keywords || !analysis.diagnostic) throw new Error("Analyse incomplète en base.");
if (!analysis.plan) throw new Error(`Plan absent : ${analysis.error ?? outcome.planError ?? "sans message"}`);
if (analysis.error !== null) throw new Error(`Colonne error non vide sur une analyse aboutie : ${analysis.error}`);
const { keywords, diagnostic, forecast, plan } = analysis;
console.log(`✔ analyse ${analysis.id} (${analysis.status}, fournisseur ${analysis.provider}, générateur ${analysis.generator}) : coût ${outcome.costUsd} $`);
console.log(`  diagnostic : ${diagnostic.verdict} (${diagnostic.score}/100) — ${diagnostic.headline}`);
console.log(`  ${diagnostic.summary}`);
console.log(`  prérequis : ${diagnostic.prerequisites.length ? diagnostic.prerequisites.join(", ") : "aucun"}`);
console.log(`  mots-clés : ${keywords.keywords.length} retenus sur ${keywords.rawCount} idées (${keywords.dropped} écartées), ${keywords.keywords.filter((k) => k.core).length} au cœur, ${keywords.negatives.length} négatifs`);
for (const group of keywords.groups) {
  console.log(`    - ${group.label} : ${group.keywords.length} (${group.totalVolume} rech./mois, CPC médian ${group.medianCpcEur ?? "—"} €) : ${group.keywords.slice(0, 4).join(", ")}${group.keywords.length > 4 ? "…" : ""}`);
}
// La prévision du fournisseur est agrégée : une ligne (keyword null) pour l'ensemble des mots-clés cœur envoyés
const coreCount = keywords.keywords.filter((k) => k.core).length;
console.log(
  forecast
    ? `  prévision agrégée (${forecast.match}, enchère ${forecast.bidUsd} $ entière) sur l'ensemble des ${coreCount} mots-clés cœur : ${forecast.totalClicks} clics, ${forecast.totalCostUsd} $ (${forecast.rows.length} ligne(s), mot-clé ${forecast.rows[0]?.keyword ?? "null = agrégat"})`
    : "  prévision : indisponible",
);
if (!forecast || forecast.totalClicks <= 0 || forecast.totalCostUsd <= 0 || !Number.isInteger(forecast.bidUsd)) {
  throw new Error(`Prévision agrégée attendue (clics et coût > 0, enchère entière) : ${JSON.stringify(forecast)}`);
}
if (diagnostic.budget.basis !== "forecast") throw new Error(`Le budget devrait se fonder sur la prévision, pas « ${diagnostic.budget.basis} ».`);
console.log(`  plan : ${plan.adGroups.length} groupe(s) d'annonces [${plan.adGroups.map((g) => g.intent).join(", ")}], budget ${plan.campaign.dailyBudgetEur} €/j (${plan.campaign.monthlyBudgetEur} €/mois), ${plan.negatives.length} négatifs, ${plan.tips.length} conseil(s)`);
const issues = adsPlanIssues(plan);
if (issues.length > 0) throw new Error(`adsPlanIssues non vide : ${issues.join(" ; ")}`);
console.log("  adsPlanIssues : aucun écart");

// 4. Régénération du plan avec instruction
const regen = await regenerateGoogleAdsPlan(db, site.id, { instructions: "Sans tarif", now: new Date() });
if (regen.status !== "done") throw new Error(`regenerateGoogleAdsPlan : ${JSON.stringify(regen)}`);
const regenerated = await db.query.googleAdsAnalyses.findFirst({ where: eq(googleAdsAnalyses.id, regen.analysisId), columns: { plan: true, instructions: true, error: true } });
if (!regenerated?.plan) throw new Error("Plan régénéré absent en base.");
const regenIssues = adsPlanIssues(regenerated.plan);
if (regenIssues.length > 0) throw new Error(`adsPlanIssues non vide après régénération : ${regenIssues.join(" ; ")}`);
if (regenerated.error !== null) throw new Error(`Colonne error non effacée après régénération : ${regenerated.error}`);
console.log(`✔ plan régénéré (${regen.remaining} régénération(s) restante(s)) : instructions « ${regenerated.instructions ?? ""} », groupes [${regenerated.plan.adGroups.map((g) => g.intent).join(", ")}], adsPlanIssues : aucun écart`);

// 5. Bilan
const after = await getGoogleAdsUsage(db, site.id, new Date());
console.log(`\nVerdict : ${diagnostic.verdict} · Mots-clés : ${keywords.keywords.length} · Coût : ${outcome.costUsd} $ · Usage du mois : ${after.analysesUsed}/${after.analysesUsed + after.analysesRemaining} analyses, ${after.planRegenUsed}/${after.planRegenUsed + after.planRegenRemaining} régénérations`);

// 6. Nettoyage (lignes créées par ce passage uniquement)
if (cleanup) {
  const analyses = await db.delete(googleAdsAnalyses).where(and(eq(googleAdsAnalyses.siteId, site.id), gte(googleAdsAnalyses.createdAt, start))).returning({ id: googleAdsAnalyses.id });
  const usages = await db
    .delete(googleUsage)
    .where(and(eq(googleUsage.siteId, site.id), inArray(googleUsage.kind, ["ads_keywords", "ads_plan"]), gte(googleUsage.createdAt, start)))
    .returning({ id: googleUsage.id });
  console.log(`→ nettoyage effectué : ${analyses.length} analyse(s), ${usages.length} usage(s)`);
}

await globalThis.__theralysPool?.end();
