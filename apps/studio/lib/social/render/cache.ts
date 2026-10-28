/**
 * Cache des rendus (§5.4) : clé = sha256 de la charge utile canonique
 * (`socialAssetKeyPayload`, packages/shared — tout ce que le visuel affiche :
 * thème, accent, logo, diapositive, marque, domaine, note Google, adresse,
 * note de l'avis) tronquée à 20 caractères ; lecture dans `post.assets.renders`
 * (Blob) puis LRU mémoire (globalThis, 40 entrées) ; écriture sur Vercel Blob
 * quand `BLOB_READ_WRITE_TOKEN` est présent : un objet par slot au chemin
 * déterministe `<table>/<siteId>/<postId>/<slot>.jpg` (écrasé en place), mise à
 * jour atomique de `assets` en SQL (`jsonb_set`, ≤ 28 entrées), jamais sur un
 * contenu archivé, suppression best-effort des objets devenus orphelins. Un
 * rendu dégradé (photo ou logo demandé mais non chargé) n'est mis en cache
 * nulle part. Les URLs Blob ne sortent jamais d'ici : le client passe toujours
 * par `/api/social/*` ou `/api/google-posts/*`.
 *
 * Trois tables partagent ce cache : `social_posts` (défaut), `google_posts`
 * (posts Google, visuel 4:3) et `meta_ads_analyses` (créas Meta Ads : une
 * analyse porte plusieurs créas, le slot est alors suffixé de l'identifiant
 * de la créa, `variant`) — même colonne `assets`, même exclusion du statut
 * `archived`. `post.table` choisit la table du `jsonb_set` et le préfixe
 * Blob, et entre (avec `variant`) dans la clé des rendus hors social.
 */

import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, googlePosts, metaAdsAnalyses, socialPosts } from "@theralys/db";
import {
  SOCIAL_TEMPLATE_VERSION,
  socialAssetKeyPayload,
  themeCssVars,
  type SocialPostAssets,
  type SocialRender,
  type SocialSize,
  type SocialTemplate,
} from "@theralys/shared";
import { renderSlide, slideAt, type RenderContext, type RenderablePost } from "./render";
import { resolveSocialTheme } from "./theme";

export const RENDER_LRU_MAX = 40;

/** Table des contenus rendus : `social_posts` (défaut), `google_posts` ou `meta_ads_analyses`. */
export type PostTable = "social" | "google" | "meta";
const POST_TABLES = { social: socialPosts, google: googlePosts, meta: metaAdsAnalyses } as const;
/** 7 diapositives × 2 tailles × 2 variantes : un carrousel complet tient sans éviction. */
export const ASSETS_MAX_ENTRIES = 28;
/** Créas Meta : 5 créas × 3 tailles × 2 variantes tiennent sans éviction. */
export const META_ASSETS_MAX_ENTRIES = 30;
const ASSETS_MAX_BY_TABLE: Record<PostTable, number> = { social: ASSETS_MAX_ENTRIES, google: ASSETS_MAX_ENTRIES, meta: META_ASSETS_MAX_ENTRIES };

type LruEntry = { key: string; data: Buffer };

declare global {
  var __socialRenderCache: Map<string, LruEntry> | undefined;
}

function lru(): Map<string, LruEntry> {
  globalThis.__socialRenderCache ??= new Map();
  return globalThis.__socialRenderCache;
}

function lruGet(key: string): Buffer | undefined {
  const store = lru();
  const hit = store.get(key);
  if (!hit) return undefined;
  store.delete(key);
  store.set(key, hit);
  return hit.data;
}

