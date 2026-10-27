"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  hasSocialMedia,
  socialPosts,
  socialSettings,
  type NewSocialPost,
  type PlanId,
} from "@theralys/db";
import {
  checkEthicalCompliance,
  checkSocialCompliance,
  createSocialGenerator,
  FORBIDDEN_PATTERNS,
  SOCIAL_FORBIDDEN_PATTERNS,
} from "@theralys/ai";
import {
  cleanSocialInstructions,
  EMPTY_SOCIAL_ASSETS,
  isGoogleReplyTone,
  isoDay,
  monthRange,
  normalizePostDays,
  SOCIAL_FORMATS,
  SOCIAL_INSTRUCTIONS_MAX,
  SOCIAL_POST_INSTRUCTIONS_MAX,
  SOCIAL_REGENERATIONS_PER_MONTH,
  SOCIAL_REQUESTS_PER_MONTH,
  type SocialFormat,
} from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { parisDay, shiftIsoDay } from "@/lib/calendar";
import { getSite } from "@/lib/data";
import { loadSocialBrief } from "@/lib/social/brief";
import { normalizeCaption, SOCIAL_CAPTION_MAX } from "@/lib/social/caption";
import {
  getSocialRequestUsage,
  loadSocialMonthState,
  recentSocialTopics,
  SOCIAL_HORIZON_DAYS,
  type DbTransaction,
  isMissingSchemaError,
} from "@/lib/social/data";
import { ownedSocialPost } from "@/lib/social/post-access";
import { getSocialRegenerationUsage, recordSocialRegeneration } from "@/lib/social/regen";
import { recentGoogleTopics } from "@/lib/google/posts";
import { getSocialSettings } from "@/lib/social/settings";

const PATH = "/reseaux-sociaux";

