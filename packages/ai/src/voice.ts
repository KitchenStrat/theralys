/**
 * « Votre voix » (réglages du blog) : type, défaut, libellés de prompt et
 * briques de conjugaison partagées par la rédaction d'articles (article.ts)
 * et les contenus réseaux sociaux (mock/social.ts, social.ts).
 */

import type { SocialVoice } from "@theralys/shared";

export type BlogVoice = {
  designation: "nous" | "je" | "on";
  accord: "feminin" | "masculin";
  reader: "vous" | "tu";
  tone: "chaleureux" | "rassurant" | "pose" | "direct" | "pedagogue";
};

export const DEFAULT_VOICE: BlogVoice = {
  designation: "je",
  accord: "feminin",
  reader: "vous",
  tone: "chaleureux",
};

/**
 * `SocialVoice` (packages/shared, stocké dans social_posts.content) doit rester
 * strictement identique à `BlogVoice` : garde-fou à la compilation.
 */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _socialVoiceMatchesBlogVoice: MutuallyAssignable<BlogVoice, SocialVoice> = true;
void _socialVoiceMatchesBlogVoice;

export const TONE_LABEL: Record<BlogVoice["tone"], string> = {
  chaleureux: "chaleureux et accueillant",
  rassurant: "rassurant et apaisant",
  pose: "posé et sobre",
  direct: "direct et concret",
  pedagogue: "pédagogue et explicatif",
};

/** « première personne du singulier » / « … du pluriel » / « pronom « on » » (prompts). */
export function designationLabel(voice: BlogVoice): string {
  return voice.designation === "je"
    ? "première personne du singulier"
    : voice.designation === "nous"
      ? "première personne du pluriel"
      : "pronom « on »";
}

/** « vouvoiement » / « tutoiement » (prompts). */
export function readerLabel(voice: BlogVoice): string {
  return voice.reader === "vous" ? "vouvoiement" : "tutoiement";
}

export type VoiceBricks = {
  /** « vous » / « tu » */
  you: string;
  /** « votre » / « ton » */
  yourAdj: string;
  /** « vos » / « tes » */
  yourPl: string;
  /** « vous pouvez » / « tu peux » */
  canYou: string;
  /** « vous ressentez » / « tu ressens » */
  feelYou: string;
  /** Forme selon la désignation du praticien (je / nous / on) */
  subj: (je: string, nous: string, on: string) => string;
  /** Forme selon l'adresse au lecteur (vous / tu) */
  reader: (vous: string, tu: string) => string;
};

/** Petites briques accordées à la voix, pour assembler des textes mock. */
export function voiceBricks(voice: BlogVoice): VoiceBricks {
  const vous = voice.reader === "vous";
  return {
    you: vous ? "vous" : "tu",
    yourAdj: vous ? "votre" : "ton",
    yourPl: vous ? "vos" : "tes",
    canYou: vous ? "vous pouvez" : "tu peux",
    feelYou: vous ? "vous ressentez" : "tu ressens",
    subj: (je, nous, on) =>
      voice.designation === "je" ? je : voice.designation === "nous" ? nous : on,
    reader: (v, t) => (vous ? v : t),
  };
}
