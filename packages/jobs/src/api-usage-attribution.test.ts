import { afterEach, describe, expect, it, vi } from "vitest";
import { SCRAPECREATORS_CREDIT_USD, type MetaAdMedia, type MetaMarketAd } from "@theralys/shared";
import { currentApiUsageContext, setApiUsageSink, setApiUsageSinkFactory, withApiUsage, type ApiUsageContext, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { googleUsage, metaAdMedia, metaAdsAnalyses, metaAdsLibrary, type Database } from "@theralys/db";
import { ScrapeCreatorsMediaProvider, type AdMediaLookup, type AdMediaProvider } from "@theralys/providers/meta/media";
import { enrichSiteAdsMedia, metaAdVideoSource } from "./meta-library";

const NOW = new Date("2026-10-26T06:00:00Z");
const FRESH = new Date("2026-11-20T00:00:00Z");
const EXPIRED = new Date("2026-10-20T00:00:00Z");
/** Dernière tentative assez ancienne pour qu'un rafraîchissement reparte. */
const LONG_AGO = new Date("2026-10-25T00:00:00Z");
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SITE_ID = "99999999-9999-4999-8999-999999999999";
const AD = "700000000000001";
const KEY = "sc-cle-secrete-0123456789";

const oe = (expires: Date) => Math.floor(expires.getTime() / 1000).toString(16).toUpperCase();
const cdnImage = (name: string, expires: Date = FRESH) => `https://scontent-cdg4-2.xx.fbcdn.net/v/t39.35426-6/${name}.jpg?oe=${oe(expires)}`;
const cdnVideo = (name: string, expires: Date = FRESH) => `https://video-cdg4-1.xx.fbcdn.net/v/t42.1790-2/${name}.mp4?oe=${oe(expires)}`;

function videoLookup(adId: string): AdMediaLookup {
  return {
    adId,
    format: "video",
    variants: false,
    items: [{ kind: "video", imageUrl: cdnImage(`${adId}-affiche`), videoUrl: cdnVideo(`${adId}-0`) }],
    avatarUrl: cdnImage(`${adId}-avatar`),
    ctaText: "En savoir plus",
    linkUrl: "https://cabinet-martin.fr/rendez-vous",
    pageCategories: ["Osteopathic Doctor"],
    pageLikes: 412,
    expiresAt: FRESH.toISOString(),
  };
}

/** Vidéo en cache dont les liens d'origine ont expiré (affiche copiée, pas de copie durable de la vidéo). */
function expiredVideoMedia(adId: string): MetaAdMedia {
  return {
    version: 1,
    format: "video",
    variants: false,
    items: [{ kind: "video", posterUrl: `https://blob.test/meta-media/${adId}/0.jpg`, sourceImageUrl: cdnImage(`${adId}-affiche`, EXPIRED), sourceVideoUrl: cdnVideo(`${adId}-0`, EXPIRED) }],
    avatarUrl: `https://blob.test/meta-media/${adId}/avatar.jpg`,
    ctaText: "En savoir plus",
    linkUrl: "https://cabinet-martin.fr/rendez-vous",
    pageCategories: ["Osteopathic Doctor"],
    pageLikes: 412,
    sourceExpiresAt: EXPIRED.toISOString(),
    fetchedAt: LONG_AGO.toISOString(),
    source: "scrapecreators",
  };
}

// ─── Base simulée ────────────────────────────────────────────────────────────

type DbOp = "select" | "insert" | "update" | "delete";

/**
 * Base minimale : toute chaîne drizzle (`select().from(t).where(…).limit(1)`,
 * `insert(t).values(…).returning()`…) se résout avec les lignes que le test
 * associe à l'opération et à la table ; les conditions ne sont pas évaluées.
 */
function fakeDb(rowsFor: (op: DbOp, table: unknown) => unknown[]) {
  const log: { op: DbOp; table: unknown }[] = [];
  const chain = (op: DbOp, initial?: unknown): unknown => {
    let table = initial;
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") {
            return (resolve: (rows: unknown[]) => unknown, reject: (err: unknown) => unknown) => {
              log.push({ op, table });
              return Promise.resolve()
                .then(() => rowsFor(op, table))
                .then(resolve, reject);
            };
          }
          return (...args: unknown[]) => {
            if (property === "from") table = args[0];
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  const db = {
    select: () => chain("select"),
    insert: (table: unknown) => chain("insert", table),
    update: (table: unknown) => chain("update", table),
    delete: (table: unknown) => chain("delete", table),
    execute: async () => [],
    transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> => run(db),
  };
  return { db: db as unknown as Database, log };
}

/** Lignes d'un site sans réservation en cours : quota mensuel intact, réservation accordée. */
function rows(overrides: { media?: unknown[]; analyses?: unknown[] } = {}) {
  return (op: DbOp, table: unknown): unknown[] => {
    if (table === googleUsage) return op === "select" ? [{ total: "0" }] : op === "insert" ? [{ id: "reservation-1" }] : [];
    if (op !== "select") return [];
    if (table === metaAdMedia) return overrides.media ?? [];
    if (table === metaAdsAnalyses) return overrides.analyses ?? [];
    if (table === metaAdsLibrary) return [];
    return [];
  };
}

/** Fournisseur de visuels simulé : garde le contexte dans lequel chaque recherche s'exécute. */
function probeProvider() {
  const seen: { adId: string; context: ApiUsageContext }[] = [];
  const provider: AdMediaProvider = {
    mode: "scrapecreators",
    lookup: async (adId) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.push({ adId, context: currentApiUsageContext() });
      return videoLookup(adId);
    },
  };
  return { provider, seen };
}

function capture(): ResolvedApiUsageEvent[] {
  const events: ResolvedApiUsageEvent[] = [];
  setApiUsageSink(async (event) => {
    events.push(event);
  });
  return events;
}

/** Veille aboutie du site qui contient l'annonce, et sa vidéo en cache aux liens expirés. */
function expiredVideoRows() {
  return rows({
    media: [{ adId: AD, status: "ok", media: expiredVideoMedia(AD), provider: "scrapecreators", fetchedAt: LONG_AGO, updatedAt: LONG_AGO }],
    analyses: [{ market: { ads: [{ id: AD } as MetaMarketAd], filtered: { formation: 0, commerce: 0, autre: 0 } }, seed: { profession: "Sophrologue" }, provider: "meta" }],
  });
}

// `@theralys/db` pose la fabrique du puits à son chargement : puits et fabrique sont retirés après chaque test.
afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  vi.restoreAllMocks();
});

