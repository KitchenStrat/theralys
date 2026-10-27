import { describe, expect, it } from "vitest";
import { bioLinkFor, captionFor, mentionsSiteUrl, sourceFromReferrer } from "./social-captions";

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
  it("ligne bio reformulée (légende modifiée) : détection souple, un seul lien", () => {
    const edited = { caption: "Une accroche.\n\nLien dans ma bio 👆\n\nClaire", hashtags: [] as string[] };
    const fb = captionFor("facebook", edited, "https://site.fr", BIO);
    expect(fb).toBe("Une accroche.\n\nPour prendre rendez-vous : https://site.fr/?src=fb\n\nClaire");
    expect(fb.match(/src=fb/g)).toHaveLength(1);
    // Une phrase qui cite le mot « bio » sans parler du lien reste intacte
    const biography = captionFor("facebook", { caption: "Ma bio est sur le site.", hashtags: [] }, "https://site.fr", BIO);
    expect(biography).toBe("Ma bio est sur le site.\n\nPour prendre rendez-vous : https://site.fr/?src=fb");
  });
  it("une URL du site déjà présente (même hôte, www ignoré) : pas de lien ajouté ; un autre hôte : lien ajouté", () => {
    const own = { caption: "Tout est là : https://www.site.fr/motifs/stress", hashtags: [] as string[] };
    expect(captionFor("linkedin", own, "https://site.fr", BIO)).toBe("Tout est là : https://www.site.fr/motifs/stress");
    const other = { caption: "Voir https://autre.fr/page", hashtags: [] as string[] };
    expect(captionFor("linkedin", other, "https://site.fr", BIO)).toBe("Voir https://autre.fr/page\n\nPour prendre rendez-vous : https://site.fr/?src=li");
    expect(mentionsSiteUrl("rien", "https://site.fr")).toBe(false);
    expect(mentionsSiteUrl("https://site.fr/", "pas une url")).toBe(false);
  });
  it("hashtags vides : aucun bloc final, sur chaque réseau", () => {
    const empty = { caption: `Une accroche.\n\n${BIO}`, hashtags: [] as string[] };
    expect(captionFor("instagram", empty, "https://site.fr", BIO)).toBe(`Une accroche.\n\n${BIO}`);
    expect(captionFor("facebook", empty, "https://site.fr", BIO)).toBe("Une accroche.\n\nPour prendre rendez-vous : https://site.fr/?src=fb");
    expect(captionFor("linkedin", { caption: "Seule.", hashtags: ["", "  "] }, "https://site.fr", BIO)).toBe(
      "Seule.\n\nPour prendre rendez-vous : https://site.fr/?src=li",
    );
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
  it("referrers d'applications Android (navigateur intégré)", () => {
    expect(sourceFromReferrer("android-app://com.instagram.android", null)).toBe("instagram");
    expect(sourceFromReferrer("android-app://com.instagram.android/", null)).toBe("instagram");
    expect(sourceFromReferrer("android-app://com.facebook.katana", null)).toBe("facebook");
    expect(sourceFromReferrer("android-app://com.facebook.orca/", null)).toBe("facebook");
    expect(sourceFromReferrer("android-app://com.linkedin.android", null)).toBe("linkedin");
    expect(sourceFromReferrer("android-app://com.google.android.googlequicksearchbox/https/www.google.com", null)).toBe("google");
    expect(sourceFromReferrer("android-app://com.google.android.gm", null)).toBe("google");
    expect(sourceFromReferrer("android-app://com.inconnu.app", null)).toBe("other");
    // Le src du lien de bio l'emporte toujours
    expect(sourceFromReferrer("android-app://com.facebook.katana", "ig")).toBe("instagram");
  });
  it("bioLinkFor ajoute src sans casser l'URL", () => {
    expect(bioLinkFor("https://site.fr/", "instagram")).toBe("https://site.fr/?src=ig");
    expect(bioLinkFor("https://site.fr/?a=1", "linkedin")).toBe("https://site.fr/?a=1&src=li");
  });
});
