import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests du back-office (helpers purs de `lib/`, garde d'entrée, actions du
 * CRM avec une base simulée) :
 *   pnpm --filter @theralys/admin test
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "*.test.ts"],
    environment: "node",
  },
});
