import { describe, expect, it } from "vitest";
import { checkEthicalComplianceDeep } from "./guardrails";
import { createSiteGenerator, resolveAiMode } from "./generate-site";
import type { GenerationInput } from "./types";

const INPUTS: GenerationInput[] = [
  {
    firstName: "Claire",
    lastName: "Dupont",
    profession: "Sophrologue",
    city: "Albi",
    gender: "feminin",
    highlightedMotifs: [],
    motifPageCount: 6,
  },
  {
    firstName: "Séverine",
    lastName: "Salesa",
    profession: "Masseuse bien-être",
    city: "Clapiers",
    gender: "feminin",
    highlightedMotifs: ["Gestion du stress"],
    motifPageCount: 6,
    googleEnrichment: { businessName: "Séverine Massages", rating: 5, reviewCount: 34 },
  },
  {
    firstName: "Marc",
    lastName: "Rey",
    profession: "Ostéopathe",
    city: "Lyon",
    gender: "masculin",
    highlightedMotifs: [],
    motifPageCount: 3,
  },
  {
    firstName: "Ana",
    lastName: "Gomez",
    profession: "Énergéticienne",
    city: "Pau",
    gender: "feminin",
    highlightedMotifs: ["Sommeil", "Ancrage"],
    motifPageCount: 3,
  },
];

describe("resolveAiMode", () => {
  it("mode mock sans clé API", () => {
    expect(resolveAiMode({} as NodeJS.ProcessEnv)).toBe("mock");
  });
  it("mode anthropic avec clé", () => {
    expect(resolveAiMode({ ANTHROPIC_API_KEY: "sk-x" } as NodeJS.ProcessEnv)).toBe("anthropic");
  });
  it("AI_MOCK=1 force le mock même avec clé", () => {
    expect(resolveAiMode({ ANTHROPIC_API_KEY: "sk-x", AI_MOCK: "1" } as NodeJS.ProcessEnv)).toBe(
      "mock",
    );
  });
});

describe("pipeline mock", () => {
  const generator = createSiteGenerator({ AI_MOCK: "1" } as NodeJS.ProcessEnv);

  it.each(INPUTS)("génère un site complet et conforme pour $profession à $city", async (input) => {
    const home = await generator.generateHome(input);

    expect(home.siteName).toContain(input.firstName);
    expect(home.metaTitle).toContain(input.city);
    expect(home.motifsPlan).toHaveLength(input.motifPageCount);
    expect(home.sections.map((s) => s.type)).toEqual([
      "hero",
      "specialties",
      "about",
      "reviews",
      "process",
      "faq",
      "contact",
    ]);

    // Le gating de formule est respecté par le plan de motifs
    const specialties = home.sections.find((s) => s.type === "specialties");
    expect(specialties && specialties.type === "specialties" && specialties.items).toHaveLength(
      input.motifPageCount,
    );

    for (const motif of home.motifsPlan) {
      const page = await generator.generateMotifPage(input, motif);
      expect(page.slug).toBe(motif.slug);
      expect(page.sections.some((s) => s.type === "richText")).toBe(true);
      expect(checkEthicalComplianceDeep(page).ok).toBe(true);
    }

    const reviews = await generator.generateReviews(input);
    expect(reviews.length).toBeGreaterThanOrEqual(4);
    for (const review of reviews) {
      expect(review.rating).toBeGreaterThanOrEqual(4);
    }

    const articles = await generator.generateArticles(input, home.motifsPlan);
    expect(articles).toHaveLength(3);
    for (const article of articles) {
      expect(article.slug).toMatch(/^[a-z0-9-]+$/);
      expect(article.content.length).toBeGreaterThan(300);
    }

    // Conformité éthique de bout en bout
    expect(checkEthicalComplianceDeep({ home, reviews, articles }).ok).toBe(true);
  });

  it("les motifs saisis à la création passent en premier", async () => {
    const input = INPUTS[1]!;
    const home = await generator.generateHome(input);
    expect(home.motifsPlan[0]?.title).toBe("Gestion du stress");
  });

  it("est déterministe (même entrée → même sortie)", async () => {
    const a = await generator.generateHome(INPUTS[0]!);
    const b = await generator.generateHome(INPUTS[0]!);
    expect(a).toEqual(b);
  });
});
