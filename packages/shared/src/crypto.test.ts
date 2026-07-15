import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

describe("chiffrement des tokens OAuth (AES-256-GCM)", () => {
  const key = randomBytes(32).toString("base64");

  it("chiffre et déchiffre", () => {
    const stored = encryptSecret("refresh-token-google-123", key);
    expect(stored).not.toContain("refresh-token-google-123");
    expect(stored.startsWith("v1:")).toBe(true);
    expect(decryptSecret(stored, key)).toBe("refresh-token-google-123");
  });

  it("IV aléatoire : deux chiffrements diffèrent", () => {
    expect(encryptSecret("secret", key)).not.toBe(encryptSecret("secret", key));
  });

  it("refuse une mauvaise clé", () => {
    const stored = encryptSecret("secret", key);
    const otherKey = randomBytes(32).toString("base64");
    expect(() => decryptSecret(stored, otherKey)).toThrow();
  });

  it("refuse une clé de mauvaise taille", () => {
    expect(() => encryptSecret("secret", "trop-courte")).toThrow(/32 octets/);
  });

  it("détecte l'altération (authentification GCM)", () => {
    const stored = encryptSecret("secret", key);
    const parts = stored.split(":");
    const data = Buffer.from(parts[3]!, "base64");
    data[0] = data[0]! ^ 0xff;
    parts[3] = data.toString("base64");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
  });
});
