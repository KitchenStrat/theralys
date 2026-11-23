import { afterEach, describe, expect, it, vi } from "vitest";
import { setApiUsageSink, setApiUsageSinkFactory } from "@theralys/shared/usage-runtime";
import { GooglePlacesError, PLACES_TIMEOUT_MS, RealGooglePlacesProvider } from "./index";

const PLACE_ID = "ChIJ4zGFAZpYwokRGUGph3Mf37k";

/** Remplace `fetch` global et garde le signal d'abandon de chaque appel. */
function stubFetch(respond: (url: string) => Response | Promise<Response>) {
  const calls: { url: string; signal: AbortSignal | null | undefined }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), signal: init?.signal });
      return respond(String(input));
    }),
  );
  return calls;
}

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
/** Erreur qu'un `fetch` lève quand son `AbortSignal.timeout` expire. */
const timeoutError = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  vi.unstubAllGlobals();
});

describe("Places : délais", () => {
  it("recherche, fiche et photo portent chacune un signal d'abandon (10 s)", async () => {
    const calls = stubFetch((url) => {
      if (url.endsWith("places:searchText")) return json({ places: [] });
      if (url.includes("/media?")) return json({ photoUri: "https://lh3.googleusercontent.com/p/a=s400" });
      return json({ id: PLACE_ID, rating: 4.9, userRatingCount: 12, photos: [{ name: `places/${PLACE_ID}/photos/a` }] });
    });
    const provider = new RealGooglePlacesProvider("cle");
    await provider.search("cabinet martin albi");
    await provider.fetchDetails(PLACE_ID);
    expect(PLACES_TIMEOUT_MS).toBe(10_000);
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.signal).toBeInstanceOf(AbortSignal);
      expect(call.signal!.aborted).toBe(false);
    }
  });

  it("fiche qui ne répond pas : l'erreur remonte (l'appelant passe au site suivant) ; photo qui ne répond pas : fiche rendue sans photo", async () => {
    stubFetch(() => Promise.reject(timeoutError()));
    await expect(new RealGooglePlacesProvider("cle").fetchDetails(PLACE_ID)).rejects.toMatchObject({ name: "TimeoutError" });

    stubFetch((url) => (url.includes("/media?") ? Promise.reject(timeoutError()) : json({ id: PLACE_ID, rating: 4.9, userRatingCount: 12, photos: [{ name: `places/${PLACE_ID}/photos/a` }] })));
    await expect(new RealGooglePlacesProvider("cle").fetchDetails(PLACE_ID)).resolves.toMatchObject({ rating: 4.9, photoUrl: null });
  });

  it("réponse en erreur : le statut HTTP est porté par l'erreur (les journaux n'ont pas à lire le message)", async () => {
    stubFetch(() => json({ error: { message: "Place not found" } }, 404));
    const failure = await new RealGooglePlacesProvider("cle").fetchDetails(PLACE_ID).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(GooglePlacesError);
    expect(failure).toMatchObject({ name: "GooglePlacesError", status: 404 });
    expect((failure as Error).message).toContain("Places details 404");
    await expect(new RealGooglePlacesProvider("cle").search("cabinet martin")).rejects.toMatchObject({ status: 404, message: expect.stringContaining("Places search 404") });
  });
});
