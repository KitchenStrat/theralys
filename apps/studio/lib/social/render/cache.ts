/**
 * Cache des rendus (§5.4) : clé = sha256 de la charge utile canonique
 * (`socialAssetKeyPayload`, packages/shared) tronquée à 20 caractères ;
 * lecture dans `post.assets.renders` (Blob) puis LRU mémoire (globalThis,
 * 40 entrées) ; écriture sur Vercel Blob quand `BLOB_READ_WRITE_TOKEN` est
 * présent, avec mise à jour de `assets` (≤ 12 entrées). Les URLs Blob ne
 * sortent jamais d'ici : le client passe toujours par `/api/social/*`.
 */

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, socialPosts } from "@theralys/db";
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
export const ASSETS_MAX_ENTRIES = 12;

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

export type CachedRenderInput = {
  post: RenderablePost & { id: string; siteId: string; assets: SocialPostAssets };
  ctx: RenderContext;
  size: SocialSize;
  slideIndex: number;
  preview: boolean;
  reviewRating?: number | null;
};

/** Clé des entrées `assets.renders` : `${size}:${slide}:${variant}`. */
export function assetSlot(size: SocialSize, slideIndex: number, preview: boolean): string {
  return `${size}:${slideIndex}:${preview ? "preview" : "full"}`;
}

export type RenderKeyInput = {
  post: RenderablePost;
  ctx: RenderContext;
  size: SocialSize;
  slideIndex: number;
  preview: boolean;
};

/** Clé de cache (sha256 tronquée) d'un rendu : change dès qu'un ingrédient visuel change. */
export function renderKey(input: RenderKeyInput): string {
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
    brand: ctx.brand,
    domain: ctx.domain,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 20);
}

/** Conserve les `max` rendus les plus récents. */
export function pruneRenders(renders: Record<string, SocialRender>, max = ASSETS_MAX_ENTRIES) {
  const entries = Object.entries(renders).sort(([, a], [, b]) =>
    b.renderedAt.localeCompare(a.renderedAt),
  );
  return Object.fromEntries(entries.slice(0, max));
}

async function fetchBlob(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/** Lecture-modification-écriture de `assets` (≤ 12 entrées, les plus anciennes purgées). */
async function recordRender(postId: string, slot: string, render: SocialRender): Promise<void> {
  const db = getDb();
  const current = await db.query.socialPosts.findFirst({
    where: eq(socialPosts.id, postId),
    columns: { assets: true },
  });
  if (!current) return;
  const renders = pruneRenders({ ...current.assets.renders, [slot]: render });
  await db
    .update(socialPosts)
    .set({ assets: { version: current.assets.version ?? 1, renders } })
    .where(eq(socialPosts.id, postId));
}

async function storeOnBlob(
  input: CachedRenderInput,
  key: string,
  data: Buffer,
): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { put } = await import("@vercel/blob");
    const blob = await put(`social/${input.post.siteId}/${input.post.id}/${key}.jpg`, data, {
      access: "public",
      contentType: "image/jpeg",
      addRandomSuffix: true,
    });
    await recordRender(input.post.id, assetSlot(input.size, input.slideIndex, input.preview), {
      key,
      url: blob.url,
      bytes: data.length,
      renderedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[social] cache Blob indisponible :", err);
  }
}

export type CachedRender = { data: Buffer; key: string; cached: "blob" | "memory" | false };

/**
 * Rendu d'une diapositive via le cache : `assets.renders` (Blob) → LRU
 * mémoire → rendu, puis mise en cache (mémoire, et Blob si configuré).
 */
export async function renderSlideCached(input: CachedRenderInput): Promise<CachedRender> {
  const key = renderKey(input);
  const slot = assetSlot(input.size, input.slideIndex, input.preview);

  const fromMemory = lruGet(key);
  if (fromMemory) return { data: fromMemory, key, cached: "memory" };

  const known = input.post.assets.renders[slot];
  if (known && known.key === key && known.url) {
    const data = await fetchBlob(known.url);
    if (data && data.length > 0) {
      lruSet(key, data);
      return { data, key, cached: "blob" };
    }
  }

  const rendered = await renderSlide({
    post: input.post,
    ctx: input.ctx,
    size: input.size,
    slideIndex: input.slideIndex,
    preview: input.preview,
    reviewRating: input.reviewRating ?? null,
  });
  lruSet(key, rendered.data);
  await storeOnBlob(input, key, rendered.data);
  return { data: rendered.data, key, cached: false };
}
