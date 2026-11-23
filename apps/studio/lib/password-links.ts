import { SignJWT, jwtVerify } from "jose";

/**
 * Liens signés qui mènent à la page « choisir son mot de passe » :
 * - invitation (`studio-password-setup`, 7 jours, émise par l'admin) : crée le
 *   premier mot de passe d'un compte qui n'en a pas encore ;
 * - réinitialisation (`studio-password-reset`, 1 heure, demandée par le
 *   praticien) : remplace un mot de passe oublié.
 * Un lien ne sert qu'une fois : il porte l'empreinte du mot de passe (ou de la
 * sentinelle d'invitation) en place à son émission, et n'est plus accepté dès
 * que celui-ci a changé.
 */
export const PASSWORD_SETUP_PURPOSE = "studio-password-setup";
export const PASSWORD_RESET_PURPOSE = "studio-password-reset";
export const PASSWORD_RESET_TTL_S = 60 * 60;

export type PasswordLink = {
  purpose: typeof PASSWORD_SETUP_PURPOSE | typeof PASSWORD_RESET_PURPOSE;
  userId: string;
  /** Empreinte attendue du mot de passe en place (absente des invitations émises avant ce champ). */
  fingerprint: string | null;
};

const encoder = new TextEncoder();

export async function signPasswordResetToken(userId: string, fingerprint: string, secret: string): Promise<string> {
  return new SignJWT({ purpose: PASSWORD_RESET_PURPOSE, pv: fingerprint })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + PASSWORD_RESET_TTL_S)
    .sign(encoder.encode(secret));
}

/** Lit un lien signé ; `null` s'il est expiré, falsifié ou d'un autre usage. */
export async function readPasswordLink(token: string | undefined, secret: string | undefined): Promise<PasswordLink | null> {
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    if (payload.purpose !== PASSWORD_SETUP_PURPOSE && payload.purpose !== PASSWORD_RESET_PURPOSE) return null;
    const fingerprint = typeof payload.pv === "string" ? payload.pv : null;
    // Une réinitialisation sans empreinte serait rejouable : refusée
    if (payload.purpose === PASSWORD_RESET_PURPOSE && fingerprint === null) return null;
    return { purpose: payload.purpose, userId: payload.sub, fingerprint };
  } catch {
    return null;
  }
}

/**
 * Le lien vaut-il encore pour ce compte ? Une invitation exige la sentinelle
 * « invite: » (compte jamais activé) ; une réinitialisation, un mot de passe
 * existant. Dans les deux cas l'empreinte, quand le lien en porte une, doit
 * être celle du mot de passe en place.
 */
export function passwordLinkState(link: PasswordLink, account: { passwordHash: string }, fingerprintOf: (hash: string) => string): "ok" | "already" | "stale" {
  const pending = account.passwordHash.startsWith("invite:");
  if (link.purpose === PASSWORD_SETUP_PURPOSE && !pending) return "already";
  if (link.purpose === PASSWORD_RESET_PURPOSE && pending) return "stale";
  if (link.fingerprint !== null && link.fingerprint !== fingerprintOf(account.passwordHash)) return "stale";
  return "ok";
}
