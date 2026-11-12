/**
 * Lecture du site internet d'un client (« site de référence », cf.
 * `@theralys/shared` external-site.ts) : pages publiques seulement, lecteur
 * identifié, robots.txt respecté, aucune protection contournée.
 *
 * - `createWebsiteReader(env)` : lecteur réel, ou lecteur de démonstration
 *   quand `EXTERNAL_SITE_MOCK=1` (aucun accès réseau) ;
 * - `pastedTextToPages(text, url)` : repli quand le site refuse la lecture —
 *   le texte collé par le praticien devient des pages, sans accès réseau.
 *
 * Variables d'environnement lues ici, et nulle part ailleurs dans ce
 * dossier : `EXTERNAL_SITE_MOCK`, `EXTERNAL_SITE_BOT_URL` (page qui présente
 * le robot), `EXTERNAL_SITE_BOT_UA` (identité complète du robot). Aucune ne
 * touche à la politique réseau : la protection contre les adresses internes
 * ne se règle pas par l'environnement.
 */

import { EXTERNAL_BOT_NAME } from "@theralys/shared";
import { createMockWebsiteReader } from "./mock";
import { createLiveWebsiteReader } from "./reader";
import type { WebsiteReader } from "./types";

export type { WebsiteReadOptions, WebsiteReader } from "./types";
export { pastedTextToPages } from "./pasted";

/** Page publique qui présente le robot : qui lit, pourquoi, à quel rythme, comment le refuser. */
export const DEFAULT_BOT_PAGE_URL = "https://www.harmony-web.fr/robot";

/** Signes d'une identité de navigateur : un robot honnête ne s'en réclame jamais, même « par compatibilité ». */
const BROWSER_LIKE = /mozilla|chrome|chromium|safari|firefox|gecko|webkit|opera|\bedge?\/|msie|trident|android|iphone|windows nt|macintosh/i;

/** Adresse https sans identifiants ni ancre, bornée ; `null` sinon. */
function botPageUrl(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (raw === "" || raw.length > 200) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
    url.hash = "";
    return /^[\x21-\x7e]+$/.test(url.href) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * En-tête User-Agent du lecteur : `HarmonyBot/1.0 (+adresse de la page du
 * robot)`. `EXTERNAL_SITE_BOT_URL` change l'adresse de cette page,
 * `EXTERNAL_SITE_BOT_UA` remplace l'identité entière (préproduction, essais)
 * — sauf si elle ressemble à celle d'un navigateur ou n'est pas un en-tête
 * valide : l'identité par défaut est alors gardée. Le jeton des règles
 * robots.txt reste `EXTERNAL_BOT_NAME` dans tous les cas.
 */
export function websiteUserAgent(env: NodeJS.ProcessEnv = process.env): string {
  const override = (env.EXTERNAL_SITE_BOT_UA ?? "").trim();
  if (/^[\x20-\x7e]{3,200}$/.test(override) && !BROWSER_LIKE.test(override)) return override;
  return `${EXTERNAL_BOT_NAME}/1.0 (+${botPageUrl(env.EXTERNAL_SITE_BOT_URL) ?? DEFAULT_BOT_PAGE_URL})`;
}

/**
 * Lecteur de site : celui de démonstration si `EXTERNAL_SITE_MOCK` vaut `1`
 * (ou `true`), sinon le lecteur réel, toujours avec la politique réseau de
 * production.
 */
export function createWebsiteReader(env: NodeJS.ProcessEnv = process.env): WebsiteReader {
  if (env.EXTERNAL_SITE_MOCK === "1" || env.EXTERNAL_SITE_MOCK === "true") return createMockWebsiteReader();
  return createLiveWebsiteReader({ userAgent: websiteUserAgent(env) });
}
