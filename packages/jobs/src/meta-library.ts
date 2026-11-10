/**
 * Meta Ads (studio) — visuels des annonces de la veille et bibliothèque
 * personnelle du site.
 *
 * Visuels : cherchés chez le fournisseur par identifiant d'annonce
 * (`AdMediaProvider`), mis en cache dans `meta_ad_media` (commun aux sites),
 * l'image principale et l'avatar copiés sur le stockage (`MetaMediaStore`,
 * injecté par le studio : Vercel Blob) parce que les liens d'origine
 * expirent en quelques jours. Règles :
 * - quota : les recherches sont réservées sous verrou consultatif
 *   `<siteId>:meta-media` dans une ligne `google_usage` kind
 *   `meta_media_pending`, puis soldées en `meta_media` (recherches réelles,
 *   coût réel) ; un lot (analyse, « Afficher les visuels ») refuse de
 *   démarrer tant qu'une réservation récente du même site n'est pas soldée ;
 * - un lot est borné dans le temps (`META_MEDIA_BATCH_DEADLINE_MS`) et
 *   s'interrompt après plusieurs échecs d'affilée, une clé refusée, des
 *   crédits épuisés ou une limite de débit ;
 * - le cache ne régresse jamais : un rafraîchissement qui ne ramène rien
 *   (annonce retirée, réponse vide) garde les visuels déjà copiés ;
 * - un visuel de démonstration n'est jamais servi à une vraie veille, et
 *   inversement (`source`).
 *
 * Bibliothèque : « garder comme exemple » enregistre l'annonce, son analyse
 * et ses visuels (vidéos copiées) dans `meta_ads_library` ; « supprimer »
 * y inscrit l'annonce comme écartée (elle ne revient pas aux analyses
 * suivantes) ; « restaurer » retire la ligne.
 *
 * Tout est tolérant à l'absence des tables (migration 0007 non appliquée) :
 * la veille s'affiche alors sans visuels ni bibliothèque.
 */

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  META_LIBRARY_BULK_MAX,
  META_LIBRARY_KEPT_MAX,
  META_LIBRARY_VIDEO_MAX_BYTES,
  META_MEDIA_LOOKUPS_PER_MONTH,
  META_MEDIA_LOOKUP_COST_USD,
  META_MEDIA_POSTER_WIDTH,
  filterRelevantAds,
  isMetaCdnUrl,
  metaMediaSourceExpired,
  usageMonthKey,
  type MetaAdMedia,
  type MetaAdMediaItem,
  type MetaLibraryEntry,
  type MetaMarketAd,
} from "@theralys/shared";
import { googleUsage, metaAdMedia, metaAdsAnalyses, metaAdsLibrary, type Database, type MetaAdMediaRow, type Site } from "@theralys/db";
import { MockAdMediaProvider, createAdMediaProvider, isAdMediaBlocking, type AdMediaLookup, type AdMediaProvider } from "@theralys/providers/meta/media";
import type { DbExecutor } from "./google-profile";

/** Recherches de visuels menées de front. */
export const META_MEDIA_CONCURRENCY = 6;
/** Une annonce « introuvable » chez le fournisseur n'est pas recherchée à nouveau avant ce délai (jours). */
export const META_MEDIA_MISSING_RETRY_DAYS = 7;
/** Taille maximale d'une image téléchargée (octets). */
export const META_MEDIA_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const META_MEDIA_DOWNLOAD_TIMEOUT_MS = 20_000;
/** Largeur des avatars copiés (px). */
export const META_MEDIA_AVATAR_WIDTH = 160;
/** Temps au plus consacré à une action « garder » (copies d'images et de vidéos, ms) : au-delà, les exemples restants sont gardés sans copie. */
export const META_LIBRARY_COPY_DEADLINE_MS = 90_000;
/** Temps au plus consacré aux recherches d'un lot (ms) : l'analyse ne doit pas dépasser le délai de la fonction. */
export const META_MEDIA_BATCH_DEADLINE_MS = 60_000;
/** Échecs d'affilée après lesquels un lot s'interrompt (fournisseur en panne). */
export const META_MEDIA_MAX_CONSECUTIVE_FAILURES = 5;
/** Un rafraîchissement à la demande (lecture d'une vidéo) n'est pas retenté avant ce délai (heures). */
export const META_MEDIA_REFRESH_RETRY_HOURS = 6;
/** Durée pendant laquelle une réservation non soldée bloque un autre lot du même site (ms). */
export const META_MEDIA_RESERVATION_TTL_MS = 3 * 60_000;

const MEDIA_USAGE_KINDS = ["meta_media", "meta_media_pending"] as const;

const MISSING_SCHEMA_CODES = new Set(["42P01", "42703"]);

/** Table ou colonne absente (migration non appliquée), y compris enveloppée par le pilote. */
export function isMetaLibrarySchemaMissing(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === "string" && MISSING_SCHEMA_CODES.has(code)) return true;
    current = current.cause;
  }
  return false;
}

// ─── Stockage et téléchargement ──────────────────────────────────────────────

/** Stockage durable des copies (Vercel Blob côté studio). Chaque méthode rend null plutôt que de lever. */
export interface MetaMediaStore {
  /** Image redimensionnée (largeur ≤ `maxWidth`) enregistrée sous `key` ; URL publique ou null */
  putImage(key: string, bytes: Uint8Array, opts: { maxWidth: number }): Promise<string | null>;
  /** Fichier enregistré tel quel (vidéo) ; URL publique ou null */
  putFile(key: string, bytes: Uint8Array, contentType: string): Promise<string | null>;
  /** Suppression best-effort */
  remove(urls: readonly string[]): Promise<void>;
}

