/**
 * Site internet du client (« site de référence », cf. `@theralys/shared`
 * external-site.ts) : service appelé par le studio et par les tâches
 * planifiées.
 *
 * Déroulé : le praticien donne l'adresse de son site et confirme qu'il est
 * le sien (`beginExternalSiteRead`) ; le site est lu puis son profil extrait,
 * en arrière-plan (`runExternalSiteRead`) ; le praticien relit et corrige
 * (`saveExternalOverrides`) puis choisit que ses outils s'appuient dessus
 * (`setExternalSiteActive`). Les outils lisent alors `loadExternalReference`.
 * Si le site refuse la lecture, le praticien colle le texte de ses pages
 * (`submitExternalSiteText`). Un site connecté est relu chaque mois
 * (`refreshExternalSites`) ; les corrections ne sont jamais écrasées.
 *
 * Contrat du module — implémentation à venir.
 */

import type { ExternalProfileExtractor } from "@theralys/ai";
import type { Database, Site } from "@theralys/db";
import type { WebsiteReader } from "@theralys/providers/website";
import {
  activeExternalSite,
  type ExternalPageKind,
  type ExternalProfileOverrides,
  type ExternalReadError,
  type ExternalSiteFacts,
  type ExternalSiteProfile,
  type ExternalSiteSetting,
  type ExternalSiteSource,
  type ExternalSiteStatus,
} from "@theralys/shared";

/** Dépendances injectables (tests, démonstration). */
export type ExternalSiteDeps = {
  reader?: WebsiteReader;
  extractor?: ExternalProfileExtractor;
  now?: Date;
  env?: NodeJS.ProcessEnv;
};

/** État du site du client pour l'écran « Mon site » du studio. */
export type ExternalSiteView = {
  url: string;
  status: ExternalSiteStatus;
  /** Une lecture est en cours (et n'a pas été interrompue) */
  reading: boolean;
  source: ExternalSiteSource;
  error: ExternalReadError | null;
  readAt: Date | null;
  /** Les outils s'appuient sur ce site */
  active: boolean;
  keepHostedIndexed: boolean;
  pages: { url: string; kind: ExternalPageKind; title: string }[];
  facts: ExternalSiteFacts;
  /** Profil lu sur le site */
  extracted: ExternalSiteProfile | null;
  /** Corrections du praticien */
  overrides: ExternalProfileOverrides | null;
  /** Profil effectif : lu, puis corrigé */
  profile: ExternalSiteProfile;
  /** Le profil suffit pour que les outils s'appuient dessus */
  usable: boolean;
  /** Ce qui manque au profil, dit au praticien */
  gaps: string[];
  measure: {
    /** Clé publique du code de mesure */
    key: string;
    /** Première visite reçue du site (code installé et actif) */
    seenAt: Date | null;
    /** Le code a été repéré dans les pages à la dernière lecture */
    detectedOnSite: boolean;
  };
  /** Lectures lancées ce mois-ci et plafond mensuel */
  reads: { used: number; limit: number };
};

/** `available: false` : la table n'existe pas encore (migration 0009 non appliquée). `site: null` : aucun site connecté. */
export type ExternalSiteState = { available: false } | { available: true; site: ExternalSiteView | null };

export type ExternalSiteRefusal = "url" | "consent" | "quota" | "busy" | "text" | "not_ready" | "unavailable";
/** Issue d'une action : en cas de refus, `message` est prêt à être montré au praticien. */
export type ExternalSiteResult = { ok: true } | { ok: false; reason: ExternalSiteRefusal; message: string };

/** Ce que les outils lisent quand le site du client est la référence. */
export type ExternalReference = { setting: ExternalSiteSetting; profile: ExternalSiteProfile; facts: ExternalSiteFacts };

const pending = (): never => {
  throw new Error("Site du client : implémentation à venir");
};

/** Hôtes du site hébergé (domaine du site, hôte de base des sites, hôte du studio) : jamais acceptés comme « site du client ». */
export function hostedHostsOf(_site: Pick<Site, "domain">, _env: NodeJS.ProcessEnv = process.env): string[] {
  return pending();
}

/** État du site du client d'un site, pour l'écran « Mon site ». */
export async function loadExternalSite(_db: Database, _site: Pick<Site, "id" | "theme">, _now: Date = new Date()): Promise<ExternalSiteState> {
  return pending();
}

/**
 * Enregistre l'adresse (validée, consentement exigé, quota mensuel vérifié)
 * et passe le site en « lecture en cours ». La lecture elle-même est lancée
 * ensuite par `runExternalSiteRead` (en arrière-plan, côté studio).
 */
export async function beginExternalSiteRead(_db: Database, _site: Site, _input: { url: string; consent: boolean }, _deps: ExternalSiteDeps = {}): Promise<ExternalSiteResult> {
  return pending();
}

/** Lit le site puis en extrait le profil, et inscrit le résultat (ou l'échec). Ne lève jamais. */
export async function runExternalSiteRead(_db: Database, _siteId: string, _deps: ExternalSiteDeps = {}): Promise<void> {
  return pending();
}

/** Repli quand le site refuse la lecture : le texte collé par le praticien tient lieu de pages lues. */
export async function submitExternalSiteText(_db: Database, _site: Site, _input: { url: string; text: string; consent: boolean }, _deps: ExternalSiteDeps = {}): Promise<ExternalSiteResult> {
  return pending();
}

/** Enregistre les corrections du praticien (nettoyées), sans toucher au profil lu. */
export async function saveExternalOverrides(_db: Database, _siteId: string, _overrides: unknown): Promise<ExternalSiteResult> {
  return pending();
}

/**
 * Fait du site du client la référence des outils, ou y renonce. À
 * l'activation, le lien de rendez-vous et les réseaux sociaux trouvés sur le
 * site complètent les réglages restés vides (jamais d'écrasement).
 */
export async function setExternalSiteActive(_db: Database, _siteId: string, _input: { active: boolean; keepHostedIndexed?: boolean }): Promise<ExternalSiteResult> {
  return pending();
}

/** Oublie le site du client : réglage retiré, lecture et corrections supprimées. */
export async function disconnectExternalSite(_db: Database, _siteId: string): Promise<ExternalSiteResult> {
  return pending();
}

/**
 * Référence des outils : profil effectif et faits du site du client quand il
 * est actif et exploitable, sinon `null` (les outils lisent alors le site
 * hébergé). `null` aussi tant que la table n'existe pas.
 */
export async function loadExternalReference(_db: Database, site: Pick<Site, "id" | "theme">): Promise<ExternalReference | null> {
  if (!activeExternalSite(site.theme)) return null;
  return pending();
}

/** Tâche planifiée : relit les sites connectés dont la dernière lecture date. Bornée par passage. */
export async function refreshExternalSites(_db: Database, _deps: ExternalSiteDeps = {}): Promise<{ checked: number; changed: number; failed: number }> {
  return pending();
}
