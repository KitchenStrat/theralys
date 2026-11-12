/**
 * Récupération durcie d'une adresse fournie par un utilisateur (défense
 * contre les requêtes forgées côté serveur, « SSRF »).
 *
 * Le praticien saisit l'adresse de son site : sans précaution, cette adresse
 * (ou une redirection, ou une réponse DNS changeante) ferait lire à notre
 * serveur un service interne — métadonnées de l'hébergeur, bouclage, réseau
 * privé. Quatre contrôles se recouvrent, chacun au plus près de la connexion :
 *
 * 1. l'adresse web (`checkUrl`) : https seulement, port par défaut, ni
 *    identifiants ni adresse IP littérale ni nom local — à chaque saut ;
 * 2. la résolution DNS (`createPolicyLookup`) : c'est la résolution utilisée
 *    par la socket qui est contrôlée (toutes les adresses rendues, refus dès
 *    qu'une seule n'est pas publique, échec = refus). Aucune résolution
 *    préalable séparée : une réponse DNS qui change entre le contrôle et la
 *    connexion (« DNS rebinding ») ne passe pas ;
 * 3. la liste de refus (`net.BlockList`) appliquée par Node au `connect()` :
 *    elle couvre aussi les adresses IP littérales, pour lesquelles Node
 *    n'appelle pas la résolution, et les adresses IPv4 écrites en IPv6 ;
 * 4. l'adresse réellement jointe, relue sur la socket une fois connectée.
 *
 * Écart avec `connect: { lookup, blockList }` passé tel quel à undici : sur
 * Node 22, `tls.connect()` ne transmet pas `blockList` à sa socket (vérifié
 * sur 22.22.0 : la connexion https vers une adresse refusée aboutissait). Le
 * connecteur ouvre donc lui-même la connexion TCP avec `net.connect`, qui
 * applique `lookup` et `blockList`, puis établit TLS par-dessus cette socket.
 *
 * Autour : redirections suivies à la main (rien n'est suivi sans repasser par
 * tous les contrôles), délai par requête, plafond de taille compté sur les
 * octets décodés (une réponse compressée de quelques kilo-octets peut en
 * contenir des centaines de millions), liste de types de contenu, aucun
 * cookie ni identifiant envoyé.
 *
 * `fetch` et `Agent` viennent tous deux du paquet `undici` : le `fetch`
 * global de Node refuse un `Agent` créé par une autre version d'undici.
 *
 * La politique est un paramètre pour que les tests puissent viser un serveur
 * local ; en production c'est toujours `PRODUCTION_POLICY`, qu'aucune
 * variable d'environnement ne modifie.
 */

import dns from "node:dns";
import net from "node:net";
import { Agent, buildConnector, fetch as undiciFetch, type Dispatcher } from "undici";

// ─── Erreurs ─────────────────────────────────────────────────────────────────

export type SafeFetchErrorCode =
  /** Adresse web refusée par la politique */
  | "bad_url"
  | "bad_scheme"
  | "credentials"
  | "bad_port"
  | "ip_literal"
  | "bad_host"
  /** Adresse IP non publique (résolution, liste de refus, socket) */
  | "private_address"
  /** Nom de domaine introuvable */
  | "dns"
  /** Connexion impossible (refusée, coupée, hôte muet) */
  | "connect"
  /** Certificat ou négociation TLS */
  | "tls"
  /** La requête a dépassé son délai */
  | "timeout"
  /** La lecture entière a dépassé sa durée */
  | "deadline"
  /** Interrompu par l'appelant */
  | "aborted"
  | "too_many_redirects"
  | "bad_redirect"
  /** Refus du garde de l'appelant : adresse hors du site */
  | "offsite"
  /** Refus du garde de l'appelant : robots.txt */
  | "robots"
  /** Refus du garde de l'appelant : le site refuse les robots */
  | "blocked"
  /** Type de contenu hors liste */
  | "bad_type"
  | "too_large"
  /** Autre erreur réseau ou de protocole */
  | "network";

