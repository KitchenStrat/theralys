/**
 * Test de fumée « Meta Ads » de bout en bout, sur la base locale et en mode
 * mock (aucun jeton Meta ni clé Anthropic requis) :
 *
 *   export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/theralys \
 *          AUTH_SECRET=… AI_MOCK=1 DATAFORSEO_MOCK=1 META_ADS_MOCK=1 SITES_BASE_URL=http://localhost:3000
 *   pnpm --filter @theralys/jobs exec tsx scripts/meta-ads-smoke.mts [--cleanup]
 *
 * Le fichier `.env` de la racine est chargé : s'il contient un jeton
 * META_AD_LIBRARY_TOKEN, la bibliothèque réelle est interrogée (gratuite,
 * mais soumise aux limites de débit) — exporter `META_ADS_MOCK=1` pour forcer
 * le mock. Le site visé doit être une démo (`SMOKE_SITE_SLUG`, défaut :
 * claire-dupont-sophrologue-albi) : sur un site client, le mock est refusé et
 * la veille est indisponible.
 *
 * Déroulé : charge le contexte du site (graine : métier, ville, département,
 * région, termes ; pages d'atterrissage ; entrée du diagnostic ; photos),
 * affiche l'usage du mois, lance une analyse complète avec une instruction
 * (quota mensuel de 2 analyses : au-delà, `quota`), affiche la veille (zone
 * retenue, comptes par zone, annonces, synthèse), le diagnostic, les créas,
 * le plan vidéo et le plan de campagne, régénère avec l'instruction « Sans
 * tarif » (quota de 5 par mois), puis affiche l'usage du mois.
 *
 * Avec `--cleanup`, retire les lignes créées par ce passage (analyses
 * `meta_ads_analyses` et usages `google_usage` kinds meta_analysis /
 * meta_regen du site depuis le début du script) ; rien d'autre n'est touché.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { and, eq, gte, inArray } from "drizzle-orm";
import { META_MARKET_SCOPE_LABELS, marketScopeNote, metaCreativeIssues, metaPlanIssues, metaVideoPlanIssues } from "@theralys/shared";
import { getDb, googleUsage, metaAdsAnalyses, sites } from "@theralys/db";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const { getMetaAdsUsage, loadMetaAdsContext, regenerateMetaAds, runMetaAdsAnalysis } = await import("../src/meta-ads.ts");

const SLUG = process.env.SMOKE_SITE_SLUG ?? "claire-dupont-sophrologue-albi";
const cleanup = process.argv.includes("--cleanup");
const start = new Date();

const db = getDb();
const site = await db.query.sites.findFirst({ where: eq(sites.slug, SLUG) });
if (!site) throw new Error(`Site « ${SLUG} » introuvable : lancez le seed (pnpm db:seed).`);

const metaMock = process.env.META_ADS_MOCK === "1" || !process.env.META_AD_LIBRARY_TOKEN;
console.log(`Site ${site.slug} (${site.type}, ${site.plan}) — IA : ${process.env.AI_MOCK === "1" ? "mock" : "selon ANTHROPIC_API_KEY"}, bibliothèque Meta : ${metaMock ? (process.env.META_ADS_MOCK === "1" ? "mock" : "indisponible (sans jeton)") : "réelle"}`);

// 1. Contexte
const ctx = await loadMetaAdsContext(db, site.id);
const { seed, diagnosticInput: di } = ctx;
console.log(
  `→ contexte : ${seed.profession} (${seed.professionFamily}) à ${seed.city || "(ville inconnue)"}, code postal ${seed.postalCode ?? "inconnu"}, ${seed.department ? `${seed.department.name} (${seed.department.code}), ${seed.region}` : "département inconnu"}, ${seed.specialties.length} spécialité(s), ${seed.competitorNames.length} concurrent(s), termes [${seed.searchTerms.join(", ")}]`,
);
console.log(
  `  diagnostic : réservation ${di.hasBookingUrl ? "oui" : "non"}, téléphone ${di.hasPhone ? "oui" : "non"}, Pixel ${di.hasPixel ? "oui" : "non"}, bandeau ${di.cookieBanner ? "actif" : "désactivé"}, ${di.photosCount} photo(s), Facebook ${di.facebookUrl ? "oui" : "non"}, Instagram ${di.instagramUrl ? "oui" : "non"}, ${di.motifPages} page(s) de spécialité, fiche ${di.profile.linked ? `reliée (note ${di.profile.rating ?? "?"}, ${di.profile.votes ?? "?"} avis)` : "non reliée"}, ${ctx.landingPages.length} page(s) d'atterrissage, ${Object.keys(ctx.photosById).length} photo(s) résolue(s)`,
);

// 2. Usage avant
const before = await getMetaAdsUsage(db, site.id, start);
console.log(`→ usage du mois : ${before.analysesUsed} analyse(s) (${before.analysesRemaining} restante(s)), ${before.regenUsed} régénération(s) (${before.regenRemaining} restante(s))`);

// 3. Analyse complète
const outcome = await runMetaAdsAnalysis(db, site.id, { instructions: "Mettre en avant la gestion du stress", now: start });
if (outcome.status !== "done") throw new Error(`runMetaAdsAnalysis : ${JSON.stringify(outcome)}`);
const analysis = await db.query.metaAdsAnalyses.findFirst({ where: eq(metaAdsAnalyses.id, outcome.analysisId) });
if (!analysis || !analysis.diagnostic) throw new Error("Analyse incomplète en base.");
if (!analysis.creatives || !analysis.videoPlan || !analysis.plan) throw new Error(`Génération incomplète : ${analysis.error ?? outcome.generationError ?? "sans message"}`);
const { market, diagnostic, creatives, videoPlan, plan } = analysis;
console.log(`✔ analyse ${analysis.id} (${analysis.status}, fournisseur ${analysis.provider}, générateur ${analysis.generator}) : ${analysis.calls} appel(s) à la bibliothèque`);

if (market) {
  if (analysis.error !== null) throw new Error(`Colonne error non vide sur une analyse aboutie : ${analysis.error}`);
  console.log(`  veille (${market.source}) : zone retenue « ${META_MARKET_SCOPE_LABELS[market.scopeUsed]} » (${market.scopeUsed}), comptes ville ${market.counts.ville} / département ${market.counts.departement} / région ${market.counts.region} / France ${market.counts.france}, ${market.ads.length} annonce(s) conservée(s), ${market.calls} appel(s)${market.truncated ? ", tronquée" : ""}`);
  console.log(`  ${marketScopeNote(market, seed)}`);
  const strong = market.ads.filter((a) => a.signal === "fort").length;
  const active = market.ads.filter((a) => a.active).length;
  console.log(`  signaux : ${strong} fort(s), ${market.ads.filter((a) => a.signal === "moyen").length} moyen(s), ${active} en diffusion ; ${market.ads.filter((a) => a.matchedTerms.length > 1).length} annonce(s) remontée(s) par plusieurs termes`);
  for (const ad of market.ads.slice(0, 3)) {
    console.log(`    - ${ad.pageName} [${ad.scope}, ${ad.signal}, ${ad.runningDays ?? "?"} j, portée ${ad.euTotalReach ?? "?"}] « ${ad.titles[0] ?? ad.bodies[0]?.slice(0, 60) ?? ""} » (${ad.matchedTerms.join(", ")})`);
  }
  if (!market.insights) throw new Error("Synthèse de la veille absente.");
  console.log(`  synthèse : ${market.insights.summary}`);
  console.log(`    angles [${market.insights.angles.map((a) => a.label).join(", ")}], ${market.insights.hooks.length} accroche(s), ${market.insights.offers.length} offre(s), ${market.insights.gaps.length} opportunité(s), ${market.insights.warnings.length} avertissement(s)`);
  if (analysis.calls !== market.calls) throw new Error(`Appels incohérents : ${analysis.calls} en colonne, ${market.calls} dans la veille.`);
} else {
  console.log(`  veille : indisponible (${analysis.provider})${analysis.error ? ` — ${analysis.error}` : ""}`);
}

console.log(`  diagnostic : ${diagnostic.verdict} (${diagnostic.score}/100) — ${diagnostic.headline}`);
console.log(`  ${diagnostic.summary}`);
console.log(`  prérequis : ${diagnostic.prerequisites.length ? diagnostic.prerequisites.join(", ") : "aucun"}${diagnostic.marketNote ? ` · veille : ${diagnostic.marketNote}` : ""}`);

const paths = ctx.landingPages.map((p) => p.path);
console.log(`  créas : ${creatives.creatives.length} [${creatives.creatives.map((c) => `${c.id} ${c.angle}${c.photoId ? ` (${c.photoId})` : ""} → ${c.landingPath}`).join(", ")}], ${creatives.notes.length} note(s)`);
for (const c of creatives.creatives.slice(0, 2)) console.log(`    - ${c.name} : « ${c.hook} » / ${c.headline} / ${c.cta}`);
const creativeIssues = metaCreativeIssues(creatives, paths);
if (creativeIssues.length > 0) throw new Error(`metaCreativeIssues non vide : ${creativeIssues.join(" ; ")}`);
console.log(`  plan vidéo : ${videoPlan.videos.length} vidéo(s) [${videoPlan.videos.map((v) => `${v.id} ${v.angle} ${v.durationSeconds} s, ${v.beats.length} temps`).join(", ")}], ${videoPlan.equipment.length} matériel, ${videoPlan.editingTips.length} conseil(s) de montage`);
const videoIssues = metaVideoPlanIssues(videoPlan);
if (videoIssues.length > 0) throw new Error(`metaVideoPlanIssues non vide : ${videoIssues.join(" ; ")}`);
console.log(`  plan : objectif ${plan.objective.type} (${plan.objective.pixelEvent}), ${plan.campaign.geo.city} + ${plan.campaign.geo.radiusKm} km, ${plan.campaign.ages.min}–${plan.campaign.ages.max} ans, ${plan.adSets.length} ensemble(s) [${plan.adSets.map((s) => `${s.audience} (${s.creativeIds.length})`).join(", ")}], budget ${plan.budget.dailyEur} €/j (${plan.budget.monthlyEur} €/mois), ${plan.milestones.length} jalon(s), ${plan.tips.length} conseil(s)`);
const planIssues = metaPlanIssues(plan, di.hasPixel);
if (planIssues.length > 0) throw new Error(`metaPlanIssues non vide : ${planIssues.join(" ; ")}`);
if (di.hasPixel && plan.objective.type !== "conversions_site") throw new Error("Le Pixel est installé : l'objectif devrait être les conversions.");
if (!di.hasPixel && plan.objective.type !== "traffic") throw new Error("Sans Pixel : l'objectif devrait être le trafic (repli).");
console.log("  metaCreativeIssues / metaVideoPlanIssues / metaPlanIssues : aucun écart");

// 4. Régénération avec instruction
const regen = await regenerateMetaAds(db, site.id, { instructions: "Sans tarif", now: new Date() });
if (regen.status !== "done") throw new Error(`regenerateMetaAds : ${JSON.stringify(regen)}`);
const regenerated = await db.query.metaAdsAnalyses.findFirst({ where: eq(metaAdsAnalyses.id, regen.analysisId), columns: { creatives: true, videoPlan: true, plan: true, instructions: true, error: true, assets: true, market: true } });
if (!regenerated?.creatives || !regenerated.videoPlan || !regenerated.plan) throw new Error("Génération régénérée absente en base.");
const regenIssues = [...metaCreativeIssues(regenerated.creatives, paths), ...metaVideoPlanIssues(regenerated.videoPlan), ...metaPlanIssues(regenerated.plan, di.hasPixel)];
if (regenIssues.length > 0) throw new Error(`Écarts après régénération : ${regenIssues.join(" ; ")}`);
if (regenerated.error !== null) throw new Error(`Colonne error non effacée après régénération : ${regenerated.error}`);
if (Object.keys(regenerated.assets.renders).length !== 0) throw new Error("Les rendus n'ont pas été remis à vide.");
if (JSON.stringify(regenerated.market) !== JSON.stringify(market)) throw new Error("La veille a été modifiée par la régénération.");
console.log(`✔ régénéré (${regen.remaining} régénération(s) restante(s), ${regen.removedRenderUrls?.length ?? 0} rendu(s) à supprimer) : instructions « ${regenerated.instructions ?? "" } », ${regenerated.creatives.creatives.length} créas, ${regenerated.videoPlan.videos.length} vidéos, veille et diagnostic conservés, aucun écart`);

// 5. Bilan
const after = await getMetaAdsUsage(db, site.id, new Date());
console.log(
  `\nZone : ${market ? market.scopeUsed : "—"} · Annonces : ${market ? market.ads.length : 0} · Verdict : ${diagnostic.verdict} · Créas : ${creatives.creatives.length} · Vidéos : ${videoPlan.videos.length} · Appels : ${analysis.calls} · Usage du mois : ${after.analysesUsed}/${after.analysesUsed + after.analysesRemaining} analyses, ${after.regenUsed}/${after.regenUsed + after.regenRemaining} régénérations`,
);

// 6. Nettoyage (lignes créées par ce passage uniquement)
if (cleanup) {
  const analyses = await db.delete(metaAdsAnalyses).where(and(eq(metaAdsAnalyses.siteId, site.id), gte(metaAdsAnalyses.createdAt, start))).returning({ id: metaAdsAnalyses.id });
  const usages = await db
    .delete(googleUsage)
    .where(and(eq(googleUsage.siteId, site.id), inArray(googleUsage.kind, ["meta_analysis", "meta_regen"]), gte(googleUsage.createdAt, start)))
    .returning({ id: googleUsage.id });
  console.log(`→ nettoyage effectué : ${analyses.length} analyse(s), ${usages.length} usage(s)`);
}

await globalThis.__theralysPool?.end();
