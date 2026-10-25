import { SECTION_ICON_LABELS, SECTION_ICONS, type SectionIconName } from "./content";

/**
 * Bibliothèque d'icônes des encarts (points forts, infos pratiques, badges,
 * cartes de spécialité) : le dessin de chaque icône, en balisage SVG interne
 * (viewBox 0 0 24 24, tracé en `currentColor`, épaisseur fixée par l'appelant).
 * Une seule source pour le site public (rendu) et le studio (sélecteur).
 */
export const SECTION_ICON_SVG: Record<SectionIconName, string> = {
  medaille: `<circle cx="12" cy="9" r="5.5" /><path d="M9.5 13.5 8 21l4-2 4 2-1.5-7.5" stroke-linejoin="round" /><path d="m12 6.6.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 8.7l2-.3z" fill="currentColor" stroke="none" />`,
  diplome: `<path d="M2.5 9.5 12 4.5l9.5 5L12 14.5z" stroke-linejoin="round" /><path d="M6.5 12v4.5c0 1 2.5 2.5 5.5 2.5s5.5-1.5 5.5-2.5V12M21.5 9.5V15" stroke-linecap="round" />`,
  coeur: `<path d="M12 20.5C6.5 16.5 3.5 13 3.5 9.5 3.5 7 5.5 5 8 5c1.6 0 3.1.9 4 2.2C12.9 5.9 14.4 5 16 5c2.5 0 4.5 2 4.5 4.5 0 3.5-3 7-8.5 11z" stroke-linejoin="round" />`,
  mains: `<path d="M12 12.5c-3-2.5-4.8-4.4-4.8-6.3C7.2 4.9 8.3 4 9.5 4c1 0 1.9.5 2.5 1.3C12.6 4.5 13.5 4 14.5 4c1.2 0 2.3.9 2.3 2.2 0 1.9-1.8 3.8-4.8 6.3z" stroke-linejoin="round" /><path d="M4 15.5c2-1.5 4-1.5 5.5-.5l2.5 1.5c.8.5.8 1.7-.3 2l-3.2.8M20 15.5c-2-1.5-4-1.5-5.5-.5l-.8.5" stroke-linecap="round" /><path d="M2.5 14.5 6 19.5M21.5 14.5 18 19.5" stroke-linecap="round" />`,
  fleur: `<path d="M12 20c0-4 0-6.5 0-6.5M12 13.5c-2.8 0-5-2.2-5-5V6c2.8 0 5 2.2 5 5m0 2.5c2.8 0 5-2.2 5-5V6c-2.8 0-5 2.2-5 5" stroke-linecap="round" stroke-linejoin="round" /><path d="M12 11V4.5" stroke-linecap="round" />`,
  feuille: `<path d="M6 18C6 10 11 5 19 5c0 8-5 13-13 13zm0 0c0-4 2-7 5-9" stroke-linecap="round" stroke-linejoin="round" />`,
  soleil: `<circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" stroke-linecap="round" />`,
  etoile: `<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.3l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" stroke-linejoin="round" />`,
  carte: `<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" stroke-linejoin="round" /><path d="M9 4.5v13M15 6.5v13" />`,
  maison: `<path d="M4 11.5 12 4l8 7.5M6 10v9.5h12V10M10 19.5v-5h4v5" stroke-linecap="round" stroke-linejoin="round" />`,
  calendrier: `<rect x="4" y="5.5" width="16" height="15" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke-linecap="round" /><path d="M8 14h2M14 14h2M8 17h2" stroke-linecap="round" />`,
  horloge: `<circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" stroke-linecap="round" stroke-linejoin="round" />`,
  euro: `<path d="M17.5 6.5A7 7 0 0 0 12 4.5c-3.6 0-6.5 3.4-6.5 7.5s2.9 7.5 6.5 7.5a7 7 0 0 0 5.5-2" stroke-linecap="round" /><path d="M3.5 10.5h9M3.5 13.5h8" stroke-linecap="round" />`,
  document: `<path d="M6 3.5h9l3 3v14l-2-1-2 1-2-1-2 1-2-1-2 1z" stroke-linejoin="round" /><path d="M9 9h6M9 12.5h6M9 16h3.5" stroke-linecap="round" />`,
  bouclier: `<path d="M12 3.5 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" stroke-linejoin="round" /><path d="m8.8 11.8 2.2 2.2 4.2-4.5" stroke-linecap="round" stroke-linejoin="round" />`,
  personnes: `<circle cx="9" cy="8.5" r="3.5" /><path d="M3.5 20c.5-3.5 2.7-5.5 5.5-5.5s5 2 5.5 5.5" stroke-linecap="round" /><path d="M15.5 5.5a3.5 3.5 0 0 1 0 6M17.5 14.8c1.7.8 2.7 2.6 3 5.2" stroke-linecap="round" />`,
  colonne: `<rect x="9.2" y="2.8" width="5.6" height="3.6" rx="1.5" /><rect x="9.2" y="7.8" width="5.6" height="3.6" rx="1.5" /><rect x="9.2" y="12.8" width="5.6" height="3.6" rx="1.5" /><rect x="9.2" y="17.8" width="5.6" height="3.6" rx="1.5" />`,
  bebe: `<circle cx="12" cy="8.5" r="4.5" /><path d="M12 4c.2-1.2 1-2 2.1-2" stroke-linecap="round" /><path d="M5.5 21c.7-4.4 3.2-6.8 6.5-6.8s5.8 2.4 6.5 6.8" stroke-linecap="round" />`,
  lune: `<path d="M19.5 14.5A8.5 8.5 0 1 1 9.5 4.5a7 7 0 0 0 10 10z" stroke-linejoin="round" />`,
  eclair: `<path d="M13.5 2.5 5.5 13.5h5l-1 8 8-11h-5z" stroke-linejoin="round" />`,
  tete: `<path d="M9.5 21v-3.1a7.5 7.5 0 1 1 9.4-8.3c.2 1.3-.1 2.6-.8 3.7-.3.4-.3.9-.2 1.3l.7 1.8c.2.6-.2 1.2-.9 1.2h-1.2v.9c0 1.1-.9 2-2 2z" stroke-linecap="round" stroke-linejoin="round" /><path d="M10.8 9.6c.8-.7 1.7-.7 2.5 0" stroke-linecap="round" />`,
};