/** Échec d'une récupération, avec un code exploitable par l'appelant. Le message ne contient jamais de contenu de page. */
export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode;
  /** Adresse concernée par un refus du garde (redirection hors site), sans ancre */
  readonly target?: string;

  constructor(code: SafeFetchErrorCode, message: string, target?: string) {
    super(message);
    this.name = "SafeFetchError";
    this.code = code;
    if (target !== undefined) this.target = target;
  }
}

const URL_POLICY_CODES: readonly SafeFetchErrorCode[] = ["bad_url", "bad_scheme", "credentials", "bad_port", "ip_literal", "bad_host", "private_address"];

/** L'échec vient-il de la politique de sécurité (adresse ou destination refusée) ? */
export function isPolicyRefusal(error: SafeFetchError): boolean {
  return URL_POLICY_CODES.includes(error.code);
}

/** L'échec s'est-il produit avant toute réponse du serveur (nom introuvable, connexion ou TLS impossibles) ? */
export function isConnectFailure(error: SafeFetchError): boolean {
  return error.code === "dns" || error.code === "connect" || error.code === "tls";
}

// ─── Adresses IP non publiques ───────────────────────────────────────────────

export type AddressRange = readonly [network: string, prefix: number];

/** IPv4 non routable sur l'internet public (registre IANA des adresses à usage spécial). */
export const BLOCKED_IPV4_RANGES: readonly AddressRange[] = [
  ["0.0.0.0", 8], // « ce réseau »
  ["10.0.0.0", 8], // privé
  ["100.64.0.0", 10], // partagé entre opérateurs (CGNAT)
  ["127.0.0.0", 8], // bouclage
  ["169.254.0.0", 16], // lien local, dont 169.254.169.254 (métadonnées des hébergeurs)
  ["172.16.0.0", 12], // privé
  ["192.0.0.0", 24], // protocoles IETF
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // relais 6to4 (déprécié)
  ["192.168.0.0", 16], // privé
  ["198.18.0.0", 15], // bancs d'essai
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multidiffusion
  ["240.0.0.0", 4], // réservé, dont la diffusion 255.255.255.255
];

/** IPv6 à usage spécial (registre IANA) : nommées ici pour être lisibles, même si le complément ci-dessous en recouvre plusieurs. */
const SPECIAL_IPV6_RANGES: readonly AddressRange[] = [
  ["64:ff9b::", 96], // traduction IPv4-IPv6 (NAT64) : mènerait à une adresse IPv4 quelconque
  ["64:ff9b:1::", 48], // NAT64 à usage local
  ["100::", 64], // rejet
  ["2001::", 23], // protocoles IETF, dont Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 : embarque une adresse IPv4
  ["3fff::", 20], // documentation
  ["5f00::", 16], // routage par segments
  ["fc00::", 7], // adresses locales uniques (ULA), dont les métadonnées IPv6 des hébergeurs
  ["fe80::", 10], // lien local
  ["fec0::", 10], // site local (déprécié)
  ["ff00::", 8], // multidiffusion
];

/** Hors de 2000::/3, rien n'est une adresse publique : blocs entiers non attribués. */
const UNALLOCATED_IPV6_RANGES: readonly AddressRange[] = [
  ["100::", 8],
  ["200::", 7],
  ["400::", 6],
  ["800::", 5],
  ["1000::", 4],
  ["4000::", 2],
  ["8000::", 1],
];

/**
 * Tout `::/8` sauf `::ffff:0:0/96`. Ce bloc contient l'adresse non
 * spécifiée, le bouclage `::1` et les adresses « compatibles IPv4 », toutes
 * à refuser ; mais aussi les adresses IPv4 écrites en IPv6 (`::ffff:a.b.c.d`),
 * que Node compare aux règles IPv4. Une règle IPv6 qui les engloberait
 * refuserait tout l'IPv4 (Node convertit chaque adresse IPv4 sous cette forme
 * pour la comparer aux règles IPv6) : on énumère donc le complément exact.
 */
