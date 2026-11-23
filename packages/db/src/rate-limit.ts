import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { createMemoryRateLimiter, type MemoryRateLimiter, type RateLimitDecision } from "@theralys/shared";
import type { Database } from "./client";

/**
 * Limitation de débit partagée entre toutes les instances : un compteur par
 * clé dans la table `rate_limits` (migration 0013). Sert aux gestes qu'un
 * attaquant répète — connexion, création de mot de passe, demande de démo.
 *
 * - La clé stockée est une empreinte (sel secret + périmètre + sujet) : ni
 *   e-mail ni adresse IP en clair dans la table.
 * - Déployé avant la migration, ou base indisponible : repli sur un compteur
 *   en mémoire, propre à l'instance. Une panne du compteur ne doit jamais
 *   empêcher quelqu'un de se connecter.
 */
export type RateLimitRule = {
  /** Nom du geste limité (`login:email`, `login:ip`, `demo:ip`…). */
  scope: string;
  /** Passages acceptés par fenêtre. */
  limit: number;
  windowSeconds: number;
};

export type { RateLimitDecision };
// Relais : les apps qui ne dépendent que de `@theralys/db` (vitrine) lisent l'adresse de l'appelant sans autre import
export { requestIp } from "@theralys/shared";

const memoryLimiters = new Map<string, MemoryRateLimiter>();
let fallbackLogged = false;

function memoryLimiter(rule: RateLimitRule): MemoryRateLimiter {
  const id = `${rule.scope}:${rule.limit}:${rule.windowSeconds}`;
  let limiter = memoryLimiters.get(id);
  if (!limiter) {
    limiter = createMemoryRateLimiter({ limit: rule.limit, windowMs: rule.windowSeconds * 1000 });
    memoryLimiters.set(id, limiter);
  }
  return limiter;
}

/** Empreinte de la clé : le sujet (e-mail, IP) n'est jamais écrit en clair. */
export function rateLimitKey(rule: RateLimitRule, subject: string): string {
  const salt = process.env.AUTH_SECRET ?? "";
  const digest = createHash("sha256").update(`${salt}:${rule.scope}:${subject.trim().toLowerCase()}`).digest("hex").slice(0, 40);
  return `${rule.scope}:${digest}`;
}

function noteFallback(err: unknown) {
  if (fallbackLogged) return;
  fallbackLogged = true;
  const code = (err as { code?: unknown; cause?: { code?: unknown } } | null)?.code ?? (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  console.warn(
    code === "42P01"
      ? "[rate-limit] table rate_limits absente — migration 0013 non appliquée ? Compteur en mémoire en attendant."
      : "[rate-limit] compteur en base indisponible, repli en mémoire.",
  );
}

/**
 * Compte un passage pour ce sujet et dit s'il est accepté. Une seule requête,
 * atomique : deux essais simultanés ne se glissent pas sous la limite.
 */
export async function hitRateLimit(db: Database, rule: RateLimitRule, subject: string): Promise<RateLimitDecision> {
  const key = rateLimitKey(rule, subject);
  try {
    const result = await db.execute<{ count: number; retry_after: number }>(sql`
      insert into rate_limits (key, count, reset_at)
      values (${key}, 1, now() + make_interval(secs => ${rule.windowSeconds}))
      on conflict (key) do update set
        count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
        reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
      returning count, ceil(extract(epoch from (reset_at - now())))::int as retry_after
    `);
    // Ménage occasionnel : les compteurs échus ne s'accumulent pas
    if (Math.random() < 0.02) {
      await db.execute(sql`delete from rate_limits where reset_at < now() - interval '1 hour'`).catch(() => undefined);
    }
    const row = result.rows[0];
    const count = Number(row?.count ?? 1);
    if (count <= rule.limit) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: Math.max(1, Number(row?.retry_after ?? rule.windowSeconds)) };
  } catch (err) {
    noteFallback(err);
    return memoryLimiter(rule).hit(key);
  }
}

/** Remet le compteur d'un sujet à zéro (après une connexion réussie). */
export async function clearRateLimit(db: Database, rule: RateLimitRule, subject: string): Promise<void> {
  const key = rateLimitKey(rule, subject);
  memoryLimiter(rule).clear(key);
  try {
    await db.execute(sql`delete from rate_limits where key = ${key}`);
  } catch (err) {
    noteFallback(err);
  }
}

/** Message affiché quand la limite est atteinte. */
export function rateLimitMessage(decision: RateLimitDecision): string {
  const minutes = Math.max(1, Math.ceil(decision.retryAfterSeconds / 60));
  return `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`;
}

/** Règles communes aux deux espaces (admin et studio). */
export const LOGIN_RATE_LIMITS = {
  /** Par compte visé : freine l'essai de mots de passe sur un e-mail donné. */
  email: { scope: "login:email", limit: 8, windowSeconds: 15 * 60 },
  /** Par adresse IP : freine le balayage de nombreux comptes depuis une même machine. */
  ip: { scope: "login:ip", limit: 30, windowSeconds: 15 * 60 },
} as const satisfies Record<string, RateLimitRule>;
