/**
 * Ticks planifiés — idempotents, l'état vit en base (cahier des charges :
 * cron + Postgres en solution de repli d'Inngest/Trigger.dev ; le passage à
 * une file durable est transparent, chaque tick étant une fonction pure).
 *
 * - publishDueArticles       : publication automatique le jour prévu
 * - ensureEditorialCalendars : complète le calendrier de sujets (horizon 6 sem.)
 * - generateDueArticles      : J-7, rédige les articles (Claude/mock) + image
 * - sendWeeklyContentDigests : lundi (Europe/Paris), e-mail « Vos contenus de
 *                              la semaine » ; rattrapage mardi et mercredi
 * - sendMonthReminders       : le 25 (Europe/Paris), e-mail « Préparez votre
 *                              mois » si le mois suivant est vide ; rattrapage
 *                              jusqu'au 28
 * - syncGoogleData           : statistiques Search Console simulées, pour les
 *                              démos seulement (jamais sur un site client)
 * - syncGoogleReviews        : avis des fiches reliées (Places API, sites
 *                              clients, une fois par semaine ; mock pour les
 *                              démos seulement)
 * - syncGoogleProfiles       : fiche Google (studio) : instantané + audit
 *                              tous les 30 jours, tâche d'avis DataForSEO
 * - collectGoogleReviewTasks : tâches d'avis terminées → avis, audit, analyse IA
 * - runScheduledGoogleScans  : relevés de visibilité planifiés (14 jours)
 * - refreshExternalSitesTick : relit chaque mois le site des clients qui ont
 *                              connecté le leur
 *
 * Sites servis : les clients non archivés, et les démos dont le lien n'a pas
 * expiré quand la démonstration en a besoin (`servedSite`). L'IA ne rédige
 * que pour les clients : le blog d'une démo est celui de sa création, son
 * calendrier (gratuit) reste tenu tant que le lien est valide.
 *
 * Blog et site du client : quand le site du client est la référence des
 * outils (`loadExternalReference`), les sujets du calendrier et la spécialité
 * rattachée à un article viennent de ses spécialités, et non des pages de
 * spécialité du site hébergé (seul un sujet planifié avant la connexion du
 * site garde le titre de sa page hébergée). Les articles restent publiés sur
 * le blog hébergé.
 *
 * Deux passages simultanés (cron et lancement à la main, double livraison)
 * ne produisent ni doublon ni état partiel : chaque écriture se fait dans une
 * transaction courte, sous verrou consultatif de niveau transaction
 * (`pg_advisory_xact_lock` — jamais de verrou de session, la base passe par
 * un pooler), qui relit l'état avant d'écrire. Les appels longs (IA, images,
 * fournisseurs) se font hors transaction.
 *
 * `runTicks` exécute un groupe de tâches (`TICK_GROUPS`, un par entrée du
 * cron) ou toutes (`runAllTicks`, lancement à la main), avec un try/catch par
 * tâche : une tâche en erreur est rapportée (`status: "error"`) sans bloquer
 * les suivantes. Chaque passage a sa propre échéance (TICK_DEADLINE_MS après
 * son début) pour rester sous la durée maximale de la route cron (800 s) ;
 * chaque tâche en reçoit une part (`weight`) et n'entame plus d'élément
 * au-delà. Les notifications sont idempotentes par `notification_log` (site,
 * kind, période) : un cron relancé n'envoie pas deux fois.
 */

import { and, asc, eq, gte, inArray, isNotNull, lt, lte, ne, notLike, or, sql, type SQL } from "drizzle-orm";
import {
  PLANS,
  blogArticles,
  blogSettings,
  editorialCalendarEntries,
  getDb,
  googleConnections,
  googleReviewTasks,
  googleReviews,
  googleUsage,
  hasBlog,
  pages,
  prospects,
  searchQueryStats,
  sites,
  type BlogTheme,
  type Database,
  type PlanId,
  type Site,
} from "@theralys/db";
import {
  createArticleGenerator,
  createImageProvider,
  createStockImageProvider,
  findStockOrGenerate,
  stockQueryFor,
  type BlogVoice,
  type VoicedArticle,
} from "@theralys/ai";
import { externalSpecialties, readingTimeMinutes, slugify, usageMonthKey, type SiteTheme } from "@theralys/shared";
import { addDays, planEditorialTopics, startOfDayUtc, type MotifRef } from "./editorial";
import { loadExternalReference, refreshExternalSites } from "./external-site";
import { generateMockSearchStats } from "./google-mock";
import { createGooglePlacesProvider, type GooglePlacesProvider } from "@theralys/providers/google";
import { createLocalSearchProvider } from "@theralys/providers/dataforseo";
import { generateMockReviews } from "./reviews-mock";
import {
  collectGoogleReviewTasks,
  dateOrNull,
  hasGoogleProfileAccess,
  runScheduledGoogleScans,
  syncGoogleProfiles,
  type DbExecutor,
} from "./google-profile";
import { sendMonthReminders, sendWeeklyContentDigests } from "./notifications";
import { errorLabel, liveDemo, mapPool, pastDeadline, proportionalBatch, servedSite, tickError, tickOk, type TickOptions, type TickReport } from "./tick-utils";
import { withApiUsage } from "@theralys/shared/usage-runtime";

export type { TickOptions, TickReport } from "./tick-utils";

const HORIZON_WEEKS = 6;
/** L'IA rédige chaque article 7 jours avant sa date de publication. */
const WRITE_AHEAD_DAYS = 7;
/**
 * Heure de publication (UTC) inscrite sur un article planifié. La publication
 * se décide au jour (`publishCutoff`) : l'article sort au passage du jour
 * prévu, quelle que soit l'heure de ce passage.
 */
const PUBLISH_HOUR_UTC = 7;
/** Sites dont le calendrier est complété en même temps (lectures et écritures en base seulement). */
const CALENDAR_CONCURRENCY = 4;
const DAY_MS = 86_400_000;

