import { describe, expect, it } from "vitest";
import type { GooglePostContent } from "@theralys/shared";
import {
  deliveredGoogleContent,
  deliveredGoogleCta,
  isArticleOnline,
  isRelativeAddress,
  studioArticleId,
  type GooglePostDelivery,
} from "./post-cta";
import { googlePostTxt } from "./render";

const HOSTED = "https://demo.harmony-web.fr/claire-dupont-sophrologue-albi";
const OWN = "https://www.claire-dupont.fr";
const BOOKING = "https://www.doctolib.fr/sophrologue/albi/claire-dupont";
const ARTICLE_ID = "3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b";
const STUDIO_PATH = `/publications/${ARTICLE_ID}`;

type Cta = GooglePostContent["cta"];

/** Site sans site du client : l'adresse de référence est celle du site hébergé. */
const hosted: GooglePostDelivery = { hostedUrl: HOSTED, referenceUrl: HOSTED, bookingUrl: BOOKING, onlineArticles: new Map() };
/** Site du client en référence. */
const own: GooglePostDelivery = { ...hosted, referenceUrl: OWN };

const post = (cta: Cta, status = "ready") => ({ status, content: { cta } });

describe("isRelativeAddress / studioArticleId / isArticleOnline", () => {
  it("relative : sans protocole ; absolue : web, tel:, mailto:", () => {
    for (const url of [STUDIO_PATH, "/reseaux-sociaux", "publications/x", "#contact", "//exemple.fr/page", "www.exemple.fr"]) {
      expect(isRelativeAddress(url)).toBe(true);
    }
    for (const url of [HOSTED, "http://localhost:3000/claire", "tel:+33612345678", "mailto:claire@exemple.fr", " https://exemple.fr "]) {
      expect(isRelativeAddress(url)).toBe(false);
    }
    // Rien à montrer : ni absolue, ni « relative »
    expect(isRelativeAddress(null)).toBe(false);
    expect(isRelativeAddress(undefined)).toBe(false);
    expect(isRelativeAddress("  ")).toBe(false);
  });

  it("identifiant de l'article d'un chemin du studio, et lui seul", () => {
    expect(studioArticleId(STUDIO_PATH)).toBe(ARTICLE_ID);
    expect(studioArticleId(`${STUDIO_PATH.toUpperCase().replace("/PUBLICATIONS/", "/publications/")}/`)).toBe(ARTICLE_ID);
    expect(studioArticleId(` ${STUDIO_PATH}?mois=2026-11 `)).toBe(ARTICLE_ID);
    expect(studioArticleId("/publications/pas-un-identifiant")).toBeNull();
    expect(studioArticleId(`/publications/${ARTICLE_ID}/modifier`)).toBeNull();
    expect(studioArticleId(`${HOSTED}/publications/${ARTICLE_ID}`)).toBeNull();
    expect(studioArticleId(null)).toBeNull();
  });

  it("en ligne : publié, et date de publication passée (règle du brief)", () => {
    const now = new Date("2026-11-12T10:00:00Z");
    expect(isArticleOnline({ status: "published", publishAt: new Date("2026-11-10T07:00:00Z") }, now)).toBe(true);
    expect(isArticleOnline({ status: "published", publishAt: null }, now)).toBe(true);
    expect(isArticleOnline({ status: "published", publishAt: new Date("2026-11-20T07:00:00Z") }, now)).toBe(false);
    for (const status of ["scheduled", "draft", "withdrawn"]) {
      expect(isArticleOnline({ status, publishAt: new Date("2026-11-10T07:00:00Z") }, now)).toBe(false);
    }
  });
});

