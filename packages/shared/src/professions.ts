/**
 * Catalogue des métiers des médecines douces proposés à la création d'une
 * démo. Le métier choisi pilote tout le contenu généré : motifs de
 * consultation réels, pages de spécialités, articles de blog.
 */

export type ProfessionCategory = {
  label: string;
  professions: readonly string[];
};

export const PROFESSION_CATEGORIES: readonly ProfessionCategory[] = [
  {
    label: "Thérapies manuelles et corporelles",
    professions: [
      "Ostéopathie",
      "Chiropraxie",
      "Étiopathie",
      "Massage bien-être",
      "Réflexologie (plantaire, palmaire, faciale)",
      "Shiatsu",
      "Tuina (massage chinois)",
      "Fasciathérapie",
      "Kinésiologie",
      "Méthode Feldenkrais",
      "Rolfing / intégration structurale",
      "Drainage lymphatique bien-être",
      "Amma assis",
      "Watsu",
    ],
  },
  {
    label: "Médecines traditionnelles et approches naturelles",
    professions: [
      "Naturopathie",
      "Médecine traditionnelle chinoise",
      "Acupuncture",
      "Auriculothérapie",
      "Ayurvéda",
      "Phytothérapie / herboristerie",
      "Aromathérapie",
      "Gemmothérapie",
      "Oligothérapie",
      "Apithérapie",
      "Homéopathie",
      "Micronutrition / nutrithérapie",
      "Fleurs de Bach",
      "Iridologie",
      "Hydrothérapie du côlon",
    ],
  },
  {
    label: "Approches énergétiques",
    professions: [
      "Reiki",
      "Magnétisme / magnétiseur",
      "Guérisseur / rebouteux / coupeur de feu",
      "Soins énergétiques",
      "Lithothérapie",
      "Chromothérapie",
      "EFT (libération émotionnelle)",
      "Access Bars",
      "Radiesthésie",
      "Géobiologie",
      "Biorésonance",
    ],
  },
  {
    label: "Accompagnement psycho-émotionnel",
    professions: [
      "Psychologue",
      "Psychothérapeute",
      "Psychopraticien",
      "Psychanalyste",
      "Sophrologie",
      "Hypnothérapie / hypnose ericksonienne",
      "PNL",
      "Gestalt-thérapie",
      "Analyse transactionnelle",
      "Thérapie brève",
      "Thérapie systémique",
      "EMDR",
      "Constellations familiales",
      "Biodécodage",
      "Art-thérapie",
      "Musicothérapie",
      "Zoothérapie",
      "Équithérapie",
      "Sexothérapie",
      "Olfactothérapie",
      "Somatic Experiencing",
      "Respiration holotropique / rebirth",
    ],
  },
  {
    label: "Mouvement, relaxation, hygiène de vie",
    professions: [
      "Professeur de yoga",
      "Qi gong",
      "Tai-chi",
      "Pilates",
      "Gyrotonic",
      "Eutonie",
      "Relaxologie",
      "Méditation de pleine conscience / MBSR",
      "Cohérence cardiaque",
      "Sylvothérapie (bains de forêt)",
      "Coach en santé / bien-être",
      "Accompagnant au jeûne",
    ],
  },
  {
    label: "Bien-être et soins du corps",
    professions: [
      "Spa praticien",
      "Balnéothérapie",
      "Thalassothérapie",
      "Socio-esthétique",
      "Luminothérapie",
      "Bol d'air Jacquier",
    ],
  },
];

export const ALL_PROFESSIONS: readonly string[] = PROFESSION_CATEGORIES.flatMap(
  (category) => [...category.professions],
);