/**
 * Télécharge un fichier du CDN de Meta (seul hôte accepté, sans redirection),
 * du type attendu et borné en taille ; null à la moindre anomalie.
 */
export async function downloadMetaCdn(
  url: string | null | undefined,
  opts: { accept: "image" | "video"; maxBytes: number; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!url || !isMetaCdnUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? META_MEDIA_DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await (opts.fetchImpl ?? fetch)(url, { method: "GET", redirect: "error", signal: controller.signal });
    if (!response.ok || !response.body) return null;
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!contentType.startsWith(`${opts.accept}/`)) return null;
    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > opts.maxBytes) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > opts.maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    if (total === 0) return null;
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Fournisseur et quota ────────────────────────────────────────────────────

/**
 * Fournisseur de visuels assorti à la veille : démonstration quand la veille
 * est simulée (jamais de visuels simulés sur une vraie veille), fournisseur
 * réel sinon dès qu'une clé existe, null sans clé.
 */
export function mediaProviderFor(env: NodeJS.ProcessEnv, marketMode: "meta" | "mock" | "none" | string): AdMediaProvider | null {
  if (marketMode === "mock") return new MockAdMediaProvider();
  if (marketMode !== "meta") return null;
  return createAdMediaProvider({ ...env, META_ADS_MOCK: "" });
}

/** Source des visuels attendue pour une veille : démonstration pour une veille simulée, fournisseur réel pour une vraie veille. */
export function mediaSourceFor(marketMode: "meta" | "mock" | "none" | string): MetaAdMedia["source"] | null {
  return marketMode === "mock" ? "mock" : marketMode === "meta" ? "scrapecreators" : null;
}

/** Recherches de visuels comptées ce mois-ci pour le site (soldées et réservées). */
export async function mediaLookupsUsed(db: DbExecutor, siteId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${googleUsage.requests}), 0)` })
    .from(googleUsage)
    .where(and(eq(googleUsage.siteId, siteId), eq(googleUsage.month, usageMonthKey(now)), inArray(googleUsage.kind, [...MEDIA_USAGE_KINDS])));
  return Number(row?.total ?? 0);
}

export async function mediaLookupsRemaining(db: DbExecutor, siteId: string, now = new Date()): Promise<number> {
  return Math.max(0, META_MEDIA_LOOKUPS_PER_MONTH - (await mediaLookupsUsed(db, siteId, now)));
}

export type MediaReservation = {
  /** Recherches accordées (0 : quota atteint ou lot concurrent) */
  granted: number;
  /** Ligne `google_usage` de la réservation, à solder */
  id: string | null;
  /** Un autre lot du même site est en cours (réservation récente non soldée) */
  busy: boolean;
};

/**
 * Réserve des recherches sur le quota mensuel, sous verrou consultatif : deux
 * onglets ou une analyse et un « Afficher les visuels » simultanés ne
 * dépassent jamais le plafond. `exclusive` (lots) refuse de démarrer tant
 * qu'une réservation récente du site n'est pas soldée, pour ne pas chercher
 * deux fois les mêmes annonces.
 */
export async function reserveMediaLookups(db: Database, siteId: string, wanted: number, now: Date, opts: { exclusive?: boolean } = {}): Promise<MediaReservation> {
  const count = Math.floor(wanted);
  if (!(count > 0)) return { granted: 0, id: null, busy: false };
  return db.transaction(async (tx): Promise<MediaReservation> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${siteId}:meta-media`}))`);
    if (opts.exclusive) {
      const fresh = await tx
        .select({ id: googleUsage.id })
        .from(googleUsage)
        .where(and(eq(googleUsage.siteId, siteId), eq(googleUsage.kind, "meta_media_pending"), gte(googleUsage.createdAt, new Date(now.getTime() - META_MEDIA_RESERVATION_TTL_MS))))
        .limit(1);
      if (fresh.length > 0) return { granted: 0, id: null, busy: true };
    }
    const granted = Math.min(count, await mediaLookupsRemaining(tx, siteId, now));
    if (granted <= 0) return { granted: 0, id: null, busy: false };
    const [row] = await tx
      .insert(googleUsage)
      .values({ siteId, month: usageMonthKey(now), kind: "meta_media_pending", costUsd: 0, requests: granted, createdAt: now })
      .returning({ id: googleUsage.id });
    return { granted, id: row?.id ?? null, busy: false };
  });
}

/** Solde une réservation : recherches réellement envoyées et leur coût ; la ligne disparaît si rien n'a été envoyé. */
export async function settleMediaLookups(db: DbExecutor, reservation: MediaReservation, lookups: number, providerMode: string): Promise<void> {
  if (!reservation.id) return;
  if (!(lookups > 0)) {
    await db.delete(googleUsage).where(eq(googleUsage.id, reservation.id));
    return;
  }
  // Les visuels de démonstration ne coûtent rien
  const costUsd = providerMode === "scrapecreators" ? Math.round(lookups * META_MEDIA_LOOKUP_COST_USD * 1000) / 1000 : 0;
  await db.update(googleUsage).set({ kind: "meta_media", requests: lookups, costUsd }).where(eq(googleUsage.id, reservation.id));
}

// ─── Enrichissement ──────────────────────────────────────────────────────────

export type MediaEnrichment = {
  mediaByAdId: Record<string, MetaAdMedia>;
  /** Recherches réellement envoyées au fournisseur */
  lookups: number;
  /** Lot interrompu : clé refusée, crédits épuisés, limite de débit ou échecs d'affilée */
  blocked: boolean;
  /** Tables absentes (migration 0007) : rien n'a été fait */
  unavailable: boolean;
};

export type MediaEnrichmentDeps = {
  provider: AdMediaProvider | null;
  store: MetaMediaStore | null;
  now: Date;
  /** Recherches autorisées au plus */
  budget: number;
  concurrency?: number;
  fetchImpl?: typeof fetch;
  /** Recherche même si des visuels sont déjà en cache (liens expirés à rafraîchir) */
  force?: boolean;
  /** Temps au plus consacré aux recherches (défaut META_MEDIA_BATCH_DEADLINE_MS) */
  deadlineMs?: number;
};

function isAdId(value: string): boolean {
  return /^\d{5,25}$/.test(value);
}

/** Visuels en cache encore utilisables : au moins une image affichable, ou rien à afficher (annonce sans visuel). */
export function cachedMediaUsable(media: MetaAdMedia, now: Date): boolean {
  if (media.items.length === 0) return true;
  return media.items.some((item) => item.posterUrl !== null) || !metaMediaSourceExpired(media, now);
}

async function copyImage(store: MetaMediaStore | null, key: string, url: string | null, maxWidth: number, fetchImpl?: typeof fetch): Promise<string | null> {
  if (!store || !url) return null;
  const file = await downloadMetaCdn(url, { accept: "image", maxBytes: META_MEDIA_IMAGE_MAX_BYTES, ...(fetchImpl ? { fetchImpl } : {}) });
  if (!file) return null;
  try {
    return await store.putImage(key, file.bytes, { maxWidth });
  } catch (err) {
    console.warn(`[meta-ads] copie de l'image ${key} impossible :`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Réponse du fournisseur → visuels enregistrés (images et avatar copiés quand
 * un stockage existe). Les copies déjà faites (`previous`, même rang et même
 * nature) sont reprises telles quelles : un rafraîchissement ne retélécharge
 * rien et ne perd rien.
 */