/** Rédactions simultanées d'un passage (appels IA et images en vol). */
export const ARTICLE_CONCURRENCY = 5;
/** Sujets lus au plus par passage ; l'échéance du passage arrête bien avant. */
export const ARTICLE_QUEUE_MAX = 500;
/**
 * Retard (jours après la date prévue) au-delà duquel un sujet jamais rédigé
 * est abandonné : une rédaction qui échoue à chaque passage ne reste pas
 * indéfiniment en tête de la file.
 */
export const ARTICLE_MAX_LATE_DAYS = 14;
/** Échecs d'affilée, sans aucune réussite entre eux, au-delà desquels le passage s'arrête (fournisseur en panne, clé refusée). */
export const ARTICLE_FAILURE_BREAKER = 8;
/**
 * Temps laissé à une rédaction entamée (ms) : aucun sujet n'est commencé à
 * moins de cette durée de l'échéance. Une rédaction coupée par la fin de la
 * fonction serait facturée pour rien.
 */
export const ARTICLE_START_MARGIN_MS = 120_000;
/** Intervalle entre deux synchronisations Places des avis d'un site (jours). */
export const REVIEWS_SYNC_INTERVAL_DAYS = 7;
/** Sites dont les avis sont synchronisés au moins par passage (petit parc ; au-delà, le lot suit le parc). */
export const REVIEWS_SYNC_MIN_BATCH = 25;
/** `google_usage.kind` d'une synchronisation Places des avis (coût 0 : repère de fraîcheur, hors budget). */
export const REVIEWS_SYNC_KIND = "places_reviews";

/**
 * Durée allouée aux ticks d'un passage (ms) : 660 s, sous les 800 s de la
 * route cron, marge pour l'élément en cours. Chaque entrée du cron a la
 * sienne.
 */
export const TICK_DEADLINE_MS = 660_000;

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

// ─── Périmètre du blog ───────────────────────────────────────────────────────

/** Formules qui comprennent le blog (pour filtrer en SQL). */
const BLOG_PLANS = (Object.keys(PLANS) as PlanId[]).filter((plan) => hasBlog(plan));

/**
 * Sites dont l'IA rédige le blog : les clients non archivés dont la formule
 * comprend le blog. Jamais une démo : son blog est généré à sa création, le
 * nourrir chaque semaine coûterait quatre articles par démo sans rien
 * changer à ce qu'elle montre.
 */
function writtenBlog(): SQL {
  return and(eq(sites.type, "client"), ne(sites.status, "archived"), inArray(sites.plan, BLOG_PLANS))!;
}

/**
 * Sites dont le calendrier de sujets est tenu : les mêmes, plus les démos
 * dont le lien est encore valide (planifier ne coûte rien, et l'écran
 * Publications d'une démo montre ainsi les sujets à venir).
 */
function plannedBlog(now: Date): SQL {
  return and(servedSite(now), inArray(sites.plan, BLOG_PLANS))!;
}

// ─── Calendrier éditorial ────────────────────────────────────────────────────

type CalendarSite = { site: Site; themes: BlogTheme[] | null; city: string | null };

/** Sujet suffixé d'une date par l'ancien planificateur (expression régulière PostgreSQL). */
const LEGACY_DATED_TOPIC = " \\(\\d{4}-\\d{2}-\\d{2}\\)$";

/**
 * Spécialités dont le blog d'un site tire ses sujets : celles du site du
 * client quand il est la référence des outils — le blog parle alors de ce
 * que le praticien présente sur son propre site —, sinon les pages de
 * spécialité du site hébergé, dans leur ordre d'affichage.
 */
async function editorialMotifs(db: Database, site: Site): Promise<MotifRef[]> {
  const reference = await loadExternalReference(db, site);
  if (reference) return externalSpecialties(reference.profile);
  const motifs = await db.query.pages.findMany({
    where: and(eq(pages.siteId, site.id), eq(pages.type, "motif")),
    orderBy: (p, { asc: ascending }) => [ascending(p.position)],
    columns: { slug: true, title: true },
  });
  return motifs.map((m) => ({ slug: m.slug, title: m.title }));
}

/**
 * Complète le calendrier d'un site. Les lectures qui décident des sujets
 * (dates et sujets déjà pris) et leur inscription se font dans une même
 * transaction, sous verrou consultatif du site : deux passages simultanés ne
 * planifient jamais deux sujets le même jour — le second attend, relit les
 * dates sous verrou et n'ajoute que ce qui manque encore.
 */
async function planSiteCalendar(db: Database, row: CalendarSite, now: Date): Promise<number> {
  const { site } = row;
  const motifs = await editorialMotifs(db, site);
  const themes = row.themes ?? undefined;
  if (motifs.length === 0 && !(themes ?? []).some((theme) => theme.label.trim().length > 0 && theme.perMonth > 0)) return 0;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${site.id}:editorial-calendar`}))`);
    // Héritage de l'ancien planificateur : une fois ses douze sujets épuisés, il répétait les mêmes en les
    // suffixant d'une date (« … (2026-12-15) »). Ceux qui ne sont pas encore rédigés sont retirés ici, et
    // remplacés dans la même transaction par de vrais sujets aux mêmes dates.
    await tx
      .delete(editorialCalendarEntries)
      .where(
        and(
          eq(editorialCalendarEntries.siteId, site.id),
          eq(editorialCalendarEntries.status, "planned"),
          gte(editorialCalendarEntries.scheduledFor, addDays(startOfDayUtc(now), 1).toISOString().slice(0, 10)),
          sql`${editorialCalendarEntries.topic} ~ ${LEGACY_DATED_TOPIC}`,
        ),
      );
    const existing = await tx
      .select({ scheduledFor: editorialCalendarEntries.scheduledFor, topic: editorialCalendarEntries.topic })
      .from(editorialCalendarEntries)
      .where(eq(editorialCalendarEntries.siteId, site.id));
    const articles = await tx.select({ title: blogArticles.title }).from(blogArticles).where(eq(blogArticles.siteId, site.id));

    const topics = planEditorialTopics({
      motifs,
      themes,
      city: row.city ?? "votre ville",
      plan: site.plan,
      from: addDays(startOfDayUtc(now), 1),
      horizonWeeks: HORIZON_WEEKS,
      existingDates: new Set(existing.map((e) => e.scheduledFor)),
      existingTopics: new Set([...existing.map((e) => e.topic), ...articles.map((a) => a.title)]),
    });
    if (topics.length === 0) return 0;
    await tx.insert(editorialCalendarEntries).values(
      topics.map((t) => ({
        siteId: site.id,
        scheduledFor: t.scheduledFor,
        topic: t.topic,
        motifSlug: t.motifSlug,
      })),
    );
    return topics.length;
  });
}

