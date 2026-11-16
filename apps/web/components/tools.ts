import type { StaticImageData } from "next/image";
import {
  ChartNoAxesCombined,
  Globe,
  MapPin,
  Megaphone,
  MousePointerClick,
  Newspaper,
  Share2,
  type LucideIcon,
} from "lucide-react";
import accueil from "@/assets/captures/accueil.webp";
import blog from "@/assets/captures/blog.webp";
import ficheGoogle from "@/assets/captures/fiche-google.webp";
import googleAds from "@/assets/captures/google-ads.webp";
import mobileAccueil from "@/assets/captures/m-accueil.webp";
import mobileBlog from "@/assets/captures/m-blog.webp";
import mobileFicheGoogle from "@/assets/captures/m-fiche-google.webp";
import mobileGoogleAds from "@/assets/captures/m-google-ads.webp";
import mobileMetaAds from "@/assets/captures/m-meta-ads.webp";
import mobileReseaux from "@/assets/captures/m-reseaux.webp";
import mobileSite from "@/assets/captures/m-site.webp";
import metaAds from "@/assets/captures/meta-ads.webp";
import reseaux from "@/assets/captures/reseaux.webp";
import site from "@/assets/captures/site.webp";

/**
 * Les outils de Harmony, tels que le praticien les trouve dans son espace.
 * Source unique de la vitrine : le bandeau du haut, le schéma « tout au même
 * endroit » et la visite guidée lisent cette liste.
 *
 * Chaque outil porte les couleurs de sa section dans le studio (mêmes dégradés,
 * cf. `apps/studio/components/ds/sections.ts`) : `from`/`to` pour les
 * pictogrammes, `deepFrom`/`deepTo` sous un texte blanc (contraste AA).
 *
 * Les captures sont de vrais écrans du studio, pris sur le compte de
 * démonstration : `desktop` en 1280 × 800, `mobile` en 390 × 844.
 */
export type Tool = {
  id: string;
  /** Nom de l'outil, comme dans la navigation du studio */
  name: string;
  /** Nom court des pastilles et du schéma */
  short: string;
  icon: LucideIcon;
  /** La promesse, en une phrase */
  promise: string;
  /** Ce que fait l'outil : trois faits vérifiables dans le produit */
  points: string[];
  /** Ce que l'outil ne fait pas à la place du praticien, dit clairement */
  note: string;
  /** Formule(s) qui comprennent l'outil */
  plan: "Starter et Scale" | "Scale";
  colors: { from: string; to: string; deepFrom: string; deepTo: string; soft: string; ink: string; accent: string };
  desktop: StaticImageData;
  mobile: StaticImageData;
  /** Ce que montre la capture (texte de remplacement) */
  alt: string;
};

