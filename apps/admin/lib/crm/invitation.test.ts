import { randomBytes } from "node:crypto";
import { SignJWT, decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { passwordFingerprint } from "@/lib/password-fingerprint";
import { REP_INVITE_TTL_S, judgeInvitation, newInviteSentinel, readRepInvitation, signRepInvitation } from "./invitation";
import { invitationPath, tokenFromHash } from "./invitation-link";

const secret = randomBytes(32).toString("hex");
const userId = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const DAY = 86_400_000;
const now = new Date("2026-11-23T09:00:00Z");

const pending = () => ({ userId, passwordHash: newInviteSentinel() });
const account = (passwordHash: string, overrides: Partial<{ role: string; disabledAt: Date | null }> = {}) => ({ role: "sales", passwordHash, disabledAt: null, ...overrides });

describe("jeton d'invitation d'un commercial", () => {
  it("signé avec le secret, il se relit : compte visé et état du mot de passe", async () => {
    const rep = pending();
    const token = await signRepInvitation(rep, secret, now);
    expect(await readRepInvitation(token, secret, now)).toEqual({ userId, fingerprint: passwordFingerprint(rep.passwordHash) });
    // Le jeton ne contient ni la sentinelle ni quoi que ce soit du mot de passe : seulement son empreinte
    const claims = decodeJwt(token);
    expect(JSON.stringify(claims)).not.toContain(rep.passwordHash);
    expect(claims.exp! - claims.iat!).toBe(REP_INVITE_TTL_S);
  });

  it("valable 7 jours, pas un de plus", async () => {
    const token = await signRepInvitation(pending(), secret, now);
    expect(await readRepInvitation(token, secret, new Date(now.getTime() + 7 * DAY - 60_000))).not.toBeNull();
    expect(await readRepInvitation(token, secret, new Date(now.getTime() + 7 * DAY + 60_000))).toBeNull();
  });

  it("refusé s'il est signé avec un autre secret, altéré, ou s'il n'en est pas un", async () => {
    const token = await signRepInvitation(pending(), secret, now);
    expect(await readRepInvitation(token, randomBytes(32).toString("hex"), now)).toBeNull();
    const [header, payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), sub: "11111111-1111-4111-8111-111111111111" })).toString("base64url");
    expect(await readRepInvitation(`${header}.${forged}.${signature}`, secret, now)).toBeNull();
    expect(await readRepInvitation("pas-un-jeton", secret, now)).toBeNull();
    expect(await readRepInvitation("", secret, now)).toBeNull();
  });

  it("un jeton d'un autre usage signé avec le même secret n'est pas une invitation (session, invitation d'un client du studio)", async () => {
    const sign = (claims: Record<string, unknown>) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId)
        .setIssuedAt(Math.floor(now.getTime() / 1000))
        .setExpirationTime(Math.floor(now.getTime() / 1000) + 3600)
        .sign(new TextEncoder().encode(secret));
    expect(await readRepInvitation(await sign({ role: "sales", name: "Julie" }), secret, now)).toBeNull();
    expect(await readRepInvitation(await sign({ role: "admin", name: "Admin" }), secret, now)).toBeNull();
    expect(await readRepInvitation(await sign({ purpose: "studio-password-setup" }), secret, now)).toBeNull();
    expect(await readRepInvitation(await sign({ purpose: "studio-impersonation", pv: "x" }), secret, now)).toBeNull();
    expect(await readRepInvitation(await sign({ purpose: "studio-password-reset", pv: "0123456789abcdef" }), secret, now)).toBeNull();
    // Le bon usage, mais sans empreinte de l'état du mot de passe
    expect(await readRepInvitation(await sign({ purpose: "admin-rep-invitation" }), secret, now)).toBeNull();
  });

  it("ne se signe que pour un compte qui attend son mot de passe", async () => {
    await expect(signRepInvitation({ userId, passwordHash: "scrypt:00:11" }, secret, now)).rejects.toThrow();
  });
});

describe("usage unique : le lien vaut pour un état du mot de passe, pas pour un compte", () => {
  it("valable tant que le compte porte la sentinelle pour laquelle il a été signé", async () => {
    const rep = pending();
    const claims = await readRepInvitation(await signRepInvitation(rep, secret, now), secret, now);
    expect(judgeInvitation(claims, account(rep.passwordHash))).toBe("ok");
  });

  it("une fois le mot de passe choisi, le même lien ne sert plus", async () => {
    const rep = pending();
    const claims = await readRepInvitation(await signRepInvitation(rep, secret, now), secret, now);
    expect(judgeInvitation(claims, account("scrypt:a1b2:c3d4"))).toBe("used");
  });

  it("un nouveau lien périme le précédent, et lui seul vaut", async () => {
    const first = pending();
    const firstClaims = await readRepInvitation(await signRepInvitation(first, secret, now), secret, now);
    const renewed = pending();
    const renewedClaims = await readRepInvitation(await signRepInvitation(renewed, secret, now), secret, now);
    expect(first.passwordHash).not.toBe(renewed.passwordHash);
    expect(judgeInvitation(firstClaims, account(renewed.passwordHash))).toBe("invalid");
    expect(judgeInvitation(renewedClaims, account(renewed.passwordHash))).toBe("ok");
  });

  it("compte désactivé, compte d'un autre rôle, compte disparu, jeton illisible : refus", async () => {
    const rep = pending();
    const claims = await readRepInvitation(await signRepInvitation(rep, secret, now), secret, now);
    expect(judgeInvitation(claims, account(rep.passwordHash, { disabledAt: now }))).toBe("disabled");
    expect(judgeInvitation(claims, account(rep.passwordHash, { role: "client" }))).toBe("invalid");
    expect(judgeInvitation(claims, account(rep.passwordHash, { role: "admin" }))).toBe("invalid");
    expect(judgeInvitation(claims, null)).toBe("invalid");
    expect(judgeInvitation(null, account(rep.passwordHash))).toBe("invalid");
  });

  it("chaque sentinelle est unique et n'est pas un mot de passe", () => {
    const sentinels = new Set(Array.from({ length: 50 }, newInviteSentinel));
    expect(sentinels.size).toBe(50);
    for (const sentinel of sentinels) expect(sentinel).toMatch(/^invite:[0-9a-f]{32}$/);
  });
});

describe("lien d'invitation : le jeton est dans le fragment de l'adresse", () => {
  it("aller-retour : le chemin rendu à l'admin se relit dans le navigateur du commercial", async () => {
    const token = await signRepInvitation(pending(), secret, now);
    const path = invitationPath(token);
    expect(path.startsWith("/invitation#jeton=")).toBe(true);
    const url = new URL(path, "https://admin.exemple.test");
    // Rien du jeton ne part au serveur à l'ouverture du lien : ni chemin ni paramètres
    expect(url.pathname).toBe("/invitation");
    expect(url.search).toBe("");
    expect(tokenFromHash(url.hash)).toBe(token);
  });

  it("fragment absent ou qui n'a pas la forme d'un jeton : rien", () => {
    for (const hash of ["", "#", "#jeton=", "#jeton=abc", "#autre=a.b.c", "#jeton=a.b", "#jeton=<script>.b.c"]) expect(tokenFromHash(hash), hash).toBeNull();
    expect(tokenFromHash("#jeton=aaa.bbb.ccc")).toBe("aaa.bbb.ccc");
  });
});
