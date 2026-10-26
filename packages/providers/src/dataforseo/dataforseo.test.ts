import { describe, expect, it, vi } from "vitest";
import { gridPoints } from "@theralys/shared";
import {
  DATAFORSEO_BASE,
  DataForSeoError,
  DataForSeoProvider,
  MockLocalSearchProvider,
  attributeLabel,
  createLocalSearchProvider,
  httpUrlOrNull,
  isRetryableRequest,
  mapConcurrent,
  parseDataForSeoDate,
  reviewFromItem,
  type DfsBusinessItem,
  type DfsMapsItem,
} from "./index";

const LOGIN = "login@exemple.fr";
const PASSWORD = "motdepasse-secret";
const EXPECTED_AUTH = `Basic ${Buffer.from(`${LOGIN}:${PASSWORD}`).toString("base64")}`;

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

/** Réponse DataForSEO minimale : une tâche, statut et coût donnés. */
function dfs(task: { status_code?: number; status_message?: string; cost?: number; id?: string; result?: unknown[] }) {
  return {
    status_code: 20000,
    status_message: "Ok.",
    cost: task.cost ?? 0,
    tasks: [{ id: task.id ?? "task-1", status_code: 20000, status_message: "Ok.", cost: task.cost ?? 0, result: task.result ?? [], ...task }],
  };
}

function mapsItem(rank: number, overrides: Partial<DfsMapsItem> = {}): DfsMapsItem {
  return {
    type: "maps_search",
    rank_group: rank,
    rank_absolute: rank,
    title: `Cabinet ${rank}`,
    place_id: `place-${rank}`,
    cid: `cid-${rank}`,
    rating: { value: 4.5, votes_count: 10 + rank },
    category: "Sophrologue",
    total_photos: rank,
    is_claimed: rank % 2 === 0,
    ...overrides,
  };
}

/** `fetch` bouchonné : enregistre les appels, répond selon `respond`. */
function stubFetch(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      headers,
    };
    calls.push(call);
    return respond(call, calls.length - 1);
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

