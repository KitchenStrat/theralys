import { SignJWT, jwtVerify } from "jose";

/**
 * Token de prévisualisation d'article non publié (`?preview_token=`) :
 * JWT signé (HS256) contenant articleId, siteId et une expiration.
 */
export type PreviewTokenPayload = {
  articleId: string;
  siteId: string;
};

const encoder = new TextEncoder();

export async function signPreviewToken(
  payload: PreviewTokenPayload,
  secret: string,
  expiresInSeconds = 60 * 60 * 24 * 30,
): Promise<string> {
  return new SignJWT({ articleId: payload.articleId, siteId: payload.siteId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(encoder.encode(secret));
}

export async function verifyPreviewToken(
  token: string,
  secret: string,
): Promise<PreviewTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret));
    if (typeof payload.articleId !== "string" || typeof payload.siteId !== "string") {
      return null;
    }
    return { articleId: payload.articleId, siteId: payload.siteId };
  } catch {
    return null;
  }
}

/**
 * Jeton de prévisualisation d'un site entier (`?apercu=`), émis par l'éditeur
 * du studio : permet d'afficher une démo expirée ou une page désactivée dans
 * l'aperçu, sans ouvrir ces accès au public. Vérifié par le middleware des
 * sites (Edge) — même secret partagé (AUTH_SECRET).
 */
export type SitePreviewTokenPayload = { siteId: string };

export async function signSitePreviewToken(
  payload: SitePreviewTokenPayload,
  secret: string,
  expiresInSeconds = 60 * 60 * 24,
): Promise<string> {
  return new SignJWT({ scope: "site", siteId: payload.siteId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(encoder.encode(secret));
}

export async function verifySitePreviewToken(
  token: string,
  secret: string,
): Promise<SitePreviewTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret));
    if (payload.scope !== "site" || typeof payload.siteId !== "string") return null;
    return { siteId: payload.siteId };
  } catch {
    return null;
  }
}
