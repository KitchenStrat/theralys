/**
 * Outils communs des tâches planifiées (module feuille : il n'importe aucune
 * tâche, toutes peuvent l'importer) :
 *
 * - rapport d'une tâche (`TickReport`) et échéance d'un passage (`TickOptions`) ;
 * - exécution bornée (`mapPool`) : au plus `limit` promesses en vol ;
 * - lots proportionnels au parc (`proportionalBatch`) ;
 * - périmètre des sites servis (`servedSite`, `liveDemo`) : un client archivé
 *   ou une démo dont le lien a expiré ne coûte plus rien ;
 * - étiquette d'une erreur pour les journaux et les rapports (`errorLabel`) :
 *   jamais son message, qui peut reprendre un contenu, une adresse ou les
 *   paramètres d'une requête.
 */

import { and, eq, gt, isNull, ne, or, type SQL } from "drizzle-orm";
import { sites } from "@theralys/db";

/**
 * Rapport d'une tâche. `status: "error"` : la tâche a levé, ou n'a rien pu
 * traiter alors qu'elle avait à faire — la route cron répond alors 500.
 * `failed` : éléments en échec d'un passage par ailleurs abouti. `error` :
 * type ou code de l'erreur, jamais un message ni une donnée personnelle.
 */
export type TickReport = {
  task: string;
  processed: number;
  status: "ok" | "error";
  failed?: number;
  error?: string;
};

/** Options communes des ticks : `deadline` (facultative) arrête la boucle avant l'élément suivant une fois dépassée. */
export type TickOptions = { deadline?: Date };

/** Rapport d'une tâche aboutie ; `failed` n'apparaît que s'il y a eu des éléments en échec. */
export function tickOk(task: string, processed: number, failed = 0): TickReport {
  return { task, processed, status: "ok", ...(failed > 0 ? { failed } : {}) };
}

/** Rapport d'une tâche en échec (`error` : étiquette courte, voir `errorLabel`). */
export function tickError(task: string, error: string, processed = 0, failed = 0): TickReport {
  return { task, processed, status: "error", ...(failed > 0 ? { failed } : {}), error };
}

/** Le tick a dépassé son échéance : plus aucun élément n'est entamé. */
export function pastDeadline(opts: TickOptions, nowMs = Date.now()): boolean {
  return opts.deadline !== undefined && nowMs > opts.deadline.getTime();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exécute `fn` sur chaque élément avec au plus `limit` promesses en vol ; les
 * résultats gardent l'ordre des éléments. `fn` ne doit pas lever : une
 * exception arrêterait le passage entier (chaque tâche attrape les siennes).
 */
export async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(0, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Taille d'un lot quotidien proportionnelle au parc : `eligible` éléments à
 * repasser tous les `intervalDays` jours demandent `eligible / intervalDays`
 * éléments par jour. `minimum` garde le rythme d'avant pour un petit parc
 * (un lot d'éléments jamais traités est rattrapé en quelques passages).
 * L'échéance du passage borne toujours le lot.
 */
export function proportionalBatch(eligible: number, intervalDays: number, minimum: number): number {
  return Math.max(minimum, Math.ceil(Math.max(0, eligible) / Math.max(1, intervalDays)));
}

/**
 * Étiquette d'une erreur : son code (SQLSTATE de la base, code réseau de
 * Node) s'il y en a un, sinon son type, suivi du statut HTTP quand le
 * fournisseur en a rendu un (« Error 429 »). Jamais son message.
 */
export function errorLabel(err: unknown): string {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{3,24}$/.test(code)) return code;
    current = current.cause;
  }
  if (!(err instanceof Error)) return typeof err;
  const status = (err as Error & { status?: unknown }).status;
  return typeof status === "number" ? `${err.name} ${status}` : err.name;
}

// ─── Périmètre des sites servis ──────────────────────────────────────────────

/** Démo dont le lien est encore valide à `now` (sans date d'expiration : valide). */
export function liveDemo(now: Date): SQL {
  return and(eq(sites.type, "demo"), or(isNull(sites.demoExpiresAt), gt(sites.demoExpiresAt, now)))!;
}

/**
 * Sites que les tâches planifiées servent encore : les clients et les démos
 * en cours, jamais un site archivé ni une démo dont le lien a expiré.
 */
export function servedSite(now: Date): SQL {
  return and(ne(sites.status, "archived"), or(eq(sites.type, "client"), liveDemo(now)))!;
}

/** Même règle que `servedSite`, pour un site déjà chargé. */
export function isServedSite(site: { type: "demo" | "client"; status: string; demoExpiresAt: Date | null }, now: Date): boolean {
  if (site.status === "archived") return false;
  return site.type === "client" || site.demoExpiresAt === null || site.demoExpiresAt.getTime() > now.getTime();
}
