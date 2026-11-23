/**
 * Nom du cookie de session du back-office — module sans dépendance, lu aussi
 * par le middleware (Edge).
 *
 * En production le cookie porte le préfixe `__Host-` : le navigateur ne
 * l'accepte que posé par cet hôte précis, en HTTPS, sans attribut `Domain`.
 * Un domaine voisin (le site d'un client, servi sous le même domaine
 * principal) ne peut donc pas en poser un à la place de l'utilisateur.
 *
 * L'ancien nom reste lu le temps que les sessions ouvertes avant le
 * changement expirent (7 jours) : uniquement pour un jeton émis avant la
 * bascule, et le middleware le recopie aussitôt sous le nouveau nom.
 */
export const LEGACY_SESSION_COOKIE = "tl_admin_session";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? `__Host-${LEGACY_SESSION_COOKIE}` : LEGACY_SESSION_COOKIE;

/** Bascule vers le nouveau nom (27 novembre 2026, 00:00 UTC, quelques jours après sa mise en ligne), en secondes. */
const LEGACY_CUTOVER_S = Date.UTC(2026, 10, 27) / 1000;

/** Un jeton lu dans l'ancien cookie n'est accepté que s'il a été émis avant la bascule. */
export function acceptsLegacyToken(payload: { iat?: unknown }): boolean {
  return typeof payload.iat === "number" && payload.iat < LEGACY_CUTOVER_S;
}

/** Jetons de session candidats, dans l'ordre de préférence : le cookie protégé, puis l'ancien nom. */
export function sessionTokens(read: (name: string) => string | undefined): { token: string; legacy: boolean }[] {
  const tokens: { token: string; legacy: boolean }[] = [];
  const current = read(SESSION_COOKIE);
  if (current) tokens.push({ token: current, legacy: false });
  if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) {
    const legacy = read(LEGACY_SESSION_COOKIE);
    if (legacy) tokens.push({ token: legacy, legacy: true });
  }
  return tokens;
}
