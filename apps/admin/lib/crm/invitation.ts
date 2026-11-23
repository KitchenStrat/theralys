/**
 * Invitation d'un commercial à choisir son mot de passe. Même principe que
 * pour un client du studio (`lib/invitations.ts`) : le compte naît avec une
 * sentinelle « invite: » à la place du mot de passe (aucune connexion
 * possible), et l'admin transmet un lien signé avec `AUTH_SECRET`, valable
 * 7 jours.
 *
 * Usage unique : le lien porte l'empreinte de la sentinelle en place quand il
 * a été créé. Choisir son mot de passe la remplace, demander un nouveau lien
 * aussi : dans les deux cas, tous les liens précédents cessent de valoir.
 *
 * Le jeton voyage dans le fragment de l'adresse (`invitation-link.ts`) : il
 * ne figure dans aucun journal de requêtes, et n'est écrit dans aucun
 * `console.*`. Réservé au serveur.
 */

import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { passwordFingerprint } from "@/lib/password-fingerprint";

const PURPOSE = "admin-rep-invitation";
const INVITE_PREFIX = "invite:";
export const REP_INVITE_TTL_S = 7 * 86_400;

/** Nouvelle sentinelle : un mot de passe qui n'en est pas un (`verifyPassword` échoue toujours dessus). */
export function newInviteSentinel(): string {
  return `${INVITE_PREFIX}${randomBytes(16).toString("hex")}`;
}

export type RepInvitationClaims = { userId: string; fingerprint: string };

/** Signe l'invitation d'un compte qui attend son mot de passe. */
export async function signRepInvitation(rep: { userId: string; passwordHash: string }, secret: string, now = new Date()): Promise<string> {
  if (!rep.passwordHash.startsWith(INVITE_PREFIX)) throw new Error("Ce compte a déjà un mot de passe : pas d'invitation à signer.");
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ purpose: PURPOSE, pv: passwordFingerprint(rep.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(rep.userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + REP_INVITE_TTL_S)
    .sign(new TextEncoder().encode(secret));
}

/** Lit une invitation : null si la signature, l'échéance ou l'objet du jeton ne conviennent pas. */
export async function readRepInvitation(token: string, secret: string, now = new Date()): Promise<RepInvitationClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"], currentDate: now });
    if (payload.purpose !== PURPOSE || typeof payload.sub !== "string" || typeof payload.pv !== "string") return null;
    return { userId: payload.sub, fingerprint: payload.pv };
  } catch {
    return null;
  }
}

export type InvitationVerdict = "ok" | "invalid" | "used" | "disabled";

/**
 * Ce que vaut une invitation face à l'état actuel du compte : `used` une
 * fois le mot de passe choisi, `invalid` si un lien plus récent l'a
 * remplacée (ou si le compte n'est pas celui d'un commercial), `disabled`
 * si l'admin a fermé le compte entre-temps.
 */
export function judgeInvitation(claims: RepInvitationClaims | null, account: { role: string; passwordHash: string; disabledAt: Date | null } | null): InvitationVerdict {
  if (!claims || !account || account.role !== "sales") return "invalid";
  if (account.disabledAt) return "disabled";
  if (!account.passwordHash.startsWith(INVITE_PREFIX)) return "used";
  return passwordFingerprint(account.passwordHash) === claims.fingerprint ? "ok" : "invalid";
}
