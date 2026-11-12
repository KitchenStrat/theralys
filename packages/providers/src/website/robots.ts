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

/** Longueur d'adresse au-delà de laquelle aucune règle n'est consultée : l'adresse est tenue pour interdite. */
export const ROBOTS_URL_MAX = 2_048;
/**
 * Travail admis pour confronter une adresse aux règles, en caractères de
 * règles × caractères d'adresse : la comparaison coûte ce produit quand les
 * règles sont truffées de jokers. Avec un fichier de 500 Kio, seules les
 * adresses de moins de 200 caractères sont confrontées aux règles.
 */
const MATCH_BUDGET = 100_000_000;
const ROBOTS_URL_MIN = 200;
const SITEMAP_LINES_MAX = 50;

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
 * Du fichier, ne garde que ce qui nous concerne : les règles des groupes à
 * notre nom ou au nom de `*`, et les plans de site. Les groupes sont
 * délimités exactement comme le fait l'analyseur (robots-parser) : une ligne
 * `User-agent` qui suit une autre directive ouvre un nouveau groupe.
 *
 * Pourquoi ce tri avant l'analyse : l'analyseur recopie chaque règle pour
 * chaque robot nommé dans son groupe. Un fichier fabriqué — vingt mille
 * lignes `User-agent` suivies de vingt mille règles — lui ferait créer des
 * centaines de millions de règles et épuiserait la mémoire du processus.
 * Ici, un groupe ne nomme plus que nous, `*`, ou les deux.
 */
function relevantLines(body: string): string {
  const ours = EXTERNAL_BOT_NAME.toLowerCase();
  const out: string[] = [];
  let groupIsOurs = false;
  let groupIsAny = false;
  let headerWritten = false;
  let afterUserAgent = false;
  let sitemaps = 0;
  for (const raw of body.split(/\r\n|\r|\n/)) {
    const comment = raw.indexOf("#");
    const line = comment === -1 ? raw : raw.slice(0, comment);
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    if (key === "") continue;
    if (key === "user-agent") {
      if (!afterUserAgent) {
        groupIsOurs = false;
        groupIsAny = false;
        headerWritten = false;
      }
      // Nom du robot comme le lit l'analyseur : en minuscules, sans numéro de version
      const name = line.slice(colon + 1).trim().toLowerCase().split("/")[0]!.trim();
      if (name === ours) groupIsOurs = true;
      else if (name === "*") groupIsAny = true;
    } else if (key === "allow" || key === "disallow" || key === "crawl-delay") {
      if (groupIsOurs || groupIsAny) {
        if (!headerWritten) {
          if (groupIsOurs) out.push(`User-agent: ${ours}`);
          if (groupIsAny) out.push("User-agent: *");
          headerWritten = true;
        }
        out.push(raw);
      }
    } else if (key === "sitemap" && sitemaps < SITEMAP_LINES_MAX) {
      sitemaps += 1;
      out.push(raw);
    }
    afterUserAgent = key === "user-agent";
  }
  return out.join("\n");
}

/**
 * Règles d'un fichier robots.txt pour le jeton `EXTERNAL_BOT_NAME` : le groupe
 * à notre nom s'il existe, sinon le groupe `*` ; la règle la plus précise
 * l'emporte, et `Allow` à égalité. Une adresse d'une autre origine que le
 * fichier n'est jamais « permise » par lui.
 */
export function parseRobots(robotsUrl: string, body: string): RobotsRules {
  const relevant = relevantLines(body);
  const robots = robotsParser(robotsUrl, relevant);
  const delay = robots.getCrawlDelay(EXTERNAL_BOT_NAME);
  const urlMax = Math.min(ROBOTS_URL_MAX, Math.max(ROBOTS_URL_MIN, Math.floor(MATCH_BUDGET / Math.max(1, relevant.length))));
  return {
    source: "file",
    // Adresse trop longue pour être confrontée aux règles sans y passer des secondes : tenue pour interdite
    isAllowed: (url) => url.length <= urlMax && robots.isAllowed(url, EXTERNAL_BOT_NAME) === true,
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
