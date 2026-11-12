import { LEGAL_PAGES } from "@theralys/shared";
import { describe, expect, it } from "vitest";
import { legacyMotifRedirect, searchString } from "./motif-redirect";

// Pages de spécialité en ligne du site (la page « sommeil » existe en base mais elle est désactivée : absente d'ici)
const ONLINE = ["gestion-du-stress", "confiance-en-soi"];
const PREFIX = "/claire-dupont-sophrologue-albi";

const redirect = (segment: string, searchParams: Record<string, string | string[] | undefined> = {}, prefix = PREFIX) =>
  legacyMotifRedirect({ segment, motifSlugs: ONLINE, prefix, searchParams });

describe("legacyMotifRedirect", () => {
  it("ancienne adresse d'annonce : /<slug> d'une page de spécialité en ligne → /motifs/<slug>", () => {
    expect(redirect("gestion-du-stress")).toBe(`${PREFIX}/motifs/gestion-du-stress`);
    expect(redirect("confiance-en-soi")).toBe(`${PREFIX}/motifs/confiance-en-soi`);
  });

  it("les paramètres de campagne survivent à la redirection", () => {
    expect(redirect("gestion-du-stress", { gclid: "EAIaIQobChMI", utm_source: "google", utm_medium: "cpc" })).toBe(
      `${PREFIX}/motifs/gestion-du-stress?gclid=EAIaIQobChMI&utm_source=google&utm_medium=cpc`,
    );
    expect(redirect("gestion-du-stress", { src: "meta", fbclid: "IwAR0abc_def-123" })).toBe(
      `${PREFIX}/motifs/gestion-du-stress?src=meta&fbclid=IwAR0abc_def-123`,
    );
  });

  it("sur le domaine d'un client, le chemin public n'a pas de préfixe", () => {
    expect(redirect("gestion-du-stress", { src: "meta" }, "")).toBe("/motifs/gestion-du-stress?src=meta");
  });

  it("pages légales : servies comme avant, même si une page de spécialité portait le même slug", () => {
    for (const page of LEGAL_PAGES) {
      expect(redirect(page.slug)).toBeNull();
      expect(legacyMotifRedirect({ segment: page.slug, motifSlugs: [page.slug], prefix: PREFIX, searchParams: {} })).toBeNull();
    }
  });

  it("slug inconnu, page désactivée, casse différente : page introuvable comme avant", () => {
    expect(redirect("ancienne-page")).toBeNull();
    expect(redirect("sommeil-et-recuperation")).toBeNull();
    expect(redirect("Gestion-du-stress")).toBeNull();
    expect(redirect("motifs")).toBeNull();
    expect(redirect("")).toBeNull();
    // Site sans page de spécialité (formule Starter) : jamais de redirection
    expect(legacyMotifRedirect({ segment: "gestion-du-stress", motifSlugs: [], prefix: PREFIX, searchParams: { gclid: "x" } })).toBeNull();
  });

  it("le slug est encodé dans l'adresse de destination", () => {
    expect(legacyMotifRedirect({ segment: "café & thé", motifSlugs: ["café & thé"], prefix: "", searchParams: {} })).toBe(
      "/motifs/caf%C3%A9%20%26%20th%C3%A9",
    );
  });
});

describe("searchString", () => {
  it("vide sans paramètre", () => {
    expect(searchString({})).toBe("");
    expect(searchString({ absent: undefined })).toBe("");
  });

  it("garde l'ordre, les valeurs répétées et les valeurs vides", () => {
    expect(searchString({ utm_source: "google", tag: ["a", "b"], vide: "", gclid: "x" })).toBe("?utm_source=google&tag=a&tag=b&vide=&gclid=x");
  });

  it("encode les caractères réservés sans rien perdre", () => {
    const text = searchString({ utm_campaign: "Rentrée 2026 & stress", next: "https://exemple.fr/?a=1#x" });
    expect(text.startsWith("?")).toBe(true);
    const parsed = new URLSearchParams(text);
    expect(parsed.get("utm_campaign")).toBe("Rentrée 2026 & stress");
    expect(parsed.get("next")).toBe("https://exemple.fr/?a=1#x");
  });
});