function ipv6ZeroBlockExceptMapped(): AddressRange[] {
  const mapped = new Uint8Array(16);
  mapped[10] = 0xff;
  mapped[11] = 0xff;
  const bitOf = (bytes: Uint8Array, bit: number): boolean => ((bytes[bit >> 3] ?? 0) & (0x80 >> (bit & 7))) !== 0;
  const ranges: AddressRange[] = [];
  for (let bit = 8; bit < 96; bit++) {
    // Mêmes `bit` premiers bits que le préfixe épargné, bit suivant inversé : ce qui s'en écarte exactement ici
    const bytes = new Uint8Array(16);
    for (let i = 0; i < bit; i++) if (bitOf(mapped, i)) bytes[i >> 3] = (bytes[i >> 3] ?? 0) | (0x80 >> (i & 7));
    if (!bitOf(mapped, bit)) bytes[bit >> 3] = (bytes[bit >> 3] ?? 0) | (0x80 >> (bit & 7));
    const groups: string[] = [];
    for (let i = 0; i < 16; i += 2) groups.push((((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0)).toString(16));
    ranges.push([groups.join(":"), bit + 1]);
  }
  return ranges;
}

/** IPv6 refusé : tout sauf l'unicast global 2000::/3, et dans celui-ci les plages à usage spécial. */
export const BLOCKED_IPV6_RANGES: readonly AddressRange[] = [...SPECIAL_IPV6_RANGES, ...UNALLOCATED_IPV6_RANGES, ...ipv6ZeroBlockExceptMapped()];

/** Liste de refus de Node à partir de plages IPv4 et IPv6. */
export function buildBlockList(ipv4: readonly AddressRange[], ipv6: readonly AddressRange[]): net.BlockList {
  const list = new net.BlockList();
  for (const [network, prefix] of ipv4) list.addSubnet(network, prefix, "ipv4");
  for (const [network, prefix] of ipv6) list.addSubnet(network, prefix, "ipv6");
  return list;
}

/**
 * L'adresse IP est-elle hors de la liste de refus ? Faux pour tout ce qui
 * n'est pas une adresse IP bien formée. La famille est déduite de l'adresse :
 * `BlockList.check` répond « non refusée » quand la famille annoncée ne
 * correspond pas, ce qui ferait passer une adresse interne.
 */
export function isAddressOutside(blockList: net.BlockList, address: string): boolean {
  const family = net.isIP(address);
  // Une adresse à identifiant de zone (« fe80::1%eth0 ») est locale par définition
  if (family === 0 || address.includes("%")) return false;
  return !blockList.check(address, family === 6 ? "ipv6" : "ipv4");
}

// ─── Politique ───────────────────────────────────────────────────────────────

/** Résolveur au format de `dns.lookup(…, { all: true })`. */
export type DnsResolver = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => void;

export type NetworkPolicy = {
  /** Protocoles admis (`https:` seul en production) */
  readonly protocols: readonly string[];
  /** Un port écrit dans l'adresse est-il admis ? Jamais en production : port par défaut seulement */
  readonly allowExplicitPort: boolean;
  /** Une adresse IP littérale est-elle admise comme hôte ? Jamais en production : un site a un nom de domaine */
  readonly allowIpLiteral: boolean;
  /** Liste de refus appliquée par Node à la connexion */
  readonly blockList: net.BlockList;
  /** L'adresse IP (résolue, littérale ou relue sur la socket) est-elle joignable ? */
  readonly isAddressAllowed: (address: string) => boolean;
  /** Résolution DNS : celle du système en production (c'est celle des sockets) */
  readonly resolve: DnsResolver;
  /** Autorités de certification supplémentaires (tests avec un serveur https local) */
  readonly ca?: string;
};

/**
 * Politique à partir de la politique de production et de quelques écarts.
 * Réservé aux tests (serveur local sur 127.0.0.1) : rien dans ce module ne
 * lit de variable d'environnement.
 */
export function createNetworkPolicy(overrides: Partial<NetworkPolicy> = {}): NetworkPolicy {
  const blockList = overrides.blockList ?? PRODUCTION_BLOCK_LIST;
  return Object.freeze({
    protocols: ["https:"],
    allowExplicitPort: false,
    allowIpLiteral: false,
    isAddressAllowed: (address: string) => isAddressOutside(blockList, address),
    resolve: systemResolver,
    ...overrides,
    blockList,
  });
}

const systemResolver: DnsResolver = (hostname, options, callback) => dns.lookup(hostname, options, callback);

const PRODUCTION_BLOCK_LIST = buildBlockList(BLOCKED_IPV4_RANGES, BLOCKED_IPV6_RANGES);

/** Politique de production : https, port par défaut, noms de domaine publics, adresses publiques. */
export const PRODUCTION_POLICY: NetworkPolicy = createNetworkPolicy();

/** L'adresse IP est-elle une adresse publique (politique de production) ? */
export function isPublicAddress(address: string): boolean {
  return PRODUCTION_POLICY.isAddressAllowed(address);
}

// ─── Adresse web ─────────────────────────────────────────────────────────────

/** Suffixes de noms locaux ou réservés : jamais un site public. */
const RESERVED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".corp", ".arpa", ".onion", ".test", ".invalid", ".example", ".alt"];

