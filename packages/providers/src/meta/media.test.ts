import { describe, expect, it, vi } from "vitest";
import { META_MEDIA_ITEMS_MAX } from "@theralys/shared";
import {
  AD_MEDIA_RETRY_DELAY_MS,
  AD_MEDIA_TIMEOUT_MS,
  AdMediaError,
  MockAdMediaProvider,
  SCRAPECREATORS_AD_PATH,
  SCRAPECREATORS_BASE,
  ScrapeCreatorsMediaProvider,
  adMediaFromScrapeCreators,
  createAdMediaProvider,
  isAdMediaBlocking,
  mockPosterDataUrl,
} from "./media";

const KEY = "sc-cle-secrete-0123456789abcdef";
const AD_ID = "1234567890123456";

// Paramètre `oe` (secondes Unix en hexadécimal) et l'instant correspondant
const OE = {
  early: { hex: "6AF00000", iso: "2026-11-08T04:52:16.000Z" },
  video: { hex: "6AF8F000", iso: "2026-11-14T23:34:24.000Z" },
  image: { hex: "6AF90589", iso: "2026-11-15T01:06:17.000Z" },
  late: { hex: "6B000000", iso: "2026-11-20T08:08:32.000Z" },
} as const;

const image = (name: string, oe: string = OE.image.hex) =>
  `https://scontent-cdg4-2.xx.fbcdn.net/v/t39.35426-6/${name}.jpg?stp=dst-jpg_s600x600_tt6&_nc_cat=104&ccb=1-7&_nc_sid=c53f8f&oh=00_AfX3&oe=${oe}`;
const video = (name: string, oe: string = OE.video.hex) => `https://video-cdg4-1.xx.fbcdn.net/v/t42.1790-2/${name}.mp4?_nc_cat=110&ccb=1-7&_nc_sid=c53f8f&oh=00_AfY7&oe=${oe}`;

/** Bloc `snapshot` tel que le renvoie l'API (champs utiles et quelques champs ignorés). */
function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    page_id: "100063512345678",
    page_name: "Cabinet Martin — Ostéopathe",
    page_profile_uri: "https://www.facebook.com/cabinetmartin",
    page_profile_picture_url: image("avatar_60x60", OE.late.hex),
    page_categories: ["Osteopathic Doctor"],
    page_like_count: 412,
    cta_text: "Book now",
    cta_type: "BOOK_TRAVEL",
    link_url: "https://cabinet-martin.fr/rendez-vous?utm_source=meta",
    caption: "cabinet-martin.fr",
    display_format: "IMAGE",
    body: { text: "Mal de dos ? Le cabinet vous reçoit du lundi au samedi." },
    images: [],
    videos: [],
    cards: [],
    ...overrides,
  };
}

/** Réponse de `GET /v1/facebook/adLibrary/ad`. */
function payload(snap: Record<string, unknown> | null = snapshot(), overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { success: true, credits_remaining: 4821, ad_archive_id: AD_ID, is_active: true, ...(snap ? { snapshot: snap } : {}), ...overrides };
}

type Call = { url: string; method: string; headers: Record<string, string>; signal: AbortSignal | null };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = { url: String(input), method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()), signal: init?.signal ?? null };
    calls.push(call);
    return respond(call, calls.length - 1);
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

function provider(fetchImpl: typeof fetch, options: { timeoutMs?: number } = {}) {
  return new ScrapeCreatorsMediaProvider(KEY, fetchImpl, { retryDelayMs: 0, timeoutMs: 5_000, ...options });
}

async function failure(run: Promise<unknown>): Promise<AdMediaError> {
  const err = await run.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AdMediaError);
  return err as AdMediaError;
}

