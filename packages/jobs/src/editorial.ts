/**
 * Moteur éditorial — planification pure (sans DB, testée unitairement).
 * Le calendrier de sujets est généré automatiquement à partir des
 * spécialités du praticien + la ville (maillage SEO local), à la cadence de
 * la formule Site : 4/semaine (lun, mar, jeu, ven). Sans la formule Site, pas de blog.
 *
 * Les spécialités sont les pages de spécialité du site hébergé ou, quand le
 * site du client est la référence des outils, celles de son propre site
 * (`externalSpecialties`) : l'appelant choisit (`ticks.ts`), le moteur ne
 * fait pas la différence. Les articles restent publiés sur le blog hébergé.
 */

import { hasBlog, type BlogTheme, type PlanId } from "@theralys/db";

/** Spécialité dont le blog tire ses sujets : identifiant stable et titre. */
export type MotifRef = { slug: string; title: string };

export type PlannedTopic = {
  /** Date de publication prévue (ISO yyyy-mm-dd) */
  scheduledFor: string;
  topic: string;
  motifSlug: string | null;
};

/**
 * Jours de publication (1 = lundi … 7 = dimanche) : le blog fait partie de la
 * formule Site. Avec elle, 4 articles par semaine (lun, mar, jeu, ven) ; sans
 * elle (formule Scale seule), aucun.
 */
export function cadenceDays(plan: PlanId): number[] {
  return hasBlog(plan) ? [1, 2, 4, 5] : [];
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
 * Prolongements d'un sujet, quand toutes les combinaisons d'une spécialité
 * ont servi : le même sujet sous un nouvel angle. Un titre montré au client
 * ne porte jamais de date.
 */
const VARIANTS = [
  "les idées reçues",
  "les questions les plus fréquentes",
  "par où commencer",
  "les erreurs à éviter",
  "ce qui évolue au fil des séances",
  "les bons réflexes au quotidien",
  "comment s'y préparer",
  "ce que l'on ressent après la séance",
  "pour qui, et à quel moment",
  "trois repères pour s'y retrouver",
];

/** Dernier recours (toutes les combinaisons et tous les prolongements ont servi) : volets numérotés, bornés. */
const MAX_VOLETS = 500;

/**
 * Nombre de sujets distincts qu'une spécialité (ou une thématique) fournit
 * avant tout prolongement : une par accroche, une par angle.
 */
export const TOPICS_PER_SPECIALTY = HOOKS.length + ANGLES.length;

/** Ce dont un sujet parle : une spécialité du praticien, ou une thématique du wizard. */
type Subject = {
  motifSlug: string | null;
  /** Sujet « problème du quotidien » pour une accroche */
  hookTopic: (hook: string) => string;
  /** Sujet « spécialité à <ville> » pour un angle */
  angleTopic: (angle: string) => string;
};

/**
 * Produit les sujets manquants entre `from` (exclus si déjà planifié) et
 * `from + horizonWeeks`. Déterministe, sans doublon de date avec `existingDates`.
 *
 * Spécialité, accroche et angle avancent chacun de leur côté : pour la
 * spécialité du créneau, toutes les accroches et tous les angles sont essayés
 * avant de se répéter — le produit entier (TOPICS_PER_SPECIALTY sujets par
 * spécialité) est couvert. Ensuite seulement, le sujet revient sous un nouvel
 * angle (`VARIANTS`), puis en volets numérotés : jamais avec une date.
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
  /**
   * Thématiques du wizard (étapes 2-3). Si présentes, elles pilotent les
   * sujets, pondérées par leur répartition mensuelle ; sinon repli sur les
   * pages de motifs.
   */
  themes?: BlogTheme[];
}): PlannedTopic[] {
  const days = cadenceDays(opts.plan);
  // Cycle pondéré des thématiques : chaque libellé apparaît `perMonth` fois.
  const themeCycle = (opts.themes ?? [])
    .filter((t) => t.label.trim().length > 0 && t.perMonth > 0)
    .flatMap((t) => Array<string>(Math.min(t.perMonth, 30)).fill(t.label.trim()));
  if (days.length === 0 || (opts.motifs.length === 0 && themeCycle.length === 0)) return [];

  const motifSubjects = opts.motifs.map((motif) => motifSubject(motif, opts.city));
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

    // Thématiques : celle du créneau fait foi (répartition choisie par le praticien). Spécialités : celle du
    // créneau d'abord, puis les autres — aucun prolongement tant qu'une spécialité garde une combinaison libre.
    const candidates =
      themeCycle.length > 0
        ? [themeSubject(themeCycle[slot % themeCycle.length]!, opts.motifs, opts.city)]
        : motifSubjects.map((_, i) => motifSubjects[(slot + i) % motifSubjects.length]!);
    let choice: { topic: string; motifSlug: string | null; tier: number } | null = null;
    for (const subject of candidates) {
      const free = freeTopic(subject, slot, usedTopics);
      if (!choice || free.tier < choice.tier) choice = { ...free, motifSlug: subject.motifSlug };
      if (choice.tier === 0) break;
    }

    usedTopics.add(choice!.topic);
    result.push({ scheduledFor: iso, topic: choice!.topic, motifSlug: choice!.motifSlug });
    slot++;
  }
  return result;
}

/**
 * Premier sujet encore inédit pour ce dont parle le créneau. `tier` : 0 une
 * combinaison jamais servie, 1 un sujet repris sous un nouvel angle, 2 un
 * volet numéroté. Deux sujets sur trois partent d'une accroche, le troisième
 * d'un angle ; quand une famille est épuisée, l'autre prend le relais.
 */
function freeTopic(subject: Subject, slot: number, used: Set<string>): { topic: string; tier: number } {
  const hooks = HOOKS.map((_, j) => subject.hookTopic(HOOKS[(slot + j) % HOOKS.length]!));
  const angles = ANGLES.map((_, j) => subject.angleTopic(ANGLES[(Math.floor(slot / 3) + j) % ANGLES.length]!));
  const bases = slot % 3 === 2 ? [...angles, ...hooks] : [...hooks, ...angles];

  for (const base of bases) if (!used.has(base)) return { topic: base, tier: 0 };
  for (let v = 0; v < VARIANTS.length; v++) {
    const variant = VARIANTS[(slot + v) % VARIANTS.length]!;
    for (const base of bases) {
      const topic = `${base} — ${variant}`;
      if (!used.has(topic)) return { topic, tier: 1 };
    }
  }
  for (let volet = 2; volet <= MAX_VOLETS; volet++) {
    for (const base of bases) {
      const topic = `${base} — volet ${volet}`;
      if (!used.has(topic)) return { topic, tier: 2 };
    }
  }
  return { topic: `${bases[0]!} — volet ${MAX_VOLETS + 1}`, tier: 2 };
}

function motifSubject(motif: MotifRef, city: string): Subject {
  return {
    motifSlug: motif.slug,
    hookTopic: (hook) => `${hook} : ce que ${lowerFirst(motif.title)} peut changer`,
    angleTopic: (angle) => `${motif.title} à ${city} : ${angle}`,
  };
}

/** Sujet piloté par une thématique du wizard, rattaché à la spécialité qui porte son nom s'il y en a une. */
function themeSubject(theme: string, motifs: MotifRef[], city: string): Subject {
  const motif = motifs.find((m) => m.title.toLowerCase() === theme.toLowerCase());
  return {
    motifSlug: motif?.slug ?? null,
    hookTopic: (hook) => `${hook} : ${lowerFirst(theme)}`,
    angleTopic: (angle) => `${capitalizeFirst(theme)} à ${city} : ${angle}`,
  };
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
