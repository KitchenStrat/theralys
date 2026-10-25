import { describe, expect, it } from "vitest";
import { firstSocialError, normalizeSocialLinks, socialUrlError } from "./social-links";

describe("socialUrlError", () => {
  it("vide = valide ; https + domaine du réseau (www. et sous-domaines tolérés)", () => {
    expect(socialUrlError("instagram", "")).toBeNull();
    expect(socialUrlError("instagram", "   ")).toBeNull();
    expect(socialUrlError("instagram", "https://instagram.com/claire")).toBeNull();
    expect(socialUrlError("instagram", "https://www.instagram.com/claire/")).toBeNull();
    expect(socialUrlError("facebook", "https://m.facebook.com/claire")).toBeNull();
    expect(socialUrlError("linkedin", "https://fr.linkedin.com/in/claire")).toBeNull();
    expect(socialUrlError("tiktok", "https://www.tiktok.com/@claire")).toBeNull();
    expect(socialUrlError("youtube", "https://www.youtube.com/@claire")).toBeNull();
  });

  it("refuse http://, les autres domaines et les faux sous-domaines", () => {
    expect(socialUrlError("instagram", "http://instagram.com/claire")).toMatch(/https:\/\//);
    expect(socialUrlError("instagram", "instagram.com/claire")).toMatch(/https:\/\//);
    expect(socialUrlError("instagram", "https://facebook.com/claire")).toMatch(/instagram\.com/);
    expect(socialUrlError("instagram", "https://notinstagram.com/claire")).toMatch(/instagram\.com/);
    expect(socialUrlError("instagram", "https://instagram.com.evil.fr/claire")).toMatch(/instagram\.com/);
    expect(socialUrlError("youtube", "https://")).toMatch(/invalide/);
  });

  it("firstSocialError remonte la première erreur dans l'ordre des réseaux", () => {
    expect(firstSocialError({})).toBeNull();
    expect(firstSocialError({ instagram: "https://www.instagram.com/x", facebook: "http://facebook.com/x" })).toMatch(
      /Facebook/,
    );
  });

  it("normalizeSocialLinks retire les vides et retourne undefined si rien n'est saisi", () => {
    expect(normalizeSocialLinks({})).toBeUndefined();
    expect(normalizeSocialLinks({ instagram: "  ", youtube: "" })).toBeUndefined();
    expect(normalizeSocialLinks({ instagram: " https://www.instagram.com/x ", facebook: "" })).toEqual({
      instagram: "https://www.instagram.com/x",
    });
  });
});