describe("adMediaFromScrapeCreators", () => {
  it("IMAGE : format image, un seul visuel, image d'origine préférée à l'image réduite, page et bouton repris", () => {
    const media = adMediaFromScrapeCreators(payload(snapshot({ images: [{ original_image_url: image("origine"), resized_image_url: image("reduite"), watermarked_resized_image_url: "" }] })), AD_ID);
    expect(media).toEqual({
      adId: AD_ID,
      format: "image",
      variants: false,
      items: [{ kind: "image", imageUrl: image("origine"), videoUrl: null }],
      avatarUrl: image("avatar_60x60", OE.late.hex),
      ctaText: "Book now",
      linkUrl: "https://cabinet-martin.fr/rendez-vous?utm_source=meta",
      pageCategories: ["Osteopathic Doctor"],
      pageLikes: 412,
      expiresAt: OE.image.iso,
    });
    // Sans image d'origine : l'image réduite
    const resized = adMediaFromScrapeCreators(payload(snapshot({ images: [{ original_image_url: null, resized_image_url: image("reduite") }] })), AD_ID);
    expect(resized!.items).toEqual([{ kind: "image", imageUrl: image("reduite"), videoUrl: null }]);
  });

  it("VIDEO : format vidéo avec son affiche, lien SD préféré au lien HD (HD à défaut de SD)", () => {
    const media = adMediaFromScrapeCreators(
      payload(snapshot({ display_format: "VIDEO", videos: [{ video_hd_url: video("hd"), video_sd_url: video("sd"), video_preview_image_url: image("affiche"), watermarked_video_sd_url: "" }] })),
      AD_ID,
    );
    expect(media).toMatchObject({ format: "video", variants: false });
    expect(media!.items).toEqual([{ kind: "video", imageUrl: image("affiche"), videoUrl: video("sd") }]);
    const hdOnly = adMediaFromScrapeCreators(payload(snapshot({ display_format: "VIDEO", videos: [{ video_hd_url: video("hd"), video_sd_url: null, video_preview_image_url: null }] })), AD_ID);
    expect(hdOnly!.items).toEqual([{ kind: "video", imageUrl: null, videoUrl: video("hd") }]);
    // Une vidéo sans lien lisible n'est pas un visuel
    const none = adMediaFromScrapeCreators(payload(snapshot({ display_format: "VIDEO", videos: [{ video_hd_url: null, video_sd_url: "", video_preview_image_url: image("affiche") }] })), AD_ID);
    expect(none!.items).toEqual([]);
  });

  it("DCO à 4 cartes vidéo : format vidéo, déclinaisons (variants: true)", () => {
    const cards = [1, 2, 3, 4].map((n) => ({ title: `Déclinaison ${n}`, body: "Texte", original_image_url: null, video_hd_url: video(`dco-hd-${n}`), video_sd_url: video(`dco-sd-${n}`), video_preview_image_url: image(`dco-${n}`) }));
    const media = adMediaFromScrapeCreators(payload(snapshot({ display_format: "DCO", cards })), AD_ID);
    expect(media).toMatchObject({ format: "video", variants: true });
    expect(media!.items).toEqual([1, 2, 3, 4].map((n) => ({ kind: "video", imageUrl: image(`dco-${n}`), videoUrl: video(`dco-sd-${n}`) })));
    // Une seule carte : rien à décliner
    const single = adMediaFromScrapeCreators(payload(snapshot({ display_format: "DCO", cards: cards.slice(0, 1) })), AD_ID);
    expect(single).toMatchObject({ format: "video", variants: false });
    expect(single!.items).toHaveLength(1);
  });

  it("CAROUSEL à 3 cartes image : format carrousel, sans déclinaisons", () => {
    const cards = [1, 2, 3].map((n) => ({ title: `Diapositive ${n}`, link_url: "https://cabinet-martin.fr", original_image_url: image(`diapo-${n}`), resized_image_url: image(`diapo-${n}-r`), video_sd_url: null, video_preview_image_url: null }));
    const media = adMediaFromScrapeCreators(payload(snapshot({ display_format: "CAROUSEL", cards })), AD_ID);
    expect(media).toMatchObject({ format: "carousel", variants: false });
    expect(media!.items).toEqual([1, 2, 3].map((n) => ({ kind: "image", imageUrl: image(`diapo-${n}`), videoUrl: null })));
  });

  it("vidéos et images propres d'abord (vidéos en tête), les cartes seulement à défaut", () => {
    const media = adMediaFromScrapeCreators(
      payload(
        snapshot({
          display_format: "VIDEO",
          images: [{ original_image_url: image("propre") }],
          videos: [{ video_sd_url: video("propre"), video_preview_image_url: image("affiche") }],
          cards: [{ original_image_url: image("carte-1") }, { original_image_url: image("carte-2") }],
        }),
      ),
      AD_ID,
    );
    expect(media!.items.map((item) => item.videoUrl ?? item.imageUrl)).toEqual([video("propre"), image("propre")]);
  });

  it("TEXT (aucun visuel) : items vide, sans déclinaisons", () => {
    const media = adMediaFromScrapeCreators(payload(snapshot({ display_format: "TEXT", page_profile_picture_url: null })), AD_ID);
    expect(media).not.toBeNull();
    expect(media).toMatchObject({ adId: AD_ID, items: [], variants: false, avatarUrl: null, expiresAt: null });
    // Champs de médias absents ou d'un autre type : même résultat, sans erreur
    const odd = adMediaFromScrapeCreators(payload({ display_format: 7, images: "x", videos: null, cards: [null, "y", 3], page_categories: "Santé" }), AD_ID);
    expect(odd).toMatchObject({ items: [], pageCategories: [], ctaText: null, linkUrl: null, pageLikes: null });
  });

  it(`au plus META_MEDIA_ITEMS_MAX (${META_MEDIA_ITEMS_MAX}) visuels, dans l'ordre de l'annonce`, () => {
    const cards = Array.from({ length: META_MEDIA_ITEMS_MAX + 3 }, (_, n) => ({ original_image_url: image(`carte-${n}`) }));
    const media = adMediaFromScrapeCreators(payload(snapshot({ display_format: "CAROUSEL", cards })), AD_ID);
    expect(media!.items).toHaveLength(META_MEDIA_ITEMS_MAX);
    expect(media!.items.map((item) => item.imageUrl)).toEqual(cards.slice(0, META_MEDIA_ITEMS_MAX).map((card) => card.original_image_url));
    const images = Array.from({ length: META_MEDIA_ITEMS_MAX + 2 }, (_, n) => ({ original_image_url: image(`image-${n}`) }));
    expect(adMediaFromScrapeCreators(payload(snapshot({ images })), AD_ID)!.items).toHaveLength(META_MEDIA_ITEMS_MAX);
  });

  it("liens hors du CDN de Meta, en http ou démesurés : écartés (image, vidéo, affiche, avatar)", () => {
    const media = adMediaFromScrapeCreators(
      payload(
        snapshot({
          page_profile_picture_url: "https://cdn.exemple.fr/avatar.jpg",
          images: [
            { original_image_url: image("https-meta").replace("https://", "http://") },
            { original_image_url: "https://cdn.exemple.fr/visuel.jpg", resized_image_url: "https://scontent.xx.fbcdn.net.exemple.fr/visuel.jpg" },
            { original_image_url: "https://faux-fbcdn.net/visuel.jpg" },
            { original_image_url: `${image("long")}&x=${"a".repeat(2_000)}` },
            { original_image_url: "pas une adresse", resized_image_url: image("repli") },
            { original_image_url: "https://scontent-cdg4-1.cdninstagram.com/v/t51.2885-15/insta.jpg?oe=6AF90589" },
          ],
        }),
      ),
      AD_ID,
    );
    expect(media!.avatarUrl).toBeNull();
    expect(media!.items).toEqual([
      { kind: "image", imageUrl: image("repli"), videoUrl: null },
      { kind: "image", imageUrl: "https://scontent-cdg4-1.cdninstagram.com/v/t51.2885-15/insta.jpg?oe=6AF90589", videoUrl: null },
    ]);
    const clip = adMediaFromScrapeCreators(
      payload(
        snapshot({
          display_format: "VIDEO",
          videos: [
            { video_sd_url: "https://videos.exemple.fr/clip.mp4", video_hd_url: video("hd"), video_preview_image_url: "http://scontent.xx.fbcdn.net/affiche.jpg" },
            { video_sd_url: video("http").replace("https://", "http://"), video_hd_url: null, video_preview_image_url: image("affiche") },
          ],
        }),
      ),
      AD_ID,
    );
    // Lien SD étranger : le HD du CDN prend le relais ; affiche en http écartée ; vidéo sans lien valable écartée
    expect(clip!.items).toEqual([{ kind: "video", imageUrl: null, videoUrl: video("hd") }]);
  });

  it("link_url : gardé pour http(s) seulement, borné à 500 caractères", () => {
    const link = (value: unknown) => adMediaFromScrapeCreators(payload(snapshot({ link_url: value })), AD_ID)!.linkUrl;
    expect(link("https://cabinet-martin.fr/rendez-vous")).toBe("https://cabinet-martin.fr/rendez-vous");
    expect(link("http://cabinet-martin.fr")).toBe("http://cabinet-martin.fr/");
    expect(link("javascript:alert(1)")).toBeNull();
    expect(link("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(link("fb://page/123")).toBeNull();
    expect(link("cabinet-martin.fr")).toBeNull();
    expect(link(`https://cabinet-martin.fr/?q=${"a".repeat(500)}`)).toBeNull();
    expect(link(null)).toBeNull();
    expect(link(42)).toBeNull();
  });

  it("expiresAt : la première expiration (paramètre oe) parmi l'avatar, les images et les vidéos ; null sans oe", () => {
    const withVideo = adMediaFromScrapeCreators(
      payload(snapshot({ display_format: "VIDEO", videos: [{ video_sd_url: video("sd", OE.video.hex), video_preview_image_url: image("affiche", OE.image.hex) }] })),
      AD_ID,
    );
    expect(withVideo!.expiresAt).toBe(OE.video.iso);
    // L'avatar compte aussi
    const avatarFirst = adMediaFromScrapeCreators(payload(snapshot({ page_profile_picture_url: image("avatar", OE.early.hex), images: [{ original_image_url: image("origine", OE.late.hex) }] })), AD_ID);
    expect(avatarFirst!.expiresAt).toBe(OE.early.iso);
    // Un lien écarté (hors CDN) ne compte pas
    const dropped = adMediaFromScrapeCreators(
      payload(snapshot({ page_profile_picture_url: null, images: [{ original_image_url: `https://cdn.exemple.fr/a.jpg?oe=${OE.early.hex}` }, { original_image_url: image("origine", OE.late.hex) }] })),
      AD_ID,
    );
    expect(dropped!.expiresAt).toBe(OE.late.iso);
    const noExpiry = adMediaFromScrapeCreators(payload(snapshot({ page_profile_picture_url: null, images: [{ original_image_url: "https://scontent.xx.fbcdn.net/v/sans-expiration.jpg" }] })), AD_ID);
    expect(noExpiry!.items).toHaveLength(1);
    expect(noExpiry!.expiresAt).toBeNull();
  });

  it("sans bloc snapshot (ou réponse qui n'est pas un objet) → null", () => {
    expect(adMediaFromScrapeCreators(payload(null), AD_ID)).toBeNull();
    expect(adMediaFromScrapeCreators({ success: true, snapshot: [] }, AD_ID)).toBeNull();
    expect(adMediaFromScrapeCreators({ success: true, snapshot: "x" }, AD_ID)).toBeNull();
    expect(adMediaFromScrapeCreators(null, AD_ID)).toBeNull();
    expect(adMediaFromScrapeCreators([payload()], AD_ID)).toBeNull();
    expect(adMediaFromScrapeCreators("snapshot", AD_ID)).toBeNull();
  });

  it("textes nettoyés et bornés : bouton (40), catégories (5 au plus, 60 caractères), mentions J'aime entières et positives", () => {
    const media = adMediaFromScrapeCreators(
      payload(
        snapshot({
          cta_text: `  En savoir\n plus\u0000 ${"x".repeat(60)}`,
          page_categories: ["  Alternative &\tHolistic Health Service ", "", 12, "c".repeat(80), "Santé", "Bien-être", "Massage", "Yoga"],
          page_like_count: 1_234.9,
        }),
      ),
      AD_ID,
    )!;
    expect(media.ctaText).toHaveLength(40);
    expect(media.ctaText!.startsWith("En savoir plus x")).toBe(true);
    expect(media.pageCategories).toEqual(["Alternative & Holistic Health Service", "c".repeat(60), "Santé", "Bien-être", "Massage"]);
    expect(media.pageLikes).toBe(1_234);
    const likes = (value: unknown) => adMediaFromScrapeCreators(payload(snapshot({ page_like_count: value })), AD_ID)!.pageLikes;
    expect(likes(-5)).toBe(0);
    expect(likes("412")).toBeNull();
    expect(likes(Number.NaN)).toBeNull();
    expect(adMediaFromScrapeCreators(payload(snapshot({ cta_text: "   " })), AD_ID)!.ctaText).toBeNull();
  });
});

describe("ScrapeCreatorsMediaProvider", () => {
  it("lookup : GET par identifiant, clé dans l'en-tête x-api-key et jamais dans l'URL", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse(payload(snapshot({ images: [{ original_image_url: image("origine") }] }))));
    const scraper = provider(impl);
    expect(scraper.mode).toBe("scrapecreators");
    const media = await scraper.lookup(AD_ID);
    expect(media).toMatchObject({ adId: AD_ID, format: "image", items: [{ kind: "image", imageUrl: image("origine"), videoUrl: null }] });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    const url = new URL(call.url);
    expect(call.method).toBe("GET");
    expect(url.origin).toBe(SCRAPECREATORS_BASE);
    expect(url.pathname).toBe(SCRAPECREATORS_AD_PATH);
    expect(call.url).toContain(`id=${AD_ID}`);
    expect(url.searchParams.get("id")).toBe(AD_ID);
    expect(call.headers["x-api-key"]).toBe(KEY);
    expect(call.headers.accept).toBe("application/json");
    expect(call.url).not.toContain(KEY);
    expect(call.signal).toBeInstanceOf(AbortSignal);
    // Délai de 15 s par recherche, relance après 1,5 s
    expect(AD_MEDIA_TIMEOUT_MS).toBe(15_000);
    expect(AD_MEDIA_RETRY_DELAY_MS).toBe(1_500);
  });

  it("identifiant invalide (lettres, trop court, trop long, vide) → null sans aucun appel", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse(payload()));
    const scraper = provider(impl);
    for (const id of ["", "abc", "12ab34", "1234", "1".repeat(26), "12345 ", "123456&x=1", "../ad"]) expect(await scraper.lookup(id)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("404 → null ; success: false → null ; réponse sans snapshot → null (annonce introuvable, sans relance)", async () => {
    const notFound = stubFetch(() => jsonResponse({ success: false, message: "Ad not found" }, 404));
    expect(await provider(notFound.impl).lookup(AD_ID)).toBeNull();
    expect(notFound.calls).toHaveLength(1);
    const refused = stubFetch(() => jsonResponse({ success: false, credits_remaining: 4820, message: "No ad found for this id" }));
    expect(await provider(refused.impl).lookup(AD_ID)).toBeNull();
    expect(refused.calls).toHaveLength(1);
    const bare = stubFetch(() => jsonResponse({ success: true, credits_remaining: 4819 }));
    expect(await provider(bare.impl).lookup(AD_ID)).toBeNull();
    expect(bare.calls).toHaveLength(1);
  });

  it("401 / 403 → AdMediaError « auth » ; 402 → « credits » ; autre refus (400) → « other » : jamais relancés", async () => {
    for (const [status, kind] of [
      [401, "auth"],
      [403, "auth"],
      [402, "credits"],
      [400, "other"],
    ] as const) {
      const { calls, impl } = stubFetch(() => jsonResponse({ success: false, message: "Refusé" }, status));
      const err = await failure(provider(impl).lookup(AD_ID));
      expect(err).toMatchObject({ name: "AdMediaError", kind, status });
      expect(err.message).toContain(`HTTP ${status}`);
      expect(err.message).toContain("Refusé");
      expect(calls).toHaveLength(1);
    }
  });

  it("429 → « rate » (limite de débit), jamais relancé", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse({ error: "Too many requests" }, 429));
    const err = await failure(provider(impl).lookup(AD_ID));
    expect(err).toMatchObject({ kind: "rate", status: 429 });
    expect(err.message).toContain("Too many requests");
    expect(calls).toHaveLength(1);
  });

  it("500 puis 200 → une seule relance (rien n'a été facturé), visuels rendus ; 5xx deux fois → erreur « retry » après deux tentatives", async () => {
    const recovered = stubFetch((_call, index) => (index === 0 ? jsonResponse({ message: "Internal error" }, 500) : jsonResponse(payload(snapshot({ images: [{ original_image_url: image("origine") }] })))));
    const media = await provider(recovered.impl).lookup(AD_ID);
    expect(media!.items).toHaveLength(1);
    expect(recovered.calls).toHaveLength(2);
    expect(recovered.calls[1]!.url).toBe(recovered.calls[0]!.url);
    const down = stubFetch((_call, index) => jsonResponse({ message: "Bad gateway" }, index === 0 ? 502 : 503));
    const err = await failure(provider(down.impl).lookup(AD_ID));
    expect(err).toMatchObject({ kind: "retry", status: 503 });
    expect(err.message).toContain("HTTP 503");
    expect(down.calls).toHaveLength(2);
  });

  it("connexion impossible deux fois → erreur « retry » (deux tentatives, pas davantage) ; une seule fois → relance aboutie", async () => {
    const dead = stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    const err = await failure(provider(dead.impl).lookup(AD_ID));
    expect(err).toMatchObject({ kind: "retry", status: null });
    expect(err.message).toContain("fetch failed");
    expect(dead.calls).toHaveLength(2);
    const flaky = stubFetch((_call, index) => {
      if (index === 0) throw new TypeError("fetch failed");
      return jsonResponse(payload());
    });
    expect(await provider(flaky.impl).lookup(AD_ID)).toMatchObject({ adId: AD_ID });
    expect(flaky.calls).toHaveLength(2);
  });

  it("réponse 200 illisible (HTML, JSON qui n'est pas un objet) → « transient », jamais relancée (la recherche a pu être facturée)", async () => {
    const html = stubFetch(() => new Response("<html><body>Bad gateway</body></html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    expect(await failure(provider(html.impl).lookup(AD_ID))).toMatchObject({ kind: "transient", status: 200 });
    expect(html.calls).toHaveLength(1);
    const list = stubFetch(() => jsonResponse([payload()]));
    expect(await failure(provider(list.impl).lookup(AD_ID))).toMatchObject({ kind: "transient", status: 200 });
    expect(list.calls).toHaveLength(1);
    const empty = stubFetch(() => new Response("", { status: 200 }));
    expect(await failure(provider(empty.impl).lookup(AD_ID))).toMatchObject({ kind: "transient" });
    expect(empty.calls).toHaveLength(1);
  });

  it("délai dépassé : la requête est annulée par son signal → « transient », jamais relancée (elle a pu arriver et être facturée)", async () => {
    const { calls, impl } = stubFetch(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          call.signal?.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")));
        }),
    );
    const err = await failure(provider(impl, { timeoutMs: 5 }).lookup(AD_ID));
    expect(err).toMatchObject({ kind: "transient", status: null });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.signal?.aborted).toBe(true);
  });

  it("une relance au plus : erreur relançable puis refus → le refus est rendu tel quel ; relançable puis introuvable → null", async () => {
    const refused = stubFetch((_call, index) => (index === 0 ? jsonResponse({ message: "Internal error" }, 500) : jsonResponse({ message: "Unauthorized" }, 401)));
    expect(await failure(provider(refused.impl).lookup(AD_ID))).toMatchObject({ kind: "auth", status: 401 });
    expect(refused.calls).toHaveLength(2);
    const gone = stubFetch((_call, index) => {
      if (index === 0) throw new TypeError("fetch failed");
      return jsonResponse({ success: false }, 404);
    });
    expect(await provider(gone.impl).lookup(AD_ID)).toBeNull();
    expect(gone.calls).toHaveLength(2);
  });

  it("les messages d'erreur ne contiennent jamais la clé (réponse du serveur, texte brut, erreur réseau)", async () => {
    const echoed = stubFetch(() => jsonResponse({ message: `Invalid API key: ${KEY}` }, 401));
    const auth = await failure(provider(echoed.impl).lookup(AD_ID));
    expect(auth.message).not.toContain(KEY);
    expect(auth.message).toContain("Invalid API key");
    const text = stubFetch(() => new Response(`Forbidden for ${KEY} (twice: ${KEY})`, { status: 403 }));
    expect((await failure(provider(text.impl).lookup(AD_ID))).message).not.toContain(KEY);
    const errorField = stubFetch(() => jsonResponse({ error: `quota exceeded for ${KEY}` }, 402));
    expect((await failure(provider(errorField.impl).lookup(AD_ID))).message).not.toContain(KEY);
    const network = stubFetch(() => {
      throw new TypeError(`request to ${SCRAPECREATORS_BASE} failed, headers: {"x-api-key":"${KEY}"}`);
    });
    const unreachable = await failure(provider(network.impl).lookup(AD_ID));
    expect(unreachable.message).not.toContain(KEY);
    expect(String(unreachable)).not.toContain(KEY);
    expect(JSON.stringify({ ...unreachable })).not.toContain(KEY);
  });

  // Constat : le détail renvoyé par le serveur est coupé à 200 caractères AVANT le masquage de la clé. Une clé à cheval
  // sur la coupure n'est plus reconnue : son début reste lisible dans le message (donc dans les journaux), alors que la
  // clé « n'est jamais journalisée ». Le masquage devrait précéder la coupure, comme pour les erreurs réseau.
  it.fails("constat — une clé coupée par la limite de 200 caractères du détail laisse son début dans le message", async () => {
    const { impl } = stubFetch(() => jsonResponse({ message: `${"x".repeat(180)} ${KEY}` }, 401));
    const err = await failure(provider(impl).lookup(AD_ID));
    expect(err.message).not.toContain(KEY.slice(0, 12));
  });

  it("creditsRemaining : suit le solde renvoyé par l'API, inchangé quand il est absent", async () => {
    const balances: unknown[] = [4821, 4820, "4819", undefined, 4818];
    const { impl } = stubFetch((_call, index) => jsonResponse(payload(snapshot(), { credits_remaining: balances[index], ...(index === 1 ? { success: false } : {}) })));
    const scraper = provider(impl);
    expect(scraper.creditsRemaining).toBeNull();
    await scraper.lookup(AD_ID);
    expect(scraper.creditsRemaining).toBe(4821);
    // Solde lu même quand l'annonce est introuvable (success: false)
    expect(await scraper.lookup(AD_ID)).toBeNull();
    expect(scraper.creditsRemaining).toBe(4820);
    await scraper.lookup(AD_ID);
    await scraper.lookup(AD_ID);
    expect(scraper.creditsRemaining).toBe(4820);
    await scraper.lookup(AD_ID);
    expect(scraper.creditsRemaining).toBe(4818);
  });
});

