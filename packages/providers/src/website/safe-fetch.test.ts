import net from "node:net";
import { gzipSync } from "node:zlib";
import type { Agent } from "undici";
import { afterEach, describe, expect, it } from "vitest";
import {
  BLOCKED_IPV4_RANGES,
  BLOCKED_IPV6_RANGES,
  MAX_HEADER_BYTES,
  PRODUCTION_POLICY,
  SafeFetchError,
  URL_MAX,
  buildBlockList,
  checkUrl,
  createFetchAgent,
  createNetworkPolicy,
  createPolicyLookup,
  decodeHtml,
  decodeText,
  isAddressOutside,
  isConnectFailure,
  isPolicyRefusal,
  isPublicAddress,
  safeFetch,
  toSafeFetchError,
  type NetworkPolicy,
  type SafeFetchOptions,
  type SafeFetchResult,
} from "./safe-fetch";
import { fakeResolver, html, localPolicy, selfSignedCertificate, startServer, type Handler, type TestServer } from "./test-kit";

const UA = "LecteurDeTest/1.0 (+https://lecteur.test/robot)";
const SITE = "www.cabinet-test.fr";

const cleanups: (() => Promise<unknown> | unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function serve(handler: Handler, tls?: { key: string; cert: string }): Promise<TestServer> {
  const server = await startServer(handler, tls);
  cleanups.push(() => server.close());
  return server;
}

function agentFor(policy: NetworkPolicy, requestTimeoutMs = 2_000): Agent {
  const agent = createFetchAgent(policy, { requestTimeoutMs });
  cleanups.push(() => agent.destroy());
  return agent;
}

/** Récupération d'une page HTML avec la politique donnée (un agent neuf par appel, détruit en fin de test). */
function get(policy: NetworkPolicy, url: string, overrides: Partial<SafeFetchOptions> = {}): Promise<SafeFetchResult> {
  return safeFetch(url, {
    policy,
    dispatcher: agentFor(policy),
    userAgent: UA,
    accept: "text/html,application/xhtml+xml;q=0.9",
    contentTypes: /^(text\/html|application\/xhtml\+xml)$/,
    maxBytes: 5 * 1024 * 1024,
    timeoutMs: 2_000,
    ...overrides,
  });
}

/** Code de l'échec d'une récupération (lève si elle aboutit). */
async function codeOf(attempt: Promise<unknown>): Promise<string> {
  try {
    await attempt;
  } catch (err) {
    if (err instanceof SafeFetchError) return err.code;
    throw err;
  }
  throw new Error("la récupération aurait dû échouer");
}

const text = (result: SafeFetchResult): string => decodeText(result.body);

// ─── Adresses IP ─────────────────────────────────────────────────────────────

describe("adresses IP publiques et non publiques", () => {
  it("IPv4 : plages privées, bouclage, lien local (métadonnées), CGNAT, documentation, multidiffusion et réservées refusées", () => {
    const refused = ["0.0.0.0", "0.1.2.3", "10.0.0.1", "10.255.255.255", "100.64.0.1", "100.127.255.255", "127.0.0.1", "127.255.255.254", "169.254.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.0.0.8", "192.0.2.1", "192.88.99.1", "192.168.1.1", "198.18.0.1", "198.19.255.255", "198.51.100.1", "203.0.113.9", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255"];
    expect(refused.filter(isPublicAddress)).toEqual([]);
  });

  it("IPv4 : les adresses voisines de ces plages restent joignables", () => {
    const allowed = ["1.1.1.1", "8.8.8.8", "93.184.216.34", "100.63.255.255", "100.128.0.1", "169.253.255.255", "169.255.0.1", "172.15.255.255", "172.32.0.1", "192.0.1.1", "192.167.255.255", "192.169.0.1", "198.17.255.255", "198.20.0.1", "223.255.255.255"];
    expect(allowed.filter((address) => !isPublicAddress(address))).toEqual([]);
  });

  it("IPv6 : bouclage, non spécifiée, locales uniques, lien local, site local, multidiffusion, traduction et tunnels refusés", () => {
    const refused = ["::", "::1", "::2", "fc00::1", "fd00:ec2::254", "fd12:3456:789a::1", "fe80::1", "febf::1", "fec0::1", "ff02::1", "ff0e::1", "64:ff9b::7f00:1", "64:ff9b::808:808", "64:ff9b:1::1", "100::1", "2001::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:2::1", "2001:10::1", "2001:db8::1", "2002:7f00:1::", "2002:a00:1::1", "3fff::1", "5f00::1"];
    expect(refused.filter(isPublicAddress)).toEqual([]);
  });

  it("IPv6 : hors de l'unicast global 2000::/3, rien n'est joignable", () => {
    const refused = ["1::1", "80::1", "0:0:0:0:1::1", "0:0:0:0:0:1::", "0:0:0:0:0:fffe::1", "100:0:0:1::1", "200::1", "400::1", "800::1", "1000::1", "4000::1", "6000::1", "8000::1", "a000::1", "c000::1", "e000::1"];
    expect(refused.filter(isPublicAddress)).toEqual([]);
    const allowed = ["2606:4700:4700::1111", "2a00:1450:4007:80e::200e", "2001:4860:4860::8888", "2001:200::1", "2003::1", "2400:cb00::1", "2620:fe::fe", "3ffe::1"];
    expect(allowed.filter((address) => !isPublicAddress(address))).toEqual([]);
  });

  it("IPv4 écrite en IPv6 (« mappée ») : jugée comme l'adresse IPv4 qu'elle porte, quelle que soit l'écriture", () => {
    const refused = ["::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:a00:1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::ffff:192.168.1.1", "0:0:0:0:0:ffff:7f00:1"];
    expect(refused.filter(isPublicAddress)).toEqual([]);
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
    expect(isPublicAddress("::ffff:808:808")).toBe(true);
    // « Compatible IPv4 » (obsolète) : jamais joignable, même pour une adresse IPv4 publique
    expect(isPublicAddress("::8.8.8.8")).toBe(false);
    expect(isPublicAddress("::127.0.0.1")).toBe(false);
  });

  it("ce qui n'est pas une adresse IP bien formée n'est jamais public (échec = refus)", () => {
    for (const value of ["", "localhost", "exemple.fr", "1.2.3", "1.2.3.4.5", "256.1.1.1", "01.2.3.4", "2130706433", "0x7f.1", "127.1", "fe80::1%eth0", "2606:4700:4700::1111%eth0", ":::1", "1.2.3.4 ", "[::1]"]) {
      expect(isPublicAddress(value), value).toBe(false);
    }
  });

  it("la famille est déduite de l'adresse : une famille mal annoncée ne fait pas passer une adresse interne", () => {
    const list = buildBlockList(BLOCKED_IPV4_RANGES, BLOCKED_IPV6_RANGES);
    // Piège de `BlockList.check` : avec la mauvaise famille, il répond « non refusée »
    expect(list.check("::1", "ipv4")).toBe(false);
    expect(isAddressOutside(list, "::1")).toBe(false);
    expect(isAddressOutside(list, "127.0.0.1")).toBe(false);
    expect(isAddressOutside(list, "8.8.8.8")).toBe(true);
  });

  it("aucune règle IPv6 n'englobe les adresses IPv4 mappées (elle refuserait tout l'IPv4)", () => {
    const list = buildBlockList([], BLOCKED_IPV6_RANGES);
    for (const address of ["8.8.8.8", "127.0.0.1", "10.0.0.1", "203.0.113.9"]) expect(list.check(address, "ipv4"), address).toBe(false);
    expect(list.check("::ffff:8.8.8.8", "ipv6")).toBe(false);
  });
});

// ─── Adresse web ─────────────────────────────────────────────────────────────

describe("checkUrl — politique de production", () => {
  const codeFor = (url: string): string => {
    try {
      checkUrl(url, PRODUCTION_POLICY);
    } catch (err) {
      return (err as SafeFetchError).code;
    }
    return "ok";
  };

  it("https sur le port par défaut : acceptée, normalisée (minuscules, sans point final, sans ancre)", () => {
    expect(checkUrl("https://WWW.Mon-Cabinet.FR./tarifs?x=1#seances", PRODUCTION_POLICY).href).toBe("https://www.mon-cabinet.fr/tarifs?x=1");
    expect(checkUrl(new URL("https://mon-cabinet.fr"), PRODUCTION_POLICY).href).toBe("https://mon-cabinet.fr/");
    // Nom international : forme ASCII (punycode), la seule utilisée ensuite
    expect(checkUrl("https://cabinet-été.fr/", PRODUCTION_POLICY).hostname).toBe("xn--cabinet-t-i4ab.fr");
  });

  it("adresse démesurée : refusée (2 048 caractères au plus)", () => {
    expect(URL_MAX).toBe(2_048);
    const base = "https://www.mon-cabinet.fr/page?x=";
    expect(codeFor(`${base}${"a".repeat(URL_MAX - base.length)}`)).toBe("ok");
    expect(codeFor(`${base}${"a".repeat(URL_MAX - base.length + 1)}`)).toBe("bad_url");
    expect(codeFor(`https://www.mon-cabinet.fr/${"a".repeat(100_000)}`)).toBe("bad_url");
  });

  it("autre protocole que https : refusé", () => {
    for (const url of ["http://mon-cabinet.fr/", "ftp://mon-cabinet.fr/", "file:///etc/passwd", "gopher://mon-cabinet.fr/", "data:text/html,bonjour", "javascript:alert(1)", "ws://mon-cabinet.fr/"]) expect(codeFor(url), url).toBe("bad_scheme");
    expect(codeFor("pas une adresse")).toBe("bad_url");
    expect(codeFor("")).toBe("bad_url");
  });

  it("identifiants dans l'adresse : refusés", () => {
    expect(codeFor("https://praticien:secret@mon-cabinet.fr/")).toBe("credentials");
    expect(codeFor("https://praticien@mon-cabinet.fr/")).toBe("credentials");
    // L'hôte lu est celui que lira le client HTTP : ici mon-cabinet.fr, sans identifiants
    expect(checkUrl("https://mon-cabinet.fr\\@interne.test/", PRODUCTION_POLICY).hostname).toBe("mon-cabinet.fr");
  });

  it("port explicite : refusé (pas de balayage de ports), le port par défaut écrit est accepté", () => {
    for (const url of ["https://mon-cabinet.fr:8443/", "https://mon-cabinet.fr:22/", "https://mon-cabinet.fr:80/", "https://mon-cabinet.fr:6379/"]) expect(codeFor(url), url).toBe("bad_port");
    expect(codeFor("https://mon-cabinet.fr:443/")).toBe("ok");
  });

  it("adresse IP littérale, dans toutes ses écritures : refusée", () => {
    const urls = ["https://127.0.0.1/", "https://2130706433/", "https://0x7f.1/", "https://017700000001/", "https://127.1/", "https://0/", "https://169.254.169.254/latest/meta-data/", "https://8.8.8.8/", "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://[::ffff:a9fe:a9fe]/", "https://[fd00:ec2::254]/", "https://[2606:4700:4700::1111]/"];
    for (const url of urls) expect(codeFor(url), url).toBe("ip_literal");
  });

  it("nom local ou réservé : refusé", () => {
    for (const url of ["https://localhost/", "https://LOCALHOST./", "https://intranet/", "https://serveur/", "https://base.internal/", "https://imprimante.local/", "https://app.localhost/", "https://nas.lan/", "https://box.home/", "https://x.corp/", "https://1.0.0.127.in-addr.arpa/", "https://cache.onion/", "https://site.test/", "https://site.example/", "https://site.invalid/"]) {
      expect(codeFor(url), url).toBe("bad_host");
    }
    expect(codeFor(`https://${"a".repeat(60)}.${"b".repeat(60)}.${"c".repeat(60)}.${"d".repeat(60)}.${"e".repeat(20)}.fr/`)).toBe("bad_host");
  });

  it("politique de laboratoire : http, port et adresse littérale admis seulement si la politique le dit", () => {
    const lab = createNetworkPolicy({ protocols: ["http:", "https:"], allowExplicitPort: true, allowIpLiteral: true });
    expect(checkUrl("http://www.cabinet-test.fr:8080/a", lab).href).toBe("http://www.cabinet-test.fr:8080/a");
    expect(checkUrl("http://93.184.216.34:8080/", lab).hostname).toBe("93.184.216.34");
    // Même admise, une adresse littérale reste soumise à la liste de refus
    expect(() => checkUrl("http://127.0.0.1:8080/", lab)).toThrowError(expect.objectContaining({ code: "private_address" }));
    expect(() => checkUrl("http://[::ffff:10.0.0.1]/", lab)).toThrowError(expect.objectContaining({ code: "private_address" }));
  });

  it("la politique de production ne s'assouplit pas : objet figé, aucune variable d'environnement lue", () => {
    expect(Object.isFrozen(PRODUCTION_POLICY)).toBe(true);
    expect(PRODUCTION_POLICY.protocols).toEqual(["https:"]);
    expect(PRODUCTION_POLICY.allowExplicitPort).toBe(false);
    expect(PRODUCTION_POLICY.allowIpLiteral).toBe(false);
    expect(PRODUCTION_POLICY.ca).toBeUndefined();
  });
});

// ─── Résolution DNS ──────────────────────────────────────────────────────────

describe("createPolicyLookup — résolution contrôlée", () => {
  type LookupResult = { err: NodeJS.ErrnoException | null; address: unknown; family: number | undefined };
  const lookupWith = (table: Parameters<typeof fakeResolver>[0], options: { all?: boolean } = { all: true }): Promise<LookupResult> => {
    const lookup = createPolicyLookup(createNetworkPolicy({ resolve: fakeResolver(table) }));
    return new Promise((resolve) => lookup("site.fr", options, (err, address, family) => resolve({ err, address, family })));
  };

  it("toutes les adresses publiques : rendues telles quelles (liste, ou première adresse)", async () => {
    const all = await lookupWith({ "site.fr": ["93.184.216.34", "2606:4700:4700::1111"] });
    expect(all.err).toBeNull();
    expect(all.address).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
    const first = await lookupWith({ "site.fr": ["93.184.216.34", "1.1.1.1"] }, { all: false });
    expect([first.err, first.address, first.family]).toEqual([null, "93.184.216.34", 4]);
  });

  it("une seule adresse non publique parmi plusieurs : le nom entier est refusé", async () => {
    for (const answer of [["93.184.216.34", "10.0.0.5"], ["127.0.0.1"], ["169.254.169.254"], ["::ffff:169.254.169.254"], ["2606:4700:4700::1111", "fd00:ec2::254"], ["::1"]]) {
      const result = await lookupWith({ "site.fr": answer });
      expect(result.err, answer.join(",")).toMatchObject({ name: "SafeFetchError", code: "private_address" });
      expect(result.address).toEqual([]);
    }
  });

  it("échec fermé : nom introuvable, liste vide ou adresse illisible → refus", async () => {
    expect((await lookupWith({})).err).toMatchObject({ code: "ENOTFOUND" });
    expect((await lookupWith({ "site.fr": [] })).err).toMatchObject({ code: "dns" });
    expect((await lookupWith({ "site.fr": ["pas-une-adresse"] })).err).toMatchObject({ code: "private_address" });
  });

  it("le message d'un refus ne révèle pas l'adresse interne", async () => {
    const result = await lookupWith({ "site.fr": ["10.1.2.3"] });
    expect(result.err?.message).not.toContain("10.1.2.3");
  });
});

// ─── Requêtes sur un serveur local ───────────────────────────────────────────

describe("safeFetch — requête et en-têtes", () => {
  it("page servie : statut, corps, type de contenu, adresse finale ; le lecteur s'identifie et n'envoie ni cookie ni identifiant", async () => {
    const server = await serve(() => html("<html><title>Accueil</title></html>", { headers: { etag: '"abc"', "last-modified": "Tue, 03 Nov 2026 10:00:00 GMT" } }));
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    const result = await get(policy, `http://${SITE}:${server.port}/accueil?x=1#haut`);
    expect(result).toMatchObject({ url: `http://${SITE}:${server.port}/accueil?x=1`, status: 200, contentType: "text/html", truncated: false, redirects: 0 });
    expect(text(result)).toBe("<html><title>Accueil</title></html>");
    expect(result.header("etag")).toBe('"abc"');
    expect(result.header("Last-Modified")).toBe("Tue, 03 Nov 2026 10:00:00 GMT");
    expect(result.header("x-absent")).toBeNull();

    const sent = server.requests[0]!;
    expect(sent.method).toBe("GET");
    expect(sent.host).toBe(SITE);
    expect(sent.path).toBe("/accueil?x=1");
    expect(sent.headers["user-agent"]).toBe(UA);
    expect(sent.headers.accept).toBe("text/html,application/xhtml+xml;q=0.9");
    expect(sent.headers["accept-language"]).toBe("fr-FR,fr;q=0.9,en;q=0.5");
    for (const forbidden of ["cookie", "authorization", "referer", "origin", "proxy-authorization"]) expect(sent.headers[forbidden], forbidden).toBeUndefined();
    expect(policy.resolve.calls).toEqual([SITE]);
  });

  it("un cookie posé par le site n'est jamais renvoyé, ni au saut suivant ni à la requête suivante", async () => {
    const server = await serve((request) => (request.path === "/" ? { status: 302, headers: { location: "/accueil", "set-cookie": "session=abc; Path=/" } } : html("ok", { headers: { "set-cookie": "suivi=1" } })));
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    const dispatcher = agentFor(policy);
    await get(policy, `http://${SITE}:${server.port}/`, { dispatcher });
    await get(policy, `http://${SITE}:${server.port}/tarifs`, { dispatcher });
    expect(server.paths()).toEqual(["/", "/accueil", "/tarifs"]);
    for (const request of server.requests) expect(request.headers.cookie).toBeUndefined();
  });

  it("réponse hors 2xx : rendue avec son statut et le début de son corps, sans contrôle du type", async () => {
    const server = await serve((request) => {
      if (request.path === "/403") return html("<title>Just a moment...</title>", { status: 403, headers: { "cf-mitigated": "challenge" } });
      if (request.path === "/long") return html("x".repeat(200_000), { status: 503 });
      if (request.path === "/pdf") return { status: 500, headers: { "content-type": "application/pdf" }, body: "%PDF-1.7" };
      return { status: 404, headers: { "content-type": "text/plain" }, body: "Introuvable" };
    });
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    const refused = await get(policy, `http://${SITE}:${server.port}/403`);
    expect([refused.status, text(refused), refused.header("cf-mitigated")]).toEqual([403, "<title>Just a moment...</title>", "challenge"]);
    const long = await get(policy, `http://${SITE}:${server.port}/long`);
    expect([long.status, long.body.byteLength, long.truncated]).toEqual([503, 64 * 1024, true]);
    const binary = await get(policy, `http://${SITE}:${server.port}/pdf`);
    expect([binary.status, binary.body.byteLength]).toEqual([500, 0]);
    const missing = await get(policy, `http://${SITE}:${server.port}/rien`);
    expect([missing.status, text(missing)]).toEqual([404, "Introuvable"]);
  });

  it("ordonnanceur et compteur : appelés une fois par requête, redirections comprises", async () => {
    const server = await serve((request) => (request.path === "/" ? { status: 301, headers: { location: "/a" } } : request.path === "/a" ? { status: 302, headers: { location: "/b" } } : html("fin")));
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    const counted: string[] = [];
    let scheduled = 0;
    const result = await get(policy, `http://${SITE}:${server.port}/`, {
      onRequest: (url) => counted.push(url.pathname),
      schedule: (task) => {
        scheduled += 1;
        return task();
      },
    });
    expect(result.redirects).toBe(2);
    expect(counted).toEqual(["/", "/a", "/b"]);
    expect(scheduled).toBe(3);
  });
});

describe("safeFetch — destinations internes", () => {
  it("DNS changeant (« rebinding ») : la deuxième résolution, interne, est refusée à la connexion", async () => {
    // Le serveur ferme chaque connexion : la requête suivante doit résoudre le nom à nouveau
    const server = await serve(() => html("public", { headers: { connection: "close" } }));
    const policy = localPolicy({ "rebind.cabinet-test.fr": (call) => (call === 1 ? "127.0.0.1" : "10.0.0.5") });
    const first = await get(policy, `http://rebind.cabinet-test.fr:${server.port}/`);
    expect(text(first)).toBe("public");
    expect(await codeOf(get(policy, `http://rebind.cabinet-test.fr:${server.port}/`))).toBe("private_address");
    expect(policy.resolve.calls).toEqual(["rebind.cabinet-test.fr", "rebind.cabinet-test.fr"]);
    expect(server.requests).toHaveLength(1);
  });

  it("DNS changeant vers les métadonnées de l'hébergeur ou une adresse mappée : refusé de la même façon", async () => {
    const server = await serve(() => html("public", { headers: { connection: "close" } }));
    for (const internal of ["169.254.169.254", "::ffff:169.254.169.254", "fd00:ec2::254", "127.0.0.2", "::1"]) {
      const policy = localPolicy({ "rebind.cabinet-test.fr": (call) => (call === 1 ? "127.0.0.1" : internal) });
      await get(policy, `http://rebind.cabinet-test.fr:${server.port}/`);
      expect(await codeOf(get(policy, `http://rebind.cabinet-test.fr:${server.port}/`)), internal).toBe("private_address");
    }
  });

  it("nom public dont une adresse sur deux est interne : refusé, aucune connexion", async () => {
    const server = await serve(() => html("secret"));
    const policy = localPolicy({ "double.cabinet-test.fr": ["127.0.0.1", "10.0.0.5"] });
    expect(await codeOf(get(policy, `http://double.cabinet-test.fr:${server.port}/`))).toBe("private_address");
    expect(server.connections()).toBe(0);
  });

  it("nom introuvable : échec `dns`, aucune connexion", async () => {
    const server = await serve(() => html("secret"));
    const policy = localPolicy({});
    expect(await codeOf(get(policy, `http://inconnu.cabinet-test.fr:${server.port}/`))).toBe("dns");
    expect(server.connections()).toBe(0);
  });

  it("liste de refus à la connexion (http) : même si la résolution contrôlée laissait passer, Node refuse avant tout envoi", async () => {
    const server = await serve(() => html("secret"));
    // Contrôle de la résolution neutralisé : seule la liste de refus de production protège
    const policy = createNetworkPolicy({ protocols: ["http:"], allowExplicitPort: true, allowIpLiteral: true, isAddressAllowed: () => true, resolve: fakeResolver({ "piege.cabinet-test.fr": "127.0.0.1", "meta.cabinet-test.fr": "169.254.169.254" }) });
    expect(await codeOf(get(policy, `http://piege.cabinet-test.fr:${server.port}/`))).toBe("private_address");
    expect(await codeOf(get(policy, `http://meta.cabinet-test.fr:${server.port}/`))).toBe("private_address");
    // Adresse IP littérale : Node n'appelle pas la résolution, la liste de refus est le seul filet
    expect(await codeOf(get(policy, `http://127.0.0.1:${server.port}/`))).toBe("private_address");
    expect(await codeOf(get(policy, `http://[::ffff:127.0.0.1]:${server.port}/`))).toBe("private_address");
    expect(await codeOf(get(policy, `http://[::1]:${server.port}/`))).toBe("private_address");
    expect(server.connections()).toBe(0);
  });

  it("liste de refus à la connexion (https) : appliquée aussi quand la connexion est chiffrée", async () => {
    // Un simple serveur TCP suffit : la connexion doit être refusée avant la négociation TLS.
    // (Sur Node 22, `tls.connect` ignore `blockList` : sans la socket TCP ouverte par le connecteur, ce test échoue.)
    let connections = 0;
    const tcp = net.createServer((socket) => {
      connections += 1;
      socket.on("error", () => undefined);
      socket.destroy();
    });
    await new Promise<void>((resolve) => tcp.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => new Promise<void>((resolve) => tcp.close(() => resolve())));
    const port = (tcp.address() as net.AddressInfo).port;
    const policy = createNetworkPolicy({ allowExplicitPort: true, allowIpLiteral: true, isAddressAllowed: () => true, resolve: fakeResolver({ "piege.cabinet-test.fr": "127.0.0.1" }) });
    expect(await codeOf(get(policy, `https://127.0.0.1:${port}/`))).toBe("private_address");
    expect(await codeOf(get(policy, `https://[::ffff:127.0.0.1]:${port}/`))).toBe("private_address");
    expect(await codeOf(get(policy, `https://piege.cabinet-test.fr:${port}/`))).toBe("private_address");
    expect(connections).toBe(0);
  });

  it("adresse relue sur la socket : une connexion aboutie vers une adresse refusée est coupée avant toute requête", async () => {
    const server = await serve(() => html("secret"));
    let checks = 0;
    // La résolution passe (premier contrôle), puis l'adresse jointe est refusée (second contrôle)
    const policy = localPolicy({ [SITE]: "127.0.0.1" }, { isAddressAllowed: () => (checks += 1) === 1 });
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/`))).toBe("private_address");
    expect(checks).toBe(2);
    expect(server.requests).toHaveLength(0);
  });
});

describe("safeFetch — redirections", () => {
  const redirecting = (location: string | null): Handler => (request) => (request.path === "/" ? { status: 302, headers: location === null ? {} : { location } } : html(`arrivée ${request.host}${request.path}`));

  it("redirection relative ou absolue : suivie, l'adresse finale est rendue", async () => {
    const server = await serve((request) => (request.path === "/" ? { status: 301, headers: { location: "/accueil/#haut" } } : request.path === "/accueil/" ? { status: 308, headers: { location: `http://cabinet-test.fr:${server.port}/fin` } } : html(`arrivée ${request.host}`)));
    const policy = localPolicy({ [SITE]: "127.0.0.1", "cabinet-test.fr": "127.0.0.1" });
    const result = await get(policy, `http://${SITE}:${server.port}/`);
    expect([result.url, result.redirects, text(result)]).toEqual([`http://cabinet-test.fr:${server.port}/fin`, 2, "arrivée cabinet-test.fr"]);
  });

  it("redirection vers une adresse interne : chaque saut repasse par tous les contrôles", async () => {
    const policy = (): ReturnType<typeof localPolicy> => localPolicy({ [SITE]: "127.0.0.1", "interne.cabinet-test.fr": "10.0.0.5", "meta.cabinet-test.fr": "169.254.169.254" });
    const cases: [string, string][] = [
      ["http://169.254.169.254/latest/meta-data/", "ip_literal"],
      ["http://127.0.0.1/", "ip_literal"],
      ["http://[::1]/", "ip_literal"],
      ["http://2130706433/", "ip_literal"],
      ["http://localhost/", "bad_host"],
      ["http://base.internal/", "bad_host"],
      ["http://interne.cabinet-test.fr/", "private_address"],
      ["http://meta.cabinet-test.fr/", "private_address"],
      ["file:///etc/passwd", "bad_scheme"],
      ["gopher://cabinet-test.fr/", "bad_scheme"],
      ["http://praticien:secret@www.cabinet-test.fr/", "credentials"],
      ["http://[", "bad_redirect"],
      [`/${"a".repeat(3_000)}`, "bad_redirect"],
      [`http://www.cabinet-test.fr/${"a".repeat(3_000)}`, "bad_redirect"],
    ];
    for (const [location, code] of cases) {
      const server = await serve(redirecting(location));
      expect(await codeOf(get(policy(), `http://${SITE}:${server.port}/`)), location).toBe(code);
      expect(server.paths(), location).toEqual(["/"]);
    }
  });

  it("redirection vers un autre port ou hors https : refusée par la politique de production", () => {
    // La politique de production s'applique à chaque saut par `checkUrl` : mêmes refus qu'à la première adresse
    for (const [location, code] of [["https://mon-cabinet.fr:8443/", "bad_port"], ["http://mon-cabinet.fr/", "bad_scheme"], ["https://10.0.0.1/", "ip_literal"]] as const) {
      expect(() => checkUrl(new URL(location, "https://mon-cabinet.fr/"), PRODUCTION_POLICY), location).toThrowError(expect.objectContaining({ code }));
    }
  });

  it("https vers http : refusé même quand la politique admet les deux protocoles", async () => {
    const certificate = selfSignedCertificate([SITE]);
    const plain = await serve(() => html("en clair"));
    const secure = await serve(() => ({ status: 302, headers: { location: `http://${SITE}:${plain.port}/` } }), certificate);
    const policy = localPolicy({ [SITE]: "127.0.0.1" }, { ca: certificate.cert });
    expect(await codeOf(get(policy, `https://${SITE}:${secure.port}/`))).toBe("bad_scheme");
    expect(plain.requests).toHaveLength(0);
  });

  it("cinq redirections au plus, puis `too_many_redirects` ; redirection sans destination : `bad_redirect`", async () => {
    const loop = await serve((request) => ({ status: 302, headers: { location: `/tour-${Number(request.path.split("-")[1] ?? 0) + 1}` } }));
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    expect(await codeOf(get(policy, `http://${SITE}:${loop.port}/tour-0`))).toBe("too_many_redirects");
    expect(loop.paths()).toEqual(["/tour-0", "/tour-1", "/tour-2", "/tour-3", "/tour-4", "/tour-5"]);

    const five = await serve((request) => (request.path === "/tour-5" ? html("fin") : { status: 302, headers: { location: `/tour-${Number(request.path.split("-")[1] ?? 0) + 1}` } }));
    expect((await get(policy, `http://${SITE}:${five.port}/tour-0`)).redirects).toBe(5);

    const empty = await serve(redirecting(null));
    expect(await codeOf(get(policy, `http://${SITE}:${empty.port}/`))).toBe("bad_redirect");
  });

  it("garde de l'appelant : consulté avant chaque requête, il peut refuser un saut avant qu'il ne parte", async () => {
    const server = await serve((request) => (request.host === SITE ? { status: 302, headers: { location: `http://www.autre-site.fr:${server.port}/` } } : html("autre site")));
    const policy = localPolicy({ [SITE]: "127.0.0.1", "www.autre-site.fr": "127.0.0.1" });
    const seen: [string, string | null][] = [];
    const attempt = get(policy, `http://${SITE}:${server.port}/`, {
      guard: (target, from) => {
        seen.push([target.hostname, from?.hostname ?? null]);
        if (target.hostname !== SITE) throw new SafeFetchError("offsite", "hors du site", target.href);
      },
    });
    await expect(attempt).rejects.toMatchObject({ code: "offsite", target: `http://www.autre-site.fr:${server.port}/` });
    expect(seen).toEqual([
      [SITE, null],
      ["www.autre-site.fr", SITE],
    ]);
    expect(server.paths(true)).toEqual([`${SITE}/`]);
  });
});

describe("safeFetch — type de contenu et taille", () => {
  it("type de contenu hors liste (ou absent) : `bad_type`, le corps n'est pas lu", async () => {
    const server = await serve((request) => {
      if (request.path === "/pdf") return { headers: { "content-type": "application/pdf" }, body: "%PDF-1.7" };
      if (request.path === "/json") return { headers: { "content-type": "application/json" }, body: "{}" };
      if (request.path === "/image") return { headers: { "content-type": "image/png" }, body: "PNG" };
      if (request.path === "/texte") return { headers: { "content-type": "text/plain; charset=utf-8" }, body: "User-agent: *" };
      if (request.path === "/xhtml") return { headers: { "content-type": "Application/XHTML+XML; charset=UTF-8" }, body: "<html/>" };
      return { body: "sans type" };
    });
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    for (const path of ["/pdf", "/json", "/image", "/texte", "/sans-type"]) expect(await codeOf(get(policy, `http://${SITE}:${server.port}${path}`)), path).toBe("bad_type");
    expect((await get(policy, `http://${SITE}:${server.port}/xhtml`)).contentType).toBe("application/xhtml+xml");
    // robots.txt : texte brut, type absent toléré
    const robots = { accept: "text/plain", contentTypes: /^text\//, allowMissingType: true };
    expect(text(await get(policy, `http://${SITE}:${server.port}/texte`, robots))).toBe("User-agent: *");
    expect(text(await get(policy, `http://${SITE}:${server.port}/sans-type`, robots))).toBe("sans type");
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/pdf`, robots))).toBe("bad_type");
  });

  it("corps trop volumineux : refusé dès l'en-tête quand la taille est annoncée, sinon pendant la lecture", async () => {
    const big = Buffer.alloc(300_000, "a");
    const server = await serve((request, response) => {
      if (request.path === "/annonce") return html(big.toString());
      // Sans taille annoncée (envoi par morceaux)
      response.writeHead(200, { "content-type": "text/html" });
      for (let i = 0; i < 30; i++) response.write(big.subarray(0, 10_000));
      response.end();
      return undefined;
    });
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/annonce`, { maxBytes: 100_000 }))).toBe("too_large");
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/morceaux`, { maxBytes: 100_000 }))).toBe("too_large");
    expect((await get(policy, `http://${SITE}:${server.port}/annonce`, { maxBytes: 300_000 })).body.byteLength).toBe(300_000);
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/annonce`, { maxBytes: 299_999 }))).toBe("too_large");
  });

  it("réponse compressée piégée : le plafond compte les octets décodés, la lecture s'arrête au plafond", async () => {
    // 40 Mo de zéros tiennent en ~40 Ko une fois compressés : la taille annoncée ne dit rien
    const bomb = gzipSync(Buffer.alloc(40 * 1024 * 1024), { level: 9 });
    expect(bomb.byteLength).toBeLessThan(100_000);
    const server = await serve(() => ({ headers: { "content-type": "text/html", "content-encoding": "gzip", "content-length": String(bomb.byteLength) }, body: bomb }));
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    const before = process.memoryUsage().rss;
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/`, { maxBytes: 5 * 1024 * 1024 }))).toBe("too_large");
    // Rien qui ressemble aux 40 Mo décodés n'a été gardé en mémoire
    expect(process.memoryUsage().rss - before).toBeLessThan(30 * 1024 * 1024);
  });

  it("réponse compressée ordinaire : décodée, comptée après décodage", async () => {
    const page = `<html>${"é".repeat(2_000)}</html>`;
    const server = await serve(() => ({ headers: { "content-type": "text/html; charset=utf-8", "content-encoding": "gzip" }, body: gzipSync(page) }));
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    const result = await get(policy, `http://${SITE}:${server.port}/`);
    expect(text(result)).toBe(page);
    expect(server.requests[0]!.headers["accept-encoding"]).toMatch(/gzip/);
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/`, { maxBytes: 1_000 }))).toBe("too_large");
  });

  it("mode « coupe » (robots.txt) : le début du corps est rendu, signalé comme coupé", async () => {
    const server = await serve(() => ({ headers: { "content-type": "text/plain" }, body: `User-agent: *\n${"Disallow: /prive\n".repeat(1_000)}` }));
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    const result = await get(policy, `http://${SITE}:${server.port}/robots.txt`, { contentTypes: /^text\//, maxBytes: 1_024, overflow: "truncate" });
    expect([result.body.byteLength, result.truncated]).toEqual([1_024, true]);
    expect(text(result).startsWith("User-agent: *\nDisallow: /prive\n")).toBe(true);
  });

  it("en-têtes volumineux : 20 Kio acceptés (au-delà du défaut d'undici), plus de 64 Kio refusés", async () => {
    const server = await serve((request) => html("ok", { headers: { "content-security-policy": "x".repeat(request.path === "/gros" ? MAX_HEADER_BYTES + 4_096 : 20 * 1024) } }));
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    expect((await get(policy, `http://${SITE}:${server.port}/`)).status).toBe(200);
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/gros`))).toBe("too_large");
  });
});

describe("safeFetch — délais", () => {
  it("serveur muet : `timeout` au délai de la requête", async () => {
    const server = await serve(() => ({ hang: true }));
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    const started = Date.now();
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/`, { timeoutMs: 150 }))).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(1_500);
  });

  it("corps envoyé au goutte-à-goutte : le délai borne aussi la lecture du corps", async () => {
    const server = await serve((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.write("<html>");
      const drip = setInterval(() => (response.destroyed ? clearInterval(drip) : response.write("x")), 20);
      cleanups.push(() => clearInterval(drip));
      return undefined;
    });
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    const started = Date.now();
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/`, { timeoutMs: 200 }))).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(1_500);
  });

  it("durée totale : le signal de l'appelant interrompt la requête en cours avec son motif", async () => {
    const server = await serve(() => ({ hang: true }));
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    const deadline = new AbortController();
    setTimeout(() => deadline.abort(new SafeFetchError("deadline", "durée de lecture dépassée")), 100);
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/`, { signal: deadline.signal, timeoutMs: 5_000 }))).toBe("deadline");

    const caller = new AbortController();
    setTimeout(() => caller.abort(), 50);
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/`, { signal: caller.signal, timeoutMs: 5_000 }))).toBe("aborted");
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/`, { signal: AbortSignal.timeout(50), timeoutMs: 5_000 }))).toBe("deadline");
  });

  it("signal déjà déclenché : aucune requête ne part", async () => {
    const server = await serve(() => html("ok"));
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    expect(await codeOf(get(policy, `http://${SITE}:${server.port}/`, { signal: AbortSignal.abort() }))).toBe("aborted");
    expect(server.connections()).toBe(0);
    expect(policy.resolve.calls).toEqual([]);
  });

  it("connexion refusée : `connect`", async () => {
    const server = await serve(() => html("ok"));
    const port = server.port;
    await server.close();
    const policy = localPolicy({ [SITE]: "127.0.0.1" });
    expect(await codeOf(get(policy, `http://${SITE}:${port}/`))).toBe("connect");
  });
});

