"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  googleKeywords,
  googlePosts,
  googleProfileAudits,
  googleRankScans,
  hasGoogleProfile,
  type NewGooglePost,
  type PlanId,
  googleUsage,
} from "@theralys/db";
import { checkEthicalCompliance, createGooglePostGenerator } from "@theralys/ai";
import {
  analyzeGoogleReviews,
  generateGoogleReviewReply,
  googleBudget,
  hasRealGoogleProvider,
  runGoogleScan,
  syncGoogleProfile,
} from "@theralys/jobs";
import {
  EMPTY_SOCIAL_ASSETS,
  GOOGLE_KEYWORDS_MAX,
  GOOGLE_MANUAL_SCANS_PER_MONTH,
  GOOGLE_POST_DAY,
  GOOGLE_POST_REQUESTS_PER_MONTH,
  estimateScanCostUsd,
  isoDay,
  monthRange,
  isMockPlaceId,
  isGoogleReplyTone,
  GOOGLE_REPLY_GENERATIONS_PER_MONTH,
  GOOGLE_POST_INSTRUCTIONS_MAX,
  GOOGLE_POST_REGENERATIONS_PER_MONTH,
  cleanSocialInstructions,
  usageMonthKey,
} from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { parisDay, shiftIsoDay } from "@/lib/calendar";
import { getProspect, getSite, siteUrl } from "@/lib/data";
import { canAddKeyword, isGridRadius, normalizeKeyword } from "@/lib/google/keywords";
import { ownedGooglePost } from "@/lib/google/post-access";
import {
  GOOGLE_HORIZON_DAYS,
  getGoogleRequestUsage,
  loadGoogleMonthState,
  recentGoogleTopics,
  getRegenerationUsage,
} from "@/lib/google/posts";
import { getScanUsage } from "@/lib/google/scans";
import { loadSocialBrief } from "@/lib/social/brief";
import { forbiddenWord, instructionsRefusal } from "@/lib/social/compliance";
import { isMissingSchemaError, recentSocialTopics, type DbTransaction } from "@/lib/social/data";
import { connectGooglePlace } from "../actions";

const PATH = "/fiche-google";
const NOT_INCLUDED = "La section Fiche Google n'est pas incluse dans votre formule.";
const NOT_FOUND = "Post introuvable.";
const FUTURE_DATE = "Choisissez une date à venir.";
const MONTH_OVER = "Ce mois est terminé.";
const MONTH_PREPARED = "Ce mois est déjà préparé.";
const MONTH_TOO_FAR = "Ce mois est trop éloigné — il pourra être préparé 4 mois à l'avance.";
const PLAN_IN_PROGRESS = "Préparation déjà en cours, patientez.";
const QUOTA_REACHED = `Vous avez utilisé vos ${GOOGLE_POST_REQUESTS_PER_MONTH} posts sur mesure du mois.`;
const SCAN_QUOTA_REACHED = `Vous avez utilisé vos ${GOOGLE_MANUAL_SCANS_PER_MONTH} relevés du mois — les relevés planifiés continuent.`;
const BUDGET_REACHED = "Le budget mensuel de votre fiche est atteint — les relevés reprendront le mois prochain.";
const NOT_LINKED = "Reliez d'abord votre fiche Google.";
/** Une actualisation manuelle de la fiche par 24 h. */
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Fenêtre de la garde anti double-soumission (ms). */
const DUPLICATE_WINDOW_MS = 60_000;
/** Un relevé `running` plus vieux que cela est considéré abandonné (ne bloque plus). */
const RUNNING_STALE_MS = 15 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Les démos présentent l'offre complète ; les clients suivent leur formule (Scale). */
function googleAccess(site: { type: string; plan: PlanId }): boolean {
  return site.type === "demo" || hasGoogleProfile(site.plan);
}

/** "YYYY-MM-DD" valide (date réelle) → la même chaîne, sinon null. */
function validDay(day: string): string | null {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || isoDay(date) !== day ? null : day;
}

