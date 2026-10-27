import { describe, expect, it } from "vitest";
import { formatAdsKeyword, formatAdsKeywordList, formatAdsLines, formatAdsNegativeList } from "./clipboard";

describe("formatAdsKeyword", () => {
  it("met l'expression entre guillemets, l'exact entre crochets, le large nu", () => {
    expect(formatAdsKeyword("sophrologue albi", "phrase")).toBe('"sophrologue albi"');
    expect(formatAdsKeyword("sophrologue albi tarif", "exact")).toBe("[sophrologue albi tarif]");
    expect(formatAdsKeyword("sophrologue", "broad")).toBe("sophrologue");
  });

  it("nettoie les espaces et les délimiteurs déjà présents", () => {
    expect(formatAdsKeyword('  "sophrologue   albi" ', "phrase")).toBe('"sophrologue albi"');
    expect(formatAdsKeyword("[sophrologue albi]", "exact")).toBe("[sophrologue albi]");
    expect(formatAdsKeyword("   ", "phrase")).toBe("");
  });
});

describe("formatAdsKeywordList", () => {
  it("une ligne par mot-clé, dédoublonnée, sans ligne vide", () => {
    expect(
      formatAdsKeywordList([
        { text: "sophrologue albi", match: "phrase" },
        { text: "Sophrologue Albi", match: "phrase" },
        { text: "sophrologue albi avis", match: "exact" },
        { text: " ", match: "broad" },
      ]),
    ).toBe('"sophrologue albi"\n[sophrologue albi avis]');
  });
});

describe("formatAdsNegativeList", () => {
  it("négatifs en correspondance expression, une ligne par mot", () => {
    expect(formatAdsNegativeList(["emploi", "formation", "emploi"])).toBe('"emploi"\n"formation"');
  });
});

describe("formatAdsLines", () => {
  it("titres et descriptions : une ligne par texte, espaces repliés", () => {
    expect(formatAdsLines(["Sophrologue à Albi", "  Prenez   rendez-vous ", "", "Sophrologue à Albi"])).toBe("Sophrologue à Albi\nPrenez rendez-vous");
  });
});
