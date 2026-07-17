import { and, count, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { getDb, prospects, sites, type Prospect, type Site } from "@theralys/db";

export const DEMOS_PER_PAGE = 25;

/**
 * Filet de sécurité : sur Vercel, une fonction tuée en pleine génération
 * (durée maximale d'exécution dépassée) laisse la démo bloquée « En
 * préparation » sans erreur. Chaque étape de génération met à jour
 * updated_at — sans nouvelle depuis 10 min, la génération est morte.
 */
const STALE_GENERATION_MS = 10 * 60 * 1000;

async function failStaleGenerations(): Promise<void> {
  const db = getDb();
  await db
    .update(sites)
    .set({
      status: "error",
      generationError:
        "Génération interrompue — durée maximale d'exécution dépassée. Cliquez sur « Régénérer le contenu » pour réessayer.",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sites.status, "generating"),
        lt(sites.updatedAt, new Date(Date.now() - STALE_GENERATION_MS)),
      ),
    );
}

export type DemoRow = { site: Site; prospect: Prospect | null };

/** Liste paginée des démos, recherche par nom, métier ou ville. */
export async function listDemos(opts: {
  query?: string;
  page?: number;
}): Promise<{ rows: DemoRow[]; total: number; page: number; pageCount: number }> {
  const db = getDb();
  await failStaleGenerations();
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.query?.trim();

  const searchCondition = q
    ? or(
        ilike(prospects.firstName, `%${q}%`),
        ilike(prospects.lastName, `%${q}%`),
        ilike(sql`${prospects.firstName} || ' ' || ${prospects.lastName}`, `%${q}%`),
        ilike(prospects.profession, `%${q}%`),
        ilike(prospects.city, `%${q}%`),
      )
    : undefined;

  const where = and(eq(sites.type, "demo"), searchCondition);

  const [rows, totalRow] = await Promise.all([
    db
      .select({ site: sites, prospect: prospects })
      .from(sites)
      .leftJoin(prospects, eq(sites.prospectId, prospects.id))
      .where(where)
      .orderBy(desc(sites.createdAt))
      .limit(DEMOS_PER_PAGE)
      .offset((page - 1) * DEMOS_PER_PAGE),
    db
      .select({ value: count() })
      .from(sites)
      .leftJoin(prospects, eq(sites.prospectId, prospects.id))
      .where(where),
  ]);

  const total = totalRow[0]?.value ?? 0;
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / DEMOS_PER_PAGE)) };
}

export async function getDemo(siteId: string): Promise<DemoRow | null> {
  const db = getDb();
  await failStaleGenerations();
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site || site.type !== "demo") return null;
  const prospect = site.prospectId
    ? ((await db.query.prospects.findFirst({
        where: eq(prospects.id, site.prospectId),
      })) ?? null)
    : null;
  return { site, prospect };
}

/** URL publique d'une démo (hôte des sites + slug). */
export function demoUrl(site: Site): string {
  const base = process.env.SITES_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/${site.slug}`;
}

export function isLinkActive(site: Site): boolean {
  return !site.demoExpiresAt || site.demoExpiresAt.getTime() > Date.now();
}
