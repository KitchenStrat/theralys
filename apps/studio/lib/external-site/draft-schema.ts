/**
 * Forme des formulaires de rubrique reçus du navigateur par l'action
 * d'enregistrement de l'écran « Mon site ». Ce module ne vérifie que la
 * forme (types, tailles raisonnables) : le fond est contrôlé ensuite par
 * `checkRubricDraft`, puis nettoyé par le contrat. Réservé au serveur (les
 * formulaires, eux, n'ont pas besoin de zod).
 */

import { z } from "zod";
import { SOCIAL_NETWORKS, type RubricDrafts, type RubricId, type SocialNetworkKey } from "./rubrics";

// Bornes larges : elles n'écartent que l'envoi démesuré, les vraies limites sont celles du contrat
const text = z.string().max(4000);
const uid = z.string().min(1).max(40);
const lines = <T extends z.ZodTypeAny>(item: T) => z.array(item).max(40);

const textDraft = z.object({ uid, text });
const pairDraft = z.object({ uid, first: text, second: text });
const pairs = z.object({ items: lines(pairDraft) });

const SCHEMAS: { [R in RubricId]: z.ZodType<RubricDrafts[R]> } = {
  presentation: z.object({ headline: text, intro: lines(textDraft), highlights: lines(pairDraft) }),
  specialties: z.object({ items: lines(z.object({ uid, slug: z.string().max(200).nullable(), title: text, excerpt: text, url: text })) }),
  about: z.object({ paragraphs: lines(textDraft), credentials: lines(textDraft) }),
  practical: pairs,
  process: pairs,
  faq: pairs,
  contact: z.object({ address: text, phone: text, email: text, note: text, hours: lines(pairDraft) }),
  booking: z.object({ link: text }),
  social: z.object({
    links: z.object(Object.fromEntries(SOCIAL_NETWORKS.map((network) => [network.key, text])) as Record<SocialNetworkKey, typeof text>),
  }),
};

/** Formulaire de la rubrique, tel que `checkRubricDraft` l'attend, ou `null` si ce qui est reçu n'en a pas la forme. */
export function parseRubricDraft<R extends RubricId>(rubric: R, value: unknown): RubricDrafts[R] | null {
  const parsed = SCHEMAS[rubric].safeParse(value);
  return parsed.success ? parsed.data : null;
}
