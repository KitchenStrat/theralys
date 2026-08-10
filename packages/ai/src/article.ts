/**
 * Rédaction d'un article du calendrier éditorial (job J-7), paramétrée par
 * « Votre voix » (réglages du blog) : désignation (nous/je/on), accord
 * (féminin/masculin), lecteur (vous/tu), ton.
 */

import { z } from "zod";
import { slugify } from "@theralys/shared";
import { completeStructured } from "./anthropic";
import { resolveAiMode } from "./generate-site";
import { checkEthicalComplianceDeep } from "./guardrails";
import { resolveProfession } from "./mock/catalog";
import { ARTICLE_STRUCTURE } from "./prompts";
import { stockQueryFor } from "./stock";

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

export type ArticleBrief = {
  topic: string;
  motifSlug: string | null;
  motifTitle: string | null;
  profession: string;
  city: string;
  firstName: string;
};

export type VoicedArticle = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  /** Requête (anglais) pour la photo de banque d'images de couverture */
  imageQuery?: string;
};

const voicedArticleSchema = z.object({
  title: z.string().min(10),
  slug: z.string().min(3),
  excerpt: z.string().min(20),
  content: z.string().min(300),
  imageQuery: z.string().optional(),
});

const TONE_LABEL: Record<BlogVoice["tone"], string> = {
  chaleureux: "chaleureux et accueillant",
  rassurant: "rassurant et apaisant",
  pose: "posé et sobre",
  direct: "direct et concret",
  pedagogue: "pédagogue et explicatif",
};

export type ArticleGenerator = {
  mode: "anthropic" | "mock";
  generateArticle(brief: ArticleBrief, voice: BlogVoice): Promise<VoicedArticle>;
};

export function createArticleGenerator(env: NodeJS.ProcessEnv = process.env): ArticleGenerator {
  const mode = resolveAiMode(env);
  if (mode === "mock") {
    return {
      mode,
      generateArticle: async (brief, voice) => {
        const article = mockVoicedArticle(brief, voice);
        const { ok, violations } = checkEthicalComplianceDeep(article);
        if (!ok) throw new Error(`Article mock non conforme : ${violations[0]?.rule}`);
        return article;
      },
    };
  }
  return {
    mode,
    generateArticle: (brief, voice) =>
      completeStructured(
        { apiKey: env.ANTHROPIC_API_KEY!, model: env.ANTHROPIC_MODEL },
        articleSystemPrompt(voice),
        articleUserPrompt(brief, voice),
        voicedArticleSchema,
      ),
  };
}

function articleSystemPrompt(voice: BlogVoice): string {
  return `Tu rédiges un article de blog SEO local pour le site d'un praticien en médecines douces.
Markdown, maillage naturel avec la spécialité et la ville.

VOIX IMPOSÉE (réglages du client, à respecter strictement) :
- Désignation du praticien : « ${voice.designation} » (${voice.designation === "je" ? "première personne du singulier" : voice.designation === "nous" ? "première personne du pluriel" : "pronom « on »"}), accords au ${voice.accord}.
- Adresse au lecteur : ${voice.reader === "vous" ? "vouvoiement" : "tutoiement"}.
- Ton : ${TONE_LABEL[voice.tone]}.

${ARTICLE_STRUCTURE}`;
}

function articleUserPrompt(brief: ArticleBrief, voice: BlogVoice): string {
  return `CONTEXTE :
- Praticien : ${brief.firstName}, ${brief.profession} à ${brief.city}
- Sujet imposé (calendrier éditorial) : « ${brief.topic} »
- Spécialité rattachée : ${brief.motifTitle ?? "aucune en particulier"}
- Lecteur : ${voice.reader === "vous" ? "vouvoyé" : "tutoyé"}

Produis un JSON de la forme :
{ "title": "…", "slug": "slug-url", "excerpt": "1-2 phrases", "content": "markdown ~450 mots", "imageQuery": "3-5 mots ANGLAIS pour la photo de banque d'images de couverture (concret et visuel, jamais de nom propre)" }`;
}

// ─── Mock déterministe, sensible à la voix ────────────────────────────────────

