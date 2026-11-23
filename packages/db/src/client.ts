import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { hasApiUsageSink, setApiUsageSink, setApiUsageSinkFactory, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

declare global {
  var __theralysPool: Pool | undefined;
}

/**
 * Pool de connexions d'une instance.
 * - `connectionTimeoutMillis` : pool saturé ou base injoignable, la requête
 *   échoue au bout de 10 s au lieu d'attendre sans fin (la page répond par une
 *   erreur lisible plutôt que de rester suspendue jusqu'à la coupure de la
 *   fonction) ;
 * - écouteur `error` : une connexion inactive coupée par le serveur (mise en
 *   veille de la base, redémarrage du pooler) émet une erreur sur le pool ;
 *   sans écouteur, elle ferait tomber le processus. Le pool retire de lui-même
 *   la connexion fautive.
 */
function createPool(connectionString: string): Pool {
  const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
  pool.on("error", (error) => {
    console.warn("[db] connexion inactive perdue :", error instanceof Error ? error.name : "erreur");
  });
  return pool;
}

/**
 * Client partagé — pool unique par processus (survit au HMR de Next en dev).
 */
export function getDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL manquante : copier .env.example vers .env et l'adapter.");
  }
  const pool = globalThis.__theralysPool ?? createPool(connectionString);
  globalThis.__theralysPool = pool;
  const db = drizzle(pool, { schema });
  // Registre des appels API : dès qu'une base existe, chaque appel fournisseur s'y inscrit
  if (!hasApiUsageSink()) setApiUsageSink(apiUsageSink(db));
  return db;
}

// Registre des appels API : le puits s'ouvre au premier appel inscrit, même dans une requête qui n'a pas encore
// touché la base (une recherche Google Places juste après la vérification de la session, par exemple)
// Sous test, le registre ne s'ouvre jamais de lui-même : un test unitaire qui exerce un vrai client fournisseur
// n'écrit pas dans la base que DATABASE_URL désigne (getDb(), appelé exprès, pose toujours le puits)
if (process.env.NODE_ENV !== "test") setApiUsageSinkFactory(() => apiUsageSink(getDb()));

/** Table `api_usage` absente (migration 0008 non appliquée) : signalé une fois, puis silencieux. */
let apiUsageTableMissingLogged = false;

function isMissingRelation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as Error & { code?: unknown }).code;
    if (code === "42P01" || code === "42703") return true;
    current = current.cause;
  }
  return false;
}

/**
 * Puits du registre des appels API : une ligne `api_usage` par événement.
 * Tolérant à l'absence de la table — les appels ne sont alors pas comptés,
 * rien n'échoue.
 */
export function apiUsageSink(db: Database): (event: ResolvedApiUsageEvent) => Promise<void> {
  return async (event) => {
    try {
      await db.insert(schema.apiUsage).values({
        createdAt: event.createdAt,
        provider: event.provider,
        operation: event.operation,
        feature: event.feature,
        siteId: event.siteId,
        model: event.model,
        status: event.status,
        requests: event.requests,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        cacheReadTokens: event.cacheReadTokens,
        cacheWriteTokens: event.cacheWriteTokens,
        units: event.units,
        costUsd: event.costUsd,
        costSource: event.costSource,
        durationMs: event.durationMs,
        error: event.error,
        meta: event.meta,
      });
    } catch (err) {
      if (!isMissingRelation(err)) throw err;
      if (!apiUsageTableMissingLogged) {
        apiUsageTableMissingLogged = true;
        console.warn("[api-usage] table api_usage absente — migration 0008 non appliquée ? Les appels ne sont pas comptés.");
      }
    }
  };
}
