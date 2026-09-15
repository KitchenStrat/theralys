import { describe, expect, it } from "vitest";
import {
  emphasisFeedback,
  emphasizeLead,
  findEmphasisGaps,
  hasEmphasis,
  needsEmphasisRetry,
} from "./emphasis";
import { buildMotifPlan, mockGenerateHome, mockGenerateMotifPage } from "./mock/generator";
import type { GenerationInput } from "./types";

const LONG = "Une phrase suffisamment longue pour compter comme un texte descriptif du site.";
const LONG_BOLD = "Une phrase suffisamment longue avec un **passage en gras** pour compter.";

describe("findEmphasisGaps", () => {
  it("compte les textes descriptifs longs et signale ceux sans gras", () => {
    const report = findEmphasisGaps({
      sections: [
        { type: "hero", title: LONG, paragraphs: [LONG_BOLD, LONG] },
        { type: "specialties", items: [{ title: "Dos", excerpt: LONG }] },
        { type: "faq", items: [{ question: LONG, answer: LONG_BOLD }] },
        { type: "highlights", items: [{ title: "Court", text: "Trop court pour compter" }] },
      ],
      motifsPlan: [{ slug: "dos", title: "Dos", excerpt: LONG }],
    });
    expect(report.total).toBe(4);
    expect(report.gaps.map((g) => g.path)).toEqual([
      "sections[0].paragraphs[1]",
      "sections[1].items[0].excerpt",
    ]);
  });

  it("ignore les listes ✅ / puces et les titres", () => {
    const report = findEmphasisGaps({
      paragraphs: ["✅ Formée en sophrologie caycédienne\n✅ Dix années d'accompagnement en cabinet"],
      body: "- première puce assez longue pour être comptée sinon\n- seconde puce assez longue aussi",
    });
    expect(report.total).toBe(0);
  });
});

describe("needsEmphasisRetry", () => {
  it("relance seulement pour un oubli systématique", () => {
    const gap = { path: "x", excerpt: "" };
    expect(needsEmphasisRetry({ total: 30, gaps: [gap, gap] })).toBe(false);
    expect(needsEmphasisRetry({ total: 30, gaps: [gap, gap, gap] })).toBe(false);
    expect(needsEmphasisRetry({ total: 20, gaps: [gap, gap, gap] })).toBe(true);
    expect(needsEmphasisRetry({ total: 5, gaps: [gap, gap, gap] })).toBe(true);
  });

  it("formule un retour exploitable par le modèle", () => {
    const text = emphasisFeedback({ total: 12, gaps: [{ path: "sections[2].items[0].excerpt", excerpt: "Le bas du dos tire" }] });
    expect(text).toContain("1 textes sur 12");
    expect(text).toContain("sections[2].items[0].excerpt");
    expect(text).toContain("**gras**");
  });
});

describe("emphasizeLead", () => {
  it("met en gras les premiers mots porteurs", () => {
    expect(emphasizeLead("Des outils concrets de respiration et de relâchement pour apaiser les tensions.")).toBe(
      "**Des outils concrets** de respiration et de relâchement pour apaiser les tensions.",
    );
    expect(emphasizeLead("Nous commençons par un temps d'échange pour comprendre vos attentes.")).toBe(
      "**Nous commençons par un temps** d'échange pour comprendre vos attentes.",
    );
  });

  it("garde une proposition courte ou une énumération entière", () => {
    expect(emphasizeLead("Comptez environ une heure : un temps d'échange, la séance, puis votre ressenti.")).toBe(
      "**Comptez environ une heure** : un temps d'échange, la séance, puis votre ressenti.",
    );
    expect(emphasizeLead("Examens, prise de parole, compétition : arriver préparé le jour J.")).toBe(
      "**Examens, prise de parole, compétition** : arriver préparé le jour J.",
    );
  });

  it("saute une première phrase d'un mot et ne double pas un gras existant", () => {
    expect(emphasizeLead("Non. Cette pratique de bien-être ne se substitue pas à un avis médical.")).toBe(
      "Non. **Cette pratique de bien-être** ne se substitue pas à un avis médical.",
    );
    expect(emphasizeLead(LONG_BOLD)).toBe(LONG_BOLD);
  });

  it("laisse titres, listes et citations d'un markdown intacts", () => {
    const md = "## Titre\n\nUn paragraphe assez long pour être mis en valeur.\n\n- une puce\n> citation";
    expect(emphasizeLead(md)).toBe(
      "## Titre\n\n**Un paragraphe assez long** pour être mis en valeur.\n\n- une puce\n> citation",
    );
    expect(emphasizeLead("✅ Formée en sophrologie")).toBe("✅ Formée en sophrologie");
  });
});

describe("mock : couverture du gras", () => {
  const inputs: GenerationInput[] = [
    { firstName: "Claire", lastName: "Dupont", profession: "Sophrologue", city: "Albi", gender: "feminin", highlightedMotifs: [], motifPageCount: 6 },
    { firstName: "Marc", lastName: "Rey", profession: "Ostéopathe", city: "Lyon", gender: "masculin", highlightedMotifs: ["Douleurs de croissance"], motifPageCount: 3 },
  ];

  it("l'accueil et chaque page de spécialité sont entièrement mis en forme", () => {
    for (const input of inputs) {
      const home = mockGenerateHome(input);
      expect(findEmphasisGaps(home).gaps).toEqual([]);
      const specialties = home.sections.find((s) => s.type === "specialties");
      expect(specialties?.type === "specialties" && specialties.items.every((i) => hasEmphasis(i.excerpt))).toBe(true);
      for (const motif of buildMotifPlan(input)) {
        expect(findEmphasisGaps(mockGenerateMotifPage(input, motif)).gaps).toEqual([]);
      }
    }
  });
});
