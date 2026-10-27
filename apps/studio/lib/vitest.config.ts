import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests des helpers du studio (calendrier, état du mois social, brief, Fiche Google, Google Ads, éditeur) :
 *   pnpm --filter @theralys/studio exec vitest run --config lib/vitest.config.ts
 * Les tests du rendu des visuels ont leur propre configuration
 * (`lib/social/render/vitest.config.ts`).
 */
export default defineConfig({
  root: path.resolve(__dirname, ".."),
  resolve: { alias: { "@": path.resolve(__dirname, "..") } },
  test: {
    include: ["lib/*.test.ts", "lib/social/*.test.ts", "lib/google/*.test.ts", "lib/google-ads/*.test.ts", "lib/editor/*.test.ts"],
    environment: "node",
  },
});
