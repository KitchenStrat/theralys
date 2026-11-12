/**
 * Outils des tests du lecteur de site : serveur HTTP local, résolveur DNS
 * simulé, politique réseau « de laboratoire » et certificat auto-signé.
 * Importé par les fichiers `*.test.ts` seulement — jamais par le lecteur.
 *
 * Principe : les tests gardent la politique de production et n'y ouvrent
 * qu'un seul passage, vers 127.0.0.1 (le serveur local). Les noms de domaine
 * des tests ne sont jamais résolus pour de bon : le résolveur simulé répond.
 */

import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import type dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net, { type AddressInfo } from "node:net";
import { BLOCKED_IPV4_RANGES, BLOCKED_IPV6_RANGES, buildBlockList, createNetworkPolicy, type DnsResolver, type NetworkPolicy } from "./safe-fetch";

// ─── Serveur local ───────────────────────────────────────────────────────────

export type RecordedRequest = {
  method: string;
  /** Hôte demandé, sans le port */
  host: string;
  /** Chemin et paramètres */
  path: string;
  headers: http.IncomingHttpHeaders;
  /** Date de réception (ms) */
  at: number;
};

export type Reply = {
  status?: number;
  headers?: Record<string, string | string[]>;
  body?: string | Uint8Array;
  /** Attente avant de répondre (ms) */
  delayMs?: number;
  /** Ne jamais répondre */
  hang?: boolean;
};

export type Handler = (request: RecordedRequest, response: http.ServerResponse) => Reply | void | Promise<Reply | void>;

export type TestServer = {
  port: number;
  requests: RecordedRequest[];
  /** Connexions TCP reçues depuis le démarrage */
  connections: () => number;
  /** Chemins demandés, dans l'ordre (hôte compris si `withHost`) */
  paths: (withHost?: boolean) => string[];
  close: () => Promise<void>;
};

/** Réponse HTML minimale. */
export const html = (body: string, extra: Partial<Reply> = {}): Reply => ({ ...extra, headers: { "content-type": "text/html; charset=utf-8", ...extra.headers }, body });

/**
 * Démarre un serveur sur 127.0.0.1 (port libre). Le gestionnaire rend une
 * réponse, ou écrit lui-même dans `response` et ne rend rien. Avec `tls`, le
 * serveur parle https.
 */
export async function startServer(handler: Handler, tls?: { key: string; cert: string }): Promise<TestServer> {
  const requests: RecordedRequest[] = [];
  let connections = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const listener = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const request: RecordedRequest = { method: req.method ?? "GET", host: (req.headers.host ?? "").replace(/:\d+$/, ""), path: req.url ?? "/", headers: req.headers, at: Date.now() };
    requests.push(request);
    void Promise.resolve(handler(request, res))
      .then((reply) => {
        if (!reply || reply.hang) return;
        const send = (): void => {
          res.writeHead(reply.status ?? 200, reply.headers ?? {});
          res.end(reply.body ?? "");
        };
        if (reply.delayMs) {
          const timer = setTimeout(() => {
            timers.delete(timer);
            send();
          }, reply.delayMs);
          timers.add(timer);
        } else send();
      })
      .catch(() => {
        res.statusCode = 500;
        res.end();
      });
  };
  const server = tls ? https.createServer(tls, listener) : http.createServer(listener);
  server.on("connection", () => {
    connections += 1;
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    requests,
    connections: () => connections,
    paths: (withHost = false) => requests.map((request) => (withHost ? `${request.host}${request.path}` : request.path)),
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// ─── Résolveur simulé ────────────────────────────────────────────────────────

/** Réponse du résolveur pour un nom : une ou plusieurs adresses, ou une fonction (réponse changeante). */
export type FakeAnswer = string | string[] | ((call: number) => string | string[]);

export type FakeResolver = DnsResolver & { calls: string[] };

/** Résolveur simulé : les noms absents de la table n'existent pas (`ENOTFOUND`). */
export function fakeResolver(table: Record<string, FakeAnswer>): FakeResolver {
  const calls: string[] = [];
  const resolver: DnsResolver = (hostname, _options, callback) => {
    calls.push(hostname);
    const entry = table[hostname];
    if (entry === undefined) {
      callback(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }), []);
      return;
    }
    const answer = typeof entry === "function" ? entry(calls.filter((name) => name === hostname).length) : entry;
    const addresses: dns.LookupAddress[] = (Array.isArray(answer) ? answer : [answer]).map((address) => ({ address, family: net.isIP(address) === 6 ? 6 : 4 }));
    callback(null, addresses);
  };
  return Object.assign(resolver, { calls });
}

