/**
 * Lecture du site internet d'un client (« site de référence », cf.
 * `@theralys/shared` external-site.ts) : pages publiques seulement, lecteur
 * identifié, robots.txt respecté, aucune protection contournée.
 *
 * Contrat du module (implémentation à venir dans ce dossier) :
 * - `createWebsiteReader(env)` : lecteur réel, ou lecteur de démonstration
 *   quand `EXTERNAL_SITE_MOCK=1` (aucun accès réseau) ;
 * - `pastedTextToPages(text, url)` : repli quand le site refuse la lecture —
 *   le texte collé par le praticien devient des pages, sans accès réseau.
 */

import type { ExternalReadOutcome, ExternalSitePage } from "@theralys/shared";

export type WebsiteReadOptions = {
  /** Pages lues au plus (défaut : EXTERNAL_SITE_LIMITS.maxPages) */
  maxPages?: number;
  /** Durée totale accordée à la lecture, en millisecondes */
  deadlineMs?: number;
  signal?: AbortSignal;
};

export type WebsiteReader = {
  mode: "live" | "mock";
  /** Lit le site à partir de son adresse d'accueil normalisée. Ne lève jamais : un échec est une issue `ok: false`. */
  read(url: string, opts?: WebsiteReadOptions): Promise<ExternalReadOutcome>;
};

export function createWebsiteReader(_env: NodeJS.ProcessEnv = process.env): WebsiteReader {
  throw new Error("Lecteur de site : implémentation à venir");
}

export function pastedTextToPages(_text: string, _url: string, _now: Date = new Date()): ExternalSitePage[] {
  throw new Error("Lecteur de site : implémentation à venir");
}
