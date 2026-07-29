/**
 * Générateur mock : produit un site français complet, crédible et déterministe,
 * sans appel API. Utilisé quand ANTHROPIC_API_KEY est absente ou AI_MOCK=1.
 */

import { slugify, type PageSections } from "@theralys/shared";
import { COMMON_FAQ, resolveProfession, type ProfessionSeed, type SpecialtySeed } from "./catalog";
import type {
  GeneratedArticle,
  GeneratedHome,
  GeneratedMotifPage,
  GeneratedReview,
  GenerationInput,
  MotifPlan,
} from "../types";

const FEM = (input: GenerationInput) => input.gender === "feminin";

function acc(input: GenerationInput, masculin: string, feminin: string): string {
  return FEM(input) ? feminin : masculin;
}

function fullName(input: GenerationInput): string {
  return `${input.firstName} ${input.lastName}`;
}

/** Spécialité issue d'un motif libre saisi dans le formulaire de démo. */
function specialtyFromMotif(motif: string, seed: ProfessionSeed): SpecialtySeed {
  return {
    title: motif.charAt(0).toUpperCase() + motif.slice(1),
    excerpt: `Un accompagnement dédié autour de « ${motif.toLowerCase()} », construit avec vous, à votre rythme.`,
    focus: motif.toLowerCase(),
    benefits: [
      "Un premier échange pour préciser vos attentes",
      "Des séances personnalisées et progressives",
      "Des repères simples à réutiliser au quotidien",
      `Toute l'expérience de ${seed.practiceName} à votre service`,
    ],
    faq: [],
  };
}

/**
 * Plan des spécialités : les motifs saisis à la création passent en premier,
 * le catalogue du métier complète, dans la limite de la formule.
 */
export function buildMotifPlan(input: GenerationInput): (MotifPlan & { seed: SpecialtySeed })[] {
  const professionSeed = resolveProfession(input.profession);
  const fromTags = input.highlightedMotifs.map((m) => specialtyFromMotif(m, professionSeed));
  const fromCatalog = professionSeed.specialties.filter(
    (s) => !fromTags.some((t) => slugify(t.title) === slugify(s.title)),
  );
  return [...fromTags, ...fromCatalog].slice(0, Math.max(0, input.motifPageCount)).map((seed) => ({
    slug: slugify(seed.title),
    title: seed.title,
    excerpt: seed.excerpt,
    seed,
  }));
}