/** Calendrier des sites au blog actif (`plannedBlog`), ou d'un seul d'entre eux. Un site en erreur n'arrête pas les autres. */
async function planCalendars(db: Database, now: Date, opts: TickOptions, siteId?: string): Promise<TickReport> {
  const task = "editorial-calendar";
  const rows: CalendarSite[] = await db
    .select({ site: sites, themes: blogSettings.themes, city: prospects.city })
    .from(sites)
    .innerJoin(blogSettings, eq(blogSettings.siteId, sites.id))
    .leftJoin(prospects, eq(prospects.id, sites.prospectId))
    .where(and(plannedBlog(now), siteId ? eq(sites.id, siteId) : undefined))
    .orderBy(asc(sites.createdAt));

  let processed = 0;
  let failed = 0;
  let lastError = "";
  await mapPool(rows, CALENDAR_CONCURRENCY, async (row) => {
    if (pastDeadline(opts)) return;
    try {
      // Résultat attendu avant d'être ajouté : plusieurs sites sont en vol, un « += await » perdrait leurs additions
      const added = await planSiteCalendar(db, row, now);
      processed += added;
    } catch (err) {
      failed += 1;
      lastError = errorLabel(err);
      console.error(`[calendrier] site ${row.site.id} : calendrier non complété (${lastError})`);
    }
  });
  // Aucun site planifié alors que tous ont échoué : la tâche est en erreur, pas « rien à faire »
  if (failed > 0 && failed === rows.length) return tickError(task, lastError, processed, failed);
  return tickOk(task, processed, failed);
}

/** Complète le calendrier de sujets (horizon 6 semaines) de tous les sites au blog actif. */
export async function ensureEditorialCalendars(now = new Date(), opts: TickOptions = {}): Promise<TickReport> {
  return planCalendars(getDb(), now, opts);
}

/**
 * Variante limitée à un site (action d'un praticien dans le studio) : même
 * logique, même verrou, mêmes règles d'accès que `ensureEditorialCalendars`
 * — un site archivé, une démo expirée ou une formule sans blog ne reçoivent
 * rien (`processed: 0`).
 */
export async function ensureEditorialCalendarForSite(siteId: string, now = new Date()): Promise<TickReport> {
  return planCalendars(getDb(), now, {}, siteId);
}

// ─── Rédaction des articles ──────────────────────────────────────────────────

/** Sujet à rédiger, avec ce que la rédaction lit de son site (une seule requête pour toute la file). */
type DueEntry = {
  id: string;
  siteId: string;
  scheduledFor: string;
  topic: string;
  motifSlug: string | null;
  theme: SiteTheme;
  publicationMode: "auto" | "manual";
  voice: BlogVoice;
  profession: string | null;
  city: string | null;
  firstName: string | null;
};

type ArticleImage = { url: string; aiGenerated: boolean } | null;

/** Mélange les sujets d'une même date (Fisher-Yates) ; les dates restent dans l'ordre. */
function shuffleWithinDates(entries: DueEntry[], random: () => number): DueEntry[] {
  const result: DueEntry[] = [];
  for (let start = 0; start < entries.length; ) {
    let end = start;
    while (end < entries.length && entries[end]!.scheduledFor === entries[start]!.scheduledFor) end++;
    const group = entries.slice(start, end);
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [group[i], group[j]] = [group[j]!, group[i]!];
    }
    result.push(...group);
    start = end;
  }
  return result;
}

/** Ancien format des sujets répétés (« … (2026-12-15) ») : la date n'est jamais envoyée à l'IA. */
function cleanTopic(topic: string): string {
  return topic.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, "");
}

/**
 * Sujets qui ne seront pas rédigés, passés en « skipped » : ceux dont la date
 * est passée sur un site dont le blog n'est pas (ou plus) rédigé — démo,
 * client archivé, formule sans blog — et ceux en retard de plus de
 * ARTICLE_MAX_LATE_DAYS jours malgré un passage quotidien. Ils quittent la
 * file et le calendrier du studio, et ne comptent plus comme « en retard »
 * dans l'admin. Rend le nombre de sujets retirés.
 */
async function retireUnwrittenTopics(db: Database, now: Date): Promise<number> {
  const today = startOfDayUtc(now);
  const retired = await db
    .update(editorialCalendarEntries)
    .set({ status: "skipped" })
    .where(
      and(
        eq(editorialCalendarEntries.status, "planned"),
        or(
          lt(editorialCalendarEntries.scheduledFor, isoDay(addDays(today, -ARTICLE_MAX_LATE_DAYS))),
          and(
            lt(editorialCalendarEntries.scheduledFor, isoDay(today)),
            sql`${editorialCalendarEntries.siteId} not in (select ${sites.id} from ${sites} where ${writtenBlog()})`,
          ),
        ),
      ),
    )
    .returning({ id: editorialCalendarEntries.id });
  return retired.length;
}

async function availableArticleSlug(db: DbExecutor, siteId: string, base: string): Promise<string> {
  const rows = await db.select({ slug: blogArticles.slug }).from(blogArticles).where(eq(blogArticles.siteId, siteId));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  }
}

/**
 * Inscrit l'article et marque le sujet rédigé, ensemble, dans une transaction
 * courte : verrou consultatif du sujet (`pg_try_advisory_xact_lock` : si un
 * autre passage est en train d'écrire ce sujet, on lui laisse la place),
 * relecture du sujet sous verrou (déjà rédigé, ou retiré entre-temps : rien
 * n'est écrit), puis verrou du blog du site le temps de choisir une adresse
 * libre. Rend `false` quand rien n'a été écrit — l'article rédigé pour rien
 * est abandonné, jamais publié en double.
 */
