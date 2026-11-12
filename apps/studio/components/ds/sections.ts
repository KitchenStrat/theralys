import {
  Globe,
  GraduationCap,
  House,
  MapPin,
  Megaphone,
  MousePointerClick,
  Newspaper,
  Share2,
  UserRound,
  type LucideIcon,
} from "lucide-react";

/**
 * Registre des sections du studio : la source unique de la navigation, des
 * en-têtes de page et des accents de couleur.
 *
 * Les couleurs elles-mêmes vivent dans `app/globals.css`, sous le sélecteur
 * `[data-ds-section="<clé>"]` ; `gradient` et `tint` en sont le reflet (nom du
 * dégradé et valeurs hexadécimales), pour la documentation et pour les usages
 * hors CSS. La page `/apercu-design` vérifie que les deux concordent.
 */
export type SectionKey =
  | "accueil"
  | "mon-site"
  | "publications"
  | "reseaux-sociaux"
  | "fiche-google"
  | "google-ads"
  | "meta-ads"
  | "academie"
  | "compte";

export type SectionGroupKey = "mon-site" | "visibilite" | "publicite" | "apprendre";

export type SectionDef = {
  key: SectionKey;
  /** Nom affiché dans la navigation et en titre de page */
  label: string;
  /** Nom court pour la barre basse du mobile */
  shortLabel: string;
  href: string;
  icon: LucideIcon;
  /** À quoi sert la section, en une phrase (sous le titre de page) */
  purpose: string;
  /** Groupe de la barre latérale ; `null` : entrée hors groupe */
  group: SectionGroupKey | null;
  /** Dégradé nommé : arrêts « vifs » (pictogrammes, grands titres) et « profonds » (texte courant) */
  gradient: { name: string; from: string; to: string; deepFrom: string; deepTo: string };
  /** Teinte douce de la section : fond, texte foncé et accent assortis */
  tint: { soft: string; ink: string; accent: string };
  /** Le dégradé vif est clair : le pictogramme posé dessus est foncé (Académie) */
  lightGradient?: boolean;
};

export const SECTIONS: Record<SectionKey, SectionDef> = {
  accueil: {
    key: "accueil",
    label: "Accueil",
    shortLabel: "Accueil",
    href: "/",
    icon: House,
    purpose: "L'essentiel de votre activité en ligne, et la prochaine chose à faire.",
    group: null,
    gradient: { name: "Horizon", from: "#0E97DD", to: "#2F6DD3", deepFrom: "#0079B4", deepTo: "#2454B3" },
    tint: { soft: "#F1F8FF", ink: "#003967", accent: "#006BB9" },
  },
  "mon-site": {
    key: "mon-site",
    label: "Mon site",
    shortLabel: "Mon site",
    href: "/mon-site",
    icon: Globe,
    purpose: "Votre site : ce qu'il présente, ce qu'il vous apporte, et comment le modifier.",
    group: "mon-site",
    gradient: { name: "Oasis", from: "#23A381", to: "#009298", deepFrom: "#1B8367", deepTo: "#006B72" },
    tint: { soft: "#E9FCF7", ink: "#034239", accent: "#127A6B" },
  },
  publications: {
    key: "publications",
    label: "Publications",
    shortLabel: "Publications",
    href: "/publications",
    icon: Newspaper,
    purpose: "Les articles de votre blog : nous les écrivons, vous les relisez avant publication.",
    group: "visibilite",
    gradient: { name: "Lagon", from: "#01A2B9", to: "#0A88CC", deepFrom: "#017F95", deepTo: "#09669A" },
    tint: { soft: "#EDF9FF", ink: "#003E52", accent: "#027495" },
  },
  "reseaux-sociaux": {
    key: "reseaux-sociaux",
    label: "Réseaux sociaux",
    shortLabel: "Réseaux",
    href: "/reseaux-sociaux",
    icon: Share2,
    purpose: "Vos publications du mois, prêtes à poster : nous préparons, vous validez.",
    group: "visibilite",
    gradient: { name: "Aurore", from: "#0E97DD", to: "#8F6CE0", deepFrom: "#0079B4", deepTo: "#7D51D2" },
    tint: { soft: "#F4F6FF", ink: "#2C306A", accent: "#5458C8" },
  },
  "fiche-google": {
    key: "fiche-google",
    label: "Fiche Google",
    shortLabel: "Google",
    href: "/fiche-google",
    icon: MapPin,
    purpose: "Votre fiche d'établissement : audit, visibilité locale, avis et posts.",
    group: "visibilite",
    gradient: { name: "Rivage", from: "#00A497", to: "#008EB3", deepFrom: "#008479", deepTo: "#006A8B" },
    tint: { soft: "#E8FBFD", ink: "#004046", accent: "#007781" },
  },
  "google-ads": {
    key: "google-ads",
    label: "Google Ads",
    shortLabel: "Google Ads",
    href: "/google-ads",
    icon: MousePointerClick,
    purpose: "Apparaître en haut des résultats quand quelqu'un cherche un praticien près de chez vous.",
    group: "publicite",
    gradient: { name: "Cobalt", from: "#2D74D9", to: "#4B53C2", deepFrom: "#1C55B2", deepTo: "#363896" },
    tint: { soft: "#F2F7FF", ink: "#19356B", accent: "#2E62C9" },
  },
  "meta-ads": {
    key: "meta-ads",
    label: "Meta Ads",
    shortLabel: "Meta Ads",
    href: "/meta-ads",
    icon: Megaphone,
    purpose: "Vous faire connaître sur Facebook et Instagram auprès des personnes de votre secteur.",
    group: "publicite",
    gradient: { name: "Iris", from: "#6269DB", to: "#7A4ECF", deepFrom: "#4A4CBA", deepTo: "#5E31A9" },
    tint: { soft: "#F6F6FF", ink: "#392C67", accent: "#6B50C2" },
  },
  academie: {
    key: "academie",
    label: "Académie",
    shortLabel: "Académie",
    href: "/academie",
    icon: GraduationCap,
    purpose: "Des fiches courtes pour comprendre et progresser, à votre rythme.",
    group: "apprendre",
    gradient: { name: "Glacier", from: "#3ACED6", to: "#46AFEC", deepFrom: "#8CEBEA", deepTo: "#8ED4FF" },
    tint: { soft: "#E9FAFF", ink: "#003F4B", accent: "#00768A" },
    lightGradient: true,
  },
  compte: {
    key: "compte",
    label: "Compte",
    shortLabel: "Compte",
    href: "/compte",
    icon: UserRound,
    purpose: "Votre formule, votre facturation et votre nom de domaine.",
    group: null,
    gradient: { name: "Ardoise", from: "#52657A", to: "#2D3E55", deepFrom: "#425468", deepTo: "#1E2F44" },
    tint: { soft: "#F4F7FB", ink: "#1E2F41", accent: "#44576B" },
  },
};