// ─── Politique de laboratoire ────────────────────────────────────────────────

/** La liste de refus de production, 127.0.0.1 excepté (tout le reste du bouclage reste refusé). */
export function localBlockList(): net.BlockList {
  const list = buildBlockList(
    BLOCKED_IPV4_RANGES.filter(([network]) => network !== "127.0.0.0"),
    BLOCKED_IPV6_RANGES,
  );
  list.addAddress("127.0.0.0", "ipv4");
  list.addRange("127.0.0.2", "127.255.255.255", "ipv4");
  return list;
}

/**
 * Politique des tests : celle de production, plus http et un port explicite
 * (le serveur local), 127.0.0.1 joignable, et un résolveur simulé.
 */
export function localPolicy(table: Record<string, FakeAnswer>, overrides: Partial<NetworkPolicy> = {}): NetworkPolicy & { resolve: FakeResolver } {
  const resolve = fakeResolver(table);
  return { ...createNetworkPolicy({ protocols: ["http:", "https:"], allowExplicitPort: true, blockList: localBlockList(), resolve, ...overrides }), resolve };
}

// ─── Certificat auto-signé ───────────────────────────────────────────────────

const derLength = (length: number): Buffer => (length < 0x80 ? Buffer.from([length]) : length < 0x100 ? Buffer.from([0x81, length]) : Buffer.from([0x82, length >> 8, length & 0xff]));
const der = (tag: number, ...parts: Uint8Array[]): Buffer => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
};
const sequence = (...parts: Uint8Array[]): Buffer => der(0x30, ...parts);
const oid = (hex: string): Buffer => der(0x06, Buffer.from(hex, "hex"));
const utcTime = (date: Date): Buffer => der(0x17, Buffer.from(`${date.toISOString().replace(/[-:T]/g, "").slice(2, 14)}Z`, "ascii"));

/**
 * Certificat X.509 auto-signé (ECDSA P-256) pour les noms donnés, écrit à la
 * main en DER : pas de clé privée dans le dépôt, pas de dépendance à la
 * commande `openssl`. Valable une journée ; ne sert qu'au serveur https local.
 */
export function selfSignedCertificate(names: readonly string[]): { key: string; cert: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const ecdsaWithSha256 = sequence(oid("2a8648ce3d040302"));
  const name = sequence(der(0x31, sequence(oid("550403"), der(0x0c, Buffer.from(names[0] ?? "test", "utf8")))));
  const altNames = sequence(...names.map((entry) => der(0x82, Buffer.from(entry, "ascii"))));
  const extensions = der(
    0xa3,
    sequence(
      sequence(oid("551d11"), der(0x04, altNames)),
      // Contrainte de base « autorité » : le certificat est sa propre racine de confiance
      sequence(oid("551d13"), der(0x01, Buffer.from([0xff])), der(0x04, sequence(der(0x01, Buffer.from([0xff]))))),
    ),
  );
  const serial = randomBytes(8);
  serial[0] = ((serial[0] ?? 0) & 0x7f) | 0x01;
  const now = Date.now();
  const body = sequence(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, serial),
    ecdsaWithSha256,
    name,
    sequence(utcTime(new Date(now - 3_600_000)), utcTime(new Date(now + 24 * 3_600_000))),
    name,
    publicKey.export({ type: "spki", format: "der" }),
    extensions,
  );
  const certificate = sequence(body, ecdsaWithSha256, der(0x03, Buffer.from([0]), sign("sha256", body, privateKey)));
  const lines = certificate.toString("base64").match(/.{1,64}/g) ?? [];
  return { key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), cert: `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n` };
}
