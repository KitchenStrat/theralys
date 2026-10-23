"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, hasSocialMedia, socialPosts, type NewSocialPost } from "@theralys/db";
import { checkEthicalCompliance, createSocialGenerator, FORBIDDEN_PATTERNS } from "@theralys/ai";
import {
  EMPTY_SOCIAL_ASSETS,
  isoDay,
  monthRange,
  SOCIAL_FORMATS,
  SOCIAL_REQUESTS_PER_MONTH,
} from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { loadSocialBrief } from "@/lib/social/brief";
import { getSocialMonthState, getSocialRequestUsage, recentSocialTopics } from "@/lib/social/data";
import { ownedSocialPost } from "@/lib/social/post-access";

const PATH = "/reseaux-sociaux";
const NOT_INCLUDED = "Les contenus réseaux sociaux ne sont pas inclus dans votre formule.";
const NOT_FOUND = "Contenu introuvable.";
const FUTURE_DATE = "Choisissez une date à venir.";
/** Horizon des demandes « sur mesure » (jours). */
const REQUEST_HORIZON_DAYS = 120;
/** Fenêtre de la garde anti double-soumission (ms). */
const DUPLICATE_WINDOW_MS = 60_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" valide (date réelle) → la même chaîne, sinon null. */
function validDay(day: string): string | null {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || isoDay(date) !== day ? null : day;
}

function shiftDays(now: Date, days: number): string {
  return isoDay(new Date(now.getTime() + days * 86_400_000));
}

// ─── Planification du mois ───────────────────────────────────────────────────

const planSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

/**
 * Prépare les créneaux libres d'un mois (1 appel IA, N contenus). Verrou
 * consultatif par site et mois dans une transaction : deux clics simultanés
 * ne produisent qu'un plan. Les contenus rendus sont insérés même si le
 * modèle n'a pas rempli tous les créneaux (`missing` → « Compléter le mois »).
 */
export async function planSocialMonth(
  input: unknown,
): Promise<{ error?: string; created?: number; missing?: number }> {
  const session = await requireClient();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { error: "Mois invalide" };
  const site = await getSite(session.siteId);
  if (!hasSocialMedia(site.plan)) return { error: NOT_INCLUDED };

  const { month } = parsed.data;
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const now = new Date();
  if (monthRange(year, monthNumber).endIso <= isoDay(now)) return { error: "Ce mois est terminé." };

  const started = Date.now();
  const db = getDb();
  try {
    const result = await db.transaction(async (tx) => {
      // Sérialise les planifications d'un même site et mois (libéré au commit)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${site.id}:${month}`}))`);

      const { slots, freeSlots } = await getSocialMonthState(site.id, year, monthNumber, now);
      if (slots.length === 0) return { error: "Ce mois est terminé." };
      if (freeSlots.length === 0) return { error: "Ce mois est déjà préparé." };

      const [{ brief, photosById, refsById }, recentTopics] = await Promise.all([
        loadSocialBrief(site.id),
        recentSocialTopics(site.id, now),
      ]);
      const generator = createSocialGenerator();
      const posts = await generator.planMonth(brief, {
        month,
        slots: freeSlots,
        recentTopics,
        photosById,
        refsById,
      });

      // Un contenu par créneau libre, jamais sur une autre date
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
      if (rows.length === 0) throw new Error("aucun contenu exploitable rendu par le générateur");
      await tx.insert(socialPosts).values(rows);

      console.info("[social] plan", {
        siteId: site.id,
        month,
        mode: generator.mode,
        slots: freeSlots.length,
        created: rows.length,
        ms: Date.now() - started,
        inputChars: JSON.stringify(brief).length,
      });
      return { created: rows.length, missing: freeSlots.length - rows.length };
    });
    revalidatePath(PATH);
    return result;
  } catch (err) {
    console.error("[social] plan échoué", { siteId: site.id, month, ms: Date.now() - started, err });
    return { error: "La préparation a échoué — réessayez dans un instant." };
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
 * par le garde-fou éthique AVANT l'appel ; seule une insertion réussie compte
 * dans le quota mensuel.
 */
export async function requestSocialPost(input: unknown): Promise<{ error?: string; postId?: string }> {
  const session = await requireClient();
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Demande invalide" };
  const site = await getSite(session.siteId);
  if (!hasSocialMedia(site.plan)) return { error: NOT_INCLUDED };
  const { topic, format, accentColor, scheduledFor } = parsed.data;

  const compliance = checkEthicalCompliance(topic);
  if (!compliance.ok) {
    const word = forbiddenWord(topic) ?? compliance.violations[0]?.rule ?? "";
    return {
      error: `Votre demande contient un terme que la réglementation nous interdit d'employer (« ${word} »). Reformulez, par exemple avec « accompagner » ou « apaiser ».`,
    };
  }

  const now = new Date();
  const usage = await getSocialRequestUsage(site.id, now);
  if (usage.remaining === 0) {
    return { error: `Vous avez utilisé vos ${SOCIAL_REQUESTS_PER_MONTH} demandes du mois.` };
  }
  const day = validDay(scheduledFor);
  if (!day || day < shiftDays(now, 1)) return { error: FUTURE_DATE };
  if (day > shiftDays(now, REQUEST_HORIZON_DAYS)) {
    return { error: "Choisissez une date dans les 4 prochains mois." };
  }

  const db = getDb();
  // Garde anti double-soumission : même demande créée il y a moins d'une minute
  const duplicate = await db.query.socialPosts.findFirst({
    where: and(
      eq(socialPosts.siteId, site.id),
      eq(socialPosts.source, "request"),
      eq(socialPosts.request, topic),
      gte(socialPosts.createdAt, new Date(now.getTime() - DUPLICATE_WINDOW_MS)),
    ),
    columns: { id: true },
  });
  if (duplicate) return { postId: duplicate.id };

  const started = Date.now();
  const generator = createSocialGenerator();
  try {
    const [{ brief, photosById, refsById }, recentTopics] = await Promise.all([
      loadSocialBrief(site.id),
      recentSocialTopics(site.id, now),
    ]);
    const post = await generator.generateRequest(brief, {
      topic,
      format,
      accentHex: accentColor ? accentColor.toLowerCase() : null,
      scheduledFor: day,
      recentTopics,
      photosById,
      refsById,
    });
    const [inserted] = await db
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
        accentColor: accentColor ? accentColor.toLowerCase() : null,
        content: post.content,
      })
      .returning({ id: socialPosts.id });
    if (!inserted) throw new Error("insertion sans retour");

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
  if (!hasSocialMedia(site.plan)) return null;
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

/** « Changer la date » : à partir d'aujourd'hui, sauf pour un contenu déjà publié. */
export async function rescheduleSocialPost(input: unknown): Promise<{ error?: string }> {
  const session = await requireClient();
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { error: "Date invalide" };
  const post = await activePost(session.siteId, parsed.data.postId);
  if (!post) return { error: NOT_FOUND };
  const day = validDay(parsed.data.date);
  if (!day) return { error: "Date invalide" };
  if (post.status !== "published" && day < isoDay(new Date())) return { error: FUTURE_DATE };
  await getDb()
    .update(socialPosts)
    .set({ scheduledFor: day, updatedAt: new Date() })
    .where(eq(socialPosts.id, post.id));
  revalidatePath(PATH);
  return {};
}

/**
 * « Retirer ce contenu » : archivage (reste compté dans le quota des demandes),
 * suppression best-effort des rendus sur Vercel Blob, `assets` vidés.
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
