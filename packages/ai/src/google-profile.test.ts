import { describe, expect, it } from "vitest";
import { buildSocialBrief, slugify, type SocialSiteBrief } from "@theralys/shared";
import type { GenerationInput } from "./types";
import { mockGenerateHome, mockGenerateReviews } from "./mock/generator";
import { resolveProfession } from "./mock/catalog";
import {
  chooseGoogleCta,
  createGooglePostGenerator,
  createGoogleReviewsAnalyzer,
  detectReviewTopics,
  mockReviewReply,
  reviewerFirstName,
} from "./google-profile";
import { checkEthicalCompliance } from "./guardrails";

const env = { AI_MOCK: "1" } as NodeJS.ProcessEnv;
const NOW = new Date("2026-10-26T09:00:00Z");

function brief(): SocialSiteBrief {
  const input: GenerationInput = {
    firstName: "Claire",
    lastName: "Dupont",
    profession: "Sophrologue",
    city: "Albi",
    gender: "feminin",
    highlightedMotifs: [],
    motifPageCount: 6,
  };
  const home = mockGenerateHome(input);
  const reviews = mockGenerateReviews(input).map((r, i) => ({ id: `r${i + 1}`, ...r }));
  return buildSocialBrief({
    site: {
      id: "site-1",
      name: home.siteName,
      type: "client",
      theme: home.theme,
      bookingUrl: "https://rdv.example",
      url: `https://${slugify(home.siteName)}.harmony-web.fr`,
    },
    prospect: { firstName: "Claire", lastName: "Dupont", profession: "Sophrologue", city: "Albi", gender: "feminin", googleRating: 4.9, googleReviewCount: 27 },
    pages: [{ id: "home-1", type: "home", slug: "", title: "Accueil", metaDescription: home.metaDescription, sections: home.sections }],
    articles: [],
    reviews,
    voice: null,
    practiceName: resolveProfession("Sophrologue").practiceName,
    now: NOW,
  }).brief;
}

describe("analyse des avis (mock)", () => {
  it("thèmes et prénom", () => {
    expect(detectReviewTopics("Un accueil chaleureux, très à l'écoute, mais un peu cher.")).toEqual(["accueil", "ecoute", "tarifs"]);
    expect(reviewerFirstName("Camille D.")).toBe("Camille");
    expect(reviewerFirstName("C.")).toBe("");
  });

  it("réponse proposée conforme aux garde-fous, selon le sentiment", async () => {
    const b = brief();
    const analyzer = createGoogleReviewsAnalyzer(env);
    expect(analyzer.mode).toBe("mock");
    const reviews = [
      { id: "r1", authorName: "Camille D.", rating: 5, text: "Un accueil chaleureux et une vraie écoute.", reviewedAt: NOW, ownerReply: null },
      { id: "r2", authorName: "Paul S.", rating: 3, text: "Correct mais cher.", reviewedAt: NOW, ownerReply: null },
      { id: "r3", authorName: "Léa F.", rating: 1, text: "Je n'ai pas accroché.", reviewedAt: NOW, ownerReply: null },
    ];
    const out = await analyzer.analyze({ brief: b, reviews, now: NOW });
    expect(Object.keys(out)).toEqual(["r1", "r2", "r3"]);
    expect(out.r1!.sentiment).toBe("positif");
    expect(out.r2!.sentiment).toBe("mitige");
    expect(out.r3!.sentiment).toBe("negatif");
    expect(out.r1!.suggestedReply).toContain("Merci Camille");
    expect(out.r3!.suggestedReply).toContain("désolée");
    for (const a of Object.values(out)) {
      expect(checkEthicalCompliance(a.suggestedReply).ok).toBe(true);
      expect(a.suggestedReply.length).toBeLessThanOrEqual(600);
      expect(a.generator).toBe("mock");
    }
    expect(mockReviewReply(reviews[0]!, { ...b.voice, reader: "tu" }, b)).toContain("ton retour");
  });
});

describe("posts Google (mock, via le générateur social)", () => {
  it("bouton d'action choisi par le code", () => {
    const links = { siteUrl: "https://s.fr", bookingUrl: "https://rdv.fr" };
    expect(chooseGoogleCta("conseil", links, null)).toEqual({ type: "BOOK", url: "https://rdv.fr" });
    expect(chooseGoogleCta("article", links, "https://s.fr/blog/x")).toEqual({ type: "LEARN_MORE", url: "https://s.fr/blog/x" });
    expect(chooseGoogleCta("coulisses", { siteUrl: "https://s.fr", bookingUrl: null }, null)).toEqual({ type: "LEARN_MORE", url: "https://s.fr" });
  });

  it("un post sur mesure : texte sans hashtags ni « bio », visuel unique, template statique", async () => {
    const b = brief();
    const generator = createGooglePostGenerator(env);
    const post = await generator.generateRequest(
      b,
      { topic: "Bien dormir avant un examen", accentHex: null, scheduledFor: "2026-11-03", recentTopics: [], photosById: {}, refsById: {} },
      { siteUrl: "https://claire-dupont.harmony-web.fr", bookingUrl: "https://rdv.example" },
    );
    expect(post.scheduledFor).toBe("2026-11-03");
    expect(post.content.summary).not.toMatch(/#\w+/);
    expect(post.content.summary).not.toMatch(/bio/i);
    expect(post.content.summary.length).toBeGreaterThan(40);
    expect(post.content.summary.length).toBeLessThanOrEqual(1500);
    expect(post.content.slide.role).toBe("single");
    expect(post.content.cta.type).toBe("BOOK");
    expect(["photo-titre", "affirmation", "question-reponse", "liste-conseils", "infos-pratiques", "avis"]).toContain(post.template);
  });
});