/** Ordre d'affichage : Accueil, les groupes par objectif, puis le Compte. */
export const SECTION_ORDER: readonly SectionKey[] = [
  "accueil",
  "mon-site",
  "publications",
  "reseaux-sociaux",
  "fiche-google",
  "google-ads",
  "meta-ads",
  "academie",
  "compte",
];

/** Groupes de la barre latérale, intitulés par objectif. */
export const SECTION_GROUPS: readonly { key: SectionGroupKey; label: string; sections: readonly SectionKey[] }[] = [
  { key: "mon-site", label: "Mon site", sections: ["mon-site"] },
  { key: "visibilite", label: "Me faire connaître", sections: ["publications", "reseaux-sociaux", "fiche-google"] },
  { key: "publicite", label: "Publicité", sections: ["google-ads", "meta-ads"] },
  { key: "apprendre", label: "Apprendre", sections: ["academie"] },
];

/** Barre basse du mobile : les quatre premières sections accessibles de cette liste ; le reste va dans « Plus ». */
export const MOBILE_PRIORITY: readonly SectionKey[] = [
  "accueil",
  "publications",
  "reseaux-sociaux",
  "fiche-google",
  "mon-site",
  "google-ads",
  "meta-ads",
  "academie",
  "compte",
];

export function getSection(key: SectionKey): SectionDef {
  return SECTIONS[key];
}

export function isSectionKey(value: string): value is SectionKey {
  return Object.prototype.hasOwnProperty.call(SECTIONS, value);
}

/** Adresses de substitution (page d'aperçu) : par défaut, celles du registre. */
export type SectionHrefs = Partial<Record<SectionKey, string>>;

export function sectionHref(key: SectionKey, hrefs?: SectionHrefs): string {
  return hrefs?.[key] ?? SECTIONS[key].href;
}

/**
 * Section active pour un chemin : l'adresse la plus longue qui le préfixe
 * (l'Accueil, à la racine, ne correspond qu'exactement).
 */
export function sectionForPath(pathname: string, hrefs?: SectionHrefs): SectionKey | null {
  let best: SectionKey | null = null;
  let bestLength = -1;
  for (const key of SECTION_ORDER) {
    const href = sectionHref(key, hrefs);
    const matches = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
    if (matches && href.length > bestLength) {
      best = key;
      bestLength = href.length;
    }
  }
  return best;
}

/** Ce que la formule ouvre — les cinq drapeaux que calcule déjà `app/(app)/layout.tsx`. */
export type SectionAccess = {
  publications: boolean;
  social: boolean;
  google: boolean;
  googleAds: boolean;
  metaAds: boolean;
  /** Section « Mon site » (nouvelle) : masquée tant que sa page n'existe pas */
  site?: boolean;
};

/** Sections à afficher pour une formule, dans l'ordre de la navigation. */
export function allowedSections(access: SectionAccess): SectionKey[] {
  const open: Record<SectionKey, boolean> = {
    accueil: true,
    "mon-site": access.site ?? false,
    publications: access.publications,
    "reseaux-sociaux": access.social,
    "fiche-google": access.google,
    "google-ads": access.googleAds,
    "meta-ads": access.metaAds,
    academie: true,
    compte: true,
  };
  return SECTION_ORDER.filter((key) => open[key]);
}
