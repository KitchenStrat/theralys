import { afterEach, describe, expect, it, vi } from "vitest";
import { eurToUsd } from "@theralys/shared";
import { setApiUsageSink, setApiUsageSinkFactory, withApiUsage, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { MockRegistrar } from "./mock";
import { OvhRegistrar } from "./ovh";
import { VERCEL_DNS_RECORDS } from "./types";

const CREDENTIALS = { appKey: "ovh-app-key-0123456789", appSecret: "ovh-app-secret-0123456789abcdef", consumerKey: "ovh-consumer-key-0123456789abcdef" };
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const DOMAIN = "claire-sophrologie-albi.fr";
const OWNER = "claire.martin@exemple.fr";
const OVH = "https://eu.api.ovh.com/1.0";

type Call = { method: string; path: string };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

/** Remplace `fetch` global (le client OVH n'accepte pas de `fetch` injecté) : réponse choisie par méthode et chemin. */
function stubOvh(respond: (call: Call) => Response | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const call: Call = { method: init?.method ?? "GET", path: String(input).replace(OVH, "") };
      calls.push(call);
      return respond(call) ?? jsonResponse(null);
    }),
  );
  return calls;
}

/** Parcours de commande : panier, domaine, rattachement, paiement (réponse de paiement au choix). */
function orderFlow(checkout: () => Response) {
  return (call: Call): Response | undefined => {
    if (call.method === "POST" && call.path === "/order/cart") return jsonResponse({ cartId: "cart-123" });
    if (call.method === "POST" && call.path === "/order/cart/cart-123/checkout") return checkout();
    return undefined;
  };
}

function capture(): ResolvedApiUsageEvent[] {
  const events: ResolvedApiUsageEvent[] = [];
  setApiUsageSink(async (event) => {
    events.push(event);
  });
  return events;
}

const brief = (event: ResolvedApiUsageEvent) => [event.operation, event.status, event.units, event.costUsd, event.costSource];

afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OvhRegistrar.checkAvailability — registre des appels API", () => {
  it("vérification aboutie : un événement ovh / domain_check, gratuit, une unité, rattaché au contexte", async () => {
    const events = capture();
    const calls = stubOvh((call) => {
      if (call.path === "/order/cart") return jsonResponse({ cartId: "cart-123" });
      if (call.method === "GET") return jsonResponse([{ productId: "domain", prices: [{ duration: "P1Y", price: { value: 6.99 } }] }]);
      return undefined;
    });
    const result = await withApiUsage({ feature: "domains", siteId: SITE_ID }, () => new OvhRegistrar(CREDENTIALS).checkAvailability(DOMAIN));
    expect(result).toEqual({ domain: DOMAIN, available: true, pricePerYear: 6.99 });
    // Deux appels HTTP (panier, offres) : une seule opération au registre
    expect(calls).toHaveLength(2);
    expect(events).toHaveLength(1);
    const { createdAt, durationMs, ...event } = events[0]!;
    expect(event).toEqual({
      provider: "ovh",
      operation: "domain_check",
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
      // Le prix annoncé n'est pas une dépense
      costUsd: 0,
      costSource: "free",
      error: null,
      meta: null,
    });
    expect(createdAt).toBeInstanceOf(Date);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("offres illisibles : domaine rendu indisponible, la vérification reste comptée aboutie", async () => {
    const events = capture();
    stubOvh((call) => (call.path === "/order/cart" ? jsonResponse({ cartId: "cart-123" }) : new Response("Invalid domain", { status: 400 })));
    await expect(new OvhRegistrar(CREDENTIALS).checkAvailability("mon site.fr")).resolves.toEqual({ domain: "mon site.fr", available: false, pricePerYear: null });
    expect(events.map(brief)).toEqual([["domain_check", "ok", 1, 0, "free"]]);
  });

  it("panier refusé (identifiants invalides) : événement en erreur sans unité, erreur relancée", async () => {
    const events = capture();
    stubOvh(() => jsonResponse({ errorCode: "INVALID_CREDENTIAL", message: "This credential does not exist" }, 403));
    await expect(withApiUsage({ feature: "domains" }, () => new OvhRegistrar(CREDENTIALS).checkAvailability(DOMAIN))).rejects.toThrow(/^OVH POST \/order\/cart → 403: /);
    expect(events.map(brief)).toEqual([["domain_check", "error", 0, 0, "free"]]);
    expect(events[0]).toMatchObject({ feature: "domains", siteId: null });
    expect(events[0]!.error).toMatch(/^OVH POST \/order\/cart → 403: .*This credential does not exist/);
  });
});

