import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { falCostUsd } from "@theralys/shared";
import { setApiUsageSink, setApiUsageSinkFactory, withApiUsage, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { FalImageProvider, MockImageProvider } from "./images";

const KEY = "fal-cle-secrete-0123456789abcdef";
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_URL = "https://v3.fal.media/files/lion/abc123.jpeg";

type Call = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

/** Remplace `fetch` global (le fournisseur fal.ai n'accepte pas de `fetch` injecté). */
function stubFetch(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const call: Call = { url: String(input), method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()), body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {} };
      calls.push(call);
      return respond(call, calls.length - 1);
    }),
  );
  return calls;
}

function capture(): ResolvedApiUsageEvent[] {
  const events: ResolvedApiUsageEvent[] = [];
  setApiUsageSink(async (event) => {
    events.push(event);
  });
  return events;
}

beforeEach(() => {
  // Les modèles ne dépendent pas de l'environnement de la machine
  vi.stubEnv("IMAGE_MODEL_STANDARD", undefined);
  vi.stubEnv("IMAGE_MODEL_HIGH", undefined);
});

afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("FalImageProvider — registre des appels API", () => {
  it("image standard : un événement fal / image, une unité, coût au mégapixel du barème, rattaché au contexte", async () => {
    const events = capture();
    const calls = stubFetch(() => jsonResponse({ images: [{ url: IMAGE_URL }] }));
    const image = await withApiUsage({ feature: "blog", siteId: SITE_ID }, () => new FalImageProvider(KEY).generate({ subject: "calm therapy room" }));
    expect(image).toEqual({ url: IMAGE_URL, aiGenerated: true, provider: "fal" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://fal.run/fal-ai/flux/schnell");
    expect(events).toHaveLength(1);
    const { createdAt, durationMs, ...event } = events[0]!;
    expect(event).toEqual({
      provider: "fal",
      operation: "image",
      feature: "blog",
      siteId: SITE_ID,
      model: "fal-ai/flux/schnell",
      status: "ok",
      requests: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      units: 1,
      // 1024 × 768 = 0,79 MP, facturé 1 MP
      costUsd: 0.003,
      costSource: "tariff",
      error: null,
      meta: { quality: "standard", width: 1024, height: 768 },
    });
    expect(createdAt).toBeInstanceOf(Date);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("dimensions demandées : reprises dans les notes, coût arrondi au mégapixel supérieur", async () => {
    const events = capture();
    stubFetch(() => jsonResponse({ images: [{ url: IMAGE_URL }] }));
    const provider = new FalImageProvider(KEY);
    await provider.generate({ subject: "wide banner", width: 1920, height: 1080 });
    await provider.generate({ subject: "thumbnail", width: 256, height: 256 });
    expect(events.map((event) => [event.costUsd, event.meta])).toEqual([
      [0.009, { quality: "standard", width: 1920, height: 1080 }],
      [0.003, { quality: "standard", width: 256, height: 256 }],
    ]);
    expect(events[0]!.costUsd).toBe(falCostUsd("fal-ai/flux/schnell", 1920, 1080));
  });

  it("qualité haute : FLUX 1.1 pro ultra, forfait à l'image", async () => {
    const events = capture();
    const calls = stubFetch(() => jsonResponse({ images: [{ url: IMAGE_URL }] }));
    await new FalImageProvider(KEY).generate({ subject: "portrait of a practitioner", quality: "high", width: 960, height: 1152 });
    expect(calls[0]!.url).toBe("https://fal.run/fal-ai/flux-pro/v1.1-ultra");
    expect(events[0]).toMatchObject({ provider: "fal", operation: "image", model: "fal-ai/flux-pro/v1.1-ultra", units: 1, costUsd: 0.06, costSource: "tariff", meta: { quality: "high", width: 960, height: 1152 } });
  });

  it("modèle surchargé par l'environnement : enregistré tel quel, au prix du barème (repli sur le modèle par défaut s'il n'y figure pas)", async () => {
    const events = capture();
    const calls = stubFetch(() => jsonResponse({ images: [{ url: IMAGE_URL }] }));
    vi.stubEnv("IMAGE_MODEL_STANDARD", "fal-ai/flux/dev");
    await new FalImageProvider(KEY).generate({ subject: "herbal tea", width: 1600, height: 900 });
    expect(calls[0]!.url).toBe("https://fal.run/fal-ai/flux/dev");
    expect(events[0]).toMatchObject({ model: "fal-ai/flux/dev", units: 1, costUsd: falCostUsd("fal-ai/flux/dev", 1600, 900), costSource: "tariff" });
    expect(events[0]!.costUsd).toBe(0.006);
  });

  it("erreur HTTP : événement en erreur, sans coût ni unité, erreur relancée ; la clé n'y figure pas", async () => {
    const events = capture();
    stubFetch(() => new Response('{"detail":"Internal\n  server error"}', { status: 500 }));
    await expect(withApiUsage({ feature: "site_generation", siteId: SITE_ID }, () => new FalImageProvider(KEY).generate({ subject: "x" }))).rejects.toThrow(/^fal\.ai 500: /);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      provider: "fal",
      operation: "image",
      feature: "site_generation",
      siteId: SITE_ID,
      model: "fal-ai/flux/schnell",
      status: "error",
      units: 0,
      costUsd: 0,
      costSource: "free",
      error: 'fal.ai 500: {"detail":"Internal server error"}',
      meta: { quality: "standard", width: 1024, height: 768 },
    });
    expect(JSON.stringify(events)).not.toContain(KEY);
  });

  it("réponse sans image : inscrite en erreur, sans coût", async () => {
    const events = capture();
    stubFetch(() => jsonResponse({ images: [] }));
    await expect(new FalImageProvider(KEY).generate({ subject: "x" })).rejects.toThrow("fal.ai : réponse sans image");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "error", units: 0, costUsd: 0, error: "fal.ai : réponse sans image" });
  });

  it("connexion impossible : inscrite en erreur, l'erreur d'origine est relancée", async () => {
    const events = capture();
    const failure = new TypeError("fetch failed");
    stubFetch(() => {
      throw failure;
    });
    await expect(new FalImageProvider(KEY).generate({ subject: "x" })).rejects.toBe(failure);
    expect(events[0]).toMatchObject({ status: "error", error: "fetch failed", costUsd: 0, units: 0 });
  });

  it("une image par appel : autant d'événements que d'images, chacun avec son contexte", async () => {
    const events = capture();
    stubFetch(() => jsonResponse({ images: [{ url: IMAGE_URL }] }));
    const provider = new FalImageProvider(KEY);
    await Promise.all([
      withApiUsage({ feature: "blog", siteId: "site-a" }, () => provider.generate({ subject: "a" })),
      withApiUsage({ feature: "site_generation", siteId: "site-b" }, () => provider.generate({ subject: "b", quality: "high" })),
      provider.generate({ subject: "c" }),
    ]);
    expect(events.map((event) => [event.feature, event.siteId, event.costUsd]).sort()).toEqual(
      [
        ["blog", "site-a", 0.003],
        ["site_generation", "site-b", 0.06],
        [null, null, 0.003],
      ].sort(),
    );
  });

  it("sans puits : l'image est rendue, l'erreur relancée", async () => {
    stubFetch((_call, index) => (index === 0 ? jsonResponse({ images: [{ url: IMAGE_URL }] }) : new Response("quota", { status: 402 })));
    const provider = new FalImageProvider(KEY);
    await expect(provider.generate({ subject: "x" })).resolves.toMatchObject({ url: IMAGE_URL });
    await expect(provider.generate({ subject: "x" })).rejects.toThrow("fal.ai 402: quota");
  });
});

describe("MockImageProvider — registre des appels API", () => {
  it("image de démonstration : aucun appel externe, rien n'est inscrit", async () => {
    const events = capture();
    const calls = stubFetch(() => jsonResponse({}));
    await new MockImageProvider().generate({ subject: "Massage sportif" });
    expect(calls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});
