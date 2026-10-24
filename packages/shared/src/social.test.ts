import { describe, expect, it } from "vitest";
import {
  SIZES_FOR_FORMAT,
  SOCIAL_MAX_CAROUSEL_SLIDES,
  SOCIAL_NEW_ARTICLE_POSTS_MAX,
  SOCIAL_POST_DAYS,
  SOCIAL_TEMPLATES,
  TEMPLATE_FORMATS,
  canonicalJson,
  isoDay,
  monthRange,
  sizesFor,
  socialAssetKeyPayload,
  socialSlotsForMonth,
  type SocialAssetKeyInput,
} from "./social";

const TODAY = new Date("2026-10-23T09:00:00Z");

describe("socialSlotsForMonth", () => {
  it("mardis et vendredis de novembre 2026 (mois à venir)", () => {
    const slots = socialSlotsForMonth({ year: 2026, month: 11, today: TODAY, articles: [] });
    expect(slots.map((s) => s.date)).toEqual([
      "2026-11-03",
      "2026-11-06",
      "2026-11-10",
      "2026-11-13",
      "2026-11-17",
      "2026-11-20",
      "2026-11-24",
      "2026-11-27",
    ]);
    expect(slots.every((s) => s.kind === "cadence")).toBe(true);
    for (const s of slots) {
      const weekday = new Date(`${s.date}T00:00:00Z`).getUTCDay();
      expect(SOCIAL_POST_DAYS).toContain(weekday);
    }
  });

  it("mois en cours : seuls les créneaux strictement postérieurs à aujourd'hui", () => {
    const slots = socialSlotsForMonth({
      year: 2026,
      month: 11,
      today: new Date("2026-11-13T23:30:00Z"),
      articles: [],
    });
    expect(slots.map((s) => s.date)).toEqual(["2026-11-17", "2026-11-20", "2026-11-24", "2026-11-27"]);
  });

  it("mois passé : aucun créneau", () => {
    expect(socialSlotsForMonth({ year: 2026, month: 9, today: TODAY, articles: [] })).toEqual([]);
  });

  it("article du mois → créneau « nouvel_article » le lendemain", () => {
    const slots = socialSlotsForMonth({
      year: 2026,
      month: 11,
      today: TODAY,
      articles: [{ id: "a1", publishAt: new Date("2026-11-03T08:00:00Z") }],
    });
    const article = slots.filter((s) => s.kind === "nouvel_article");
    expect(article).toEqual([{ date: "2026-11-04", kind: "nouvel_article", articleId: "a1" }]);
    expect(slots.map((s) => s.date)).toEqual([...slots.map((s) => s.date)].sort());
  });

  it("collision avec un créneau cadence → J+2", () => {
    const slots = socialSlotsForMonth({
      year: 2026,
      month: 11,
      today: TODAY,
      articles: [{ id: "a1", publishAt: "2026-11-02T08:00:00Z" }],
    });
    expect(slots.find((s) => s.kind === "nouvel_article")?.date).toBe("2026-11-04");
  });

  it("au plus 2 annonces d'article, les plus récentes ; publishAt null ignoré", () => {
    const slots = socialSlotsForMonth({
      year: 2026,
      month: 11,
      today: TODAY,
      articles: [
        { id: "old", publishAt: new Date("2026-11-03T08:00:00Z") },
        { id: "mid", publishAt: new Date("2026-11-17T08:00:00Z") },
        { id: "new", publishAt: new Date("2026-11-24T08:00:00Z") },
        { id: "none", publishAt: null },
        { id: "other-month", publishAt: new Date("2026-12-01T08:00:00Z") },
      ],
    });
    const article = slots.filter((s) => s.kind === "nouvel_article");
    expect(article).toHaveLength(SOCIAL_NEW_ARTICLE_POSTS_MAX);
    expect(article.map((s) => s.articleId).sort()).toEqual(["mid", "new"]);
    expect(article.map((s) => s.date)).toEqual(["2026-11-18", "2026-11-25"]);
  });

  it("annonce d'article déjà passée ou hors du mois : écartée", () => {
    const slots = socialSlotsForMonth({
      year: 2026,
      month: 11,
      today: new Date("2026-11-10T12:00:00Z"),
      articles: [
        { id: "past", publishAt: new Date("2026-11-03T08:00:00Z") },
        { id: "last-day", publishAt: new Date("2026-11-30T08:00:00Z") },
      ],
    });
    expect(slots.filter((s) => s.kind === "nouvel_article")).toEqual([]);
  });
});