describe("safeFetch — https", () => {
  it("serveur https local : la connexion chiffrée passe par les mêmes contrôles (résolution, liste de refus) et aboutit", async () => {
    const certificate = selfSignedCertificate([SITE, "cabinet-test.fr"]);
    const server = await serve((request) => html(`chiffré ${request.host}`), certificate);
    const policy = localPolicy({ [SITE]: "127.0.0.1", "interne.cabinet-test.fr": "127.0.0.2" }, { ca: certificate.cert });
    const result = await get(policy, `https://${SITE}:${server.port}/`);
    expect([result.status, text(result)]).toEqual([200, `chiffré ${SITE}`]);
    expect(policy.resolve.calls).toEqual([SITE]);
    expect(await codeOf(get(policy, `https://interne.cabinet-test.fr:${server.port}/`))).toBe("private_address");
  });

  it("certificat non reconnu ou nom différent : `tls` — et NODE_TLS_REJECT_UNAUTHORIZED=0 n'y change rien", async () => {
    const certificate = selfSignedCertificate([SITE]);
    const server = await serve(() => html("chiffré"), certificate);
    const untrusted = localPolicy({ [SITE]: "127.0.0.1" });
    expect(await codeOf(get(untrusted, `https://${SITE}:${server.port}/`))).toBe("tls");

    const trusted = localPolicy({ "autre.cabinet-test.fr": "127.0.0.1" }, { ca: certificate.cert });
    expect(await codeOf(get(trusted, `https://autre.cabinet-test.fr:${server.port}/`))).toBe("tls");

    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    cleanups.push(() => {
      if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    });
    expect(await codeOf(get(localPolicy({ [SITE]: "127.0.0.1" }), `https://${SITE}:${server.port}/`))).toBe("tls");
    expect(server.requests).toHaveLength(0);
  });
});

