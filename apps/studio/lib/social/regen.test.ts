import { describe, expect, it } from "vitest";
import { SOCIAL_REGENERATIONS_PER_MONTH } from "@theralys/shared";
import { regenerationQuota, SOCIAL_REGEN_USAGE_KIND } from "./regen";

describe("regenerationQuota", () => {
  it("mois vierge : tout le quota est disponible", () => {
    expect(regenerationQuota(0)).toEqual({ used: 0, remaining: SOCIAL_REGENERATIONS_PER_MONTH });
  });

  it("décompte une par une, jamais en dessous de zéro", () => {
    expect(regenerationQuota(1)).toEqual({ used: 1, remaining: SOCIAL_REGENERATIONS_PER_MONTH - 1 });
    expect(regenerationQuota(SOCIAL_REGENERATIONS_PER_MONTH)).toEqual({ used: SOCIAL_REGENERATIONS_PER_MONTH, remaining: 0 });
    expect(regenerationQuota(SOCIAL_REGENERATIONS_PER_MONTH + 5).remaining).toBe(0);
  });

  it("valeurs absurdes (négative, NaN, décimale) ramenées à un entier ≥ 0", () => {
    expect(regenerationQuota(-3)).toEqual({ used: 0, remaining: SOCIAL_REGENERATIONS_PER_MONTH });
    expect(regenerationQuota(Number.NaN)).toEqual({ used: 0, remaining: SOCIAL_REGENERATIONS_PER_MONTH });
    expect(regenerationQuota(2.7)).toEqual({ used: 2, remaining: SOCIAL_REGENERATIONS_PER_MONTH - 2 });
  });

  it("limite paramétrable et kind distinct des régénérations de posts Google", () => {
    expect(regenerationQuota(4, 5)).toEqual({ used: 4, remaining: 1 });
    expect(SOCIAL_REGEN_USAGE_KIND).toBe("social_regen");
    expect(SOCIAL_REGEN_USAGE_KIND).not.toBe("post_regen");
  });
});
