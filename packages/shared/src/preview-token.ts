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
