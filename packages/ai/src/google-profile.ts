/**
 * Fiche Google (studio) : analyse des avis (sentiment, thèmes, réponse
 * proposée) et posts Google — contrat des générateurs, conversion d'une
 * publication sociale en post Google, mocks déterministes.
 *
 * L'audit et le plan d'action sont déterministes (`auditGoogleProfile`,
 * `@theralys/shared`) : aucun appel IA.
 *
 * Mode réel (completeStructured) : lot « fournisseur + IA ». Mode mock :
 * règles simples sur la note et le vocabulaire, réponses assemblées avec les
 * briques de voix, toujours passées par les garde-fous éthiques.
 */

import {
  GOOGLE_POST_CTAS,
  GOOGLE_POST_SUMMARY_MAX,
  GOOGLE_POST_TEMPLATES,
  GOOGLE_REPLY_MAX,
  GOOGLE_REVIEW_TOPICS,
  captionToGoogleSummary,
  sentimentFromRating,
  truncateAtSentence,
  type GooglePostContent,
  type GooglePostCta,
  type GoogleReviewAnalysis,
  type GoogleReviewTopic,
  type SocialPillar,
  type SocialSiteBrief,
  type SocialSlot,
  type SocialTemplate,
  type SocialVoice,
} from "@theralys/shared";
import { resolveAiMode } from "./generate-site";
import { checkEthicalCompliance } from "./guardrails";
import {
  SOCIAL_BIO_LINE,
  createSocialGenerator,
  type FinalizedPost,
  type SocialGenerationContext,
  type SocialGenerator,
} from "./social";
import { voiceBricks } from "./voice";

// ─── Avis : analyse et réponses proposées ────────────────────────────────────

export type ReviewForAnalysis = {
  /** google_reviews.id */
  id: string;
  authorName: string;
  rating: number;
  text: string;
  reviewedAt: Date | null;
  /** Réponse déjà publiée (si connue) : l'analyse propose alors une réponse « améliorée » facultative */
  ownerReply: string | null;
};

export type ReviewsAnalysisInput = {
  brief: SocialSiteBrief;
  reviews: ReviewForAnalysis[];
  now: Date;
};

export type GoogleReviewsAnalyzer = {
  mode: "anthropic" | "mock";
  /** Une analyse par avis (clé = id), ≤ 20 avis par appel ; les avis dont la réponse enfreint les garde-fous sont omis. */
  analyze(input: ReviewsAnalysisInput): Promise<Record<string, GoogleReviewAnalysis>>;
};

const TOPIC_PATTERNS: Record<GoogleReviewTopic, RegExp> = {
  accueil: /accueil|chaleureu|bienveill|souriant|gentil/i,
  ecoute: /écoute|ecoute|attenti|compréhen|comprehen/i,
  efficacite: /efficac|résultat|resultat|mieux|amélior|amelior|sommeil|apais|détendu|detendu/i,
  douceur: /douceur|doux|douce|calme|apaisant/i,
  explications: /expli|pédagog|pedagog|clair|comprend/i,
  locaux: /cabinet|locaux|salle|lieu|endroit|accès|acces|parking|bruyant/i,
  tarifs: /tarif|prix|cher|coût|cout|€/i,
  ponctualite: /ponctu|retard|attente|heure/i,
  disponibilite: /disponib|rendez-vous|rdv|joindre|téléphone|telephone|rapide/i,
  suivi: /suivi|conseil|outils|exercice|accompagn/i,
};

/** Thèmes détectés par vocabulaire (mock et repli), ≤ 4, dans l'ordre de GOOGLE_REVIEW_TOPICS. */
export function detectReviewTopics(text: string): GoogleReviewTopic[] {
  return GOOGLE_REVIEW_TOPICS.filter((t) => TOPIC_PATTERNS[t.id].test(text))
    .map((t) => t.id)
    .slice(0, 4);
}

