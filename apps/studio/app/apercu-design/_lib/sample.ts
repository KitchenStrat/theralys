import type { AreaChartDatum, ChecklistStep, SectionKey, Status, TimedStep } from "@/components/ds";

/**
 * Données d'exemple de la page d'aperçu. Tout est fictif : un prénom, un
 * cabinet sans nom, un domaine réservé aux exemples (`.example`).
 */
export const SAMPLE_USER = { firstName: "Claire", siteHref: "https://cabinet.example" };

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS_LONG = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Date de référence fixe : les captures restent identiques d'un jour à l'autre. */
const TODAY = Date.UTC(2026, 10, 12);

/** Visites des 30 derniers jours : creux le week-end, légère hausse, bruit déterministe. */
export const VISITS_30: AreaChartDatum[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(TODAY - (29 - i) * 86_400_000);
  const weekday = date.getUTCDay();
  const weekend = weekday === 0 || weekday === 6 ? 0.55 : 1;
  const noise = ((i * 37) % 11) - 5;
  const value = Math.max(4, Math.round((26 + i * 0.75 + noise) * weekend));
  return {
    label: `${DAYS[weekday]} ${date.getUTCDate()} ${MONTHS_LONG[date.getUTCMonth()]}`,
    tick: `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`,
    value,
  };
});

export const VISITS_7 = VISITS_30.slice(-7);
const sum = (rows: readonly AreaChartDatum[]) => rows.reduce((total, row) => total + row.value, 0);
export const VISITS_7_TOTAL = sum(VISITS_7);
export const VISITS_PREV_7_TOTAL = sum(VISITS_30.slice(-14, -7));
export const VISITS_30_TOTAL = sum(VISITS_30);

export const TRENDS = {
  visits: VISITS_30.slice(-14).map((row) => row.value),
  appointments: [1, 2, 1, 3, 2, 2, 4, 2, 3, 3, 2, 4, 3, 5],
  reviews: [27, 27, 28, 28, 29, 29, 30, 31, 31, 32, 32, 33, 33, 34],
  reach: [120, 180, 150, 210, 260, 240, 310, 290, 340, 420, 380, 460, 520, 610],
};

export const CHECKLIST: ChecklistStep[] = [
  { id: "site", label: "Votre site est en ligne", done: true },
  { id: "fiche", label: "Votre fiche Google est reliée", done: true },
  { id: "voix", label: "Le ton de vos textes est réglé", done: true },
  {
    id: "article",
    label: "Relisez votre premier article",
    description: "Nous l'avons écrit pour vous. Deux minutes suffisent pour le valider ou demander une retouche.",
    done: false,
    href: "/apercu-design/section/publications",
    actionLabel: "Relire l'article",
  },
  { id: "contenus", label: "Préparez vos contenus de décembre", done: false },
];

export type Upcoming = {
  id: string;
  day: string;
  month: string;
  title: string;
  kind: string;
  section: SectionKey;
  status: Status;
  statusLabel?: string;
};

export const UPCOMING: Upcoming[] = [
  {
    id: "a1",
    day: "13",
    month: "nov.",
    title: "Sommeil léger et réveils nocturnes : ce qui aide vraiment",
    kind: "Article de blog",
    section: "publications",
    status: "a-relire",
  },
  {
    id: "s1",
    day: "14",
    month: "nov.",
    title: "Trois respirations avant un rendez-vous important",
    kind: "Carrousel pour vos réseaux",
    section: "reseaux-sociaux",
    status: "planifie",
  },
  {
    id: "g1",
    day: "16",
    month: "nov.",
    title: "Nouveaux créneaux le samedi matin",
    kind: "Post sur votre fiche Google",
    section: "fiche-google",
    status: "planifie",
  },
  {
    id: "a2",
    day: "20",
    month: "nov.",
    title: "Nuque bloquée au réveil : les bons gestes",
    kind: "Article de blog",
    section: "publications",
    status: "brouillon",
  },
];

export const DONE_THIS_WEEK = [
  "1 article publié sur votre blog",
  "3 publications programmées pour vos réseaux",
  "4 nouveaux avis analysés sur votre fiche Google",
];