async function saveArticle(db: Database, entry: DueEntry, article: VoicedArticle, image: ArticleImage): Promise<boolean> {
  const publishAt = new Date(`${entry.scheduledFor}T00:00:00Z`);
  publishAt.setUTCHours(PUBLISH_HOUR_UTC);
  const baseSlug = article.slug || slugify(article.title);

  return db.transaction(async (tx) => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${`editorial-entry:${entry.id}`})) as locked`);
    if (lock.rows[0]?.locked !== true) return false;
    const [current] = await tx
      .select({ status: editorialCalendarEntries.status })
      .from(editorialCalendarEntries)
      .where(eq(editorialCalendarEntries.id, entry.id))
      .for("update");
    if (current?.status !== "planned") return false;

    // Deux articles du même site écrits en même temps ne prennent pas la même adresse
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${entry.siteId}:blog-slug`}))`);
    const slug = await availableArticleSlug(tx, entry.siteId, baseSlug);
    const [inserted] = await tx
      .insert(blogArticles)
      .values({
        siteId: entry.siteId,
        title: article.title,
        slug,
        excerpt: article.excerpt,
        content: article.content,
        imageUrl: image?.url ?? null,
        imageAiGenerated: image?.aiGenerated ?? false,
        // Publication automatique → planifié ; manuelle → brouillon à valider
        status: entry.publicationMode === "manual" ? "draft" : "scheduled",
        aiGenerated: true,
        motifSlug: entry.motifSlug,
        publishAt,
        readingTimeMin: readingTimeMinutes(article.content),
      })
      .returning({ id: blogArticles.id });
    await tx
      .update(editorialCalendarEntries)
      .set({ status: "generated", articleId: inserted!.id })
      .where(eq(editorialCalendarEntries.id, entry.id));
    return true;
  });
}

/** Options de la rédaction : celles d'un tick, plus deux réglages injectables (tests). */
export type ArticleTickOptions = TickOptions & {
  /** Rédactions simultanées (défaut : ARTICLE_CONCURRENCY) */
  concurrency?: number;
  /** Source d'aléa du mélange des sujets d'une même date (défaut : Math.random) */
  random?: () => number;
};

/**
 * Rédige les sujets dus (J-7) des sites de `scope`.
 *
 * File : une seule requête, les plus urgents d'abord (date prévue croissante),
 * dans un ordre tiré au sort entre sujets de la même date — deux passages
 * lancés en même temps ne suivent pas la même file au même pas, et aucun site
 * n'est toujours servi le dernier. `concurrency` rédactions en vol ; l'échéance
 * est relue avant chaque sujet, et aucun n'est entamé à moins de
 * ARTICLE_START_MARGIN_MS d'elle.
 *
 * Un sujet en échec n'arrête rien : il est journalisé (site et type d'erreur,
 * jamais le contenu) et reste « planned » pour un passage suivant ; les autres
 * sujets de son site attendent eux aussi le passage suivant, pour qu'un site
 * qui échoue à chaque fois n'occupe pas tout le passage. Chaque sujet n'est
 * tenté qu'une fois par passage. Après ARTICLE_FAILURE_BREAKER échecs
 * d'affilée, le passage s'arrête : le fournisseur est en panne, inutile
 * d'épuiser le temps et les relances facturées.
 *
 * Doublons : l'appel à l'IA dure plus qu'une transaction ne doit rester
 * ouverte, il se fait donc hors transaction. Le sujet est relu juste avant
 * (déjà rédigé par un autre passage : on passe), puis l'écriture se fait sous
 * verrou (`saveArticle`), qui relit encore. Deux passages simultanés peuvent
 * donc, au pire, rédiger le même sujet deux fois — le second texte est jeté —
 * mais jamais l'inscrire deux fois.
 */
async function writeDueArticles(db: Database, now: Date, opts: ArticleTickOptions, scope: SQL): Promise<TickReport> {
  const task = "generate-articles";
  const today = startOfDayUtc(now);
  const rows = await db
    .select({
      id: editorialCalendarEntries.id,
      siteId: editorialCalendarEntries.siteId,
      scheduledFor: editorialCalendarEntries.scheduledFor,
      topic: editorialCalendarEntries.topic,
      motifSlug: editorialCalendarEntries.motifSlug,
      theme: sites.theme,
      publicationMode: blogSettings.publicationMode,
      designation: blogSettings.voiceDesignation,
      accord: blogSettings.voiceAccord,
      reader: blogSettings.voiceReader,
      tone: blogSettings.voiceTone,
      profession: prospects.profession,
      city: prospects.city,
      firstName: prospects.firstName,
    })
    .from(editorialCalendarEntries)
    .innerJoin(sites, eq(sites.id, editorialCalendarEntries.siteId))
    .innerJoin(blogSettings, eq(blogSettings.siteId, sites.id))
    .leftJoin(prospects, eq(prospects.id, sites.prospectId))
    .where(
      and(
        eq(editorialCalendarEntries.status, "planned"),
        lte(editorialCalendarEntries.scheduledFor, isoDay(addDays(today, WRITE_AHEAD_DAYS))),
        gte(editorialCalendarEntries.scheduledFor, isoDay(addDays(today, -ARTICLE_MAX_LATE_DAYS))),
        scope,
      ),
    )
    .orderBy(asc(editorialCalendarEntries.scheduledFor), asc(editorialCalendarEntries.createdAt), asc(editorialCalendarEntries.id))
    .limit(ARTICLE_QUEUE_MAX);
  if (rows.length === 0) return tickOk(task, 0);

  const queue = shuffleWithinDates(
    rows.map(({ designation, accord, reader, tone, ...entry }): DueEntry => ({ ...entry, voice: { designation, accord, reader, tone } })),
    opts.random ?? Math.random,
  );
  const generator = createArticleGenerator();
  const imageProvider = createImageProvider();
  const stock = createStockImageProvider();

  // Site du client en référence : la spécialité rattachée à un article est l'une des siennes (une lecture par site, à la demande)
  const references = new Map<string, Promise<MotifRef[] | null>>();
  const externalMotifsOf = (entry: DueEntry): Promise<MotifRef[] | null> => {
    let pending = references.get(entry.siteId);
    if (!pending) {
      pending = loadExternalReference(db, { id: entry.siteId, theme: entry.theme }).then((reference) => (reference ? externalSpecialties(reference.profile) : null));
      references.set(entry.siteId, pending);
    }
    return pending;
  };

  const write = async (entry: DueEntry): Promise<boolean> => {
    // Encore à rédiger ? Un autre passage a pu l'écrire, ou le praticien le retirer, depuis la lecture de la file
    const [fresh] = await db
      .select({ status: editorialCalendarEntries.status })
      .from(editorialCalendarEntries)
      .where(eq(editorialCalendarEntries.id, entry.id))
      .limit(1);
    if (fresh?.status !== "planned") return false;

    const externalMotif = entry.motifSlug ? (await externalMotifsOf(entry))?.find((m) => m.slug === entry.motifSlug) : undefined;
    // À défaut — et toujours sans site du client — la page de spécialité du site hébergé (sujet planifié avant la connexion du site)
    const motifPage =
      entry.motifSlug && !externalMotif
        ? await db.query.pages.findFirst({
            where: and(eq(pages.siteId, entry.siteId), eq(pages.type, "motif"), eq(pages.slug, entry.motifSlug)),
            columns: { title: true },
          })
        : null;

    // Registre des appels API : rédaction et image rattachées au blog de ce site
    const usage = { feature: "blog", siteId: entry.siteId } as const;
    const topic = cleanTopic(entry.topic);
    const article = await withApiUsage(usage, () =>
      generator.generateArticle(
        {
          topic,
          motifSlug: entry.motifSlug,
          motifTitle: externalMotif?.title ?? motifPage?.title ?? null,
          profession: entry.profession ?? "praticien bien-être",
          city: entry.city ?? "votre ville",
          firstName: entry.firstName ?? "votre praticien",
        },
        entry.voice,
      ),
    );

    // Photo de banque d'images adaptée au sujet ; repli IA si indisponible
    const image = await withApiUsage(usage, () =>
      findStockOrGenerate(stock, imageProvider, {
        query: article.imageQuery ?? stockQueryFor(topic, entry.profession ?? undefined),
        subject: article.title,
        seed: article.slug || article.title,
        width: 1024,
        height: 576,
      }),
    );

    return saveArticle(db, entry, article, image);
  };

  let processed = 0;
  let failed = 0;
  let streak = 0;
  let stopped = false;
  let lastError = "";
  const failedSites = new Set<string>();
  // Dernier instant où une rédaction peut encore commencer et finir avant la fin de la fonction
  const lastStart: TickOptions = opts.deadline ? { deadline: new Date(opts.deadline.getTime() - ARTICLE_START_MARGIN_MS) } : {};
  await mapPool(queue, opts.concurrency ?? ARTICLE_CONCURRENCY, async (entry) => {
    if (stopped || pastDeadline(lastStart) || failedSites.has(entry.siteId)) return;
    try {
      if (await write(entry)) processed += 1;
      streak = 0;
    } catch (err) {
      failed += 1;
      streak += 1;
      lastError = errorLabel(err);
      failedSites.add(entry.siteId);
      console.error(`[articles] site ${entry.siteId} : rédaction en échec (${lastError})`);
      if (streak >= ARTICLE_FAILURE_BREAKER && !stopped) {
        stopped = true;
        console.error(`[articles] ${streak} échecs d'affilée : passage arrêté, les sujets restants attendent le suivant`);
      }
    }
  });

  // Rien d'écrit et des échecs : la tâche est en erreur (la route cron répond 500), pas « rien à faire »
  if (failed > 0 && (stopped || processed === 0)) return tickError(task, lastError, processed, failed);
  return tickOk(task, processed, failed);
}