export async function materializeMedia(
  lookup: AdMediaLookup,
  deps: Pick<MediaEnrichmentDeps, "store" | "now" | "fetchImpl"> & { source: MetaAdMedia["source"] },
  previous: MetaAdMedia | null = null,
): Promise<MetaAdMedia> {
  const kept = (index: number, kind: MetaAdMediaItem["kind"]) => {
    const before = previous?.items[index];
    return before && before.kind === kind ? before : undefined;
  };
  const previousAvatar = previous?.avatarUrl && !isMetaCdnUrl(previous.avatarUrl) ? previous.avatarUrl : null;
  // Copies menées de front (une annonce compte jusqu'à cinq visuels et un avatar) : l'analyse ne doit pas s'éterniser
  const [items, avatar] = await Promise.all([
    Promise.all(
      lookup.items.map(async (item, index): Promise<MetaAdMediaItem> => {
        const before = kept(index, item.kind);
        const posterUrl = item.posterUrl ?? before?.posterUrl ?? (await copyImage(deps.store, `meta-media/${lookup.adId}/${index}.jpg`, item.imageUrl, META_MEDIA_POSTER_WIDTH, deps.fetchImpl));
        return { kind: item.kind, posterUrl, sourceImageUrl: item.imageUrl, sourceVideoUrl: item.videoUrl, ...(before?.videoUrl ? { videoUrl: before.videoUrl } : {}) };
      }),
    ),
    previousAvatar ? Promise.resolve(previousAvatar) : copyImage(deps.store, `meta-media/${lookup.adId}/avatar.jpg`, lookup.avatarUrl, META_MEDIA_AVATAR_WIDTH, deps.fetchImpl),
  ]);
  return {
    version: 1,
    format: lookup.format,
    variants: lookup.variants,
    items,
    avatarUrl: avatar ?? lookup.avatarUrl,
    ctaText: lookup.ctaText,
    linkUrl: lookup.linkUrl,
    pageCategories: lookup.pageCategories,
    pageLikes: lookup.pageLikes,
    sourceExpiresAt: lookup.expiresAt,
    fetchedAt: deps.now.toISOString(),
    source: deps.source,
  };
}

export type MediaPlan = {
  /** Visuels en cache réutilisés tels quels */
  cached: Record<string, MetaAdMedia>;
  /** Annonces à chercher chez le fournisseur */
  pending: string[];
  /** Lignes en cache, par identifiant (visuels à reprendre lors d'un rafraîchissement) */
  rows: Map<string, MetaAdMediaRow>;
  unavailable: boolean;
};

/**
 * Lecture du cache : ce qui est réutilisable et ce qu'il reste à chercher.
 * Une ligne d'une autre source (`source` : démonstration ou réel) est
 * ignorée ; une annonce « introuvable » n'est pas recherchée à nouveau avant
 * META_MEDIA_MISSING_RETRY_DAYS, sauf `force`.
 */
