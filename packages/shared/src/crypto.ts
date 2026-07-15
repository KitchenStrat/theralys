/**
 * Chiffrement au repos des secrets (refresh tokens OAuth Google).
 * AES-256-GCM, clé de 32 octets en base64 dans TOKEN_ENCRYPTION_KEY.
 * Format stocké : v1:<iv base64>:<tag base64>:<données base64>
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function parseKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY doit faire 32 octets en base64 (openssl rand -base64 32)");
  }
  return key;
}

export function encryptSecret(plaintext: string, base64Key: string): string {
  const key = parseKey(base64Key);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(stored: string, base64Key: string): string {
  const [version, ivB64, tagB64, dataB64] = stored.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Format de secret chiffré invalide");
  }
  const key = parseKey(base64Key);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
