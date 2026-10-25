"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, hasSocialMedia, socialPosts, type NewSocialPost, type PlanId } from "@theralys/db";
import { checkEthicalCompliance, createSocialGenerator, FORBIDDEN_PATTERNS } from "@theralys/ai";
import {
  EMPTY_SOCIAL_ASSETS,
  isoDay,
  monthRange,
  SOCIAL_FORMATS,
  SOCIAL_REQUESTS_PER_MONTH,
} from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { parisDay, shiftIsoDay } from "@/lib/calendar";
import { getSite } from "@/lib/data";
import { loadSocialBrief } from "@/lib/social/brief";
import {
  getSocialRequestUsage,
  loadSocialMonthState,
  recentSocialTopics,
  SOCIAL_HORIZON_DAYS,
  type DbTransaction,
} from "@/lib/social/data";
import { ownedSocialPost } from "@/lib/social/post-access";

const PATH = "/reseaux-sociaux";
const NOT_INCLUDED = "Les contenus réseaux sociaux ne sont pas inclus dans votre formule.";

/** Les démos présentent l'offre complète ; les clients suivent leur formule (Scale). */
function socialAccess(site: { type: string; plan: PlanId }): boolean {
  return site.type === "demo" || hasSocialMedia(site.plan);
}
const NOT_FOUND = "Contenu introuvable.";
const FUTURE_DATE = "Choisissez une date à venir.";
const MONTH_OVER = "Ce mois est terminé.";
const MONTH_PREPARED = "Ce mois est déjà préparé.";
const MONTH_TOO_FAR = "Ce mois est trop éloigné — il pourra être préparé 4 mois à l'avance.";
const PLAN_IN_PROGRESS = "Préparation déjà en cours, patientez.";
const QUOTA_REACHED = `Vous avez utilisé vos ${SOCIAL_REQUESTS_PER_MONTH} demandes du mois.`;
/** Fenêtre de la garde anti double-soumission (ms). */
const DUPLICATE_WINDOW_MS = 60_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" valide (date réelle) → la même chaîne, sinon null. */
function validDay(day: string): string | null {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || isoDay(date) !== day ? null : day;
}

// ─── Planification du mois ───────────────────────────────────────────────────

const planSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

/** Planifications en cours dans ce processus (site:mois) : second clic refusé sans appel IA. */
const plansInFlight = new Set<string>();