/** Verrou consultatif non bloquant, libéré au commit — faux si une autre transaction le tient. */
async function tryLock(tx: DbTransaction, key: string): Promise<boolean> {
  const result = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${key})) as locked`);
  return result.rows[0]?.locked === true;
}

function formatParisDateTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(date);
}

// ─── Fiche : liaison et actualisation ────────────────────────────────────────

const placeSchema = z.object({
  placeId: z.string().min(3).max(200),
  name: z.string().max(200),
  address: z.string().max(300),
  rating: z.number().min(0).max(5),
  reviewCount: z.number().int().min(0),
});

export type SyncResult = { error?: string; message?: string };

/** Message lisible d'un résultat de `syncGoogleProfile`. */
function syncMessage(outcome: Awaited<ReturnType<typeof syncGoogleProfile>>): SyncResult {
  if (outcome.status === "done") return { message: "Fiche synchronisée : audit mis à jour ; vos avis arrivent sous 24 h." };
  if (outcome.status === "error") {
    console.error("[google] synchronisation en erreur", outcome.message);
    return { error: "La synchronisation a échoué — réessayez dans un instant." };
  }
  switch (outcome.reason) {
    case "no_place":
      return { error: NOT_LINKED };
    case "recent":
      return { message: "Votre fiche a été synchronisée récemment : rien de nouveau pour l'instant." };
    case "budget":
      return { error: BUDGET_REACHED };
    case "no_access":
      return { error: NOT_INCLUDED };
    case "no_provider":
      return { error: "La synchronisation de la fiche n'est pas encore activée sur cette plateforme." };
  }
}

/**
 * Relie la fiche choisie (recherche `searchGoogle` → `connectGooglePlace`,
 * qui met à jour la fiche praticien) puis lance la première synchronisation
 * (fiche, audit, avis). L'échec de la synchronisation ne défait pas la liaison.
 */
export async function linkGoogleProfile(input: unknown): Promise<SyncResult> {
  const session = await requireClient();
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return { error: "Fiche invalide" };
  const site = await getSite(session.siteId);
  if (!googleAccess(site)) return { error: NOT_INCLUDED };
  // Une fiche déjà reliée ne se relie pas à nouveau par cette action (ce serait
  // une synchronisation forcée sans la règle des 24 h d'« Actualiser »)
  const prospect = await getProspect(site);
  if (prospect?.googlePlaceId && !(isMockPlaceId(prospect.googlePlaceId) && hasRealGoogleProvider())) {
    return { error: "Votre fiche est déjà reliée." };
  }

  const linked = await connectGooglePlace(parsed.data);
  if (linked.error) return { error: linked.error };

  let result: SyncResult;
  try {
    result = syncMessage(await syncGoogleProfile(site.id, { force: true }));
  } catch (err) {
    console.error("[google] première synchronisation échouée", { siteId: site.id, err });
    result = { message: "Fiche reliée. La synchronisation se fera automatiquement d'ici quelques minutes." };
  }
  revalidatePath(PATH);
  return result;
}

/**
 * « Actualiser » : synchronisation forcée, au plus une fois par 24 h (refus
 * explicite sinon). L'intervalle se mesure sur `snapshot.fetchedAt` du
 * dernier audit — la date du dernier appel fournisseur, que les recalculs
 * (après des avis ou un relevé) recopient sans la changer.
 */
export async function refreshGoogleProfile(): Promise<SyncResult> {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  if (!googleAccess(site)) return { error: NOT_INCLUDED };

  const now = new Date();
  let latest: { createdAt: Date; fetchedAt: string | null } | undefined;
  try {
    latest = await getDb().query.googleProfileAudits.findFirst({
      where: eq(googleProfileAudits.siteId, site.id),
      orderBy: [desc(googleProfileAudits.createdAt)],
      columns: { createdAt: true },
      extras: { fetchedAt: sql<string | null>`${googleProfileAudits.snapshot} ->> 'fetchedAt'`.as("fetched_at") },
    });
  } catch (err) {
    if (isMissingSchemaError(err)) return { error: "Cette section est en cours d'activation — réessayez dans quelques minutes." };
    throw err;
  }
  const fetchedAt = latest?.fetchedAt ? new Date(latest.fetchedAt) : null;
  const lastFetch = fetchedAt && !Number.isNaN(fetchedAt.getTime()) ? fetchedAt : (latest?.createdAt ?? null);
  if (lastFetch && now.getTime() - lastFetch.getTime() < REFRESH_INTERVAL_MS) {
    const next = new Date(lastFetch.getTime() + REFRESH_INTERVAL_MS);
    return {
      error: `Votre fiche a déjà été actualisée le ${formatParisDateTime(lastFetch)}. Prochaine actualisation possible le ${formatParisDateTime(next)}.`,
    };
  }

  let result: SyncResult;
  try {
    result = syncMessage(await syncGoogleProfile(site.id, { now, force: true }));
  } catch (err) {
    console.error("[google] actualisation échouée", { siteId: site.id, err });
    result = { error: "L'actualisation a échoué — réessayez dans un instant." };
  }
  revalidatePath(PATH);
  return result;
}

// ─── Mots-clés et relevés de visibilité ──────────────────────────────────────

const keywordSchema = z.object({ keyword: z.unknown(), radius: z.unknown() });

/**
 * Ajoute un mot-clé suivi (≤ GOOGLE_KEYWORDS_MAX actifs) : saisie normalisée,
 * réactivation d'un mot-clé retiré (son historique est conservé), quota
 * recompté sous verrou consultatif par site.
 */
export async function addGoogleKeyword(input: unknown): Promise<{ error?: string; keywordId?: string }> {
  const session = await requireClient();
  const parsed = keywordSchema.safeParse(input);
  if (!parsed.success) return { error: "Saisie invalide" };
  const site = await getSite(session.siteId);
  if (!googleAccess(site)) return { error: NOT_INCLUDED };

  const normalized = normalizeKeyword(parsed.data.keyword);
  if (!normalized.ok) return { error: normalized.error };
  const { keyword } = normalized;
  const radius = isGridRadius(parsed.data.radius) ? parsed.data.radius : "ville";

  try {
    const result = await getDb().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${site.id}:google-keywords`}))`);
      const [existing, active] = await Promise.all([
        tx.query.googleKeywords.findFirst({
          where: and(eq(googleKeywords.siteId, site.id), eq(googleKeywords.keyword, keyword)),
          columns: { id: true, active: true },
        }),
        tx
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(googleKeywords)
          .where(and(eq(googleKeywords.siteId, site.id), eq(googleKeywords.active, true))),
      ]);
      if (existing?.active) return { error: "Ce mot-clé est déjà suivi." };
      const activeCount = active[0]?.count ?? 0;
      if (!canAddKeyword(activeCount)) {
        return { error: `Vous suivez déjà ${GOOGLE_KEYWORDS_MAX} mots-clés : retirez-en un pour en ajouter un autre.` };
      }
      if (existing) {
        await tx
          .update(googleKeywords)
          .set({ active: true, radius, position: activeCount })
          .where(and(eq(googleKeywords.id, existing.id), eq(googleKeywords.siteId, site.id)));
        return { keywordId: existing.id };
      }
      const [row] = await tx
        .insert(googleKeywords)
        .values({ siteId: site.id, keyword, radius, position: activeCount, active: true })
        .returning({ id: googleKeywords.id });
      if (!row) throw new Error("insertion sans retour");
      return { keywordId: row.id };
    });
    if (result.error) return { error: result.error };
    revalidatePath(PATH);
    return { keywordId: result.keywordId };
  } catch (err) {
    if (isMissingSchemaError(err)) return { error: "Cette section est en cours d'activation — réessayez dans quelques minutes." };
    console.error("[google] ajout de mot-clé échoué", { siteId: site.id, err });
    return { error: "L'ajout a échoué — réessayez dans un instant." };
  }
}

/** Retire un mot-clé (active = false ; ses relevés restent en historique). */
export async function removeGoogleKeyword(keywordId: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = z.string().uuid().safeParse(keywordId);
  if (!parsed.success) return { error: "Mot-clé introuvable." };
  const site = await getSite(session.siteId);
  if (!googleAccess(site)) return { error: NOT_INCLUDED };
  const [row] = await getDb()
    .update(googleKeywords)
    .set({ active: false })
    .where(and(eq(googleKeywords.id, parsed.data), eq(googleKeywords.siteId, site.id), eq(googleKeywords.active, true)))
    .returning({ id: googleKeywords.id });
  if (!row) return { error: "Mot-clé introuvable." };
  revalidatePath(PATH);
  return {};
}

export type ScanResult = { error?: string; scanId?: string; message?: string };

/**
 * « Relever ma visibilité » : quota mensuel des relevés manuels et budget
 * vérifiés avant l'appel (message immédiat ; le service les garantit), un seul
 * relevé en cours par mot-clé, puis `runGoogleScan(…, "manual")`.
 */
export async function scanGoogleKeyword(keywordId: unknown): Promise<ScanResult> {
  const session = await requireClient();
  const parsed = z.string().uuid().safeParse(keywordId);
  if (!parsed.success) return { error: "Mot-clé introuvable." };
  const site = await getSite(session.siteId);
  if (!googleAccess(site)) return { error: NOT_INCLUDED };

  const db = getDb();
  const now = new Date();
  const keyword = await db.query.googleKeywords.findFirst({
    where: and(eq(googleKeywords.id, parsed.data), eq(googleKeywords.siteId, site.id), eq(googleKeywords.active, true)),
    columns: { id: true, keyword: true },
  });
  if (!keyword) return { error: "Mot-clé introuvable." };

  const [usage, budget, running] = await Promise.all([
    getScanUsage(site.id, now),
    googleBudget(db, { id: site.id, type: site.type }, now),
    db.query.googleRankScans.findFirst({
      where: and(
        eq(googleRankScans.siteId, site.id),
        eq(googleRankScans.keywordId, keyword.id),
        eq(googleRankScans.status, "running"),
        gte(googleRankScans.scannedAt, new Date(now.getTime() - RUNNING_STALE_MS)),
      ),
      columns: { id: true },
    }),
  ]);
  if (usage.remaining === 0) return { error: SCAN_QUOTA_REACHED };
  if (budget.remainingUsd < estimateScanCostUsd()) return { error: BUDGET_REACHED };
  if (running) return { error: "Un relevé est déjà en cours pour ce mot-clé — patientez une minute." };

  const started = Date.now();
  try {
    const outcome = await runGoogleScan(site.id, keyword.id, "manual", { now });
    revalidatePath(PATH);
    if (outcome.status === "done") {
      console.info("[google] scan", { siteId: site.id, keyword: keyword.keyword, ms: Date.now() - started });
      return { scanId: outcome.scan.id, message: "Relevé terminé." };
    }
    if (outcome.status === "error") {
      console.error("[google] scan en erreur", { siteId: site.id, keyword: keyword.keyword, message: outcome.message });
      return { error: "Le relevé a échoué — il n'est pas décompté. Réessayez dans un instant." };
    }
    switch (outcome.reason) {
      case "budget":
        return { error: BUDGET_REACHED };
      case "quota":
        return { error: SCAN_QUOTA_REACHED };
      case "no_location":
        return { error: "La position de votre fiche est inconnue : actualisez d'abord votre fiche." };
      case "inactive":
        return { error: "Ce mot-clé n'est plus suivi." };
    }
  } catch (err) {
    console.error("[google] scan échoué", { siteId: site.id, keyword: keyword.keyword, ms: Date.now() - started, err });
    return { error: "Le relevé a échoué — réessayez dans un instant." };
  }
}

// ─── Avis ────────────────────────────────────────────────────────────────────

/** « Analyser les nouveaux avis » : sentiment, thèmes et réponse proposée (≤ 20 avis par appel). */
/** Analyses en cours dans ce processus (par site) : second appel refusé sans appel IA. */
const analysesInFlight = new Set<string>();

export async function analyzeReviews(): Promise<{ error?: string; analyzed?: number }> {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  if (!googleAccess(site)) return { error: NOT_INCLUDED };
  if (analysesInFlight.has(site.id)) return { error: "Analyse déjà en cours, patientez." };
  analysesInFlight.add(site.id);
  const started = Date.now();
  try {
    const analyzed = await analyzeGoogleReviews(site.id, { limit: 20 });
    console.info("[google] avis analysés", { siteId: site.id, analyzed, ms: Date.now() - started });
    revalidatePath(PATH);
    return { analyzed };
  } catch (err) {
    console.error("[google] analyse des avis échouée", { siteId: site.id, ms: Date.now() - started, err });
    return { error: "L'analyse a échoué — réessayez dans un instant." };
  } finally {
    analysesInFlight.delete(site.id);
  }
}

// ─── Avis : réponse générée avec un ton choisi ───────────────────────────────

const replySchema = z.object({
  reviewId: z.string().uuid(),
  tone: z.string().refine(isGoogleReplyTone, "Ton inconnu"),
});

/** Générations en cours dans ce processus (site:avis) : second clic refusé sans appel IA. */
const repliesInFlight = new Set<string>();

/**
 * « Générer une réponse » sous un avis sans réponse : un appel IA pour cet
 * avis, avec le ton choisi ; la réponse remplace la proposition et reste
 * modifiable avant d'être copiée sur Google.
 */
export async function generateReviewReply(input: unknown): Promise<{ error?: string; reply?: string; remaining?: number }> {
  const session = await requireClient();
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { error: "Requête invalide." };
  const site = await getSite(session.siteId);
  if (!googleAccess(site)) return { error: NOT_INCLUDED };
  const key = `${site.id}:${parsed.data.reviewId}`;
  if (repliesInFlight.has(key)) return { error: "Génération déjà en cours, patientez." };
  repliesInFlight.add(key);
  const started = Date.now();
  try {
    const outcome = await generateGoogleReviewReply(site.id, parsed.data.reviewId, parsed.data.tone);
    if (outcome.status === "done") {
      console.info("[google] réponse générée", { siteId: site.id, tone: parsed.data.tone, ms: Date.now() - started });
      revalidatePath(PATH);
      return { reply: outcome.analysis.suggestedReply, remaining: outcome.remaining };
    }
    if (outcome.status === "error") return { error: outcome.message };
    switch (outcome.reason) {
      case "not_found":
        return { error: "Avis introuvable." };
      case "no_text":
        return { error: "Cet avis ne contient pas de texte : rédigez une réponse courte de remerciement." };
      case "quota":
        return { error: `Vous avez utilisé vos ${GOOGLE_REPLY_GENERATIONS_PER_MONTH} générations de réponse du mois.` };
      case "busy":
        return { error: "Génération déjà en cours, patientez." };
    }
  } catch (err) {
    console.error("[google] génération de réponse échouée", { siteId: site.id, ms: Date.now() - started, err });
    return { error: "La génération a échoué — réessayez dans un instant." };
  } finally {
    repliesInFlight.delete(key);
  }
}

// ─── Posts Google : contexte de génération ───────────────────────────────────

/** Mots-clés suivis (actifs) du site, par position : référencement local des posts. */
async function activeKeywordTexts(siteId: string): Promise<string[]> {
  const rows = await getDb().query.googleKeywords.findMany({
    where: and(eq(googleKeywords.siteId, siteId), eq(googleKeywords.active, true)),
    orderBy: [asc(googleKeywords.position), asc(googleKeywords.createdAt)],
    columns: { keyword: true },
  });
  return rows.map((r) => r.keyword).slice(0, GOOGLE_KEYWORDS_MAX);
}

/** Sujets récents des deux canaux (posts Google et réseaux sociaux) : jamais le même thème le même mois. */
async function recentTopicsAcrossChannels(siteId: string, now: Date): Promise<string[]> {
  const [google, social] = await Promise.all([recentGoogleTopics(siteId, now), recentSocialTopics(siteId, now)]);
  return [...new Set([...google, ...social])].slice(0, 60);
}

// ─── Posts Google : préparation du mois ──────────────────────────────────────

const planSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

/** Planifications en cours dans ce processus (site:mois) : second clic refusé sans appel IA. */
const plansInFlight = new Set<string>();

/**
 * Prépare les mardis à pourvoir d'un mois (1 appel IA, N posts). Même schéma
 * que `planSocialMonth` : transaction courte sous verrou consultatif (créneaux
 * libres), appel IA hors transaction, seconde transaction sous le même verrou
 * qui n'insère que les créneaux encore libres.
 */
export async function planGoogleMonth(input: unknown): Promise<{ error?: string; created?: number; missing?: number }> {
  const session = await requireClient();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { error: "Mois invalide" };
  const site = await getSite(session.siteId);
  if (!googleAccess(site)) return { error: NOT_INCLUDED };

  const { month } = parsed.data;
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const now = new Date();
  const today = parisDay(now);
  const { startIso, endIso } = monthRange(year, monthNumber);
  if (endIso <= today) return { error: MONTH_OVER };
  if (startIso > shiftIsoDay(today, GOOGLE_HORIZON_DAYS)) return { error: MONTH_TOO_FAR };

  const key = `${site.id}:google:${month}`;
  if (plansInFlight.has(key)) return { error: PLAN_IN_PROGRESS };
  plansInFlight.add(key);
  const started = Date.now();
  const db = getDb();
  try {
    const initial = await db.transaction(async (tx) => {
      if (!(await tryLock(tx, key))) return null;
      return loadGoogleMonthState(tx, site.id, year, monthNumber, now);
    });
    if (!initial) return { error: PLAN_IN_PROGRESS };
    if (initial.slots.length === 0) return { error: MONTH_OVER };
    if (initial.freeSlots.length === 0) return { error: MONTH_PREPARED };

    const [{ brief, photosById, refsById }, recentTopics, keywords] = await Promise.all([
      loadSocialBrief(site.id),
      recentTopicsAcrossChannels(site.id, now),
      activeKeywordTexts(site.id),
    ]);
    const generator = createGooglePostGenerator();
    const links = { siteUrl: siteUrl(site), bookingUrl: site.bookingUrl };
    const posts = await generator.planMonth(brief, { month, slots: initial.freeSlots, recentTopics, photosById, refsById, keywords }, links);

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
      const { freeSlots } = await loadGoogleMonthState(tx, site.id, year, monthNumber, now);
      const free = new Set(freeSlots.map((slot) => slot.date));
      const rows: NewGooglePost[] = [];
      for (const post of posts) {
        if (!free.has(post.scheduledFor)) continue;
        free.delete(post.scheduledFor);
        rows.push({
          siteId: site.id,
          scheduledFor: post.scheduledFor,
          source: "calendar",
          status: "ready",
          topic: post.topic,
          template: post.template,
          accentColor: null,
          content: { ...post.content, planDays: [GOOGLE_POST_DAY] },
        });
      }
      if (rows.length === 0) {
        if (freeSlots.length === 0) return { error: MONTH_PREPARED };
        throw new Error("aucun post exploitable rendu par le générateur");
      }
      await tx.insert(googlePosts).values(rows);
      return { created: rows.length, missing: freeSlots.length - rows.length, slots: freeSlots.length };
    });
    if (result.error) return { error: result.error };

    console.info("[google] plan", {
      siteId: site.id,
      month,
      mode: generator.mode,
      slots: result.slots,
      created: result.created,
      ms: Date.now() - started,
    });
    revalidatePath(PATH);
    return { created: result.created, missing: result.missing };
  } catch (err) {
    console.error("[google] plan échoué", { siteId: site.id, month, ms: Date.now() - started, err });
    return { error: "La préparation a échoué — réessayez dans un instant." };
  } finally {
    plansInFlight.delete(key);
  }
}

// ─── Posts Google : demande « sur mesure » ───────────────────────────────────

const requestSchema = z.object({
  topic: z.string().trim().min(3, "Décrivez votre sujet en quelques mots").max(200, "200 caractères maximum"),
  accentColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable(),
  scheduledFor: z.string().regex(DATE_RE),
});

/**
 * Crée un post Google à partir du sujet saisi (1 appel IA). Sujet vérifié par
 * le garde-fou éthique AVANT l'appel ; quota vérifié avant (message immédiat)
 * et recompté sous verrou juste avant l'insertion (garantie).
 */
export async function requestGooglePost(input: unknown): Promise<{ error?: string; postId?: string }> {
  const session = await requireClient();
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Demande invalide" };
  const site = await getSite(session.siteId);
  if (!googleAccess(site)) return { error: NOT_INCLUDED };
  const { topic, scheduledFor } = parsed.data;
  const accentColor = parsed.data.accentColor ? parsed.data.accentColor.toLowerCase() : null;

  const compliance = checkEthicalCompliance(topic);
  if (!compliance.ok) {
    const word = forbiddenWord(topic) ?? compliance.violations[0]?.rule ?? "";
    return {
      error: `Votre demande contient un terme que la réglementation nous interdit d'employer (« ${word} »). Reformulez, par exemple avec « accompagner » ou « apaiser ».`,
    };
  }

  const now = new Date();
  const today = parisDay(now);
  const day = validDay(scheduledFor);
  if (!day || day < shiftIsoDay(today, 1)) return { error: FUTURE_DATE };
  if (day > shiftIsoDay(today, GOOGLE_HORIZON_DAYS)) return { error: "Choisissez une date dans les 4 prochains mois." };

  const started = Date.now();
  const db = getDb();
  const generator = createGooglePostGenerator();
  try {
    const usage = await getGoogleRequestUsage(site.id, now);
    if (usage.remaining === 0) return { error: QUOTA_REACHED };

    const duplicate = await db.query.googlePosts.findFirst({
      where: and(
        eq(googlePosts.siteId, site.id),
        eq(googlePosts.source, "request"),
        ne(googlePosts.status, "archived"),
        eq(googlePosts.request, topic),
        eq(googlePosts.scheduledFor, day),
        accentColor ? eq(googlePosts.accentColor, accentColor) : isNull(googlePosts.accentColor),
        gte(googlePosts.createdAt, new Date(now.getTime() - DUPLICATE_WINDOW_MS)),
      ),
      columns: { id: true },
    });
    if (duplicate) return { postId: duplicate.id };

    const [{ brief, photosById, refsById }, recentTopics, keywords] = await Promise.all([
      loadSocialBrief(site.id),
      recentTopicsAcrossChannels(site.id, now),
      activeKeywordTexts(site.id),
    ]);
    const post = await generator.generateRequest(
      brief,
      { topic, accentHex: accentColor, scheduledFor: day, recentTopics, photosById, refsById, keywords },
      { siteUrl: siteUrl(site), bookingUrl: site.bookingUrl },
    );

    const inserted = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${site.id}:google-request`}))`);
      const { remaining } = await getGoogleRequestUsage(site.id, now, tx);
      if (remaining === 0) return null;
      const [row] = await tx
        .insert(googlePosts)
        .values({
          siteId: site.id,
          scheduledFor: post.scheduledFor,
          source: "request",
          status: "ready",
          topic: post.topic,
          request: topic,
          template: post.template,
          accentColor,
          content: post.content,
        })
        .returning({ id: googlePosts.id });
      if (!row) throw new Error("insertion sans retour");
      return row;
    });
    if (!inserted) return { error: QUOTA_REACHED };

    console.info("[google] request", { siteId: site.id, postId: inserted.id, mode: generator.mode, ms: Date.now() - started });
    revalidatePath(PATH);
    return { postId: inserted.id };
  } catch (err) {
    console.error("[google] request échoué", { siteId: site.id, mode: generator.mode, ms: Date.now() - started, err });
    return { error: "La création a échoué — réessayez dans un instant. Votre demande n'a pas été décomptée." };
  }
}

