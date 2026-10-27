import { describe, expect, it } from "vitest";
import type { GoogleAdsKeywordGroup } from "@theralys/shared";
import { mentionsCity, nationalQueryExample } from "./keywords";

const group = (intent: GoogleAdsKeywordGroup["intent"], keywords: string[]): GoogleAdsKeywordGroup => ({
  intent,
  label: intent,
  keywords,
  totalVolume: 0,
  medianCpcEur: null,
});

describe("mentionsCity", () => {
  it("reconnaît la ville en fin, en début ou au milieu de la requête, accents et casse ignorés", () => {
    expect(mentionsCity("sophrologie paris", "Paris")).toBe(true);
    expect(mentionsCity("sophrologie paris avis", "paris")).toBe(true);
    expect(mentionsCity("Paris sophrologue", "paris")).toBe(true);
    expect(mentionsCity("sophrologue saint-étienne", "Saint-Étienne")).toBe(true);
  });

  it("ne confond pas la ville avec un mot qui la contient, et ignore une ville vide", () => {
    expect(mentionsCity("sophrologie", "paris")).toBe(false);
    expect(mentionsCity("sophrologue près de chez moi", "paris")).toBe(false);
    expect(mentionsCity("sophrologie parisienne", "paris")).toBe(false);
    expect(mentionsCity("sophrologie paris", "")).toBe(false);
  });
});

describe("nationalQueryExample", () => {
  it("saute les graines qui contiennent la ville, même quand la deuxième la contient", () => {
    const keywords = { seeds: ["sophrologue paris", "sophrologie paris", "sophrologue", "sophrologie"], groups: [] };
    expect(nationalQueryExample(keywords, "paris")).toBe("sophrologue");
  });

  it("sans ville dans les graines, prend la première", () => {
    expect(nationalQueryExample({ seeds: ["sophrologue", "sophrologie"], groups: [] }, "")).toBe("sophrologue");
  });

  it("se rabat sur le groupe « Autour du cabinet », puis sur null", () => {
    const groups = [group("metier_ville", ["sophrologue lyon"]), group("proximite", ["sophrologue lyon centre", "sophrologue près de chez moi"])];
    expect(nationalQueryExample({ seeds: ["sophrologue lyon", "sophrologie lyon"], groups }, "lyon")).toBe("sophrologue près de chez moi");
    expect(nationalQueryExample({ seeds: ["sophrologue lyon"], groups: [group("metier_ville", ["sophrologue lyon"])] }, "lyon")).toBeNull();
    expect(nationalQueryExample({ seeds: [], groups: [] }, "lyon")).toBeNull();
  });
});
