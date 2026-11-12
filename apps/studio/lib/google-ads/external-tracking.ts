/**
 * Suivi publicitaire quand les annonces mènent au site du client (Google Ads
 * et Meta Ads). Harmony n'héberge pas ce site et n'y installe rien : le
 * studio dit seulement ce que la dernière lecture du site a relevé dans le
 * code de ses pages, et où la balise s'installe selon l'outil qui a servi à
 * créer le site. Ce que le compte publicitaire reçoit réellement ne se
 * vérifie que dans ce compte — aucun texte d'ici ne l'affirme.
 *
 * Module pur. Les constats reprennent les textes des points de préparation
 * (`EXTERNAL_SITE_CHECK_DETAILS`) : l'onglet Diagnostic et l'onglet
 * Paramétrage disent la même chose avec les mêmes mots.
 */

import { EXTERNAL_CMS_LABELS, EXTERNAL_SITE_CHECK_DETAILS, type ExternalCms, type ExternalSiteFacts } from "@theralys/shared";

/** Écran où le praticien corrige son téléphone, son lien de rendez-vous et ses réseaux, et relance la lecture de son site. */
export const MON_SITE_HREF = "/mon-site";

/** Ce que la dernière lecture du site du client a relevé d'utile au suivi publicitaire. */
export type ExternalSiteTracking = {
  /** Adresse du site du client, sans protocole */
  address: string;
  /** Outil de création du site reconnu, sinon `null` */
  cms: ExternalCms | null;
  /** Balise Google Ads (AW-…) repérée dans le code des pages */
  googleAdsTag: boolean;
  /** Google Tag Manager repéré : une balise peut passer par lui sans apparaître dans le code des pages */
  tagManager: boolean;
  metaPixel: boolean;
  /** Un bandeau de consentement connu a été repéré (la lecture ne les reconnaît pas tous) */
  consentBanner: boolean;
  /** Le code de mesure du studio est en place — repéré dans le code des pages, ou des visites en ont déjà été reçues : les visites du site remontent sur l'accueil */
  measureSnippet: boolean;
  /** `false` : le praticien a collé le texte de ses pages, leur code n'a jamais été lu — rien ne peut être dit de ses balises */
  codeRead: boolean;
};

/** Ce que le studio sait du site du client en dehors du code de ses pages. */
export type ExternalSiteState = {
  /** Origine du contenu (`pasted` : texte collé, code jamais lu) ; absente : lu sur le site */
  source?: "crawl" | "pasted";
  /** Première visite reçue du code de mesure */
  measureSeenAt?: Date | null;
};

/**
 * Relevé de suivi à partir des faits de la dernière lecture — mêmes règles
 * que les services d'analyse (`loadGoogleAdsContext`, `loadMetaAdsContext`) :
 * un identifiant vide ne compte pas, un bandeau n'est acquis que s'il a été
 * repéré.
 */
export function externalSiteTracking(address: string, facts: Pick<ExternalSiteFacts, "tags" | "cms">, state: ExternalSiteState = {}): ExternalSiteTracking {
  const found = (value: string | undefined): boolean => Boolean(value?.trim());
  return {
    address,
    cms: facts.cms ?? null,
    googleAdsTag: found(facts.tags.googleAdsId),
    tagManager: found(facts.tags.googleTagManagerId),
    metaPixel: found(facts.tags.metaPixelId),
    consentBanner: facts.tags.consentBanner === true,
    // Des visites reçues prouvent mieux que la lecture du code que la mesure est en place (balise posée depuis la dernière lecture, ou par un outil que la lecture ne voit pas)
    measureSnippet: facts.tags.measureSnippet === true || Boolean(state.measureSeenAt),
    codeRead: state.source !== "pasted",
  };
}

/** `ok` : repéré · `todo` : non repéré, à installer · `unknown` : la lecture du site ne permet pas de le dire. */
export type TrackingFindingStatus = "ok" | "todo" | "unknown";

/** Une ligne du relevé affiché à la place du formulaire de suivi. */
export type TrackingFinding = {
  id: "tag" | "pixel" | "consent" | "conversions";
  label: string;
  status: TrackingFindingStatus;
  detail: string;
};

