/**
 * Régénérations de contenus réseaux sociaux (instructions libres + ton
 * choisi) : quota mensuel SOCIAL_REGENERATIONS_PER_MONTH par site, compté sur
 * les lignes `google_usage` de kind "social_regen" (le registre mensuel par
 * site déjà utilisé pour `post_regen` et `reply_ai`), coût 0, une requête
 * par ligne. `regenerationQuota` est pure (testée sans base).
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb, googleUsage } from "@theralys/db";
import { SOCIAL_REGENERATIONS_PER_MONTH, usageMonthKey } from "@theralys/shared";
import type { DbExecutor } from "./data";

/** Kind des lignes `google_usage` d'une régénération de contenu social. */
export const SOCIAL_REGEN_USAGE_KIND = "social_regen";

export type SocialRegenerationUsage = { used: number; remaining: number };

/**
 * Quota restant d'après le nombre de régénérations déjà consommées dans le
 * mois : jamais négatif ; une valeur absurde (négative, NaN) compte pour 0.
 */
export function regenerationQuota(
  used: number,
  limit: number = SOCIAL_REGENERATIONS_PER_MONTH,
): SocialRegenerationUsage {
  const safeUsed = Number.isFinite(used) && used > 0 ? Math.floor(used) : 0;
  return { used: safeUsed, remaining: Math.max(0, limit - safeUsed) };
}

/** Régénérations du mois civil UTC : lignes `google_usage` de kind "social_regen". */
export async function getSocialRegenerationUsage(
  siteId: string,
  now: Date,
  db: DbExecutor = getDb(),
): Promise<SocialRegenerationUsage> {
  const [row] = await db
    .select({ used: sql<number>`count(*)`.mapWith(Number) })
    .from(googleUsage)
    .where(
      and(
        eq(googleUsage.siteId, siteId),
        eq(googleUsage.month, usageMonthKey(now)),
        eq(googleUsage.kind, SOCIAL_REGEN_USAGE_KIND),
      ),
    );
  return regenerationQuota(row?.used ?? 0);
}

/** Inscrit une régénération consommée (coût 0, une requête). */
export async function recordSocialRegeneration(siteId: string, now: Date, db: DbExecutor = getDb()): Promise<void> {
  await db
    .insert(googleUsage)
    .values({ siteId, month: usageMonthKey(now), kind: SOCIAL_REGEN_USAGE_KIND, costUsd: 0, requests: 1 });
}
