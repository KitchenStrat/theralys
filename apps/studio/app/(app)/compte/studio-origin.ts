/**
 * Adresse publique du studio, pour un lien qui y ramène depuis un autre
 * service (retour du portail de facturation). Fonction pure : la variable
 * d'environnement et les en-têtes de la requête sont lus par l'appelant.
 */

/** En-têtes de la requête en cours dont se déduit son origine. */
export type RequestOrigin = {
  /** `Origin` : envoyé par le navigateur avec toute action (requête POST) */
  origin: string | null;
  host: string | null;
  /** `X-Forwarded-Host` / `X-Forwarded-Proto` : posés par le serveur frontal de l'hébergeur */
  forwardedHost: string | null;
  forwardedProto: string | null;
};

/** Adresse web absolue sans barre finale, ou `null` si la valeur n'en est pas une. */
function webAddress(value: string | null | undefined, keepPath: boolean): string | null {
  const raw = value?.trim() ?? "";
  if (raw === "") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return keepPath ? `${url.origin}${url.pathname.replace(/\/+$/, "")}` : url.origin;
  } catch {
    return null;
  }
}

const firstOf = (header: string | null): string => header?.split(",")[0]?.trim() ?? "";

/**
 * Adresse de base du studio, sans barre finale :
 * 1. `configured` — `STUDIO_BASE_URL`, l'adresse publique que le reste du code
 *    utilise pour les liens vers le studio (e-mails, agenda) ;
 * 2. sinon l'origine de la requête en cours : là où le praticien se trouve
 *    quand il ouvre le portail, donc là où il doit revenir ;
 * 3. sinon `fallback` (adresse de production).
 * Une valeur qui n'est pas une adresse web absolue est ignorée.
 */
export function studioOrigin(configured: string | undefined, request: RequestOrigin, fallback: string): string {
  const fromEnvironment = webAddress(configured, true);
  if (fromEnvironment) return fromEnvironment;

  const fromOrigin = webAddress(request.origin, false);
  if (fromOrigin) return fromOrigin;

  const host = firstOf(request.forwardedHost) || firstOf(request.host);
  if (host !== "") {
    const forwardedProto = firstOf(request.forwardedProto).toLowerCase();
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
    const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : local ? "http" : "https";
    const fromHost = webAddress(`${proto}://${host}`, false);
    if (fromHost) return fromHost;
  }
  return fallback.replace(/\/+$/, "");
}
