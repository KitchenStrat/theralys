/**
 * Meta Ads (studio) — visuels des annonces de la veille et bibliothèque
 * personnelle du site.
 *
 * Visuels : cherchés chez le fournisseur par identifiant d'annonce
 * (`AdMediaProvider`), mis en cache dans `meta_ad_media` (commun aux sites),
 * l'image principale et l'avatar copiés sur le stockage (`MetaMediaStore`,
 * injecté par le studio : Vercel Blob) parce que les liens d'origine
 * expirent en quelques jours. Chaque recherche est comptée dans
 * `google_usage` (kind `meta_media`) et plafonnée par site et par mois.
 *
 * Bibliothèque : « garder comme exemple » enregistre l'annonce, son analyse
 * et ses visuels (vidéos copiées) dans `meta_ads_library` ; « supprimer »
 * y inscrit l'annonce comme écartée (elle ne revient pas aux analyses
 * suivantes) ; « restaurer » retire la ligne.
 *
 * Tout est tolérant à l'absence des tables (migration 0007 non appliquée) :
 * la veille s'affiche alors sans visuels ni bibliothèque.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  META_LIBRARY_BULK_MAX,
  META_LIBRARY_KEPT_MAX,
  META_LIBRARY_VIDEO_MAX_BYTES,
  META_MEDIA_LOOKUPS_PER_MONTH,
  META_MEDIA_LOOKUP_COST_USD,
  META_MEDIA_POSTER_WIDTH,
  isMetaCdnUrl,
  metaMediaSourceExpired,
  usageMonthKey,
  type MetaAdMedia,
  type MetaAdMediaItem,
  type MetaLibraryEntry,
  type MetaMarketAd,
} from "@theralys/shared";
import { googleUsage, metaAdMedia, metaAdsAnalyses, metaAdsLibrary, type Database, type Site } from "@theralys/db";
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
/** Temps au plus consacré aux copies de vidéos d'une action « garder » (ms) : au-delà, l'exemple est gardé sans copie de la vidéo. */
export const META_LIBRARY_COPY_DEADLINE_MS = 90_000;

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