// ─── Régénération d'un post avec instructions ────────────────────────────────

const regenerateSchema = z.object({
  postId: z.string().uuid(),
  instructions: z.string().max(GOOGLE_POST_INSTRUCTIONS_MAX * 2).default(""),
});

/**
 * Régénérations en cours dans ce processus (par post) : second clic refusé
 * sans appel IA, en plus du verrou consultatif en base (autres instances).
 */
const regenerationsInFlight = new Set<string>();
const REGEN_IN_PROGRESS = "Régénération déjà en cours, patientez.";
const REGEN_QUOTA_REACHED = `Vous avez utilisé vos ${GOOGLE_POST_REGENERATIONS_PER_MONTH} régénérations du mois.`;

/** Rendus Blob d'un post (avant remplacement ou archivage), best-effort. */
async function deleteRenders(assets: { renders: Record<string, { url?: string | null }> }): Promise<void> {
  const urls = Object.values(assets.renders)
    .map((render) => render.url)
    .filter((url): url is string => typeof url === "string" && url !== "");
  if (urls.length === 0 || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { del } = await import("@vercel/blob");
    await del(urls);
  } catch (err) {
    console.warn("[google] suppression des rendus Blob impossible :", err);
  }
}

/**
 * « Régénérer » un post du mois avec des instructions libres : un appel IA
 * (même sujet, mêmes date et couleur), le texte et le visuel sont remplacés,
 * les anciens rendus supprimés. Quota GOOGLE_POST_REGENERATIONS_PER_MONTH
 * (lignes `google_usage` kind "post_regen"), même schéma que
 * `requestGooglePost` : vérifié avant l'appel IA (message immédiat, sous
 * verrou consultatif du post) et recompté sous verrou par site dans la
 * transaction qui inscrit la régénération et remplace le post (garantie).
 * Un post publié ne se régénère pas.
 */