/**
 * Adresse web contrôlée par la politique, sous forme normalisée (hôte en
 * minuscules et en ASCII, sans point final, sans ancre). Un seul analyseur
 * d'adresse est utilisé partout (celui du standard web, `URL`) : c'est aussi
 * celui du client HTTP, donc pas de lecture divergente de l'hôte. Lève
 * `SafeFetchError` en cas de refus.
 */
export function checkUrl(input: string | URL, policy: NetworkPolicy): URL {
  let url: URL;
  try {
    url = new URL(String(input));
  } catch {
    throw new SafeFetchError("bad_url", "adresse illisible");
  }
  if (!policy.protocols.includes(url.protocol)) throw new SafeFetchError("bad_scheme", "protocole refusé");
  if (url.username !== "" || url.password !== "") throw new SafeFetchError("credentials", "identifiants dans l'adresse");
  if (url.port !== "" && !policy.allowExplicitPort) throw new SafeFetchError("bad_port", "port explicite refusé");

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const literal = host.startsWith("[") ? host.slice(1, -1) : host;
  if (net.isIP(literal) !== 0) {
    if (!policy.allowIpLiteral) throw new SafeFetchError("ip_literal", "adresse IP littérale refusée");
    if (!policy.isAddressAllowed(literal)) throw new SafeFetchError("private_address", "adresse non publique");
  } else {
    if (host.length > 253 || !host.includes(".")) throw new SafeFetchError("bad_host", "nom d'hôte refusé");
    if (host === "localhost" || RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix))) throw new SafeFetchError("bad_host", "nom d'hôte réservé");
    url.hostname = host;
  }
  url.hash = "";
  return url;
}

// ─── Résolution et connexion ─────────────────────────────────────────────────

type SocketLookup = (hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => void;

/**
 * Résolution DNS donnée à la socket : toutes les adresses rendues sont
 * contrôlées et ce sont elles qui servent à la connexion. Une seule adresse
 * non publique refuse le nom entier ; une erreur ou une liste vide aussi.
 */
export function createPolicyLookup(policy: NetworkPolicy): SocketLookup {
  return (hostname, options, callback) => {
    policy.resolve(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) {
        callback(err, []);
        return;
      }
      const list = Array.isArray(addresses) ? addresses : [];
      if (list.length === 0) {
        callback(new SafeFetchError("dns", "aucune adresse pour ce nom"), []);
        return;
      }
      if (list.some((entry) => typeof entry?.address !== "string" || !policy.isAddressAllowed(entry.address))) {
        callback(new SafeFetchError("private_address", "le nom mène à une adresse non publique"), []);
        return;
      }
      if (options.all) callback(null, list);
      else callback(null, list[0]!.address, list[0]!.family);
    });
  };
}

