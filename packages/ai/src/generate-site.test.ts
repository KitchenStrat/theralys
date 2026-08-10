import { describe, expect, it } from "vitest";
import { checkEthicalComplianceDeep } from "./guardrails";
import { createSiteGenerator, ensureHomeSections, resolveAiMode } from "./generate-site";
import { mockGenerateHome } from "./mock/generator";
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
      "highlights",
      "specialties",
      "future",
      "about",
      "reviews",
      "process",
      "faq",
      "contact",
    ]);

    const future = home.sections.find((s) => s.type === "future");
    expect(future && future.type === "future" && future.bullets).toHaveLength(5);

    // Les nouveaux encarts sont générés par défaut
    const hero = home.sections.find((s) => s.type === "hero");
    expect(hero && hero.type === "hero" && hero.stats).toHaveLength(2);
    const highlights = home.sections.find((s) => s.type === "highlights");
    expect(highlights && highlights.type === "highlights" && highlights.items).toHaveLength(4);
    const about = home.sections.find((s) => s.type === "about");
    expect(about && about.type === "about" && about.infoCards).toHaveLength(3);

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

describe("ensureHomeSections (filet de sécurité)", () => {
  const input = INPUTS[0]!;

  it("insère les encarts manquants quand le modèle les omet", () => {
    const home = {
      siteName: "Test",
      metaTitle: "t",
      metaDescription: "d",
      sections: [
        { type: "hero" as const, title: "Un espace pour souffler", paragraphs: ["p"] },
        { type: "specialties" as const, title: "Spécialités", items: [] },
        { type: "about" as const, title: "À propos", paragraphs: ["p"] },
        { type: "contact" as const, title: "Informations" },
      ],
      motifsPlan: [],
    };
    const fixed = ensureHomeSections(home, input);
    expect(fixed.sections.map((s) => s.type)).toEqual([
      "hero",
      "highlights",
      "specialties",
      "future",
      "about",
      "contact",
    ]);
    const hero = fixed.sections.find((s) => s.type === "hero");
    expect(hero && hero.type === "hero" && hero.stats).toHaveLength(2);
    const about = fixed.sections.find((s) => s.type === "about");
    expect(about && about.type === "about" && about.infoCards).toHaveLength(3);
    const contact = fixed.sections.find((s) => s.type === "contact");
    expect(contact && contact.type === "contact" && contact.infoCards).toHaveLength(2);
    expect(checkEthicalComplianceDeep(fixed).ok).toBe(true);
  });

  it("ne modifie rien quand tout est déjà présent", () => {
    const complete = mockGenerateHome(input);
    const fixed = ensureHomeSections(complete, input);
    expect(fixed.sections).toEqual(complete.sections);
  });
});
