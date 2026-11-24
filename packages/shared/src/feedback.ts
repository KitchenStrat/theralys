/**
 * Avis des praticiens sur le produit : ce qu'ils nous disent depuis leur
 * espace client (« Votre avis »), quelle que soit leur formule. Vocabulaire
 * commun à l'espace client (saisie) et à l'admin (lecture).
 */

/** De quoi il s'agit : oriente la relecture, et la question posée au praticien. */
export const FEEDBACK_KINDS = ["idea", "problem", "missing", "praise"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  idea: "Une idée",
  problem: "Un problème",
  missing: "Un manque",
  praise: "Ce que j'aime",
};

/**
 * La question qui aide à écrire un avis utile : une situation, pas un simple
 * « c'est bien » ou « ça ne marche pas ».
 */
export const FEEDBACK_KIND_PROMPTS: Record<FeedbackKind, string> = {
  idea: "Qu'aimeriez-vous pouvoir faire, et dans quelle situation ?",
  problem: "Que cherchiez-vous à faire, et que s'est-il passé ?",
  missing: "Qu'est-ce qui vous manque, et pour faire quoi ?",
  praise: "Qu'est-ce qui vous sert le plus, et pourquoi ?",
};

/** L'outil concerné. Les clés des outils sont celles des sections de l'espace client. */
export const FEEDBACK_TOPICS = [
  "general",
  "mon-site",
  "publications",
  "reseaux-sociaux",
  "fiche-google",
  "google-ads",
  "meta-ads",
  "statistiques",
  "compte",
] as const;
export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number];

export const FEEDBACK_TOPIC_LABELS: Record<FeedbackTopic, string> = {
  general: "Harmony en général",
  "mon-site": "Mon site",
  publications: "Blog SEO",
  "reseaux-sociaux": "Réseaux sociaux",
  "fiche-google": "Fiche Google",
  "google-ads": "Google Ads",
  "meta-ads": "Meta Ads",
  statistiques: "Statistiques",
  compte: "Compte et facturation",
};

/** Suivi côté équipe : arrivé, lu, pris en compte. */
export const FEEDBACK_STATUSES = ["new", "read", "done"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Nouveau",
  read: "Lu",
  done: "Pris en compte",
};

/** Un avis utile tient en quelques phrases : assez pour comprendre, pas un roman. */
export const FEEDBACK_MESSAGE_MIN = 20;
export const FEEDBACK_MESSAGE_MAX = 2000;
export const FEEDBACK_RATING_MAX = 5;

/** Liant des émojis composés (U+200D) : un caractère invisible, mais légitime. */
const EMOJI_JOINER = String.fromCharCode(0x200d);

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return typeof value === "string" && (FEEDBACK_KINDS as readonly string[]).includes(value);
}

export function isFeedbackTopic(value: unknown): value is FeedbackTopic {
  return typeof value === "string" && (FEEDBACK_TOPICS as readonly string[]).includes(value);
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

/**
 * Texte d'un avis prêt à être enregistré : fins de ligne unifiées, caractères
 * de contrôle retirés, espaces et lignes vides en trop resserrés. Jamais plus
 * de deux retours à la ligne de suite.
 */
export function normalizeFeedbackMessage(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    // Tabulations et caractères de contrôle (sauf le retour à la ligne) : une espace
    .replace(/[^\S\n]+/g, " ")
    // Caractères de contrôle et invisibles (sens d'écriture forcé, espace sans chasse…) ; le liant des émojis composés reste
    .replace(/[\p{Cc}\p{Cf}]/gu, (char) => (char === "\n" || char === EMOJI_JOINER ? char : ""))
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * L'outil auquel se rapporte la page d'où l'avis est donné : présélectionné
 * dans la fenêtre, modifiable. L'accueil et les pages inconnues valent
 * « Harmony en général ».
 */
export function feedbackTopicForPath(pathname: string): FeedbackTopic {
  const first = pathname.split("?")[0]!.split("/").filter(Boolean)[0] ?? "";
  if (first === "mots-cles") return "publications";
  return isFeedbackTopic(first) && first !== "general" && first !== "statistiques" ? first : "general";
}

/** Chemin de page gardé avec l'avis : sans paramètres ni fragment, borné. */
export function feedbackPagePath(pathname: unknown): string | null {
  if (typeof pathname !== "string") return null;
  const path = pathname.split(/[?#]/)[0]!.trim();
  return /^\/[A-Za-z0-9/_-]{0,119}$/.test(path) ? path : null;
}

export type FeedbackInput = {
  kind: FeedbackKind;
  topic: FeedbackTopic;
  message: string;
  rating: number | null;
  contactOk: boolean;
  page: string | null;
};

export type FeedbackCheck = { ok: true; value: FeedbackInput } | { ok: false; field: "message" | "form"; error: string };

/**
 * Relit ce que la fenêtre « Votre avis » envoie. Tout vient du navigateur :
 * chaque valeur est revérifiée, le texte est normalisé puis borné.
 */
export function checkFeedback(input: unknown): FeedbackCheck {
  if (!input || typeof input !== "object") return { ok: false, field: "form", error: "Avis illisible : rechargez la page et réessayez." };
  const raw = input as Record<string, unknown>;
  if (!isFeedbackKind(raw.kind) || !isFeedbackTopic(raw.topic)) return { ok: false, field: "form", error: "Avis illisible : rechargez la page et réessayez." };
  if (typeof raw.message !== "string" || raw.message.length > FEEDBACK_MESSAGE_MAX * 3) {
    return { ok: false, field: "message", error: `Votre avis est trop long : ${FEEDBACK_MESSAGE_MAX} caractères au plus.` };
  }
  const message = normalizeFeedbackMessage(raw.message);
  if (message.length < FEEDBACK_MESSAGE_MIN) {
    return { ok: false, field: "message", error: "Encore quelques mots : racontez-nous la situation, c'est ce qui nous aide à améliorer Harmony." };
  }
  if (message.length > FEEDBACK_MESSAGE_MAX) {
    return { ok: false, field: "message", error: `Votre avis est trop long : ${FEEDBACK_MESSAGE_MAX} caractères au plus.` };
  }
  const rating = raw.rating === null || raw.rating === undefined ? null : raw.rating;
  if (rating !== null && !(typeof rating === "number" && Number.isInteger(rating) && rating >= 1 && rating <= FEEDBACK_RATING_MAX)) {
    return { ok: false, field: "form", error: "Note illisible : choisissez de 1 à 5 étoiles." };
  }
  return { ok: true, value: { kind: raw.kind, topic: raw.topic, message, rating, contactOk: raw.contactOk === true, page: feedbackPagePath(raw.page) } };
}
