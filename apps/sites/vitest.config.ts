import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests des helpers purs du site public (apps/sites/lib) :
 *   pnpm --filter @theralys/sites test
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
