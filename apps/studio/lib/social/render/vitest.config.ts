import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests du rendu des visuels réseaux sociaux :
 *   pnpm --filter @theralys/studio exec vitest run --config lib/social/render/vitest.config.ts
 * Script de fumée (9 templates × 3 tailles × 4 presets, images écrites hors dépôt) :
 *   SOCIAL_SMOKE=1 pnpm --filter @theralys/studio exec vitest run --config lib/social/render/vitest.config.ts smoke
 */
export default defineConfig({
  root: path.resolve(__dirname, "../../.."),
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(__dirname, "../../..") } },
  test: {
    include: ["lib/social/render/**/*.test.ts", "lib/social/render/smoke.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
