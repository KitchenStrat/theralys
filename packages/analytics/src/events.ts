import { z } from "zod";

export const trackEventSchema = z.object({
  siteId: z.string().uuid(),
  type: z.enum(["pageview", "rdv_click", "call_click"]),
  path: z.string().max(500).default("/"),
  /**
   * `document.referrer` de la première page vue de la session (vide si
   * accès direct) ; absent sur les pages suivantes et les clics RDV.
   */
  referrer: z.string().max(500).optional(),
  /** Paramètre `src` du lien de bio (`?src=ig`), première page seulement. */
  src: z.string().max(20).optional(),
});

export type TrackEventPayload = z.infer<typeof trackEventSchema>;
