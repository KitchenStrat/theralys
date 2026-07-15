import { describe, expect, it } from "vitest";
import { createArticleGenerator, mockVoicedArticle, type BlogVoice } from "./article";
import { checkEthicalComplianceDeep } from "./guardrails";

const BRIEF = {
  topic: "Nuque bloquée au réveil : ce que le massage sportif peut changer",
  motifSlug: "massage-sportif",
  motifTitle: "Massage sportif",
  profession: "Masseuse bien-être",
  city: "Clapiers",
  firstName: "Séverine",
};

describe("mockVoicedArticle — la voix du blog est respectée", () => {
  it("désignation « je » + lecteur « vous »", () => {
    const article = mockVoicedArticle(BRIEF, {
      designation: "je",
      accord: "feminin",
      reader: "vous",
      tone: "chaleureux",
    });
    expect(article.content).toContain("Je vous accueille");
    expect(article.content).toContain("je travaille");
    expect(article.content).not.toMatch(/\btu\b/i);
  });

  it("désignation « nous » + lecteur « tu »", () => {
    const article = mockVoicedArticle(BRIEF, {
      designation: "nous",
      accord: "feminin",
      reader: "tu",
      tone: "direct",
    });
    expect(article.content).toContain("nous travaillons");
    expect(article.content).toContain("t'accueillons");
    expect(article.content).toContain("tu peux");
    expect(article.content).not.toContain("vous pouvez");
  });

  it("désignation « on »", () => {
    const article = mockVoicedArticle(BRIEF, {
      designation: "on",
      accord: "masculin",
      reader: "vous",
      tone: "pose",
    });
    expect(article.content).toContain("on travaille");
  });

  it("le ton change l'accroche", () => {
    const voices: BlogVoice["tone"][] = ["chaleureux", "rassurant", "pose", "direct", "pedagogue"];
    const intros = voices.map(
      (tone) =>
        mockVoicedArticle(BRIEF, { designation: "je", accord: "feminin", reader: "vous", tone })
          .excerpt,
    );
    expect(new Set(intros).size).toBe(voices.length);
  });

  it("reste conforme au marketing éthique et se termine par le rappel légal", () => {
    for (const reader of ["vous", "tu"] as const) {
      for (const designation of ["je", "nous", "on"] as const) {
        const article = mockVoicedArticle(BRIEF, {
          designation,
          accord: "feminin",
          reader,
          tone: "rassurant",
        });
        expect(checkEthicalComplianceDeep(article).ok).toBe(true);
        expect(article.content).toContain("ne se substitue ni à un avis médical");
      }
    }
  });
});

describe("createArticleGenerator", () => {
  it("mode mock sans clé, articles générés valides", async () => {
    const generator = createArticleGenerator({ AI_MOCK: "1" } as NodeJS.ProcessEnv);
    expect(generator.mode).toBe("mock");
    const article = await generator.generateArticle(BRIEF, {
      designation: "je",
      accord: "feminin",
      reader: "vous",
      tone: "chaleureux",
    });
    expect(article.slug).toMatch(/^[a-z0-9-]+$/);
    expect(article.content.length).toBeGreaterThan(300);
  });
});
