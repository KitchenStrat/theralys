import { z } from "zod";

/** Types d'événements du tracking maison (enum Postgres `analytics_event_type`). */
export const ANALYTICS_EVENT_TYPES = ["pageview", "rdv_click", "call_click"] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

// Caractères de contrôle (C0 et DEL), écrits par leurs codes
const CONTROL_CHARS = new RegExp(`[${String.fromCharCode(0x00)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}]`);

export const trackEventSchema = z.object({
  siteId: z.string().uuid(),
  type: z.enum(ANALYTICS_EVENT_TYPES),
  /**
   * Chemin de la page. Sans caractère de contrôle : un navigateur les encode
   * toujours dans un chemin, et la base refuse le caractère nul dans un texte
   * (la visite fabriquée se soldait par une erreur 500).
   */
  path: z
    .string()
    .max(500)
    .refine((value) => !CONTROL_CHARS.test(value), "Chemin invalide")
    .default("/"),
  /**
   * `document.referrer` de la première page vue de la session (vide si
   * accès direct) ; absent sur les pages suivantes et les clics.
   */
  referrer: z.string().max(500).optional(),
  /**
   * Provenance : paramètre `src` du lien de bio (`?src=ig`) ou `ads` (annonce
   * Google) sur la première page vue ; `src` de session sur les clics (RDV, appel).
   */
  src: z.string().max(20).optional(),
});

export type TrackEventPayload = z.infer<typeof trackEventSchema>;