describe("enrichSiteAdsMedia — rattachement des appels API", () => {
  it("les recherches de visuels s'exécutent dans { feature: \"meta_ads\", siteId }", async () => {
    const { db, log } = fakeDb(rows());
    const { provider, seen } = probeProvider();
    const result = await enrichSiteAdsMedia(db, SITE_ID, [AD, "700000000000002"], { provider, store: null, now: NOW });
    expect(result).toMatchObject({ lookups: 2, blocked: false, unavailable: false, busy: false, overQuota: 0 });
    expect(seen.map((entry) => entry.adId).sort()).toEqual([AD, "700000000000002"]);
    for (const entry of seen) expect(entry.context).toEqual({ feature: "meta_ads", siteId: SITE_ID });
    // La réservation du quota a bien précédé les recherches, et rien ne déborde après l'appel
    expect(log.some((entry) => entry.op === "insert" && entry.table === googleUsage)).toBe(true);
    expect(currentApiUsageContext()).toEqual({});
  });

  it("appelée depuis un autre contexte : la fonctionnalité et le site de l'appel l'emportent, puis le contexte d'origine revient", async () => {
    const { db } = fakeDb(rows());
    const { provider, seen } = probeProvider();
    await withApiUsage({ feature: "blog", siteId: OTHER_SITE_ID }, async () => {
      await enrichSiteAdsMedia(db, SITE_ID, [AD], { provider, store: null, now: NOW });
      expect(currentApiUsageContext()).toEqual({ feature: "blog", siteId: OTHER_SITE_ID });
    });
    expect(seen.map((entry) => entry.context)).toEqual([{ feature: "meta_ads", siteId: SITE_ID }]);
  });

  it("deux sites enrichis en même temps : chaque recherche porte le site de son lot", async () => {
    const first = probeProvider();
    const second = probeProvider();
    await Promise.all([
      enrichSiteAdsMedia(fakeDb(rows()).db, SITE_ID, [AD, "700000000000002", "700000000000003"], { provider: first.provider, store: null, now: NOW }),
      enrichSiteAdsMedia(fakeDb(rows()).db, OTHER_SITE_ID, ["700000000000004", "700000000000005"], { provider: second.provider, store: null, now: NOW }),
    ]);
    expect(first.seen).toHaveLength(3);
    expect(second.seen).toHaveLength(2);
    for (const entry of first.seen) expect(entry.context).toEqual({ feature: "meta_ads", siteId: SITE_ID });
    for (const entry of second.seen) expect(entry.context).toEqual({ feature: "meta_ads", siteId: OTHER_SITE_ID });
  });

  it("fournisseur réel : l'événement inscrit au registre porte la fonctionnalité, le site et le crédit", async () => {
    const events = capture();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, credits_remaining: 4821, snapshot: { display_format: "IMAGE", images: [{ original_image_url: cdnImage(`${AD}-0`) }] } }), { status: 200 })) as unknown as typeof fetch;
    const provider = new ScrapeCreatorsMediaProvider(KEY, fetchImpl, { retryDelayMs: 0 });
    const result = await enrichSiteAdsMedia(fakeDb(rows()).db, SITE_ID, [AD], { provider, store: null, now: NOW });
    expect(result.lookups).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "scrapecreators", operation: "ad_library_ad", feature: "meta_ads", siteId: SITE_ID, status: "ok", units: 1, costUsd: SCRAPECREATORS_CREDIT_USD, meta: { found: true, creditsRemaining: 4821 } });
  });
});

