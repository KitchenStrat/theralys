/** UUID v4 — Web Crypto, disponible côté Node (≥ 19) comme navigateur. */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}