/** Sujets récents des deux canaux (réseaux sociaux et posts Google) : jamais le même thème le même mois. */
async function recentTopicsAcrossChannels(siteId: string, now: Date): Promise<string[]> {
  const [social, google] = await Promise.all([
    recentSocialTopics(siteId, now),
    recentGoogleTopics(siteId, now).catch(() => [] as string[]),
  ]);
  return [...new Set([...social, ...google])].slice(0, 60);
}
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
    // Réglages « Paramétrage » : jours de publication (créneaux), voix et consignes (brief)
    const settings = await getSocialSettings(site.id);
    const { postDays } = settings;
    // 1. Transaction courte : verrou + créneaux à pourvoir (lectures via tx)
    const initial = await db.transaction(async (tx) => {
      if (!(await tryLock(tx, key))) return null;
      return loadSocialMonthState(tx, site.id, year, monthNumber, now, postDays);
    });
    if (!initial) return { error: PLAN_IN_PROGRESS };
    if (initial.slots.length === 0) return { error: MONTH_OVER };
    if (initial.freeSlots.length === 0) return { error: MONTH_PREPARED };

    // 2. Hors transaction : brief (articles des créneaux « nouvel article » inclus d'office) et appel IA
    const articleIds = initial.freeSlots
      .map((slot) => slot.articleId)
      .filter((id): id is string => typeof id === "string" && id !== "");
    const [{ brief, photosById, refsById }, recentTopics] = await Promise.all([
      loadSocialBrief(site.id, { includeArticleIds: articleIds, settings }),
      recentTopicsAcrossChannels(site.id, now),
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
      const { freeSlots } = await loadSocialMonthState(tx, site.id, year, monthNumber, now, postDays);
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
          content: { ...post.content, planDays: [...postDays] },
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
function forbiddenWord(
  text: string,
  patterns: readonly { pattern: RegExp }[] = FORBIDDEN_PATTERNS,
): string | null {
  for (const { pattern } of patterns) {
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
      recentTopicsAcrossChannels(site.id, now),
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

// ─── Paramétrage (voix, consignes, jours de publication) ─────────────────────

const socialSettingsSchema = z.object({
  designation: z.enum(["nous", "je", "on"]),
  accord: z.enum(["feminin", "masculin"]),
  reader: z.enum(["vous", "tu"]),
  tone: z.enum(["chaleureux", "rassurant", "pose", "direct", "pedagogue"]),
  instructions: z.string().trim().max(SOCIAL_INSTRUCTIONS_MAX),
  postDays: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .max(7)
    .transform((days) => normalizePostDays(days)),
});

/**
 * Enregistre les réglages « Paramétrage » du site (une ligne par site, créée
 * ou mise à jour). Les consignes libres passent le garde-fou éthique et les
 * règles sociales AVANT d'être stockées : un terme interdit est refusé avec
 * le mot en cause (la modale reste sur l'étape « Vos consignes »). Les
 * contenus déjà préparés ne changent pas : les réglages valent pour les
 * prochaines préparations et demandes.
 */
export async function saveSocialSettings(
  input: unknown,
): Promise<{ error?: string; field?: "instructions" }> {
  const session = await requireClient();
  const parsed = socialSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: "Réglages invalides" };
  const site = await getSite(session.siteId);
  if (!socialAccess(site)) return { error: NOT_INCLUDED };

  const instructions = cleanSocialInstructions(parsed.data.instructions);
  if (instructions !== "") {
    const refusal = instructionsRefusal(instructions);
    if (refusal) return { error: refusal, field: "instructions" };
  }

  const { designation, accord, reader, tone, postDays } = parsed.data;
  const values = {
    voiceDesignation: designation,
    voiceAccord: accord,
    voiceReader: reader,
    voiceTone: tone,
    instructions: instructions === "" ? null : instructions,
    postDays,
    updatedAt: new Date(),
  };
  try {
    await getDb()
      .insert(socialSettings)
      .values({ siteId: site.id, ...values })
      .onConflictDoUpdate({ target: socialSettings.siteId, set: values });
  } catch (err) {
    if (isMissingSchemaError(err)) {
      return { error: "L'option Paramétrage est en cours d'activation — réessayez dans quelques minutes." };
    }
    console.error("[social] enregistrement des réglages échoué", { siteId: site.id, err });
    return { error: "L'enregistrement a échoué — réessayez dans un instant." };
  }
  revalidatePath(PATH);
  return {};
}

/**
 * Contrôle des consignes : on ne juge que ce que le praticien DEMANDE. Les
 * phrases négatives (« Ne jamais promettre de guérison », « éviter… ») et les
 * passages entre guillemets (« … ») sont des interdictions ou des citations,
 * pas des consignes à reproduire ; le reste est vérifié en minuscules (la
 * règle « majuscules criées » vise les légendes, pas un sigle dans une
 * consigne). Message distinct pour le vocabulaire médical et les règles
 * sociales ; null si tout est acceptable.
 */
function instructionsRefusal(instructions: string): string | null {
  const NEGATION =
    /\b(ne|n')\s*\S*\s*(pas|jamais|plus|rien|aucun|aucune)\b|\b(jamais|éviter|évitez|évite|sans|interdit|interdite|interdits|proscrire|proscrit|bannir|exclure|aucun|aucune|pas de)\b/i;
  const judged = instructions
    .replace(/«[^»]*»|"[^"\n]*"|“[^”]*”/g, " ")
    .split(/(?<=[.!?;\n])\s+|\n/)
    .filter((sentence) => sentence.trim() !== "" && !NEGATION.test(sentence))
    .join(" ")
    .toLowerCase();
  if (judged.trim() === "") return null;
  const ethical = checkEthicalCompliance(judged);
  if (!ethical.ok) {
    const word = forbiddenWord(judged, FORBIDDEN_PATTERNS) ?? ethical.violations[0]?.rule ?? "";
    return `Vos consignes contiennent un terme que la réglementation nous interdit d'employer (« ${word} »). Reformulez, par exemple avec « accompagner » ou « apaiser ».`;
  }
  const social = checkSocialCompliance(judged);
  if (!social.ok) {
    const rule = social.violations[0]?.rule ?? "";
    const word = forbiddenWord(judged, SOCIAL_FORBIDDEN_PATTERNS) ?? rule;
    const detail = rule === "" || rule.toLowerCase() === word.toLowerCase() ? `« ${word} »` : `« ${word} », ${rule}`;
    return `Vos consignes contiennent une formulation que nous n'employons pas sur les réseaux (${detail}). Reformulez-la.`;
  }
  return null;
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

/** Rendus Blob d'un contenu (avant remplacement ou archivage), best-effort. */
async function deleteRenders(assets: { renders: Record<string, { url?: string | null }> }): Promise<void> {
  const urls = Object.values(assets.renders)
    .map((render) => render.url)
    .filter((url): url is string => typeof url === "string" && url !== "");
  if (urls.length === 0 || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { del } = await import("@vercel/blob");
    await del(urls);
  } catch (err) {
    console.warn("[social] suppression des rendus Blob impossible :", err);
  }
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

  await deleteRenders(post.assets);
  revalidatePath(PATH);
  return {};
}

// ─── Légende modifiable ──────────────────────────────────────────────────────

const captionSchema = z.object({
  postId: z.string().uuid(),
  // Borne large : la normalisation (fins de ligne, caractères de contrôle) précède la coupe à SOCIAL_CAPTION_MAX
  caption: z.string().max(SOCIAL_CAPTION_MAX * 2),
});

/**
 * Refus d'une légende saisie : le vocabulaire interdit par la réglementation
 * (garde-fou éthique) puis les règles sociales (avant/après, promesse
 * chiffrée, majuscules criées…), avec le mot en cause. Null si acceptable.
 */
function captionRefusal(caption: string): string | null {
  const ethical = checkEthicalCompliance(caption);
  if (!ethical.ok) {
    const word = forbiddenWord(caption) ?? ethical.violations[0]?.rule ?? "";
    return `Votre légende contient un terme que la réglementation nous interdit d'employer (« ${word} »). Reformulez, par exemple avec « accompagner » ou « apaiser ».`;
  }
  const social = checkSocialCompliance(caption);
  if (!social.ok) {
    const rule = social.violations[0]?.rule ?? "";
    const word = forbiddenWord(caption, SOCIAL_FORBIDDEN_PATTERNS) ?? rule;
    const detail = rule === "" || rule.toLowerCase() === word.toLowerCase() ? `« ${word} »` : `« ${word} », ${rule}`;
    return `Votre légende contient une formulation que nous n'employons pas sur les réseaux (${detail}). Reformulez-la.`;
  }
  return null;
}

/**
 * « Enregistrer » la légende modifiée d'un contenu (non archivé) : texte
 * normalisé et borné à SOCIAL_CAPTION_MAX, vérifié par les garde-fous AVANT
 * d'être stocké ; seule la clé `caption` du jsonb est réécrite (`jsonb_set`,
 * sous verrou de ligne : les hashtags et le reste du contenu sont intacts).
 */
export async function updateSocialCaption(input: unknown): Promise<{ error?: string; caption?: string }> {
  const session = await requireClient();
  const parsed = captionSchema.safeParse(input);
  if (!parsed.success) return { error: "Légende invalide." };
  const post = await activePost(session.siteId, parsed.data.postId);
  if (!post) return { error: NOT_FOUND };

  const caption = normalizeCaption(parsed.data.caption);
  if (caption === "") return { error: "La légende ne peut pas être vide." };
  const refusal = captionRefusal(caption);
  if (refusal) return { error: refusal };

  try {
    await getDb()
      .update(socialPosts)
      .set({
        content: sql`jsonb_set(${socialPosts.content}, '{caption}', ${JSON.stringify(caption)}::jsonb, true)`,
        updatedAt: new Date(),
      })
      .where(and(eq(socialPosts.id, post.id), eq(socialPosts.siteId, session.siteId), ne(socialPosts.status, "archived")));
  } catch (err) {
    console.error("[social] enregistrement de la légende échoué", { siteId: session.siteId, postId: post.id, err });
    return { error: "L'enregistrement a échoué — réessayez dans un instant." };
  }
  revalidatePath(PATH);
  return { caption };
}

// ─── Régénération d'un contenu avec instructions et ton ──────────────────────

const regenerateSchema = z.object({
  postId: z.string().uuid(),
  instructions: z.string().max(SOCIAL_POST_INSTRUCTIONS_MAX * 2).default(""),
  tone: z.string().refine(isGoogleReplyTone, "Ton inconnu"),
});

/** Régénérations en cours dans ce processus (par contenu) : second clic refusé sans appel IA. */
const regenerationsInFlight = new Set<string>();

/**
 * « Régénérer » un contenu non publié avec des instructions libres et un ton
 * choisi : un appel IA (même sujet, même format, mêmes date et couleur), la
 * légende, les hashtags et le visuel sont remplacés, les anciens rendus
 * supprimés. Quota SOCIAL_REGENERATIONS_PER_MONTH (lignes `google_usage` de
 * kind "social_regen"). Un contenu publié ne se régénère pas.
 */
export async function regenerateSocialPost(input: unknown): Promise<{ error?: string; remaining?: number }> {
  const session = await requireClient();
  const parsed = regenerateSchema.safeParse(input);
  if (!parsed.success) return { error: "Requête invalide." };
  const site = await getSite(session.siteId);
  if (!socialAccess(site)) return { error: NOT_INCLUDED };
  const post = await activePost(session.siteId, parsed.data.postId);
  if (!post) return { error: NOT_FOUND };
  if (post.status === "published") {
    return { error: "Ce contenu est déjà publié : annulez la publication pour le régénérer." };
  }

  const instructions = cleanSocialInstructions(parsed.data.instructions).slice(0, SOCIAL_POST_INSTRUCTIONS_MAX);
  if (instructions !== "") {
    const compliance = checkEthicalCompliance(instructions);
    if (!compliance.ok) {
      const word = forbiddenWord(instructions) ?? compliance.violations[0]?.rule ?? "";
      return {
        error: `Vos instructions contiennent un terme que la réglementation nous interdit d'employer (« ${word} »). Reformulez, par exemple avec « accompagner » ou « apaiser ».`,
      };
    }
  }
  if (regenerationsInFlight.has(post.id)) return { error: "Régénération déjà en cours, patientez." };
  regenerationsInFlight.add(post.id);
  const now = new Date();
  const started = Date.now();
  const db = getDb();
  const generator = createSocialGenerator();
  try {
    const usage = await getSocialRegenerationUsage(site.id, now);
    if (usage.remaining === 0) {
      return { error: `Vous avez utilisé vos ${SOCIAL_REGENERATIONS_PER_MONTH} régénérations du mois.` };
    }
    const settings = await getSocialSettings(site.id);
    const [{ brief, photosById, refsById }, recentTopics] = await Promise.all([
      loadSocialBrief(site.id, { settings }),
      recentTopicsAcrossChannels(site.id, now),
    ]);
    // Les instructions du contenu s'ajoutent aux consignes permanentes (même bloc du prompt) ; le ton choisi remplace celui de la voix
    const merged = cleanSocialInstructions([brief.instructions, instructions].filter((t) => t && t !== "").join("\n"));
    const briefForRegen = {
      ...brief,
      ...(merged === "" ? {} : { instructions: merged }),
      voice: { ...brief.voice, tone: parsed.data.tone },
    };
    const regenerated = await generator.generateRequest(briefForRegen, {
      topic: post.request ?? post.topic,
      format: post.format as SocialFormat,
      accentHex: post.accentColor,
      scheduledFor: post.scheduledFor,
      recentTopics: recentTopics.filter((t) => t !== post.topic),
      photosById,
      refsById,
    });
    await recordSocialRegeneration(site.id, now);
    await db
      .update(socialPosts)
      .set({
        topic: regenerated.topic,
        template: regenerated.template,
        // Les jours de publication de la préparation du mois restent portés par le contenu (état du mois)
        content: post.content.planDays ? { ...regenerated.content, planDays: post.content.planDays } : regenerated.content,
        assets: EMPTY_SOCIAL_ASSETS,
        downloadedAt: null,
        updatedAt: now,
      })
      .where(and(eq(socialPosts.id, post.id), eq(socialPosts.siteId, site.id)));
    await deleteRenders(post.assets);
    console.info("[social] contenu régénéré", {
      siteId: site.id,
      postId: post.id,
      mode: generator.mode,
      tone: parsed.data.tone,
      withInstructions: instructions !== "",
      ms: Date.now() - started,
    });
    revalidatePath(PATH);
    return { remaining: usage.remaining - 1 };
  } catch (err) {
    console.error("[social] régénération échouée", { siteId: site.id, postId: post.id, mode: generator.mode, ms: Date.now() - started, err });
    return { error: "La régénération a échoué — réessayez dans un instant. Votre quota n'a pas été décompté." };
  } finally {
    regenerationsInFlight.delete(post.id);
  }
}