export async function regenerateGooglePost(input: unknown): Promise<{ error?: string; remaining?: number }> {
  const session = await requireClient();
  const parsed = regenerateSchema.safeParse(input);
  if (!parsed.success) return { error: "Requête invalide." };
  const site = await getSite(session.siteId);
  if (!googleAccess(site)) return { error: NOT_INCLUDED };
  const post = await activePost(session.siteId, parsed.data.postId);
  if (!post) return { error: NOT_FOUND };
  if (post.status === "published") return { error: "Ce post est déjà publié : annulez la publication pour le régénérer." };

  const instructions = cleanSocialInstructions(parsed.data.instructions).slice(0, GOOGLE_POST_INSTRUCTIONS_MAX);
  if (instructions !== "") {
    const refusal = instructionsRefusal(instructions, "Vos instructions");
    if (refusal) return { error: refusal };
  }
  if (regenerationsInFlight.has(post.id)) return { error: REGEN_IN_PROGRESS };
  regenerationsInFlight.add(post.id);
  const now = new Date();
  const started = Date.now();
  const db = getDb();
  const generator = createGooglePostGenerator();
  try {
    // 1. Transaction courte : verrou consultatif du post (régénération déjà lancée ailleurs ?) et quota (message immédiat)
    const initial = await db.transaction(async (tx) => {
      if (!(await tryLock(tx, `google-post-regen:${post.id}`))) return null;
      return getRegenerationUsage(site.id, now, tx);
    });
    if (!initial) return { error: REGEN_IN_PROGRESS };
    if (initial.remaining === 0) return { error: REGEN_QUOTA_REACHED };

    // 2. Hors transaction : brief et appel IA — les instructions du post ont leur propre bloc dans le prompt
    //    (distinct des consignes permanentes du praticien)
    const [{ brief, photosById, refsById }, recentTopics, keywords] = await Promise.all([
      loadSocialBrief(site.id),
      recentTopicsAcrossChannels(site.id, now),
      activeKeywordTexts(site.id),
    ]);
    const regenerated = await generator.generateRequest(
      brief,
      {
        topic: post.request ?? post.topic,
        accentHex: post.accentColor,
        scheduledFor: post.scheduledFor,
        recentTopics: recentTopics.filter((t) => t !== post.topic),
        photosById,
        refsById,
        keywords,
        ...(instructions === "" ? {} : { instructions }),
      },
      { siteUrl: siteUrl(site), bookingUrl: site.bookingUrl },
    );

    // 3. Transaction courte sous verrou par site : quota recompté, post remplacé et régénération inscrite ensemble
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${site.id}:google-post-regen`}))`);
      const { remaining } = await getRegenerationUsage(site.id, now, tx);
      if (remaining === 0) return { error: REGEN_QUOTA_REACHED };
      const [updated] = await tx
        .update(googlePosts)
        .set({
          topic: regenerated.topic,
          template: regenerated.template,
          content: regenerated.content,
          assets: EMPTY_SOCIAL_ASSETS,
          downloadedAt: null,
          updatedAt: now,
        })
        .where(and(eq(googlePosts.id, post.id), eq(googlePosts.siteId, site.id), ne(googlePosts.status, "archived")))
        .returning({ id: googlePosts.id });
      // Retiré pendant la génération : rien à remplacer, rien à décompter
      if (!updated) return { error: NOT_FOUND };
      await tx.insert(googleUsage).values({ siteId: site.id, month: usageMonthKey(now), kind: "post_regen", costUsd: 0, requests: 1 });
      return { remaining: remaining - 1 };
    });
    if ("error" in outcome) {
      console.warn("[google] régénération refusée après l'appel IA", { siteId: site.id, postId: post.id, reason: outcome.error, ms: Date.now() - started });
      return { error: outcome.error };
    }
    await deleteRenders(post.assets);
    console.info("[google] post régénéré", { siteId: site.id, postId: post.id, mode: generator.mode, withInstructions: instructions !== "", ms: Date.now() - started });
    revalidatePath(PATH);
    return { remaining: outcome.remaining };
  } catch (err) {
    console.error("[google] régénération échouée", { siteId: site.id, postId: post.id, mode: generator.mode, ms: Date.now() - started, err });
    return { error: "La régénération a échoué — réessayez dans un instant. Votre quota n'a pas été décompté." };
  } finally {
    regenerationsInFlight.delete(post.id);
  }
}

