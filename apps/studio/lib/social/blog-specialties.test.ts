import { describe, expect, it } from "vitest";
import { EMPTY_EXTERNAL_PROFILE, externalSpecialties, type ExternalSiteProfile } from "@theralys/shared";
import { withReferenceSpecialties, type MotifSlugs } from "./blog-specialties";

/** Profil du site du client : deux spécialités, dont une qui porte le même identifiant qu'une page du site hébergé. */
const profile: ExternalSiteProfile = {
  ...EMPTY_EXTERNAL_PROFILE,
  headline: "Sophrologie à Albi",
  specialties: [
    { slug: "gestion-du-stress", title: "Stress et anxiété", excerpt: "", headings: [], faq: [] },
    { slug: "preparation-aux-examens", title: "Préparation aux examens", excerpt: "", headings: [], faq: [] },
  ],
};

const slugs: MotifSlugs = {
  articles: new Map([
    ["a-commun", "gestion-du-stress"],
    ["a-client", "preparation-aux-examens"],
    ["a-heberge", "sommeil"],
    ["a-sans", null],
  ]),
  entries: new Map([["e-client", "preparation-aux-examens"]]),
};

describe("withReferenceSpecialties : libellés du calendrier quand le site du client est la référence", () => {
  const specialties = externalSpecialties(profile);

  it("spécialité du site du client : son titre, à la place de celui de la page hébergée du même identifiant", () => {
    const items = [
      { articleId: "a-commun", title: "Article 1", motifTitle: "Gestion du stress" },
      { articleId: "a-client", title: "Article 2" },
      { entryId: "e-client", title: "Sujet planifié" },
    ];
    expect(withReferenceSpecialties(items, slugs, specialties)).toEqual([
      { articleId: "a-commun", title: "Article 1", motifTitle: "Stress et anxiété" },
      { articleId: "a-client", title: "Article 2", motifTitle: "Préparation aux examens" },
      { entryId: "e-client", title: "Sujet planifié", motifTitle: "Préparation aux examens" },
    ]);
  });

  it("article d'avant la connexion (spécialité du site hébergé seulement), sans spécialité ou inconnu : inchangé", () => {
    const hosted = { articleId: "a-heberge", title: "Article 3", motifTitle: "Sommeil et récupération" };
    const none = { articleId: "a-sans", title: "Article 4" };
    const unknown = { articleId: "a-inconnu", title: "Article 5", motifTitle: "Ancien libellé" };
    const orphan = { title: "Sans identifiant", motifTitle: "Libellé" };
    const out = withReferenceSpecialties([hosted, none, unknown, orphan], slugs, specialties);
    expect(out).toEqual([hosted, none, unknown, orphan]);
    expect(out[0]).toBe(hosted);
  });

  it("ne modifie pas les éléments reçus ; sans spécialité sur le site du client, rien ne change", () => {
    const item = { articleId: "a-commun", title: "Article 1", motifTitle: "Gestion du stress" };
    const out = withReferenceSpecialties([item], slugs, specialties);
    expect(item.motifTitle).toBe("Gestion du stress");
    expect(out[0]).not.toBe(item);
    expect(withReferenceSpecialties([item], slugs, externalSpecialties(EMPTY_EXTERNAL_PROFILE))[0]).toBe(item);
  });
});
