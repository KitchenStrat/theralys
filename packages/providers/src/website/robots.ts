/**
 * Règles robots.txt (RFC 9309) pour notre lecteur. Module pur : l'analyse du
 * fichier et l'interprétation du statut de sa réponse ; la récupération est
 * faite par le lecteur, avec le même client durci que les pages.
 *
 * La lecture est demandée par le propriétaire du site, mais rien ne le
 * prouve techniquement : robots.txt est donc respecté comme pour n'importe
 * quel robot. Un propriétaire qui veut être lu ajoute un groupe à notre nom.
 */

import robotsParser from "robots-parser";
import { EXTERNAL_BOT_NAME } from "@theralys/shared";

/** Taille lue au plus (la RFC demande d'analyser au moins 500 Kio) ; au-delà, le début du fichier fait foi. */
export const ROBOTS_MAX_BYTES = 512 * 1024;

/** `Crawl-delay` est respecté jusqu'à ce plafond : au-delà, la lecture de quelques pages ne tiendrait plus dans sa durée. */
export const MAX_CRAWL_DELAY_MS = 2_000;

export type RobotsRules = {
  /**
   * `file` : règles lues dans le fichier · `absent` : pas de fichier (4xx),
   * tout est permis · `unavailable` : fichier injoignable côté serveur (5xx),
   * tout est interdit tant qu'on ne peut pas le lire.
   */
  source: "file" | "absent" | "unavailable";
  /** L'adresse (même origine que le fichier) peut-elle être lue par notre robot ? */
  isAllowed: (url: string) => boolean;
  /** Écart demandé entre deux requêtes, en millisecondes, borné à MAX_CRAWL_DELAY_MS ; `null` s'il n'est pas demandé */
  crawlDelayMs: number | null;
  /** Plans de site déclarés, tels qu'écrits dans le fichier */
  sitemaps: string[];
};

/** Aucun fichier : aucune restriction. */
export const ROBOTS_ABSENT: RobotsRules = { source: "absent", isAllowed: () => true, crawlDelayMs: null, sitemaps: [] };

/** Fichier injoignable côté serveur : la RFC impose de tout tenir pour interdit. */
export const ROBOTS_UNAVAILABLE: RobotsRules = { source: "unavailable", isAllowed: () => false, crawlDelayMs: null, sitemaps: [] };

/**
 * Règles d'un fichier robots.txt pour le jeton `EXTERNAL_BOT_NAME` : le groupe
 * à notre nom s'il existe, sinon le groupe `*` ; la règle la plus précise
 * l'emporte, et `Allow` à égalité. Une adresse d'une autre origine que le
 * fichier n'est jamais « permise » par lui.
 */
export function parseRobots(robotsUrl: string, body: string): RobotsRules {
  const robots = robotsParser(robotsUrl, body);
  const delay = robots.getCrawlDelay(EXTERNAL_BOT_NAME);
  return {
    source: "file",
    isAllowed: (url) => robots.isAllowed(url, EXTERNAL_BOT_NAME) === true,
    crawlDelayMs: typeof delay === "number" && Number.isFinite(delay) && delay > 0 ? Math.min(Math.round(delay * 1000), MAX_CRAWL_DELAY_MS) : null,
    sitemaps: robots.getSitemaps().slice(0, 10),
  };
}

/**
 * Règles d'après la réponse à `/robots.txt` : 2xx, le fichier est analysé ;
 * 4xx, il n'existe pas et rien n'est interdit ; tout le reste (5xx surtout),
 * il est injoignable et tout est interdit.
 */
export function robotsFromResponse(robotsUrl: string, status: number, body: string): RobotsRules {
  if (status >= 200 && status < 300) return parseRobots(robotsUrl, body);
  if (status >= 400 && status < 500) return ROBOTS_ABSENT;
  return ROBOTS_UNAVAILABLE;
}
