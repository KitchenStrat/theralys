import { and, eq, ne } from "drizzle-orm";
import { getDb, googlePosts, type GooglePost } from "@theralys/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Post Google appartenant au site de la session — null sinon (un id d'un
 * autre site ou mal formé est introuvable, jamais une erreur). Archivés inclus.
 */
export async function ownedGooglePost(siteId: string, postId: string): Promise<GooglePost | null> {
  if (!UUID_RE.test(postId)) return null;
  return (
    (await getDb().query.googlePosts.findFirst({
      where: and(eq(googlePosts.id, postId), eq(googlePosts.siteId, siteId)),
    })) ?? null
  );
}

/** Comme `ownedGooglePost`, mais un post archivé est introuvable (routes de rendu et de téléchargement). */
export async function ownedActiveGooglePost(siteId: string, postId: string): Promise<GooglePost | null> {
  if (!UUID_RE.test(postId)) return null;
  return (
    (await getDb().query.googlePosts.findFirst({
      where: and(eq(googlePosts.id, postId), eq(googlePosts.siteId, siteId), ne(googlePosts.status, "archived")),
    })) ?? null
  );
}
