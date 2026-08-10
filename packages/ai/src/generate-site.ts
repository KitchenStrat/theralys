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
      return {
        ...ensureHomeSections(result, input),
        theme: { preset: seed.themePreset, fontPreset: "chaleureux" },
      };
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

/**
 * Filet de sécurité structurel : si le modèle omet un des encarts attendus
 * (bandeau de points forts, projection vers l'avenir, badges du hero, cartes
 * infos de l'à-propos), on l'insère avec un contenu par défaut — le praticien
 * l'ajuste ensuite dans l'éditeur.
 */
export function ensureHomeSections(
  home: Omit<GeneratedHome, "theme">,
  input: GenerationInput,
): Omit<GeneratedHome, "theme"> {
  const fem = input.gender === "feminin";
  const sections = [...home.sections];
  const has = (type: string) => sections.some((s) => s.type === type);
  const insertAfter = (anchor: string, section: (typeof sections)[number]) => {
    const i = sections.findIndex((s) => s.type === anchor);
    sections.splice(i === -1 ? 1 : i + 1, 0, section);
  };

  if (!has("highlights")) {
    insertAfter("hero", {
      type: "highlights",
      items: [
        {
          icon: "medaille",
          title: fem ? "Praticienne diplômée" : "Praticien diplômé",
          text: `${fem ? "Formée et certifiée" : "Formé et certifié"} dans sa discipline`,
        },
        { icon: "mains", title: "Séance personnalisée", text: "Chaque séance adaptée à vos besoins" },
        { icon: "fleur", title: "Cadre apaisant", text: "Un espace calme, propice au lâcher-prise" },
        { icon: "carte", title: "Cabinet facile d'accès", text: `Au cœur de ${input.city}` },
      ],
    });
  }

  if (!has("future")) {
    insertAfter(has("specialties") ? "specialties" : "highlights", {
      type: "future",
      badge: "Santé & Équilibre",
      title: "Et si vous retrouviez enfin un quotidien plus léger ?",
      intro: "Grâce à un accompagnement **personnalisé**, il devient possible de :",
      bullets: [
        "**Relâcher les tensions** accumulées dans le corps et l'esprit",
        "**Retrouver un sommeil** plus profond et plus régulier",
        "**Apaiser le stress** et les réactions disproportionnées du quotidien",
        "**Reprendre confiance** en vous, à votre rythme et sans pression",
        "**Installer des habitudes** simples qui vous font durablement du bien",
      ],
      ctaLabel: "Prendre Rendez-Vous",
    });
  }

  return {
    ...home,
    sections: sections.map((section) => {
      if (section.type === "hero" && (!section.stats || section.stats.length === 0)) {
        return {
          ...section,
          stats: [
            { icon: "diplome", value: "+1000", label: "Patients accompagnés" },
            input.googleEnrichment?.rating
              ? {
                  icon: "etoile",
                  value: `${input.googleEnrichment.rating}/5`,
                  label: `Basé sur ${input.googleEnrichment.reviewCount ?? "nos"} avis Google`,
                }
              : { icon: "medaille", value: "6 ans", label: "D'expérience" },
          ],
        };
      }
      if (section.type === "about" && (!section.infoCards || section.infoCards.length === 0)) {
        return {
          ...section,
          infoCards: [
            { icon: "horloge", title: "Durée de la séance", text: "**45 à 60 minutes** en moyenne" },
            { icon: "euro", title: "Tarification", text: "Séance **60 €**\nCB, chèque ou espèces" },
            {
              icon: "document",
              title: "Remboursement",
              text: "Prise en charge par de **nombreuses mutuelles**",
            },
          ],
        };
      }
      if (section.type === "contact" && (!section.infoCards || section.infoCards.length === 0)) {
        return {
          ...section,
          infoCards: [
            { icon: "medaille", title: "6 années d'expérience", text: capitalize(input.profession) },
            {
              icon: "carte",
              title: "Cabinet facile d'accès",
              text: "Parking à proximité et horaires flexibles",
            },
          ],
        };
      }
      return section;
    }),
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