export function mockGenerateHome(input: GenerationInput): GeneratedHome {
  const seed = resolveProfession(input.profession);
  const name = fullName(input);
  const motifs = buildMotifPlan(input);
  const practitioner = seed.practitionerLabel[input.gender];
  const siteName = `${name}, ${practitioner} à ${input.city}`;
  const hasGoogle = Boolean(input.googleEnrichment?.rating);

  const sections: PageSections = [
    {
      type: "hero",
      badge: `${input.profession} à ${input.city}`,
      title: `Un espace pour relâcher le corps et apaiser le mental à ${input.city}.`,
      paragraphs: [
        `Je vous accompagne pour **sortir du stress et des tensions du quotidien**, et retrouver un corps détendu et un mental apaisé.`,
        `Un rythme trop soutenu, des tensions qui s'accumulent ? Grâce à ${seed.practiceName}, je vous aide à **dénouer ce qui pèse** et à retrouver une profonde sérénité.`,
        `Je vous accueille sur rendez-vous à ${input.city}, dans un cadre calme et propice au lâcher-prise.`,
      ],
      showGoogleRating: hasGoogle,
      ctaLabel: "Prendre Rendez-Vous",
    },
    {
      type: "specialties",
      title: "Mes spécialités",
      intro: `Chaque séance est construite avec vous, selon vos besoins du moment. Voici les accompagnements que je propose à ${input.city}.`,
      items: motifs.map(({ slug, title, excerpt }) => ({ slug, title, excerpt })),
    },
    {
      type: "about",
      title: `À propos de ${input.firstName}`,
      paragraphs: [
        `${acc(input, "Praticien", "Praticienne")} ${acc(input, "passionné", "passionnée")} et ${acc(input, "formé", "formée")} aux différentes approches de ${seed.practiceName}, j'ai à cœur d'offrir à chacun un accompagnement respectueux, à l'écoute et sans jugement.`,
        `Mon approche : ${seed.heroTagline.toLowerCase()}. Chaque personne est unique — c'est pourquoi je prends le temps, à chaque séance, de comprendre où vous en êtes et ce dont vous avez besoin.`,
        `Vous recevoir à ${input.city}, c'est vous offrir une parenthèse : **un lieu calme, une écoute attentive** et des pratiques choisies pour vous.`,
        `✅ ${acc(input, "Formé", "Formée")} et ${acc(input, "certifié", "certifiée")} en ${seed.practiceName}\n✅ Accompagnement personnalisé, à votre rythme\n✅ Cadre bienveillant et confidentiel à ${input.city}`,
      ],
    },
    {
      type: "reviews",
      title: "Ils m'ont fait confiance",
      intro: hasGoogle
        ? `Les avis ci-dessous proviennent de la fiche Google de ${name}.`
        : undefined,
    },
    {
      type: "process",
      title: "Le déroulement d'une séance",
      steps: [
        {
          title: "Un temps d'échange",
          description:
            "Nous faisons le point ensemble : votre quotidien, vos attentes, ce qui vous amène aujourd'hui. Ce moment oriente toute la séance.",
        },
        {
          title: "La séance",
          description: `Installé(e) confortablement, vous profitez d'un accompagnement centré sur ${motifs[0]?.seed.focus ?? "votre détente"}, ajusté en continu à votre confort.`,
        },
        {
          title: "Le retour au calme",
          description:
            "La séance se termine en douceur. Nous prenons un moment pour échanger sur votre ressenti, sans jamais rien forcer.",
        },
        {
          title: "Des repères pour la suite",
          description:
            "Vous repartez avec des repères simples à refaire chez vous. Si vous le souhaitez, nous définissons ensemble le rythme qui vous convient.",
        },
      ],
    },
    {
      type: "faq",
      title: "Questions fréquentes",
      items: [
        ...COMMON_FAQ(seed.practiceName),
        {
          question: "Combien de temps dure une séance ?",
          answer:
            "Comptez environ une heure : un temps d'échange, la séance elle-même, puis un moment pour votre ressenti. La première séance est souvent un peu plus longue.",
        },
        {
          question: "Combien de séances sont nécessaires ?",
          answer:
            "Tout dépend de vous et de vos objectifs. Certaines personnes viennent ponctuellement pour un moment de détente, d'autres préfèrent un accompagnement régulier. Nous en parlons ensemble, sans engagement.",
        },
        {
          question: "À qui s'adressent les séances ?",
          answer:
            "À toute personne qui souhaite s'accorder un moment pour elle : enfants, adolescents, adultes et seniors. Le déroulé et la durée s'ajustent à l'âge et aux besoins de chacun.",
        },
        {
          question: "Comment se passe le règlement ?",
          answer:
            "Le règlement se fait à la fin de la séance, en espèces ou par carte selon votre préférence. Certaines mutuelles proposent un forfait bien-être : renseignez-vous auprès de la vôtre.",
        },
      ],
    },
    {
      type: "contact",
      title: "Me contacter",
      address: input.googleEnrichment?.address ?? `${input.city}`,
      note: "Parking facile et gratuit",
    },
  ];

  return {
    siteName,
    metaTitle: `${input.profession} à ${input.city} — ${name}`,
    metaDescription: `${name}, ${practitioner} à ${input.city}. ${seed.heroTagline}. Prise de rendez-vous en ligne.`,
    sections,
    motifsPlan: motifs.map(({ slug, title, excerpt }) => ({ slug, title, excerpt })),
    theme: { preset: seed.themePreset, fontPreset: "chaleureux" },
  };
}