export function mockVoicedArticle(brief: ArticleBrief, voice: BlogVoice): VoicedArticle {
  const practice = resolveProfession(brief.profession).practiceName;
  const you = voice.reader === "vous" ? "vous" : "tu";

  // Petites briques accordées à la voix
  const subj = (je: string, nous: string, on: string) =>
    voice.designation === "je" ? je : voice.designation === "nous" ? nous : on;
  const yourAdj = voice.reader === "vous" ? "votre" : "ton";
  const yourPl = voice.reader === "vous" ? "vos" : "tes";
  const canYou = voice.reader === "vous" ? "vous pouvez" : "tu peux";
  const feelYou = voice.reader === "vous" ? "vous ressentez" : "tu ressens";

  const toneIntro: Record<BlogVoice["tone"], string> = {
    chaleureux: `Si ${you} ${voice.reader === "vous" ? "lisez" : "lis"} ces lignes, c'est sans doute que ${yourAdj} corps ${you} envoie des signaux. Bonne nouvelle : il existe des réponses douces, et cet article est là pour ${voice.reader === "vous" ? "vous" : "te"} guider.`,
    rassurant: `Ce que ${you} ${feelYou} est fréquent, et il n'y a aucune raison de s'inquiéter outre mesure. Prenons le temps de comprendre ce qui se joue, calmement.`,
    pose: `Prenons quelques minutes pour examiner ce sujet posément, loin des promesses toutes faites.`,
    direct: `Allons droit au but : voici ce qu'il faut savoir, et ce que ${canYou} mettre en place dès aujourd'hui.`,
    pedagogue: `Pour bien comprendre, commençons par le commencement : que se passe-t-il exactement dans ${yourAdj} corps, et comment agir ?`,
  };

  const title = brief.topic;
  const content = [
    toneIntro[voice.tone],
    "",
    `## Ce qui se joue dans ${yourAdj} quotidien`,
    "",
    `Rythme soutenu, sollicitations permanentes, pauses qui se font rares : le corps encaisse, puis finit par le faire savoir. ${capitalize(feelYou)} peut-être des tensions qui s'installent, un sommeil moins réparateur, une énergie en dents de scie.`,
    "",
    `Ces signaux ne sont pas anodins : ce sont des messages. Les zones les plus souvent touchées :`,
    "",
    `- **Les épaules et la nuque** : la zone classique de la charge mentale`,
    `- **Le bas du dos** : souvent associé aux longues journées assises`,
    `- **La mâchoire** : un indicateur fréquent de tension accumulée`,
    `- **Le souffle** : une respiration qui se bloque ou se raccourcit`,
    "",
    `> « J'ai l'impression que mon corps parle quand les mots manquent. »`,
    "",
    `## Comment ${practice} peut ${voice.reader === "vous" ? "vous accompagner" : "t'accompagner"}`,
    "",
    `${capitalize(subj("Je commence", "Nous commençons", "On commence"))} toujours par un temps d'échange : où en ${voice.reader === "vous" ? "êtes-vous" : "es-tu"}, qu'est-ce qui pèse en ce moment ? ${capitalize(subj("Je construis", "Nous construisons", "On construit"))} ensuite la séance autour de ${yourPl} besoins du jour${brief.motifTitle ? `, en particulier autour de « ${brief.motifTitle.toLowerCase()} »` : ""}. Ce que cela peut apporter, concrètement :`,
    "",
    `1. **Un relâchement progressif** des zones de tension`,
    `2. **Une meilleure conscience corporelle** — repérer les signaux avant qu'ils ne s'installent`,
    `3. **Un espace de décompression** dans une semaine chargée`,
    `4. **Des repères simples** à réutiliser chez ${voice.reader === "vous" ? "vous" : "toi"}`,
    "",
    `### Un exercice à essayer maintenant`,
    "",
    `Voici une technique simple pour amorcer un relâchement, en trois minutes :`,
    "",
    `1. ${capitalize(voice.reader === "vous" ? "Asseyez-vous" : "Assieds-toi")} confortablement, pieds à plat sur le sol.`,
    `2. ${capitalize(voice.reader === "vous" ? "Fermez" : "Ferme")} les yeux et ${voice.reader === "vous" ? "posez vos" : "pose tes"} mains sur ${yourPl} cuisses.`,
    `3. ${capitalize(voice.reader === "vous" ? "Inspirez" : "Inspire")} lentement par le nez pendant 4 secondes.`,
    `4. ${capitalize(voice.reader === "vous" ? "Retenez" : "Retiens")} l'air 2 secondes.`,
    `5. ${capitalize(voice.reader === "vous" ? "Expirez" : "Expire")} lentement par la bouche pendant 6 secondes.`,
    `6. ${capitalize(voice.reader === "vous" ? "Répétez" : "Répète")} 6 fois, en relâchant les épaules à chaque expiration.`,
    "",
    `## Quand consulter ?`,
    "",
    `Quelques situations où une séance peut être utile :`,
    "",
    `- ${capitalize(feelYou)} des tensions qui reviennent chaque semaine malgré le repos`,
    `- ${capitalize(yourAdj)} sommeil est perturbé par des douleurs ou une agitation physique`,
    `- ${capitalize(voice.reader === "vous" ? "Vous voulez" : "Tu veux")} offrir à ${yourAdj} corps une vraie pause`,
    "",
    `${capitalize(subj("Je vous accueille", voice.reader === "tu" ? "Nous t'accueillons" : "Nous vous accueillons", voice.reader === "tu" ? "On t'accueille" : "On vous accueille"))} sur rendez-vous à ${brief.city}, dans un cadre calme et chaleureux. Cette pratique de bien-être ne se substitue ni à un avis médical ni à un suivi par un professionnel de santé : en cas de douleur intense ou persistante, ${voice.reader === "vous" ? "consultez" : "consulte"} d'abord ${yourAdj} médecin.`,
    "",
    `## Questions fréquentes`,
    "",
    `**Le stress peut-il vraiment provoquer des douleurs physiques ?**`,
    "",
    `Oui, c'est fréquent : les tensions émotionnelles se traduisent souvent par des contractures musculaires, notamment au niveau des épaules, du dos et de la mâchoire.`,
    "",
    `**Combien de séances faut-il pour ressentir un mieux-être ?**`,
    "",
    `Tout dépend de la situation de chacun : certaines personnes ressentent une détente dès la première séance, d'autres préfèrent un accompagnement régulier. Nous en parlons ensemble, sans engagement.`,
    "",
    `**La séance est-elle douloureuse ?**`,
    "",
    `Non : chaque séance s'ajuste en continu à ${yourAdj} confort, et rien n'est jamais forcé.`,
  ].join("\n");

  // Correction du "Je vous accueille" quand le lecteur est tutoyé
  const fixed =
    voice.designation === "je" && voice.reader === "tu"
      ? content.replace("Je vous accueille", "Je t'accueille")
      : content;

  return {
    title,
    slug: slugify(title),
    excerpt: toneIntro[voice.tone],
    content: fixed,
    imageQuery: stockQueryFor(brief.topic, brief.profession),
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
