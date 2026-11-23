import { afterEach, describe, expect, it, vi } from "vitest";
import { setApiUsageSink, setApiUsageSinkFactory } from "@theralys/shared/usage-runtime";
import { FAL_TIMEOUT_MS, FalImageProvider, MockImageProvider } from "./images";
import { PEXELS_TIMEOUT_MS, PexelsStockProvider, findStockOrGenerate } from "./stock";

/** Remplace `fetch` global et garde le signal d'abandon de chaque appel. */
function stubFetch(respond: (url: string) => Response | Promise<Response>) {
  const signals: (AbortSignal | null | undefined)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      signals.push(init?.signal);
      return respond(String(input));
    }),
  );
  return signals;
}

const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
/** Erreur qu'un `fetch` lève quand son `AbortSignal.timeout` expire. */
const timeoutError = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("délais des fournisseurs d'images", () => {
  it("fal.ai : chaque génération porte un signal d'abandon (60 s)", async () => {
    vi.stubEnv("IMAGE_MODEL_STANDARD", undefined);
    const signals = stubFetch(() => json({ images: [{ url: "https://v3.fal.media/files/a.jpeg" }] }));
    await new FalImageProvider("fal-cle").generate({ subject: "calm room" });
    expect(FAL_TIMEOUT_MS).toBe(60_000);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]!.aborted).toBe(false);
  });

  it("fal.ai : délai dépassé → l'erreur remonte à l'appelant (pas d'attente sans fin)", async () => {
    stubFetch(() => Promise.reject(timeoutError()));
    await expect(new FalImageProvider("fal-cle").generate({ subject: "calm room" })).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("Pexels : chaque recherche porte un signal d'abandon (10 s)", async () => {
    const signals = stubFetch(() => json({ photos: [{ src: { original: "https://images.pexels.com/photos/1/a.jpeg" } }] }));
    await new PexelsStockProvider("pexels-cle").find({ query: "calm", width: 1024, height: 576 });
    expect(PEXELS_TIMEOUT_MS).toBe(10_000);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("Pexels qui ne répond pas : l'article garde une image, celle du repli", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(() => Promise.reject(timeoutError()));
    const image = await findStockOrGenerate(new PexelsStockProvider("pexels-cle"), new MockImageProvider(), { query: "calm", subject: "Sommeil", width: 1024, height: 576 });
    expect(image).toMatchObject({ aiGenerated: true });
    expect(image!.url.startsWith("data:image/svg+xml")).toBe(true);
  });
});
