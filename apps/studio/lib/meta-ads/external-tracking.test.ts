import { describe, expect, it } from "vitest";
import { EXTERNAL_SITE_CHECK_DETAILS } from "@theralys/shared";
import type { ExternalSiteTracking } from "../google-ads/external-tracking";
import { META_RESULTS_ACCOUNT, metaPixelFindings } from "./external-tracking";

const NOTHING: ExternalSiteTracking = { address: "www.claire-sophrologie.fr", cms: null, googleAdsTag: false, tagManager: false, metaPixel: false, consentBanner: false, measureSnippet: false };

describe("metaPixelFindings — relevé affiché à la place du formulaire du Pixel", () => {
  it("rien de repéré : Pixel à installer, bandeau à vérifier — avec les textes du diagnostic", () => {
    expect(metaPixelFindings(NOTHING)).toEqual([
      { id: "pixel", label: "Pixel Meta installé sur le site", status: "todo", detail: EXTERNAL_SITE_CHECK_DETAILS.pixelTodo },
      { id: "consent", label: "Bandeau cookies", status: "unknown", detail: EXTERNAL_SITE_CHECK_DETAILS.cookieBannerUnknown },
    ]);
  });

  it("Pixel et bandeau repérés : le texte renvoie au Gestionnaire d'événements, il n'affirme pas ce que Meta reçoit", () => {
    const findings = metaPixelFindings({ ...NOTHING, metaPixel: true, consentBanner: true });
    expect(findings.map((f) => f.status)).toEqual(["ok", "ok"]);
    expect(findings[0]?.detail).toBe(EXTERNAL_SITE_CHECK_DETAILS.pixelOk);
    expect(findings[0]?.detail).toContain("contrôlez dans le Gestionnaire d'événements");
    expect(findings[1]?.detail).toBe(EXTERNAL_SITE_CHECK_DETAILS.cookieBannerOk);
  });

  it("une balise Google ne dit rien du Pixel", () => {
    expect(metaPixelFindings({ ...NOTHING, googleAdsTag: true, tagManager: true })[0]?.status).toBe("todo");
  });

  it("les résultats des annonces se lisent dans le Gestionnaire de publicités", () => {
    expect(META_RESULTS_ACCOUNT).toContain("Gestionnaire de publicités de Meta");
  });
});
