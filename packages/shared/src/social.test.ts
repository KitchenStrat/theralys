import { describe, expect, it } from "vitest";
import {
  SIZES_FOR_FORMAT,
  SOCIAL_INSTRUCTIONS_MAX,
  SOCIAL_MAX_CAROUSEL_SLIDES,
  SOCIAL_NEW_ARTICLE_POSTS_MAX,
  SOCIAL_POST_DAYS,
  SOCIAL_TEMPLATES,
  TEMPLATE_FORMATS,
  canonicalJson,
  cleanSocialInstructions,
  isoDay,
  isoWeekday,
  monthRange,
  normalizePostDays,
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

describe("socialSlotsForMonth — jours de publication personnalisés (« Paramétrage »)", () => {
  it("lundi et jeudi : 9 créneaux cadence en novembre 2026, aux bons jours", () => {
    const slots = socialSlotsForMonth({ year: 2026, month: 11, today: TODAY, articles: [], postDays: [1, 4] });
    expect(slots.map((s) => s.date)).toEqual([
      "2026-11-02", "2026-11-05", "2026-11-09", "2026-11-12", "2026-11-16", "2026-11-19", "2026-11-23", "2026-11-26", "2026-11-30",
    ]);
    for (const s of slots) expect([1, 4]).toContain(isoWeekday(s.date));
    // Sans postDays : la cadence par défaut (mardi, vendredi) est inchangée
    expect(socialSlotsForMonth({ year: 2026, month: 11, today: TODAY, articles: [] })).toEqual(
      socialSlotsForMonth({ year: 2026, month: 11, today: TODAY, articles: [], postDays: [...SOCIAL_POST_DAYS] }),
    );
  });

  it("un seul jour (dimanche) : 5 créneaux ; 7 jours : un créneau par jour restant", () => {
    const sundays = socialSlotsForMonth({ year: 2026, month: 11, today: TODAY, articles: [], postDays: [7] });
    expect(sundays.map((s) => s.date)).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
    const daily = socialSlotsForMonth({ year: 2026, month: 11, today: TODAY, articles: [], postDays: [1, 2, 3, 4, 5, 6, 7] });
    expect(daily).toHaveLength(30);
    expect(daily.every((s) => s.kind === "cadence")).toBe(true);
  });

  it("jours en désordre, doublons et valeurs invalides : dédoublonnés, triés, invalides ignorés ; aucun valide → défaut", () => {
    expect(normalizePostDays([5, 2, 5, 0, 8, 2.5, Number.NaN])).toEqual([2, 5]);
    expect(normalizePostDays([4, 1])).toEqual([1, 4]);
    expect(normalizePostDays([])).toEqual([2, 5]);
    expect(normalizePostDays(undefined)).toEqual([2, 5]);
    expect(normalizePostDays(["1", null, 9])).toEqual([2, 5]);
    const a = socialSlotsForMonth({ year: 2026, month: 11, today: TODAY, articles: [], postDays: [4, 1, 1, 0] });
    const b = socialSlotsForMonth({ year: 2026, month: 11, today: TODAY, articles: [], postDays: [1, 4] });
    expect(a).toEqual(b);
  });

  it("les créneaux « nouvel article » évitent les jours choisis (3 jours max), sinon le lendemain", () => {
    // Article publié le lundi 2 : J+1 = mardi 3 (jour choisi) → mercredi 4 avec [2, 3] → jeudi 5
    const slots = socialSlotsForMonth({
      year: 2026,
      month: 11,
      today: TODAY,
      articles: [{ id: "a1", publishAt: "2026-11-02T08:00:00Z" }],
      postDays: [2, 3],
    });
    const article = slots.find((s) => s.kind === "nouvel_article");
    expect(article?.date).toBe("2026-11-05");
    expect(slots.filter((s) => s.kind === "cadence").map((s) => s.date)).toContain("2026-11-04");
    // Tous les jours sont des jours de publication : l'annonce reste le lendemain
    // (deux contenus ce jour-là) plutôt que d'être repoussée ou écartée
    const daily = socialSlotsForMonth({
      year: 2026,
      month: 11,
      today: TODAY,
      articles: [{ id: "a1", publishAt: "2026-11-02T08:00:00Z" }],
      postDays: [1, 2, 3, 4, 5, 6, 7],
    });
    expect(daily.filter((s) => s.kind === "nouvel_article").map((s) => s.date)).toEqual(["2026-11-03"]);
    expect(daily.filter((s) => s.date === "2026-11-03")).toHaveLength(2);
    // Lundi → jeudi choisis : J+1 = mardi, mercredi, jeudi pris, vendredi libre (3 décalages)
    const monToThu = socialSlotsForMonth({
      year: 2026,
      month: 11,
      today: TODAY,
      articles: [{ id: "a1", publishAt: "2026-11-02T08:00:00Z" }],
      postDays: [1, 2, 3, 4],
    });
    expect(monToThu.find((s) => s.kind === "nouvel_article")?.date).toBe("2026-11-06");
    // Cinq jours consécutifs choisis : plus de jour libre à 3 jours → lendemain quand même
    const monToFri = socialSlotsForMonth({
      year: 2026,
      month: 11,
      today: TODAY,
      articles: [{ id: "a1", publishAt: "2026-11-02T08:00:00Z" }],
      postDays: [1, 2, 3, 4, 5],
    });
    expect(monToFri.find((s) => s.kind === "nouvel_article")?.date).toBe("2026-11-03");
    // Avec lundi/jeudi, l'article du mardi 3 est annoncé le mercredi 4 (jour libre)
    const monThu = socialSlotsForMonth({
      year: 2026,
      month: 11,
      today: TODAY,
      articles: [{ id: "a1", publishAt: "2026-11-03T08:00:00Z" }],
      postDays: [1, 4],
    });
    expect(monThu.find((s) => s.kind === "nouvel_article")?.date).toBe("2026-11-04");
  });
});

describe("cleanSocialInstructions", () => {
  it("normalise les retours à la ligne, retire les caractères de contrôle, resserre les espaces, plafonne", () => {
    expect(cleanSocialInstructions("  Terminer par une question.\r\n\r\n\r\n\r\nNe jamais\tciter\u0007 de   tarif. \n")).toBe(
      "Terminer par une question.\n\nNe jamais citer de tarif.",
    );
    expect(cleanSocialInstructions(null)).toBe("");
    // Caractères invisibles (zéro-largeur, trait d'union conditionnel, BOM) et
    // compatibilité Unicode (ligatures, pleine chasse) : un mot interdit ne se cache pas
    expect(cleanSocialInstructions("gu\u200bé\u00adri\ufeffson \uff47arantie ﬁn")).toBe("guérison garantie fin");
    expect(cleanSocialInstructions("   \n \n")).toBe("");
    expect(cleanSocialInstructions("a".repeat(2000))).toHaveLength(SOCIAL_INSTRUCTIONS_MAX);
    expect(SOCIAL_INSTRUCTIONS_MAX).toBe(1500);
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
