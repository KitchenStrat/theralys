/**
 * Catalogue de spécialités par métier pour le mode mock (et pour guider la
 * génération réelle). Tout le vocabulaire respecte les règles de marketing
 * éthique : bien-être, accompagnement, détente — jamais de promesse médicale.
 */

export type SpecialtySeed = {
  title: string;
  excerpt: string;
  /** Mots-clés d'ambiance réutilisés dans les corps de texte */
  focus: string;
  benefits: string[];
  faq: { question: string; answer: string }[];
};

export type ProfessionSeed = {
  /** Nom de la pratique, ex. « la sophrologie » */
  practiceName: string;
  /** ex. « sophrologue » au féminin/masculin */
  practitionerLabel: { feminin: string; masculin: string };
  heroTagline: string;
  themePreset: "terracotta" | "sauge" | "ocean" | "lavande" | "ambre";
  specialties: SpecialtySeed[];
};

export const COMMON_FAQ = (practice: string): { question: string; answer: string }[] => [
  {
    question: "Comment se déroule la première séance ?",
    answer:
      "Nous commençons par un temps d'échange pour comprendre vos attentes et votre quotidien. La séance se poursuit ensuite à votre rythme, dans un cadre calme et bienveillant. Vous repartez avec des repères simples à réutiliser chez vous.",
  },
  {
    question: "Faut-il une préparation particulière ?",
    answer:
      "Aucune préparation n'est nécessaire. Venez simplement dans une tenue confortable, avec l'envie de vous accorder un moment pour vous.",
  },
  {
    question: `${capitalize(practice)} remplace-t-elle un suivi médical ?`,
    answer:
      "Non. Cette pratique de bien-être ne se substitue ni à un avis médical ni à un suivi par un professionnel de santé. Elle s'inscrit en complément, pour votre détente et votre équilibre au quotidien.",
  },
];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function specialty(
  title: string,
  excerpt: string,
  focus: string,
  benefits: string[],
  extraFaq: { question: string; answer: string }[] = [],
): SpecialtySeed {
  return { title, excerpt, focus, benefits, faq: extraFaq };
}