/** Recherches de visuels déjà comptées ce mois-ci pour le site. */
export async function mediaLookupsUsed(db: DbExecutor, siteId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${googleUsage.requests}), 0)` })
    .from(googleUsage)
    .where(and(eq(googleUsage.siteId, siteId), eq(googleUsage.month, usageMonthKey(now)), eq(googleUsage.kind, "meta_media")));
  return Number(row?.total ?? 0);
}

export async function mediaLookupsRemaining(db: DbExecutor, siteId: string, now = new Date()): Promise<number> {
  return Math.max(0, META_MEDIA_LOOKUPS_PER_MONTH - (await mediaLookupsUsed(db, siteId, now)));
}

/** Inscrit les recherches effectuées (rien pour zéro ; les visuels de démonstration ne coûtent rien). */
export async function recordMediaUsage(db: DbExecutor, siteId: string, lookups: number, providerMode: string, now = new Date()): Promise<void> {
  if (lookups <= 0) return;
  const costUsd = providerMode === "scrapecreators" ? Math.round(lookups * META_MEDIA_LOOKUP_COST_USD * 1000) / 1000 : 0;
  await db.insert(googleUsage).values({ siteId, month: usageMonthKey(now), kind: "meta_media", costUsd, requests: lookups, createdAt: now });
}

// ─── Enrichissement ──────────────────────────────────────────────────────────

export type MediaEnrichment = {
  mediaByAdId: Record<string, MetaAdMedia>;
  /** Recherches réellement envoyées au fournisseur */
  lookups: number;
  /** Clé refusée ou crédits épuisés : le lot a été interrompu */
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

/** Réponse du fournisseur → visuels enregistrés (images et avatar copiés quand un stockage existe). */
export async function materializeMedia(lookup: AdMediaLookup, deps: Pick<MediaEnrichmentDeps, "store" | "now" | "fetchImpl"> & { source: MetaAdMedia["source"] }): Promise<MetaAdMedia> {
  // Copies menées de front (une annonce compte jusqu'à cinq visuels et un avatar) : l'analyse ne doit pas s'éterniser
  const [items, avatar] = await Promise.all([
    Promise.all(
      lookup.items.map(async (item, index): Promise<MetaAdMediaItem> => {
        const posterUrl = item.posterUrl ?? (await copyImage(deps.store, `meta-media/${lookup.adId}/${index}.jpg`, item.imageUrl, META_MEDIA_POSTER_WIDTH, deps.fetchImpl));
        return { kind: item.kind, posterUrl, sourceImageUrl: item.imageUrl, sourceVideoUrl: item.videoUrl };
      }),
    ),
    copyImage(deps.store, `meta-media/${lookup.adId}/avatar.jpg`, lookup.avatarUrl, META_MEDIA_AVATAR_WIDTH, deps.fetchImpl),
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

/**
 * Visuels d'un lot d'annonces : cache d'abord, puis recherche chez le
 * fournisseur dans la limite du budget, `concurrency` recherches de front.
 * Une annonce en échec est ignorée (elle s'affichera sans visuel) ; une clé
 * refusée ou des crédits épuisés interrompent le lot (`blocked`).
 */
export async function enrichAdsMedia(db: Database, adIds: readonly string[], deps: MediaEnrichmentDeps): Promise<MediaEnrichment> {
  const ids = [...new Set(adIds.filter(isAdId))];
  const result: MediaEnrichment = { mediaByAdId: {}, lookups: 0, blocked: false, unavailable: false };
  if (ids.length === 0) return result;
  let rows: (typeof metaAdMedia.$inferSelect)[];
  try {
    rows = await db.select().from(metaAdMedia).where(inArray(metaAdMedia.adId, ids));
  } catch (err) {
    if (!isMetaLibrarySchemaMissing(err)) throw err;
    console.warn("[meta-ads] table meta_ad_media absente — migration 0007 non appliquée ?");
    return { ...result, unavailable: true };
  }
  const pending: string[] = [];
  const retryMissingBefore = deps.now.getTime() - META_MEDIA_MISSING_RETRY_DAYS * 86_400_000;
  const byId = new Map(rows.map((row) => [row.adId, row]));
  for (const id of ids) {
    const row = byId.get(id);
    if (row && !deps.force) {
      if (row.media && cachedMediaUsable(row.media, deps.now)) {
        result.mediaByAdId[id] = row.media;
        continue;
      }
      if (row.status === "missing" && row.fetchedAt.getTime() > retryMissingBefore) continue;
    }
    pending.push(id);
  }
  const provider = deps.provider;
  if (!provider || pending.length === 0) return result;
  const queue = pending.slice(0, Math.max(0, Math.floor(deps.budget)));
  const worker = async () => {
    for (;;) {
      if (result.blocked) return;
      const id = queue.shift();
      if (id === undefined) return;
      try {
        result.lookups++;
        const lookup = await provider.lookup(id);
        const media = lookup ? await materializeMedia(lookup, { store: deps.store, now: deps.now, source: provider.mode, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) }) : null;
        const status = media === null ? "missing" : media.items.length > 0 ? "ok" : "empty";
        await db
          .insert(metaAdMedia)
          .values({ adId: id, status, media, provider: provider.mode, fetchedAt: deps.now, updatedAt: deps.now })
          .onConflictDoUpdate({ target: metaAdMedia.adId, set: { status, media, provider: provider.mode, fetchedAt: deps.now, updatedAt: deps.now } });
        if (media) result.mediaByAdId[id] = media;
      } catch (err) {
        if (isAdMediaBlocking(err)) {
          result.blocked = true;
          console.error("[meta-ads] visuels : fournisseur indisponible (clé refusée ou crédits épuisés) :", err instanceof Error ? err.message : err);
          return;
        }
        console.warn(`[meta-ads] visuels de l'annonce ${id} non obtenus :`, err instanceof Error ? err.message : err);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(deps.concurrency ?? META_MEDIA_CONCURRENCY, queue.length)) }, worker));
  return result;
}