describe("tailles et formats", () => {
  it("sizesFor : le format décide, le template retire « story » quand il ne le supporte pas", () => {
    expect(sizesFor("static", "affirmation")).toEqual(["square", "portrait", "story"]);
    expect(sizesFor("static", "liste-conseils")).toEqual(["square", "portrait"]);
    expect(sizesFor("static", "avis")).toEqual(["square", "portrait"]);
    expect(sizesFor("carousel", "carrousel-etapes")).toEqual(["square", "portrait"]);
    expect(sizesFor("story", "story-rappel")).toEqual(["story"]);
  });

  it("chaque template a au moins un format, cohérent avec SIZES_FOR_FORMAT", () => {
    for (const template of SOCIAL_TEMPLATES) {
      expect(TEMPLATE_FORMATS[template].length).toBeGreaterThan(0);
      for (const format of TEMPLATE_FORMATS[template]) {
        expect(SIZES_FOR_FORMAT[format].length).toBeGreaterThan(0);
      }
    }
    expect(SOCIAL_MAX_CAROUSEL_SLIDES).toBe(7);
  });
});

describe("monthRange / isoDay", () => {
  it("bornes UTC [1er, 1er du mois suivant[", () => {
    const range = monthRange(2026, 12);
    expect(range.startIso).toBe("2026-12-01");
    expect(range.endIso).toBe("2027-01-01");
    expect(range.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(range.end.getTime()).toBeGreaterThan(range.start.getTime());
    expect(isoDay(new Date("2026-02-28T23:59:59Z"))).toBe("2026-02-28");
  });
});

describe("socialAssetKeyPayload", () => {
  const base: SocialAssetKeyInput = {
    v: 1,
    size: "square",
    slideIndex: 0,
    variant: "full",
    template: "affirmation",
    accent: "#6f5b9c",
    theme: { "--site-primary": "#6f5b9c", "--site-bg": "#f7f5fa" },
    logo: null,
    slide: { role: "single", title: "Respirer avant de réagir", body: "**Trois respirations** suffisent." },
    total: 1,
    brand: { firstName: "Claire", lastName: "Dupont", profession: "Sophrologue", city: "Albi" },
    domain: "demo.harmony-web.fr/claire",
    google: { rating: 4.8, reviewCount: 27 },
    address: "14 rue de la Berbie, 81000 Albi",
    reviewRating: 5,
  };

  it("est stable, indépendante de l'ordre des clés", () => {
    const shuffled = {
      reviewRating: 5,
      address: base.address,
      google: { reviewCount: 27, rating: 4.8 },
      domain: base.domain,
      brand: { city: "Albi", profession: "Sophrologue", lastName: "Dupont", firstName: "Claire" },
      total: 1,
      slide: { body: base.slide.body, title: base.slide.title, role: "single" as const },
      logo: null,
      theme: { "--site-bg": "#f7f5fa", "--site-primary": "#6f5b9c" },
      accent: base.accent,
      template: base.template,
      variant: base.variant,
      slideIndex: base.slideIndex,
      size: base.size,
      v: base.v,
    };
    expect(socialAssetKeyPayload(shuffled)).toBe(socialAssetKeyPayload(base));
    expect(socialAssetKeyPayload(base)).toBe(socialAssetKeyPayload(structuredClone(base)));
  });

  it("change dès qu'un champ change", () => {
    const reference = socialAssetKeyPayload(base);
    const variants: SocialAssetKeyInput[] = [
      { ...base, v: 2 },
      { ...base, size: "portrait" },
      { ...base, slideIndex: 1 },
      { ...base, variant: "preview" },
      { ...base, template: "photo-titre" },
      { ...base, accent: "#000000" },
      { ...base, theme: { ...base.theme, "--site-bg": "#ffffff" } },
      { ...base, logo: "https://x/logo.svg" },
      { ...base, slide: { ...base.slide, title: "Autre titre" } },
      { ...base, total: 7 },
      { ...base, brand: { ...base.brand, city: "Toulouse" } },
      { ...base, domain: "autre" },
      // Dessinés par les templates « avis » et « infos-pratiques » : la clé doit les suivre
      { ...base, google: { rating: 3.9, reviewCount: 41 } },
      { ...base, google: { rating: 4.8, reviewCount: 28 } },
      { ...base, google: null },
      { ...base, address: "2 place du Vigan, 81000 Albi" },
      { ...base, address: null },
      { ...base, reviewRating: 4 },
      { ...base, reviewRating: null },
    ];
    const payloads = new Set(variants.map(socialAssetKeyPayload));
    expect(payloads.size).toBe(variants.length);
    expect(payloads.has(reference)).toBe(false);
  });

  it("canonicalJson omet undefined et trie récursivement", () => {
    expect(canonicalJson({ b: [{ z: 1, a: undefined }], a: "x" })).toBe('{"a":"x","b":[{"z":1}]}');
  });
});
