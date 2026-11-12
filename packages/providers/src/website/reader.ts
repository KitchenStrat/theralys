/**
 * Lecteur réel du site d'un client : à partir de l'adresse d'accueil, il lit
 * poliment une poignée de pages publiques et rend leurs textes et les faits
 * relevés dans leur code (cf. `ExternalReadOutcome`).
 *
 * Déroulé d'une lecture :
 * 1. robots.txt de l'origine, puis la page d'accueil (redirections vers le
 *    même site suivies ; si l'hôte ne répond pas, un essai avec ou sans
 *    « www. ») ;
 * 2. les liens de l'accueil — et le plan de site s'ils ne suffisent pas —
 *    sont classés, les pages les plus utiles au profil choisies ;
 * 3. ces pages sont lues, deux à la fois au plus et à un rythme lent ;
 * 4. textes nettoyés et faits sont réunis.
 *
 * Ce que le lecteur s'interdit, quoi qu'il arrive : se présenter comme un
 * navigateur, envoyer un cookie, lire ce que robots.txt interdit, insister
 * ou changer d'identité quand le site le refuse (défi anti-robots, 403, 429)
 * — dans ce cas la lecture s'arrête et le praticien colle son texte.
 *
 * `read()` ne lève jamais : tout échec est une issue `ok: false`.
 */

import net from "node:net";
import { EXTERNAL_SITE_LIMITS, isSameSiteHost, type ExternalPageKind, type ExternalReadError, type ExternalReadOutcome, type ExternalSitePage } from "@theralys/shared";
import { recordApiUsage } from "@theralys/shared/usage-runtime";
import { isAutomationRefusal, isChallengeResponse } from "./challenge";
import { SPECIALTY_PAGES_MAX, collectLinks, isInScope, pageKey, parseSitemap, pickChildSitemaps, planPages, toCandidates, type PageCandidate, type PageLink, type SiteScope } from "./discover";
import { extractPage, loadDocument, metaRefreshTarget, type ExtractedPage } from "./extract";
import { collectPageFacts, mergeSiteFacts, type PageFacts } from "./facts";
import { ROBOTS_ABSENT, ROBOTS_MAX_BYTES, robotsFromResponse, type RobotsRules } from "./robots";
import { PRODUCTION_POLICY, SafeFetchError, checkUrl, createFetchAgent, decodeHtml, decodeText, isConnectFailure, isPolicyRefusal, safeFetch, type NetworkPolicy, type SafeFetchOptions, type SafeFetchResult } from "./safe-fetch";
import { sha256Hex } from "./text";
import { createThrottle } from "./throttle";
import type { WebsiteReadOptions, WebsiteReader } from "./types";

/** Réglages du lecteur. Aucun ne vient d'une variable d'environnement. */
export const READER_DEFAULTS = {
  /** Durée totale d'une lecture */
  deadlineMs: 45_000,
  /** Durée totale la plus longue qu'un appelant peut demander */
  maxDeadlineMs: 120_000,
  /** Délai d'une requête (connexion, en-têtes, corps) */
  requestTimeoutMs: 10_000,
  /** Requêtes simultanées vers le site */
  concurrency: 2,
  /** Écart entre deux requêtes vers le site */
  minIntervalMs: 300,
  /** Taille d'une page, en octets décodés (une page de constructeur de site dépasse le mégaoctet) */
  pageBytes: 5 * 1024 * 1024,
  /** Taille d'un plan de site */
  sitemapBytes: 2 * 1024 * 1024,
  /** Plans de site lus au plus (un index et ses plans secondaires) */
  sitemaps: 3,
  /** Échecs de suite après lesquels la lecture des pages s'arrête */
  consecutiveFailures: 3,
} as const;

export type LiveReaderOptions = {
  /** En-tête User-Agent : toujours celui d'un robot identifié, jamais celui d'un navigateur */
  userAgent: string;
  /** Politique réseau. Réservé aux tests (serveur local) : en production, toujours `PRODUCTION_POLICY`. */
  policy?: NetworkPolicy;
  minIntervalMs?: number;
  concurrency?: number;
  requestTimeoutMs?: number;
  now?: () => Date;
};

type Failure = { error: ExternalReadError; detail: string };