/** Durée accordée à l'ouverture d'une connexion (TCP, puis TLS). */
const CONNECT_TIMEOUT_MS = 8_000;

/**
 * Connecteur d'undici : connexion TCP ouverte par `net.connect` (résolution
 * contrôlée et liste de refus appliquées par Node avant tout envoi), adresse
 * jointe relue sur la socket, puis TLS négocié par-dessus. HTTP/1.1 seulement :
 * les plafonds de ce module n'ont été vérifiés qu'avec ce protocole.
 */
function createConnector(policy: NetworkPolicy): buildConnector.connector {
  const tcp = buildConnector({ timeout: CONNECT_TIMEOUT_MS, allowH2: false, lookup: createPolicyLookup(policy), blockList: policy.blockList } as buildConnector.BuildOptions);
  // `rejectUnauthorized` explicite : NODE_TLS_REJECT_UNAUTHORIZED=0 ne doit pas désactiver le contrôle des certificats
  const tls = buildConnector({ timeout: CONNECT_TIMEOUT_MS, allowH2: false, rejectUnauthorized: true, ...(policy.ca ? { ca: policy.ca } : {}) });
  return (options, callback) => {
    const secure = options.protocol === "https:";
    tcp({ hostname: options.hostname, host: options.host, protocol: "http:", port: options.port || (secure ? "443" : "80"), localAddress: options.localAddress }, (err, socket) => {
      if (err || !socket) {
        callback(err ?? new SafeFetchError("connect", "connexion impossible"), null);
        return;
      }
      const peer = socket.remoteAddress;
      if (!peer || !policy.isAddressAllowed(peer)) {
        socket.destroy();
        callback(new SafeFetchError("private_address", "connexion vers une adresse non publique"), null);
        return;
      }
      if (!secure) {
        callback(null, socket);
        return;
      }
      tls({ ...options, httpSocket: socket }, (tlsErr, tlsSocket) => {
        if (tlsErr || !tlsSocket) {
          socket.destroy();
          callback(tlsErr ?? new SafeFetchError("tls", "négociation TLS impossible"), null);
          return;
        }
        callback(null, tlsSocket);
      });
    });
  };
}

/** En-têtes de réponse admis : 64 Kio (16 par défaut chez undici, dépassés par de vrais sites de constructeurs). */
export const MAX_HEADER_BYTES = 64 * 1024;
/** Plafond « sur le fil » (octets compressés), en complément du plafond sur les octets décodés. */
const MAX_WIRE_BYTES = 8 * 1024 * 1024;

/**
 * Agent HTTP d'une lecture de site : deux connexions au plus par origine,
 * connexions gardées quelques secondes (moins de négociations TLS chez le
 * site lu). À fermer en fin de lecture (`destroy()`) : les descripteurs sont
 * partagés entre les exécutions d'une même instance.
 */
export function createFetchAgent(policy: NetworkPolicy, opts: { requestTimeoutMs: number }): Agent {
  return new Agent({
    connect: createConnector(policy),
    connections: 2,
    pipelining: 1,
    allowH2: false,
    headersTimeout: opts.requestTimeoutMs,
    bodyTimeout: opts.requestTimeoutMs,
    keepAliveTimeout: 4_000,
    keepAliveMaxTimeout: 10_000,
    maxHeaderSize: MAX_HEADER_BYTES,
    maxResponseSize: MAX_WIRE_BYTES,
  });
}

// ─── Requête ─────────────────────────────────────────────────────────────────

