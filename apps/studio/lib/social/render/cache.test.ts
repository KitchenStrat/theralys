import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { SocialPostContent } from "@theralys/shared";
import { clearRenderCache, renderSlideCached, type CachedRenderInput } from "./cache";
import { SMOKE_SLIDES, smokeContext, smokePost } from "./fixtures";
import { clearImageCache } from "./images";

// Blob mocké : aucune écriture ne doit partir pour un rendu dégradé
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn() }));

const PEXELS = "https://images.pexels.com/photos/1/pexels-photo-1.jpeg";

function postWithPhoto(imageUrl: string): CachedRenderInput["post"] {
  const base = smokePost("photo-titre");
  const content: SocialPostContent = {
    ...base.content,
    slides: SMOKE_SLIDES["photo-titre"].map((s) => ({ ...s, imageUrl })),
  };
  return {
    ...base,
    content,
    id: "00000000-0000-0000-0000-000000000001",
    siteId: "00000000-0000-0000-0000-00000000000a",
    assets: { version: 1, renders: {} },
  };
}

async function fakeJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .jpeg()
    .toBuffer();
}

function lruSize(): number {
  return globalThis.__socialRenderCache?.size ?? 0;
}

const realFetch = globalThis.fetch;
const realToken = process.env.BLOB_READ_WRITE_TOKEN;

beforeEach(() => {
  clearRenderCache();
  clearImageCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = realToken;
  vi.clearAllMocks();
});

describe("renderSlideCached : rendu dégradé", () => {
  it("un échec transitoire de photo n'est mis en cache nulle part et la photo est retentée au rendu suivant", async () => {
    const blob = await import("@vercel/blob");
    process.env.BLOB_READ_WRITE_TOKEN = "jeton-de-test";
    const input: CachedRenderInput = {
      post: postWithPhoto(PEXELS),
      ctx: smokeContext("chaleureux"),
      size: "square",
      slideIndex: 0,
      preview: true,
      reviewRating: null,
    };

    // 1) Pexels ne répond pas (délai) : rendu de repli, marqué dégradé, rien d'écrit
    const timeout = vi.fn<typeof fetch>(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    globalThis.fetch = timeout;
    const first = await renderSlideCached(input);
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ cached: false, degraded: true });
    expect(lruSize()).toBe(0);
    expect(vi.mocked(blob.put)).not.toHaveBeenCalled();

    // 2) 5xx : même traitement
    globalThis.fetch = vi.fn<typeof fetch>(async () => new Response("oops", { status: 503 }));
    expect((await renderSlideCached(input)).degraded).toBe(true);
    expect(lruSize()).toBe(0);
    expect(vi.mocked(blob.put)).not.toHaveBeenCalled();

    // 3) Pexels répond : la photo est bien retentée, le rendu diffère et entre en cache
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const jpeg = await fakeJpeg();
    const ok = vi.fn<typeof fetch>(
      async () => new Response(new Uint8Array(jpeg), { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    globalThis.fetch = ok;
    const third = await renderSlideCached(input);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(third).toMatchObject({ cached: false, degraded: false });
    expect(third.data.equals(first.data)).toBe(false);
    expect(lruSize()).toBe(1);

    // 4) Servi depuis la mémoire, sans nouvelle requête
    ok.mockClear();
    expect((await renderSlideCached(input)).cached).toBe("memory");
    expect(ok).not.toHaveBeenCalled();
  });

  it("une URL refusée (hors liste blanche) est définitive : la variante sans photo est mise en cache sans requête", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error("ne doit pas être appelé");
    });
    globalThis.fetch = fetchMock;
    const input: CachedRenderInput = {
      post: postWithPhoto("https://example.com/photo.jpg"),
      ctx: smokeContext("chaleureux"),
      size: "square",
      slideIndex: 0,
      preview: true,
      reviewRating: null,
    };
    const first = await renderSlideCached(input);
    expect(first).toMatchObject({ cached: false, degraded: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lruSize()).toBe(1);
    expect((await renderSlideCached(input)).cached).toBe("memory");
  });
});

describe("tables de contenus (social_posts / google_posts)", () => {
  it("préfixe Blob par table, clé historique conservée pour le social", async () => {
    const { blobPathname, renderKey } = await import("./cache");
    expect(blobPathname("s", "p", "square:0:preview")).toBe("social/s/p/square-0-preview.jpg");
    expect(blobPathname("s", "p", "landscape:0:full", "google")).toBe("google/s/p/landscape-0-full.jpg");
    const base: CachedRenderInput = {
      post: postWithPhoto("https://example.com/photo.jpg"),
      ctx: smokeContext("chaleureux"),
      size: "landscape",
      slideIndex: 0,
      preview: false,
      reviewRating: null,
    };
    const social = renderKey(base);
    expect(renderKey({ ...base, post: { ...base.post, table: "social" } })).toBe(social);
    expect(renderKey({ ...base, post: { ...base.post, table: "google" } })).not.toBe(social);
  });

  it("créas Meta : slot et chemin Blob suffixés de la créa, clé distincte par créa et par table", async () => {
    const { assetSlot, blobPathname, renderKey } = await import("./cache");
    expect(assetSlot("square", 0, true)).toBe("square:0:preview");
    expect(assetSlot("story", 0, false, "c2")).toBe("story:0:full:c2");
    expect(blobPathname("s", "a", assetSlot("square", 0, false, "c1"), "meta")).toBe("meta/s/a/square-0-full-c1.jpg");
    const base: CachedRenderInput = {
      post: { ...postWithPhoto("https://example.com/photo.jpg"), table: "meta", variant: "c1" },
      ctx: smokeContext("chaleureux"),
      size: "square",
      slideIndex: 0,
      preview: false,
      reviewRating: null,
    };
    const c1 = renderKey(base);
    expect(renderKey({ ...base, post: { ...base.post, variant: "c2" } })).not.toBe(c1);
    expect(renderKey({ ...base, post: { ...base.post, table: "google" } })).not.toBe(c1);
    expect(renderKey({ ...base, post: { ...base.post, variant: "c1" } })).toBe(c1);
  });
});