// ─── Classement des erreurs et décodage ──────────────────────────────────────

describe("toSafeFetchError", () => {
  const wrapped = (cause: unknown): TypeError => Object.assign(new TypeError("fetch failed"), { cause });
  const coded = (code: string): Error => Object.assign(new Error(code), { code });

  it("retrouve l'erreur utile sous l'enveloppe d'undici", () => {
    const original = new SafeFetchError("private_address", "refus");
    expect(toSafeFetchError(original)).toBe(original);
    expect(toSafeFetchError(wrapped(original))).toBe(original);
    expect(toSafeFetchError(wrapped(new AggregateError([coded("ECONNREFUSED"), original])))).toBe(original);
  });

  it("classe par code : adresse refusée, nom introuvable, connexion, TLS, délais, taille", () => {
    const cases: [unknown, string][] = [
      [wrapped(coded("ERR_IP_BLOCKED")), "private_address"],
      [wrapped(Object.assign(new AggregateError([coded("ERR_IP_BLOCKED"), coded("ERR_IP_BLOCKED")]), { code: "ERR_IP_BLOCKED" })), "private_address"],
      [wrapped(coded("ENOTFOUND")), "dns"],
      [wrapped(coded("EAI_AGAIN")), "dns"],
      [wrapped(coded("ECONNREFUSED")), "connect"],
      [wrapped(coded("ECONNRESET")), "connect"],
      [wrapped(coded("UND_ERR_CONNECT_TIMEOUT")), "connect"],
      [wrapped(coded("UND_ERR_SOCKET")), "connect"],
      [wrapped(coded("CERT_HAS_EXPIRED")), "tls"],
      [wrapped(coded("ERR_TLS_CERT_ALTNAME_INVALID")), "tls"],
      [wrapped(coded("DEPTH_ZERO_SELF_SIGNED_CERT")), "tls"],
      [wrapped(coded("UNABLE_TO_VERIFY_LEAF_SIGNATURE")), "tls"],
      [wrapped(coded("ERR_SSL_WRONG_VERSION_NUMBER")), "tls"],
      [wrapped(coded("UND_ERR_HEADERS_TIMEOUT")), "timeout"],
      [wrapped(coded("UND_ERR_BODY_TIMEOUT")), "timeout"],
      [wrapped(coded("UND_ERR_RES_EXCEEDED_MAX_SIZE")), "too_large"],
      [wrapped(coded("UND_ERR_HEADERS_OVERFLOW")), "too_large"],
      [wrapped(coded("HPE_INVALID_CONSTANT")), "network"],
      [new DOMException("interrompu", "AbortError"), "aborted"],
      [new DOMException("délai", "TimeoutError"), "deadline"],
      [new Error("autre"), "network"],
      ["texte", "network"],
      [null, "network"],
      [undefined, "network"],
    ];
    for (const [error, code] of cases) expect(toSafeFetchError(error).code, String((error as Error | null)?.message ?? error)).toBe(code);
  });

  it("le message rendu est générique : il ne recopie ni l'adresse ni le détail de l'erreur réseau", () => {
    const error = toSafeFetchError(wrapped(Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:443"), { code: "ECONNREFUSED" })));
    expect(error.message).toBe("connexion impossible");
  });

  it("familles d'échec : refus de sécurité, échec avant toute réponse", () => {
    for (const code of ["bad_url", "bad_scheme", "credentials", "bad_port", "ip_literal", "bad_host", "private_address"] as const) expect(isPolicyRefusal(new SafeFetchError(code, "x")), code).toBe(true);
    for (const code of ["dns", "connect", "tls", "timeout", "robots", "offsite", "too_large", "network"] as const) expect(isPolicyRefusal(new SafeFetchError(code, "x")), code).toBe(false);
    for (const code of ["dns", "connect", "tls"] as const) expect(isConnectFailure(new SafeFetchError(code, "x")), code).toBe(true);
    for (const code of ["timeout", "deadline", "private_address", "bad_type", "network"] as const) expect(isConnectFailure(new SafeFetchError(code, "x")), code).toBe(false);
  });
});

describe("décodage", () => {
  const latin1 = Uint8Array.of(0x63, 0x61, 0x66, 0xe9);

  it("jeu de caractères de l'en-tête, sinon de la balise meta, sinon UTF-8", () => {
    expect(decodeHtml(latin1, "text/html; charset=windows-1252")).toBe("café");
    expect(decodeHtml(latin1, 'text/html; charset="ISO-8859-1"')).toBe("café");
    expect(decodeHtml(Buffer.concat([Buffer.from('<html><head><meta charset="iso-8859-15"></head><body>'), latin1]), "text/html")).toContain("café");
    expect(decodeHtml(Buffer.concat([Buffer.from('<meta http-equiv="Content-Type" content="text/html; charset=windows-1252">'), latin1]), null)).toContain("café");
    expect(decodeHtml(new TextEncoder().encode("<p>été</p>"), "text/html")).toBe("<p>été</p>");
  });

  it("jeu inconnu : ignoré ; marque d'ordre des octets : retirée", () => {
    expect(decodeHtml(new TextEncoder().encode("été"), "text/html; charset=klingon")).toBe("été");
    expect(decodeHtml(Uint8Array.of(0xef, 0xbb, 0xbf, 0x6f, 0x6b), "text/html; charset=utf-8")).toBe("ok");
    expect(decodeText(Uint8Array.of(0xef, 0xbb, 0xbf, 0x6f, 0x6b))).toBe("ok");
  });
});
