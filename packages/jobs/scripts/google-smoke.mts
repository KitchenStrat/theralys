/**
 * Test de fumée « Fiche Google » de bout en bout, sur la base locale et en
 * mode mock (aucun identifiant DataForSEO ni Anthropic requis) :
 *
 *   export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/theralys \
 *          AUTH_SECRET=… AI_MOCK=1 SITES_BASE_URL=http://localhost:3000
 *   pnpm --filter @theralys/jobs exec tsx scripts/google-smoke.mts [--cleanup]
 *
 * Le fichier `.env` de la racine est chargé : s'il contient des identifiants
 * DataForSEO, le fournisseur réel est appelé et facturé (fiche ≈ 0,005 $,
 * relevé ≈ 0,10 $, avis ≈ 0,004 $) — exporter `DATAFORSEO_MOCK=1` pour forcer
 * le mock. Le site visé doit être une démo (`SMOKE_SITE_SLUG`, défaut :
 * claire-dupont-sophrologue-albi) : sur un site client, le mock est refusé
 * (`no_provider`, tâche d'avis en erreur) et la synchronisation s'arrête.
 *
 * Déroulé : relie une fiche mock au prospect si nécessaire, synchronise la
 * fiche (force : l'intervalle de 30 jours est ignoré, pas le budget de 1 $
 * de la démo), ajoute un mot-clé, lance un relevé manuel (quota mensuel de
 * 10 relevés : au-delà, `quota`), collecte la tâche d'avis (le mock répond
 * immédiatement ; la collecte remplace les avis Places / mock du site par
 * ceux de la tâche), analyse les avis, puis affiche score, visibilité, avis
 * analysés et dépenses du mois. Les relevés et usages s'horodatent à l'heure
 * réelle, quel que soit le `now` passé.
 *
 * Avec `--cleanup`, retire les lignes créées par ce passage (usages, tâches,
 * audits, avis mock synchronisés, mot-clé créé ou relevés du mot-clé
 * existant, fiche mock reliée) ; les avis remplacés par la collecte ne sont
 * pas restaurés (ils reviennent au prochain tick `syncGoogleReviews` pour une
 * démo), et le site lui-même n'est jamais touché.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { and, eq, gte, inArray } from "drizzle-orm";
import {
  getDb,
  googleKeywords,
  googleProfileAudits,
  googleRankScans,
  googleReviewTasks,
  googleReviews,
  googleUsage,
  prospects,
  sites,
} from "@theralys/db";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const {
  analyzeGoogleReviews,
  collectGoogleReviewTasks,
  monthlyGoogleSpendUsd,
  runGoogleScan,
  syncGoogleProfile,
} = await import("../src/google-profile.ts");

const SLUG = process.env.SMOKE_SITE_SLUG ?? "claire-dupont-sophrologue-albi";
const KEYWORD = process.env.SMOKE_KEYWORD ?? "sophrologue albi";
const cleanup = process.argv.includes("--cleanup");
const start = new Date();

const db = getDb();
const site = await db.query.sites.findFirst({ where: eq(sites.slug, SLUG) });
if (!site) throw new Error(`Site « ${SLUG} » introuvable : lancez le seed (pnpm db:seed).`);
if (!site.prospectId) throw new Error(`Le site « ${SLUG} » n'a pas de prospect.`);
const prospect = await db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) });
if (!prospect) throw new Error("Prospect introuvable.");

console.log(`Site ${site.slug} (${site.type}, ${site.plan}) — mode IA : ${process.env.AI_MOCK === "1" ? "mock" : "selon ANTHROPIC_API_KEY"}, DataForSEO : ${process.env.DATAFORSEO_LOGIN ? "réel" : "mock"}`);

// 1. Fiche reliée (mock si nécessaire)
if (!prospect.googlePlaceId) {
  await db.update(prospects).set({ googlePlaceId: `mock-${site.slug}` }).where(eq(prospects.id, prospect.id));
  console.log(`→ fiche mock reliée : mock-${site.slug}`);
}

// 2. Synchronisation forcée de la fiche
const sync = await syncGoogleProfile(site.id, { force: true, now: start });
if (sync.status !== "done") throw new Error(`syncGoogleProfile : ${JSON.stringify(sync)}`);
console.log(`✔ fiche synchronisée : score ${sync.audit.score}/100 (${sync.audit.audit.grade}), source ${sync.audit.snapshot.source}, ${sync.audit.audit.actions.length} action(s)`);

// 3. Mot-clé actif
let keyword = await db.query.googleKeywords.findFirst({ where: and(eq(googleKeywords.siteId, site.id), eq(googleKeywords.keyword, KEYWORD)) });
let keywordCreated = false;
if (!keyword) {
  [keyword] = await db.insert(googleKeywords).values({ siteId: site.id, keyword: KEYWORD, radius: "ville" }).returning();
  keywordCreated = true;
} else if (!keyword.active) {
  await db.update(googleKeywords).set({ active: true }).where(eq(googleKeywords.id, keyword.id));
}
console.log(`→ mot-clé « ${keyword!.keyword} » (${keywordCreated ? "créé" : "existant"})`);

// 4. Relevé manuel
const scan = await runGoogleScan(site.id, keyword!.id, "manual", { now: new Date() });
if (scan.status !== "done") throw new Error(`runGoogleScan : ${JSON.stringify(scan)}`);
const summary = scan.scan.summary!;
console.log(`✔ relevé : visibilité ${summary.visibility} %, présent sur ${summary.found}/${summary.total} points, rang moyen ${summary.avgRank ?? "—"}, top 3 sur ${summary.top3} points, ${scan.scan.competitors.length} concurrent(s), coût ${scan.scan.costUsd} $`);

// 5. Tâches d'avis (le mock répond immédiatement)
const collected = await collectGoogleReviewTasks(new Date());
console.log(`✔ tâches d'avis collectées : ${collected.processed}`);

// 6. Analyse des avis restants
const analyzed = await analyzeGoogleReviews(site.id, { now: new Date() });
const reviews = await db.query.googleReviews.findMany({ where: eq(googleReviews.siteId, site.id), columns: { analysis: true, source: true } });
console.log(`✔ avis analysés par cet appel : ${analyzed} (avis du site : ${reviews.length}, analysés : ${reviews.filter((r) => r.analysis).length})`);

// 7. Bilan
const latest = await db.query.googleProfileAudits.findFirst({ where: eq(googleProfileAudits.siteId, site.id), orderBy: (t, { desc }) => [desc(t.createdAt)] });
const spent = await monthlyGoogleSpendUsd(db, site.id, new Date());
console.log(`\nScore : ${latest?.score ?? "—"}/100 · Visibilité « ${keyword!.keyword} » : ${summary.visibility} % · Avis analysés : ${reviews.filter((r) => r.analysis).length} · Dépenses du mois : ${spent.toFixed(4)} $`);

// 8. Nettoyage (lignes créées par ce passage uniquement)
if (cleanup) {
  await db.delete(googleUsage).where(and(eq(googleUsage.siteId, site.id), gte(googleUsage.createdAt, start)));
  await db.delete(googleReviewTasks).where(and(eq(googleReviewTasks.siteId, site.id), gte(googleReviewTasks.createdAt, start)));
  await db.delete(googleProfileAudits).where(and(eq(googleProfileAudits.siteId, site.id), gte(googleProfileAudits.createdAt, start)));
  await db.delete(googleReviews).where(and(eq(googleReviews.siteId, site.id), inArray(googleReviews.source, ["mock"]), gte(googleReviews.syncedAt, start)));
  if (keywordCreated) await db.delete(googleKeywords).where(eq(googleKeywords.id, keyword!.id));
  else await db.delete(googleRankScans).where(and(eq(googleRankScans.keywordId, keyword!.id), gte(googleRankScans.scannedAt, start)));
  if (!prospect.googlePlaceId) await db.update(prospects).set({ googlePlaceId: null }).where(eq(prospects.id, prospect.id));
  console.log("→ nettoyage effectué");
}

await globalThis.__theralysPool?.end();