// ─── Actions sur un post ─────────────────────────────────────────────────────

/** Post du site de la session, non archivé — sinon null. */
async function activePost(siteId: string, postId: string) {
  const site = await getSite(siteId);
  if (!googleAccess(site)) return null;
  const post = await ownedGooglePost(siteId, postId);
  return post && post.status !== "archived" ? post : null;
}

/** « Marquer comme publié » / « Annuler ». */
export async function markGooglePostPublished(postId: string, publishedInput: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsedPublished = z.boolean().safeParse(publishedInput);
  if (!parsedPublished.success) return { error: "Requête invalide." };
  const published = parsedPublished.data;
  const post = await activePost(session.siteId, postId);
  if (!post) return { error: NOT_FOUND };
  const now = new Date();
  await getDb()
    .update(googlePosts)
    .set({ status: published ? "published" : "ready", publishedAt: published ? now : null, updatedAt: now })
    .where(eq(googlePosts.id, post.id));
  revalidatePath(PATH);
  return {};
}

const rescheduleSchema = z.object({ postId: z.string().uuid(), date: z.string().regex(DATE_RE) });

/** « Changer la date » : à partir d'aujourd'hui (jour civil Paris), sauf pour un post déjà publié. */
export async function rescheduleGooglePost(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { error: "Date invalide" };
  const post = await activePost(session.siteId, parsed.data.postId);
  if (!post) return { error: NOT_FOUND };
  const day = validDay(parsed.data.date);
  if (!day) return { error: "Date invalide" };
  const today = parisDay(new Date());
  if (post.status !== "published" && day < today) return { error: FUTURE_DATE };
  if (day > shiftIsoDay(today, GOOGLE_HORIZON_DAYS)) return { error: "Choisissez une date dans les 4 prochains mois." };
  await getDb().update(googlePosts).set({ scheduledFor: day, updatedAt: new Date() }).where(eq(googlePosts.id, post.id));
  revalidatePath(PATH);
  return {};
}

/** « Retirer ce post » : archivage (reste compté dans le quota et les créneaux), rendus Blob supprimés. */
export async function archiveGooglePost(postId: string): Promise<{ error?: string }> {
  const session = await requireClient();
  const post = await activePost(session.siteId, postId);
  if (!post) return { error: NOT_FOUND };

  await getDb()
    .update(googlePosts)
    .set({ status: "archived", assets: EMPTY_SOCIAL_ASSETS, updatedAt: new Date() })
    .where(eq(googlePosts.id, post.id));

  await deleteRenders(post.assets);
  revalidatePath(PATH);
  return {};
}