describe("deliveredGoogleCta : chemin du studio d'un post préparé avant la correction du générateur", () => {
  const stale: Cta = { type: "LEARN_MORE", url: STUDIO_PATH };
  const online = new Map([[ARTICLE_ID, "respirer-avant-un-entretien"]]);

  it("article en ligne : son adresse publique sur le blog hébergé", () => {
    expect(deliveredGoogleCta(post(stale), { ...hosted, onlineArticles: online })).toEqual({
      type: "LEARN_MORE",
      url: `${HOSTED}/blog/respirer-avant-un-entretien`,
    });
    // Site du client en référence : l'article vit toujours sur le blog hébergé
    expect(deliveredGoogleCta(post(stale), { ...own, onlineArticles: online }).url).toBe(`${HOSTED}/blog/respirer-avant-un-entretien`);
    // Barre finale de l'adresse du site : une seule barre avant « blog »
    expect(deliveredGoogleCta(post(stale), { ...hosted, hostedUrl: `${HOSTED}/`, onlineArticles: online }).url).toBe(
      `${HOSTED}/blog/respirer-avant-un-entretien`,
    );
  });

  it("article pas en ligne ou inconnu : le lien de rendez-vous, avec le bouton qui lui correspond", () => {
    expect(deliveredGoogleCta(post(stale), hosted)).toEqual({ type: "BOOK", url: BOOKING });
    expect(deliveredGoogleCta(post(stale), { ...hosted, bookingUrl: "tel:+33612345678" })).toEqual({ type: "CALL", url: "tel:+33612345678" });
    // L'article en ligne d'un autre post ne sert pas de lien à celui-ci
    const other = new Map([["11111111-2222-4333-8444-555555555555", "autre-article"]]);
    expect(deliveredGoogleCta(post(stale), { ...hosted, onlineArticles: other })).toEqual({ type: "BOOK", url: BOOKING });
  });

  it("ni article en ligne ni lien de rendez-vous : l'adresse de référence du site", () => {
    expect(deliveredGoogleCta(post(stale), { ...hosted, bookingUrl: null })).toEqual({ type: "LEARN_MORE", url: HOSTED });
    expect(deliveredGoogleCta(post(stale), { ...own, bookingUrl: "" })).toEqual({ type: "LEARN_MORE", url: OWN });
    // Un lien de rendez-vous lui-même relatif n'est pas un repli valable
    expect(deliveredGoogleCta(post(stale), { ...own, bookingUrl: "#contact" })).toEqual({ type: "LEARN_MORE", url: OWN });
  });

  it("jamais d'adresse relative remise, quels que soient le chemin, le bouton et l'état du post", () => {
    const relatives = [STUDIO_PATH, "/publications/abc", "/reseaux-sociaux?mois=2026-11", "publications", "#", "//exemple.fr"];
    const deliveries = [hosted, own, { ...hosted, bookingUrl: null }, { ...own, bookingUrl: null, onlineArticles: online }];
    for (const url of relatives) {
      for (const type of ["LEARN_MORE", "BOOK", "CALL"] as const) {
        for (const status of ["ready", "published"]) {
          for (const delivery of deliveries) {
            const delivered = deliveredGoogleCta(post({ type, url }, status), delivery);
            expect(isRelativeAddress(delivered.url)).toBe(false);
            expect(delivered.url).toBeTruthy();
          }
        }
      }
    }
  });
});

describe("deliveredGoogleCta : site du client en référence", () => {
  const toSite: Cta = { type: "LEARN_MORE", url: HOSTED };

  it("post pas encore publié qui renvoie au site hébergé : l'adresse de référence", () => {
    expect(deliveredGoogleCta(post(toSite), own)).toEqual({ type: "LEARN_MORE", url: OWN });
    expect(deliveredGoogleCta(post({ type: "LEARN_MORE", url: `${HOSTED}/` }), own).url).toBe(OWN);
  });

  it("ne changent pas : post publié, lien d'article, lien de rendez-vous, autre adresse", () => {
    expect(deliveredGoogleCta(post(toSite, "published"), own)).toBe(toSite);
    const article: Cta = { type: "LEARN_MORE", url: `${HOSTED}/blog/respirer-avant-un-entretien` };
    expect(deliveredGoogleCta(post(article), own)).toBe(article);
    const booking: Cta = { type: "BOOK", url: BOOKING };
    expect(deliveredGoogleCta(post(booking), own)).toBe(booking);
    // Un lien de rendez-vous qui serait l'adresse du site hébergé reste le choix du praticien
    const bookingOnSite: Cta = { type: "BOOK", url: HOSTED };
    expect(deliveredGoogleCta(post(bookingOnSite), own)).toBe(bookingOnSite);
    const elsewhere: Cta = { type: "LEARN_MORE", url: "https://ancien-site.fr" };
    expect(deliveredGoogleCta(post(elsewhere), own)).toBe(elsewhere);
  });
});