/** Catégories du sélecteur d'icônes du studio. */
export const SECTION_ICON_CATEGORIES = [
  { id: "soin", label: "Soin & bien-être" },
  { id: "expertise", label: "Expertise & confiance" },
  { id: "pratique", label: "Infos pratiques" },
] as const;
export type SectionIconCategory = (typeof SECTION_ICON_CATEGORIES)[number]["id"];

export const SECTION_ICON_CATEGORY: Record<SectionIconName, SectionIconCategory> = {
  medaille: "expertise",
  diplome: "expertise",
  coeur: "soin",
  mains: "soin",
  fleur: "soin",
  feuille: "soin",
  soleil: "soin",
  etoile: "expertise",
  carte: "pratique",
  maison: "pratique",
  calendrier: "pratique",
  horloge: "pratique",
  euro: "pratique",
  document: "expertise",
  bouclier: "expertise",
  personnes: "soin",
  colonne: "soin",
  bebe: "soin",
  lune: "soin",
  eclair: "soin",
  tete: "soin",
};

/** Mots-clés de recherche (en plus du libellé), sans accent requis. */
export const SECTION_ICON_KEYWORDS: Record<SectionIconName, string> = {
  medaille: "récompense qualité certifié expérience",
  diplome: "formation certifié école études",
  coeur: "bienveillance écoute douceur amour santé",
  mains: "soin toucher massage manuel accompagnement",
  fleur: "nature bien-être féminin épanouissement",
  feuille: "nature naturel écologie digestion alimentation",
  soleil: "énergie vitalité lumière matin",
  etoile: "excellence confiance réussite favori",
  carte: "plan adresse accès itinéraire localisation",
  maison: "cabinet domicile accueil lieu",
  calendrier: "rendez-vous date agenda planning",
  horloge: "durée horaires temps séance",
  euro: "tarif prix paiement remboursement",
  document: "ordonnance bilan dossier administratif",
  bouclier: "protection sécurité prévention confiance",
  personnes: "famille groupe couple équipe collectif",
  colonne: "dos vertèbres posture articulations ostéopathie",
  bebe: "nourrisson enfant maternité grossesse périnatal",
  lune: "sommeil nuit repos détente",
  eclair: "énergie sport performance rapidité",
  tete: "mental stress émotions psychologie migraine",
};

function fold(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Icônes correspondant à une recherche (libellé, nom technique ou mot-clé,
 * insensible aux accents et à la casse) et, facultativement, à une catégorie.
 * Recherche vide : toutes les icônes (de la catégorie).
 */
export function searchSectionIcons(
  query: string,
  category?: SectionIconCategory | null,
): SectionIconName[] {
  const needle = fold(query.trim());
  return SECTION_ICONS.filter((name) => {
    if (category && SECTION_ICON_CATEGORY[name] !== category) return false;
    if (needle === "") return true;
    const haystack = fold(`${name} ${SECTION_ICON_LABELS[name]} ${SECTION_ICON_KEYWORDS[name]}`);
    return haystack.includes(needle);
  });
}

/** Balisage SVG complet d'une icône (repli : cœur pour un nom inconnu). */
export function sectionIconSvg(name: string | undefined, size = 28, strokeWidth = 1.6): string {
  const inner = SECTION_ICON_SVG[(name ?? "") as SectionIconName] ?? SECTION_ICON_SVG.coeur;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" aria-hidden="true">${inner}</svg>`;
}
