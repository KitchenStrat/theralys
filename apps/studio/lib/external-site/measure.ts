/**
 * Écran « Mon site », bloc « Statistiques de votre site » : état du code de
 * mesure, pas-à-pas d'installation par outil de création de site, paragraphe
 * pour la politique de confidentialité du praticien. Module pur.
 *
 * Ce que le code mesure et ne mesure pas est décrit d'après le script servi
 * par `apps/sites` (`lib/measure-script.ts`) : pages vues, hôte du site
 * d'où vient le visiteur, clics vers une page de rendez-vous et sur un numéro
 * de téléphone ; ni cookie, ni paramètre de campagne ; refus du visiteur par
 * l'ancre `EXTERNAL_MEASURE_OPTOUT.off` ou le réglage de son navigateur.
 */

import { EXTERNAL_CMS_LABELS, EXTERNAL_MEASURE_OPTOUT, type ExternalCms } from "@theralys/shared";

// ─── État de l'installation ──────────────────────────────────────────────────

/** `seen` : une visite a été reçue · `detected` : code repéré à la dernière lecture, aucune visite encore · `missing` : rien. */
export type MeasureState = "seen" | "detected" | "missing";

export function measureState(measure: { seenAt: Date | null; detectedOnSite: boolean }): MeasureState {
  if (measure.seenAt !== null) return "seen";
  return measure.detectedOnSite ? "detected" : "missing";
}

/** Libellé de l'état. `seenLabel` : date de la première visite, déjà mise en forme. */
export function measureStatusLabel(state: MeasureState, seenLabel: string | null): string {
  if (state === "seen") return seenLabel ? `Première visite reçue le ${seenLabel}` : "Première visite reçue";
  if (state === "detected") return "Code repéré dans vos pages, en attente d'une première visite";
  return "Pas encore installé";
}

// ─── Refus de la mesure par un visiteur ──────────────────────────────────────

/** Adresse du site du client suivie d'une ancre du code de mesure (`https://www.mon-cabinet.fr/#mesure-off`). */
export function measureAnchorUrl(siteUrl: string, anchor: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  let hasPath = false;
  try {
    hasPath = new URL(base).pathname.replace(/\/+$/, "") !== "";
  } catch {
    hasPath = false;
  }
  return `${base}${hasPath ? "" : "/"}${anchor}`;
}

/**
 * Paragraphe prêt à coller dans la politique de confidentialité du site du
 * praticien : ce qui est mesuré, sans cookie ni suivi publicitaire, et
 * comment un visiteur refuse la mesure. Il ne dit que ce que le code fait.
 */
export function privacyParagraph(siteUrl: string): string {
  return [
    "Mesure d'audience",
    "Ce site mesure sa fréquentation avec un outil fourni par notre prestataire Harmony : nombre de visites, pages consultées, site d'où viennent les visiteurs, clics sur les liens de prise de rendez-vous et sur le numéro de téléphone. " +
      "Cet outil ne dépose aucun cookie et ne sert à aucun suivi publicitaire. Les visiteurs sont comptés de façon anonyme, avec un identifiant technique qui change chaque jour ; votre adresse IP n'est pas conservée.",
    `Vous pouvez refuser cette mesure : ouvrez ce site à l'adresse ${measureAnchorUrl(siteUrl, EXTERNAL_MEASURE_OPTOUT.off)} et votre refus sera enregistré dans votre navigateur. ` +
      `Pour revenir sur ce choix, ouvrez l'adresse ${measureAnchorUrl(siteUrl, EXTERNAL_MEASURE_OPTOUT.on)}. Le réglage « Ne pas me pister » de votre navigateur est également respecté.`,
  ].join("\n\n");
}

// ─── Installation, par outil de création de site ─────────────────────────────

export type InstallGuideId = ExternalCms | "other";

export type InstallGuide = {
  id: InstallGuideId;
  /** Nom de l'outil */
  label: string;
  /** `false` : l'outil ne permet pas d'ajouter ce code */
  possible: boolean;
  /** Condition à remplir chez l'éditeur de l'outil (offre, domaine) */
  requirement?: string;
  /** Étapes, dans l'ordre. Les libellés des menus sont donnés en français, avec le libellé anglais quand l'outil l'affiche souvent ainsi. */
  steps: string[];
  /** Point d'attention après l'installation, ou ce qui se passe quand ce n'est pas possible */
  note?: string;
};

