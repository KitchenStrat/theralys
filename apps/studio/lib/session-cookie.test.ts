import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load(nodeEnv: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.resetModules();
  return import("./session-cookie");
}

const BEFORE = Date.UTC(2026, 10, 20) / 1000;
const AFTER = Date.UTC(2026, 10, 28) / 1000;

describe("cookie de session du studio", () => {
  it("en production : préfixe __Host-, et l'ancien nom n'est lu qu'en second", async () => {
    const cookie = await load("production");
    expect(cookie.SESSION_COOKIE).toBe("__Host-tl_studio_session");
    const jar: Record<string, string> = { "__Host-tl_studio_session": "nouveau", tl_studio_session: "ancien" };
    expect(cookie.sessionTokens((name) => jar[name])).toEqual([
      { token: "nouveau", legacy: false },
      { token: "ancien", legacy: true },
    ]);
    expect(cookie.sessionTokens((name) => ({ tl_studio_session: "ancien" })[name])).toEqual([{ token: "ancien", legacy: true }]);
    expect(cookie.sessionTokens(() => undefined)).toEqual([]);
  });

  it("hors production : un seul nom, sans préfixe (le préfixe exige HTTPS)", async () => {
    const cookie = await load("development");
    expect(cookie.SESSION_COOKIE).toBe("tl_studio_session");
    expect(cookie.sessionTokens((name) => ({ tl_studio_session: "jeton" })[name])).toEqual([{ token: "jeton", legacy: false }]);
  });

  it("ancien cookie : accepté seulement pour un jeton émis avant la bascule", async () => {
    const cookie = await load("production");
    expect(cookie.acceptsLegacyToken({ iat: BEFORE })).toBe(true);
    // Un cookie posé après coup sous l'ancien nom (par un domaine voisin) porte un jeton récent : refusé
    expect(cookie.acceptsLegacyToken({ iat: AFTER })).toBe(false);
    expect(cookie.acceptsLegacyToken({})).toBe(false);
    expect(cookie.acceptsLegacyToken({ iat: "hier" })).toBe(false);
  });
});
