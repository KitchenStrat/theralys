import { afterEach, describe, expect, it, vi } from "vitest";
import { setApiUsageSink, setApiUsageSinkFactory, withApiUsage, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { MockHostingProvider, VercelHostingProvider } from "./index";

const TOKEN = "vercel-jeton-secret-0123456789abcdef";
const PROJECT = "prj_sites_0123456789";
const TEAM = "team_harmony_0123";
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const DOMAIN = "claire-sophrologie-albi.fr";

type Call = { method: string; url: string; body: Record<string, unknown> | null };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

/** Remplace `fetch` global (le client Vercel n'accepte pas de `fetch` injecté). */
function stubFetch(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const call: Call = { method: init?.method ?? "GET", url: String(input), body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null };
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

afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("VercelHostingProvider.attachDomain — registre des appels API", () => {
  it("domaine rattaché : un événement vercel / domain_attach, gratuit, une unité, rattaché au contexte", async () => {
    const events = capture();
    const calls = stubFetch((call) => (call.method === "GET" ? jsonResponse({ name: DOMAIN, verified: true }) : jsonResponse({ name: call.body?.name })));
    const attachment = await withApiUsage({ feature: "domains", siteId: SITE_ID }, () => new VercelHostingProvider(TOKEN, PROJECT, TEAM).attachDomain(DOMAIN));
    expect(attachment).toEqual({ domain: DOMAIN, attached: true, sslReady: true });
    // Trois appels HTTP (domaine nu, www, vérification) : une seule opération au registre
    expect(calls.map((call) => [call.method, call.body?.name ?? null])).toEqual([
      ["POST", DOMAIN],
      ["POST", `www.${DOMAIN}`],
      ["GET", null],
    ]);
    expect(events).toHaveLength(1);
    const { createdAt, durationMs, ...event } = events[0]!;
    expect(event).toEqual({
      provider: "vercel",
      operation: "domain_attach",
      feature: "domains",
      siteId: SITE_ID,
      model: null,
      status: "ok",
      requests: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      units: 1,
      costUsd: 0,
      costSource: "free",
      error: null,
      meta: null,
    });
    expect(createdAt).toBeInstanceOf(Date);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("domaine déjà rattaché (409) ou vérification indisponible : toujours un succès, compté une fois", async () => {
    const events = capture();
    stubFetch((call) => (call.method === "GET" ? new Response("not found", { status: 404 }) : jsonResponse({ error: { code: "domain_already_in_use" } }, 409)));
    await expect(new VercelHostingProvider(TOKEN, PROJECT).attachDomain(DOMAIN)).resolves.toEqual({ domain: DOMAIN, attached: true, sslReady: false });
    expect(events.map((event) => [event.operation, event.status, event.units, event.costUsd, event.costSource])).toEqual([["domain_attach", "ok", 1, 0, "free"]]);
  });

  it("rattachement refusé (403) : événement en erreur sans unité, erreur relancée ; le jeton n'y figure pas", async () => {
    const events = capture();
    const calls = stubFetch(() => jsonResponse({ error: { code: "forbidden", message: "Not authorized" } }, 403));
    await expect(withApiUsage({ feature: "domains", siteId: SITE_ID }, () => new VercelHostingProvider(TOKEN, PROJECT, TEAM).attachDomain(DOMAIN))).rejects.toThrow(/^Vercel domains 403: /);
    expect(calls).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "vercel", operation: "domain_attach", feature: "domains", siteId: SITE_ID, status: "error", units: 0, costUsd: 0, costSource: "free" });
    expect(events[0]!.error).toMatch(/^Vercel domains 403: .*Not authorized/);
    const dump = JSON.stringify(events);
    for (const secret of [TOKEN, PROJECT, TEAM]) expect(dump).not.toContain(secret);
  });

  it("échec au second rattachement (www) : une seule opération, en erreur", async () => {
    const events = capture();
    const calls = stubFetch((_call, index) => (index === 0 ? jsonResponse({ name: DOMAIN }) : new Response("Internal error", { status: 500 })));
    await expect(new VercelHostingProvider(TOKEN, PROJECT).attachDomain(DOMAIN)).rejects.toThrow("Vercel domains 500: Internal error");
    expect(calls).toHaveLength(2);
    expect(events.map((event) => [event.status, event.units, event.error])).toEqual([["error", 0, "Vercel domains 500: Internal error"]]);
  });

  it("connexion impossible : inscrite en erreur, l'erreur d'origine est relancée", async () => {
    const events = capture();
    const failure = new TypeError("fetch failed");
    stubFetch(() => {
      throw failure;
    });
    await expect(new VercelHostingProvider(TOKEN, PROJECT).attachDomain(DOMAIN)).rejects.toBe(failure);
    expect(events.map((event) => [event.status, event.error])).toEqual([["error", "fetch failed"]]);
  });

  it("sans puits : le domaine est rattaché, l'erreur relancée", async () => {
    stubFetch((call) => (call.method === "GET" ? jsonResponse({ verified: false }) : jsonResponse({})));
    await expect(new VercelHostingProvider(TOKEN, PROJECT).attachDomain(DOMAIN)).resolves.toMatchObject({ attached: true, sslReady: false });
    vi.unstubAllGlobals();
    stubFetch(() => new Response("refus", { status: 400 }));
    await expect(new VercelHostingProvider(TOKEN, PROJECT).attachDomain(DOMAIN)).rejects.toThrow("Vercel domains 400: refus");
  });
});

describe("MockHostingProvider — registre des appels API", () => {
  it("hébergement de démonstration : rien n'est inscrit", async () => {
    const events = capture();
    await expect(new MockHostingProvider().attachDomain(DOMAIN)).resolves.toEqual({ domain: DOMAIN, attached: true, sslReady: true });
    expect(events).toHaveLength(0);
  });
});
