/**
 * Moteur éditorial — planification pure (sans DB, testée unitairement).
 * Le calendrier de sujets est généré automatiquement à partir des pages de
 * spécialités + la ville (maillage SEO local), à la cadence de la formule :
 * Boost 2/semaine (lun, jeu) · Scale 4/semaine (lun, mar, jeu, ven).
 */

import type { PlanId } from "@theralys/db";

export type MotifRef = { slug: string; title: string };

export type PlannedTopic = {
  /** Date de publication prévue (ISO yyyy-mm-dd) */
  scheduledFor: string;
  topic: string;
  motifSlug: string | null;
};

/** Jours de publication par formule (1 = lundi … 7 = dimanche). */
export function cadenceDays(plan: PlanId): number[] {
  switch (plan) {
    case "boost":
      return [1, 4];
    case "scale":
      return [1, 2, 4, 5];
    default:
      return [];
  }
}

/** Accroches « problème du quotidien » (croisées avec les spécialités). */
const HOOKS = [
  "Corps dispersé, esprit épuisé",
  "Nuque bloquée au réveil",
  "Dos noué après une journée assise",
  "Courbatures qui s'éternisent après le sport",
  "Sommeil léger et réveils nocturnes",
  "Mâchoires serrées et dents qui grincent",
  "Ventre noué et digestion capricieuse",
  "Jambes lourdes en fin de journée",
  "Épaules qui remontent, souffle court",
  "Énergie en berne dès le matin",
  "Pensées qui tournent en boucle le soir",
  "Pieds fatigués et douloureux",
];

const ANGLES = [
  "à quoi s'attendre lors d'une première séance",
  "une pause qui change la semaine",
  "ce qu'il faut savoir avant de venir",
  "le bon réflexe avant la belle saison",
];

/**
 * Produit les sujets manquants entre `from` (exclus si déjà planifié) et
 * `from + horizonWeeks`. Déterministe, sans doublon de date avec `existingDates`.
 */
export function planEditorialTopics(opts: {
  motifs: MotifRef[];
  city: string;
  plan: PlanId;
  from: Date;
  horizonWeeks: number;
  existingDates: Set<string>;
  /** Sujets déjà planifiés/publiés (évite les répétitions entre lots) */
  existingTopics?: Set<string>;
}): PlannedTopic[] {
  const days = cadenceDays(opts.plan);
  if (days.length === 0 || opts.motifs.length === 0) return [];

  const result: PlannedTopic[] = [];
  const usedTopics = new Set<string>(opts.existingTopics ?? []);
  const start = startOfDayUtc(opts.from);
  const end = addDays(start, opts.horizonWeeks * 7);

  let slot = dateSeed(start, opts.city);
  for (let day = start; day < end; day = addDays(day, 1)) {
    const isoWeekday = ((day.getUTCDay() + 6) % 7) + 1;
    if (!days.includes(isoWeekday)) continue;
    const iso = day.toISOString().slice(0, 10);
    if (opts.existingDates.has(iso)) continue;

    // Avance jusqu'à un sujet encore inédit dans l'horizon (borné)
    let motif = opts.motifs[slot % opts.motifs.length]!;
    let topic = topicFor(slot, motif, opts.city);
    for (let tries = 0; usedTopics.has(topic) && tries < 200; tries++) {
      slot++;
      motif = opts.motifs[slot % opts.motifs.length]!;
      topic = topicFor(slot, motif, opts.city);
    }
    if (usedTopics.has(topic)) topic = `${topic} (${iso})`;

    usedTopics.add(topic);
    result.push({ scheduledFor: iso, topic, motifSlug: motif.slug });
    slot++;
  }
  return result;
}

function topicFor(slot: number, motif: MotifRef, city: string): string {
  return slot % 3 === 2
    ? `${motif.title} à ${city} : ${ANGLES[Math.floor(slot / 3) % ANGLES.length]}`
    : `${HOOKS[slot % HOOKS.length]} : ce que ${lowerFirst(motif.title)} peut changer`;
}

/** Point de départ déterministe pour varier hooks/motifs d'un site à l'autre. */
function dateSeed(start: Date, city: string): number {
  let hash = 0;
  const key = `${start.toISOString().slice(0, 10)}:${city}`;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(hash) % 1000;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function startOfDayUtc(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