export type SafeFetchOptions = {
  policy: NetworkPolicy;
  dispatcher: Dispatcher;
  userAgent: string;
  /** En-tête `Accept` envoyé */
  accept: string;
  /** Types de contenu admis pour une réponse 2xx (comparés au type sans paramètre, en minuscules) */
  contentTypes: RegExp;
  /** Une réponse 2xx sans type de contenu est-elle admise ? (robots.txt) */
  allowMissingType?: boolean;
  /** Plafond du corps, en octets décodés */
  maxBytes: number;
  /** Au-delà du plafond : échec `too_large` (défaut) ou corps coupé (robots.txt : le début suffit) */
  overflow?: "error" | "truncate";
  /** Délai d'une requête (connexion, en-têtes et corps) */
  timeoutMs: number;
  maxRedirects?: number;
  /** Interruption de toute la lecture (durée totale, appelant) */
  signal?: AbortSignal;
  /**
   * Appelé avant chaque requête — l'adresse de départ puis chaque
   * redirection — une fois l'adresse contrôlée. Lève pour refuser (hors du
   * site, interdit par robots.txt).
   */
  guard?: (target: URL, from: URL | null) => void | Promise<void>;
  /** Ordonnanceur de politesse : chaque requête passe par lui (concurrence, écart entre requêtes) */
  schedule?: <T>(task: () => Promise<T>) => Promise<T>;
  /** Appelé quand une requête part (comptage) */
  onRequest?: (url: URL) => void;
};

export type SafeFetchResult = {
  /** Adresse finale, après redirections, sans ancre */
  url: string;
  status: number;
  /** En-tête de la réponse finale, ou `null` */
  header: (name: string) => string | null;
  /** Type de contenu sans paramètre, en minuscules (« text/html ») ; vide s'il manque */
  contentType: string;
  /** Corps décodé ; pour une réponse hors 2xx, son début seulement (détection d'une page de défi) */
  body: Uint8Array;
  truncated: boolean;
  /** Redirections suivies */
  redirects: number;
};

const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
/** Début du corps gardé pour une réponse hors 2xx. */
const ERROR_BODY_BYTES = 64 * 1024;

type Hop = { redirect: string } | { result: Omit<SafeFetchResult, "redirects"> };

/**
 * Récupère une adresse en appliquant la politique à chaque saut. Rend la
 * réponse finale quel que soit son statut (l'appelant décide quoi faire d'un
 * 403 ou d'un 404) ; lève `SafeFetchError` quand la récupération elle-même
 * échoue ou est refusée.
 */
