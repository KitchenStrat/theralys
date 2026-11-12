import { afterEach, describe, expect, it } from "vitest";
import { API_PROVIDERS, EXTERNAL_READ_USAGE_KIND } from "@theralys/shared";
import { setApiUsageSink, setApiUsageSinkFactory, withApiUsage, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { createWebsiteReader } from "./index";
import { createLiveWebsiteReader } from "./reader";
import { html, localPolicy, startServer, type Reply, type TestServer } from "./test-kit";

const SITE_ID = "11111111-1111-4111-8111-111111111111";
const HOST = "www.cabinet-test.fr";

const cleanups: (() => Promise<unknown> | unknown)[] = [];
afterEach(async () => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function capture(): ResolvedApiUsageEvent[] {
  const events: ResolvedApiUsageEvent[] = [];
  setApiUsageSink(async (event) => {
    events.push(event);
  });
  return events;
}

const page = (title: string, links: string[] = []): Reply =>
  html(`<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${`${title} : le cabinet vous accueille du lundi au samedi dans un cadre calme. `.repeat(8)}</p>${links.map((href) => `<a href="${href}">${href.slice(1)}</a>`).join(" ")}</main></body></html>`);

async function site(routes: Record<string, Reply>): Promise<TestServer> {
  const server = await startServer((request) => routes[request.path] ?? { status: 404, headers: { "content-type": "text/html" }, body: "<p>Introuvable</p>" });
  cleanups.push(() => server.close());
  return server;
}

const reader = () => createLiveWebsiteReader({ userAgent: "LecteurDeTest/1.0", policy: localPolicy({ [HOST]: "127.0.0.1" }), minIntervalMs: 0, requestTimeoutMs: 1_000 });

describe("lecteur de site — registre des appels API", () => {
  it("lecture aboutie : un événement client_site / site_read, gratuit, autant d'unités que de pages lues, rattaché au contexte", async () => {
    const events = capture();
    const server = await site({ "/": page("Accueil", ["/tarifs", "/contact", "/a-propos"]), "/tarifs": page("Tarifs"), "/contact": page("Contact"), "/a-propos": page("À propos") });
    const outcome = await withApiUsage({ feature: "client_site", siteId: SITE_ID }, () => reader().read(`http://${HOST}:${server.port}`));
    expect(outcome.ok && outcome.pages.length).toBe(4);
    expect(events).toHaveLength(1);
    const { createdAt, durationMs, ...event } = events[0]!;
    expect(event).toEqual({
      provider: "client_site",
      operation: "site_read",
      feature: "client_site",
      siteId: SITE_ID,
      model: null,
      status: "ok",
      // robots.txt, l'accueil, trois pages et le plan de site tenté
      requests: 6,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      units: 4,
      costUsd: 0,
      costSource: "free",
      error: null,
      meta: null,
    });
    expect(server.requests).toHaveLength(6);
    expect(createdAt).toBeInstanceOf(Date);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("le fournisseur et l'opération sont ceux du contrat : lecture gratuite, comptée en pages", () => {
    expect(API_PROVIDERS.client_site).toMatchObject({ free: true, unit: "pages" });
    expect(EXTERNAL_READ_USAGE_KIND).toBe("site_read");
  });

  it("lecture en échec : un événement en erreur, avec le code de l'échec et les requêtes réellement envoyées", async () => {
    const events = capture();
    const refused = await site({ "/": html("<h1>Interdit</h1>", { status: 403 }) });
    const closed = await site({ "/robots.txt": { headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /\n" } });
    const pdf = await site({ "/": { headers: { "content-type": "application/pdf" }, body: "%PDF" } });
    const empty = await site({ "/": html("<html><body><p>Bientôt en ligne.</p></body></html>") });
    await reader().read(`http://${HOST}:${refused.port}`);
    await reader().read(`http://${HOST}:${closed.port}`);
    await reader().read(`http://${HOST}:${pdf.port}`);
    await reader().read(`http://${HOST}:${empty.port}`);
    expect(events.map((event) => [event.status, event.error, event.units, event.requests, event.costUsd, event.costSource])).toEqual([
      ["error", "blocked", 0, 2, 0, "free"],
      ["error", "robots", 0, 1, 0, "free"],
      ["error", "not_html", 0, 2, 0, "free"],
      // L'accueil a été lue (une page), mais elle ne suffit pas ; le plan de site a été tenté
      ["error", "empty", 1, 3, 0, "free"],
    ]);
    for (const event of events) expect(event).toMatchObject({ provider: "client_site", operation: "site_read", feature: null, siteId: null });
  });

  it("adresse refusée avant toute requête : inscrite en erreur, zéro requête", async () => {
    const events = capture();
    await createWebsiteReader({}).read("https://127.0.0.1/");
    await reader().read("pas une adresse");
    expect(events.map((event) => [event.status, event.error, event.units, event.requests])).toEqual([
      ["error", "unsafe", 0, 0],
      ["error", "unsafe", 0, 0],
    ]);
  });

  it("une lecture = un événement, même après redirections, essai de l'autre écriture de l'hôte et pages en échec", async () => {
    const events = capture();
    const server = await site({ "/": { status: 302, headers: { location: "/accueil" } }, "/accueil": page("Accueil", ["/tarifs", "/contact"]), "/tarifs": page("Tarifs") });
    const live = createLiveWebsiteReader({ userAgent: "LecteurDeTest/1.0", policy: localPolicy({ [HOST]: "127.0.0.1" }), minIntervalMs: 0 });
    const outcome = await live.read(`http://cabinet-test.fr:${server.port}`);
    expect(outcome.ok && [outcome.pages.length, outcome.skipped.failed]).toEqual([2, 1]);
    expect(events).toHaveLength(1);
    // Les requêtes comptées sont les requêtes tentées : celles reçues par le site, plus celle vers l'hôte introuvable
    expect(events[0]).toMatchObject({ status: "ok", units: 2, requests: server.requests.length + 1 });
  });

  it("sans puits, ou avec un puits en panne : la lecture rend son résultat", async () => {
    const server = await site({ "/": page("Accueil") });
    expect((await reader().read(`http://${HOST}:${server.port}`)).ok).toBe(true);
    setApiUsageSink(async () => {
      throw new Error("base indisponible");
    });
    expect((await reader().read(`http://${HOST}:${server.port}`)).ok).toBe(true);
  });
});