/**
 * J-7 : rédige les articles dus des sites clients (`writtenBlog`), après avoir
 * retiré de la file les sujets qui ne seront jamais rédigés
 * (`retireUnwrittenTopics`).
 */
export async function generateDueArticles(now = new Date(), opts: ArticleTickOptions = {}): Promise<TickReport> {
  const db = getDb();
  const retired = await retireUnwrittenTopics(db, now);
  if (retired > 0) console.warn(`[articles] ${retired} sujet(s) retiré(s) du calendrier (blog non rédigé, ou retard de plus de ${ARTICLE_MAX_LATE_DAYS} jours)`);
  return writeDueArticles(db, now, opts, writtenBlog());
}

/**
 * Variante limitée à un site, à la demande (seed de développement, reprise
 * par l'agence) : même file, mêmes verrous, mais pour ce site quel que soit
 * son type — une démo aussi, ce que le cron ne fait jamais. Un site archivé
 * ne reçoit rien. N'est pas branchée sur le cron.
 */
export async function generateDueArticlesForSite(siteId: string, now = new Date(), opts: ArticleTickOptions = {}): Promise<TickReport> {
  return writeDueArticles(getDb(), now, opts, and(eq(sites.id, siteId), ne(sites.status, "archived"), inArray(sites.plan, BLOG_PLANS))!);
}

// ─── Publication ─────────────────────────────────────────────────────────────

/**
 * Borne (exclue) des articles à publier : la fin du jour UTC de `now`. Un
 * article planifié pour le jour J (07:00 UTC) sort au passage du jour J,
 * même si ce passage a lieu avant 7 h — et non le lendemain, comme lorsque
 * la comparaison se faisait à l'instant près avec un cron à 6 h.
 */
export function publishCutoff(now: Date): Date {
  return addDays(startOfDayUtc(now), 1);
}

/** Publie les articles planifiés dont le jour est arrivé (un UPDATE … RETURNING : aucun texte d'article n'est chargé). */
export async function publishDueArticles(now = new Date()): Promise<TickReport> {
  const db = getDb();
  const published = await db
    .update(blogArticles)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(and(eq(blogArticles.status, "scheduled"), lt(blogArticles.publishAt, publishCutoff(now))))
    .returning({ id: blogArticles.id });
  return tickOk("publish-articles", published.length);
}

// ─── Search Console ──────────────────────────────────────────────────────────

