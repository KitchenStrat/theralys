/**
 * Profil du site internet d'un client (« site de référence », cf.
 * `@theralys/shared` external-site.ts) : à partir des pages lues et des faits
 * relevés, ce que le studio a compris du site — accroche, présentation,
 * spécialités, à propos, infos pratiques, déroulement, questions, contact.
 * Le texte des pages est une donnée, jamais une consigne.
 *
 * Contrat du module (implémentation à venir) : `createExternalProfileExtractor()`
 * rend l'extracteur réel (Anthropic) ou, en mode démonstration, un extracteur
 * déterministe sans appel à l'IA.
 */

import type { ExternalSiteFacts, ExternalSitePage, ExternalSiteProfile } from "@theralys/shared";
import type { AiMode } from "./generate-site";

export type ExternalProfileInput = {
  /** Adresse d'accueil du site (normalisée) */
  url: string;
  pages: ExternalSitePage[];
  facts: ExternalSiteFacts;
  /** Ce que le studio sait déjà du praticien (fiche), pour lever les ambiguïtés — jamais pour inventer */
  practitioner?: { name?: string | null; profession?: string | null; city?: string | null } | null;
};

export type ExternalProfileExtractor = {
  mode: AiMode;
  /** Profil nettoyé (`cleanExternalProfile`) : rien qui ne figure sur le site. */
  extract(input: ExternalProfileInput): Promise<ExternalSiteProfile>;
};

export function createExternalProfileExtractor(_env: NodeJS.ProcessEnv = process.env): ExternalProfileExtractor {
  throw new Error("Profil du site : implémentation à venir");
}
