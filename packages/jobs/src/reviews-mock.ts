/**
 * Avis Google factices pour la synchronisation en mode mock : un socle stable
 * par site + un avis supplémentaire toutes les deux semaines (déterministe),
 * pour simuler une fiche vivante. Remplacé par la Business Profile API quand
 * l'OAuth Google réel sera branché.
 */

import { mockReviewerAvatarDataUri } from "@theralys/providers/google";

export type MockReview = {
  sourceReviewId: string;
  authorName: string;
  authorPhotoUrl: string | null;
  rating: number;
  text: string;
  reviewedAt: Date;
};

const AUTHORS = [
  "Marie L.",
  "Thomas B.",
  "Sophie R.",
  "Julien M.",
  "Camille D.",
  "Nadia K.",
  "Pierre G.",
  "Élodie F.",
  "Hugo V.",
  "Anne-Claire P.",
  "Mathieu S.",
  "Laure T.",
];

const TEXTS: ((firstName: string, city: string) => string)[] = [
  (f) => `Un moment hors du temps. ${f} est à l'écoute et d'une grande douceur. Je recommande vivement !`,
  (f) => `Accueil chaleureux, cadre très apaisant. On sent tout de suite le professionnalisme de ${f}.`,
  () => "Une vraie parenthèse dans un quotidien bien chargé. Tout est pensé pour qu'on se sente bien.",
  (_f, c) => `Très belle découverte à ${c}. Séance personnalisée et un vrai relâchement à la clé.`,
  (f) => `Merci ${f} pour cette écoute et cette bienveillance. J'y retourne chaque mois.`,
  () => "Séance très professionnelle, explications claires, je suis repartie apaisée.",
  (_f, c) => `Le meilleur moment de ma semaine. Facile d'accès à ${c}, parking simple.`,
  (f) => `${f} sait immédiatement où travailler. Une écoute rare et précieuse.`,
  () => "Je dors beaucoup mieux depuis que j'ai commencé les séances. Merci !",
  () => "Cadre calme, lumière douce, accueil parfait : tout invite à la détente.",
  (f) => `Rendez-vous pris sur les conseils d'une amie — ${f} mérite sa réputation.`,
  () => "Ponctuel, à l'écoute, attentionné. Exactement ce que je cherchais.",
];

/** Époque de référence pour la croissance du nombre d'avis. */
const EPOCH = Date.UTC(2026, 0, 1);

export function generateMockReviews(opts: {
  siteId: string;
  firstName: string;
  city: string;
  now: Date;
}): MockReview[] {
  const baseCount = 5;
  const extraCount = Math.max(
    0,
    Math.floor((opts.now.getTime() - EPOCH) / (14 * 86_400_000)),
  );
  const count = Math.min(baseCount + extraCount, AUTHORS.length);
  const seed = hash(opts.siteId);

  return Array.from({ length: count }, (_, i) => {
    const author = AUTHORS[(seed + i) % AUTHORS.length]!;
    const text = TEXTS[(seed + i * 3) % TEXTS.length]!(opts.firstName, opts.city);
    // Les plus récents d'abord ; ratings majoritairement 5, quelques 4
    const rating = (seed + i) % 4 === 2 ? 4 : 5;
    const reviewedAt = new Date(opts.now.getTime() - (i + 1) * 11 * 86_400_000);
    return {
      sourceReviewId: `mock-${opts.siteId.slice(0, 8)}-${i}`,
      authorName: author,
      // Un avis sur deux avec photo, comme sur une vraie fiche
      authorPhotoUrl: (seed + i) % 2 === 0 ? mockReviewerAvatarDataUri(author) : null,
      rating,
      text,
      reviewedAt,
    };
  });
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}