export const GENERATION_STEPS: TimedStep[] = [
  { label: "Lecture de votre site et de votre ton", seconds: 8 },
  { label: "Choix des sujets du mois", seconds: 12, details: ["Un sujet de saison : le stress des fêtes", "Un sujet de fond : bien dormir en hiver"] },
  {
    label: "Rédaction des légendes",
    seconds: 22,
    details: [
      "« Respirer avant un rendez-vous »",
      "« Une routine du soir en 5 minutes »",
      "« Ce que change une séance »",
    ],
  },
  { label: "Création des visuels", seconds: 20, details: ["Mise en page aux couleurs de votre cabinet", "Vérification des formats"] },
  { label: "Vérification finale", seconds: 8 },
];

/** Contenu d'une page de section type, pour chaque section. */
export type SectionSample = {
  action: string;
  tabs: readonly string[];
  summaryTitle: string;
  summaryText: string;
  summaryProgress: { value: number; max: number; text: string };
  cards: readonly { title: string; meta: string; format: string; status: Status; statusLabel?: string }[];
  generationTitle: string;
  generationSteps: readonly string[];
  generationDetail: string;
  emptyTitle: string;
  emptyText: string;
  emptyAction: string;
};

export const SECTION_SAMPLES: Record<Exclude<SectionKey, "accueil">, SectionSample> = {
  "reseaux-sociaux": {
    action: "Demander un contenu",
    tabs: ["Ce mois-ci", "Calendrier", "Sur mesure", "Réglages"],
    summaryTitle: "Novembre : 8 contenus prêts",
    summaryText: "3 sont déjà publiés, 5 partiront aux dates prévues. Vous pouvez tout relire et modifier.",
    summaryProgress: { value: 3, max: 8, text: "3 publiés sur 8" },
    cards: [
      { title: "Trois respirations avant un rendez-vous important", meta: "Samedi 14 novembre · 9 h 00", format: "Carrousel", status: "planifie" },
      { title: "Une routine du soir en cinq minutes", meta: "Mardi 17 novembre · 18 h 30", format: "Visuel", status: "a-relire" },
      { title: "Ce que change une première séance", meta: "Publié le 9 novembre", format: "Vidéo courte", status: "publie" },
    ],
    generationTitle: "Nous préparons vos contenus de décembre",
    generationSteps: GENERATION_STEPS.map((step) => step.label),
    generationDetail: "Légende 4 sur 8 : « Une routine du soir en 5 minutes »",
    emptyTitle: "Aucune demande sur mesure pour l'instant",
    emptyText:
      "Un atelier, une nouvelle prestation, une actualité ? Décrivez-la en une phrase : nous en faisons une publication à votre image.",
    emptyAction: "Demander un contenu",
  },
  "mon-site": {
    action: "Modifier mon site",
    tabs: ["Vue d'ensemble", "Pages", "Apparence", "Réglages"],
    summaryTitle: "Votre site est en ligne",
    summaryText: "Six pages présentent votre cabinet. Chaque modification est visible immédiatement.",
    summaryProgress: { value: 5, max: 6, text: "5 pages sur 6 complètes" },
    cards: [
      { title: "Accueil", meta: "Modifiée le 2 novembre", format: "Page", status: "publie" },
      { title: "Vos accompagnements", meta: "3 prestations présentées", format: "Page", status: "publie" },
      { title: "Tarifs et prise de rendez-vous", meta: "Il manque vos tarifs", format: "Page", status: "a-relire", statusLabel: "À compléter" },
    ],
    generationTitle: "Nous rédigeons votre nouvelle page",
    generationSteps: ["Lecture de votre demande", "Plan de la page", "Rédaction des textes", "Mise en page", "Vérification finale"],
    generationDetail: "Paragraphe 2 sur 5 : « Pour qui ? »",
    emptyTitle: "Aucune page en préparation",
    emptyText: "Besoin d'une page pour une nouvelle prestation ? Donnez-nous le sujet : nous écrivons, vous relisez.",
    emptyAction: "Ajouter une page",
  },
  publications: {
    action: "Proposer un sujet",
    tabs: ["Ce mois-ci", "Calendrier", "Publiés", "Réglages"],
    summaryTitle: "Novembre : 4 articles prévus",
    summaryText: "Un article par semaine, écrit pour vous. Vous relisez, nous publions à la date prévue.",
    summaryProgress: { value: 1, max: 4, text: "1 publié sur 4" },
    cards: [
      { title: "Sommeil léger et réveils nocturnes : ce qui aide vraiment", meta: "Prévu le vendredi 13 novembre", format: "Article", status: "a-relire" },
      { title: "Nuque bloquée au réveil : les bons gestes", meta: "Prévu le vendredi 20 novembre", format: "Article", status: "brouillon" },
      { title: "Jambes lourdes en fin de journée", meta: "Publié le 6 novembre", format: "Article", status: "publie" },
    ],
    generationTitle: "Nous écrivons votre article",
    generationSteps: ["Lecture de votre site et de votre ton", "Plan de l'article", "Rédaction", "Choix de l'image", "Relecture"],
    generationDetail: "Partie 2 sur 4 : « Les gestes qui soulagent »",
    emptyTitle: "Aucun sujet proposé par vous ce mois-ci",
    emptyText: "Une question que vos patients posent souvent ? Proposez-la : elle deviendra un article de votre blog.",
    emptyAction: "Proposer un sujet",
  },
  "fiche-google": {
    action: "Actualiser ma fiche",
    tabs: ["Audit", "Visibilité", "Avis", "Posts"],
    summaryTitle: "Bonne fiche : 74 points sur 100",
    summaryText: "9 contrôles sur 15 sont au vert. Six actions simples vous feraient gagner des places.",
    summaryProgress: { value: 74, max: 100, text: "74 sur 100" },
    cards: [
      { title: "Renseignez votre numéro de téléphone", meta: "Impact fort · 5 min", format: "Action", status: "a-relire", statusLabel: "À faire" },
      { title: "Répondez à vos 3 derniers avis", meta: "Réponses proposées, prêtes à copier", format: "Avis", status: "brouillon", statusLabel: "Réponses prêtes" },
      { title: "Nouveaux créneaux le samedi matin", meta: "Post prévu le lundi 16 novembre", format: "Post", status: "planifie" },
    ],
    generationTitle: "Nous analysons votre fiche",
    generationSteps: ["Lecture de votre fiche", "Comparaison avec les cabinets voisins", "Analyse de vos avis", "Plan d'action"],
    generationDetail: "Cabinet 4 sur 7 comparé",
    emptyTitle: "Aucun mot-clé suivi pour l'instant",
    emptyText: "Choisissez les recherches qui comptent pour vous : nous relevons votre position sur la carte chaque semaine.",
    emptyAction: "Choisir mes mots-clés",
  },
  "google-ads": {
    action: "Lancer le diagnostic",
    tabs: ["Diagnostic", "Mots-clés", "Plan", "Paramétrage"],
    summaryTitle: "La publicité est pertinente pour vous",
    summaryText: "Environ 320 recherches par mois près de chez vous. Budget conseillé : 6 € par jour.",
    summaryProgress: { value: 2, max: 4, text: "2 étapes sur 4" },
    cards: [
      { title: "Sophrologue à proximité", meta: "140 recherches par mois · coût moyen d'un clic : 0,85 €", format: "Mot-clé", status: "publie", statusLabel: "Retenu" },
      { title: "Gestion du stress", meta: "90 recherches par mois · coût moyen d'un clic : 1,10 €", format: "Mot-clé", status: "publie", statusLabel: "Retenu" },
      { title: "Votre première annonce", meta: "3 titres et 2 descriptions à relire", format: "Annonce", status: "a-relire" },
    ],
    generationTitle: "Nous étudions la demande près de chez vous",
    generationSteps: ["Recherches dans votre secteur", "Coût des clics", "Budget conseillé", "Rédaction du verdict"],
    generationDetail: "Mot-clé 12 sur 30 étudié",
    emptyTitle: "Vous n'avez pas encore de campagne",
    emptyText: "La publicité fait apparaître votre cabinet en haut des résultats quand quelqu'un cherche un praticien près de chez vous.",
    emptyAction: "Voir combien cela coûterait",
  },
  "meta-ads": {
    action: "Lancer le diagnostic",
    tabs: ["Diagnostic", "Marché", "Annonces", "Plan"],
    summaryTitle: "60 annonces observées dans votre secteur",
    summaryText: "Nous regardons ce que publient les cabinets voisins pour vous proposer des annonces qui vous ressemblent.",
    summaryProgress: { value: 3, max: 5, text: "3 étapes sur 5" },
    cards: [
      { title: "Votre séance découverte", meta: "Image carrée · texte de 90 caractères", format: "Annonce", status: "a-relire" },
      { title: "Un atelier respiration en petit groupe", meta: "Vidéo de 20 secondes · plan fourni", format: "Annonce", status: "brouillon" },
      { title: "Témoignage : retrouver le sommeil", meta: "Carrousel de 4 images", format: "Annonce", status: "planifie" },
    ],
    generationTitle: "Nous préparons vos annonces",
    generationSteps: ["Lecture de la veille", "Choix des angles", "Rédaction des textes", "Création des visuels", "Vérification finale"],
    generationDetail: "Annonce 2 sur 3 : « Votre séance découverte »",
    emptyTitle: "Votre bibliothèque est vide",
    emptyText: "Gardez les annonces qui vous inspirent : elles serviront de modèle à vos propres créations.",
    emptyAction: "Parcourir les annonces",
  },
  academie: {
    action: "Reprendre ma fiche",
    tabs: ["Pour commencer", "Visibilité", "Publicité", "Mes fiches"],
    summaryTitle: "Bien démarrer : 2 fiches lues sur 6",
    summaryText: "Des fiches de cinq minutes, sans jargon, pour comprendre ce que nous faisons pour vous.",
    summaryProgress: { value: 2, max: 6, text: "2 fiches sur 6" },
    cards: [
      { title: "Comment Google choisit les cabinets qu'il montre", meta: "5 min de lecture", format: "Fiche", status: "publie", statusLabel: "Lue" },
      { title: "Répondre à un avis, même négatif", meta: "4 min de lecture", format: "Fiche", status: "planifie", statusLabel: "À lire" },
      { title: "À quoi sert un article de blog", meta: "3 min de lecture", format: "Fiche", status: "planifie", statusLabel: "À lire" },
    ],
    generationTitle: "Nous préparons votre parcours",
    generationSteps: ["Lecture de votre formule", "Choix des fiches utiles", "Mise en ordre"],
    generationDetail: "Fiche 3 sur 6",
    emptyTitle: "Aucune fiche enregistrée",
    emptyText: "Gardez de côté les fiches à relire : vous les retrouverez ici, classées par thème.",
    emptyAction: "Parcourir les fiches",
  },
  compte: {
    action: "Gérer ma facturation",
    tabs: ["Abonnement", "Domaine", "Factures", "Sécurité"],
    summaryTitle: "Formule Scale, à jour",
    summaryText: "Prochain prélèvement le 1er décembre. Tout ce que comprend votre formule est activé.",
    summaryProgress: { value: 2, max: 4, text: "2 articles sur 4 utilisés ce mois-ci" },
    cards: [
      { title: "Votre nom de domaine", meta: "cabinet.example · renouvelé automatiquement", format: "Domaine", status: "publie", statusLabel: "Actif" },
      { title: "Facture de novembre", meta: "Émise le 1er novembre", format: "Facture", status: "publie", statusLabel: "Payée" },
      { title: "Votre mot de passe", meta: "Modifié il y a 3 mois", format: "Sécurité", status: "planifie", statusLabel: "À jour" },
    ],
    generationTitle: "Nous configurons votre domaine",
    generationSteps: ["Réservation du nom", "Configuration technique", "Certificat de sécurité", "Vérification"],
    generationDetail: "Propagation en cours chez l'hébergeur",
    emptyTitle: "Aucune facture pour l'instant",
    emptyText: "Vos factures apparaîtront ici dès le premier prélèvement, prêtes à télécharger pour votre comptabilité.",
    emptyAction: "Voir ma formule",
  },
};