function lruSet(key: string, data: Buffer): void {
  const store = lru();
  store.delete(key);
  store.set(key, { key, data });
  while (store.size > RENDER_LRU_MAX) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/** Vide le cache mémoire (tests). */
export function clearRenderCache(): void {
  lru().clear();
}

export type RenderKeyInput = {
  post: RenderablePost;
  ctx: RenderContext;
  size: SocialSize;
  slideIndex: number;
  preview: boolean;
  /** Note de l'avis cité (template « avis ») — chargée AVANT le calcul de la clé, qu'elle fait varier */
  reviewRating: number | null;
};

export type CachedRenderInput = RenderKeyInput & {
  post: RenderablePost & {
    id: string;
    siteId: string;
    assets: SocialPostAssets;
    table?: PostTable;
    /** Sous-contenu d'une même ligne (identifiant d'une créa Meta) : distingue slot, chemin Blob et clé */
    variant?: string;
  };
};

/** Clé des entrées `assets.renders` : `${size}:${slide}:${preview|full}`, suffixée `:${variant}` pour un sous-contenu. */
export function assetSlot(size: SocialSize, slideIndex: number, preview: boolean, variant?: string): string {
  const base = `${size}:${slideIndex}:${preview ? "preview" : "full"}`;
  return variant ? `${base}:${variant}` : base;
}

/** Chemin Blob d'un slot : déterministe, un seul objet par slot, écrasé en place ; préfixe = table. */
export function blobPathname(siteId: string, postId: string, slot: string, table: PostTable = "social"): string {
  return `${table}/${siteId}/${postId}/${slot.replace(/:/g, "-")}.jpg`;
}

/**
 * Clé de cache (sha256 tronquée) d'un rendu : change dès qu'un ingrédient
 * visuel change. Les rendus de `google_posts` et `meta_ads_analyses` portent
 * la table (et la variante) dans la clé ; ceux de `social_posts` gardent leur
 * clé historique (rendus Blob conservés).
 */
export function renderKey(input: RenderKeyInput & { post: { table?: PostTable; variant?: string } }): string {
  const { post, ctx, size, slideIndex, preview } = input;
  const theme = resolveSocialTheme(ctx.siteTheme, post.accentColor, post.content.accentRole);
  const payload = socialAssetKeyPayload({
    v: SOCIAL_TEMPLATE_VERSION,
    size,
    slideIndex,
    variant: preview ? "preview" : "full",
    template: post.template as SocialTemplate,
    accent: theme.accent,
    theme: themeCssVars(ctx.siteTheme),
    logo: ctx.siteTheme.logoUrl ?? null,
    slide: slideAt(post.content, slideIndex),
    total: post.content.slides.length,
    brand: ctx.brand,
    domain: ctx.domain,
    google: ctx.google,
    address: ctx.address,
    reviewRating: input.reviewRating,
  });
  const hash = createHash("sha256").update(payload);
  if (post.table && post.table !== "social") hash.update(`|${post.table}`);
  if (post.variant) hash.update(`|${post.variant}`);
  return hash.digest("hex").slice(0, 20);
}

/** Sépare les `max` rendus les plus récents (`kept`) des entrées à évincer (`evicted`). */
export function pruneRenders(
  renders: Record<string, SocialRender>,
  max = ASSETS_MAX_ENTRIES,
): { kept: Record<string, SocialRender>; evicted: Record<string, SocialRender> } {
  const entries = Object.entries(renders).sort(([, a], [, b]) =>
    b.renderedAt.localeCompare(a.renderedAt),
  );
  return { kept: Object.fromEntries(entries.slice(0, max)), evicted: Object.fromEntries(entries.slice(max)) };
}

/**
 * Lit un rendu Blob. Le chemin étant stable par slot, la clé est ajoutée en
 * paramètre de requête pour que le CDN ne resserve pas l'objet précédent après
 * un écrasement.
 */
async function fetchBlob(url: string, key: string): Promise<Buffer | null> {
  try {
    const target = new URL(url);
    target.searchParams.set("k", key);
    const response = await fetch(target, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

type RecordOutcome = { stored: boolean; evicted: SocialRender[] };

/**
 * Inscrit le rendu d'un slot dans `assets` en une seule instruction SQL
 * (`jsonb_set` : PostgreSQL relit la colonne sous verrou de ligne, deux rendus
 * concurrents ne s'écrasent plus), jamais sur un contenu archivé. Au-delà de
 * `ASSETS_MAX_ENTRIES`, les entrées les plus anciennes sont retirées, chacune
 * à condition d'être encore celle observée.
 */
async function recordRender(
  table: PostTable,
  postId: string,
  slot: string,
  render: SocialRender,
): Promise<RecordOutcome> {
  const db = getDb();
  const posts = POST_TABLES[table];
  const [row] = await db
    .update(posts)
    .set({
      assets: sql`jsonb_set(
        jsonb_build_object(
          'version', coalesce(${posts.assets} -> 'version', '1'::jsonb),
          'renders', coalesce(${posts.assets} -> 'renders', '{}'::jsonb)
        ),
        array['renders'::text, ${slot}::text],
        ${JSON.stringify(render)}::jsonb,
        true
      )`,
    })
    .where(and(eq(posts.id, postId), sql`${posts.status} <> 'archived'`))
    .returning({ assets: posts.assets });
  if (!row) return { stored: false, evicted: [] };

  const { evicted } = pruneRenders(row.assets.renders, ASSETS_MAX_BY_TABLE[table]);
  for (const [evictedSlot, entry] of Object.entries(evicted)) {
    await db
      .update(posts)
      .set({ assets: sql`${posts.assets} #- array['renders'::text, ${evictedSlot}::text]` })
      .where(
        and(
          eq(posts.id, postId),
          sql`${posts.assets} -> 'renders' -> ${evictedSlot}::text ->> 'key' = ${entry.key}`,
        ),
      );
  }
  return { stored: true, evicted: Object.values(evicted) };
}

async function storeOnBlob(input: CachedRenderInput, key: string, slot: string, data: Buffer): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  const table = input.post.table ?? "social";
  try {
    const { put, del } = await import("@vercel/blob");
    const blob = await put(blobPathname(input.post.siteId, input.post.id, slot, table), data, {
      access: "public",
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    const outcome = await recordRender(table, input.post.id, slot, {
      key,
      url: blob.url,
      bytes: data.length,
      renderedAt: new Date().toISOString(),
    });
    // Objets que plus rien ne référence : rendu d'un contenu archivé entre-temps,
    // entrées évincées, ancienne URL du slot (suffixe aléatoire d'avant) — jamais
    // l'objet du slot courant, qui est désormais écrasé en place.
    const previous = input.post.assets.renders[slot]?.url;
    const orphans = outcome.stored
      ? [...outcome.evicted.map((entry) => entry.url), previous].filter(
          (url): url is string => typeof url === "string" && url !== "" && url !== blob.url,
        )
      : [blob.url];
    if (orphans.length > 0) {
      await del([...new Set(orphans)]).catch((err: unknown) =>
        console.warn("[social] suppression des rendus Blob orphelins impossible :", err),
      );
    }
  } catch (err) {
    console.warn("[social] cache Blob indisponible :", err);
  }
}

export type CachedRender = {
  data: Buffer;
  key: string;
  cached: "blob" | "memory" | false;
  /** Rendu de repli après un échec transitoire d'image : non mis en cache, à servir sans ETag ni cache navigateur */
  degraded: boolean;
};

/**
 * Rendu d'une diapositive via le cache : `assets.renders` (Blob) → LRU
 * mémoire → rendu, puis mise en cache (mémoire, et Blob si configuré) sauf
 * si le rendu est dégradé.
 */
export async function renderSlideCached(input: CachedRenderInput): Promise<CachedRender> {
  const key = renderKey(input);
  const slot = assetSlot(input.size, input.slideIndex, input.preview, input.post.variant);

  const fromMemory = lruGet(key);
  if (fromMemory) return { data: fromMemory, key, cached: "memory", degraded: false };

  const known = input.post.assets.renders[slot];
  if (known && known.key === key && known.url) {
    const data = await fetchBlob(known.url, key);
    if (data && data.length > 0) {
      lruSet(key, data);
      return { data, key, cached: "blob", degraded: false };
    }
  }

  const rendered = await renderSlide({
    post: input.post,
    ctx: input.ctx,
    size: input.size,
    slideIndex: input.slideIndex,
    preview: input.preview,
    reviewRating: input.reviewRating,
  });
  if (rendered.degraded) return { data: rendered.data, key, cached: false, degraded: true };
  lruSet(key, rendered.data);
  await storeOnBlob(input, key, slot, rendered.data);
  return { data: rendered.data, key, cached: false, degraded: false };
}
