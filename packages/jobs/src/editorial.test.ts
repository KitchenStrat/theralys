import { describe, expect, it } from "vitest";
import { cadenceDays, planEditorialTopics } from "./editorial";

const MOTIFS = [
  { slug: "massage-sportif", title: "Massage sportif" },
  { slug: "reflexologie-plantaire", title: "Réflexologie plantaire" },
  { slug: "massage-ayurvedique", title: "Massage ayurvédique" },
];

describe("cadence par formule", () => {
  it("Boost : 2/semaine (lundi, jeudi)", () => {
    expect(cadenceDays("boost")).toEqual([1, 4]);
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

  it("Boost : 2 sujets par semaine", () => {
    const topics = planEditorialTopics({ ...base, plan: "boost" });
    expect(topics.length).toBe(8);
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