export async function planAdsMedia(db: Database, adIds: readonly string[], deps: { now: Date; force?: boolean; source?: MetaAdMedia["source"] | null }): Promise<MediaPlan> {
  const ids = [...new Set(adIds.filter(isAdId))];
  const plan: MediaPlan = { cached: {}, pending: [], rows: new Map(), unavailable: false };
  if (ids.length === 0) return plan;
  let rows: MetaAdMediaRow[];
  try {
    rows = await db.select().from(metaAdMedia).where(inArray(metaAdMedia.adId, ids));
  } catch (err) {
    if (!isMetaLibrarySchemaMissing(err)) throw err;
    console.warn("[meta-ads] table meta_ad_media absente — migration 0007 non appliquée ?");
    return { ...plan, unavailable: true };
  }
  const retryMissingBefore = deps.now.getTime() - META_MEDIA_MISSING_RETRY_DAYS * 86_400_000;
  for (const row of rows) if (!deps.source || row.provider === deps.source) plan.rows.set(row.adId, row);
  for (const id of ids) {
    const row = plan.rows.get(id);
    if (row && !deps.force) {
      if (row.media && cachedMediaUsable(row.media, deps.now)) {
        plan.cached[id] = row.media;
        continue;
      }
      if (row.status === "missing" && row.fetchedAt.getTime() > retryMissingBefore) continue;
    }
    plan.pending.push(id);
  }
  return plan;
}

/**
 * Recherche chez le fournisseur les annonces de `pending` (déjà bornées par
 * le quota), `concurrency` de front, dans la limite de `deadlineMs`. Une
 * annonce en échec est ignorée ; une clé refusée, des crédits épuisés, une
 * limite de débit ou META_MEDIA_MAX_CONSECUTIVE_FAILURES échecs d'affilée
 * interrompent le lot (`blocked`). Le cache ne régresse jamais : une réponse
 * vide ou « introuvable » garde les visuels déjà enregistrés (seule la date
 * de la tentative avance).
 */
export async function lookupAdsMedia(
  db: Database,
  pending: readonly string[],
  rows: ReadonlyMap<string, MetaAdMediaRow>,
  deps: Omit<MediaEnrichmentDeps, "budget" | "force"> & { provider: AdMediaProvider },
): Promise<Pick<MediaEnrichment, "mediaByAdId" | "lookups" | "blocked">> {
  const result: Pick<MediaEnrichment, "mediaByAdId" | "lookups" | "blocked"> = { mediaByAdId: {}, lookups: 0, blocked: false };
  const { provider } = deps;
  const queue = [...pending];
  const until = Date.now() + (deps.deadlineMs ?? META_MEDIA_BATCH_DEADLINE_MS);
  let failures = 0;
  const worker = async () => {
    for (;;) {
      if (result.blocked || Date.now() >= until) return;
      const id = queue.shift();
      if (id === undefined) return;
      const previous = rows.get(id)?.media ?? null;
      try {
        result.lookups++;
        const lookup = await provider.lookup(id);
        failures = 0;
        const fresh = lookup ? await materializeMedia(lookup, { store: deps.store, now: deps.now, source: provider.mode, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) }, previous) : null;
        if (previous && previous.items.length > 0 && (fresh === null || fresh.items.length === 0)) {
          // Rien de mieux qu'avant : on garde les visuels déjà copiés, la tentative est datée
          await db.update(metaAdMedia).set({ fetchedAt: deps.now, updatedAt: deps.now }).where(eq(metaAdMedia.adId, id));
          result.mediaByAdId[id] = previous;
          continue;
        }
        const status = fresh === null ? "missing" : fresh.items.length > 0 ? "ok" : "empty";
        await db
          .insert(metaAdMedia)
          .values({ adId: id, status, media: fresh, provider: provider.mode, fetchedAt: deps.now, updatedAt: deps.now })
          .onConflictDoUpdate({ target: metaAdMedia.adId, set: { status, media: fresh, provider: provider.mode, fetchedAt: deps.now, updatedAt: deps.now } });
        if (fresh) result.mediaByAdId[id] = fresh;
      } catch (err) {
        if (isAdMediaBlocking(err)) {
          result.blocked = true;
          console.error("[meta-ads] visuels : fournisseur indisponible (clé refusée, crédits épuisés ou limite de débit) :", err instanceof Error ? err.message : err);
          return;
        }
        failures++;
        console.warn(`[meta-ads] visuels de l'annonce ${id} non obtenus :`, err instanceof Error ? err.message : err);
        if (failures >= META_MEDIA_MAX_CONSECUTIVE_FAILURES) {
          result.blocked = true;
          console.error(`[meta-ads] visuels : ${failures} échecs d'affilée, lot interrompu`);
          return;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(deps.concurrency ?? META_MEDIA_CONCURRENCY, queue.length)) }, worker));
  return result;
}

/**
 * Visuels d'un lot d'annonces, sans gestion du quota : cache d'abord, puis
 * recherche des annonces restantes dans la limite de `budget`. Les appelants
 * du studio passent par `enrichSiteAdsMedia`, qui réserve et solde le quota.
 */
export async function enrichAdsMedia(db: Database, adIds: readonly string[], deps: MediaEnrichmentDeps): Promise<MediaEnrichment> {
  const plan = await planAdsMedia(db, adIds, { now: deps.now, ...(deps.force ? { force: true } : {}), source: deps.provider?.mode ?? null });
  if (plan.unavailable) return { mediaByAdId: {}, lookups: 0, blocked: false, unavailable: true };
  const pending = plan.pending.slice(0, Math.max(0, Math.floor(deps.budget)));
  if (!deps.provider || pending.length === 0) return { mediaByAdId: plan.cached, lookups: 0, blocked: false, unavailable: false };
  const looked = await lookupAdsMedia(db, pending, plan.rows, { ...deps, provider: deps.provider });
  return { mediaByAdId: { ...plan.cached, ...looked.mediaByAdId }, lookups: looked.lookups, blocked: looked.blocked, unavailable: false };
}

