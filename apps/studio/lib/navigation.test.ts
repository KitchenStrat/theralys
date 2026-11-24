import { describe, expect, it } from "vitest";
import { SECTIONS, SECTION_GROUPS, SECTION_ORDER, allowedSections } from "@/components/ds/sections";

describe("navigation de l'espace client", () => {
  it("« Mon site » et « Blog SEO » forment un même ensemble, sans intitulé, au-dessus de « Me faire connaître »", () => {
    expect(SECTION_GROUPS.map((group) => group.key)).toEqual(["mon-site", "visibilite", "publicite", "apprendre"]);
    const [site, visibility] = SECTION_GROUPS;
    expect(site).toMatchObject({ sections: ["mon-site", "publications"], heading: false });
    expect(visibility).toMatchObject({ label: "Me faire connaître", sections: ["reseaux-sociaux", "fiche-google"] });
    expect(visibility!.heading).toBeUndefined();
  });

  it("chaque section est rangée dans le groupe qu'elle déclare, une seule fois", () => {
    for (const group of SECTION_GROUPS) {
      for (const key of group.sections) expect(SECTIONS[key].group, key).toBe(group.key);
    }
    const grouped = SECTION_GROUPS.flatMap((group) => group.sections);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(SECTION_ORDER.filter((key) => SECTIONS[key].group !== null)).toEqual(grouped);
  });

  it("l'ordre des entrées suit la barre latérale : accueil, site, blog, puis le reste", () => {
    expect(allowedSections({ publications: true, social: true, google: true, googleAds: true, metaAds: true }).slice(0, 5)).toEqual(["accueil", "mon-site", "publications", "reseaux-sociaux", "fiche-google"]);
  });
});
