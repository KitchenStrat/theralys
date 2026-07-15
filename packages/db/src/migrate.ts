import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL manquante");
  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: path.resolve(here, "../drizzle") });
  await pool.end();
  console.log("✔ Migrations appliquées");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
