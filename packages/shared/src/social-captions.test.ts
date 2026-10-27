import { describe, expect, it } from "vitest";
import { bioLinkFor, captionFor, sourceFromReferrer } from "./social-captions";

const BIO = "Pour prendre rendez-vous, le lien est dans ma bio.";

describe("captionFor", () => {
  const content = {
    caption: `Une accroche.\n\nUn développement.\n\n${BIO}\n\nClaire, sophrologue à Albi`,
    hashtags: ["#SophrologueAlbi", "#Albi", "#Sophrologie", "#BienEtre", "#Stress"],
  };
  it("Instagram : légende intacte et tous les hashtags", () => {
    const text = captionFor("instagram", content, "https://site.fr", BIO);
    expect(text).toContain(BIO);
    expect(text.endsWith("#SophrologueAlbi #Albi #Sophrologie #BienEtre #Stress")).toBe(true);
  });
  it("Facebook et LinkedIn : lien du site tracé à la place de la bio, 3 hashtags au plus", () => {
    const fb = captionFor("facebook", content, "https://site.fr", BIO);
    expect(fb).not.toContain("bio");
    expect(fb).toContain("Pour prendre rendez-vous : https://site.fr/?src=fb");
    expect(fb.endsWith("#SophrologueAlbi #Albi #Sophrologie")).toBe(true);
    const li = captionFor("linkedin", { caption: "Sans ligne bio.", hashtags: [] }, "https://site.fr/", BIO);
    expect(li).toBe("Sans ligne bio.\n\nPour prendre rendez-vous : https://site.fr/?src=li");
  });
});

describe("provenance", () => {
  it("src du lien de bio, puis referrer, sinon direct", () => {
    expect(sourceFromReferrer("https://google.com/", "ig")).toBe("instagram");
    expect(sourceFromReferrer("https://l.instagram.com/?u=x", null)).toBe("instagram");
    expect(sourceFromReferrer("https://m.facebook.com/", null)).toBe("facebook");
    expect(sourceFromReferrer("https://www.linkedin.com/feed/", null)).toBe("linkedin");
    expect(sourceFromReferrer("https://www.google.fr/", null)).toBe("google");
    expect(sourceFromReferrer("https://www.google.co.uk/", null)).toBe("google");
    expect(sourceFromReferrer("", null)).toBe("direct");
    expect(sourceFromReferrer("https://exemple.fr/", null)).toBe("other");
    expect(sourceFromReferrer("pas une url", null)).toBe("other");
  });
  it("bioLinkFor ajoute src sans casser l'URL", () => {
    expect(bioLinkFor("https://site.fr/", "instagram")).toBe("https://site.fr/?src=ig");
    expect(bioLinkFor("https://site.fr/?a=1", "linkedin")).toBe("https://site.fr/?a=1&src=li");
  });
});