describe("deliveredGoogleCta : sans site du client, rien ne change pour une adresse absolue", () => {
  it("le bouton enregistré est rendu tel quel (même objet)", () => {
    const ctas: Cta[] = [
      { type: "LEARN_MORE", url: HOSTED },
      { type: "LEARN_MORE", url: `${HOSTED}/blog/un-article` },
      { type: "BOOK", url: BOOKING },
      { type: "CALL", url: "tel:+33612345678" },
      { type: "LEARN_MORE", url: null },
      { type: "NONE", url: null },
      { type: "NONE", url: STUDIO_PATH },
    ];
    for (const cta of ctas) {
      for (const status of ["ready", "published"]) {
        expect(deliveredGoogleCta(post(cta, status), hosted)).toBe(cta);
      }
    }
  });
});

describe("deliveredGoogleContent et googlePostTxt", () => {
  const content: GooglePostContent = {
    pillar: "nouvel_article",
    accentRole: "primary",
    summary: "Nouvel article : respirer avant un entretien.",
    cta: { type: "LEARN_MORE", url: STUDIO_PATH },
    slide: { role: "single", title: "Respirer avant un entretien", body: "" },
    altText: "Visuel bleu avec un titre.",
    sourceRefs: [{ kind: "article", id: `article:${ARTICLE_ID}`, label: "Article « Respirer avant un entretien »", href: STUDIO_PATH }],
    voice: { designation: "je", accord: "feminin", reader: "vous", tone: "chaleureux" },
    generator: "mock",
  };

  it("le contenu remis ne diffère du contenu enregistré que par le bouton", () => {
    const delivered = deliveredGoogleContent({ status: "ready", content }, own);
    expect(delivered).toEqual({ ...content, cta: { type: "BOOK", url: BOOKING } });
    expect(content.cta.url).toBe(STUDIO_PATH); // l'enregistré n'est pas modifié
    const absolute = { ...content, cta: { type: "BOOK" as const, url: BOOKING } };
    expect(deliveredGoogleContent({ status: "ready", content: absolute }, hosted)).toBe(absolute);
  });

  it("fichier texte : l'adresse remise, jamais une adresse relative", () => {
    const delivered = deliveredGoogleContent({ status: "ready", content }, { ...hosted, onlineArticles: new Map([[ARTICLE_ID, "respirer"]]) });
    expect(googlePostTxt(delivered)).toBe(
      `Nouvel article : respirer avant un entretien.\n\nBouton : En savoir plus → ${HOSTED}/blog/respirer\n\nTexte alternatif : Visuel bleu avec un titre.\n`,
    );
    // Contenu enregistré donné tel quel : le bouton sans adresse plutôt qu'un chemin du studio
    const raw = googlePostTxt(content);
    expect(raw).toContain("Bouton : En savoir plus\n");
    expect(raw).not.toContain("/publications/");
    // Adresse absolue ou numéro : écrits comme avant
    expect(googlePostTxt({ ...content, cta: { type: "CALL", url: "tel:+33612345678" } })).toContain("Bouton : Appeler → tel:+33612345678");
    expect(googlePostTxt({ ...content, cta: { type: "NONE", url: null } })).not.toContain("Bouton");
  });
});
