import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "./seo";

describe("serializeJsonLd", () => {
  it("ne laisse aucun chevron ni esperluette : une valeur ne peut pas fermer la balise <script>", () => {
    const hostile = { name: "Cabinet </script><script src=https://evil.example/a.js></script>", url: "https://x.fr/?a=1&b=2" };
    const out = serializeJsonLd(hostile);
    expect(out).not.toMatch(/[<>&]/);
    expect(out).toContain("\\u003c/script\\u003e");
    // Tout lecteur JSON relit exactement les valeurs d'origine
    expect(JSON.parse(out)).toEqual(hostile);
  });

  it("échappe les séparateurs de ligne Unicode, qui cassent un script en ligne", () => {
    const value = { note: "ligne\u2028suite\u2029fin" };
    const out = serializeJsonLd(value);
    expect(out).not.toMatch(/[\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual(value);
  });
});
