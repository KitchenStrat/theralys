import { z } from "zod";

/** Types d'événements du tracking maison (enum Postgres `analytics_event_type`). */
export const ANALYTICS_EVENT_TYPES = ["pageview", "rdv_click", "call_click"] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export const trackEventSchema = z.object({
  siteId: z.string().uuid(),
  type: z.enum(ANALYTICS_EVENT_TYPES),
  path: z.string().max(500).default("/"),
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