export async function safeFetch(input: string | URL, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 5;
  const schedule = options.schedule ?? (<T>(task: () => Promise<T>) => task());
  let url = checkUrl(input, options.policy);
  let from: URL | null = null;
  for (let redirects = 0; ; redirects++) {
    throwIfAborted(options.signal);
    if (options.guard) await options.guard(url, from);
    const target = url;
    const hop = await schedule(() => requestOnce(target, options));
    if ("result" in hop) return { ...hop.result, redirects };
    if (redirects >= maxRedirects) throw new SafeFetchError("too_many_redirects", "trop de redirections");
    let next: URL;
    try {
      next = new URL(hop.redirect, url);
    } catch {
      throw new SafeFetchError("bad_redirect", "redirection illisible");
    }
    next = checkUrl(next, options.policy);
    if (url.protocol === "https:" && next.protocol !== "https:") throw new SafeFetchError("bad_scheme", "redirection vers une adresse non chiffrée");
    from = url;
    url = next;
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw toSafeFetchError(signal.reason);
}

async function requestOnce(url: URL, options: SafeFetchOptions): Promise<Hop> {
  throwIfAborted(options.signal);
  const controller = new AbortController();
  const onAbort = (): void => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new SafeFetchError("timeout", "délai de réponse dépassé")), options.timeoutMs);
  try {
    options.onRequest?.(url);
    const response = await undiciFetch(url, {
      dispatcher: options.dispatcher,
      method: "GET",
      redirect: "manual",
      // Ni cookie, ni identifiant, ni adresse d'origine : chaque requête est anonyme et sans mémoire
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
      headers: { "user-agent": options.userAgent, accept: options.accept, "accept-language": "fr-FR,fr;q=0.9,en;q=0.5" },
    });
    const header = (name: string): string | null => response.headers.get(name);
    const discard = async (): Promise<void> => {
      await response.body?.cancel().catch(() => undefined);
    };

    if (REDIRECT_STATUSES.includes(response.status)) {
      await discard();
      const location = header("location");
      if (!location) throw new SafeFetchError("bad_redirect", "redirection sans destination");
      return { redirect: location };
    }

    const contentType = (header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const base = { url: url.href, status: response.status, header, contentType };
    if (response.status < 200 || response.status >= 300) {
      // Le statut suffit le plus souvent ; le début du corps sert à reconnaître une page de défi anti-robots
      const textual = contentType === "" || contentType.startsWith("text/") || contentType.includes("html");
      if (!textual) {
        await discard();
        return { result: { ...base, body: new Uint8Array(0), truncated: false } };
      }
      return { result: { ...base, ...(await readBody(response.body, ERROR_BODY_BYTES, "truncate")) } };
    }

    if (contentType === "" ? options.allowMissingType !== true : !options.contentTypes.test(contentType)) {
      await discard();
      throw new SafeFetchError("bad_type", contentType === "" ? "type de contenu absent" : `type de contenu ${contentType.slice(0, 60)}`);
    }
    const overflow = options.overflow ?? "error";
    const declared = Number(header("content-length") ?? "");
    if (overflow === "error" && !header("content-encoding") && Number.isFinite(declared) && declared > options.maxBytes) {
      await discard();
      throw new SafeFetchError("too_large", "réponse trop volumineuse");
    }
    return { result: { ...base, ...(await readBody(response.body, options.maxBytes, overflow)) } };
  } catch (err) {
    // Le motif de l'interruption prime sur l'erreur de transport qu'elle provoque
    throw toSafeFetchError(controller.signal.aborted ? controller.signal.reason : err);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

type ByteStream = { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> } };

/**
 * Lit le corps en comptant les octets décodés au fil de l'eau : c'est le seul
 * garde-fou efficace contre une réponse compressée piégée, le plafond
 * d'undici (`maxResponseSize`) ne comptant que les octets reçus.
 */
async function readBody(stream: ByteStream | null, maxBytes: number, overflow: "error" | "truncate"): Promise<{ body: Uint8Array; truncated: boolean }> {
  if (!stream) return { body: new Uint8Array(0), truncated: false };
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    if (total + value.byteLength > maxBytes) {
      await reader.cancel().catch(() => undefined);
      if (overflow === "error") throw new SafeFetchError("too_large", "réponse trop volumineuse");
      chunks.push(value.subarray(0, maxBytes - total));
      return { body: Buffer.concat(chunks, maxBytes), truncated: true };
    }
    chunks.push(value);
    total += value.byteLength;
  }
  return { body: Buffer.concat(chunks, total), truncated: false };
}

// ─── Classement des erreurs ──────────────────────────────────────────────────