/** Bandeau non repéré, dit pour la balise Google Ads (le texte partagé parle du Pixel). */
export const ADS_BANNER_UNKNOWN = "Aucun bandeau cookies n'a été repéré sur votre site : vérifiez que la balise Google Ads ne s'y charge qu'après l'accord du visiteur.";
/** Code du site jamais lu (texte collé) : même rappel, sans prétendre avoir cherché le bandeau. */
export const ADS_BANNER_UNREAD = "Nous n'avons pas pu lire le code de votre site : vérifiez que la balise Google Ads ne s'y charge qu'après l'accord du visiteur.";
/** En tête du relevé quand le code du site n'a jamais été lu. */
export const CODE_UNREAD_NOTE = "Votre site n'a pas pu être lu automatiquement (vous avez collé le texte de ses pages) : nous ne pouvons rien dire des balises qui y sont installées.";

/** Limite de la lecture, rappelée sous chaque relevé : ce qui n'est pas repéré n'est pas forcément absent. */
export const READING_LIMIT =
  "Notre lecture ne voit que le code de vos pages : une balise installée par un autre outil (Google Tag Manager, par exemple), ou chargée seulement après l'accord du visiteur, peut lui échapper. Ce qui fait foi, c'est votre compte publicitaire.";

/** Rappel sous chaque relevé : il ne change qu'à la prochaine lecture du site. */
export const REREAD_REMINDER = "Vous venez de changer quelque chose sur votre site ? Relancez sa lecture depuis « Mon site » : ce relevé se mettra à jour.";

/**
 * Relevé Google Ads du site du client : balise (acquise aussi quand Google
 * Tag Manager est là, comme dans le bilan), bandeau cookies, et conversions —
 * toujours « inconnu », rien ne permet de les lire depuis le site.
 */
export function googleAdsFindings(tracking: ExternalSiteTracking): TrackingFinding[] {
  const texts = EXTERNAL_SITE_CHECK_DETAILS;
  return [
    {
      id: "tag",
      label: "Balise Google Ads sur le site",
      status: tracking.googleAdsTag || tracking.tagManager ? "ok" : tracking.codeRead ? "todo" : "unknown",
      detail: tracking.googleAdsTag ? texts.adsTagOk : tracking.tagManager ? texts.tagManagerOk : tracking.codeRead ? texts.adsTagTodo : texts.adsTagUnread,
    },
    {
      id: "consent",
      label: "Bandeau cookies",
      status: tracking.consentBanner ? "ok" : "unknown",
      detail: tracking.consentBanner ? texts.cookieBannerOk : tracking.codeRead ? ADS_BANNER_UNKNOWN : ADS_BANNER_UNREAD,
    },
    { id: "conversions", label: "Conversions mesurées", status: "unknown", detail: texts.conversionsUnknown },
  ];
}

/** Balise publicitaire à installer : la balise Google, ou le Pixel Meta. */
export type AdTag = "google" | "meta";

/** Où installer une balise publicitaire sur le site du client, selon l'outil qui a servi à le créer. */
export type TagInstallAdvice = {
  /** Nom de l'outil de création du site, quand il a été reconnu */
  tool: string | null;
  /** `false` : l'outil ne permet pas d'installer cette balise */
  possible: boolean;
  /** Où installer la balise avec cet outil, en une ou deux phrases */
  text: string;
};

/** Balise nommée avec son accord : « la balise Google … collée », « le Pixel Meta … collé ». */
const TAG_WORDING: Record<AdTag, { name: string; pasted: string; connect: string; installed: string }> = {
  google: { name: "la balise Google", pasted: "collée", connect: "connectez-la", installed: "installée" },
  meta: { name: "le Pixel Meta", pasted: "collé", connect: "connectez-le", installed: "installé" },
};

/** Sans outil reconnu, ou pour un outil sans pas-à-pas connu : où chercher, et à qui demander. */
function genericAdvice(tag: AdTag): string {
  const brand = tag === "google" ? "« Google »" : "« Meta » ou « Facebook »";
  return `Cherchez dans les réglages de l'outil qui a servi à créer votre site une rubrique ${brand}, « intégrations », « balises » ou « code d'en-tête ». Si quelqu'un s'occupe de votre site, transmettez-lui le code de ${TAG_WORDING[tag].name}.`;
}

/**
 * Où installer une balise publicitaire selon l'outil de création du site
 * (`cms` repéré à la lecture, `null` sinon). Seuls les chemins établis par
 * les pages d'aide de chaque outil sont donnés : Wix refuse les balises
 * Google et Meta dans son « Code personnalisé », Google Sites n'accepte aucun
 * code dans l'en-tête de ses pages. Pour un outil sans chemin connu, le
 * conseil reste général.
 */