export const PROFESSIONS: Record<string, ProfessionSeed> = {
  sophrologue: {
    practiceName: "la sophrologie",
    practitionerLabel: { feminin: "sophrologue", masculin: "sophrologue" },
    heroTagline: "Respirer, relâcher, retrouver votre équilibre intérieur",
    themePreset: "lavande",
    specialties: [
      specialty(
        "Gestion du stress",
        "Des outils concrets de respiration et de relâchement pour apaiser les tensions du quotidien.",
        "la respiration et le relâchement des tensions",
        [
          "Des exercices de respiration simples, réutilisables partout",
          "Un temps pour soi, loin des sollicitations",
          "Des repères concrets pour les périodes chargées",
          "Une pratique progressive, adaptée à votre rythme",
        ],
      ),
      specialty(
        "Sommeil et récupération",
        "Préparer le corps et l'esprit à un repos de meilleure qualité, soir après soir.",
        "la préparation au repos et la récupération",
        [
          "Un rituel du soir simple à installer",
          "Des visualisations pour apaiser le mental",
          "Un travail sur les rythmes de la journée",
          "Des séances douces, allongé ou assis",
        ],
      ),
      specialty(
        "Confiance en soi",
        "Renforcer vos ressources intérieures et aborder les situations importantes avec plus de sérénité.",
        "les ressources intérieures et l'ancrage",
        [
          "Des exercices d'ancrage et de posture",
          "Un travail sur le regard que vous portez sur vous",
          "Des mises en situation progressives",
          "Un accompagnement bienveillant, sans jugement",
        ],
      ),
      specialty(
        "Préparation mentale",
        "Examens, prise de parole, compétition : arriver préparé, concentré et disponible le jour J.",
        "la concentration et la visualisation positive",
        [
          "Des techniques de visualisation éprouvées",
          "Un travail sur la concentration et l'attention",
          "La répétition mentale des échéances importantes",
          "Des outils à mobiliser le jour J",
        ],
      ),
      specialty(
        "Accompagnement périnatal",
        "Vivre la grossesse et l'arrivée de bébé avec plus de calme, en lien avec votre corps.",
        "l'écoute du corps pendant la grossesse",
        [
          "Des séances douces adaptées à chaque trimestre",
          "Un temps d'écoute du corps qui change",
          "Des respirations utiles pour le grand jour",
          "Un espace pour déposer ce qui pèse",
        ],
      ),
      specialty(
        "Enfants et adolescents",
        "Des séances ludiques et courtes pour apprendre tôt à écouter ses émotions.",
        "l'écoute des émotions par le jeu",
        [
          "Des exercices ludiques et imagés",
          "Des séances courtes, adaptées à l'âge",
          "Des outils pour la concentration à l'école",
          "Un lien de confiance avec l'enfant",
        ],
      ),
    ],
  },
  massage: {
    practiceName: "le massage bien-être",
    practitionerLabel: { feminin: "praticienne en massages bien-être", masculin: "praticien en massages bien-être" },
    heroTagline: "Un espace pour relâcher le corps et apaiser le mental",
    themePreset: "terracotta",
    specialties: [
      specialty(
        "Massage bien-être sur mesure",
        "Un massage composé avec vous, selon vos envies et les zones à relâcher ce jour-là.",
        "l'écoute du corps et la personnalisation",
        [
          "Un échange en début de séance pour cibler vos besoins",
          "Des manœuvres adaptées à votre sensibilité",
          "Une pression ajustée en continu",
          "Un moment entièrement dédié à votre détente",
        ],
      ),
      specialty(
        "Massage ayurvédique",
        "Inspiré de la tradition indienne : des huiles chaudes et des gestes enveloppants pour une détente profonde.",
        "la tradition ayurvédique et les huiles chaudes",
        [
          "Des huiles chaudes choisies avec attention",
          "Des gestes amples et enveloppants",
          "Une invitation au lâcher-prise profond",
          "Un rituel hérité d'une longue tradition",
        ],
      ),
      specialty(
        "Massage sportif",
        "Avant ou après l'effort : préparer les muscles, accompagner la récupération, relâcher les zones sollicitées.",
        "la préparation et la récupération musculaire",
        [
          "Un travail ciblé sur les zones sollicitées",
          "Des manœuvres toniques et précises",
          "Un accompagnement avant ou après l'effort",
          "Des conseils simples pour prolonger les effets",
        ],
      ),
      specialty(
        "Réflexologie plantaire",
        "Par des pressions douces sur les pieds, inviter l'ensemble du corps à la détente.",
        "les zones réflexes et la détente globale",
        [
          "Des pressions douces et rythmées sous les pieds",
          "Une détente qui gagne tout le corps",
          "Une pratique idéale en fin de journée",
          "Un moment cocooning, installé confortablement",
        ],
      ),
      specialty(
        "Massage crânien et visage",
        "Tête, nuque, visage : dénouer les tensions accumulées et offrir une vraie pause au mental.",
        "le relâchement de la tête et de la nuque",
        [
          "Des gestes légers sur le cuir chevelu et le visage",
          "Un relâchement de la nuque et des mâchoires",
          "Une pause précieuse pour le mental",
          "Idéal en complément d'un massage du corps",
        ],
      ),
      specialty(
        "Drainage et jambes légères",
        "Des manœuvres douces et rythmées pour retrouver une sensation de légèreté.",
        "la légèreté et la circulation du bien-être",
        [
          "Des gestes doux, lents et rythmés",
          "Une sensation de légèreté retrouvée",
          "Un soin apprécié en période de chaleur",
          "Une attention particulière aux jambes fatiguées",
        ],
      ),
    ],
  },
  osteopathe: {
    practiceName: "l'ostéopathie",
    practitionerLabel: { feminin: "ostéopathe", masculin: "ostéopathe" },
    heroTagline: "Retrouver de l'aisance dans votre corps, à chaque étape de la vie",
    themePreset: "ocean",
    specialties: [
      specialty(
        "Ostéopathie du sport",
        "Accompagner les sportifs, du loisir à la compétition, pour préserver mobilité et confort.",
        "la mobilité et la préparation du corps",
        [
          "Un bilan complet de votre mobilité",
          "Un accompagnement avant et après les échéances",
          "Des conseils adaptés à votre discipline",
          "Un suivi pensé avec vos objectifs",
        ],
      ),
      specialty(
        "Femmes enceintes",
        "Un accompagnement doux du corps qui change, tout au long de la grossesse.",
        "le confort de la grossesse",
        [
          "Des techniques douces et adaptées",
          "Une attention au confort de chaque trimestre",
          "Un temps d'écoute dédié",
          "Une installation confortable et sécurisante",
        ],
      ),
      specialty(
        "Nourrissons et enfants",
        "Des gestes très doux pour accompagner les premiers mois et la croissance.",
        "la douceur et l'accompagnement de la croissance",
        [
          "Des manipulations extrêmement douces",
          "Un temps d'échange avec les parents",
          "Une approche respectueuse du rythme de l'enfant",
          "Un cadre rassurant pour toute la famille",
        ],
      ),
      specialty(
        "Confort au travail",
        "Postures prolongées, gestes répétitifs : redonner de la mobilité au corps qui travaille.",
        "les postures du quotidien professionnel",
        [
          "Un bilan des postures de votre quotidien",
          "Un travail sur les zones sur-sollicitées",
          "Des conseils d'installation à votre poste",
          "Des exercices simples entre les séances",
        ],
      ),
      specialty(
        "Seniors",
        "Entretenir la mobilité et l'aisance de mouvement pour continuer à faire ce que vous aimez.",
        "la mobilité au fil des années",
        [
          "Des techniques adaptées et progressives",
          "Une attention particulière à l'équilibre",
          "Un accompagnement respectueux du rythme de chacun",
          "Des séances pensées pour durer dans le temps",
        ],
      ),
      specialty(
        "Suivi régulier",
        "Un rendez-vous périodique pour entretenir votre confort et prévenir les tensions.",
        "l'entretien du confort au fil des saisons",
        [
          "Un point régulier sur votre confort",
          "Un travail d'entretien de la mobilité",
          "Une fréquence définie ensemble",
          "Une continuité dans l'accompagnement",
        ],
      ),
    ],
  },
  naturopathe: {
    practiceName: "la naturopathie",
    practitionerLabel: { feminin: "naturopathe", masculin: "naturopathe" },
    heroTagline: "Des habitudes simples et naturelles pour cultiver votre vitalité",
    themePreset: "sauge",
    specialties: [
      specialty(
        "Équilibre alimentaire",
        "Faire le point sur votre assiette et avancer par petits pas, sans frustration.",
        "l'assiette et les habitudes durables",
        [
          "Un bilan complet de vos habitudes",
          "Des ajustements progressifs et réalistes",
          "Des idées concrètes pour le quotidien",
          "Aucun régime : des repères durables",
        ],
      ),
      specialty(
        "Vitalité et énergie",
        "Comprendre ce qui pèse sur votre énergie et remettre du mouvement dans vos journées.",
        "l'hygiène de vie et l'énergie au quotidien",
        [
          "Un regard global sur votre hygiène de vie",
          "Des leviers simples : sommeil, mouvement, assiette",
          "Un plan d'action personnalisé",
          "Un suivi pour ancrer les nouvelles habitudes",
        ],
      ),
      specialty(
        "Sommeil et récupération",
        "Installer une routine du soir et des habitudes qui favorisent un repos de qualité.",
        "les rituels du soir et la récupération",
        [
          "Un bilan de vos rythmes actuels",
          "Une routine du soir personnalisée",
          "Des plantes et tisanes de confort, bien choisies",
          "Des repères pour les nuits difficiles",
        ],
      ),
      specialty(
        "Confort digestif",
        "Écouter votre digestion et adopter les habitudes qui lui font du bien.",
        "l'écoute de la digestion",
        [
          "Un point détaillé sur vos habitudes de table",
          "Des ajustements doux, testés pas à pas",
          "Une attention au rythme des repas",
          "Des recettes simples et gourmandes",
        ],
      ),
      specialty(
        "Gestion du stress au naturel",
        "Respiration, plantes de confort, hygiène de vie : une boîte à outils naturelle contre la pression.",
        "les outils naturels de détente",
        [
          "Des techniques de respiration accessibles",
          "Des plantes de bien-être choisies avec soin",
          "Un travail sur l'organisation des journées",
          "Des rituels courts pour les moments chargés",
        ],
      ),
      specialty(
        "Accompagnement de la femme",
        "Cycles, maternité, ménopause : accompagner chaque étape avec des approches naturelles et douces.",
        "les étapes de la vie hormonale",
        [
          "Une écoute attentive de chaque étape",
          "Des approches naturelles et personnalisées",
          "Un accompagnement dans la durée",
          "Un espace de parole bienveillant",
        ],
      ),
    ],
  },
  hypnotherapeute: {
    practiceName: "l'hypnose",
    practitionerLabel: { feminin: "hypnothérapeute", masculin: "hypnothérapeute" },
    heroTagline: "Mobiliser vos ressources intérieures pour avancer sereinement",
    themePreset: "lavande",
    specialties: [
      specialty(
        "Gestion du stress et des émotions",
        "Apprendre à accueillir ce qui se passe en vous et retrouver du calme intérieur.",
        "l'accueil des émotions",
        [
          "Un état de détente profonde et agréable",
          "Des suggestions positives personnalisées",
          "Des outils d'auto-hypnose à emporter",
          "Un accompagnement progressif",
        ],
      ),
      specialty(
        "Sommeil",
        "Préparer l'esprit au repos et retrouver des nuits plus paisibles.",
        "la préparation mentale au repos",
        [
          "Des inductions douces vers la détente",
          "Un rituel d'endormissement personnalisé",
          "Des enregistrements pour pratiquer chez vous",
          "Un travail sur les pensées du soir",
        ],
      ),
      specialty(
        "Confiance en soi",
        "Renouer avec vos capacités et aborder les défis avec plus d'assurance.",
        "les ressources et les réussites passées",
        [
          "Un travail sur vos réussites passées",
          "Des visualisations de situations à venir",
          "Un ancrage corporel de la confiance",
          "Des progrès mesurables séance après séance",
        ],
      ),
      specialty(
        "Accompagnement à l'arrêt du tabac",
        "Un accompagnement structuré pour changer votre relation à la cigarette.",
        "le changement d'habitude en profondeur",
        [
          "Un protocole en plusieurs séances",
          "Un travail sur les déclencheurs du quotidien",
          "Des suggestions adaptées à votre histoire",
          "Un suivi après la dernière cigarette",
        ],
      ),
      specialty(
        "Rapport à l'alimentation",
        "Réconcilier plaisir et écoute de soi, loin des injonctions et des régimes.",
        "l'écoute des vraies faims",
        [
          "Un travail sur les automatismes de table",
          "L'écoute retrouvée des signaux du corps",
          "Aucun interdit : de nouveaux repères",
          "Un accompagnement sans jugement",
        ],
      ),
      specialty(
        "Préparation mentale",
        "Examens, entretiens, compétitions : arriver disponible et concentré le jour venu.",
        "la répétition mentale du succès",
        [
          "La visualisation détaillée de l'échéance",
          "Des ancrages de calme et de concentration",
          "Un travail sur le dialogue intérieur",
          "Des techniques utilisables en autonomie",
        ],
      ),
    ],
  },
  reflexologue: {
    practiceName: "la réflexologie",
    practitionerLabel: { feminin: "réflexologue", masculin: "réflexologue" },
    heroTagline: "Par les pieds et les mains, inviter tout le corps à la détente",
    themePreset: "sauge",
    specialties: [
      specialty(
        "Réflexologie plantaire",
        "Des pressions précises sous les pieds pour une détente qui gagne tout le corps.",
        "les zones réflexes des pieds",
        [
          "Un toucher précis et adapté à votre sensibilité",
          "Une détente profonde dès les premières minutes",
          "Une pratique installée confortablement",
          "Un moment rien que pour vous",
        ],
      ),
      specialty(
        "Réflexologie palmaire",
        "Les mains aussi méritent leur pause : une approche douce, idéale en découverte.",
        "les mains et la détente accessible",
        [
          "Une approche douce et rassurante",
          "Idéale pour découvrir la réflexologie",
          "Un format court, facile à caler dans la journée",
          "Un bien-être immédiat des mains sollicitées",
        ],
      ),
      specialty(
        "Détente et stress",
        "Un protocole pensé pour relâcher la pression et retrouver du calme.",
        "le relâchement de la pression",
        [
          "Un protocole entièrement orienté détente",
          "Une respiration qui s'apaise naturellement",
          "Un cadre calme, sans sollicitations",
          "Des séances régulières pour un effet durable",
        ],
      ),
      specialty(
        "Sommeil",
        "En fin de journée, préparer le terrain d'un repos de meilleure qualité.",
        "la préparation au repos",
        [
          "Des séances de fin de journée privilégiées",
          "Un rythme lent et enveloppant",
          "Des zones de détente particulièrement travaillées",
          "Des conseils pour prolonger l'effet chez vous",
        ],
      ),
      specialty(
        "Confort digestif",
        "Un travail doux et ciblé pour accompagner votre confort au quotidien.",
        "l'accompagnement du confort quotidien",
        [
          "Des zones ciblées avec précision",
          "Un toucher doux et progressif",
          "Un moment de calme pour le corps",
          "Un accompagnement régulier possible",
        ],
      ),
      specialty(
        "Jambes légères",
        "Pieds et mollets fatigués : retrouver une sensation de légèreté.",
        "la légèreté des jambes",
        [
          "Une attention particulière aux pieds fatigués",
          "Des manœuvres douces vers la légèreté",
          "Un soin apprécié des personnes debout toute la journée",
          "Une sensation immédiate de repos",
        ],
      ),
    ],
  },
  reiki: {
    practiceName: "le reiki",
    practitionerLabel: { feminin: "praticienne reiki", masculin: "praticien reiki" },
    heroTagline: "Un moment de calme profond pour vous ressourcer",
    themePreset: "ambre",
    specialties: [
      specialty(
        "Séance de reiki traditionnel",
        "Par apposition des mains, un moment de calme profond et de ressourcement.",
        "l'apposition des mains et le calme",
        [
          "Une séance habillé, allongé confortablement",
          "Un toucher léger ou sans contact, selon votre préférence",
          "Un moment suspendu, hors du tumulte",
          "Un temps d'échange avant et après",
        ],
      ),
      specialty(
        "Harmonisation énergétique",
        "Rééquilibrer votre énergie et repartir plus léger, plus disponible.",
        "l'équilibre et la circulation de l'énergie",
        [
          "Un protocole complet de la tête aux pieds",
          "Une sensation d'apaisement durable",
          "Un cadre propice au lâcher-prise",
          "Une pratique douce, accessible à tous",
        ],
      ),
      specialty(
        "Gestion du stress",
        "Déposer la pression du quotidien et retrouver un espace intérieur de calme.",
        "le dépôt de la pression du quotidien",
        [
          "Un accueil bienveillant de ce que vous vivez",
          "Une détente qui s'installe naturellement",
          "Des séances régulières pour ancrer le calme",
          "Un espace sans jugement",
        ],
      ),
      specialty(
        "Accompagnement du sommeil",
        "Apaiser le mental en fin de journée pour favoriser un repos réparateur.",
        "l'apaisement du soir",
        [
          "Des séances de fin de journée conseillées",
          "Un apaisement propice au repos",
          "Des rituels simples à reproduire chez vous",
          "Un accompagnement dans la durée",
        ],
      ),
      specialty(
        "Reiki à distance",
        "Depuis chez vous, un moment de détente guidé à l'heure convenue.",
        "la pratique à distance",
        [
          "Une séance depuis le confort de chez vous",
          "Un créneau dédié, convenu ensemble",
          "Un échange téléphonique avant et après",
          "Une alternative pratique aux emplois du temps chargés",
        ],
      ),
      specialty(
        "Méditation guidée",
        "Des séances accompagnées pour apprivoiser le calme, seul ou en petit groupe.",
        "l'apprentissage du calme",
        [
          "Des guidages accessibles aux débutants",
          "Des thèmes variés selon les séances",
          "Une pratique en individuel ou petit groupe",
          "Des enregistrements pour pratiquer chez vous",
        ],
      ),
    ],
  },
  generic: {
    practiceName: "cette pratique de bien-être",
    practitionerLabel: { feminin: "praticienne bien-être", masculin: "praticien bien-être" },
    heroTagline: "Un accompagnement doux pour retrouver votre équilibre",
    themePreset: "terracotta",
    specialties: [
      specialty(
        "Gestion du stress",
        "Des séances dédiées au relâchement de la pression accumulée au quotidien.",
        "le relâchement de la pression",
        [
          "Un temps d'écoute de vos besoins",
          "Des techniques douces et progressives",
          "Des outils simples pour le quotidien",
          "Un cadre calme et bienveillant",
        ],
      ),
      specialty(
        "Détente profonde",
        "Un moment suspendu pour relâcher le corps et apaiser le mental.",
        "le lâcher-prise",
        [
          "Une séance entièrement dédiée à votre détente",
          "Un rythme lent et enveloppant",
          "Une attention constante à votre confort",
          "Un moment rien que pour vous",
        ],
      ),
      specialty(
        "Sommeil et récupération",
        "Préparer le corps et l'esprit à un repos de meilleure qualité.",
        "la préparation au repos",
        [
          "Des séances de fin de journée privilégiées",
          "Des rituels simples à installer chez vous",
          "Un travail sur les tensions de la journée",
          "Un accompagnement régulier possible",
        ],
      ),
      specialty(
        "Vitalité au quotidien",
        "Remettre du mouvement et de l'énergie dans vos journées.",
        "l'énergie retrouvée",
        [
          "Un regard global sur votre quotidien",
          "Des leviers simples et concrets",
          "Un accompagnement pas à pas",
          "Des progrès visibles dans la durée",
        ],
      ),
      specialty(
        "Équilibre émotionnel",
        "Accueillir vos émotions et retrouver de la stabilité intérieure.",
        "l'accueil des émotions",
        [
          "Un espace de parole sans jugement",
          "Des techniques d'apaisement éprouvées",
          "Un accompagnement respectueux de votre rythme",
          "Des repères pour les moments difficiles",
        ],
      ),
      specialty(
        "Accompagnement personnalisé",
        "Un parcours construit avec vous, selon vos besoins et vos objectifs.",
        "le sur-mesure",
        [
          "Un premier échange approfondi",
          "Un parcours ajusté à vos besoins",
          "Des points d'étape réguliers",
          "Une progression à votre rythme",
        ],
      ),
    ],
  },
};

/** Résout le métier saisi librement vers une entrée du catalogue. */
export function resolveProfession(profession: string): ProfessionSeed {
  const p = profession
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (p.includes("sophro")) return PROFESSIONS.sophrologue!;
  if (p.includes("mass")) return PROFESSIONS.massage!;
  if (p.includes("osteo")) return PROFESSIONS.osteopathe!;
  if (p.includes("naturo")) return PROFESSIONS.naturopathe!;
  if (p.includes("hypno")) return PROFESSIONS.hypnotherapeute!;
  if (p.includes("reflexo")) return PROFESSIONS.reflexologue!;
  if (p.includes("reiki")) return PROFESSIONS.reiki!;
  return PROFESSIONS.generic!;
}