const DNS_CODES = new Set(["ENOTFOUND", "ENODATA", "EAI_AGAIN", "EAI_NONAME", "EAI_NODATA", "EAI_FAIL", "ESERVFAIL", "ENXDOMAIN"]);
const CONNECT_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "EHOSTUNREACH", "EHOSTDOWN", "ENETUNREACH", "ENETDOWN", "EADDRNOTAVAIL", "EPIPE", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"]);
const TIMEOUT_CODES = new Set(["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);
const SIZE_CODES = new Set(["UND_ERR_RES_EXCEEDED_MAX_SIZE", "UND_ERR_HEADERS_OVERFLOW"]);
const TLS_CODE = /^(ERR_TLS_|ERR_SSL_|CERT_|UNABLE_TO_|SELF_SIGNED_|DEPTH_ZERO_|HOSTNAME_MISMATCH|EPROTO$)/;

/** Codes d'erreur portés par une erreur, sa cause et les erreurs qu'elle regroupe (connexion essayée sur plusieurs adresses). */
function errorCodes(err: unknown, depth = 0): string[] {
  if (err === null || typeof err !== "object" || depth > 4) return [];
  const node = err as { code?: unknown; cause?: unknown; errors?: unknown };
  const codes = typeof node.code === "string" ? [node.code] : [];
  if (Array.isArray(node.errors)) for (const inner of node.errors) codes.push(...errorCodes(inner, depth + 1));
  return [...codes, ...errorCodes(node.cause, depth + 1)];
}

function findSafeFetchError(err: unknown, depth = 0): SafeFetchError | null {
  if (err instanceof SafeFetchError) return err;
  if (err === null || typeof err !== "object" || depth > 4) return null;
  const node = err as { cause?: unknown; errors?: unknown };
  if (Array.isArray(node.errors)) {
    for (const inner of node.errors) {
      const found = findSafeFetchError(inner, depth + 1);
      if (found) return found;
    }
  }
  return findSafeFetchError(node.cause, depth + 1);
}

/**
 * Erreur quelconque (undici enveloppe les erreurs réseau dans un `TypeError`
 * « fetch failed ») → `SafeFetchError` au code exploitable. Le message reste
 * générique : le détail d'une erreur réseau ne doit pas servir de sonde.
 */
export function toSafeFetchError(err: unknown): SafeFetchError {
  const known = findSafeFetchError(err);
  if (known) return known;
  const name = err !== null && typeof err === "object" ? (err as { name?: unknown }).name : undefined;
  if (name === "TimeoutError") return new SafeFetchError("deadline", "durée de lecture dépassée");
  if (name === "AbortError") return new SafeFetchError("aborted", "lecture interrompue");
  const codes = errorCodes(err);
  if (codes.includes("ERR_IP_BLOCKED")) return new SafeFetchError("private_address", "connexion vers une adresse non publique");
  if (codes.some((code) => SIZE_CODES.has(code))) return new SafeFetchError("too_large", "réponse trop volumineuse");
  if (codes.some((code) => TIMEOUT_CODES.has(code))) return new SafeFetchError("timeout", "délai de réponse dépassé");
  if (codes.some((code) => DNS_CODES.has(code))) return new SafeFetchError("dns", "nom de domaine introuvable");
  if (codes.some((code) => TLS_CODE.test(code))) return new SafeFetchError("tls", "certificat ou négociation TLS refusés");
  if (codes.some((code) => CONNECT_CODES.has(code))) return new SafeFetchError("connect", "connexion impossible");
  return new SafeFetchError("network", "échange réseau interrompu");
}

// ─── Décodage ────────────────────────────────────────────────────────────────

/** Texte UTF-8 (robots.txt, plan de site) ; la marque d'ordre des octets est retirée. */
export function decodeText(body: Uint8Array): string {
  return new TextDecoder("utf-8").decode(body);
}

/**
 * HTML → texte : jeu de caractères annoncé par l'en-tête, sinon par une
 * balise `<meta>` du début du document, sinon UTF-8. Un jeu inconnu est
 * ignoré (l'étiquette vient du site lu).
 */
export function decodeHtml(body: Uint8Array, contentTypeHeader: string | null): string {
  const fromHeader = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentTypeHeader ?? "")?.[1];
  const head = new TextDecoder("latin1").decode(body.subarray(0, 4096));
  const fromMeta = /<meta[^>]{0,200}?charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(head)?.[1];
  for (const label of [fromHeader, fromMeta]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(body);
    } catch {
      // Étiquette inconnue : essai suivant
    }
  }
  return decodeText(body);
}
