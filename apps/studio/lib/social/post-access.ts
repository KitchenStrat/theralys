import { and, eq, ne } from "drizzle-orm";
import { getDb, socialPosts, type SocialPost } from "@theralys/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Contenu réseaux sociaux appartenant au site de la session — null sinon
 * (un id d'un autre site ou mal formé est traité comme introuvable, jamais
 * comme une erreur). Les contenus archivés sont inclus.
 */
export async function ownedSocialPost(siteId: string, postId: string): Promise<SocialPost | null> {
  if (!UUID_RE.test(postId)) return null;
  const db = getDb();
  return (
    (await db.query.socialPosts.findFirst({
      where: and(eq(socialPosts.id, postId), eq(socialPosts.siteId, siteId)),
    })) ?? null
  );
}

/**
 * Comme `ownedSocialPost`, mais un contenu archivé (« Retirer ce contenu »)
 * est introuvable : les routes de rendu et de téléchargement ne doivent ni
 * le servir ni réécrire ses rendus Blob supprimés à l'archivage.
 */
export async function ownedActiveSocialPost(siteId: string, postId: string): Promise<SocialPost | null> {
  if (!UUID_RE.test(postId)) return null;
  const db = getDb();
  return (
    (await db.query.socialPosts.findFirst({
      where: and(
        eq(socialPosts.id, postId),
        eq(socialPosts.siteId, siteId),
        ne(socialPosts.status, "archived"),
      ),
    })) ?? null
  );
}