export type SiteMediaEnrichment = MediaEnrichment & {
  /** Un autre lot du même site est en cours : rien n'a été cherché */
  busy: boolean;
  /** Annonces restées sans recherche faute de quota */
  overQuota: number;
};

/**
 * Visuels d'un lot d'annonces pour un site, quota compris : lecture du cache,
 * réservation des recherches manquantes (`exclusive` : un seul lot à la fois
 * par site), recherche, puis solde de la réservation avec les recherches
 * réellement envoyées — même si le lot échoue en route.
 */
export async function enrichSiteAdsMedia(
  db: Database,
  siteId: string,
  adIds: readonly string[],
  deps: Omit<MediaEnrichmentDeps, "budget"> & { exclusive?: boolean },
): Promise<SiteMediaEnrichment> {
  const plan = await planAdsMedia(db, adIds, { now: deps.now, ...(deps.force ? { force: true } : {}), source: deps.provider?.mode ?? null });
  const base: SiteMediaEnrichment = { mediaByAdId: plan.cached, lookups: 0, blocked: false, unavailable: plan.unavailable, busy: false, overQuota: 0 };
  if (plan.unavailable) return { ...base, mediaByAdId: {} };
  if (!deps.provider || plan.pending.length === 0) return base;
  const provider = deps.provider;
  const reservation = await reserveMediaLookups(db, siteId, plan.pending.length, deps.now, deps.exclusive ? { exclusive: true } : {});
  if (reservation.granted <= 0) return { ...base, busy: reservation.busy, overQuota: reservation.busy ? 0 : plan.pending.length };
  let lookups = 0;
  try {
    const looked = await lookupAdsMedia(db, plan.pending.slice(0, reservation.granted), plan.rows, { ...deps, provider });
    lookups = looked.lookups;
    return { ...base, mediaByAdId: { ...plan.cached, ...looked.mediaByAdId }, lookups, blocked: looked.blocked, overQuota: plan.pending.length - reservation.granted };
  } finally {
    await settleMediaLookups(db, reservation, lookups, provider.mode).catch((err) => console.error("[meta-ads] réservation de visuels non soldée :", err instanceof Error ? err.message : err));
  }
}

/**
 * Visuels en cache d'un lot d'annonces (lecture seule ; vide si la table
 * manque). `source` écarte les lignes d'une autre origine (démonstration ou
 * réel). `known` : annonces déjà cherchées, avec ou sans visuel.
 */
export async function loadMetaMediaState(db: Database, adIds: readonly string[], source?: MetaAdMedia["source"] | null): Promise<{ mediaByAdId: Record<string, MetaAdMedia>; known: Set<string> }> {
  const ids = [...new Set(adIds.filter(isAdId))];
  const state = { mediaByAdId: {} as Record<string, MetaAdMedia>, known: new Set<string>() };
  if (ids.length === 0) return state;
  try {
    const rows = await db.select({ adId: metaAdMedia.adId, media: metaAdMedia.media, provider: metaAdMedia.provider }).from(metaAdMedia).where(inArray(metaAdMedia.adId, ids));
    for (const row of rows) {
      if (source && row.provider !== source) continue;
      state.known.add(row.adId);
      if (row.media) state.mediaByAdId[row.adId] = row.media;
    }
    return state;
  } catch (err) {
    if (!isMetaLibrarySchemaMissing(err)) throw err;
    return state;
  }
}

/** Visuels en cache d'un lot d'annonces (voir `loadMetaMediaState`). */
export async function loadMetaMedia(db: Database, adIds: readonly string[], source?: MetaAdMedia["source"] | null): Promise<Record<string, MetaAdMedia>> {
  return (await loadMetaMediaState(db, adIds, source)).mediaByAdId;
}

// ─── Bibliothèque ────────────────────────────────────────────────────────────

export type MetaLibraryData = {
  /** false : tables absentes (migration 0007), garder et supprimer sont indisponibles */
  available: boolean;
  kept: MetaLibraryEntry[];
  dismissedIds: string[];
};

export async function loadMetaLibrary(db: Database, siteId: string): Promise<MetaLibraryData> {
  try {
    const rows = await db.select().from(metaAdsLibrary).where(eq(metaAdsLibrary.siteId, siteId)).orderBy(desc(metaAdsLibrary.updatedAt));
    const kept: MetaLibraryEntry[] = [];
    const dismissedIds: string[] = [];
    for (const row of rows) {
      if (row.status === "dismissed") dismissedIds.push(row.adId);
      else if (row.ad) kept.push({ adId: row.adId, status: "kept", pageName: row.pageName, ad: row.ad, media: row.media ?? null, savedAt: row.createdAt.toISOString() });
    }
    return { available: true, kept, dismissedIds };
  } catch (err) {
    if (!isMetaLibrarySchemaMissing(err)) throw err;
    console.warn("[meta-ads] table meta_ads_library absente — migration 0007 non appliquée ?");
    return { available: false, kept: [], dismissedIds: [] };
  }
}

export type CurrentMarket = {
  /** Annonces de la dernière veille aboutie, par identifiant */
  ads: Map<string, MetaMarketAd>;
  /** Mode du fournisseur de cette veille : `meta` | `mock` | `none` */
  providerMode: string;
};