const GUIDES: Record<InstallGuideId, Omit<InstallGuide, "id" | "label">> = {
  wordpress: {
    possible: true,
    requirement: "Sur WordPress.com, il faut une offre qui autorise les extensions.",
    steps: [
      "Dans l'administration de votre site, ouvrez « Extensions », puis « Ajouter ». Installez et activez l'extension gratuite « WPCode ».",
      "Ouvrez le menu « Code Snippets », puis « Header & Footer ».",
      "Collez le code dans la zone « Header », puis enregistrez (« Save Changes »).",
    ],
    note: "Si votre site utilise une extension de cache, videz le cache après l'installation.",
  },
  wix: {
    possible: true,
    requirement: "Il faut un site publié, relié à votre propre nom de domaine (offre payante).",
    steps: [
      "Dans le tableau de bord de votre site, ouvrez « Paramètres » (Settings).",
      "Cliquez sur « Code personnalisé » (Custom Code), puis sur « + Ajouter un code personnalisé ».",
      "Collez le code. Choisissez « Toutes les pages », « Charger le code une fois », et l'emplacement « Head ».",
      "Cliquez sur « Appliquer ».",
    ],
    note: "Si vous changez de nom de domaine, Wix retire ce code : il faudra le remettre.",
  },
  squarespace: {
    possible: true,
    requirement: "Disponible avec les offres Core, Plus et Advanced.",
    steps: [
      "Dans les réglages de votre site, ouvrez « Injection de code » (Code Injection).",
      "Collez le code dans la zone « En-tête » (Header).",
      "Enregistrez.",
    ],
  },
  jimdo: {
    possible: true,
    requirement: "Possible avec Jimdo Creator en offre payante. Avec l'autre version de Jimdo (Dolphin), ce n'est pas toujours possible.",
    steps: ["Ouvrez « Paramètres » (Settings), puis « Modifier l'en-tête » (Edit Head).", "Collez le code, puis enregistrez."],
  },
  webador: {
    possible: true,
    requirement: "Disponible avec les offres Pro et Business.",
    steps: [
      "Ouvrez « Paramètres » (Settings), puis « Avancé » (Advanced), puis « Ajouter du code HTML personnalisé » (Add custom HTML code).",
      "Choisissez l'emplacement « fin de <body> », collez le code, puis enregistrez.",
    ],
  },
  webflow: {
    possible: true,
    requirement: "Il faut une offre payante pour votre site.",
    steps: [
      "Ouvrez les réglages du site (Site settings), puis « Custom code ».",
      "Collez le code dans la zone « Head code », puis cliquez sur « Save ».",
      "Publiez votre site (Publish) : le code n'est actif qu'après publication.",
    ],
  },
  google_sites: {
    possible: false,
    steps: [],
    note: "Google Sites ne permet pas d'ajouter ce code. Les visites de votre site ne peuvent donc pas être mesurées ici ; vos contenus et vos liens, eux, s'appuient bien sur votre site.",
  },
  shopify: {
    possible: true,
    steps: [
      "Dans l'administration de votre boutique, ouvrez « Boutique en ligne », puis « Thèmes ».",
      "Sur votre thème, cliquez sur « … », puis sur « Modifier le code ».",
      "Ouvrez le fichier « theme.liquid », collez le code juste avant la ligne </head>, puis enregistrez.",
    ],
  },
  other: {
    possible: true,
    steps: [
      "Le code se place sur toutes les pages de votre site, juste avant la balise </head>.",
      "Si quelqu'un s'occupe de votre site, envoyez-lui ce code : l'ajouter lui prendra quelques minutes.",
    ],
  },
};

/** Outils proposés à tous, dans l'ordre de l'écran. Les autres (`shopify`) n'apparaissent que s'ils ont été repérés sur le site. */
const LISTED: readonly InstallGuideId[] = ["wordpress", "wix", "squarespace", "jimdo", "webador", "webflow", "google_sites", "other"];

const guideOf = (id: InstallGuideId): InstallGuide => ({ id, label: id === "other" ? "Autre outil, ou site fait sur mesure" : EXTERNAL_CMS_LABELS[id], ...GUIDES[id] });

/**
 * Pas-à-pas d'installation : celui de l'outil repéré sur le site d'abord
 * (`detected`), les autres ensuite (`others`, à présenter repliés). Sans outil
 * repéré, `detected` est `null` et tous sont dans `others`.
 */
export function installGuides(cms: ExternalCms | undefined): { detected: InstallGuide | null; others: InstallGuide[] } {
  return {
    detected: cms ? guideOf(cms) : null,
    others: LISTED.filter((id) => id !== cms).map(guideOf),
  };
}