export function mockGenerateMotifPage(
  input: GenerationInput,
  motif: MotifPlan,
): GeneratedMotifPage {
  const seed = resolveProfession(input.profession);
  const spec =
    seed.specialties.find((s) => slugify(s.title) === motif.slug) ??
    specialtyFromMotif(motif.title, seed);

  const body = [
    `## Pourquoi choisir ${spec.title.toLowerCase()} ?`,
    "",
    `Entre les obligations professionnelles, la famille et un rythme qui s'accélère, le corps finit par accumuler ce que le mental ne peut plus porter. ${capitalize(seed.practiceName)} offre un espace pour déposer tout cela, et cette séance dédiée à ${spec.focus} en est l'une des plus belles portes d'entrée.`,
    "",
    `À ${input.city}, je vous accueille dans un cadre pensé pour le calme : lumière douce, silence, aucune sollicitation. Dès les premières minutes, vous sentez que ce temps vous appartient.`,
    "",
    `## Ce que cette séance peut vous apporter`,
    "",
    ...spec.benefits.map((b) => `- ${b}`),
    "",
    `Chaque séance s'adapte à votre état du jour : nous prenons toujours quelques minutes en début de rendez-vous pour ajuster ensemble le déroulé.`,
    "",
    `## À qui s'adresse cet accompagnement ?`,
    "",
    `À toute personne qui souhaite prendre soin d'elle et accorder une vraie place à ${spec.focus} dans son quotidien. Il n'y a aucun prérequis : chacun est ${acc(input, "accueilli", "accueillie")} là où il en est, à son rythme.`,
    "",
    `Cette pratique de bien-être ne se substitue ni à un avis médical ni à un suivi par un professionnel de santé : elle s'inscrit en complément, pour votre détente et votre équilibre.`,
  ].join("\n");

  const sections: PageSections = [
    {
      type: "hero",
      badge: `${input.profession} à ${input.city}`,
      title: `${spec.title} à ${input.city}`,
      paragraphs: [spec.excerpt],
      ctaLabel: "Prendre Rendez-Vous",
    },
    { type: "richText", body },
    {
      type: "faq",
      title: "Vos questions sur cette séance",
      items: [...spec.faq, ...COMMON_FAQ(seed.practiceName).slice(0, 2)],
    },
    {
      type: "cta",
      title: `Envie d'essayer ${spec.title.toLowerCase()} ?`,
      body: `Je vous accueille à ${input.city} sur rendez-vous. Réservez votre séance en quelques clics.`,
      buttonLabel: "Prendre Rendez-Vous",
    },
  ];

  return {
    slug: motif.slug,
    title: spec.title,
    metaTitle: `${spec.title} à ${input.city} — ${fullName(input)}`,
    metaDescription: spec.excerpt,
    sections,
  };
}

const REVIEW_TEMPLATES: { authorName: string; rating: number; text: (i: GenerationInput) => string }[] = [
  {
    authorName: "Marie L.",
    rating: 5,
    text: (i) =>
      `Un moment hors du temps. ${i.firstName} est à l'écoute et d'une grande douceur. Je suis ressortie détendue comme rarement. Je recommande vivement !`,
  },
  {
    authorName: "Thomas B.",
    rating: 5,
    text: (i) =>
      `Accueil chaleureux, cadre très apaisant. On sent tout de suite le professionnalisme de ${i.firstName}. J'y retourne chaque mois.`,
  },
  {
    authorName: "Sophie R.",
    rating: 5,
    text: () =>
      "Une vraie parenthèse dans un quotidien bien chargé. Tout est pensé pour qu'on se sente bien, du début à la fin de la séance.",
  },
  {
    authorName: "Julien M.",
    rating: 4,
    text: (i) =>
      `Très belle découverte à ${i.city}. Séance personnalisée, explications claires, et un vrai relâchement à la clé.`,
  },
  {
    authorName: "Camille D.",
    rating: 5,
    text: (i) =>
      `Je cherchais un moment pour souffler, j'ai trouvé bien plus. Merci ${i.firstName} pour cette écoute et cette bienveillance.`,
  },
];

