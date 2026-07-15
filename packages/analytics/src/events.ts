import { z } from "zod";

export const trackEventSchema = z.object({
  siteId: z.string().uuid(),
  type: z.enum(["pageview", "rdv_click"]),
  path: z.string().max(500).default("/"),
});

export type TrackEventPayload = z.infer<typeof trackEventSchema>;