/**
 * Statistiques Search Console simulées (l'OAuth Google réel n'est pas
 * branché) : pour les démos connectées dont le lien est valide, et elles
 * seules. Sur un site client, rien de simulé n'est écrit et rien n'est
 * supprimé — la vraie synchronisation se branchera ici. Les 90 jours d'une
 * démo sont remplacés dans une transaction, sous verrou du site : jamais de
 * statistiques à moitié réécrites, ni deux réécritures croisées.
 */
async function syncSearchStats(db: Database, now: Date, opts: TickOptions, siteId?: string): Promise<TickReport> {
  const task = "sync-google";
  const rows = await db
    .select({ siteId: sites.id, profession: prospects.profession, city: prospects.city })
    .from(googleConnections)
    .innerJoin(sites, eq(sites.id, googleConnections.siteId))
    .leftJoin(prospects, eq(prospects.id, sites.prospectId))
    .where(and(eq(googleConnections.status, "connected"), ne(sites.status, "archived"), liveDemo(now), siteId ? eq(sites.id, siteId) : undefined));

  let processed = 0;
  let failed = 0;
  let lastError = "";
  for (const row of rows) {
    if (pastDeadline(opts)) break;
    try {
      // Données décalées de 2-3 jours, comme la vraie Search Console
      const stats = generateMockSearchStats({
        siteId: row.siteId,
        profession: row.profession ?? "praticien",
        city: row.city ?? "",
        days: 90,
        until: addDays(startOfDayUtc(now), -3),
      });
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${row.siteId}:search-stats`}))`);
        await tx.delete(searchQueryStats).where(eq(searchQueryStats.siteId, row.siteId));
        for (let i = 0; i < stats.length; i += 500) {
          await tx.insert(searchQueryStats).values(stats.slice(i, i + 500));
        }
      });
      processed += stats.length;
    } catch (err) {
      failed += 1;
      lastError = errorLabel(err);
      console.error(`[sync-google] site ${row.siteId} : statistiques non mises à jour (${lastError})`);
    }
  }
  if (failed > 0 && failed === rows.length) return tickError(task, lastError, processed, failed);
  return tickOk(task, processed, failed);
}

/** Rafraîchit les statistiques Search Console simulées des démos connectées (jamais d'un site client). */
export async function syncGoogleData(now = new Date(), opts: TickOptions = {}): Promise<TickReport> {
  return syncSearchStats(getDb(), now, opts);
}

/**
 * Variante limitée à un site (connexion Google depuis le studio) : même
 * logique, même verrou. Pour un site client, rien n'est écrit (`processed: 0`).
 */
export async function syncGoogleDataForSite(siteId: string, now = new Date()): Promise<TickReport> {
  return syncSearchStats(getDb(), now, {}, siteId);
}

// ─── Avis Google ─────────────────────────────────────────────────────────────

/** Sites dont les avis sont dus : jamais synchronisés d'abord, puis les plus anciens ; au plus `batch`. */
export function selectDueReviewSyncs<T extends { syncedAt: Date | null }>(rows: readonly T[], now: Date, batch: number): T[] {
  const dueBefore = now.getTime() - REVIEWS_SYNC_INTERVAL_DAYS * DAY_MS;
  return rows
    .filter((row) => row.syncedAt === null || row.syncedAt.getTime() <= dueBefore)
    .sort((a, b) => (a.syncedAt?.getTime() ?? -Infinity) - (b.syncedAt?.getTime() ?? -Infinity))
    .slice(0, Math.max(0, batch));
}

/**
 * Avis des sites clients par Places API (New) : les 5 avis les plus
 * pertinents, upsert par sourceReviewId (jamais de doublon ni de suppression
 * globale), note et nombre d'avis du prospect mis à jour.
 *
 * Fraîcheur : un site n'est rappelé que REVIEWS_SYNC_INTERVAL_DAYS jours
 * après sa dernière synchronisation — la plus récente de la ligne
 * `google_usage` inscrite à chaque tentative (REVIEWS_SYNC_KIND, coût 0) et
 * de `google_reviews.synced_at` (avis déjà reçus de Places). Une tentative en
 * échec compte : une fiche introuvable n'est pas rappelée chaque jour. Lot
 * proportionnel au parc (`proportionalBatch`), borné par l'échéance.
 */