describe("OvhRegistrar.orderDomain — registre des appels API", () => {
  it("commande payée : un événement ovh / domain_order au prix réel hors taxes, converti d'euros en dollars", async () => {
    const events = capture();
    const calls = stubOvh(orderFlow(() => jsonResponse({ orderId: 987654, prices: { withoutTax: { value: 6.99 }, withTax: { value: 8.39 } } })));
    const order = await withApiUsage({ feature: "domains", siteId: SITE_ID }, () => new OvhRegistrar(CREDENTIALS).orderDomain(DOMAIN, OWNER));
    expect(order).toMatchObject({ domain: DOMAIN, orderId: "987654", status: "registered" });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(["POST /order/cart", "POST /order/cart/cart-123/domain", "POST /order/cart/cart-123/assign", "POST /order/cart/cart-123/checkout"]);
    expect(events).toHaveLength(1);
    const { createdAt: _createdAt, durationMs: _durationMs, ...event } = events[0]!;
    expect(event).toEqual({
      provider: "ovh",
      operation: "domain_order",
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
      costUsd: eurToUsd(6.99),
      costSource: "provider",
      error: null,
      meta: { priceEur: 6.99 },
    });
    // 6,99 € ≈ 7,60 $ au taux de l'affichage
    expect(event.costUsd).toBeCloseTo(7.5978, 4);
  });

  it("réponse de paiement sans prix hors taxes : le prix toutes taxes sert de repli", async () => {
    const events = capture();
    stubOvh(orderFlow(() => jsonResponse({ orderId: 1, prices: { withTax: { value: 8.39 } } })));
    await new OvhRegistrar(CREDENTIALS).orderDomain(DOMAIN, OWNER);
    expect(events[0]).toMatchObject({ units: 1, costUsd: eurToUsd(8.39), costSource: "provider", meta: { priceEur: 8.39 } });
  });

  it("réponse de paiement sans aucun prix : commande comptée, coût inconnu (0, origine « provider », `priceEur: null`)", async () => {
    const events = capture();
    stubOvh(orderFlow(() => jsonResponse({ orderId: 2 })));
    const order = await new OvhRegistrar(CREDENTIALS).orderDomain(DOMAIN, OWNER);
    expect(order.orderId).toBe("2");
    expect(events.map(brief)).toEqual([["domain_order", "ok", 1, 0, "provider"]]);
    expect(events[0]!.meta).toEqual({ priceEur: null });
  });

  it("prix nul, négatif ou qui n'est pas un nombre : traité comme absent", async () => {
    for (const value of [0, -6.99, "6.99", null]) {
      const events = capture();
      stubOvh(orderFlow(() => jsonResponse({ orderId: 3, prices: { withoutTax: { value } } })));
      await new OvhRegistrar(CREDENTIALS).orderDomain(DOMAIN, OWNER);
      expect(events.map(brief)).toEqual([["domain_order", "ok", 1, 0, "provider"]]);
      expect(events[0]!.meta).toEqual({ priceEur: null });
    }
  });

  it("paiement refusé : événement en erreur, sans coût ni unité, erreur relancée", async () => {
    const events = capture();
    stubOvh(orderFlow(() => jsonResponse({ message: "No default payment mean" }, 400)));
    await expect(withApiUsage({ feature: "domains", siteId: SITE_ID }, () => new OvhRegistrar(CREDENTIALS).orderDomain(DOMAIN, OWNER))).rejects.toThrow(/^OVH POST \/order\/cart\/cart-123\/checkout → 400: /);
    expect(events.map(brief)).toEqual([["domain_order", "error", 0, 0, "free"]]);
    expect(events[0]).toMatchObject({ feature: "domains", siteId: SITE_ID, meta: null });
    expect(events[0]!.error).toContain("No default payment mean");
  });

  it("échec avant le paiement (domaine refusé par le panier) : rien n'a été commandé, aucun coût", async () => {
    const events = capture();
    const calls = stubOvh((call) => {
      if (call.path === "/order/cart") return jsonResponse({ cartId: "cart-123" });
      if (call.path === "/order/cart/cart-123/domain") return jsonResponse({ message: "Domain not available" }, 409);
      return jsonResponse({ orderId: 4, prices: { withoutTax: { value: 6.99 } } });
    });
    await expect(new OvhRegistrar(CREDENTIALS).orderDomain(DOMAIN, OWNER)).rejects.toThrow(/409/);
    expect(calls).toHaveLength(2);
    expect(events.map(brief)).toEqual([["domain_order", "error", 0, 0, "free"]]);
  });

  it("ni les identifiants OVH ni l'adresse du titulaire n'entrent dans les événements", async () => {
    const events = capture();
    stubOvh(orderFlow(() => jsonResponse({ orderId: 5, prices: { withoutTax: { value: 6.99 } } })));
    const registrar = new OvhRegistrar(CREDENTIALS);
    await registrar.orderDomain(DOMAIN, OWNER);
    vi.unstubAllGlobals();
    stubOvh(() => new Response("Invalid signature", { status: 400 }));
    await registrar.orderDomain(DOMAIN, OWNER).catch(() => undefined);
    expect(events).toHaveLength(2);
    const dump = JSON.stringify(events);
    for (const secret of [CREDENTIALS.appKey, CREDENTIALS.appSecret, CREDENTIALS.consumerKey, OWNER]) expect(dump).not.toContain(secret);
  });
});

