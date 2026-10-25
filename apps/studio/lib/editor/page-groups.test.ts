import { describe, expect, it } from "vitest";
import { canAddHomeCard, groupEditorPages, motifCounterLabel, GENERATION_STALE_MESSAGE, isGenerationStale } from "./page-groups";

const home = { id: "h", type: "home", slug: "", title: "Accueil" };
const stress = { id: "1", type: "motif", slug: "stress", title: "Gestion du stress" };
const sommeil = { id: "2", type: "motif", slug: "sommeil", title: "Sommeil" };
const anxiete = { id: "3", type: "motif", slug: "anxiete", title: "Anxiété" };

describe("groupEditorPages", () => {
  it("accueil à part, statut de chaque page de spécialité et compteurs", () => {
    const groups = groupEditorPages([home, stress, sommeil, anxiete], {
      disabledMotifs: ["sommeil"],
      generatingMotifs: [{ slug: "anxiete", subject: "Anxiété", startedAt: "2026-10-25T10:00:00.000Z" }],
      now: Date.parse("2026-10-25T10:01:00.000Z"),
      plan: "scale",
    });
    expect(groups.home).toEqual(home);
    expect(groups.motifs.map((m) => m.status)).toEqual(["enabled", "disabled", "generating"]);
    expect(groups.motifs[2]?.enabled).toBe(false);
    expect(groups.enabledCount).toBe(1);
    expect(groups.motifCount).toBe(3);
    expect(groups.maxMotifPages).toBe(6);
    expect(groups.canAdd).toBe(true);
    expect(groups.isGenerating).toBe(true);
    expect(motifCounterLabel(groups)).toBe("1/3 activée");
  });

  it("génération en erreur : statut error, pas de sondage ; plafond de la formule atteint → canAdd faux", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `${i}`, type: "motif", slug: `m${i}`, title: `M${i}` }));
    const groups = groupEditorPages([home, ...six], {
      disabledMotifs: [],
      generatingMotifs: [{ slug: "m5", subject: "M5", startedAt: "2026-10-25T10:00:00.000Z", error: "Échec" }],
      now: Date.parse("2026-10-25T10:01:00.000Z"),
      plan: "scale",
    });
    expect(groups.motifs[5]?.status).toBe("error");
    expect(groups.isGenerating).toBe(false);
    expect(groups.enabledCount).toBe(5);
    expect(groups.canAdd).toBe(false);
    expect(motifCounterLabel(groups)).toBe("5/6 activées");
  });

  it("formule Starter : aucune page de spécialité possible ; entrées orphelines ignorées", () => {
    const groups = groupEditorPages([home], {
      disabledMotifs: [],
      generatingMotifs: [{ slug: "fantome", subject: "X", startedAt: "2026-10-25T10:00:00.000Z" }],
      now: Date.parse("2026-10-25T10:01:00.000Z"),
      plan: "starter",
    });
    expect(groups.motifs).toEqual([]);
    expect(groups.canAdd).toBe(false);
    expect(groups.isGenerating).toBe(false);
    expect(groups.maxMotifPages).toBe(0);
  });

  it("canAddHomeCard suit PLANS[plan].homeSpecialties", () => {
    expect(canAddHomeCard(5, "scale")).toBe(true);
    expect(canAddHomeCard(6, "scale")).toBe(false);
    expect(canAddHomeCard(6, "boost")).toBe(false);
  });
});

describe("génération périmée", () => {
  const plan = "scale" as const;
  const pages = [
    { id: "h", type: "home", slug: "", title: "Accueil" },
    { id: "m", type: "motif", slug: "anxiete", title: "Anxiété" },
  ];
  it("une entrée sans erreur de plus de 10 minutes devient une erreur relançable, sans sondage", () => {
    const started = new Date("2026-10-25T10:00:00Z");
    const fresh = groupEditorPages(pages, {
      disabledMotifs: ["anxiete"],
      generatingMotifs: [{ slug: "anxiete", subject: "Anxiété", startedAt: started.toISOString() }],
      plan,
      now: started.getTime() + 5 * 60_000,
    });
    expect(fresh.motifs[0]?.status).toBe("generating");
    expect(fresh.isGenerating).toBe(true);
    const stale = groupEditorPages(pages, {
      disabledMotifs: ["anxiete"],
      generatingMotifs: [{ slug: "anxiete", subject: "Anxiété", startedAt: started.toISOString() }],
      plan,
      now: started.getTime() + 11 * 60_000,
    });
    expect(stale.motifs[0]?.status).toBe("error");
    expect(stale.motifs[0]?.generating?.error).toBe(GENERATION_STALE_MESSAGE);
    expect(stale.isGenerating).toBe(false);
    expect(isGenerationStale({ slug: "x", subject: "x", startedAt: "pas une date" })).toBe(true);
    expect(isGenerationStale({ slug: "x", subject: "x", startedAt: started.toISOString(), error: "échec" }, Date.now())).toBe(false);
  });
});
