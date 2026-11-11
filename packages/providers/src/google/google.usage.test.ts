import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_PLACES_OPERATIONS } from "@theralys/shared";
import { setApiUsageSink, setApiUsageSinkFactory, withApiUsage, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { MockGooglePlacesProvider, RealGooglePlacesProvider } from "./index";

const KEY = "AIza-cle-secrete-0123456789abcdef";
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const PLACE_ID = "ChIJ4zGFAZpYwokRGUGph3Mf37k";
const PHOTO_NAME = `places/${PLACE_ID}/photos/AelY_CvmUOXlp`;
const PHOTO_URI = "https://lh3.googleusercontent.com/places/AelY_CvmUOXlp=s400";
const BASE = "https://places.googleapis.com/v1";

type Call = { url: string; method: string; headers: Record<string, string> };
type Kind = "search" | "details" | "photo";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function kindOf(url: string): Kind {
  if (url === `${BASE}/places:searchText`) return "search";
  return url.includes("/media?") ? "photo" : "details";
}

/** Remplace `fetch` global (le fournisseur Places n'accepte pas de `fetch` injecté) : une réponse par type d'appel. */
function stubFetch(respond: Partial<Record<Kind, (call: Call) => Response | Promise<Response>>>) {
  const calls: (Call & { kind: Kind })[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const call = { url, kind: kindOf(url), method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()) };
      calls.push(call);
      const handler = respond[call.kind];
      if (!handler) throw new Error(`appel inattendu : ${call.kind}`);
      return handler(call);
    }),
  );
  return calls;
}

const SEARCH_RESULTS = { places: [{ id: PLACE_ID, displayName: { text: "Cabinet Martin" }, formattedAddress: "12 rue des Lilas, 81000 Albi", rating: 4.9, userRatingCount: 34 }] };

/** Réponse de Place Details (avec ou sans photo). */
function details(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PLACE_ID,
    rating: 4.9,
    userRatingCount: 34,
    photos: [{ name: PHOTO_NAME }, { name: `${PHOTO_NAME}-2` }],
    location: { latitude: 43.9289, longitude: 2.1464 },
    websiteUri: "https://cabinet-martin.fr",
    nationalPhoneNumber: "05 63 00 00 00",
    regularOpeningHours: { periods: [{}] },
    primaryType: "wellness_center",
    reviews: [{ name: `places/${PLACE_ID}/reviews/1`, rating: 5, text: { text: "Un accueil chaleureux." }, authorAttribution: { displayName: "Camille D." }, publishTime: "2026-05-12T10:00:00Z" }],
    ...overrides,
  };
}

function capture(): ResolvedApiUsageEvent[] {
  const events: ResolvedApiUsageEvent[] = [];
  setApiUsageSink(async (event) => {
    events.push(event);
  });
  return events;
}

/** Champs utiles d'un événement, pour comparer une suite d'appels d'un coup d'œil. */
const brief = (event: ResolvedApiUsageEvent) => [event.operation, event.status, event.units, event.costUsd, event.costSource];

afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RealGooglePlacesProvider.search — registre des appels API", () => {
  it("recherche aboutie : un événement google_places / text_search au prix du barème, rattaché au contexte", async () => {
    const events = capture();
    const calls = stubFetch({ search: () => jsonResponse(SEARCH_RESULTS) });
    const results = await withApiUsage({ feature: "prospecting", siteId: SITE_ID }, () => new RealGooglePlacesProvider(KEY).search("cabinet martin albi"));
    expect(results).toHaveLength(1);
    expect(calls.map((call) => call.kind)).toEqual(["search"]);
    expect(events).toHaveLength(1);
    const { createdAt, durationMs, ...event } = events[0]!;
    expect(event).toEqual({
      provider: "google_places",
      operation: "text_search",
      feature: "prospecting",
      siteId: SITE_ID,
      model: null,
      status: "ok",
      requests: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      units: 1,
      costUsd: GOOGLE_PLACES_OPERATIONS.text_search.unitUsd,
      costSource: "tariff",
      error: null,
      meta: null,
    });
    expect(event.costUsd).toBe(0.035);
    expect(createdAt).toBeInstanceOf(Date);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("recherche sans résultat : l'appel a eu lieu, il est compté au même prix", async () => {
    const events = capture();
    stubFetch({ search: () => jsonResponse({}) });
    await expect(new RealGooglePlacesProvider(KEY).search("zzzzzz")).resolves.toEqual([]);
    expect(events.map(brief)).toEqual([["text_search", "ok", 1, 0.035, "tariff"]]);
  });

  it("requête trop courte (moins de 3 caractères) : aucun appel, rien n'est inscrit", async () => {
    const events = capture();
    const calls = stubFetch({});
    for (const query of ["", "ab", "  a  ", "   "]) await expect(new RealGooglePlacesProvider(KEY).search(query)).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("erreur HTTP : événement en erreur sans coût ni unité, erreur relancée", async () => {
    const events = capture();
    stubFetch({ search: () => jsonResponse({ error: { code: 403, message: "API key not valid.", status: "PERMISSION_DENIED" } }, 403) });
    await expect(withApiUsage({ feature: "site_editor", siteId: SITE_ID }, () => new RealGooglePlacesProvider(KEY).search("cabinet martin"))).rejects.toThrow(/^Places search 403: /);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "google_places", operation: "text_search", feature: "site_editor", siteId: SITE_ID, status: "error", units: 0, costUsd: 0, costSource: "free" });
    expect(events[0]!.error).toMatch(/^Places search 403: \{"error":\{"code":403,"message":"API key not valid\."/);
  });

  it("connexion impossible : inscrite en erreur, l'erreur d'origine est relancée", async () => {
    const events = capture();
    const failure = new TypeError("fetch failed");
    stubFetch({
      search: () => {
        throw failure;
      },
    });
    await expect(new RealGooglePlacesProvider(KEY).search("cabinet martin")).rejects.toBe(failure);
    expect(events.map(brief)).toEqual([["text_search", "error", 0, 0, "free"]]);
    expect(events[0]!.error).toBe("fetch failed");
  });
});

describe("RealGooglePlacesProvider.fetchDetails — registre des appels API", () => {
  it("fiche avec photo : deux événements (photo puis fiche), chacun à son prix, rattachés au contexte", async () => {
    const events = capture();
    const calls = stubFetch({ details: () => jsonResponse(details()), photo: () => jsonResponse({ name: `${PHOTO_NAME}/media`, photoUri: PHOTO_URI }) });
    const result = await withApiUsage({ feature: "google_profile", siteId: SITE_ID }, () => new RealGooglePlacesProvider(KEY).fetchDetails(PLACE_ID));
    expect(result).toMatchObject({ rating: 4.9, reviewCount: 34, photoUrl: PHOTO_URI, photoCount: 2 });
    // Une seule photo est résolue (la première), quel que soit le nombre de photos de la fiche
    expect(calls.map((call) => call.kind)).toEqual(["details", "photo"]);
    // La photo est résolue pendant l'appel de la fiche : son événement est inscrit le premier
    expect(events.map(brief)).toEqual([
      ["place_photo", "ok", 1, 0.007, "tariff"],
      ["place_details", "ok", 1, 0.025, "tariff"],
    ]);
    for (const event of events) expect(event).toMatchObject({ provider: "google_places", feature: "google_profile", siteId: SITE_ID, requests: 1, error: null, meta: null });
    expect(events.reduce((sum, event) => sum + event.costUsd, 0)).toBeCloseTo(0.032, 9);
  });

  it("fiche sans photo : un seul événement place_details", async () => {
    const events = capture();
    const calls = stubFetch({ details: () => jsonResponse(details({ photos: undefined })) });
    const result = await new RealGooglePlacesProvider(KEY).fetchDetails(PLACE_ID);
    expect(result.photoUrl).toBeNull();
    expect(calls.map((call) => call.kind)).toEqual(["details"]);
    expect(events.map(brief)).toEqual([["place_details", "ok", 1, 0.025, "tariff"]]);
  });

  it("photo en échec (HTTP 500) : inscrite en erreur sans coût, `photoUrl` null, la fiche reste comptée", async () => {
    const events = capture();
    stubFetch({ details: () => jsonResponse(details()), photo: () => new Response("Internal error", { status: 500 }) });
    const result = await withApiUsage({ feature: "google_profile", siteId: SITE_ID }, () => new RealGooglePlacesProvider(KEY).fetchDetails(PLACE_ID));
    expect(result.photoUrl).toBeNull();
    expect(result.rating).toBe(4.9);
    expect(events.map(brief)).toEqual([
      ["place_photo", "error", 0, 0, "free"],
      ["place_details", "ok", 1, 0.025, "tariff"],
    ]);
    expect(events[0]).toMatchObject({ error: "Places photo 500", feature: "google_profile", siteId: SITE_ID });
  });

  it("photo injoignable (erreur réseau) : même traitement, la fiche est rendue", async () => {
    const events = capture();
    stubFetch({
      details: () => jsonResponse(details()),
      photo: () => {
        throw new TypeError("fetch failed");
      },
    });
    const result = await new RealGooglePlacesProvider(KEY).fetchDetails(PLACE_ID);
    expect(result.photoUrl).toBeNull();
    expect(events.map(brief)).toEqual([
      ["place_photo", "error", 0, 0, "free"],
      ["place_details", "ok", 1, 0.025, "tariff"],
    ]);
    expect(events[0]!.error).toBe("fetch failed");
  });

  it("photo répondue sans adresse (photoUri absent) : l'appel a abouti, il est compté", async () => {
    const events = capture();
    stubFetch({ details: () => jsonResponse(details()), photo: () => jsonResponse({ name: `${PHOTO_NAME}/media` }) });
    const result = await new RealGooglePlacesProvider(KEY).fetchDetails(PLACE_ID);
    expect(result.photoUrl).toBeNull();
    expect(events.map(brief)).toEqual([
      ["place_photo", "ok", 1, 0.007, "tariff"],
      ["place_details", "ok", 1, 0.025, "tariff"],
    ]);
  });

  it("fiche en erreur (HTTP 404) : un événement place_details en erreur, aucune photo demandée", async () => {
    const events = capture();
    const calls = stubFetch({ details: () => jsonResponse({ error: { code: 404, message: "Place not found" } }, 404) });
    await expect(withApiUsage({ feature: "google_profile", siteId: SITE_ID }, () => new RealGooglePlacesProvider(KEY).fetchDetails("inconnu"))).rejects.toThrow(/^Places details 404: /);
    expect(calls.map((call) => call.kind)).toEqual(["details"]);
    expect(events.map(brief)).toEqual([["place_details", "error", 0, 0, "free"]]);
    expect(events[0]).toMatchObject({ feature: "google_profile", siteId: SITE_ID });
  });

  it("la clé n'entre dans aucun événement, ni l'identifiant de la fiche ni la requête", async () => {
    const events = capture();
    stubFetch({
      search: () => new Response("quota exceeded", { status: 429 }),
      details: () => jsonResponse(details()),
      photo: () => new Response("", { status: 403 }),
    });
    const provider = new RealGooglePlacesProvider(KEY);
    await provider.search("cabinet martin albi").catch(() => undefined);
    await provider.fetchDetails(PLACE_ID);
    expect(events).toHaveLength(3);
    const dump = JSON.stringify(events);
    for (const secret of [KEY, PLACE_ID, "cabinet martin albi"]) expect(dump).not.toContain(secret);
  });

  it("appels simultanés pour deux sites : chaque événement porte le contexte de son appel", async () => {
    const events = capture();
    stubFetch({ details: () => jsonResponse(details()), photo: () => jsonResponse({ photoUri: PHOTO_URI }), search: () => jsonResponse(SEARCH_RESULTS) });
    const provider = new RealGooglePlacesProvider(KEY);
    await Promise.all([
      withApiUsage({ feature: "google_profile", siteId: "site-a" }, () => provider.fetchDetails(PLACE_ID)),
      withApiUsage({ feature: "prospecting" }, () => provider.search("cabinet martin")),
      withApiUsage({ feature: "site_editor", siteId: "site-b" }, () => provider.fetchDetails(PLACE_ID)),
    ]);
    const seen = events.map((event) => `${event.operation}|${event.feature}|${event.siteId}`).sort();
    expect(seen).toEqual(["place_details|google_profile|site-a", "place_details|site_editor|site-b", "place_photo|google_profile|site-a", "place_photo|site_editor|site-b", "text_search|prospecting|null"]);
  });

  it("sans puits : la fiche est rendue, l'erreur relancée", async () => {
    stubFetch({ details: () => jsonResponse(details()), photo: () => jsonResponse({ photoUri: PHOTO_URI }), search: () => new Response("refus", { status: 400 }) });
    const provider = new RealGooglePlacesProvider(KEY);
    await expect(provider.fetchDetails(PLACE_ID)).resolves.toMatchObject({ photoUrl: PHOTO_URI });
    await expect(provider.search("cabinet martin")).rejects.toThrow("Places search 400: refus");
  });
});

describe("MockGooglePlacesProvider — registre des appels API", () => {
  it("données de démonstration : aucun appel externe, rien n'est inscrit", async () => {
    const events = capture();
    const calls = stubFetch({});
    const mock = new MockGooglePlacesProvider();
    await mock.search("cabinet martin");
    await mock.fetchDetails("mock-cabinet-martin-1");
    expect(calls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});
