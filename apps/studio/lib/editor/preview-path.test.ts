import { describe, expect, it } from "vitest";
import {
  NOT_FOUND_PREVIEW_PATH,
  legalPreviewTarget,
  previewPath,
  previewTargetForPage,
  samePreviewTarget,
} from "./preview-path";

describe("previewPath", () => {
  it("chemin selon la cible, jeton ?apercu= encodé quand présent", () => {
    expect(previewPath({ kind: "home" }, "")).toBe("");
    expect(previewPath({ kind: "home" }, "a.b+c")).toBe("?apercu=a.b%2Bc");
    expect(previewPath({ kind: "motif", slug: "gestion-du-stress" }, "t")).toBe(
      "/motifs/gestion-du-stress?apercu=t",
    );
    expect(previewPath({ kind: "legal", slug: "mentions-legales" }, "t")).toBe("/mentions-legales?apercu=t");
    expect(previewPath({ kind: "notFound" }, "t")).toBe(`${NOT_FOUND_PREVIEW_PATH}?apercu=t`);
    expect(previewPath({ kind: "notFound" }, "")).toBe("/__introuvable");
  });

  it("cible dérivée de la page éditée", () => {
    expect(previewTargetForPage(null)).toEqual({ kind: "home" });
    expect(previewTargetForPage({ type: "home", slug: "" })).toEqual({ kind: "home" });
    expect(previewTargetForPage({ type: "motif", slug: "sommeil" })).toEqual({ kind: "motif", slug: "sommeil" });
  });

  it("pages légales connues uniquement", () => {
    expect(legalPreviewTarget("politique-de-cookies")).toEqual({ kind: "legal", slug: "politique-de-cookies" });
    expect(legalPreviewTarget("autre")).toBeNull();
  });

  it("samePreviewTarget compare le type et le slug", () => {
    expect(samePreviewTarget({ kind: "home" }, { kind: "home" })).toBe(true);
    expect(samePreviewTarget({ kind: "motif", slug: "a" }, { kind: "motif", slug: "a" })).toBe(true);
    expect(samePreviewTarget({ kind: "motif", slug: "a" }, { kind: "motif", slug: "b" })).toBe(false);
    expect(samePreviewTarget({ kind: "legal", slug: "mentions-legales" }, { kind: "notFound" })).toBe(false);
  });
});

describe("page en préparation", () => {
  it("l'aperçu reste sur l'accueil tant que la génération est en cours, pas en cas d'erreur", () => {
    const page = { type: "motif", slug: "anxiete" };
    expect(previewTargetForPage(page, [{ slug: "anxiete" }])).toEqual({ kind: "home" });
    expect(previewTargetForPage(page, [{ slug: "anxiete", error: "échec" }])).toEqual({ kind: "motif", slug: "anxiete" });
    expect(previewTargetForPage(page, [{ slug: "autre" }])).toEqual({ kind: "motif", slug: "anxiete" });
  });
});
