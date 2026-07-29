import { checkEthicalComplianceDeep } from "./guardrails";
import { completeStructured } from "./anthropic";
import {
  ARTICLES_SYSTEM,
  HOME_SYSTEM,
  MOTIF_SYSTEM,
  REVIEWS_SYSTEM,
  articlesUserPrompt,
  homeUserPrompt,
  motifUserPrompt,
  reviewsUserPrompt,
} from "./prompts";
import {
  generatedArticlesSchema,
  generatedHomeSchema,
  generatedMotifPageSchema,
  generatedReviewsSchema,
} from "./schemas";
import {
  mockGenerateArticles,
  mockGenerateHome,
  mockGenerateMotifPage,
  mockGenerateReviews,
} from "./mock/generator";
import { resolveProfession } from "./mock/catalog";
import type {
  GeneratedArticle,
  GeneratedHome,
  GeneratedMotifPage,
  GeneratedReview,
  GenerationInput,
  MotifPlan,
} from "./types";

export type AiMode = "anthropic" | "mock";

/** Mode mock si AI_MOCK=1 ou si aucune clé API n'est configurée. */
export function resolveAiMode(env: NodeJS.ProcessEnv = process.env): AiMode {
  if (env.AI_MOCK === "1" || env.AI_MOCK === "true") return "mock";
  return env.ANTHROPIC_API_KEY ? "anthropic" : "mock";
}

export type SiteGenerator = {
  mode: AiMode;
  generateHome(input: GenerationInput): Promise<GeneratedHome>;
  generateMotifPage(input: GenerationInput, motif: MotifPlan): Promise<GeneratedMotifPage>;
  generateReviews(input: GenerationInput): Promise<GeneratedReview[]>;
  generateArticles(input: GenerationInput, motifs: MotifPlan[]): Promise<GeneratedArticle[]>;
};

export function createSiteGenerator(env: NodeJS.ProcessEnv = process.env): SiteGenerator {
  const mode = resolveAiMode(env);
  if (mode === "mock") {
    return {
      mode,
      // Les fonctions mock sont synchrones ; on garde une API async homogène.
      generateHome: async (input) => assertCompliant(mockGenerateHome(input)),
      generateMotifPage: async (input, motif) =>
        assertCompliant(mockGenerateMotifPage(input, motif)),
      generateReviews: async (input) => assertCompliant(mockGenerateReviews(input)),
      generateArticles: async (input, motifs) =>
        assertCompliant(mockGenerateArticles(input, motifs)),
    };
  }

  const opts = { apiKey: env.ANTHROPIC_API_KEY!, model: env.ANTHROPIC_MODEL };
  return {
    mode,
    async generateHome(input) {
      const result = await completeStructured(
        opts,
        HOME_SYSTEM,
        homeUserPrompt(input),
        generatedHomeSchema,
      );
      // Le thème reste déterminé par le catalogue métier (cohérence visuelle)
      const seed = resolveProfession(input.profession);
      return { ...result, theme: { preset: seed.themePreset, fontPreset: "chaleureux" } };
    },
    generateMotifPage(input, motif) {
      return completeStructured(opts, MOTIF_SYSTEM, motifUserPrompt(input, motif), generatedMotifPageSchema);
    },
    generateReviews(input) {
      return completeStructured(opts, REVIEWS_SYSTEM, reviewsUserPrompt(input), generatedReviewsSchema);
    },
    generateArticles(input, motifs) {
      return completeStructured(opts, ARTICLES_SYSTEM, articlesUserPrompt(input, motifs), generatedArticlesSchema);
    },
  };
}

/** Filet de sécurité : même le contenu mock passe par les garde-fous. */
function assertCompliant<T>(value: T): T {
  const { ok, violations } = checkEthicalComplianceDeep(value);
  if (!ok) {
    throw new Error(
      `Contenu mock non conforme au marketing éthique : ${violations
        .slice(0, 3)
        .map((v) => `[${v.rule}] ${v.excerpt}`)
        .join(" | ")}`,
    );
  }
  return value;
}
