import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_SCAN_MAX_MISSING_POINTS } from "@theralys/shared";
import { setApiUsageSink, setApiUsageSinkFactory, withApiUsage, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { DataForSeoClient, type DfsTask } from "./client";
import { DataForSeoError, DataForSeoProvider, MockLocalSearchProvider } from "./index";

const LOGIN = "login@exemple.fr";
const PASSWORD = "motdepasse-secret";
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const MAPS = "/serp/google/maps/live/advanced";
const TASK_POST = "/business_data/google/reviews/task_post";
const TASK_ID = "04171234-5678-0299-0000-0a1b2c3d4e5f";

type Call = { url: string; method: string; signal: AbortSignal | null };
type Init = { method: "GET" | "POST"; body?: unknown };

/** Client nu : `request` (protégé) exposé tel que les fournisseurs l'appellent. */
class Probe extends DataForSeoClient {
  call<R = unknown>(endpoint: string, init: Init = { method: "POST", body: [{}] }, signal?: AbortSignal): Promise<{ tasks: DfsTask<R>[]; cost: number }> {
    return this.request<R>(endpoint, init, signal);
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

/** Réponse DataForSEO : statut général « Ok. », une tâche par coût donné. */
function dfs(costs: (number | null)[] = [0.002], task: Record<string, unknown> = {}) {
  return {
    status_code: 20000,
    status_message: "Ok.",
    cost: costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0),
    tasks: costs.map((cost, index) => ({ id: `task-${index + 1}`, status_code: 20000, status_message: "Ok.", cost, result: [], ...task })),
  };
}

function stubFetch(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = { url: String(input), method: init?.method ?? "GET", signal: init?.signal ?? null };
    calls.push(call);
    return respond(call, calls.length - 1);
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

/** Requête qui ne répond jamais : rejetée quand son signal l'annule (comme `fetch`). */
function hanging(call: Call): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    call.signal?.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")));
  });
}

function capture(): ResolvedApiUsageEvent[] {
  const events: ResolvedApiUsageEvent[] = [];
  setApiUsageSink(async (event) => {
    events.push(event);
  });
  return events;
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
/** L'opération enregistrée désigne l'endpoint, avec ou sans barre oblique initiale. */
const operationOf = (endpoint: string) => new RegExp(`^/?${endpoint.replace(/^\//, "")}$`);

afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  vi.restoreAllMocks();
});

