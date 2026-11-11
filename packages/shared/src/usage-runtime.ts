/**
 * Enregistrement des appels API — côté serveur uniquement (jamais importé par
 * un composant client : `node:async_hooks`).
 *
 * - `withApiUsage({ feature, siteId }, fn)` : tout appel fait pendant `fn`
 *   est rattaché à cette fonctionnalité et à ce site (contexte asynchrone,
 *   les contextes imbriqués se complètent).
 * - `recordApiUsage(event)` / `trackApiCall(base, call)` : les clients des
 *   fournisseurs inscrivent chaque appel, avec son coût et sa durée.
 * - `setApiUsageSink(sink)` : la base enregistre le puits qui écrit dans
 *   `api_usage` (`getDb`). Sans puits (tests, scripts hors base), rien n'est
 *   écrit.
 *
 * L'enregistrement ne fait jamais échouer l'appel qu'il mesure : une erreur
 * du puits est journalisée, un puits lent est abandonné après
 * API_USAGE_SINK_TIMEOUT_MS.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { API_USAGE_ERROR_MAX, type ApiFeatureId, type ApiUsageEvent } from "./api-usage";

export type ApiUsageContext = { feature?: ApiFeatureId | null; siteId?: string | null };

/** Événement complet, tel que le puits le reçoit (contexte résolu, valeurs par défaut posées). */
export type ResolvedApiUsageEvent = Required<Omit<ApiUsageEvent, "meta" | "error" | "model" | "feature" | "siteId">> & {
  feature: ApiFeatureId | null;
  siteId: string | null;
  model: string | null;
  error: string | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
};

export type ApiUsageSink = (event: ResolvedApiUsageEvent) => Promise<void>;

/** Délai au-delà duquel l'écriture d'un événement est abandonnée (ms) : l'appel mesuré ne doit pas attendre la base. */
export const API_USAGE_SINK_TIMEOUT_MS = 3_000;

// Les bundles d'une même application peuvent charger ce module plusieurs fois : l'état vit sur globalThis.
type UsageGlobals = { storage?: AsyncLocalStorage<ApiUsageContext>; sink?: ApiUsageSink | null };
const GLOBAL_KEY = Symbol.for("theralys.apiUsage");
const globals = ((globalThis as unknown as Record<symbol, UsageGlobals>)[GLOBAL_KEY] ??= {});
const storage = (globals.storage ??= new AsyncLocalStorage<ApiUsageContext>());

/** Contexte courant (fonctionnalité et site), vide hors de tout `withApiUsage`. */
export function currentApiUsageContext(): ApiUsageContext {
  return storage.getStore() ?? {};
}

/**
 * Exécute `fn` en rattachant ses appels API à une fonctionnalité et à un
 * site. Un contexte imbriqué complète celui qui l'entoure : seules les
 * valeurs qu'il définit le remplacent.
 */
export function withApiUsage<T>(context: ApiUsageContext, fn: () => T): T {
  const parent = currentApiUsageContext();
  const merged: ApiUsageContext = {
    feature: context.feature !== undefined ? context.feature : parent.feature,
    siteId: context.siteId !== undefined ? context.siteId : parent.siteId,
  };
  return storage.run(merged, fn);
}

/**
 * Fournisseur ou générateur dont chaque méthode s'exécute dans le contexte
 * donné : `attributeApiUsage(createSocialGenerator(), { feature: "social",
 * siteId })`. Les propriétés (comme `mode`) sont lues telles quelles.
 */
export function attributeApiUsage<T extends object>(target: T, context: ApiUsageContext): T {
  return new Proxy(target, {
    get(object, property) {
      const value = Reflect.get(object, property, object) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => withApiUsage(context, () => (value as (...a: unknown[]) => unknown).apply(object, args));
    },
  });
}

/** Enregistre (ou retire, avec null) le puits qui écrit les événements. */
export function setApiUsageSink(sink: ApiUsageSink | null): void {
  globals.sink = sink;
}

export function hasApiUsageSink(): boolean {
  return Boolean(globals.sink);
}

const whole = (value: number | undefined): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
const positive = (value: number | undefined): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/** Message d'erreur enregistrable : une ligne, borné. */
export function usageErrorText(err: unknown): string {
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : "Erreur inconnue";
  return text.replace(/\s+/g, " ").trim().slice(0, API_USAGE_ERROR_MAX) || "Erreur inconnue";
}

/** Événement complété par le contexte courant et les valeurs par défaut. */
export function resolveApiUsageEvent(event: ApiUsageEvent, now = new Date()): ResolvedApiUsageEvent {
  const context = currentApiUsageContext();
  const costUsd = positive(event.costUsd);
  return {
    provider: event.provider,
    operation: event.operation.slice(0, 80),
    feature: event.feature !== undefined ? event.feature : (context.feature ?? null),
    siteId: event.siteId !== undefined ? event.siteId : (context.siteId ?? null),
    model: event.model ? event.model.slice(0, 120) : null,
    status: event.status ?? "ok",
    requests: event.requests === undefined ? 1 : whole(event.requests),
    inputTokens: whole(event.inputTokens),
    outputTokens: whole(event.outputTokens),
    cacheReadTokens: whole(event.cacheReadTokens),
    cacheWriteTokens: whole(event.cacheWriteTokens),
    units: positive(event.units),
    costUsd,
    costSource: event.costSource ?? (costUsd > 0 ? "tariff" : "free"),
    durationMs: whole(event.durationMs),
    error: event.error ? event.error.replace(/\s+/g, " ").trim().slice(0, API_USAGE_ERROR_MAX) : null,
    meta: event.meta ?? null,
    createdAt: now,
  };
}

/**
 * Inscrit un appel API au registre. Ne lève jamais et n'attend pas la base
 * plus de API_USAGE_SINK_TIMEOUT_MS.
 */
export async function recordApiUsage(event: ApiUsageEvent): Promise<void> {
  const sink = globals.sink;
  if (!sink) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const resolved = resolveApiUsageEvent(event);
    await Promise.race([
      sink(resolved),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, API_USAGE_SINK_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.warn("[api-usage] appel non enregistré :", err instanceof Error ? err.message : err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type TrackedCall = Omit<ApiUsageEvent, "status" | "durationMs" | "error">;

/**
 * Exécute un appel fournisseur et l'inscrit au registre : durée mesurée,
 * succès complété par `describe(result)` (coût réel, volume… — et `status:
 * "error"` pour une réponse reçue mais refusée), échec inscrit
 * en `error` sans coût — sauf `onError(err)`, pour un échec qui a pu être
 * facturé — puis relancé tel quel.
 */
export async function trackApiCall<T>(
  base: TrackedCall,
  call: () => Promise<T>,
  describe?: (result: T) => Partial<Omit<ApiUsageEvent, "durationMs">>,
  onError?: (err: unknown) => Partial<TrackedCall>,
): Promise<T> {
  const started = Date.now();
  let result: T;
  try {
    result = await call();
  } catch (err) {
    let extra: Partial<TrackedCall> = {};
    try {
      extra = onError?.(err) ?? {};
    } catch {
      extra = {};
    }
    // Un échec ne coûte rien, sauf indication contraire de `onError`
    await recordApiUsage({ ...base, costUsd: 0, units: 0, ...extra, status: "error", durationMs: Date.now() - started, error: usageErrorText(err) });
    throw err;
  }
  let described: Partial<Omit<ApiUsageEvent, "durationMs">> = {};
  try {
    described = describe?.(result) ?? {};
  } catch {
    described = {};
  }
  await recordApiUsage({ ...base, status: "ok", ...described, durationMs: Date.now() - started });
  return result;
}