describe("DataForSeoProvider — requêtes", () => {
  it("auth Basic, une tâche Maps par appel, coordonnées « lat,lng,14z », profondeur 20", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse(dfs({ cost: 0.002, result: [{ items: [mapsItem(1)] }] })));
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl);
    const out = await provider.mapsSearch([{ keyword: "sophrologue albi", point: { lat: 43.9289, lng: 2.1464 }, zoom: 14, depth: 20 }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${DATAFORSEO_BASE}/serp/google/maps/live/advanced`);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers.authorization).toBe(EXPECTED_AUTH);
    expect(calls[0]!.body).toEqual([
      { keyword: "sophrologue albi", location_coordinate: "43.9289,2.1464,14z", language_code: "fr", depth: 20 },
    ]);
    expect(out.mode).toBe("dataforseo");
    expect(out.costUsd).toBe(0.002);
    expect(out.data).toEqual([[{ rank: 1, title: "Cabinet 1", placeId: "place-1", cid: "cid-1", rating: 4.5, votes: 11, category: "Sophrologue", totalPhotos: 1, isClaimed: false }]]);
  });

  it("grille de 49 points : 49 appels, concurrence bornée, résultats dans l'ordre, coût = somme des tasks[].cost", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { calls, impl } = stubFetch(async (call, index) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Réponses dans le désordre : les premières requêtes répondent en dernier
      await new Promise((resolve) => setTimeout(resolve, (index % 3) * 4));
      inFlight -= 1;
      const [task] = call.body as { location_coordinate: string }[];
      return jsonResponse(dfs({ cost: 0.002, result: [{ items: [mapsItem(1, { title: task!.location_coordinate })] }] }));
    });
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl, { concurrency: 5 });
    const points = gridPoints({ lat: 43.9289, lng: 2.1464 }, 5);
    const inputs = points.map((point) => ({ keyword: "sophrologue albi", point, zoom: 14, depth: 20 }));
    const out = await provider.mapsSearch(inputs);
    expect(calls).toHaveLength(49);
    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(out.data).toHaveLength(49);
    for (let i = 0; i < 49; i++) {
      expect(out.data[i]![0]!.title).toBe(`${points[i]!.lat},${points[i]!.lng},14z`);
    }
    expect(out.costUsd).toBeCloseTo(0.098, 6);
  });

  it("normalisation Maps : rang = rank_absolute, éléments non « maps_search » ignorés, tri et profondeur", async () => {
    const items: DfsMapsItem[] = [
      { type: "paid", rank_absolute: 1, title: "Annonce" },
      mapsItem(3, { rating: null, total_photos: null, is_claimed: null }),
      mapsItem(2),
      mapsItem(4),
      { type: "maps_search", rank_absolute: 5, title: "   " },
    ];
    const { impl } = stubFetch(() => jsonResponse(dfs({ cost: 0.002, result: [{ items }] })));
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl);
    const { data } = await provider.mapsSearch([{ keyword: "x", point: { lat: 1, lng: 2 }, zoom: 14, depth: 2 }]);
    expect(data[0]!.map((l) => l.rank)).toEqual([2, 3]);
    expect(data[0]![1]).toMatchObject({ rating: null, votes: null, totalPhotos: null, isClaimed: null });
  });

  it("une nouvelle tentative sur 5xx puis succès ; sur erreur réseau aussi", async () => {
    const { calls, impl } = stubFetch((_call, index) =>
      index === 0 ? new Response("Bad gateway", { status: 502 }) : jsonResponse(dfs({ cost: 0.002, result: [{ items: [mapsItem(1)] }] })),
    );
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl);
    const out = await provider.mapsSearch([{ keyword: "x", point: { lat: 1, lng: 2 }, zoom: 14 }]);
    expect(calls).toHaveLength(2);
    expect(out.data[0]).toHaveLength(1);

    let n = 0;
    const flaky = (async () => {
      n += 1;
      if (n === 1) throw new TypeError("fetch failed");
      return jsonResponse(dfs({ cost: 0.0054, result: [{ items: [{ type: "google_business_info", title: "Cabinet" }] }] }));
    }) as unknown as typeof fetch;
    const snapshot = await new DataForSeoProvider(LOGIN, PASSWORD, flaky).businessInfo({ placeId: "p", cid: null, title: null, near: null });
    expect(n).toBe(2);
    expect(snapshot.data?.title).toBe("Cabinet");
  });

  it("deux 5xx de suite : erreur explicite « DataForSEO <endpoint> <statut>: <message> », sans identifiants", async () => {
    const { calls, impl } = stubFetch(() => new Response("Service unavailable", { status: 503 }));
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl);
    const promise = provider.mapsSearch([{ keyword: "x", point: { lat: 1, lng: 2 }, zoom: 14 }]);
    await expect(promise).rejects.toThrow("DataForSEO /serp/google/maps/live/advanced 503: Service unavailable");
    await promise.catch((err: Error) => {
      expect(err.message).not.toContain(PASSWORD);
      expect(err.message).not.toContain(LOGIN);
      expect(err.message).not.toContain(EXPECTED_AUTH);
    });
    expect(calls).toHaveLength(2);
  });

  it("4xx HTTP et statut API ≠ 20000 : pas de nouvelle tentative, erreur explicite", async () => {
    const unauthorized = stubFetch(() => new Response("Unauthorized", { status: 401 }));
    await expect(
      new DataForSeoProvider(LOGIN, PASSWORD, unauthorized.impl).mapsSearch([{ keyword: "x", point: { lat: 1, lng: 2 }, zoom: 14 }]),
    ).rejects.toThrow("DataForSEO /serp/google/maps/live/advanced 401: Unauthorized");
    expect(unauthorized.calls).toHaveLength(1);

    const payment = stubFetch(() => jsonResponse({ status_code: 40200, status_message: "Payment Required.", tasks: [] }));
    await expect(
      new DataForSeoProvider(LOGIN, PASSWORD, payment.impl).businessInfo({ placeId: "p", cid: null, title: null, near: null }),
    ).rejects.toThrow("DataForSEO /business_data/google/my_business_info/live 40200: Payment Required.");
    expect(payment.calls).toHaveLength(1);

    const taskError = stubFetch(() => jsonResponse({ ...dfs({}), tasks: [{ id: "t", status_code: 40501, status_message: "Invalid Field: 'keyword'.", cost: 0 }] }));
    await expect(
      new DataForSeoProvider(LOGIN, PASSWORD, taskError.impl).mapsSearch([{ keyword: "x", point: { lat: 1, lng: 2 }, zoom: 14 }]),
    ).rejects.toThrow("DataForSEO /serp/google/maps/live/advanced 40501: Invalid Field: 'keyword'.");
  });

  it("délai dépassé : la requête est abandonnée (AbortController), puis une seule nouvelle tentative", async () => {
    const { calls, impl } = stubFetch(
      (_call) =>
        new Promise<Response>((_resolve, reject) => {
          // Un fetch qui n'aboutit jamais, mais respecte le signal
          const init = (impl as unknown as { mock: { calls: [unknown, RequestInit][] } }).mock.calls.at(-1)?.[1];
          init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
    );
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl, { timeoutMs: 15 });
    await expect(provider.businessInfo({ placeId: "p", cid: null, title: null, near: null })).rejects.toThrow(
      "DataForSEO /business_data/google/my_business_info/live réseau: délai dépassé",
    );
    expect(calls).toHaveLength(2);
  });

  it("un point sur 49 en échec : les autres sont relevés, coût des appels aboutis connu, failedPoints = 1", async () => {
    const points = gridPoints({ lat: 43.9289, lng: 2.1464 }, 5);
    const failingCoordinate = `${points[6]!.lat},${points[6]!.lng},14z`;
    const { calls, impl } = stubFetch((call) => {
      const [task] = call.body as { location_coordinate: string }[];
      // Le point 7 échoue deux fois (5xx puis 5xx) : null, sans arrêter la grille
      if (task!.location_coordinate === failingCoordinate) return new Response("Bad gateway", { status: 502 });
      return jsonResponse(dfs({ cost: 0.002, result: [{ items: [mapsItem(1, { title: task!.location_coordinate })] }] }));
    });
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl, { concurrency: 4 });
    const out = await provider.mapsSearch(points.map((point) => ({ keyword: "x", point, zoom: 14, depth: 20 })));
    expect(out.failedPoints).toBe(1);
    expect(out.data[6]).toBeNull();
    expect(out.data.filter((d) => d !== null)).toHaveLength(48);
    expect(out.data[5]![0]!.title).toBe(`${points[5]!.lat},${points[5]!.lng},14z`);
    expect(out.costUsd).toBeCloseTo(48 * 0.002, 6);
    // Le point en échec a été retenté une fois
    expect(calls).toHaveLength(50);
  });

  it("tous les points en échec : DataForSeoError portant le coût déjà facturé (tâches refusées avec coût)", async () => {
    const { calls, impl } = stubFetch(() =>
      jsonResponse({ ...dfs({}), tasks: [{ id: "t", status_code: 40501, status_message: "Invalid Field: 'keyword'.", cost: 0.002 }] }),
    );
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl, { concurrency: 4 });
    const inputs = Array.from({ length: 5 }, (_, i) => ({ keyword: "x", point: { lat: i, lng: i }, zoom: 14 }));
    const promise = provider.mapsSearch(inputs);
    await expect(promise).rejects.toBeInstanceOf(DataForSeoError);
    await promise.catch((err: DataForSeoError) => {
      expect(err.message).toBe("DataForSEO /serp/google/maps/live/advanced 40501: Invalid Field: 'keyword'.");
      expect(err.costUsd).toBeCloseTo(0.01, 6);
    });
    expect(calls).toHaveLength(5);
  });

  it("au-delà de 10 échecs : les requêtes en vol sont annulées et les points restants ne sont plus lancés", async () => {
    const { calls, impl } = stubFetch(() => new Response("Service unavailable", { status: 503 }));
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl, { concurrency: 4 });
    const points = gridPoints({ lat: 43.9289, lng: 2.1464 }, 5);
    const promise = provider.mapsSearch(points.map((point) => ({ keyword: "x", point, zoom: 14 })));
    await expect(promise).rejects.toBeInstanceOf(DataForSeoError);
    // 11 échecs suffisent (2 tentatives chacun, concurrence 4) : bien moins que 2 × 49 appels
    expect(calls.length).toBeLessThan(2 * 49);
    expect(calls.length).toBeGreaterThanOrEqual(11);
  });

  it("task_post : jamais de nouvelle tentative sur 5xx ni sur erreur réseau (la tâche a pu être créée et facturée)", async () => {
    expect(isRetryableRequest("/business_data/google/reviews/task_post", "POST")).toBe(false);
    expect(isRetryableRequest("/serp/google/maps/live/advanced", "POST")).toBe(true);
    expect(isRetryableRequest("/business_data/google/my_business_info/live", "POST")).toBe(true);
    expect(isRetryableRequest("/business_data/google/reviews/task_get/abc", "GET")).toBe(true);
    const { calls, impl } = stubFetch(() => new Response("Bad gateway", { status: 502 }));
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl);
    await expect(provider.postReviewsTask({ placeId: "p", cid: null, near: null, depth: 50 })).rejects.toThrow(
      "DataForSEO /business_data/google/reviews/task_post 502: Bad gateway",
    );
    expect(calls).toHaveLength(1);
    const network = stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    await expect(
      new DataForSeoProvider(LOGIN, PASSWORD, network.impl).postReviewsTask({ placeId: "p", cid: null, near: null, depth: 50 }),
    ).rejects.toThrow("réseau");
    expect(network.calls).toHaveLength(1);
  });

  it("mapConcurrent : ordre conservé, arrêt des lancements à la première erreur", async () => {
    const order = await mapConcurrent([3, 1, 2], 2, async (n) => {
      await new Promise((resolve) => setTimeout(resolve, n * 3));
      return n * 10;
    });
    expect(order).toEqual([30, 10, 20]);
    let started = 0;
    await expect(
      mapConcurrent([1, 2, 3, 4, 5, 6], 1, async (n) => {
        started += 1;
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
    expect(started).toBe(2);
  });
});

describe("DataForSeoProvider — fiche d'établissement", () => {
  const item: DfsBusinessItem = {
    type: "google_business_info",
    title: "Claire Dupont Sophrologie",
    description: "Sophrologue certifiée à Albi.",
    category: "Sophrologue",
    additional_categories: ["Praticien bien-être", null],
    cid: "194604053573767737",
    place_id: "ChIJabc",
    address: "14 rue de la Berbie, 81000 Albi",
    phone: "05 63 00 00 00",
    url: "https://claire-dupont.harmony-web.fr/",
    main_image: "https://lh5.googleusercontent.com/p/x",
    total_photos: 12,
    latitude: 43.9289,
    longitude: 2.1464,
    is_claimed: true,
    attributes: {
      available_attributes: {
        accessibility: ["wheelchair_accessible_entrance", "wheelchair_accessible_entrance"],
        planning: ["appointment_required"],
        service_options: ["offers_online_appointments", "some_new_attribute"],
      },
    },
    rating: { value: 4.9, votes_count: 34 },
    rating_distribution: { "1": 0, "2": 0, "3": 1, "4": 2, "5": 31 },
    work_time: {
      work_hours: {
        timetable: {
          sunday: null,
          monday: [{ open: { hour: 9, minute: 0 }, close: { hour: 12, minute: 30 } }, { open: { hour: 14, minute: 0 }, close: { hour: 19, minute: 0 } }],
          tuesday: [{ open: { hour: 9, minute: 0 }, close: { hour: 19, minute: 0 } }],
        },
        current_status: "open",
      },
    },
    book_online_url: "https://rdv.exemple.fr",
  };

  it("mot-clé « cid: » prioritaire, rayon ≥ 199,9 m autour du point, instantané normalisé", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse(dfs({ cost: 0.0054, result: [{ items: [item] }] })));
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl);
    const out = await provider.businessInfo({ placeId: "ChIJabc", cid: "194604053573767737", title: "Claire", near: { lat: 43.9289, lng: 2.1464 } });
    expect(calls[0]!.url).toBe(`${DATAFORSEO_BASE}/business_data/google/my_business_info/live`);
    expect(calls[0]!.body).toEqual([{ keyword: "cid:194604053573767737", location_coordinate: "43.9289,2.1464,1000", language_code: "fr" }]);
    expect(out.costUsd).toBe(0.0054);
    const s = out.data!;
    expect(s.source).toBe("dataforseo");
    expect(s).toMatchObject({
      placeId: "ChIJabc",
      cid: "194604053573767737",
      title: "Claire Dupont Sophrologie",
      description: "Sophrologue certifiée à Albi.",
      category: "Sophrologue",
      additionalCategories: ["Praticien bien-être"],
      phone: "05 63 00 00 00",
      website: "https://claire-dupont.harmony-web.fr/",
      isClaimed: true,
      rating: 4.9,
      votes: 34,
      ratingDistribution: { "1": 0, "2": 0, "3": 1, "4": 2, "5": 31 },
      totalPhotos: 12,
      hasHours: true,
      hours: { lundi: ["09:00–12:30", "14:00–19:00"], mardi: ["09:00–19:00"] },
      attributes: ["Entrée accessible PMR", "Sur rendez-vous", "Rendez-vous en ligne", "Some new attribute"],
      bookOnlineUrl: "https://rdv.exemple.fr",
      mainImage: "https://lh5.googleusercontent.com/p/x",
      location: { lat: 43.9289, lng: 2.1464 },
    });
    expect(new Date(s.fetchedAt).getTime()).not.toBeNaN();
  });

  it("sans cid : « place_id: », sans coordonnées : code pays France ; horaires absents → hasHours null / vides → false", async () => {
    const { calls, impl } = stubFetch((_call, index) =>
      jsonResponse(
        dfs({
          cost: 0.0054,
          result: [{ items: [index === 0 ? { title: "Sans horaires", description: null } : { title: "Fermé", work_time: null }] }],
        }),
      ),
    );
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl);
    const first = await provider.businessInfo({ placeId: "ChIJabc", cid: null, title: null, near: null });
    expect(calls[0]!.body).toEqual([{ keyword: "place_id:ChIJabc", location_code: 2250, language_code: "fr" }]);
    expect(first.data).toMatchObject({ title: "Sans horaires", description: null, hasHours: null, hours: null, attributes: [], additionalCategories: [], location: null });
    const second = await provider.businessInfo({ placeId: null, cid: null, title: "Cabinet Fermé", near: null });
    expect(calls[1]!.body).toEqual([{ keyword: "Cabinet Fermé", location_code: 2250, language_code: "fr" }]);
    expect(second.data?.hasHours).toBe(false);
  });

  it("fiche introuvable → null (coût conservé) ; sans identifiant ni nom → null sans appel", async () => {
    const { calls, impl } = stubFetch(() => jsonResponse(dfs({ cost: 0.0054, result: [{ items: [] }] })));
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl);
    expect(await provider.businessInfo({ placeId: "p", cid: null, title: null, near: null })).toEqual({ data: null, costUsd: 0.0054, mode: "dataforseo" });
    expect(await provider.businessInfo({ placeId: null, cid: null, title: "  ", near: null })).toEqual({ data: null, costUsd: 0, mode: "dataforseo" });
    expect(calls).toHaveLength(1);
  });

  it("URL tierces : http(s) seulement ; image principale sur un hôte Google uniquement", async () => {
    expect(httpUrlOrNull("https://exemple.fr/x")).toBe("https://exemple.fr/x");
    expect(httpUrlOrNull("javascript:alert(1)")).toBeNull();
    expect(httpUrlOrNull("data:image/png;base64,AAAA")).toBeNull();
    expect(httpUrlOrNull("exemple.fr")).toBeNull();
    expect(httpUrlOrNull("https://lh3.googleusercontent.com/p/x", ["googleusercontent.com"])).toBe("https://lh3.googleusercontent.com/p/x");
    expect(httpUrlOrNull("https://evil.example/googleusercontent.com", ["googleusercontent.com"])).toBeNull();
    expect(httpUrlOrNull("https://notgoogleusercontent.com/x", ["googleusercontent.com"])).toBeNull();
    const { impl } = stubFetch(() =>
      jsonResponse(
        dfs({
          cost: 0.0054,
          result: [{ items: [{ ...item, url: "javascript:alert(1)", book_online_url: "https://rdv.exemple.fr", main_image: "https://evil.example/photo.jpg" }] }],
        }),
      ),
    );
    const out = await new DataForSeoProvider(LOGIN, PASSWORD, impl).businessInfo({ placeId: "p", cid: null, title: null, near: null });
    expect(out.data).toMatchObject({ website: null, bookOnlineUrl: "https://rdv.exemple.fr", mainImage: null });
  });

  it("libellés d'attributs : dictionnaire français, sinon identifiant humanisé", () => {
    expect(attributeLabel("wheelchair_accessible_entrance")).toBe("Entrée accessible PMR");
    expect(attributeLabel("ONLINE_CARE")).toBe("Consultations à distance");
    expect(attributeLabel("good_for_kids")).toBe("Good for kids");
  });
});

describe("DataForSeoProvider — avis (tâches)", () => {
  it("task_post : place_id et cid en champs séparés, profondeur multiple de 10, sort_by newest, taskId rendu", async () => {
    const { calls, impl } = stubFetch(() =>
      jsonResponse({ status_code: 20000, status_message: "Ok.", cost: 0.00375, tasks: [{ id: "0123-abcd", status_code: 20100, status_message: "Task Created.", cost: 0.00375, result: null }] }),
    );
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl);
    const out = await provider.postReviewsTask({ placeId: "ChIJabc", cid: "123", near: { lat: 43.9, lng: 2.1 }, depth: 45 });
    expect(calls[0]!.url).toBe(`${DATAFORSEO_BASE}/business_data/google/reviews/task_post`);
    expect(calls[0]!.body).toEqual([{ place_id: "ChIJabc", location_coordinate: "43.9,2.1,1000", language_code: "fr", depth: 50, sort_by: "newest" }]);
    expect(out).toEqual({ data: { taskId: "0123-abcd" }, costUsd: 0.00375, mode: "dataforseo" });

    await provider.postReviewsTask({ placeId: null, cid: "123", near: null, depth: 50 });
    expect(calls[1]!.body).toEqual([{ cid: "123", location_code: 2250, language_code: "fr", depth: 50, sort_by: "newest" }]);

    await expect(provider.postReviewsTask({ placeId: null, cid: null, near: null, depth: 50 })).rejects.toThrow("identifiant de fiche manquant");
    expect(calls).toHaveLength(2);
  });

  it("task_post refusée par l'API → erreur explicite", async () => {
    const { impl } = stubFetch(() => jsonResponse({ ...dfs({}), tasks: [{ status_code: 40501, status_message: "Invalid Field: 'depth'.", cost: 0 }] }));
    await expect(
      new DataForSeoProvider(LOGIN, PASSWORD, impl).postReviewsTask({ placeId: "p", cid: null, near: null, depth: 50 }),
    ).rejects.toThrow("DataForSEO /business_data/google/reviews/task_post 40501: Invalid Field: 'depth'.");
  });

  it("task_get : 40602 → pending, 20000 → done (avis normalisés), autre statut → error, identifiant invalide refusé", async () => {
    const reviewItems = [
      {
        type: "google_reviews_search",
        review_id: "rev-1",
        review_text: "Un accueil chaleureux.",
        timestamp: "2026-10-01 14:09:32 +00:00",
        rating: { value: 5, votes_count: 1 },
        profile_name: "Camille D.",
        profile_image_url: "https://lh3.googleusercontent.com/a/x",
        owner_answer: "Merci Camille !",
        owner_timestamp: "2026-10-02 09:00:00 +00:00",
        review_url: "https://www.google.com/maps/reviews/data=x",
      },
      { type: "google_reviews_search", review_id: "rev-2", review_text: null, timestamp: "n'importe quoi", rating: { value: 2 }, profile_name: "  ", owner_answer: null },
      { type: "google_reviews_search", review_id: null, review_text: "sans identifiant" },
    ];
    const { calls, impl } = stubFetch((call) => {
      if (call.url.endsWith("/task_get/pending-1")) {
        return jsonResponse({ status_code: 20000, status_message: "Ok.", cost: 0, tasks: [{ id: "pending-1", status_code: 40602, status_message: "Task In Queue.", cost: 0, result: null }] });
      }
      if (call.url.endsWith("/task_get/done-1")) {
        return jsonResponse(dfs({ id: "done-1", cost: 0, result: [{ reviews_count: 34, rating: { value: 4.9, votes_count: 34 }, items: reviewItems }] }));
      }
      return jsonResponse({ status_code: 20000, status_message: "Ok.", cost: 0, tasks: [{ id: "lost-1", status_code: 40401, status_message: "Task Not Found.", cost: 0, result: null }] });
    });
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl);

    const pending = await provider.fetchReviewsTask("pending-1");
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe(`${DATAFORSEO_BASE}/business_data/google/reviews/task_get/pending-1`);
    expect(calls[0]!.body).toBeUndefined();
    expect(pending.data).toEqual({ status: "pending" });

    const done = await provider.fetchReviewsTask("done-1");
    expect(done.data.status).toBe("done");
    if (done.data.status !== "done") throw new Error("inattendu");
    expect(done.data.total).toBe(34);
    expect(done.data.rating).toBe(4.9);
    expect(done.data.reviews).toHaveLength(2);
    expect(done.data.reviews[0]).toEqual({
      sourceReviewId: "rev-1",
      authorName: "Camille D.",
      authorPhotoUrl: "https://lh3.googleusercontent.com/a/x",
      rating: 5,
      text: "Un accueil chaleureux.",
      reviewedAt: new Date("2026-10-01T14:09:32Z"),
      ownerReply: "Merci Camille !",
      ownerRepliedAt: new Date("2026-10-02T09:00:00Z"),
      reviewUrl: "https://www.google.com/maps/reviews/data=x",
    });
    expect(done.data.reviews[1]).toMatchObject({ sourceReviewId: "rev-2", authorName: "Client Google", rating: 2, text: "", reviewedAt: null, ownerReply: null, reviewUrl: null });

    const lost = await provider.fetchReviewsTask("lost-1");
    expect(lost.data).toEqual({ status: "error", message: "40401: Task Not Found." });

    await expect(provider.fetchReviewsTask("../autre")).rejects.toThrow("identifiant de tâche invalide");
  });

  it("avis sans note ignoré (jamais de 5 inventé) ; photo d'auteur et lien d'avis hors hôtes Google écartés", () => {
    expect(reviewFromItem({ review_id: "r1", review_text: "Bien", rating: null })).toBeNull();
    expect(reviewFromItem({ review_id: "r2", review_text: "Bien" })).toBeNull();
    const kept = reviewFromItem({
      review_id: "r3",
      review_text: "Bien",
      rating: { value: 4.4 },
      profile_image_url: "https://evil.example/a.png",
      review_url: "javascript:alert(1)",
    });
    expect(kept).toMatchObject({ rating: 4, authorPhotoUrl: null, reviewUrl: null });
    expect(reviewFromItem({ review_id: "r4", rating: { value: 5 }, review_url: "https://www.google.com/maps/reviews/x" })?.reviewUrl).toBe(
      "https://www.google.com/maps/reviews/x",
    );
  });

  it("parseDataForSeoDate : format DataForSEO, ISO, invalide", () => {
    expect(parseDataForSeoDate("2024-05-15 14:09:32 +00:00")).toEqual(new Date("2024-05-15T14:09:32Z"));
    expect(parseDataForSeoDate("2024-05-15 16:09:32 +02:00")).toEqual(new Date("2024-05-15T14:09:32Z"));
    expect(parseDataForSeoDate("2024-05-15T14:09:32Z")).toEqual(new Date("2024-05-15T14:09:32Z"));
    expect(parseDataForSeoDate("hier")).toBeNull();
    expect(parseDataForSeoDate(null)).toBeNull();
  });
});

describe("createLocalSearchProvider et mock", () => {
  it("identifiants présents → client réel ; absents ou DATAFORSEO_MOCK=1 → mock", () => {
    expect(createLocalSearchProvider({ DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p" } as NodeJS.ProcessEnv).mode).toBe("dataforseo");
    expect(createLocalSearchProvider({ DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p", DATAFORSEO_MOCK: "1" } as NodeJS.ProcessEnv).mode).toBe("mock");
    expect(createLocalSearchProvider({} as NodeJS.ProcessEnv).mode).toBe("mock");
  });

  it("mock : relevé déterministe de 49 points, fiche, tâche d'avis terminée immédiatement", async () => {
    const provider = new MockLocalSearchProvider({ placeId: "mock-own", cid: null, title: "Votre cabinet" });
    const points = gridPoints({ lat: 43.9289, lng: 2.1464 }, 5);
    const inputs = points.map((point) => ({ keyword: "sophrologue albi", point, zoom: 14, depth: 20 }));
    const a = await provider.mapsSearch(inputs);
    const b = await provider.mapsSearch(inputs);
    expect(a.data).toEqual(b.data);
    expect(a.data).toHaveLength(49);
    expect(a.costUsd).toBe(0);
    const info = await provider.businessInfo({ placeId: "mock-own", cid: null, title: "Votre cabinet", near: null });
    expect(info.data?.source).toBe("mock");
    const task = await provider.postReviewsTask({ placeId: "mock-own", cid: null, near: null, depth: 50 });
    const result = await provider.fetchReviewsTask(task.data.taskId);
    expect(result.data.status).toBe("done");
  });
});
