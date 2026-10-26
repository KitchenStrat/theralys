import { describe, expect, it } from "vitest";
import { siteUrl } from "./google-brief";

describe("siteUrl (jobs)", () => {
  it("domaine personnalisé en https, sinon SITES_BASE_URL + slug (barre finale tolérée), repli localhost", () => {
    expect(siteUrl({ slug: "claire", domain: "claire-sophrologie.fr" }, {} as NodeJS.ProcessEnv)).toBe("https://claire-sophrologie.fr");
    expect(siteUrl({ slug: "claire", domain: null }, { SITES_BASE_URL: "https://demo.harmony-web.fr/" } as NodeJS.ProcessEnv)).toBe("https://demo.harmony-web.fr/claire");
    expect(siteUrl({ slug: "claire", domain: null }, {} as NodeJS.ProcessEnv)).toBe("http://localhost:3000/claire");
  });
});