export function mockGenerateReviews(input: GenerationInput): GeneratedReview[] {
  return REVIEW_TEMPLATES.map((t) => ({
    authorName: t.authorName,
    rating: t.rating,
    text: t.text(input),
  }));
}

export function mockGenerateArticles(
  input: GenerationInput,
  motifs: MotifPlan[],
): GeneratedArticle[] {
  const seed = resolveProfession(input.profession);
  const picks = motifs.slice(0, 3);
  const templates = [
    (m: MotifPlan) => ({
      title: `${m.title} à ${input.city} : à quoi s'attendre lors d'une première séance ?`,
      intro: `Vous envisagez de pousser la porte d'un cabinet pour découvrir ${m.title.toLowerCase()}, mais vous ne savez pas vraiment à quoi vous attendre ? C'est tout à fait normal — et c'est justement l'objet de cet article.`,
    }),
    (m: MotifPlan) => ({
      title: `Corps tendu, esprit qui tourne en boucle : et si vous testiez ${m.title.toLowerCase()} ?`,
      intro: `Les épaules qui remontent, la mâchoire serrée, les pensées qui s'enchaînent sans pause… Ces signaux, nous les connaissons tous. Voici comment ${m.title.toLowerCase()} peut vous aider à relâcher la pression.`,
    }),
    (m: MotifPlan) => ({
      title: `5 gestes simples pour prolonger les bienfaits de votre séance de ${m.title.toLowerCase()}`,
      intro: `Une séance fait beaucoup — mais ce que vous faites entre les séances compte tout autant. Voici cinq habitudes toutes simples pour faire durer cette sensation de détente.`,
    }),
  ];

  return picks.map((motif, idx) => {
    const template = templates[idx % templates.length]!(motif);
    const content = [
      template.intro,
      "",
      `## Un moment pour vous, avant tout`,
      "",
      `Dans un quotidien où tout va vite, s'accorder une vraie pause est devenu un luxe. À ${input.city}, de plus en plus de personnes choisissent ${seed.practiceName} pour retrouver un équilibre entre corps et esprit. Le principe est simple : un cadre calme, une écoute attentive, et des pratiques ajustées à ce que vous vivez.`,
      "",
      `## Comment cela se passe concrètement`,
      "",
      `Chaque rendez-vous commence par un temps d'échange : où en êtes-vous, qu'est-ce qui pèse en ce moment, qu'attendez-vous de la séance ? Ensuite vient le temps de la pratique, centré sur ${picks[idx]?.excerpt.toLowerCase() ?? "votre détente"}`,
      "",
      `La séance se termine toujours par un retour au calme en douceur, et quelques repères à emporter chez vous : une respiration, une posture, un rituel du soir.`,
      "",
      `## Trois repères à retenir`,
      "",
      `1. **Venez comme vous êtes** : aucune préparation n'est nécessaire, une tenue confortable suffit.`,
      `2. **Écoutez votre rythme** : les effets d'une séance se déploient souvent dans les heures qui suivent — accordez-vous une fin de journée tranquille.`,
      `3. **La régularité fait la différence** : comme pour toute pratique de bien-être, c'est la répétition qui installe durablement la détente.`,
      "",
      `## En pratique à ${input.city}`,
      "",
      `Je vous accueille sur rendez-vous à ${input.city}, dans un cadre calme et chaleureux. Chaque accompagnement est personnalisé : nous construisons ensemble la séance qui vous convient.`,
      "",
      `*Cette pratique de bien-être ne se substitue ni à un avis médical ni à un suivi par un professionnel de santé.*`,
    ].join("\n");

    return {
      title: template.title,
      slug: slugify(template.title),
      excerpt: template.intro,
      content,
      motifSlug: motif.slug,
    };
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