/**
 * Dernière veille aboutie du site, telle qu'elle est affichée : une veille
 * enregistrée avant le filtre de pertinence est filtrée ici aussi (ce que le
 * praticien ne voit pas ne se garde pas et ne coûte aucune recherche).
 */
export async function currentMarket(db: DbExecutor, siteId: string): Promise<CurrentMarket> {
  const [row] = await db
    .select({ market: metaAdsAnalyses.market, seed: metaAdsAnalyses.seed, provider: metaAdsAnalyses.provider })
    .from(metaAdsAnalyses)
    .where(and(eq(metaAdsAnalyses.siteId, siteId), eq(metaAdsAnalyses.status, "done")))
    .orderBy(desc(metaAdsAnalyses.createdAt))
    .limit(1);
  const market = row?.market ?? null;
  let ads = market?.ads ?? [];
  if (market && !market.filtered && row?.seed.profession) ads = filterRelevantAds(ads, { profession: row.seed.profession }).kept as MetaMarketAd[];
  return { ads: new Map(ads.map((ad) => [ad.id, ad])), providerMode: row?.provider ?? "none" };
}

/** Annonces de la dernière veille aboutie du site, par identifiant. */
export async function currentMarketAds(db: DbExecutor, siteId: string): Promise<Map<string, MetaMarketAd>> {
  return (await currentMarket(db, siteId)).ads;
}

export type LibraryOutcome =
  | { status: "done"; count: number }
  | { status: "skipped"; reason: "unknown_ad" | "full" | "unavailable" | "empty" };

function cleanIds(adIds: readonly string[]): string[] {
  return [...new Set(adIds.filter(isAdId))].slice(0, META_LIBRARY_BULK_MAX);
}

/** URL des vidéos durables d'un exemple (à supprimer quand il quitte la bibliothèque). */
export function libraryVideoUrls(media: MetaAdMedia | null | undefined): string[] {
  return (media?.items ?? []).map((item) => item.videoUrl).filter((url): url is string => typeof url === "string" && url !== "");
}

export type KeepDeps = {
  /** Fournisseur de visuels de la veille courante (rafraîchit un lien expiré) ; déduit de la veille s'il est omis */
  provider?: AdMediaProvider | null;
  store: MetaMediaStore | null;
  now: Date;
  fetchImpl?: typeof fetch;
  /** Temps au plus pour les copies (ms, défaut META_LIBRARY_COPY_DEADLINE_MS) */
  deadlineMs?: number;
  env?: NodeJS.ProcessEnv;
};

/**
 * Visuels durables d'un exemple : images manquantes et vidéos copiées sur le
 * stockage tant que le délai le permet ; des liens expirés sont rafraîchis
 * une fois (une recherche réservée sur le quota).
 */