async function syncPlacesReviews(db: Database, places: GooglePlacesProvider, viaTasks: boolean, now: Date, opts: TickOptions): Promise<TickReport> {
  const task = "sync-google-reviews";
  const attempts = db
    .select({ siteId: googleUsage.siteId, last: sql<string | Date | null>`max(${googleUsage.createdAt})`.as("last_attempt") })
    .from(googleUsage)
    .where(eq(googleUsage.kind, REVIEWS_SYNC_KIND))
    .groupBy(googleUsage.siteId)
    .as("attempts");
  const received = db
    .select({ siteId: googleReviews.siteId, last: sql<string | Date | null>`max(${googleReviews.syncedAt})`.as("last_received") })
    .from(googleReviews)
    .where(eq(googleReviews.source, "places"))
    .groupBy(googleReviews.siteId)
    .as("received");
  const rows = await db
    .select({
      siteId: sites.id,
      type: sites.type,
      plan: sites.plan,
      prospectId: prospects.id,
      placeId: prospects.googlePlaceId,
      attemptAt: attempts.last,
      receivedAt: received.last,
    })
    .from(sites)
    .innerJoin(prospects, eq(prospects.id, sites.prospectId))
    .leftJoin(attempts, eq(attempts.siteId, sites.id))
    .leftJoin(received, eq(received.siteId, sites.id))
    .where(
      and(
        isNotNull(prospects.googlePlaceId),
        // Fiche factice (démo créée sans clé Places, devenue cliente) : jamais envoyée à l'API
        notLike(prospects.googlePlaceId, "mock-%"),
        // Les démos gardent les avis de leur création : seuls les clients non archivés sont rafraîchis
        eq(sites.type, "client"),
        ne(sites.status, "archived"),
      ),
    );
  // Fiche Google (studio) + DataForSEO réel : avis complets via les tâches (`collectGoogleReviewTasks`), pas Places
  const eligible = rows
    .filter((row) => !(viaTasks && hasGoogleProfileAccess(row)))
    .map((row) => {
      const times = [dateOrNull(row.attemptAt), dateOrNull(row.receivedAt)].filter((date): date is Date => date !== null).map((date) => date.getTime());
      return { ...row, syncedAt: times.length > 0 ? new Date(Math.max(...times)) : null };
    });
  const due = selectDueReviewSyncs(eligible, now, proportionalBatch(eligible.length, REVIEWS_SYNC_INTERVAL_DAYS, REVIEWS_SYNC_MIN_BATCH));

  let processed = 0;
  let failed = 0;
  let lastError = "";
  for (const row of due) {
    if (pastDeadline(opts)) break;
    const placeId = row.placeId;
    if (!placeId) continue;
    try {
      const details = await withApiUsage({ feature: "google_profile", siteId: row.siteId }, () => places.fetchDetails(placeId));
      // Sous verrou du site : deux passages simultanés n'insèrent pas deux fois le même avis (le second relit les avis connus et les met à jour)
      const upserted = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${row.siteId}:google-reviews`}))`);
        return upsertPlacesReviews(tx, row.siteId, details.reviews, now);
      });
      processed += upserted;
      if (details.rating !== null) {
        await db
          .update(prospects)
          .set({
            googleRating: details.rating,
            googleReviewCount: details.reviewCount,
            ...(details.photoUrl ? { googlePhotoUrl: details.photoUrl } : {}),
          })
          .where(eq(prospects.id, row.prospectId));
      }
    } catch (err) {
      failed += 1;
      lastError = errorLabel(err);
      console.warn(`[sync-reviews] site ${row.siteId} : fiche Google indisponible (${lastError})`);
    }
    // Repère de fraîcheur, réussite ou échec, daté de l'instant du passage : le site n'est repris que dans REVIEWS_SYNC_INTERVAL_DAYS jours
    await db
      .insert(googleUsage)
      .values({ siteId: row.siteId, month: usageMonthKey(now), kind: REVIEWS_SYNC_KIND, costUsd: 0, requests: 0, createdAt: now })
      .catch((err: unknown) => {
        console.warn(`[sync-reviews] site ${row.siteId} : synchronisation non inscrite (${errorLabel(err)})`);
      });
  }
  if (failed > 0 && failed === due.length) return tickError(task, lastError, processed, failed);
  return tickOk(task, processed, failed);
}

/**
 * Sans fournisseur réel : avis factices pour les démos en cours uniquement
 * (jamais sur un site client), et seulement tant qu'aucune tâche d'avis
 * (mock) de la fiche Google n'a abouti.
 */
async function seedDemoReviews(db: Database, now: Date, opts: TickOptions): Promise<TickReport> {
  const rows = await db
    .select({ siteId: sites.id, firstName: prospects.firstName, city: prospects.city })
    .from(sites)
    .innerJoin(prospects, eq(prospects.id, sites.prospectId))
    .where(and(isNotNull(prospects.googlePlaceId), ne(sites.status, "archived"), liveDemo(now)));
  let processed = 0;

  for (const row of rows) {
    if (pastDeadline(opts)) break;
    const fed = await db.query.googleReviewTasks.findFirst({
      where: and(eq(googleReviewTasks.siteId, row.siteId), eq(googleReviewTasks.status, "done")),
      columns: { id: true },
    });
    if (fed) continue;
    const incoming = generateMockReviews({ siteId: row.siteId, firstName: row.firstName, city: row.city, now });
    const existing = await db.query.googleReviews.findMany({
      where: eq(googleReviews.siteId, row.siteId),
      columns: { sourceReviewId: true },
    });
    const known = new Set(existing.map((r) => r.sourceReviewId).filter(Boolean));
    const fresh = incoming.filter((r) => !known.has(r.sourceReviewId));
    if (fresh.length > 0) {
      await db.insert(googleReviews).values(
        fresh.map((r) => ({
          siteId: row.siteId,
          sourceReviewId: r.sourceReviewId,
          authorName: r.authorName,
          authorPhotoUrl: r.authorPhotoUrl,
          rating: r.rating,
          text: r.text,
          reviewedAt: r.reviewedAt,
          source: "mock",
          syncedAt: now,
        })),
      );
      processed += fresh.length;
    }
  }
  return tickOk("sync-google-reviews", processed);
}

/**
 * Synchronisation des avis Google (toutes formules) des sites dont la fiche
 * est reliée (`prospects.googlePlaceId`). Avec une clé Places : les sites
 * clients non archivés, une fois par semaine (`syncPlacesReviews`) ; les
 * sites éligibles à la section Fiche Google sont ignorés quand DataForSEO est
 * configuré, leurs avis arrivent par les tâches (`collectGoogleReviewTasks`).
 * Sans aucun fournisseur réel : avis factices des démos en cours seulement
 * (`seedDemoReviews`).
 */
export async function syncGoogleReviews(now = new Date(), opts: TickOptions = {}): Promise<TickReport> {
  const db = getDb();
  const places = createGooglePlacesProvider();
  if (places.mode === "google") return syncPlacesReviews(db, places, createLocalSearchProvider().mode === "dataforseo", now, opts);
  return seedDemoReviews(db, now, opts);
}

