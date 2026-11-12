import { describe, expect, it } from "vitest";
import { cleanExternalProfile, externalSpecialties } from "@theralys/shared";
import { cadenceDays, planEditorialTopics } from "./editorial";

const MOTIFS = [
  { slug: "massage-sportif", title: "Massage sportif" },
  { slug: "reflexologie-plantaire", title: "Réflexologie plantaire" },
  { slug: "massage-ayurvedique", title: "Massage ayurvédique" },
];

describe("cadence par formule", () => {
  it("Scale : 4/semaine (lun, mar, jeu, ven)", () => {
    expect(cadenceDays("boost")).toEqual([1, 2, 4, 5]);
  });
  it("Scale : 4/semaine (lundi, mardi, jeudi, vendredi)", () => {
    expect(cadenceDays("scale")).toEqual([1, 2, 4, 5]);
  });
  it("Starter : pas de blog", () => {
    expect(cadenceDays("starter")).toEqual([]);
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

  it("Scale : 4 sujets par semaine sur l'horizon", () => {
    const topics = planEditorialTopics({ ...base, plan: "scale" });
    expect(topics.length).toBe(16);
    for (const t of topics) {
      const weekday = ((new Date(`${t.scheduledFor}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
      expect([1, 2, 4, 5]).toContain(weekday);
    }
  });

  it("Scale : 4 sujets par semaine", () => {
    const topics = planEditorialTopics({ ...base, plan: "boost" });
    expect(topics.length).toBe(16);
  });

  it("Starter : aucun sujet", () => {
    expect(planEditorialTopics({ ...base, plan: "starter" })).toEqual([]);
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
      plan: "boost",
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