describe("DataForSeoClient.request — registre des appels API", () => {
  it("appel abouti : un événement dataforseo au coût réel renvoyé par l'API, rattaché au contexte", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(() => jsonResponse(dfs([0.0123])));
    const result = await withApiUsage({ feature: "google_profile", siteId: SITE_ID }, () => new Probe(LOGIN, PASSWORD, impl).call(MAPS));
    expect(result.cost).toBe(0.0123);
    expect(calls).toHaveLength(1);
    expect(events).toHaveLength(1);
    const { createdAt, durationMs, operation, ...event } = events[0]!;
    expect(operation).toMatch(operationOf(MAPS));
    expect(event).toEqual({
      provider: "dataforseo",
      feature: "google_profile",
      siteId: SITE_ID,
      model: null,
      status: "ok",
      requests: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      units: 1,
      costUsd: 0.0123,
      costSource: "provider",
      error: null,
      meta: null,
    });
    expect(createdAt).toBeInstanceOf(Date);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("coût : somme des coûts des tâches de la réponse (null compté pour 0)", async () => {
    const events = capture();
    const { impl } = stubFetch(() => jsonResponse(dfs([0.002, 0.0015, null])));
    await new Probe(LOGIN, PASSWORD, impl).call(MAPS);
    expect(events[0]).toMatchObject({ units: 1, costUsd: 0.0035, costSource: "provider" });
  });

  it("appel gratuit (coût réel nul) : l'origine du coût reste « provider »", async () => {
    const events = capture();
    const { impl } = stubFetch(() => jsonResponse(dfs([0])));
    await new Probe(LOGIN, PASSWORD, impl).call(`/business_data/google/reviews/task_get/${TASK_ID}`, { method: "GET" });
    expect(events[0]).toMatchObject({ status: "ok", units: 1, costUsd: 0, costSource: "provider" });
  });

  it("tâche refusée mais facturée (statut de tâche ≠ 20000) : l'appel HTTP a abouti, son coût est inscrit", async () => {
    const events = capture();
    const { impl } = stubFetch(() => jsonResponse(dfs([0.002], { status_code: 40501, status_message: "Invalid Field: 'keyword'." })));
    const { tasks } = await new Probe(LOGIN, PASSWORD, impl).call(MAPS);
    expect(tasks[0]!.status_code).toBe(40501);
    expect(events[0]).toMatchObject({ status: "ok", costUsd: 0.002, costSource: "provider" });
  });

  it("erreur HTTP (401) : événement en erreur sans coût ni unité, erreur relancée", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(() => jsonResponse({ status_code: 40100, status_message: "You are not authorized." }, 401));
    const pending = withApiUsage({ feature: "google_ads", siteId: SITE_ID }, () => new Probe(LOGIN, PASSWORD, impl).call(MAPS));
    await expect(pending).rejects.toThrow(/^DataForSEO \/serp\/google\/maps\/live\/advanced 401: /);
    expect(calls).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "dataforseo", feature: "google_ads", siteId: SITE_ID, status: "error", units: 0, costUsd: 0, costSource: "free" });
    expect(events[0]!.operation).toMatch(operationOf(MAPS));
    expect(events[0]!.error).toMatch(/^DataForSEO \/serp\/google\/maps\/live\/advanced 401: .*You are not authorized/);
  });

  it("statut général refusé (HTTP 200, statut ≠ 20000) : inscrit en erreur, sans coût", async () => {
    const events = capture();
    const { impl } = stubFetch(() => jsonResponse({ status_code: 40200, status_message: "Payment Required.", cost: 0, tasks: [] }));
    await expect(new Probe(LOGIN, PASSWORD, impl).call(MAPS)).rejects.toThrow("DataForSEO /serp/google/maps/live/advanced 40200: Payment Required.");
    expect(events.map((event) => [event.status, event.costUsd, event.error])).toEqual([["error", 0, "DataForSEO /serp/google/maps/live/advanced 40200: Payment Required."]]);
  });

  it("endpoint « live » : 5xx puis succès → un seul événement abouti (la nouvelle tentative fait partie de l'appel)", async () => {
    const events = capture();
    const { calls, impl } = stubFetch((_call, index) => (index === 0 ? new Response("Bad gateway", { status: 502 }) : jsonResponse(dfs([0.002]))));
    await new Probe(LOGIN, PASSWORD, impl).call(MAPS);
    expect(calls).toHaveLength(2);
    expect(events.map((event) => [event.status, event.costUsd, event.costSource])).toEqual([["ok", 0.002, "provider"]]);
  });

  it("endpoint « live » : 5xx deux fois → un seul événement en erreur", async () => {
    const events = capture();
    const { calls, impl } = stubFetch((_call, index) => new Response("panne", { status: index === 0 ? 500 : 503 }));
    await expect(new Probe(LOGIN, PASSWORD, impl).call(MAPS)).rejects.toThrow("DataForSEO /serp/google/maps/live/advanced 503: panne");
    expect(calls).toHaveLength(2);
    expect(events.map((event) => [event.status, event.costUsd, event.error])).toEqual([["error", 0, "DataForSEO /serp/google/maps/live/advanced 503: panne"]]);
  });

  it("task_post : jamais de nouvelle tentative, l'échec est inscrit une fois", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(() => new Response("panne", { status: 500 }));
    await expect(new Probe(LOGIN, PASSWORD, impl).call(TASK_POST)).rejects.toThrow(/500: panne/);
    expect(calls).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "error", costUsd: 0 });
    expect(events[0]!.operation).toMatch(operationOf(TASK_POST));
  });

  it("délai dépassé (délai du client, pas une annulation de l'appelant) : inscrit en erreur", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(hanging);
    await expect(new Probe(LOGIN, PASSWORD, impl, { timeoutMs: 5 }).call(MAPS)).rejects.toThrow("DataForSEO /serp/google/maps/live/advanced réseau: délai dépassé");
    expect(calls).toHaveLength(2);
    expect(events.map((event) => [event.status, event.error])).toEqual([["error", "DataForSEO /serp/google/maps/live/advanced réseau: délai dépassé"]]);
  });

  it("appel annulé par le signal de l'appelant avant son départ : rien n'est envoyé, rien n'est inscrit", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(() => jsonResponse(dfs()));
    const controller = new AbortController();
    controller.abort();
    await expect(new Probe(LOGIN, PASSWORD, impl).call(MAPS, { method: "POST", body: [{}] }, controller.signal)).rejects.toThrow("DataForSEO /serp/google/maps/live/advanced: annulé");
    expect(calls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("appel annulé par le signal de l'appelant en cours de route : pas inscrit, pas de nouvelle tentative", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(hanging);
    const controller = new AbortController();
    const pending = new Probe(LOGIN, PASSWORD, impl).call(MAPS, { method: "POST", body: [{}] }, controller.signal);
    const rejection = expect(pending).rejects.toThrow("DataForSEO /serp/google/maps/live/advanced: annulé");
    await settle();
    expect(calls).toHaveLength(1);
    controller.abort();
    await rejection;
    expect(calls).toHaveLength(1);
    expect(calls[0]!.signal?.aborted).toBe(true);
    expect(events).toHaveLength(0);
  });

  it("signal fourni mais jamais déclenché : succès et échecs sont inscrits comme d'habitude", async () => {
    const events = capture();
    const { impl } = stubFetch((_call, index) => (index === 0 ? jsonResponse(dfs([0.004])) : new Response("refus", { status: 400 })));
    const probe = new Probe(LOGIN, PASSWORD, impl);
    const controller = new AbortController();
    await probe.call(MAPS, { method: "POST", body: [{}] }, controller.signal);
    await expect(probe.call(MAPS, { method: "POST", body: [{}] }, controller.signal)).rejects.toThrow(/400: refus/);
    expect(events.map((event) => [event.status, event.costUsd])).toEqual([
      ["ok", 0.004],
      ["error", 0],
    ]);
  });

  it("opération : l'endpoint, sans préfixe de version (« /v3/ ») ni barre oblique finale, borné à 80 caractères", async () => {
    const events = capture();
    const { impl } = stubFetch(() => jsonResponse(dfs()));
    const probe = new Probe(LOGIN, PASSWORD, impl);
    await probe.call("/v3/keywords_data/google_ads/keywords_for_keywords/live");
    await probe.call("/v3/serp/google/maps/live/advanced///");
    await probe.call(`/v3/${"segment/".repeat(30)}`);
    expect(events[0]!.operation).toBe("keywords_data/google_ads/keywords_for_keywords/live");
    expect(events[1]!.operation).toBe("serp/google/maps/live/advanced");
    expect(events[2]!.operation).toHaveLength(80);
    expect(events[2]!.operation.startsWith("segment/segment/")).toBe(true);
  });

  it("ni l'identifiant ni le mot de passe n'entrent dans les événements", async () => {
    const events = capture();
    const { impl } = stubFetch((_call, index) => (index === 0 ? jsonResponse(dfs()) : jsonResponse({ status_message: "Unauthorized" }, 401)));
    const probe = new Probe(LOGIN, PASSWORD, impl);
    await probe.call(MAPS);
    await probe.call(MAPS).catch(() => undefined);
    expect(events).toHaveLength(2);
    const dump = JSON.stringify(events);
    for (const secret of [LOGIN, PASSWORD, Buffer.from(`${LOGIN}:${PASSWORD}`).toString("base64")]) expect(dump).not.toContain(secret);
  });

  it("sans puits : le résultat est rendu, l'erreur relancée", async () => {
    const { impl } = stubFetch((_call, index) => (index === 0 ? jsonResponse(dfs([0.002])) : new Response("refus", { status: 400 })));
    const probe = new Probe(LOGIN, PASSWORD, impl);
    await expect(probe.call(MAPS)).resolves.toMatchObject({ cost: 0.002 });
    await expect(probe.call(MAPS)).rejects.toThrow(/400: refus/);
  });

  it("l'opération enregistrée pour un endpoint réel ne commence pas par une barre oblique", async () => {
    const events = capture();
    const { impl } = stubFetch(() => jsonResponse(dfs()));
    await new Probe(LOGIN, PASSWORD, impl).call(MAPS);
    expect(events[0]!.operation).toBe("serp/google/maps/live/advanced");
  });
});

