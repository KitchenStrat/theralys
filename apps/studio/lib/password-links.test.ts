import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { PASSWORD_RESET_PURPOSE, PASSWORD_SETUP_PURPOSE, passwordLinkState, readPasswordLink, signPasswordResetToken } from "./password-links";

const SECRET = "secret-de-test-0123456789abcdef";
const fingerprintOf = (hash: string) => `fp(${hash})`;

async function sign(claims: Record<string, unknown>, opts: { sub?: string; expiresIn?: number; secret?: string } = {}) {
  const jwt = new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt();
  if (opts.sub !== undefined) jwt.setSubject(opts.sub);
  return jwt.setExpirationTime(Math.floor(Date.now() / 1000) + (opts.expiresIn ?? 600)).sign(new TextEncoder().encode(opts.secret ?? SECRET));
}

describe("readPasswordLink", () => {
  it("lit une réinitialisation et une invitation, avec ou sans empreinte", async () => {
    expect(await readPasswordLink(await signPasswordResetToken("u1", "abc", SECRET), SECRET)).toEqual({ purpose: PASSWORD_RESET_PURPOSE, userId: "u1", fingerprint: "abc" });
    expect(await readPasswordLink(await sign({ purpose: PASSWORD_SETUP_PURPOSE }, { sub: "u2" }), SECRET)).toEqual({ purpose: PASSWORD_SETUP_PURPOSE, userId: "u2", fingerprint: null });
  });

  it("refuse un lien expiré, falsifié, d'un autre usage, sans compte, ou une réinitialisation sans empreinte", async () => {
    expect(await readPasswordLink(await sign({ purpose: PASSWORD_RESET_PURPOSE, pv: "abc" }, { sub: "u1", expiresIn: -10 }), SECRET)).toBeNull();
    expect(await readPasswordLink(await sign({ purpose: PASSWORD_RESET_PURPOSE, pv: "abc" }, { sub: "u1", secret: "autre-secret" }), SECRET)).toBeNull();
    expect(await readPasswordLink(await sign({ purpose: "studio-impersonation" }, { sub: "u1" }), SECRET)).toBeNull();
    expect(await readPasswordLink(await sign({ purpose: PASSWORD_SETUP_PURPOSE }), SECRET)).toBeNull();
    expect(await readPasswordLink(await sign({ purpose: PASSWORD_RESET_PURPOSE }, { sub: "u1" }), SECRET)).toBeNull();
    expect(await readPasswordLink(undefined, SECRET)).toBeNull();
    expect(await readPasswordLink("pas-un-jeton", SECRET)).toBeNull();
    expect(await readPasswordLink(await signPasswordResetToken("u1", "abc", SECRET), undefined)).toBeNull();
  });
});

describe("passwordLinkState", () => {
  const setup = { purpose: PASSWORD_SETUP_PURPOSE, userId: "u", fingerprint: null } as const;
  const reset = (hash: string) => ({ purpose: PASSWORD_RESET_PURPOSE, userId: "u", fingerprint: fingerprintOf(hash) }) as const;

  it("invitation : valable tant que le compte n'a pas de mot de passe, jamais après", () => {
    expect(passwordLinkState(setup, { passwordHash: "invite:abc" }, fingerprintOf)).toBe("ok");
    expect(passwordLinkState(setup, { passwordHash: "scrypt:s:h" }, fingerprintOf)).toBe("already");
  });

  it("invitation liée à sa sentinelle : un lien renvoyé annule les précédents", () => {
    const bound = { ...setup, fingerprint: fingerprintOf("invite:ancien") };
    expect(passwordLinkState(bound, { passwordHash: "invite:ancien" }, fingerprintOf)).toBe("ok");
    expect(passwordLinkState(bound, { passwordHash: "invite:nouveau" }, fingerprintOf)).toBe("stale");
  });

  it("réinitialisation : une seule fois — dès que le mot de passe a changé, le lien ne vaut plus", () => {
    expect(passwordLinkState(reset("scrypt:s:h"), { passwordHash: "scrypt:s:h" }, fingerprintOf)).toBe("ok");
    expect(passwordLinkState(reset("scrypt:s:h"), { passwordHash: "scrypt:s2:h2" }, fingerprintOf)).toBe("stale");
    // Compte jamais activé : pas de mot de passe à réinitialiser
    expect(passwordLinkState(reset("invite:abc"), { passwordHash: "invite:abc" }, fingerprintOf)).toBe("stale");
  });
});