/** Visuels en cache d'un lot d'annonces (lecture seule ; vide si la table manque). */
export async function loadMetaMedia(db: Database, adIds: readonly string[]): Promise<Record<string, MetaAdMedia>> {
  const ids = [...new Set(adIds.filter(isAdId))];
  if (ids.length === 0) return {};
  try {
    const rows = await db.select({ adId: metaAdMedia.adId, media: metaAdMedia.media }).from(metaAdMedia).where(inArray(metaAdMedia.adId, ids));
    const out: Record<string, MetaAdMedia> = {};
    for (const row of rows) if (row.media) out[row.adId] = row.media;
    return out;
  } catch (err) {
    if (!isMetaLibrarySchemaMissing(err)) throw err;
    return {};
  }
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

/** Annonces de la dernière veille aboutie du site, par identifiant. */
export async function currentMarketAds(db: DbExecutor, siteId: string): Promise<Map<string, MetaMarketAd>> {
  const [row] = await db
    .select({ market: metaAdsAnalyses.market })
    .from(metaAdsAnalyses)
    .where(and(eq(metaAdsAnalyses.siteId, siteId), eq(metaAdsAnalyses.status, "done")))
    .orderBy(desc(metaAdsAnalyses.createdAt))
    .limit(1);
  return new Map((row?.market?.ads ?? []).map((ad) => [ad.id, ad]));
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
  provider: AdMediaProvider | null;
  store: MetaMediaStore | null;
  now: Date;
  fetchImpl?: typeof fetch;
  /** Temps au plus pour les copies de vidéos (ms) */
  deadlineMs?: number;
};

/** Copie durable des vidéos d'un exemple, tant que le délai le permet ; les liens expirés sont rafraîchis (une recherche). */
async function durableMedia(db: Database, siteId: string, adId: string, media: MetaAdMedia | null, deps: KeepDeps, until: number): Promise<MetaAdMedia | null> {
  if (!media || !deps.store) return media;
  let current = media;
  const needsVideo = current.items.some((item) => item.kind === "video" && !item.videoUrl);
  const needsPoster = current.items.some((item) => item.posterUrl === null);
  if ((needsVideo || needsPoster) && metaMediaSourceExpired(current, deps.now) && deps.provider && (await mediaLookupsRemaining(db, siteId, deps.now)) > 0) {
    const fresh = await enrichAdsMedia(db, [adId], { provider: deps.provider, store: deps.store, now: deps.now, budget: 1, force: true, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
    await recordMediaUsage(db, siteId, fresh.lookups, deps.provider.mode, deps.now);
    current = fresh.mediaByAdId[adId] ?? current;
  }
  const expired = metaMediaSourceExpired(current, deps.now);
  const items: MetaAdMediaItem[] = [];
  for (const [index, item] of current.items.entries()) {
    let next = item;
    if (next.posterUrl === null && !expired) {
      const posterUrl = await copyImage(deps.store, `meta-media/${adId}/${index}.jpg`, next.sourceImageUrl, META_MEDIA_POSTER_WIDTH, deps.fetchImpl);
      if (posterUrl) next = { ...next, posterUrl };
    }
    if (next.kind === "video" && !next.videoUrl && !expired && Date.now() < until) {
      const file = await downloadMetaCdn(next.sourceVideoUrl, { accept: "video", maxBytes: META_LIBRARY_VIDEO_MAX_BYTES, timeoutMs: 60_000, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
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
 * veille du site (ou être déjà dans sa bibliothèque). L'annonce et son
 * analyse sont figées, ses visuels rendus durables (vidéos copiées dans la
 * limite du délai). Refus groupé si la bibliothèque dépasserait
 * META_LIBRARY_KEPT_MAX exemples.
 */
export async function keepMetaAds(db: Database, siteId: string, adIds: readonly string[], deps: KeepDeps): Promise<LibraryOutcome> {
  const ids = cleanIds(adIds);
  if (ids.length === 0) return { status: "skipped", reason: "empty" };
  try {
    const [market, existing] = await Promise.all([
      currentMarketAds(db, siteId),
      db.select({ adId: metaAdsLibrary.adId, status: metaAdsLibrary.status }).from(metaAdsLibrary).where(eq(metaAdsLibrary.siteId, siteId)),
    ]);
    const keptIds = new Set(existing.filter((row) => row.status === "kept").map((row) => row.adId));
    const fresh = ids.filter((id) => !keptIds.has(id));
    if (fresh.some((id) => !market.has(id))) return { status: "skipped", reason: "unknown_ad" };
    if (keptIds.size + fresh.length > META_LIBRARY_KEPT_MAX) return { status: "skipped", reason: "full" };
    const mediaByAdId = await loadMetaMedia(db, fresh);
    const until = Date.now() + (deps.deadlineMs ?? META_LIBRARY_COPY_DEADLINE_MS);
    for (const id of fresh) {
      const ad = market.get(id)!;
      const media = await durableMedia(db, siteId, id, mediaByAdId[id] ?? null, deps, until);
      await db
        .insert(metaAdsLibrary)
        .values({ siteId, adId: id, status: "kept", pageName: ad.pageName, ad, media, createdAt: deps.now, updatedAt: deps.now })
        .onConflictDoUpdate({ target: [metaAdsLibrary.siteId, metaAdsLibrary.adId], set: { status: "kept", pageName: ad.pageName, ad, media, createdAt: deps.now, updatedAt: deps.now } });
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
      currentMarketAds(db, siteId),
      db.select().from(metaAdsLibrary).where(and(eq(metaAdsLibrary.siteId, siteId), inArray(metaAdsLibrary.adId, ids))),
    ]);
    const known = new Map(existing.map((row) => [row.adId, row]));
    if (ids.some((id) => !market.has(id) && !known.has(id))) return { status: "skipped", reason: "unknown_ad" };
    const orphans: string[] = [];
    for (const id of ids) {
      const row = known.get(id);
      if (row?.status === "kept") orphans.push(...libraryVideoUrls(row.media));
      const pageName = market.get(id)?.pageName ?? row?.pageName ?? "";
      await db
        .insert(metaAdsLibrary)
        .values({ siteId, adId: id, status: "dismissed", pageName, ad: null, media: null, createdAt: deps.now, updatedAt: deps.now })
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

/** Identifiants des annonces supprimées par le site et exemples gardés (pour l'analyse suivante) ; vide si la table manque. */
export async function libraryForAnalysis(db: Database, siteId: string): Promise<{ dismissedIds: string[]; favorites: MetaMarketAd[] }> {
  const library = await loadMetaLibrary(db, siteId);
  return { dismissedIds: library.dismissedIds, favorites: library.kept.map((entry) => entry.ad).filter((ad): ad is MetaMarketAd => ad !== null) };
}

// ─── Lecture d'une vidéo ─────────────────────────────────────────────────────

export type VideoSource = { url: string; durable: boolean } | null;

/**
 * Adresse lisible de la vidéo d'une annonce du site : la copie durable d'un
 * exemple gardé, sinon le lien d'origine s'il vit encore, sinon un lien
 * rafraîchi chez le fournisseur (une recherche, dans la limite du quota).
 * null si l'annonce n'appartient ni à la veille ni à la bibliothèque du site,
 * ou si aucune vidéo n'est disponible.
 */
export async function metaAdVideoSource(
  db: Database,
  site: Pick<Site, "id">,
  adId: string,
  index: number,
  deps: { provider: AdMediaProvider | null; store: MetaMediaStore | null; now: Date; fetchImpl?: typeof fetch },
): Promise<VideoSource> {
  if (!isAdId(adId) || !Number.isInteger(index) || index < 0) return null;
  let kept: { media: MetaAdMedia | null } | undefined;
  try {
    [kept] = await db
      .select({ media: metaAdsLibrary.media })
      .from(metaAdsLibrary)
      .where(and(eq(metaAdsLibrary.siteId, site.id), eq(metaAdsLibrary.adId, adId), eq(metaAdsLibrary.status, "kept")))
      .limit(1);
  } catch (err) {
    if (!isMetaLibrarySchemaMissing(err)) throw err;
    return null;
  }
  const durable = kept?.media?.items[index]?.videoUrl;
  if (durable) return { url: durable, durable: true };
  if (!kept && !(await currentMarketAds(db, site.id)).has(adId)) return null;
  const cached = (await loadMetaMedia(db, [adId]))[adId] ?? kept?.media ?? null;
  const item = cached?.items[index];
  if (cached && item?.sourceVideoUrl && !metaMediaSourceExpired(cached, deps.now)) return { url: item.sourceVideoUrl, durable: false };
  if (!deps.provider || (await mediaLookupsRemaining(db, site.id, deps.now)) <= 0) return null;
  const fresh = await enrichAdsMedia(db, [adId], { provider: deps.provider, store: deps.store, now: deps.now, budget: 1, force: true, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
  await recordMediaUsage(db, site.id, fresh.lookups, deps.provider.mode, deps.now);
  const url = fresh.mediaByAdId[adId]?.items[index]?.sourceVideoUrl;
  return url ? { url, durable: false } : null;
}