describe("isAdMediaBlocking", () => {
  it("clé refusée, crédits épuisés ou limite de débit condamnent le lot ; relançable, transitoire, autre et erreurs étrangères non", () => {
    expect(isAdMediaBlocking(new AdMediaError("clé refusée", { status: 401, kind: "auth" }))).toBe(true);
    expect(isAdMediaBlocking(new AdMediaError("crédits épuisés", { status: 402, kind: "credits" }))).toBe(true);
    expect(isAdMediaBlocking(new AdMediaError("débit", { status: 429, kind: "rate" }))).toBe(true);
    expect(isAdMediaBlocking(new AdMediaError("5xx", { status: 500, kind: "retry" }))).toBe(false);
    expect(isAdMediaBlocking(new AdMediaError("délai", { kind: "transient" }))).toBe(false);
    expect(isAdMediaBlocking(new AdMediaError("autre"))).toBe(false);
    expect(isAdMediaBlocking(Object.assign(new Error("faux ami"), { kind: "auth" }))).toBe(false);
    expect(isAdMediaBlocking(null)).toBe(false);
    expect(new AdMediaError("défauts")).toMatchObject({ name: "AdMediaError", kind: "other", status: null });
  });
});

describe("MockAdMediaProvider", () => {
  const ids = Array.from({ length: 80 }, (_, n) => String(1_000_000_000_000 + n * 7_919));

  it("déterministe par identifiant, visuels prêts à afficher (data:image/svg+xml), aucun lien à télécharger", async () => {
    const mock = new MockAdMediaProvider();
    expect(mock.mode).toBe("mock");
    for (const id of ids.slice(0, 20)) {
      const first = await mock.lookup(id);
      expect(first).not.toBeNull();
      expect(await new MockAdMediaProvider().lookup(id)).toEqual(first);
      expect(first!.adId).toBe(id);
      expect(first!.items.length).toBeGreaterThan(0);
      expect(first!.items.length).toBeLessThanOrEqual(META_MEDIA_ITEMS_MAX);
      for (const item of first!.items) {
        expect(item.posterUrl).toMatch(/^data:image\/svg\+xml/);
        expect(item.imageUrl).toBeNull();
        expect(item.videoUrl).toBeNull();
      }
      expect(first).toMatchObject({ avatarUrl: null, linkUrl: null, expiresAt: null });
      expect(first!.pageLikes).toBeGreaterThanOrEqual(0);
      expect(first!.ctaText).toBeTruthy();
      expect(first!.pageCategories.length).toBeGreaterThan(0);
    }
    expect(await mock.lookup("   ")).toBeNull();
  });

  it("variété sur de nombreux identifiants : image, vidéo, carrousel et déclinaisons, chacun cohérent", async () => {
    const mock = new MockAdMediaProvider();
    const all = await Promise.all(ids.map((id) => mock.lookup(id)));
    const formats = new Set(all.map((media) => media!.format));
    expect([...formats].sort()).toEqual(["carousel", "image", "video"]);
    expect(all.some((media) => media!.variants)).toBe(true);
    for (const media of all) {
      const kinds = media!.items.map((item) => item.kind);
      if (media!.format === "carousel") {
        expect(kinds.length).toBeGreaterThan(1);
        expect(media!.variants).toBe(false);
      } else if (media!.variants) {
        expect(kinds.length).toBeGreaterThan(1);
        expect(kinds[0]).toBe(media!.format);
      } else {
        expect(kinds).toEqual([media!.format]);
      }
      // Les visuels d'une même annonce sont distincts
      expect(new Set(media!.items.map((item) => item.posterUrl)).size).toBe(media!.items.length);
    }
  });
});