/** Arrêt de la lecture avec son motif, tel qu'il sera rendu à l'appelant. */
class ReadStop extends Error {
  constructor(readonly failure: Failure) {
    super(failure.detail);
    this.name = "ReadStop";
  }
}

const HTML_PAGE = { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", contentTypes: /^(?:text\/html|application\/xhtml\+xml)$/, maxBytes: READER_DEFAULTS.pageBytes } as const;
const ROBOTS_FILE = { accept: "text/plain,*/*;q=0.1", contentTypes: /^text\//, allowMissingType: true, maxBytes: ROBOTS_MAX_BYTES, overflow: "truncate" } as const;
const SITEMAP_FILE = { accept: "application/xml,text/xml;q=0.9,*/*;q=0.1", contentTypes: /^(?:application|text)\/xml$/, maxBytes: READER_DEFAULTS.sitemapBytes } as const;

/** Échec de la récupération de la page d'accueil → échec de lecture montré au praticien. */
export function homeFailure(error: SafeFetchError): Failure {
  if (isPolicyRefusal(error)) return { error: "unsafe", detail: error.message };
  switch (error.code) {
    case "offsite":
      return { error: "redirect", detail: error.target ? `redirection vers ${error.target}` : error.message };
    case "robots":
      return { error: "robots", detail: error.message };
    case "blocked":
      return { error: "blocked", detail: error.message };
    case "bad_type":
      return { error: "not_html", detail: error.message };
    case "too_large":
      return { error: "too_large", detail: error.message };
    case "timeout":
    case "deadline":
      return { error: "timeout", detail: error.message };
    case "aborted":
      return { error: "internal", detail: error.message };
    default:
      return { error: "unreachable", detail: error.message };
  }
}

/** L'autre écriture de l'hôte : avec « www. » s'il n'y est pas, sans s'il y est. */
function alternateHost(url: URL): URL | null {
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0) return null;
  const other = new URL(url.href);
  other.hostname = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
  return other.hostname.includes(".") ? other : null;
}

/**
 * Périmètre de la lecture d'après l'adresse donnée et l'adresse d'accueil
 * réellement servie. L'origine est celle qui répond (avec ou sans « www. ») ;
 * le chemin de base reste celui de l'adresse donnée — une accueil servie sous
 * `/accueil/` ne restreint pas le site à ce dossier — sauf si le site a été
 * déplacé sous un autre chemin du même hôte.
 */
export function resolveScope(given: URL, served: URL): SiteScope {
  const givenPath = given.pathname.replace(/\/+$/, "");
  const servedPath = served.pathname.replace(/\/+$/, "");
  let basePath = givenPath;
  if (givenPath !== "" && servedPath !== givenPath && !servedPath.startsWith(`${givenPath}/`)) basePath = servedPath.replace(/\/[^/]*\.[a-z0-9]{2,5}$/i, "");
  return { origin: served.origin, basePath, homePath: served.pathname };
}

/** Valeur d'en-tête gardée telle quelle si elle est courte et imprimable (validateurs HTTP). */
function headerValue(value: string | null): string | undefined {
  const clean = (value ?? "").replace(/[^\x20-\x7e]/g, "").trim();
  return clean !== "" && clean.length <= 200 ? clean : undefined;
}

function toPage(url: string, kind: ExternalPageKind, extracted: ExtractedPage, response: SafeFetchResult, fetchedAt: string): ExternalSitePage {
  const etag = headerValue(response.header("etag"));
  const lastModified = headerValue(response.header("last-modified"));
  return {
    url,
    kind,
    title: extracted.title,
    ...(extracted.description ? { description: extracted.description } : {}),
    headings: extracted.headings,
    text: extracted.text,
    hash: sha256Hex(extracted.text),
    fetchedAt,
    ...(etag ? { etag } : {}),
    ...(lastModified ? { lastModified } : {}),
  };
}

type PageResult =
  | { status: "ok"; page: ExternalSitePage; facts: PageFacts; links: PageLink[] }
  /** Interdite par robots.txt : aucune requête n'est partie */
  | { status: "robots" }
  /** Même page qu'une page déjà lue (autre adresse, même contenu) */
  | { status: "duplicate" }
  | { status: "failed" }
  /** Le site refuse le robot (défi, 429) : la lecture des pages s'arrête */
  | { status: "refused" }
  /** Durée totale écoulée ou lecture interrompue */
  | { status: "interrupted" };

type ReadStats = { requests: number; pages: number };

async function readSite(config: Required<Omit<LiveReaderOptions, "policy">> & { policy: NetworkPolicy }, givenUrl: string, opts: WebsiteReadOptions, stats: ReadStats): Promise<ExternalReadOutcome> {
  const limits = EXTERNAL_SITE_LIMITS;
  const maxPages = Math.max(1, Math.min(Math.trunc(opts.maxPages ?? limits.maxPages) || 1, limits.maxPages));
  const deadlineMs = Math.max(1, Math.min(Math.trunc(opts.deadlineMs ?? READER_DEFAULTS.deadlineMs) || READER_DEFAULTS.deadlineMs, READER_DEFAULTS.maxDeadlineMs));
  const { policy } = config;

  let given: URL;
  try {
    given = checkUrl(givenUrl, policy);
  } catch (err) {
    if (err instanceof SafeFetchError) return { ok: false, ...homeFailure(err) };
    throw err;
  }
  given.search = "";

  // Un seul signal borne toute la lecture : durée totale écoulée, ou interruption par l'appelant
  const stop = new AbortController();
  const deadline = setTimeout(() => stop.abort(new SafeFetchError("deadline", "durée de lecture dépassée")), deadlineMs);
  const onCallerAbort = (): void => stop.abort(new SafeFetchError("aborted", "lecture interrompue"));
  if (opts.signal?.aborted) onCallerAbort();
  else opts.signal?.addEventListener("abort", onCallerAbort, { once: true });

  const agent = createFetchAgent(policy, { requestTimeoutMs: config.requestTimeoutMs });
  const throttle = createThrottle({ concurrency: config.concurrency, minIntervalMs: config.minIntervalMs, signal: stop.signal });
  const request: Pick<SafeFetchOptions, "policy" | "dispatcher" | "userAgent" | "timeoutMs" | "signal" | "schedule" | "onRequest"> = {
    policy,
    dispatcher: agent,
    userAgent: config.userAgent,
    timeoutMs: config.requestTimeoutMs,
    signal: stop.signal,
    schedule: throttle.run,
    onRequest: () => {
      stats.requests += 1;
    },
  };

  // ── robots.txt : lu une fois par origine, avant toute page de cette origine ──
  const robotsByOrigin = new Map<string, Promise<RobotsRules>>();
  const loadRobots = async (origin: string): Promise<RobotsRules> => {
    const robotsUrl = `${origin}/robots.txt`;
    let response: SafeFetchResult;
    try {
      response = await safeFetch(robotsUrl, { ...request, ...ROBOTS_FILE });
    } catch (err) {
      // Fichier inexploitable (autre chose que du texte, redirections sans fin ou vers une adresse refusée) : comme s'il n'existait pas.
      // Site injoignable ou muet : l'échec remonte, aucune page n'est demandée.
      if (err instanceof SafeFetchError && (err.code === "bad_type" || err.code === "too_many_redirects" || err.code === "bad_redirect" || isPolicyRefusal(err))) return ROBOTS_ABSENT;
      throw err;
    }
    const body = decodeText(response.body);
    if (response.status === 429 || isChallengeResponse({ status: response.status, header: response.header, body })) throw new SafeFetchError("blocked", `le site refuse les robots (HTTP ${response.status} sur robots.txt)`);
    const rules = robotsFromResponse(robotsUrl, response.status, body);
    if (rules.crawlDelayMs !== null) throttle.setCrawlDelay(rules.crawlDelayMs);
    // Fichier servi par l'autre écriture de l'hôte (redirection vers « www. ») : il vaut aussi pour elle, inutile de le redemander
    const served = new URL(response.url);
    if (served.origin !== origin && served.pathname === "/robots.txt" && !robotsByOrigin.has(served.origin)) robotsByOrigin.set(served.origin, Promise.resolve(robotsFromResponse(response.url, response.status, body)));
    return rules;
  };
  const robotsFor = (origin: string): Promise<RobotsRules> => {
    let rules = robotsByOrigin.get(origin);
    if (!rules) {
      rules = loadRobots(origin);
      robotsByOrigin.set(origin, rules);
    }
    return rules;
  };

  /** Avant chaque requête de page, redirections comprises : rester sur le site, et respecter son robots.txt. */
  const guard = async (target: URL): Promise<void> => {
    if (!isSameSiteHost(target.href, given.href)) throw new SafeFetchError("offsite", "adresse hors du site", target.origin);
    const rules = await robotsFor(target.origin);
    if (!rules.isAllowed(target.href)) throw new SafeFetchError("robots", rules.source === "unavailable" ? "robots.txt indisponible : lecture interdite" : "lecture interdite par robots.txt");
  };

  /** Page d'accueil : redirections HTTP suivies par `safeFetch`, redirection par balise meta suivie ici (deux au plus). */
  const fetchHome = async (start: URL): Promise<{ response: SafeFetchResult; html: string }> => {
    let target = start.href;
    for (let refreshes = 0; ; refreshes++) {
      const response = await safeFetch(target, { ...request, ...HTML_PAGE, guard });
      const html = decodeHtml(response.body, response.header("content-type"));
      if (isAutomationRefusal({ status: response.status, header: response.header, body: html })) throw new ReadStop({ error: "blocked", detail: `le site refuse les robots (HTTP ${response.status})` });
      if (response.status < 200 || response.status >= 300) throw new ReadStop({ error: "unreachable", detail: `réponse HTTP ${response.status}` });
      const next = refreshes < 2 ? metaRefreshTarget(loadDocument(html.slice(0, 64 * 1024)), response.url) : null;
      if (next === null) return { response, html };
      target = next;
    }
  };

  try {
    // ── 1. Page d'accueil (avec un essai sur l'autre écriture de l'hôte s'il ne répond pas) ──
    let home: { response: SafeFetchResult; html: string };
    try {
      home = await fetchHome(given);
    } catch (err) {
      const alternate = err instanceof SafeFetchError && isConnectFailure(err) ? alternateHost(given) : null;
      if (!alternate) throw err;
      try {
        home = await fetchHome(alternate);
      } catch (second) {
        // L'autre écriture ne répond pas davantage : l'échec de l'adresse donnée fait foi
        throw second instanceof SafeFetchError && isConnectFailure(second) ? err : second;
      }
    }

    const servedHome = new URL(home.response.url);
    const scope = resolveScope(given, servedHome);
    const fetchedAt = (): string => config.now().toISOString();

    const homeDocument = loadDocument(home.html);
    const homeLinks = collectLinks(homeDocument, servedHome.href, scope);
    const homeFacts = collectPageFacts(homeDocument, home.html, servedHome.href);
    const homePage = toPage(servedHome.href, "home", extractPage(homeDocument, servedHome.href), home.response, fetchedAt());
    stats.pages = 1;

    // ── 2. Pages à lire ──
    /** Pages annoncées par le plan de site : celui que déclare robots.txt, sinon `/sitemap.xml`. Tout échec est ignoré. */
    const readSitemaps = async (): Promise<PageLink[]> => {
      const found: PageLink[] = [];
      const inSite = (value: string): URL | null => {
        try {
          const url = new URL(value.trim(), scope.origin);
          return (url.protocol === "https:" || url.protocol === "http:") && isSameSiteHost(url.href, scope.origin) ? url : null;
        } catch {
          return null;
        }
      };
      const declared = (await robotsFor(scope.origin)).sitemaps.map(inSite).filter((url): url is URL => url !== null);
      const pending: string[] = [declared[0]?.href ?? `${scope.origin}/sitemap.xml`];
      const seen = new Set<string>();
      for (let fetched = 0; pending.length > 0 && fetched < READER_DEFAULTS.sitemaps; fetched++) {
        const sitemapUrl = pending.shift()!;
        if (seen.has(sitemapUrl)) continue;
        seen.add(sitemapUrl);
        let response: SafeFetchResult;
        try {
          response = await safeFetch(sitemapUrl, { ...request, ...SITEMAP_FILE, guard });
        } catch (err) {
          if (!(err instanceof SafeFetchError)) throw err;
          if (err.code === "deadline" || err.code === "aborted") break;
          continue;
        }
        if (response.status < 200 || response.status >= 300) continue;
        const sitemap = parseSitemap(decodeText(response.body));
        for (const location of sitemap.pages) {
          const url = inSite(location);
          if (url && isInScope(url, scope)) found.push({ url: new URL(`${url.pathname}${url.search}`, scope.origin).href, text: "", area: "sitemap" });
        }
        const children = sitemap.sitemaps.map(inSite).filter((url): url is URL => url !== null);
        pending.push(...pickChildSitemaps(children.map((url) => url.href), READER_DEFAULTS.sitemaps - 1));
      }
      return found;
    };

    const known = new Set<string>([pageKey(servedHome), pageKey(new URL(`${scope.origin}${scope.basePath}/`))]);
    let links = homeLinks;
    let plan = planPages(toCandidates(links, scope, known));
    if (maxPages > 1 && plan.length < maxPages - 1) {
      // L'accueil ne mène pas à assez de pages (menu construit en JavaScript, site d'une page) : le plan de site complète
      links = [...links, ...(await readSitemaps())];
      plan = planPages(toCandidates(links, scope, known));
    }

    // ── 3. Lecture des pages, les plus utiles d'abord ──
    const queue = [...plan];
    const queued = new Set<string>(plan.map((candidate) => candidate.key));
    const rank = new Map<string, number>(plan.map((candidate, index) => [candidate.key, index]));
    const readKeys = new Set<string>(known);
    const hashes = new Set<string>([homePage.hash]);
    const read: { page: ExternalSitePage; facts: PageFacts; rank: number }[] = [];
    const skipped = { robots: 0, failed: 0 };
    let specialties = plan.filter((candidate) => candidate.kind === "specialty").length;
    let refused = false;
    let halted = false;
    let failuresInARow = 0;
    let attempts = 0;
    const maxAttempts = maxPages + 6;

    const readPage = async (candidate: PageCandidate): Promise<PageResult> => {
      try {
        const response = await safeFetch(candidate.url, { ...request, ...HTML_PAGE, guard });
        const html = decodeHtml(response.body, response.header("content-type"));
        if (response.status === 429 || isChallengeResponse({ status: response.status, header: response.header, body: html })) return { status: "refused" };
        if (response.status < 200 || response.status >= 300) return { status: "failed" };
        const served = new URL(response.url);
        if (!isInScope(served, scope)) return { status: "failed" };
        const key = pageKey(served);
        if (key !== candidate.key && readKeys.has(key)) return { status: "duplicate" };
        readKeys.add(key);
        const document = loadDocument(html);
        // Une page de prestations mène aux pages de spécialité que le menu ne montre pas toujours
        const pageLinks = candidate.kind === "services" ? collectLinks(document, served.href, scope) : [];
        const facts = collectPageFacts(document, html, served.href);
        const page = toPage(served.href, candidate.kind, extractPage(document, served.href), response, fetchedAt());
        if (page.text === "") return { status: "failed" };
        if (hashes.has(page.hash)) return { status: "duplicate" };
        hashes.add(page.hash);
        return { status: "ok", page, facts, links: pageLinks };
      } catch (err) {
        if (!(err instanceof SafeFetchError)) throw err;
        if (err.code === "robots") return { status: "robots" };
        if (err.code === "blocked") return { status: "refused" };
        if (err.code === "deadline" || err.code === "aborted") return { status: "interrupted" };
        return { status: "failed" };
      }
    };

    const settle = (candidate: PageCandidate, result: PageResult): void => {
      if (result.status === "ok") {
        failuresInARow = 0;
        if (read.length + 1 < maxPages) {
          read.push({ page: result.page, facts: result.facts, rank: rank.get(candidate.key) ?? rank.size });
          stats.pages = read.length + 1;
        }
        // Spécialités découvertes sur une page de prestations : lues en priorité, dans la limite des spécialités d'une lecture
        const fresh = toCandidates(result.links, scope, new Set([...readKeys, ...queued]))
          .filter((found) => found.kind === "specialty")
          .slice(0, Math.max(0, SPECIALTY_PAGES_MAX - specialties));
        for (const found of fresh) {
          queued.add(found.key);
          rank.set(found.key, rank.size);
        }
        specialties += fresh.length;
        queue.unshift(...fresh);
        return;
      }
      if (result.status === "robots") skipped.robots += 1;
      else if (result.status === "duplicate") return;
      else skipped.failed += 1;
      if (result.status === "refused") refused = true;
      if (result.status === "refused" || result.status === "interrupted") halted = true;
      if (result.status === "failed" && ++failuresInARow >= READER_DEFAULTS.consecutiveFailures) halted = true;
    };

    const running = new Set<Promise<void>>();
    while (!halted && !stop.signal.aborted) {
      while (!halted && running.size < config.concurrency && read.length + 1 + running.size < maxPages && queue.length > 0 && attempts < maxAttempts) {
        const candidate = queue.shift()!;
        attempts += 1;
        const task: Promise<void> = readPage(candidate)
          .then((result) => settle(candidate, result))
          .finally(() => {
            running.delete(task);
          });
        // Une erreur imprévue remonte par l'attente ci-dessous ; les autres lectures en cours ne doivent pas en lever une seconde, orpheline
        task.catch(() => undefined);
        running.add(task);
      }
      if (running.size === 0) break;
      await Promise.race(running);
    }
    // Les lectures déjà parties se terminent (ou sont interrompues par le signal) avant de conclure
    await Promise.all(running);

    // ── 4. Issue ──
    read.sort((a, b) => a.rank - b.rank);
    const pages = [homePage, ...read.map((entry) => entry.page)];
    const characters = pages.reduce((sum, page) => sum + page.text.length, 0);
    if (characters < limits.minChars) {
      const detail = `${characters} caractères lus sur ${pages.length} page${pages.length > 1 ? "s" : ""}`;
      return { ok: false, error: refused ? "blocked" : "empty", detail: refused ? `le site refuse les robots (${detail})` : detail };
    }
    const facts = mergeSiteFacts([homeFacts, ...read.map((entry) => entry.facts)], homePage.title);
    return { ok: true, url: `${scope.origin}${scope.basePath}`, pages, facts, skipped };
  } catch (err) {
    if (err instanceof ReadStop) return { ok: false, ...err.failure };
    if (err instanceof SafeFetchError) return { ok: false, ...homeFailure(err) };
    throw err;
  } finally {
    clearTimeout(deadline);
    opts.signal?.removeEventListener("abort", onCallerAbort);
    await agent.destroy().catch(() => undefined);
  }
}

/**
 * Lecteur réel. Chaque lecture ouvre son propre agent HTTP, fermé à la fin,
 * et s'inscrit une fois au registre des appels API (fournisseur
 * `client_site`, opération `site_read`, gratuit, unités = pages lues ; en
 * échec, le code de l'échec).
 */
export function createLiveWebsiteReader(options: LiveReaderOptions): WebsiteReader {
  const config = {
    userAgent: options.userAgent,
    policy: options.policy ?? PRODUCTION_POLICY,
    minIntervalMs: options.minIntervalMs ?? READER_DEFAULTS.minIntervalMs,
    concurrency: options.concurrency ?? READER_DEFAULTS.concurrency,
    requestTimeoutMs: options.requestTimeoutMs ?? READER_DEFAULTS.requestTimeoutMs,
    now: options.now ?? (() => new Date()),
  };
  return {
    mode: "live",
    async read(url, opts = {}): Promise<ExternalReadOutcome> {
      const started = Date.now();
      const stats: ReadStats = { requests: 0, pages: 0 };
      let outcome: ExternalReadOutcome;
      try {
        outcome = await readSite(config, url, opts, stats);
      } catch (err) {
        // Erreur imprévue : son message peut contenir n'importe quoi, seul son type est gardé
        outcome = { ok: false, error: "internal", detail: err instanceof Error ? err.name : "erreur inattendue" };
      }
      await recordApiUsage({
        provider: "client_site",
        operation: "site_read",
        status: outcome.ok ? "ok" : "error",
        requests: stats.requests,
        units: stats.pages,
        costUsd: 0,
        costSource: "free",
        durationMs: Date.now() - started,
        ...(outcome.ok ? {} : { error: outcome.error }),
      });
      return outcome;
    },
  };
}