/** Avis Places → google_reviews : mise à jour des avis connus (par sourceReviewId), insertion des nouveaux. Renvoie le nombre d'avis traités. */
async function upsertPlacesReviews(
  db: DbExecutor,
  siteId: string,
  reviews: { sourceReviewId: string | null; authorName: string; authorPhotoUrl: string | null; rating: number; text: string; reviewedAt: Date | null }[],
  now: Date,
): Promise<number> {
  const withId = reviews.filter((r): r is typeof r & { sourceReviewId: string } => r.sourceReviewId !== null);
  if (withId.length === 0) return 0;
  const existing = await db.query.googleReviews.findMany({
    where: and(
      eq(googleReviews.siteId, siteId),
      inArray(
        googleReviews.sourceReviewId,
        withId.map((r) => r.sourceReviewId),
      ),
    ),
    columns: { id: true, sourceReviewId: true },
  });
  const known = new Map(existing.map((r) => [r.sourceReviewId, r.id]));
  const fresh: (typeof googleReviews.$inferInsert)[] = [];
  for (const r of withId) {
    const values = {
      authorName: r.authorName,
      authorPhotoUrl: r.authorPhotoUrl,
      rating: r.rating,
      text: r.text,
      reviewedAt: r.reviewedAt,
      source: "places",
      syncedAt: now,
    };
    const id = known.get(r.sourceReviewId);
    if (id) await db.update(googleReviews).set(values).where(eq(googleReviews.id, id));
    else fresh.push({ siteId, sourceReviewId: r.sourceReviewId, ...values });
  }
  if (fresh.length > 0) await db.insert(googleReviews).values(fresh);
  return withId.length;
}

// ─── Site des clients ────────────────────────────────────────────────────────

/**
 * Relecture mensuelle des sites des clients (`refreshExternalSites`) : un
 * site connecté change sans prévenir, les outils doivent s'appuyer sur ce
 * qu'il dit aujourd'hui. Elle respecte l'échéance de son passage : passé
 * celle-ci (ou trop près d'elle pour une lecture complète), aucun site n'est
 * entamé — il le sera au passage suivant. `processed` : sites relus, que
 * leur contenu ait changé ou non ; `failed` : relectures en échec.
 */
export async function refreshExternalSitesTick(now = new Date(), opts: TickOptions = {}): Promise<TickReport> {
  const report = await refreshExternalSites(getDb(), { now, ...(opts.deadline ? { deadline: opts.deadline } : {}) });
  return tickOk("refresh-external-sites", report.checked, report.failed);
}

// ─── Passages ────────────────────────────────────────────────────────────────

/**
 * Groupes de tâches : un par entrée du cron (`apps/admin/vercel.json`,
 * `/api/jobs/tick?task=<groupe>`), chacun avec sa propre échéance.
 */
export const TICK_GROUPS = ["emails", "publication", "redaction", "google", "google-scans", "sites-clients"] as const;
export type TickGroup = (typeof TICK_GROUPS)[number];

export function isTickGroup(value: unknown): value is TickGroup {
  return typeof value === "string" && (TICK_GROUPS as readonly string[]).includes(value);
}

export type TickTask = {
  task: string;
  group: TickGroup;
  /** Part du temps du passage : une tâche reçoit, du temps restant, la fraction `weight / somme des poids restants`. */
  weight: number;
  run: (now: Date, opts: TickOptions) => Promise<TickReport>;
};

/**
 * Toutes les tâches, dans l'ordre d'un passage complet : d'abord ce qui est
 * court et attendu à heure fixe (publication, calendrier, e-mails), puis les
 * appels fournisseur longs. La rédaction ne passe jamais avant la publication.
 */
export const ALL_TICKS: readonly TickTask[] = [
  { task: "publish-articles", group: "publication", weight: 1, run: publishDueArticles },
  { task: "editorial-calendar", group: "publication", weight: 2, run: ensureEditorialCalendars },
  // Le rappel du 25 d'abord, avec une petite part : hors de ses jours d'envoi il rend la main aussitôt, et l'e-mail du lundi, qui sert tout le parc, reçoit tout le temps du passage
  { task: "month-reminders", group: "emails", weight: 1, run: sendMonthReminders },
  { task: "weekly-content-digests", group: "emails", weight: 3, run: sendWeeklyContentDigests },
  { task: "generate-articles", group: "redaction", weight: 8, run: generateDueArticles },
  { task: "sync-google", group: "google", weight: 1, run: syncGoogleData },
  { task: "sync-google-reviews", group: "google", weight: 2, run: syncGoogleReviews },
  { task: "sync-google-profiles", group: "google", weight: 3, run: syncGoogleProfiles },
  { task: "collect-google-reviews", group: "google", weight: 3, run: collectGoogleReviewTasks },
  { task: "scheduled-google-scans", group: "google-scans", weight: 4, run: runScheduledGoogleScans },
  { task: "refresh-external-sites", group: "sites-clients", weight: 3, run: refreshExternalSitesTick },
];

/** Lignes d'appel d'une erreur, sans son message (qui peut reprendre un contenu ou les paramètres d'une requête). */
function stackFrames(err: unknown): string {
  if (!(err instanceof Error) || !err.stack) return "";
  return err.stack
    .split("\n")
    .filter((line) => line.trimStart().startsWith("at "))
    .slice(0, 6)
    .join("\n");
}

/**
 * Exécute un groupe de tâches (ou toutes, sans `group`), dans l'ordre ; une
 * tâche qui lève est rapportée en erreur (type de l'erreur, jamais son
 * message) et ne bloque pas les suivantes. Le passage a sa propre échéance
 * (TICK_DEADLINE_MS après son début) ; chaque tâche reçoit une part du temps
 * restant à proportion de son poids — une tâche longue n'entame pas le temps
 * des suivantes, et le temps qu'une tâche ne consomme pas leur revient.
 */
export async function runTicks(group?: TickGroup, now = new Date()): Promise<TickReport[]> {
  const tasks = ALL_TICKS.filter((tick) => group === undefined || tick.group === group);
  const end = Date.now() + TICK_DEADLINE_MS;
  const reports: TickReport[] = [];
  for (const [index, { task, weight, run }] of tasks.entries()) {
    const started = Date.now();
    const remainingWeight = tasks.slice(index).reduce((sum, tick) => sum + tick.weight, 0);
    const deadline = new Date(started + Math.max(0, end - started) * (weight / remainingWeight));
    try {
      reports.push(await run(now, { deadline }));
    } catch (err) {
      const label = errorLabel(err);
      console.error(`[ticks] ${task} en échec (${label})\n${stackFrames(err)}`);
      reports.push(tickError(task, label));
    }
  }
  return reports;
}

/** Toutes les tâches en un passage (lancement à la main, `pnpm --filter @theralys/jobs tick`). */
export async function runAllTicks(now = new Date()): Promise<TickReport[]> {
  return runTicks(undefined, now);
}