export function tagInstallAdvice(cms: ExternalCms | null, tag: AdTag): TagInstallAdvice {
  const { name, pasted, connect, installed } = TAG_WORDING[tag];
  const tool = cms ? EXTERNAL_CMS_LABELS[cms] : null;
  switch (cms) {
    case "wordpress":
      return {
        tool,
        possible: true,
        text: `Sur WordPress, ${name} s'ajoute avec une extension qui insère du code dans l'en-tête de toutes les pages (par exemple WPCode). Sur WordPress.com, il faut une offre qui autorise les extensions.`,
      };
    case "wix":
      return {
        tool,
        possible: true,
        text: `Sur Wix, ${name} ne fonctionne pas une fois ${pasted} dans le « Code personnalisé » : ${connect} depuis les « Intégrations marketing » de votre tableau de bord Wix.`,
      };
    case "squarespace":
      return {
        tool,
        possible: true,
        text: `Sur Squarespace, ${name} se colle dans « Injection de code » (Code Injection), zone « En-tête ». Cette fonction est disponible avec les offres Core, Plus et Advanced.`,
      };
    case "webflow":
      return {
        tool,
        possible: true,
        text: `Sur Webflow, ${name} se colle dans les réglages du site (Site settings), « Custom code », zone « Head code ». Publiez ensuite le site ; il faut une offre payante.`,
      };
    case "jimdo":
      return {
        tool,
        possible: true,
        text: `Sur Jimdo Creator (offre payante), ${name} se colle dans « Paramètres », puis « Modifier l'en-tête » (Edit Head). Avec l'autre version de Jimdo (Dolphin), ce n'est pas toujours possible.`,
      };
    case "webador":
      return {
        tool,
        possible: true,
        text: `Sur Webador (offres Pro et Business), ${name} se colle dans « Paramètres », « Avancé », « Ajouter du code HTML personnalisé ».`,
      };
    case "google_sites":
      return {
        tool,
        possible: false,
        text: `Google Sites ne permet pas d'ajouter de code dans l'en-tête de ses pages : ${name} ne peut pas y être ${installed}. ${
          tag === "google"
            ? "Vos annonces peuvent être diffusées quand même : suivez-les alors sur les clics, dans votre compte Google Ads."
            : "Vos annonces peuvent être diffusées quand même, avec l'objectif « Trafic »."
        }`,
      };
    case "shopify":
    case null:
      return { tool, possible: true, text: genericAdvice(tag) };
  }
}

/** Phrase d'introduction du conseil : l'outil reconnu, ou l'aveu qu'il ne l'a pas été. */
export function tagInstallIntro(advice: Pick<TagInstallAdvice, "tool">): string {
  return advice.tool ? `Votre site semble créé avec ${advice.tool}.` : "Nous n'avons pas reconnu l'outil qui a servi à créer votre site.";
}

// ─── Bloc « Résultats » ──────────────────────────────────────────────────────

/**
 * Textes du bloc « Résultats » quand les annonces mènent au site du client.
 * Sur ce site, le studio ne rattache volontairement aucune visite à une
 * annonce (ce serait un suivi publicitaire, soumis à l'accord du visiteur) :
 * le bloc explique pourquoi et dit où lire chaque chiffre.
 */
export const EXTERNAL_RESULTS = {
  reason:
    "Sur votre propre site, Harmony ne cherche pas à savoir quelles visites viennent de vos annonces : ce serait un suivi publicitaire, que nous ne faisons pas sans l'accord de vos visiteurs.",
  site: "Les visites et les clics vers la prise de rendez-vous de l'ensemble de votre site, toutes provenances confondues, se lisent sur l'accueil du studio.",
  measureMissing: "Ces chiffres demandent le code de mesure de Harmony sur votre site ; nous n'en avons encore reçu aucune visite. Vous le trouverez dans « Mon site ».",
} as const;

/** Où lire les résultats des annonces Google : le compte Google Ads, seul à les connaître. */
export const ADS_RESULTS_ACCOUNT = "Les résultats de vos annonces (clics, coût, conversions) se lisent dans votre compte Google Ads : c'est lui qui fait foi.";
