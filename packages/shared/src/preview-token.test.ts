import { describe, expect, it } from "vitest";
import { signSitePreviewToken, verifySitePreviewToken } from "./preview-token";

const SECRET = "secret-de-test-0123456789abcdef";
const SITE = "b6bed027-6656-4734-926f-501605751fdc";

describe("jeton d'aperçu d'un site", () => {
  it("porte l'origine du studio qui l'a émis", async () => {
    const token = await signSitePreviewToken({ siteId: SITE, origin: "https://app.exemple.fr" }, SECRET);
    expect(await verifySitePreviewToken(token, SECRET)).toEqual({ siteId: SITE, origin: "https://app.exemple.fr" });
    const local = await signSitePreviewToken({ siteId: SITE, origin: "http://localhost:3036" }, SECRET);
    expect(await verifySitePreviewToken(local, SECRET)).toEqual({ siteId: SITE, origin: "http://localhost:3036" });
  });

  it("sans origine (jeton d'avant ce champ) ou origine mal formée : le site seul", async () => {
    expect(await verifySitePreviewToken(await signSitePreviewToken({ siteId: SITE }, SECRET), SECRET)).toEqual({ siteId: SITE });
    for (const origin of ["https://app.exemple.fr/chemin", "javascript:alert(1)", "app.exemple.fr", "*"]) {
      expect(await verifySitePreviewToken(await signSitePreviewToken({ siteId: SITE, origin }, SECRET), SECRET)).toEqual({ siteId: SITE });
    }
  });

  it("refuse un jeton signé par un autre secret ou expiré", async () => {
    const token = await signSitePreviewToken({ siteId: SITE, origin: "https://app.exemple.fr" }, SECRET);
    expect(await verifySitePreviewToken(token, "autre-secret")).toBeNull();
    expect(await verifySitePreviewToken(await signSitePreviewToken({ siteId: SITE }, SECRET, -10), SECRET)).toBeNull();
  });
});
