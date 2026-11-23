import { describe, expect, it } from "vitest";
import { cleanExternalProfile, externalSpecialties } from "@theralys/shared";
import { TOPICS_PER_SPECIALTY, cadenceDays, planEditorialTopics } from "./editorial";

const MOTIFS = [
  { slug: "massage-sportif", title: "Massage sportif" },
  { slug: "reflexologie-plantaire", title: "Réflexologie plantaire" },
  { slug: "massage-ayurvedique", title: "Massage ayurvédique" },
];

// Valeurs enregistrées : « starter » = formule Site, « boost » = formule Scale seule, « scale » = les deux
describe("cadence : le blog fait partie de la formule Site", () => {
  it("Site : 4/semaine (lundi, mardi, jeudi, vendredi)", () => {
    expect(cadenceDays("starter")).toEqual([1, 2, 4, 5]);
  });
  it("Site + Scale : la même cadence", () => {
    expect(cadenceDays("scale")).toEqual([1, 2, 4, 5]);
  });
  it("Scale seule : pas de blog", () => {
    expect(cadenceDays("boost")).toEqual([]);
  });
});

describe("planEditorialTopics", () => {
  const base = {
    motifs: MOTIFS,
    city: "Clapiers",
    from: new Date("2026-07-16T00:00:00Z"), // jeudi
    horizonWeeks: 4,
    existingDates: new Set<string>(),
  };

  it("Site + Scale : 4 sujets par semaine sur l'horizon", () => {
    const topics = planEditorialTopics({ ...base, plan: "scale" });
    expect(topics.length).toBe(16);
    for (const t of topics) {
      const weekday = ((new Date(`${t.scheduledFor}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
      expect([1, 2, 4, 5]).toContain(weekday);
    }
  });

  it("Site seule : 4 sujets par semaine", () => {
    const topics = planEditorialTopics({ ...base, plan: "starter" });
    expect(topics.length).toBe(16);
  });

  it("Scale seule : aucun sujet", () => {
    expect(planEditorialTopics({ ...base, plan: "boost" })).toEqual([]);
  });

  it("ne replanifie pas les dates déjà occupées", () => {
    const first = planEditorialTopics({ ...base, plan: "scale" });
    const existing = new Set(first.slice(0, 5).map((t) => t.scheduledFor));
    const rest = planEditorialTopics({ ...base, plan: "scale", existingDates: existing });
    expect(rest.length).toBe(11);
    for (const t of rest) expect(existing.has(t.scheduledFor)).toBe(false);
  });

  it("est déterministe et varie les sujets", () => {
    const a = planEditorialTopics({ ...base, plan: "scale" });
    const b = planEditorialTopics({ ...base, plan: "scale" });
    expect(a).toEqual(b);
    // pas deux fois le même sujet dans l'horizon
    expect(new Set(a.map((t) => t.topic)).size).toBe(a.length);
    // chaque sujet référence une spécialité du site (maillage SEO)
    for (const t of a) expect(MOTIFS.some((m) => m.slug === t.motifSlug)).toBe(true);
  });
});

describe("planification par thématiques (wizard)", () => {
  it("les thématiques pilotent les sujets, pondérées par leur répartition", () => {
    const topics = planEditorialTopics({
      motifs: [{ slug: "gestion-du-stress", title: "Gestion du stress" }],
      themes: [
        { label: "Soulager les tensions musculaires", perMonth: 3 },
        { label: "Gestion du stress", perMonth: 1 },
      ],
      city: "Paris",
      plan: "scale",
      from: new Date("2026-08-03T00:00:00Z"),
      horizonWeeks: 4,
      existingDates: new Set(),
    });
    expect(topics.length).toBeGreaterThan(8);
    for (const t of topics) {
      expect(/tensions musculaires|gestion du stress/i.test(t.topic)).toBe(true);
    }
    const linked = topics.filter((t) => t.motifSlug === "gestion-du-stress");
    expect(linked.length).toBeGreaterThan(0);
    for (const t of linked) expect(t.topic.toLowerCase()).toContain("gestion du stress");
  });

  it("sans thématiques : repli sur les motifs (comportement historique)", () => {
    const topics = planEditorialTopics({
      motifs: [{ slug: "sommeil", title: "Sommeil et récupération" }],
      themes: [],
      city: "Albi",
      plan: "starter",
      from: new Date("2026-08-03T00:00:00Z"),
      horizonWeeks: 2,
      existingDates: new Set(),
    });
    expect(topics.length).toBe(8);
    for (const t of topics) expect(t.motifSlug).toBe("sommeil");
  });
});

describe("planification depuis le site du client (site de référence)", () => {
  // Spécialités telles que le studio les a comprises du site du client : titres libres, identifiants dérivés
  const profile = cleanExternalProfile(
    {
      headline: "Sophrologie à Albi",
      specialties: [
        { title: "Préparation aux examens", excerpt: "Aborder les épreuves sereinement." },
        { title: "Accompagnement de la grossesse", excerpt: "Vivre sa grossesse en confiance." },
        { title: "Préparation aux examens", excerpt: "Même titre, autre page du site." },
      ],
    },
    "https://www.cabinet-dupont.fr",
  );
  const motifs = externalSpecialties(profile);
  const base = { city: "Albi", plan: "scale" as const, from: new Date("2026-11-13T00:00:00Z"), horizonWeeks: 6, existingDates: new Set<string>() };

  it("les spécialités du site du client servent de sujets comme des pages de spécialité", () => {
    expect(motifs).toEqual([
      { slug: "preparation-aux-examens", title: "Préparation aux examens" },
      { slug: "accompagnement-de-la-grossesse", title: "Accompagnement de la grossesse" },
      { slug: "preparation-aux-examens-2", title: "Préparation aux examens" },
    ]);
    const topics = planEditorialTopics({ ...base, motifs });
    expect(topics).toHaveLength(24);
    expect(new Set(topics.map((t) => t.topic)).size).toBe(topics.length);
    for (const t of topics) {
      expect(motifs.some((m) => m.slug === t.motifSlug)).toBe(true);
      expect(t.topic.toLowerCase()).toMatch(/préparation aux examens|accompagnement de la grossesse/);
    }
    // Chaque spécialité du site reçoit des sujets
    expect(new Set(topics.map((t) => t.motifSlug)).size).toBe(3);
  });

  it("thématiques du praticien : un sujet est rattaché à la spécialité du site du client qui porte ce nom", () => {
    const topics = planEditorialTopics({ ...base, motifs, themes: [{ label: "accompagnement de la grossesse", perMonth: 2 }, { label: "Bien dormir", perMonth: 2 }] });
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) {
      if (/grossesse/i.test(t.topic)) expect(t.motifSlug).toBe("accompagnement-de-la-grossesse");
      else expect(t.motifSlug).toBeNull();
    }
    expect(topics.some((t) => t.motifSlug === "accompagnement-de-la-grossesse")).toBe(true);
    expect(topics.some((t) => t.motifSlug === null)).toBe(true);
  });
});

describe("variété des sujets sur la durée", () => {
  const TITLES = ["Massage sportif", "Réflexologie plantaire", "Massage ayurvédique", "Sophrologie", "Gestion du stress", "Troubles du sommeil"];
  const motifsOf = (count: number) => TITLES.slice(0, count).map((title, i) => ({ slug: `specialite-${i + 1}`, title }));
  const DATED = /\(\d{4}-\d{2}-\d{2}\)/;
  /** Sujet de fond d'un titre : sans son prolongement (« — les idées reçues », « — volet 3 »). */
  const baseOf = (topic: string) => topic.replace(/ — .*$/, "");

  /** Deux ans de calendrier, planifiés comme le fait le cron : un passage par jour, horizon de 6 semaines, sujets déjà pris relus à chaque passage. */
  function twoYears(opts: { motifs: { slug: string; title: string }[]; themes?: { label: string; perMonth: number }[] }) {
    const dates = new Set<string>();
    const topics: { topic: string; motifSlug: string | null }[] = [];
    for (let day = 0; day < 730; day++) {
      const from = new Date(Date.UTC(2026, 10, 24) + day * 86_400_000);
      const added = planEditorialTopics({ ...opts, city: "Albi", plan: "scale", from, horizonWeeks: 6, existingDates: dates, existingTopics: new Set(topics.map((t) => t.topic)) });
      for (const topic of added) {
        dates.add(topic.scheduledFor);
        topics.push(topic);
      }
    }
    return topics;
  }

  it("chaque spécialité fournit 16 sujets de fond : un par accroche, un par angle", () => {
    expect(TOPICS_PER_SPECIALTY).toBe(16);
  });

  it.each([
    [1, 16],
    [3, 48],
    [6, 96],
  ])("%i spécialité(s) : %i sujets de fond distincts sur deux ans, tous épuisés avant le premier prolongement, aucun titre daté", (count, distinct) => {
    const topics = twoYears({ motifs: motifsOf(count) }).map((t) => t.topic);
    // 4 sujets par semaine pendant 2 ans, plus l'horizon de 6 semaines
    expect(topics.length).toBeGreaterThan(416);
    expect(new Set(topics).size).toBe(topics.length);
    expect(topics.filter((topic) => DATED.test(topic))).toEqual([]);
    expect(new Set(topics.map(baseOf)).size).toBe(distinct);
    // Avant le correctif : 12 sujets de fond quel que soit le nombre de spécialités, puis des titres suffixés d'une date
    const firstExtended = topics.findIndex((topic) => topic.includes(" — "));
    expect(firstExtended).toBe(distinct);
    expect(new Set(topics.slice(0, distinct)).size).toBe(distinct);
  });

  it("produit épuisé : le sujet revient sous un nouvel angle, puis en volets numérotés — jamais avec une date", () => {
    const topics = twoYears({ motifs: motifsOf(1) }).map((t) => t.topic);
    const extended = topics.slice(16);
    expect(extended.every((topic) => / — [a-zà-ÿ]/.test(topic))).toBe(true);
    // Dix angles par sujet de fond, variés d'un sujet au suivant, avant les volets
    const named = extended.filter((topic) => !/ — volet \d+$/.test(topic));
    expect(named).toHaveLength(160);
    expect(new Set(named.slice(0, 16).map((topic) => topic.replace(/^.* — /, ""))).size).toBeGreaterThan(5);
    expect(extended.indexOf(extended.find((topic) => / — volet \d+$/.test(topic))!)).toBe(160);
    expect(extended.at(-1)).toMatch(/ — volet \d+$/);
  });

  it("trois spécialités : chacune reçoit ses 16 sujets avant qu'aucune ne soit prolongée", () => {
    const topics = twoYears({ motifs: motifsOf(3) });
    const first = topics.slice(0, 48);
    for (const motif of motifsOf(3)) expect(first.filter((t) => t.motifSlug === motif.slug)).toHaveLength(16);
    // Ensuite, les prolongements se répartissent encore entre les trois
    const later = topics.slice(48);
    for (const motif of motifsOf(3)) expect(later.filter((t) => t.motifSlug === motif.slug).length).toBeGreaterThan(later.length / 6);
  });

  it("thématiques du praticien : la répartition mensuelle est tenue, chaque thématique épuise ses 16 sujets avant d'être prolongée", () => {
    const themes = [
      { label: "Gestion du stress", perMonth: 3 },
      { label: "Bien dormir", perMonth: 1 },
    ];
    const topics = twoYears({ motifs: [], themes }).map((t) => t.topic);
    expect(new Set(topics).size).toBe(topics.length);
    expect(topics.filter((topic) => DATED.test(topic))).toEqual([]);
    const stress = topics.filter((topic) => /gestion du stress/i.test(topic));
    const sleep = topics.filter((topic) => /bien dormir/i.test(topic));
    expect(stress.length + sleep.length).toBe(topics.length);
    // Environ trois sujets sur quatre pour la première thématique, comme demandé (le créneau de départ varie d'un passage à l'autre)
    expect(stress.length / topics.length).toBeGreaterThan(0.65);
    expect(stress.length / topics.length).toBeLessThan(0.85);
    for (const list of [stress, sleep]) {
      expect(new Set(list.map(baseOf)).size).toBe(16);
      expect(list.findIndex((topic) => topic.includes(" — "))).toBe(16);
    }
  });
});
