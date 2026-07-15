import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

declare global {
  var __theralysPool: Pool | undefined;
}

/**
 * Client partagé — pool unique par processus (survit au HMR de Next en dev).
 */
export function getDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL manquante : copier .env.example vers .env et l'adapter.");
  }
  const pool =
    globalThis.__theralysPool ?? new Pool({ connectionString, max: 10 });
  globalThis.__theralysPool = pool;
  return drizzle(pool, { schema });
}
