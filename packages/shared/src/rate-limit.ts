/**
 * Limitation de débit en mémoire : un compteur par clé sur une fenêtre fixe.
 * Fonction pure (l'heure est injectable), sans dépendance : elle sert seule
 * là où une écriture en base par requête coûterait trop cher (mesure
 * d'audience), et de repli au compteur en base (`@theralys/db`) tant que sa
 * table n'existe pas. Sur un hébergement sans état, chaque instance a son
 * propre compteur : la limite réelle est donc « par instance ».
 */

export type RateLimitDecision = {
  allowed: boolean;
  /** Secondes à attendre avant le prochain essai accepté (0 si accepté). */
  retryAfterSeconds: number;
};

export type MemoryRateLimiter = {
  /** Compte un passage et dit s'il est accepté. */
  hit(key: string, now?: number): RateLimitDecision;
  /** Remet le compteur d'une clé à zéro (connexion réussie, par exemple). */
  clear(key: string): void;
  /** Nombre de clés suivies (tests, surveillance). */
  size(): number;
};

type Counter = { count: number; resetAt: number };

export function createMemoryRateLimiter(opts: {
  limit: number;
  windowMs: number;
  /** Plafond de clés gardées en mémoire : au-delà, les plus anciennes sortent. */
  maxKeys?: number;
}): MemoryRateLimiter {
  const maxKeys = opts.maxKeys ?? 10_000;
  const counters = new Map<string, Counter>();

  function evict(now: number) {
    for (const [key, counter] of counters) {
      if (counter.resetAt <= now) counters.delete(key);
    }
    // Toujours trop de clés vivantes : les plus anciennes sortent (ordre d'insertion de la Map), pour laisser une place
    for (const key of counters.keys()) {
      if (counters.size < maxKeys) break;
      counters.delete(key);
    }
  }

  return {
    hit(key, now = Date.now()) {
      const current = counters.get(key);
      if (!current || current.resetAt <= now) {
        if (!current && counters.size >= maxKeys) evict(now);
        counters.delete(key);
        counters.set(key, { count: 1, resetAt: now + opts.windowMs });
        return { allowed: opts.limit >= 1, retryAfterSeconds: opts.limit >= 1 ? 0 : Math.ceil(opts.windowMs / 1000) };
      }
      current.count += 1;
      if (current.count <= opts.limit) return { allowed: true, retryAfterSeconds: 0 };
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
    },
    clear(key) {
      counters.delete(key);
    },
    size() {
      return counters.size;
    },
  };
}

/**
 * Adresse IP de l'appelant, lue dans les en-têtes posés par la plateforme
 * (première adresse de `x-forwarded-for`, sinon `x-real-ip`). Ne sert qu'à
 * calculer des clés de limitation : elle n'est ni stockée ni journalisée.
 */
export function requestIp(headers: { get(name: string): string | null }): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "0.0.0.0";
}

/**
 * Vrai si la requête vient d'une autre origine que l'hôte servi. Un navigateur
 * envoie `Origin` sur tout POST, même vers sa propre origine : son absence
 * (appel serveur, ancien navigateur) ne vaut pas refus.
 */
export function isCrossOriginRequest(headers: { get(name: string): string | null }): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try {
    return host === null || new URL(origin).host !== host;
  } catch {
    return true;
  }
}
