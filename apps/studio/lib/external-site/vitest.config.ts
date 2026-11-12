import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests des helpers de l'écran « Mon site » (site internet du client) :
 *   pnpm --filter @theralys/studio exec vitest run --config lib/external-site/vitest.config.ts
 * Configuration propre au dossier, comme pour le rendu des visuels
 * (`lib/social/render/vitest.config.ts`) : la configuration commune
 * (`lib/vitest.config.ts`) liste ses dossiers un à un.
 */
export default defineConfig({
  root: path.resolve(__dirname, "../.."),
  resolve: { alias: { "@": path.resolve(__dirname, "../..") } },
  test: {
    include: ["lib/external-site/*.test.ts"],
    environment: "node",
  },
});