async function durableMedia(db: Database, siteId: string, adId: string, media: MetaAdMedia | null, deps: KeepDeps & { provider: AdMediaProvider | null }, until: number): Promise<MetaAdMedia | null> {
  if (!media || !deps.store || media.source === "mock") return media;
  let current = media;
  const incomplete = () => current.items.some((item) => item.posterUrl === null || (item.kind === "video" && !item.videoUrl));
  if (incomplete() && metaMediaSourceExpired(current, deps.now) && deps.provider && Date.now() < until) {
    const fresh = await enrichSiteAdsMedia(db, siteId, [adId], { provider: deps.provider, store: deps.store, now: deps.now, force: true, deadlineMs: 20_000, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
    current = fresh.mediaByAdId[adId] ?? current;
  }
  if (metaMediaSourceExpired(current, deps.now)) return current;
  const items: MetaAdMediaItem[] = [];
  for (const [index, item] of current.items.entries()) {
    let next = item;
    if (next.posterUrl === null && Date.now() < until) {
      const posterUrl = await copyImage(deps.store, `meta-media/${adId}/${index}.jpg`, next.sourceImageUrl, META_MEDIA_POSTER_WIDTH, deps.fetchImpl);
      if (posterUrl) next = { ...next, posterUrl };
    }
    if (next.kind === "video" && !next.videoUrl && Date.now() < until) {
      const file = await downloadMetaCdn(next.sourceVideoUrl, { accept: "video", maxBytes: META_LIBRARY_VIDEO_MAX_BYTES, timeoutMs: Math.max(1_000, Math.min(60_000, until - Date.now())), ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
      if (file) {
        try {
          const videoUrl = await deps.store.putFile(`meta-library/${siteId}/${adId}/video-${index}.mp4`, file.bytes, file.contentType);
          if (videoUrl) next = { ...next, videoUrl };
        } catch (err) {
          console.warn(`[meta-ads] copie de la vidéo de l'annonce ${adId} impossible :`, err instanceof Error ? err.message : err);
        }
      }
    }
    items.push(next);
  }
  return { ...current, items };
}

/**
 * Garde des annonces comme exemples : elles doivent appartenir à la dernière
 * veille affichée du site (ou être déjà dans sa bibliothèque). L'annonce et
 * son analyse sont figées, ses visuels rendus durables dans la limite du
 * délai (au-delà, les exemples restants sont gardés avec leurs visuels en
 * l'état). Refus groupé si la bibliothèque dépasserait META_LIBRARY_KEPT_MAX
 * exemples.
 */
export async function keepMetaAds(db: Database, siteId: string, adIds: readonly string[], deps: KeepDeps): Promise<LibraryOutcome> {
  const ids = cleanIds(adIds);
  if (ids.length === 0) return { status: "skipped", reason: "empty" };
  try {
    const [market, existing] = await Promise.all([
      currentMarket(db, siteId),
      db.select({ adId: metaAdsLibrary.adId, status: metaAdsLibrary.status }).from(metaAdsLibrary).where(eq(metaAdsLibrary.siteId, siteId)),
    ]);
    const keptIds = new Set(existing.filter((row) => row.status === "kept").map((row) => row.adId));
    const fresh = ids.filter((id) => !keptIds.has(id));
    if (fresh.some((id) => !market.ads.has(id))) return { status: "skipped", reason: "unknown_ad" };
    if (keptIds.size + fresh.length > META_LIBRARY_KEPT_MAX) return { status: "skipped", reason: "full" };
    const source = market.providerMode === "mock" ? "mock" : "meta";
    const provider = deps.provider === undefined ? mediaProviderFor(deps.env ?? process.env, market.providerMode) : deps.provider;
    const mediaByAdId = await loadMetaMedia(db, fresh, mediaSourceFor(market.providerMode));
    const until = Date.now() + (deps.deadlineMs ?? META_LIBRARY_COPY_DEADLINE_MS);
    for (const id of fresh) {
      const ad = market.ads.get(id)!;
      const cached = mediaByAdId[id] ?? null;
      const media = Date.now() < until ? await durableMedia(db, siteId, id, cached, { ...deps, provider }, until) : cached;
      await db
        .insert(metaAdsLibrary)
        .values({ siteId, adId: id, status: "kept", source, pageName: ad.pageName, ad, media, createdAt: deps.now, updatedAt: deps.now })
        .onConflictDoUpdate({ target: [metaAdsLibrary.siteId, metaAdsLibrary.adId], set: { status: "kept", source, pageName: ad.pageName, ad, media, createdAt: deps.now, updatedAt: deps.now } });
    }
    return { status: "done", count: fresh.length };
  } catch (err) {
    if (!isMetaLibrarySchemaMissing(err)) throw err;
    return { status: "skipped", reason: "unavailable" };
  }
}

/**
 * Supprime des annonces de la veille : inscrites comme écartées, elles ne
 * reviennent pas aux analyses suivantes. Un exemple gardé perd ses copies de
 * vidéos. Les annonces doivent appartenir à la dernière veille ou à la
 * bibliothèque du site.
 */
export async function dismissMetaAds(db: Database, siteId: string, adIds: readonly string[], deps: { store: MetaMediaStore | null; now: Date }): Promise<LibraryOutcome> {
  const ids = cleanIds(adIds);
  if (ids.length === 0) return { status: "skipped", reason: "empty" };
  try {
    const [market, existing] = await Promise.all([
      currentMarket(db, siteId),
      db.select().from(metaAdsLibrary).where(and(eq(metaAdsLibrary.siteId, siteId), inArray(metaAdsLibrary.adId, ids))),
    ]);
    const known = new Map(existing.map((row) => [row.adId, row]));
    if (ids.some((id) => !market.ads.has(id) && !known.has(id))) return { status: "skipped", reason: "unknown_ad" };
    const source = market.providerMode === "mock" ? "mock" : "meta";
    const orphans: string[] = [];
    for (const id of ids) {
      const row = known.get(id);
      if (row?.status === "kept") orphans.push(...libraryVideoUrls(row.media));
      const pageName = market.ads.get(id)?.pageName ?? row?.pageName ?? "";
      await db
        .insert(metaAdsLibrary)
        .values({ siteId, adId: id, status: "dismissed", source: row?.source ?? source, pageName, ad: null, media: null, createdAt: deps.now, updatedAt: deps.now })
        .onConflictDoUpdate({ target: [metaAdsLibrary.siteId, metaAdsLibrary.adId], set: { status: "dismissed", pageName, ad: null, media: null, updatedAt: deps.now } });
    }
    if (orphans.length > 0 && deps.store) await deps.store.remove(orphans).catch(() => undefined);
    return { status: "done", count: ids.length };
  } catch (err) {
    if (!isMetaLibrarySchemaMissing(err)) throw err;
    return { status: "skipped", reason: "unavailable" };
  }
}

/** Retire des annonces de la bibliothèque (exemples gardés ou annonces supprimées) : elles retrouvent leur état d'origine dans la veille. */
export async function restoreMetaAds(db: Database, siteId: string, adIds: readonly string[], deps: { store: MetaMediaStore | null }): Promise<LibraryOutcome> {
  const ids = cleanIds(adIds);
  if (ids.length === 0) return { status: "skipped", reason: "empty" };
  try {
    const removed = await db
      .delete(metaAdsLibrary)
      .where(and(eq(metaAdsLibrary.siteId, siteId), inArray(metaAdsLibrary.adId, ids)))
      .returning({ status: metaAdsLibrary.status, media: metaAdsLibrary.media });
    const orphans = removed.filter((row) => row.status === "kept").flatMap((row) => libraryVideoUrls(row.media));
    if (orphans.length > 0 && deps.store) await deps.store.remove(orphans).catch(() => undefined);
    return { status: "done", count: removed.length };
  } catch (err) {
    if (!isMetaLibrarySchemaMissing(err)) throw err;
    return { status: "skipped", reason: "unavailable" };
  }
}

/**
 * Annonces supprimées par le site et exemples gardés, pour l'analyse
 * suivante. Seuls les exemples de la même origine que la veille à venir
 * (`marketMode` : réelle ou simulée) sont rendus : un exemple de
 * démonstration n'inspire jamais une vraie veille. Vide si la table manque.
 */
export async function libraryForAnalysis(db: Database, siteId: string, marketMode: "meta" | "mock" | "none" | string = "meta"): Promise<{ dismissedIds: string[]; favorites: MetaMarketAd[] }> {
  try {
    const rows = await db
      .select({ adId: metaAdsLibrary.adId, status: metaAdsLibrary.status, source: metaAdsLibrary.source, ad: metaAdsLibrary.ad })
      .from(metaAdsLibrary)
      .where(eq(metaAdsLibrary.siteId, siteId))
      .orderBy(desc(metaAdsLibrary.updatedAt));
    const wanted = marketMode === "mock" ? "mock" : "meta";
    return {
      dismissedIds: rows.filter((row) => row.status === "dismissed").map((row) => row.adId),
      favorites: rows.filter((row) => row.status === "kept" && row.source === wanted).map((row) => row.ad).filter((ad): ad is MetaMarketAd => ad !== null),
    };
  } catch (err) {
    if (!isMetaLibrarySchemaMissing(err)) throw err;
    return { dismissedIds: [], favorites: [] };
  }
}

/**
 * Retire de la bibliothèque d'un site tout ce qui vient d'une veille de
 * démonstration (conversion d'une démo en site client : jamais de données
 * simulées chez un client). Sans effet si la table manque.
 */
export async function purgeMockLibrary(db: Database, siteId: string): Promise<number> {
  try {
    const removed = await db.delete(metaAdsLibrary).where(and(eq(metaAdsLibrary.siteId, siteId), eq(metaAdsLibrary.source, "mock"))).returning({ id: metaAdsLibrary.id });
    return removed.length;
  } catch (err) {
    if (!isMetaLibrarySchemaMissing(err)) throw err;
    return 0;
  }
}

// ─── Lecture d'une vidéo ─────────────────────────────────────────────────────

export type VideoSource = { url: string; durable: boolean } | null;

/**
 * Adresse lisible de la vidéo d'une annonce du site : la copie durable d'un
 * exemple gardé, sinon le lien d'origine s'il vit encore, sinon un lien
 * rafraîchi chez le fournisseur — seulement pour une vraie vidéo dont le lien
 * a expiré, une recherche réservée sur le quota, et pas plus d'une tentative
 * par META_MEDIA_REFRESH_RETRY_HOURS (une annonce retirée ne coûte pas une
 * recherche à chaque lecture). null si l'annonce n'appartient ni à la veille
 * ni à la bibliothèque du site, ou si aucune vidéo n'est disponible.
 */
export async function metaAdVideoSource(
  db: Database,
  site: Pick<Site, "id">,
  adId: string,
  index: number,
  deps: { store: MetaMediaStore | null; now: Date; fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv; provider?: AdMediaProvider | null },
): Promise<VideoSource> {
  if (!isAdId(adId) || !Number.isInteger(index) || index < 0) return null;
  let kept: { media: MetaAdMedia | null; source: string } | undefined;
  let row: MetaAdMediaRow | undefined;
  try {
    [kept] = await db
      .select({ media: metaAdsLibrary.media, source: metaAdsLibrary.source })
      .from(metaAdsLibrary)
      .where(and(eq(metaAdsLibrary.siteId, site.id), eq(metaAdsLibrary.adId, adId), eq(metaAdsLibrary.status, "kept")))
      .limit(1);
    const durable = kept?.media?.items[index]?.videoUrl;
    if (durable) return { url: durable, durable: true };
    [row] = await db.select().from(metaAdMedia).where(eq(metaAdMedia.adId, adId)).limit(1);
  } catch (err) {
    if (!isMetaLibrarySchemaMissing(err)) throw err;
    return null;
  }
  const market = await currentMarket(db, site.id);
  if (!kept && !market.ads.has(adId)) return null;
  const mode = kept ? (kept.source === "mock" ? "mock" : "meta") : market.providerMode;
  const expected = mediaSourceFor(mode);
  const cached = row && row.media && (!expected || row.provider === expected) ? row.media : (kept?.media ?? null);
  const item = cached?.items[index];
  if (!cached || !item || item.kind !== "video") return null;
  if (item.sourceVideoUrl && !metaMediaSourceExpired(cached, deps.now)) return { url: item.sourceVideoUrl, durable: false };
  // Lien expiré : un rafraîchissement, s'il n'a pas déjà été tenté récemment
  if (cached.source === "mock") return null;
  const provider = deps.provider === undefined ? mediaProviderFor(deps.env ?? process.env, mode) : deps.provider;
  if (!provider || provider.mode === "mock") return null;
  if (row && deps.now.getTime() - row.fetchedAt.getTime() < META_MEDIA_REFRESH_RETRY_HOURS * 3_600_000) return null;
  const fresh = await enrichSiteAdsMedia(db, site.id, [adId], { provider, store: deps.store, now: deps.now, force: true, deadlineMs: 20_000, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
  const refreshed = fresh.mediaByAdId[adId];
  const url = refreshed && !metaMediaSourceExpired(refreshed, deps.now) ? refreshed.items[index]?.sourceVideoUrl : null;
  return url ? { url, durable: false } : null;
}