describe("OvhRegistrar.configureDns — registre des appels API", () => {
  it("enregistrements appliqués : un événement ovh / dns_configure, gratuit, quel que soit le nombre d'appels HTTP", async () => {
    const events = capture();
    const calls = stubOvh((call) => (call.method === "GET" ? jsonResponse([101, 102]) : undefined));
    await withApiUsage({ feature: "domains", siteId: SITE_ID }, () => new OvhRegistrar(CREDENTIALS).configureDns(DOMAIN, VERCEL_DNS_RECORDS));
    // Par enregistrement : lecture, deux suppressions, création ; puis le rafraîchissement de la zone
    expect(calls).toHaveLength(VERCEL_DNS_RECORDS.length * 4 + 1);
    expect(events.map(brief)).toEqual([["dns_configure", "ok", 1, 0, "free"]]);
    expect(events[0]).toMatchObject({ provider: "ovh", feature: "domains", siteId: SITE_ID, requests: 1, error: null, meta: null });
  });

  it("zone introuvable : événement en erreur, erreur relancée", async () => {
    const events = capture();
    stubOvh(() => jsonResponse({ message: "This service does not exist" }, 404));
    await expect(new OvhRegistrar(CREDENTIALS).configureDns(DOMAIN, VERCEL_DNS_RECORDS)).rejects.toThrow(/→ 404: /);
    expect(events.map(brief)).toEqual([["dns_configure", "error", 0, 0, "free"]]);
    expect(events[0]!.error).toContain("This service does not exist");
  });
});

describe("OvhRegistrar — parcours complet et cas limites", () => {
  it("vérification, commande puis DNS : trois événements, seul l'achat porte un coût", async () => {
    const events = capture();
    stubOvh((call) => {
      if (call.method === "POST" && call.path === "/order/cart") return jsonResponse({ cartId: "cart-123" });
      if (call.method === "GET" && call.path.startsWith("/order/cart/")) return jsonResponse([{ productId: "domain", prices: [{ duration: "P1Y", price: { value: 6.99 } }] }]);
      if (call.path === "/order/cart/cart-123/checkout") return jsonResponse({ orderId: 6, prices: { withoutTax: { value: 6.99 } } });
      if (call.method === "GET") return jsonResponse([]);
      return undefined;
    });
    const registrar = new OvhRegistrar(CREDENTIALS);
    await withApiUsage({ feature: "domains", siteId: SITE_ID }, async () => {
      await registrar.checkAvailability(DOMAIN);
      await registrar.orderDomain(DOMAIN, OWNER);
      await registrar.configureDns(DOMAIN, VERCEL_DNS_RECORDS);
    });
    expect(events.map(brief)).toEqual([
      ["domain_check", "ok", 1, 0, "free"],
      ["domain_order", "ok", 1, eurToUsd(6.99), "provider"],
      ["dns_configure", "ok", 1, 0, "free"],
    ]);
    for (const event of events) expect(event).toMatchObject({ provider: "ovh", feature: "domains", siteId: SITE_ID });
  });

  it("sans puits : la commande aboutit, l'erreur est relancée", async () => {
    stubOvh(orderFlow(() => jsonResponse({ orderId: 7, prices: { withoutTax: { value: 6.99 } } })));
    await expect(new OvhRegistrar(CREDENTIALS).orderDomain(DOMAIN, OWNER)).resolves.toMatchObject({ orderId: "7" });
    vi.unstubAllGlobals();
    stubOvh(() => new Response("panne", { status: 500 }));
    await expect(new OvhRegistrar(CREDENTIALS).orderDomain(DOMAIN, OWNER)).rejects.toThrow(/→ 500: panne/);
  });
});

describe("MockRegistrar — registre des appels API", () => {
  it("registrar de démonstration : rien n'est inscrit", async () => {
    const events = capture();
    const registrar = new MockRegistrar();
    await registrar.checkAvailability(DOMAIN);
    await registrar.orderDomain("cabinet-serein.fr", OWNER);
    expect(events).toHaveLength(0);
  });
});
