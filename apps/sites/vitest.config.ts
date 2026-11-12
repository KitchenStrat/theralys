import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests des helpers purs du site public (apps/sites/lib) :
 *   pnpm --filter @theralys/sites test
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  // Un test peut rendre un composant (.tsx) pour en vérifier les liens : JSX compilé avec le runtime de React
  // (le `jsx: preserve` du tsconfig, voulu par Next, laisserait le JSX tel quel)
  esbuild: { jsx: "automatic" },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
