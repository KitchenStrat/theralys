import type { TourId, TourStep } from "./engine";

/**
 * Les visites guidées du studio : la visite d'accueil (proposée à la première
 * connexion) et une mini-visite par espace (jouée une fois, à sa première
 * ouverture). Chaque étape montre un élément marqué `data-tour="…"` ; une
 * étape dont l'élément n'est pas à l'écran est passée — formule qui n'ouvre pas
 * l'espace, carte absente de cet état de la page.
 *
 * Ton : vouvoiement, une idée par étape, pas de jargon. Le titre dit ce que
 * l'on regarde, le texte ce que l'on peut en faire.
 */

/** Section du design system dont la visite prend les couleurs. */
export type TourSection = "accueil" | "mon-site" | "publications" | "reseaux-sociaux" | "fiche-google" | "google-ads" | "meta-ads";

export type TourDefinition = {
  id: TourId;
  /** Nom de la visite, pour les lecteurs d'écran et le bouton de relance */
  label: string;
  section: TourSection;
  /** Page où la visite se joue */
  href: string;
  /** Fenêtre de bienvenue, affichée seulement quand la visite se propose d'elle-même */
  intro?: { title: string; body: string; start: string; later: string };
  steps: readonly TourStep[];
};

const t = (name: string) => `[data-tour="${name}"]`;
/** Le bouton « Plus » de la barre basse, seulement s'il range bien cet espace (formule qui l'ouvre, place manquante dans la barre). */
const more = (section: string) => `[data-tour="nav-plus"][data-tour-more~="${section}"]`;

