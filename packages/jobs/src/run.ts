/**
 * CLI : exécute tous les ticks une fois (dev : pnpm --filter @theralys/jobs tick),
 * ou un seul groupe (pnpm --filter @theralys/jobs tick redaction).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const { TICK_GROUPS, isTickGroup, runTicks } = await import("./ticks");

const group = process.argv[2];
if (group !== undefined && !isTickGroup(group)) {
  console.error(`Groupe inconnu : ${group} (attendu : ${TICK_GROUPS.join(", ")})`);
  process.exit(1);
}
const reports = await runTicks(group);
for (const report of reports) {
  const failed = report.failed ? `, ${report.failed} en échec` : "";
  if (report.status === "error") console.error(`✘ ${report.task}: en erreur (${report.error ?? "erreur"}) — ${report.processed} élément(s) traité(s)${failed}`);
  else console.log(`✔ ${report.task}: ${report.processed} élément(s) traité(s)${failed}`);
}
await globalThis.__theralysPool?.end();
if (reports.some((report) => report.status === "error")) process.exitCode = 1;
