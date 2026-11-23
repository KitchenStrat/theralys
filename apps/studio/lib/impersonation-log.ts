import { getDb, impersonations } from "@theralys/db";

/**
 * Journal des entrées de l'équipe dans l'espace d'un client, et usage unique
 * du lien : chaque lien porte un identifiant (`jti`) qui ne peut être inscrit
 * qu'une fois. Un lien intercepté (historique, journal de requêtes) et rejoué
 * dans ses deux minutes de validité n'ouvre donc plus de session.
 *
 * Déployé avant la migration 0013 (table absente), ou base indisponible :
 * l'entrée reste possible, sans journal — le support ne doit pas tomber avec
 * lui.
 */
export type ImpersonationRecord = "recorded" | "replayed" | "unavailable";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pgCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export async function recordImpersonation(entry: { jti: string; adminId: unknown; siteId: string }): Promise<ImpersonationRecord> {
  const adminId = typeof entry.adminId === "string" && UUID.test(entry.adminId) ? entry.adminId : null;
  const insert = (admin: string | null) =>
    getDb()
      .insert(impersonations)
      .values({ jti: entry.jti.slice(0, 100), adminId: admin, siteId: entry.siteId })
      .onConflictDoNothing({ target: impersonations.jti })
      .returning({ jti: impersonations.jti });
  try {
    const rows = await insert(adminId);
    return rows.length > 0 ? "recorded" : "replayed";
  } catch (error) {
    // Compte de l'admin introuvable (supprimé depuis) : l'entrée est tout de même journalisée, sans auteur
    if (pgCode(error) === "23503" && adminId !== null) {
      try {
        const rows = await insert(null);
        return rows.length > 0 ? "recorded" : "replayed";
      } catch {
        return "unavailable";
      }
    }
    if (pgCode(error) !== "42P01") console.warn("[impersonation] journal indisponible :", error instanceof Error ? error.name : "erreur");
    return "unavailable";
  }
}
