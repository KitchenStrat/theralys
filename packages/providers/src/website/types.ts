/**
 * Contrat public du lecteur de site (réexporté par `index.ts`). Rangé à part
 * pour que le lecteur réel et le lecteur de démonstration le partagent sans
 * dépendre l'un de l'autre.
 */

import type { ExternalReadOutcome } from "@theralys/shared";

export type WebsiteReadOptions = {
  /** Pages lues au plus (défaut et plafond : EXTERNAL_SITE_LIMITS.maxPages) */
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
