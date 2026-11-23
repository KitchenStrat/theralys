import { createHash } from "node:crypto";

/**
 * Empreinte du mot de passe en cours d'un compte (ou de la sentinelle
 * « invite: » qui en tient lieu) : elle change dès que celui-ci change. Même
 * calcul et même nom de champ (`pv`) que dans le studio. Le lien d'invitation
 * d'un commercial et sa session la portent : l'un comme l'autre cessent de
 * valoir quand le mot de passe est choisi ou réinitialisé.
 */
export function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}