describe("DataForSeoProvider — registre des appels API", () => {
  const point = (n: number) => ({ keyword: "sophrologue albi", point: { lat: 43.9289 + n / 1000, lng: 2.1464 }, zoom: 14, depth: 20 });

  it("relevé de positions : un événement par point (un appel HTTP chacun), coût réel de chaque appel", async () => {
    const events = capture();
    const { calls, impl } = stubFetch((_call, index) => jsonResponse(dfs([0.002 + index / 10_000], { result: [{ items: [] }] })));
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl, { concurrency: 1 });
    const out = await withApiUsage({ feature: "google_profile", siteId: SITE_ID }, () => provider.mapsSearch([point(0), point(1), point(2)]));
    expect(calls).toHaveLength(3);
    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(event).toMatchObject({ provider: "dataforseo", feature: "google_profile", siteId: SITE_ID, status: "ok", units: 1, costSource: "provider" });
      expect(event.operation).toMatch(operationOf(MAPS));
    }
    expect(events.map((event) => event.costUsd)).toEqual([0.002, 0.0021, 0.0022]);
    // Le registre et le coût rendu à l'appelant disent la même chose
    expect(events.reduce((sum, event) => sum + event.costUsd, 0)).toBeCloseTo(out.costUsd, 9);
  });

  it(`relevé interrompu après plus de ${GOOGLE_SCAN_MAX_MISSING_POINTS} points en échec : les échecs sont inscrits, les requêtes annulées en vol ne le sont pas`, async () => {
    const events = capture();
    const failing = GOOGLE_SCAN_MAX_MISSING_POINTS + 1;
    const { calls, impl } = stubFetch((call, index) => (index < failing ? new Response("refus", { status: 400 }) : hanging(call)));
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl, { concurrency: 4 });
    const pending = withApiUsage({ feature: "google_profile", siteId: SITE_ID }, () => provider.mapsSearch(Array.from({ length: 30 }, (_, n) => point(n))));
    await expect(pending).rejects.toBeInstanceOf(DataForSeoError);
    // Des requêtes étaient en vol au moment de l'interruption : elles ont été annulées par leur signal
    expect(calls.length).toBeGreaterThan(failing);
    expect(calls.length).toBeLessThan(30);
    for (const call of calls.slice(failing)) expect(call.signal?.aborted).toBe(true);
    expect(events).toHaveLength(failing);
    for (const event of events) {
      expect(event).toMatchObject({ status: "error", costUsd: 0, feature: "google_profile", siteId: SITE_ID });
      expect(event.error).toMatch(/400: refus$/);
    }
  });

  it("identifiant de tâche invalide : refusé avant tout appel, rien n'est inscrit", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(() => jsonResponse(dfs()));
    await expect(new DataForSeoProvider(LOGIN, PASSWORD, impl).fetchReviewsTask("../../etc")).rejects.toThrow(/identifiant de tâche invalide/);
    expect(calls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("lecture d'une tâche d'avis : un événement, gratuit côté DataForSEO", async () => {
    const events = capture();
    const { calls, impl } = stubFetch(() => jsonResponse(dfs([0], { id: TASK_ID, status_code: 40602, status_message: "Task In Queue." })));
    await withApiUsage({ feature: "google_profile", siteId: SITE_ID }, () => new DataForSeoProvider(LOGIN, PASSWORD, impl).fetchReviewsTask(TASK_ID));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("GET");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "dataforseo", feature: "google_profile", siteId: SITE_ID, status: "ok", units: 1, costUsd: 0, costSource: "provider" });
    expect(events[0]!.operation).toContain("business_data/google/reviews/task_get");
  });

  // L'endpoint de lecture porte l'identifiant de la tâche (« …/task_get/<id> ») : l'opération ne le reprend pas,
  // l'admin regroupe toutes les lectures de tâche sous une même opération.
  it("l'opération d'une lecture de tâche ne contient pas l'identifiant de la tâche", async () => {
    const events = capture();
    const { impl } = stubFetch(() => jsonResponse(dfs([0], { id: TASK_ID, status_code: 40602, status_message: "Task In Queue." })));
    const provider = new DataForSeoProvider(LOGIN, PASSWORD, impl);
    await provider.fetchReviewsTask(TASK_ID);
    await provider.fetchReviewsTask("04171234-5678-0299-0000-ffffffffffff");
    expect(events[0]!.operation).not.toContain(TASK_ID);
    expect(new Set(events.map((event) => event.operation)).size).toBe(1);
  });
});

describe("MockLocalSearchProvider — registre des appels API", () => {
  it("données de démonstration : rien n'est inscrit", async () => {
    const events = capture();
    await new MockLocalSearchProvider().mapsSearch([{ keyword: "sophrologue albi", point: { lat: 43.9289, lng: 2.1464 }, zoom: 14, depth: 20 }]);
    expect(events).toHaveLength(0);
  });
});