export const TOOLS: Tool[] = [
  {
    id: "site",
    name: "Site internet",
    short: "Site",
    icon: Globe,
    promise: "Un site professionnel à votre image, ou le vôtre si vous en avez déjà un.",
    points: [
      "Créé pour votre pratique et votre ville, livré clé en main : hébergement, nom de domaine et certificat de sécurité compris.",
      "Textes, photos, horaires, tarifs : vous modifiez tout en quelques clics, avec l'aperçu en direct.",
      "Vos spécialités ont leur page, vos avis Google s'affichent d'eux-mêmes.",
    ],
    note: "Vous avez déjà un site ? Gardez-le : Harmony s'y branche.",
    plan: "Starter et Scale",
    colors: { from: "#23A381", to: "#009298", deepFrom: "#1B8367", deepTo: "#006B72", soft: "#E9FCF7", ink: "#034239", accent: "#127A6B" },
    desktop: site,
    mobile: mobileSite,
    alt: "L'éditeur de site de Harmony : les réglages du contenu à gauche, l'aperçu du site d'une sophrologue à droite.",
  },
  {
    id: "blog",
    name: "Blog SEO",
    short: "Blog",
    icon: Newspaper,
    promise: "Jusqu'à quatre articles par semaine, écrits pour vous.",
    points: [
      "Des sujets tirés de vos spécialités et de votre ville : ce que vos futurs patients tapent dans Google.",
      "Chaque article est rédigé sept jours avant sa date : vous pouvez le relire et le modifier avant qu'il paraisse.",
      "Un calendrier lisible d'un coup d'œil : publié, planifié, à relire.",
    ],
    note: "Les articles sont rédigés par une IA spécialisée, et signalés comme tels dans votre espace.",
    plan: "Scale",
    colors: { from: "#01A2B9", to: "#0A88CC", deepFrom: "#017F95", deepTo: "#09669A", soft: "#EDF9FF", ink: "#003E52", accent: "#027495" },
    desktop: blog,
    mobile: mobileBlog,
    alt: "Le calendrier du blog dans Harmony : les articles du mois, publiés ou planifiés, jour par jour.",
  },
  {
    id: "fiche-google",
    name: "Fiche Google",
    short: "Fiche Google",
    icon: MapPin,
    promise: "Votre fiche Google Maps auditée, suivie, et comparée aux cabinets voisins.",
    points: [
      "Un score sur 100 et un plan d'action classé par impact, avec la marche à suivre pour chaque point.",
      "Une carte qui montre votre place dans Google Maps, emplacement par emplacement autour de votre cabinet.",
      "Des réponses à vos avis et des posts Google préparés, prêts à copier.",
    ],
    note: "Harmony prépare ; vous publiez sur votre fiche Google, qui reste la vôtre.",
    plan: "Scale",
    colors: { from: "#00A497", to: "#008EB3", deepFrom: "#008479", deepTo: "#006A8B", soft: "#E8FBFD", ink: "#004046", accent: "#007781" },
    desktop: ficheGoogle,
    mobile: mobileFicheGoogle,
    alt: "La carte de visibilité locale dans Harmony : le rang de la fiche Google du cabinet à chaque emplacement de la ville.",
  },
  {
    id: "reseaux-sociaux",
    name: "Réseaux sociaux",
    short: "Réseaux",
    icon: Share2,
    promise: "Vos publications du mois, prêtes à poster.",
    points: [
      "Visuels, carrousels et stories aux couleurs de votre cabinet, chacun avec sa légende.",
      "Un sujet vous tient à cœur ? Demandez un contenu sur mesure : il est préparé à partir de votre site.",
      "Trois gestes pour publier : télécharger le visuel, coller la légende, poster.",
    ],
    note: "Harmony ne publie rien à votre place : vous gardez la main sur vos comptes.",
    plan: "Scale",
    colors: { from: "#0E97DD", to: "#8F6CE0", deepFrom: "#0079B4", deepTo: "#7D51D2", soft: "#F4F6FF", ink: "#2C306A", accent: "#5458C8" },
    desktop: reseaux,
    mobile: mobileReseaux,
    alt: "Un carrousel Instagram préparé par Harmony : le visuel à télécharger et sa légende à copier.",
  },
  {
    id: "google-ads",
    name: "Google Ads",
    short: "Google Ads",
    icon: MousePointerClick,
    promise: "La publicité sur Google, sans avancer à l'aveugle.",
    points: [
      "Un diagnostic chiffré : est-ce pertinent pour votre cabinet, et avec quel budget ?",
      "Les mots-clés à viser et un plan d'action à suivre pas à pas.",
      "Le suivi des rendez-vous venus de vos annonces, dans vos statistiques.",
    ],
    note: "Vous paramétrez votre propre compte Google Ads avec notre guide ; le budget publicitaire est réglé à Google.",
    plan: "Scale",
    colors: { from: "#2D74D9", to: "#4B53C2", deepFrom: "#1C55B2", deepTo: "#363896", soft: "#F2F7FF", ink: "#19356B", accent: "#2E62C9" },
    desktop: googleAds,
    mobile: mobileGoogleAds,
    alt: "Le diagnostic Google Ads de Harmony : un score de pertinence, le volume de recherches et le budget conseillé.",
  },
  {
    id: "meta-ads",
    name: "Meta Ads",
    short: "Meta Ads",
    icon: Megaphone,
    promise: "Facebook et Instagram : des annonces prêtes à diffuser.",
    points: [
      "Une veille des annonces diffusées par les praticiens autour de vous.",
      "Vos annonces rédigées et mises en image dans les trois formats de Meta, plus un plan vidéo à tourner.",
      "Un plan de campagne et de ciblage, avec le budget à prévoir.",
    ],
    note: "Vous diffusez depuis votre compte Meta ; le budget publicitaire est réglé à Meta.",
    plan: "Scale",
    colors: { from: "#6269DB", to: "#7A4ECF", deepFrom: "#4A4CBA", deepTo: "#5E31A9", soft: "#F6F6FF", ink: "#392C67", accent: "#6B50C2" },
    desktop: metaAds,
    mobile: mobileMetaAds,
    alt: "Une annonce Facebook préparée par Harmony : l'aperçu de la publicité, son texte et son titre prêts à copier.",
  },
  {
    id: "statistiques",
    name: "Statistiques",
    short: "Statistiques",
    icon: ChartNoAxesCombined,
    promise: "Vous voyez ce que votre présence en ligne vous rapporte.",
    points: [
      "Visiteurs, clics sur la prise de rendez-vous, appels : vos chiffres clés sur 7 jours, 30 jours ou 6 mois.",
      "D'où viennent vos visiteurs : Google, Instagram, Facebook, vos publicités.",
      "À chaque visite, la prochaine chose utile à faire, et rien d'autre.",
    ],
    note: "Des chiffres mesurés sur votre site, pas des estimations.",
    plan: "Starter et Scale",
    colors: { from: "#0E97DD", to: "#2F6DD3", deepFrom: "#0079B4", deepTo: "#2454B3", soft: "#F1F8FF", ink: "#003967", accent: "#006BB9" },
    desktop: accueil,
    mobile: mobileAccueil,
    alt: "L'accueil de Harmony : les visiteurs de la semaine, les clics de rendez-vous et la prochaine étape proposée.",
  },
];