describe("metaAdVideoSource — rattachement des appels API", () => {
  it("lien de vidéo expiré : le rafraîchissement chez le fournisseur s'exécute dans { feature: \"meta_ads\", siteId }", async () => {
    const { db } = fakeDb(expiredVideoRows());
    const { provider, seen } = probeProvider();
    const source = await metaAdVideoSource(db, { id: SITE_ID }, AD, 0, { store: null, now: NOW, provider });
    expect(source).toEqual({ url: cdnVideo(`${AD}-0`), durable: false });
    expect(seen).toEqual([{ adId: AD, context: { feature: "meta_ads", siteId: SITE_ID } }]);
    expect(currentApiUsageContext()).toEqual({});
  });

  it("appelée depuis un autre contexte (lecture depuis une autre fonctionnalité) : rattachée au site de la vidéo", async () => {
    const { db } = fakeDb(expiredVideoRows());
    const { provider, seen } = probeProvider();
    await withApiUsage({ feature: "social", siteId: OTHER_SITE_ID }, () => metaAdVideoSource(db, { id: SITE_ID }, AD, 0, { store: null, now: NOW, provider }));
    expect(seen.map((entry) => entry.context)).toEqual([{ feature: "meta_ads", siteId: SITE_ID }]);
  });

  it("fournisseur réel : la recherche de rafraîchissement est inscrite au registre avec la fonctionnalité et le site", async () => {
    const events = capture();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, credits_remaining: 12, snapshot: { display_format: "VIDEO", videos: [{ video_sd_url: cdnVideo(`${AD}-0`), video_preview_image_url: cdnImage(`${AD}-affiche`) }] } }), { status: 200 }),
    ) as unknown as typeof fetch;
    const provider = new ScrapeCreatorsMediaProvider(KEY, fetchImpl, { retryDelayMs: 0 });
    const source = await metaAdVideoSource(fakeDb(expiredVideoRows()).db, { id: SITE_ID }, AD, 0, { store: null, now: NOW, provider });
    expect(source).toEqual({ url: cdnVideo(`${AD}-0`), durable: false });
    expect(events.map((event) => [event.provider, event.operation, event.feature, event.siteId, event.status, event.units])).toEqual([["scrapecreators", "ad_library_ad", "meta_ads", SITE_ID, "ok", 1]]);
  });

  it("vidéo encore servie (lien non expiré) : aucune recherche, rien n'est inscrit", async () => {
    const events = capture();
    const { provider, seen } = probeProvider();
    const media: MetaAdMedia = { ...expiredVideoMedia(AD), sourceExpiresAt: FRESH.toISOString(), items: [{ kind: "video", posterUrl: null, sourceImageUrl: null, sourceVideoUrl: cdnVideo(`${AD}-0`) }] };
    const { db } = fakeDb(rows({ media: [{ adId: AD, status: "ok", media, provider: "scrapecreators", fetchedAt: NOW, updatedAt: NOW }], analyses: [{ market: { ads: [{ id: AD } as MetaMarketAd], filtered: { formation: 0, commerce: 0, autre: 0 } }, seed: { profession: "Sophrologue" }, provider: "meta" }] }));
    await expect(metaAdVideoSource(db, { id: SITE_ID }, AD, 0, { store: null, now: NOW, provider })).resolves.toEqual({ url: cdnVideo(`${AD}-0`), durable: false });
    expect(seen).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});