/** Prénom d'un auteur « Camille D. » → « Camille » ; vide si inexploitable. */
export function reviewerFirstName(authorName: string): string {
  const first = authorName.trim().split(/\s+/)[0] ?? "";
  return /^[\p{L}'’-]{2,}$/u.test(first) ? first : "";
}

/**
 * Réponse proposée (mock) : remerciement, écho d'un thème, invitation —
 * jamais de confirmation d'un suivi, de données de santé ni de promesse.
 */
export function mockReviewReply(review: ReviewForAnalysis, voice: SocialVoice, brief: SocialSiteBrief): string {
  const b = voiceBricks(voice);
  const first = reviewerFirstName(review.authorName);
  const name = first ? ` ${first}` : "";
  const sentiment = sentimentFromRating(review.rating);
  const topics = detectReviewTopics(review.text);
  const sign = b.subj(`${brief.practitioner.firstName}`, `L'équipe ${brief.practitioner.practiceName}`, `${brief.practitioner.firstName}`);
  const echo: Partial<Record<GoogleReviewTopic, string>> = {
    accueil: b.subj("Je tiens à ce que chacun se sente accueilli dès la porte.", "Nous tenons à ce que chacun se sente accueilli dès la porte.", "On tient à ce que chacun se sente accueilli dès la porte."),
    ecoute: "L'écoute est au cœur de chaque séance.",
    efficacite: `Chaque personne avance à son rythme, ${b.yourAdj} ressenti est le meilleur repère.`,
    douceur: "La douceur fait partie de l'approche.",
    explications: "Comprendre ce que l'on fait aide à le refaire chez soi.",
    locaux: "Le cabinet est pensé pour être un lieu de calme.",
    tarifs: b.subj("Je comprends que le tarif compte ; n'hésitez pas à m'en parler, il existe des formules adaptées.", "Nous comprenons que le tarif compte ; n'hésitez pas à nous en parler.", "On comprend que le tarif compte ; n'hésitez pas à en parler."),
    ponctualite: b.subj("Je veille à respecter les horaires de chacun.", "Nous veillons à respecter les horaires de chacun.", "On veille à respecter les horaires de chacun."),
    disponibilite: b.subj("Je fais au mieux pour rester joignable ; le site permet aussi de réserver.", "Nous faisons au mieux pour rester joignables ; le site permet aussi de réserver.", "On fait au mieux pour rester joignable ; le site permet aussi de réserver."),
    suivi: "Les outils proposés sont faits pour être réutilisés au quotidien.",
  };
  const echoLine = topics.map((t) => echo[t]).find((line) => line) ?? "";
  const thanks = b.reader(`Merci${name} pour votre retour`, `Merci${name} pour ton retour`);
  let text: string;
  if (sentiment === "positif") {
    text = `${thanks}, il me touche beaucoup. ${echoLine} ${b.reader("Au plaisir de vous retrouver au cabinet.", "Au plaisir de te retrouver au cabinet.")}`;
  } else if (sentiment === "mitige") {
    text = `${thanks} et pour votre franchise. ${echoLine} ${b.subj("Je reste à votre disposition pour en parler directement.", "Nous restons à votre disposition pour en parler directement.", "On reste à votre disposition pour en parler directement.")}`;
  } else {
    text = `${thanks}. ${b.subj("Je suis désolée que la séance n'ait pas répondu à vos attentes et j'aimerais comprendre ce qui a manqué : n'hésitez pas à me contacter directement.", "Nous sommes désolés que la séance n'ait pas répondu à vos attentes et aimerions comprendre ce qui a manqué : n'hésitez pas à nous contacter directement.", "On est désolé que la séance n'ait pas répondu à vos attentes ; n'hésitez pas à nous contacter directement pour en parler.")}`;
    if (voice.accord === "masculin") text = text.replace("désolée", "désolé");
  }
  text = `${text.replace(/\s+/g, " ").trim()}\n— ${sign}`;
  return text.length > GOOGLE_REPLY_MAX ? truncateAtSentence(text, GOOGLE_REPLY_MAX) : text;
}

export function mockReviewsAnalysis(input: ReviewsAnalysisInput): Record<string, GoogleReviewAnalysis> {
  const out: Record<string, GoogleReviewAnalysis> = {};
  for (const review of input.reviews.slice(0, 20)) {
    const suggestedReply = mockReviewReply(review, input.brief.voice, input.brief);
    if (!checkEthicalCompliance(suggestedReply).ok) continue;
    out[review.id] = {
      sentiment: sentimentFromRating(review.rating),
      topics: detectReviewTopics(review.text),
      suggestedReply,
      generatedAt: input.now.toISOString(),
      generator: "mock",
      voice: input.brief.voice,
    };
  }
  return out;
}

export function createGoogleReviewsAnalyzer(env: NodeJS.ProcessEnv = process.env): GoogleReviewsAnalyzer {
  const mode = resolveAiMode(env);
  if (mode === "mock") return { mode, analyze: async (input) => mockReviewsAnalysis(input) };
  return {
    mode,
    analyze: async () => {
      throw new Error("GoogleReviewsAnalyzer (anthropic) : à implémenter");
    },
  };
}

// ─── Posts Google ────────────────────────────────────────────────────────────

export type GoogleMonthInput = SocialGenerationContext & {
  /** "YYYY-MM" */
  month: string;
  /** Créneaux libres (socialSlotsForMonth avec postDays [GOOGLE_POST_DAY]) */
  slots: SocialSlot[];
};

export type GoogleRequestInput = SocialGenerationContext & {
  topic: string;
  accentHex: string | null;
  /** "YYYY-MM-DD" */
  scheduledFor: string;
};

/** Liens disponibles pour le bouton d'action (choisi par le code, jamais par le modèle). */
export type GooglePostLinks = {
  /** URL publique du site (avec protocole) */
  siteUrl: string;
  bookingUrl: string | null;
};

export type FinalizedGooglePost = {
  scheduledFor: string;
  template: SocialTemplate;
  pillar: SocialPillar;
  /** ≤ 70 caractères, affiché dans le calendrier */
  topic: string;
  content: GooglePostContent;
};

export type GooglePostGenerator = {
  mode: "anthropic" | "mock";
  planMonth(brief: SocialSiteBrief, input: GoogleMonthInput, links: GooglePostLinks): Promise<FinalizedGooglePost[]>;
  generateRequest(brief: SocialSiteBrief, input: GoogleRequestInput, links: GooglePostLinks): Promise<FinalizedGooglePost>;
};

/** Bouton d'action selon le pilier et les liens disponibles. */
export function chooseGoogleCta(pillar: SocialPillar, links: GooglePostLinks, articleHref: string | null): { type: GooglePostCta; url: string | null } {
  if ((pillar === "article" || pillar === "nouvel_article") && articleHref) return { type: "LEARN_MORE", url: articleHref };
  if (links.bookingUrl && pillar !== "idee_recue" && pillar !== "coulisses") return { type: "BOOK", url: links.bookingUrl };
  return { type: "LEARN_MORE", url: links.siteUrl };
}

/**
 * Publication sociale (format static) → post Google : texte sans hashtags ni
 * « lien dans ma bio », première diapositive comme visuel 4:3, bouton d'action.
 */
export function toGooglePost(post: FinalizedPost, links: GooglePostLinks): FinalizedGooglePost {
  const slide = post.content.slides[0] ?? { role: "single" as const, title: post.topic, body: "" };
  const articleHref = post.content.sourceRefs.find((r) => r.kind === "article" && r.href)?.href ?? null;
  const template: SocialTemplate = GOOGLE_POST_TEMPLATES.includes(post.template) ? post.template : "affirmation";
  const summary = captionToGoogleSummary(post.content.caption, SOCIAL_BIO_LINE).slice(0, GOOGLE_POST_SUMMARY_MAX);
  const content: GooglePostContent = {
    pillar: post.pillar,
    accentRole: post.content.accentRole,
    summary,
    cta: chooseGoogleCta(post.pillar, links, articleHref),
    slide: { ...slide, role: "single" },
    altText: post.content.altText,
    sourceRefs: post.content.sourceRefs,
    voice: post.content.voice,
    generator: post.content.generator,
    ...(post.content.note ? { note: post.content.note } : {}),
    ...(post.content.planDays ? { planDays: post.content.planDays } : {}),
  };
  return { scheduledFor: post.scheduledFor, template, pillar: post.pillar, topic: post.topic, content };
}

export function isGoogleCta(value: string): value is GooglePostCta {
  return GOOGLE_POST_CTAS.some((c) => c.id === value);
}

/**
 * Générateur de posts Google. Première version : s'appuie sur le générateur
 * social (format static) puis convertit (`toGooglePost`). Le lot IA peut
 * remplacer le prompt par une variante « fiche Google » (texte ≤ 1 500
 * caractères, sans hashtags, bouton d'action) en conservant ce contrat.
 */
export function createGooglePostGenerator(
  env: NodeJS.ProcessEnv = process.env,
  social: SocialGenerator = createSocialGenerator(env),
): GooglePostGenerator {
  return {
    mode: social.mode,
    planMonth: async (brief, input, links) => {
      const posts = await social.planMonth(brief, { ...input, slots: input.slots, month: input.month });
      return posts.filter((p) => p.format === "static").map((p) => toGooglePost(p, links));
    },
    generateRequest: async (brief, input, links) => {
      const post = await social.generateRequest(brief, { ...input, format: "static" });
      return toGooglePost(post, links);
    },
  };
}
