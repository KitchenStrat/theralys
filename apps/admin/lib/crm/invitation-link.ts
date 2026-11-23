/**
 * Lien d'invitation d'un commercial. Le jeton voyage dans le fragment de
 * l'adresse (`/invitation#jeton=…`) : un navigateur n'envoie jamais le
 * fragment au serveur, le jeton ne figure donc dans aucun journal de
 * requêtes, ni chez nous ni chez l'hébergeur, ni dans un en-tête Referer. Il
 * ne part que dans le corps des actions de la page d'invitation. Module sans
 * dépendance serveur.
 */

const HASH_KEY = "jeton";

/** Chemin du lien d'invitation ; l'écran de l'admin y ajoute l'origine de la page (son adresse publique). */
export function invitationPath(token: string): string {
  return `/invitation#${HASH_KEY}=${token}`;
}

/** Jeton lu dans le fragment de l'adresse (`location.hash`) ; null s'il n'a pas la forme d'un jeton signé. */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get(HASH_KEY);
  return token && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token) ? token : null;
}
