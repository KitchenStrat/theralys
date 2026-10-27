/**
 * Socle commun des fournisseurs DataForSEO (https://api.dataforseo.com/v3) :
 * types de résultat, erreur portant le coût déjà facturé, client HTTP (auth
 * Basic, délai, relance), lecture tolérante des réponses et hachage du mock.
 * Partagé par le fournisseur « recherche locale » (`./index.ts`, Maps / fiche
 * / avis) et le fournisseur « Google Ads » (`./ads.ts`, idées de mots-clés et
 * prévision de trafic) sans import circulaire.
 */

// ─── Résultats ───────────────────────────────────────────────────────────────

export type ProviderMode = "dataforseo" | "mock";

export type ProviderResult<T> = {
  data: T;
  /** Coût réel facturé par DataForSEO (USD), 0 en mock */
  costUsd: number;
  mode: ProviderMode;
};

/**
 * Erreur fournisseur portant le coût déjà facturé par DataForSEO avant
 * l'échec (ex. relevé dont tous les points ont échoué après quelques appels
 * aboutis, tâche refusée mais facturée) : l'appelant l'inscrit dans
 * `google_usage` même en échec.
 */
export class DataForSeoError extends Error {
  readonly costUsd: number;

  constructor(message: string, costUsd = 0) {
    super(message);
    this.name = "DataForSeoError";
    this.costUsd = costUsd;
  }
}

export const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";

/** Délai maximal d'une requête HTTP (ms) : au-delà, elle est abandonnée (AbortController). */
export const DATAFORSEO_TIMEOUT_MS = 60_000;

/** Statut général ou de tâche « Ok. ». */
export const DATAFORSEO_STATUS_OK = 20000;

// ─── Mock déterministe ───────────────────────────────────────────────────────

/** Hachage 31 bits stable (même graine → mêmes rangs, mêmes avis, mêmes volumes). */
export function hash31(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h & 0x7fffffff;
}

// ─── Formes des réponses DataForSEO (enveloppe commune) ──────────────────────

export type DfsTask<R> = {
  id?: string;
  status_code?: number;
  status_message?: string;
  cost?: number | null;
  result?: R[] | null;
};

export type DfsResponse<R> = {
  status_code?: number;
  status_message?: string;
  cost?: number | null;
  tasks?: DfsTask<R>[] | null;
};

// ─── Lecture tolérante ───────────────────────────────────────────────────────

export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.name === "AbortError" ? "délai dépassé" : err.message.slice(0, 200);
  return String(err).slice(0, 200);
}

/**
 * Une nouvelle tentative n'est permise que si la requête est idempotente côté
 * facturation : endpoints « live » (la réponse arrive dans le même appel) et
 * GET (`task_get`). Jamais pour `task_post` : la tâche a pu être créée et
 * facturée malgré un 5xx ou un délai dépassé (M9).
 */
export function isRetryableRequest(endpoint: string, method: "GET" | "POST"): boolean {
  return method === "GET" || /\/live(\/|$)/.test(endpoint);
}

// ─── Client HTTP ─────────────────────────────────────────────────────────────

export type DataForSeoClientOptions = {
  /** Délai par requête (ms), défaut DATAFORSEO_TIMEOUT_MS */
  timeoutMs?: number;
};

/**
 * Client HTTP DataForSEO : auth Basic (identifiants jamais journalisés),
 * délai de 60 s par requête, une nouvelle tentative sur erreur 5xx ou réseau
 * pour les endpoints « live » et les GET seulement (`isRetryableRequest`),
 * statut général vérifié (20000). Les erreurs sont explicites
 * (`DataForSEO <endpoint> <statut>: <message>`). Le coût rendu est la somme
 * des `tasks[].cost` renvoyés par l'API.
 *
 * Limite connue : si la première tentative d'un appel « live » dépasse le
 * délai mais a été servie (et facturée) côté DataForSEO, puis que la seconde
 * aboutit, le coût rendu est celui de la seconde seulement — l'API ne permet
 * pas de retrouver le coût d'une réponse jamais reçue.
 */
export class DataForSeoClient {
  protected readonly timeoutMs: number;

  constructor(
    private readonly login: string,
    private readonly password: string,
    protected readonly fetchImpl: typeof fetch = fetch,
    options: DataForSeoClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DATAFORSEO_TIMEOUT_MS;
  }

  protected authHeader(): string {
    return `Basic ${Buffer.from(`${this.login}:${this.password}`).toString("base64")}`;
  }

  /**
   * Un appel HTTP (JSON) : délai, une nouvelle tentative sur 5xx ou erreur
   * réseau si la requête est retentable (`isRetryableRequest`), statut général
   * vérifié (20000). Renvoie les tâches et le coût total de la réponse reçue
   * (voir la limite connue sur une première tentative servie mais non reçue).
   * `signal` (facultatif) annule l'appel en cours sans nouvelle tentative :
   * une grille dont trop de points échouent interrompt ses requêtes en vol.
   */
  protected async request<R>(
    endpoint: string,
    init: { method: "GET" | "POST"; body?: unknown },
    signal?: AbortSignal,
  ): Promise<{ tasks: DfsTask<R>[]; cost: number }> {
    const attempts = isRetryableRequest(endpoint, init.method) ? 2 : 1;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (signal?.aborted) throw new Error(`DataForSEO ${endpoint}: annulé`);
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(abort, this.timeoutMs);
      try {
        let response: Response;
        try {
          response = await this.fetchImpl(`${DATAFORSEO_BASE}${endpoint}`, {
            method: init.method,
            headers: {
              Authorization: this.authHeader(),
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
            signal: controller.signal,
          });
        } catch (err) {
          if (signal?.aborted) throw new Error(`DataForSEO ${endpoint}: annulé`);
          lastError = new Error(`DataForSEO ${endpoint} réseau: ${describeError(err)}`);
          continue;
        }
        if (response.status >= 500) {
          lastError = new Error(`DataForSEO ${endpoint} ${response.status}: ${await this.bodyExcerpt(response)}`);
          continue;
        }
        if (!response.ok) {
          throw new Error(`DataForSEO ${endpoint} ${response.status}: ${await this.bodyExcerpt(response)}`);
        }
        const json = (await response.json()) as DfsResponse<R>;
        if (json.status_code !== DATAFORSEO_STATUS_OK) {
          throw new Error(
            `DataForSEO ${endpoint} ${json.status_code ?? "?"}: ${json.status_message ?? "réponse invalide"}`,
          );
        }
        const tasks = json.tasks ?? [];
        return { tasks, cost: round6(tasks.reduce((sum, task) => sum + (numberOrNull(task.cost) ?? 0), 0)) };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    }
    throw lastError ?? new Error(`DataForSEO ${endpoint}: échec`);
  }

  private async bodyExcerpt(response: Response): Promise<string> {
    try {
      const text = (await response.text()).replace(/\s+/g, " ").trim();
      return text === "" ? response.statusText || "sans détail" : text.slice(0, 200);
    } catch {
      return response.statusText || "sans détail";
    }
  }

  /** Erreur lisible pour une tâche absente ou refusée (statut ≠ 20000). */
  protected taskError(endpoint: string, task: DfsTask<unknown> | undefined): Error {
    return new Error(
      `DataForSEO ${endpoint} ${task?.status_code ?? "?"}: ${task?.status_message ?? "tâche absente de la réponse"}`,
    );
  }
}