export const TOURS: Record<TourId, TourDefinition> = {
  accueil: {
    id: "accueil",
    label: "Visite de votre espace",
    section: "accueil",
    href: "/",
    intro: {
      // Le prénom est ajouté à l'affichage : « Bienvenue, Claire »
      title: "Bienvenue",
      body: "Votre site et tous vos outils pour vous faire connaître se pilotent d'ici. Deux minutes suffisent pour en faire le tour.",
      start: "Faire le tour",
      later: "Plus tard",
    },
    steps: [
      {
        id: "etape",
        target: t("accueil-etape"),
        title: "Votre prochaine étape",
        body: "À chaque visite, Harmony vous indique ici la chose la plus utile à faire. Une seule à la fois.",
      },
      {
        id: "mise-en-route",
        target: t("accueil-mise-en-route"),
        title: "Votre mise en route",
        body: "Quelques étapes pour être prêt. Elles se cochent d'elles-mêmes, au fil de ce que vous faites.",
      },
      {
        id: "site",
        target: [t("nav-mon-site"), t("accueil-site")],
        title: "Votre site",
        body: "Ce qu'il présente, ce qu'il vous apporte, et comment le modifier quand vous le souhaitez.",
      },
      {
        id: "blog",
        target: [t("nav-publications"), more("publications")],
        title: "Votre blog",
        body: "Vos articles sont écrits pour vous, chaque semaine. Vous pouvez les relire et les modifier avant leur parution.",
        fallbackNote: "Sur téléphone, cet espace se trouve dans « Plus ».",
      },
      {
        id: "reseaux",
        target: [t("nav-reseaux-sociaux"), more("reseaux-sociaux")],
        title: "Vos réseaux sociaux",
        body: "Vos contenus du mois, visuel et légende, prêts à poster : nous les préparons, vous les publiez.",
        fallbackNote: "Sur téléphone, cet espace se trouve dans « Plus ».",
      },
      {
        id: "google",
        target: [t("nav-fiche-google"), more("fiche-google")],
        title: "Votre fiche Google",
        body: "L'audit de votre fiche, vos avis, et votre place dans les recherches faites près de chez vous.",
        fallbackNote: "Sur téléphone, cet espace se trouve dans « Plus ».",
      },
      {
        id: "publicite",
        target: [t("nav-groupe-publicite"), `${more("google-ads")}, ${more("meta-ads")}`],
        title: "La publicité",
        body: "Google Ads et Meta Ads : Harmony prépare vos campagnes, vous les diffusez depuis vos propres comptes.",
        fallbackNote: "Sur téléphone, ces espaces se trouvent dans « Plus ».",
      },
      {
        id: "fin",
        title: "À vous de jouer",
        body: "Chaque espace a sa propre visite, à sa première ouverture. Pour revoir celle-ci, choisissez « Visite guidée » dans le menu.",
      },
    ],
  },

  "mon-site": {
    id: "mon-site",
    label: "Visite de « Mon site »",
    section: "mon-site",
    href: "/mon-site",
    steps: [
      {
        id: "harmony",
        target: t("site-harmony"),
        title: "Votre site Harmony",
        body: "Le site compris dans votre formule. Ouvrez l'éditeur pour changer un texte, une photo ou vos horaires : c'est en ligne aussitôt.",
      },
      {
        id: "resume",
        target: t("site-resume"),
        title: "Ce que nous avons lu",
        body: "Votre activité, telle que nous l'avons comprise sur votre site. Corrigez ce qui ne vous ressemble pas : vos contenus s'en servent.",
      },
      {
        id: "activation",
        target: t("site-activation"),
        title: "Le site de référence",
        body: "Le site sur lequel vos contenus, vos liens et vos statistiques s'appuient. Vous pouvez en changer à tout moment.",
      },
      {
        id: "mesure",
        target: t("site-mesure"),
        title: "Compter les visites",
        body: "Un petit code à coller sur votre site : ses visites apparaissent ensuite sur votre accueil.",
      },
      {
        id: "connecter",
        target: t("site-connecter"),
        title: "Vous avez déjà un site ?",
        body: "Indiquez son adresse : nous lisons ses pages publiques, et vos outils s'appuient ensuite sur lui.",
      },
    ],
  },

  publications: {
    id: "publications",
    label: "Visite du blog",
    section: "publications",
    href: "/publications",
    steps: [
      {
        id: "mois",
        target: t("blog-mois"),
        title: "Votre mois d'articles",
        body: "Chaque article est écrit pour vous, sept jours avant sa date. Les flèches font passer d'un mois à l'autre.",
      },
      {
        id: "relire",
        target: [t("blog-relire"), t("blog-calendrier")],
        title: "Relire avant la parution",
        body: "Ouvrez un article pour le lire, le modifier ou le retirer. Sans action de votre part, il paraît à sa date.",
      },
      {
        id: "parametres",
        target: t("blog-parametres"),
        title: "Vos réglages",
        body: "Vos sujets de prédilection, votre ton, votre rythme : dites-le une fois, chaque article en tient compte.",
      },
    ],
  },

  "reseaux-sociaux": {
    id: "reseaux-sociaux",
    label: "Visite des réseaux sociaux",
    section: "reseaux-sociaux",
    href: "/reseaux-sociaux",
    steps: [
      {
        id: "mois",
        target: t("social-mois"),
        title: "Vos contenus du mois",
        body: "Un mois de contenus préparé d'un clic. Ouvrez-en un pour télécharger son visuel et copier sa légende.",
      },
      {
        id: "demande",
        target: t("social-demande"),
        title: "Un contenu sur mesure",
        body: "Une actualité, une idée ? Donnez le sujet et le jour : Harmony prépare le contenu.",
      },
      {
        id: "parametrage",
        target: t("social-parametrage"),
        title: "Votre voix",
        body: "Votre ton, vos consignes et vos jours de publication : réglés une fois, repris dans tous vos contenus.",
      },
      {
        id: "bio",
        target: t("social-bio"),
        title: "Votre lien de bio",
        body: "Placez ce lien dans votre profil Instagram : vous saurez combien de visites viennent de vos réseaux.",
      },
    ],
  },

  "fiche-google": {
    id: "fiche-google",
    label: "Visite de la fiche Google",
    section: "fiche-google",
    href: "/fiche-google",
    steps: [
      {
        id: "fiche",
        target: t("google-fiche"),
        title: "Votre fiche",
        body: "La fiche de votre cabinet sur Google. Une fois reliée, « Actualiser » la relit et met vos chiffres à jour.",
      },
      {
        id: "onglets",
        target: t("google-onglets"),
        title: "Quatre vues",
        body: "L'audit de votre fiche, votre visibilité près de chez vous, vos avis et vos posts : passez de l'une à l'autre ici.",
      },
      {
        id: "vue",
        target: t("google-vue"),
        title: "Quoi faire, dans l'ordre",
        body: "Chaque vue vous dit ce qui compte le plus. Harmony prépare, vous publiez sur Google.",
      },
    ],
  },

  "google-ads": {
    id: "google-ads",
    label: "Visite de Google Ads",
    section: "google-ads",
    href: "/google-ads",
    steps: [
      {
        id: "onglets",
        target: t("ads-onglets"),
        title: "Quatre temps",
        body: "Le diagnostic, les mots-clés à viser, le plan d'action, puis le paramétrage pas à pas de votre compte.",
      },
      {
        id: "analyse",
        target: t("ads-analyse"),
        title: "Commencez par l'analyse",
        body: "Elle vous dit si Google Ads vaut la peine pour votre métier et votre ville, avant de dépenser un euro.",
      },
      {
        id: "parametrage",
        target: "#google-ads-tab-parametrage",
        title: "Le pas-à-pas",
        body: "Quand le plan vous convient, suivez ces étapes pour créer la campagne dans votre compte Google Ads.",
      },
    ],
  },

  "meta-ads": {
    id: "meta-ads",
    label: "Visite de Meta Ads",
    section: "meta-ads",
    href: "/meta-ads",
    steps: [
      {
        id: "onglets",
        target: t("meta-onglets"),
        title: "Du diagnostic à la diffusion",
        body: "Le diagnostic, les annonces des confrères autour de vous, vos annonces prêtes à publier, votre plan, puis le paramétrage.",
      },
      {
        id: "analyse",
        target: t("meta-analyse"),
        title: "Commencez par l'analyse",
        body: "Harmony relève ce que font les autres praticiens, vérifie que votre cabinet est prêt, puis prépare vos annonces.",
      },
      {
        id: "parametrage",
        target: "#meta-ads-tab-parametrage",
        title: "Le pas-à-pas",
        body: "Quand vos annonces vous conviennent, suivez ces étapes pour les diffuser depuis votre compte Meta.",
      },
    ],
  },

  editeur: {
    id: "editeur",
    label: "Visite de l'éditeur",
    section: "mon-site",
    href: "/editor",
    steps: [
      {
        id: "onglets",
        target: t("editeur-onglets"),
        title: "Quatre réglages",
        body: "Vos pages, leur contenu, les couleurs et la typographie, puis les paramètres du site.",
      },
      {
        id: "apercu",
        target: t("editeur-apercu"),
        title: "L'aperçu de votre site",
        body: "Touchez une section de l'aperçu pour l'ouvrir et la modifier. Rien n'est en ligne tant que vous n'avez pas publié.",
      },
      {
        id: "publier",
        target: t("editeur-publier"),
        title: "Enregistrer et publier",
        body: "Vos modifications sont mises en ligne d'un clic, quand vous êtes prêt.",
      },
    ],
  },
};

/** La visite qui se joue sur une page ; `null` : la page n'en a pas. */
export function tourForPath(pathname: string): TourId | null {
  for (const tour of Object.values(TOURS)) {
    if (tour.href === pathname) return tour.id;
  }
  return null;
}
