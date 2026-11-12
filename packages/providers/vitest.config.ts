import { defineConfig } from "vitest/config";

/**
 * Tests des fournisseurs :
 *   pnpm --filter @theralys/providers test
 *
 * Délai d'un test porté à 30 s (5 s par défaut). Les tests de robustesse du
 * lecteur de sites analysent des documents piégés de plusieurs mégaoctets, et
 * toutes les suites du dépôt tournent en même temps (`turbo run test`) : sur
 * une machine à deux cœurs, un test d'une seconde peut alors en demander dix
 * sans que le code ait ralenti. Leur rapidité n'est pas vérifiée par ce délai
 * mais par leurs propres assertions, en temps de calcul rapporté à la vitesse
 * du moment (`src/website/test-timing.ts`).
 */
export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30_000,
  },
});