/** Verrou consultatif non bloquant, libéré au commit — faux si une autre transaction le tient. */
async function tryLock(tx: DbTransaction, key: string): Promise<boolean> {
  const result = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${key})) as locked`);
  return result.rows[0]?.locked === true;
}

/**
 * Prépare les créneaux à pourvoir d'un mois (1 appel IA, N contenus). L'appel
 * IA (25-60 s en mode live) se fait HORS transaction pour ne pas immobiliser
 * une connexion du pool : une transaction courte sous verrou consultatif lit
 * les créneaux, puis une seconde, sous le même verrou, recalcule les créneaux
 * encore libres et n'insère que ceux-là. Les contenus rendus sont insérés même
 * si le modèle n'a pas rempli tous les créneaux (`missing` → « Compléter le mois »).
 */
export async function planSocialMonth(
  input: unknown,
): Promise<{ error?: string; created?: number; missing?: number }> {
  const session = await requireClient();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { error: "Mois invalide" };
  const site = await getSite(session.siteId);
  if (!socialAccess(site)) return { error: NOT_INCLUDED };

  const { month } = parsed.data;
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const now = new Date();
  const today = parisDay(now);
  const { startIso, endIso } = monthRange(year, monthNumber);
  if (endIso <= today) return { error: MONTH_OVER };
  // Même horizon que les demandes : pas de planification (payante) d'un mois lointain
  if (startIso > shiftIsoDay(today, SOCIAL_HORIZON_DAYS)) return { error: MONTH_TOO_FAR };

  const key = `${site.id}:${month}`;
  if (plansInFlight.has(key)) return { error: PLAN_IN_PROGRESS };
  plansInFlight.add(key);
  const started = Date.now();
  const db = getDb();
  try {
    // 1. Transaction courte : verrou + créneaux à pourvoir (lectures via tx)
    const initial = await db.transaction(async (tx) => {
      if (!(await tryLock(tx, key))) return null;
      return loadSocialMonthState(tx, site.id, year, monthNumber, now);
    });
    if (!initial) return { error: PLAN_IN_PROGRESS };
    if (initial.slots.length === 0) return { error: MONTH_OVER };
    if (initial.freeSlots.length === 0) return { error: MONTH_PREPARED };

    // 2. Hors transaction : brief (articles des créneaux « nouvel article » inclus d'office) et appel IA
    const articleIds = initial.freeSlots
      .map((slot) => slot.articleId)
      .filter((id): id is string => typeof id === "string" && id !== "");
    const [{ brief, photosById, refsById }, recentTopics] = await Promise.all([
      loadSocialBrief(site.id, { includeArticleIds: articleIds }),
      recentSocialTopics(site.id, now),
    ]);
    const generator = createSocialGenerator();
    const posts = await generator.planMonth(brief, {
      month,
      slots: initial.freeSlots,
      recentTopics,
      photosById,
      refsById,
    });

    // 3. Transaction courte : verrou repris, créneaux encore libres recalculés, insertion de ceux-là seulement
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
      const { freeSlots } = await loadSocialMonthState(tx, site.id, year, monthNumber, now);
      const free = new Set(freeSlots.map((slot) => slot.date));
      const rows: NewSocialPost[] = [];
      for (const post of posts) {
        if (!free.has(post.scheduledFor)) continue;
        free.delete(post.scheduledFor);
        rows.push({
          siteId: site.id,
          scheduledFor: post.scheduledFor,
          format: post.format,
          source: "calendar",
          status: "ready",
          topic: post.topic,
          template: post.template,
          accentColor: null,
          content: post.content,
        });
      }
      if (rows.length === 0) {
        // Un autre appel a pourvu les créneaux pendant la génération
        if (freeSlots.length === 0) return { error: MONTH_PREPARED };
        throw new Error("aucun contenu exploitable rendu par le générateur");
      }
      await tx.insert(socialPosts).values(rows);
      return { created: rows.length, missing: freeSlots.length - rows.length, slots: freeSlots.length };
    });
    if (result.error) return { error: result.error };

    console.info("[social] plan", {
      siteId: site.id,
      month,
      mode: generator.mode,
      slots: result.slots,
      created: result.created,
      ms: Date.now() - started,
      inputChars: JSON.stringify(brief).length,
    });
    revalidatePath(PATH);
    return { created: result.created, missing: result.missing };
  } catch (err) {
    console.error("[social] plan échoué", { siteId: site.id, month, ms: Date.now() - started, err });
    return { error: "La préparation a échoué — réessayez dans un instant." };
  } finally {
    plansInFlight.delete(key);
  }
}

// ─── Demande « sur mesure » ──────────────────────────────────────────────────

const requestSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(3, "Décrivez votre sujet en quelques mots")
    .max(200, "200 caractères maximum"),
  format: z.enum(SOCIAL_FORMATS),
  accentColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable(),
  scheduledFor: z.string().regex(DATE_RE),
});

/** Premier terme interdit du texte (pour le message), sinon null. */
function forbiddenWord(text: string): string | null {
  for (const { pattern } of FORBIDDEN_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    pattern.lastIndex = 0;
    if (match) return match[0];
  }
  return null;
}

/**
 * Crée un contenu à partir du sujet saisi (1 appel IA). Le sujet est vérifié
 * par le garde-fou éthique AVANT l'appel ; le quota est vérifié avant (message
 * immédiat) ET recompté sous verrou juste avant l'insertion (garantie) ; seule
 * une insertion réussie compte dans le quota mensuel.
 */
export async function requestSocialPost(input: unknown): Promise<{ error?: string; postId?: string }> {
  const session = await requireClient();
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Demande invalide" };
  const site = await getSite(session.siteId);
  if (!socialAccess(site)) return { error: NOT_INCLUDED };
  const { topic, format, scheduledFor } = parsed.data;
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
  if (day > shiftIsoDay(today, SOCIAL_HORIZON_DAYS)) {
    return { error: "Choisissez une date dans les 4 prochains mois." };
  }

  const started = Date.now();
  const db = getDb();
  const generator = createSocialGenerator();
  try {
    // Pré-vérification (message immédiat) ; la garantie est donnée sous verrou à l'insertion
    const usage = await getSocialRequestUsage(site.id, now);
    if (usage.remaining === 0) return { error: QUOTA_REACHED };

    // Garde anti double-soumission : la même demande (sujet, format, date, couleur) créée il y a moins d'une minute
    const duplicate = await db.query.socialPosts.findFirst({
      where: and(
        eq(socialPosts.siteId, site.id),
        eq(socialPosts.source, "request"),
        ne(socialPosts.status, "archived"),
        eq(socialPosts.request, topic),
        eq(socialPosts.format, format),
        eq(socialPosts.scheduledFor, day),
        accentColor ? eq(socialPosts.accentColor, accentColor) : isNull(socialPosts.accentColor),
        gte(socialPosts.createdAt, new Date(now.getTime() - DUPLICATE_WINDOW_MS)),
      ),
      columns: { id: true },
    });
    if (duplicate) return { postId: duplicate.id };

    const [{ brief, photosById, refsById }, recentTopics] = await Promise.all([
      loadSocialBrief(site.id),
      recentSocialTopics(site.id, now),
    ]);
    const post = await generator.generateRequest(brief, {
      topic,
      format,
      accentHex: accentColor,
      scheduledFor: day,
      recentTopics,
      photosById,
      refsById,
    });

    // Insertion sérialisée par site : le quota est recompté juste avant d'écrire
    const inserted = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${site.id}:social-request`}))`);
      const { remaining } = await getSocialRequestUsage(site.id, now, tx);
      if (remaining === 0) return null;
      const [row] = await tx
        .insert(socialPosts)
        .values({
          siteId: site.id,
          scheduledFor: post.scheduledFor,
          format: post.format,
          source: "request",
          status: "ready",
          topic: post.topic,
          request: topic,
          template: post.template,
          accentColor,
          content: post.content,
        })
        .returning({ id: socialPosts.id });
      if (!row) throw new Error("insertion sans retour");
      return row;
    });
    if (!inserted) {
      console.warn("[social] request refusée : quota atteint pendant la génération", {
        siteId: site.id,
        mode: generator.mode,
        ms: Date.now() - started,
      });
      return { error: QUOTA_REACHED };
    }

    console.info("[social] request", {
      siteId: site.id,
      postId: inserted.id,
      mode: generator.mode,
      format,
      ms: Date.now() - started,
      inputChars: JSON.stringify(brief).length,
    });
    revalidatePath(PATH);
    return { postId: inserted.id };
  } catch (err) {
    console.error("[social] request échoué", {
      siteId: site.id,
      mode: generator.mode,
      format,
      ms: Date.now() - started,
      err,
    });
    return {
      error:
        "La création a échoué — réessayez dans un instant. Votre demande n'a pas été décomptée.",
    };
  }
}

// ─── Actions sur un contenu ──────────────────────────────────────────────────

/** Contenu du site de la session, non archivé — sinon null. */
async function activePost(siteId: string, postId: string) {
  const site = await getSite(siteId);
  if (!socialAccess(site)) return null;
  const post = await ownedSocialPost(siteId, postId);
  return post && post.status !== "archived" ? post : null;
}

/** « Marquer comme publié » / « Annuler » : statut et date de publication. */
export async function markSocialPostPublished(
  postId: string,
  published: boolean,
): Promise<{ error?: string }> {
  const session = await requireClient();
  const post = await activePost(session.siteId, postId);
  if (!post) return { error: NOT_FOUND };
  const now = new Date();
  await getDb()
    .update(socialPosts)
    .set({
      status: published ? "published" : "ready",
      publishedAt: published ? now : null,
      updatedAt: now,
    })
    .where(eq(socialPosts.id, post.id));
  revalidatePath(PATH);
  return {};
}

const rescheduleSchema = z.object({ postId: z.string().uuid(), date: z.string().regex(DATE_RE) });

/** « Changer la date » : à partir d'aujourd'hui (jour civil Paris), sauf pour un contenu déjà publié. */
export async function rescheduleSocialPost(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { error: "Date invalide" };
  const post = await activePost(session.siteId, parsed.data.postId);
  if (!post) return { error: NOT_FOUND };
  const day = validDay(parsed.data.date);
  if (!day) return { error: "Date invalide" };
  if (post.status !== "published" && day < parisDay(new Date())) return { error: FUTURE_DATE };
  await getDb()
    .update(socialPosts)
    .set({ scheduledFor: day, updatedAt: new Date() })
    .where(eq(socialPosts.id, post.id));
  revalidatePath(PATH);
  return {};
}

/**
 * « Retirer ce contenu » : archivage (reste compté dans le quota des demandes
 * et dans les créneaux pourvus du mois), suppression best-effort des rendus
 * sur Vercel Blob, `assets` vidés.
 */
export async function archiveSocialPost(postId: string): Promise<{ error?: string }> {
  const session = await requireClient();
  const post = await activePost(session.siteId, postId);
  if (!post) return { error: NOT_FOUND };

  await getDb()
    .update(socialPosts)
    .set({ status: "archived", assets: EMPTY_SOCIAL_ASSETS, updatedAt: new Date() })
    .where(eq(socialPosts.id, post.id));

  const urls = Object.values(post.assets.renders)
    .map((render) => render.url)
    .filter((url): url is string => typeof url === "string" && url !== "");
  if (urls.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { del } = await import("@vercel/blob");
      await del(urls);
    } catch (err) {
      console.warn("[social] suppression des rendus Blob impossible :", err);
    }
  }
  revalidatePath(PATH);
  return {};
}
