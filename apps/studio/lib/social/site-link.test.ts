import { describe, expect, it } from "vitest";
import { captionFor } from "@theralys/shared";
import { plannerRows, type ExportablePost } from "./export";
import { captionTxt } from "./render/bundle";
import { bioLinksOf, linkOptionsOf, socialSiteLink } from "./site-link";

const HOSTED = "https://demo.harmony-web.fr/claire-dupont-sophrologue-albi";
const OWN = "https://www.claire-dupont.fr";
const BIO = "Pour prendre rendez-vous, le lien est dans ma bio.";

const connected = { externalSite: { url: OWN, active: true } };

describe("socialSiteLink : adresse et mode décidés ensemble", () => {
  it("sans site connecté : adresse du site hébergé, liens avec src", () => {
    for (const theme of [null, undefined, {}]) {
      expect(socialSiteLink(HOSTED, theme)).toEqual({ url: HOSTED, sourceParam: true });
    }
  });

  it("site du client connecté mais pas encore la référence : rien ne change", () => {
    expect(socialSiteLink(HOSTED, { externalSite: { url: OWN, active: false } })).toEqual({ url: HOSTED, sourceParam: true });
  });

  it("réglage actif dont l'adresse n'est pas valable : le site hébergé reste la référence", () => {
    expect(socialSiteLink(HOSTED, { externalSite: { url: "pas une adresse", active: true } })).toEqual({ url: HOSTED, sourceParam: true });
    expect(socialSiteLink(HOSTED, { externalSite: { url: "https://www.instagram.com/claire", active: true } })).toEqual({ url: HOSTED, sourceParam: true });
  });

  it("site du client en référence : son adresse, sans src", () => {
    expect(socialSiteLink(HOSTED, connected)).toEqual({ url: OWN, sourceParam: false });
    // Que le site hébergé reste visible des moteurs ou non ne change rien aux liens
    expect(socialSiteLink(HOSTED, { externalSite: { url: OWN, active: true, keepHostedIndexed: true } })).toEqual({ url: OWN, sourceParam: false });
    expect(linkOptionsOf(socialSiteLink(HOSTED, connected))).toEqual({ sourceParam: false });
    expect(linkOptionsOf(socialSiteLink(HOSTED, null))).toEqual({ sourceParam: true });
  });
});

describe("bioLinksOf : carte « Votre lien de bio »", () => {
  it("site hébergé : un lien par réseau (ig, puis fb)", () => {
    expect(bioLinksOf(socialSiteLink(HOSTED, null))).toEqual({ main: `${HOSTED}?src=ig`, facebook: `${HOSTED}?src=fb` });
    expect(bioLinksOf(socialSiteLink("https://claire-dupont.harmony-web.fr", null))).toEqual({
      main: "https://claire-dupont.harmony-web.fr/?src=ig",
      facebook: "https://claire-dupont.harmony-web.fr/?src=fb",
    });
  });

  it("site du client : un seul lien pour tous les réseaux, l'adresse seule", () => {
    expect(bioLinksOf(socialSiteLink(HOSTED, connected))).toEqual({ main: OWN, facebook: null });
  });
});

describe("légendes et exports selon le site de référence", () => {
  const post: ExportablePost = {
    id: "0f5b7b2a-5b1e-4c8a-9b1f-2f3c4d5e6f70",
    scheduledFor: "2026-11-17",
    topic: "Respirer avant un entretien",
    format: "static",
    content: { caption: `Une accroche.\n\n${BIO}`, hashtags: ["#SophrologueAlbi", "#Albi"] },
    imageUrl: "",
  };

  it("site hébergé : liens tracés partout (légende, CSV, fichier de légendes)", () => {
    const link = socialSiteLink(HOSTED, null);
    const options = linkOptionsOf(link);
    expect(captionFor("facebook", post.content, link.url, BIO, options)).toContain(`${HOSTED}?src=fb`);
    const rows = plannerRows([post], link.url, BIO, options);
    expect(rows[1]!.text).toContain(`${HOSTED}?src=fb`);
    expect(rows[2]!.text).toContain(`${HOSTED}?src=li`);
    const txt = captionTxt({ ...post.content, altText: "" }, { siteUrl: link.url, bioLine: BIO, ...options });
    expect(txt).toContain(`${HOSTED}?src=fb`);
    expect(txt).toContain(`${HOSTED}?src=li`);
  });

  it("site du client : son adresse seule partout, jamais l'adresse hébergée ni de src", () => {
    const link = socialSiteLink(HOSTED, connected);
    const options = linkOptionsOf(link);
    const facebook = captionFor("facebook", post.content, link.url, BIO, options);
    expect(facebook).toBe(`Une accroche.\n\nPour prendre rendez-vous : ${OWN}\n\n#SophrologueAlbi #Albi`);
    const rows = plannerRows([post], link.url, BIO, options);
    expect(rows.map((r) => r.network)).toEqual(["Instagram", "Facebook", "LinkedIn"]);
    expect(rows[1]!.text).toBe(facebook);
    expect(rows[2]!.text).toBe(facebook);
    const txt = captionTxt({ ...post.content, altText: "" }, { siteUrl: link.url, bioLine: BIO, ...options });
    for (const text of [...rows.map((r) => r.text), txt]) {
      expect(text).not.toContain("src=");
      expect(text).not.toContain("harmony-web.fr");
    }
    expect(txt).toBe(
      [
        `=== Instagram ===\nUne accroche.\n\n${BIO}\n\n#SophrologueAlbi #Albi`,
        `=== Facebook ===\n${facebook}`,
        `=== LinkedIn ===\n${facebook}\n`,
      ].join("\n\n"),
    );
  });
});