describe("createAdMediaProvider", () => {
  it("META_ADS_MOCK → démonstration (même avec une clé) ; clé seule → fournisseur réel ; sinon null", () => {
    expect(createAdMediaProvider({ META_ADS_MOCK: "1" } as NodeJS.ProcessEnv)?.mode).toBe("mock");
    expect(createAdMediaProvider({ META_ADS_MOCK: "true" } as NodeJS.ProcessEnv)?.mode).toBe("mock");
    expect(createAdMediaProvider({ META_ADS_MOCK: "1", SCRAPECREATORS_API_KEY: KEY } as NodeJS.ProcessEnv)).toBeInstanceOf(MockAdMediaProvider);
    expect(createAdMediaProvider({ SCRAPECREATORS_API_KEY: KEY } as NodeJS.ProcessEnv)).toBeInstanceOf(ScrapeCreatorsMediaProvider);
    expect(createAdMediaProvider({ META_ADS_MOCK: "0", SCRAPECREATORS_API_KEY: ` ${KEY} ` } as NodeJS.ProcessEnv)?.mode).toBe("scrapecreators");
    expect(createAdMediaProvider({} as NodeJS.ProcessEnv)).toBeNull();
    expect(createAdMediaProvider({ META_ADS_MOCK: "", SCRAPECREATORS_API_KEY: "   " } as NodeJS.ProcessEnv)).toBeNull();
    expect(createAdMediaProvider({ META_ADS_MOCK: "non" } as NodeJS.ProcessEnv)).toBeNull();
  });

  it("la clé de l'environnement est transmise telle quelle (sans espaces) au fournisseur réel", async () => {
    const original = globalThis.fetch;
    const { calls, impl } = stubFetch(() => jsonResponse({ success: false }, 404));
    globalThis.fetch = impl;
    try {
      const real = createAdMediaProvider({ SCRAPECREATORS_API_KEY: `  ${KEY}\n` } as NodeJS.ProcessEnv);
      expect(await real!.lookup(AD_ID)).toBeNull();
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers["x-api-key"]).toBe(KEY);
  });
});

describe("mockPosterDataUrl", () => {
  it("déterministe : même graine → même image ; graines différentes → images différentes ; SVG avec son libellé", () => {
    const a = mockPosterDataUrl("1000000000001:0", "Visuel de démonstration");
    expect(mockPosterDataUrl("1000000000001:0", "Visuel de démonstration")).toBe(a);
    expect(a.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    const svg = decodeURIComponent(a.slice("data:image/svg+xml;utf8,".length));
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("Visuel de démonstration");
    const others = new Set(Array.from({ length: 12 }, (_, n) => mockPosterDataUrl(`1000000000001:${n}`, "Visuel de démonstration")));
    expect(others.size).toBe(12);
    expect(mockPosterDataUrl("1000000000001:0", "Autre libellé")).not.toBe(a);
  });
});
