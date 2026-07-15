/** CLI : exécute tous les ticks une fois (dev : pnpm --filter @theralys/jobs tick). */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const { runAllTicks } = await import("./ticks");

const reports = await runAllTicks();
for (const report of reports) {
  console.log(`✔ ${report.task}: ${report.processed} élément(s) traité(s)`);
}
await globalThis.__theralysPool?.end();
