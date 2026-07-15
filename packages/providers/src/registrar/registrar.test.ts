import { describe, expect, it } from "vitest";
import { MockRegistrar } from "./mock";
import { ovhSignature } from "./ovh";
import { VERCEL_DNS_RECORDS } from "./types";

describe("MockRegistrar", () => {
  const registrar = new MockRegistrar();

  it("domaine .fr disponible avec prix", async () => {
    const result = await registrar.checkAvailability("claire-sophrologie-albi.fr");
    expect(result).toEqual({
      domain: "claire-sophrologie-albi.fr",
      available: true,
      pricePerYear: 6.99,
    });
  });

  it("prix par TLD (.com plus cher que .fr)", async () => {
    const fr = await registrar.checkAvailability("exemple-cabinet.fr");
    const com = await registrar.checkAvailability("exemple-cabinet.com");
    expect(com.pricePerYear!).toBeGreaterThan(fr.pricePerYear!);
  });

  it("domaines invalides ou « pris » indisponibles", async () => {
    expect((await registrar.checkAvailability("deja-pris.fr")).available).toBe(false);
    expect((await registrar.checkAvailability("ab.fr")).available).toBe(false);
    expect((await registrar.checkAvailability("site.xyz")).available).toBe(false);
    expect((await registrar.checkAvailability("mon site.fr")).available).toBe(false);
  });

  it("commande un domaine disponible, refuse un indisponible", async () => {
    const order = await registrar.orderDomain("cabinet-serein.fr", "client@exemple.fr");
    expect(order.status).toBe("registered");
    expect(order.expiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(registrar.orderDomain("deja-pris.fr", "client@exemple.fr")).rejects.toThrow(
      /indisponible/,
    );
  });
});

describe("signature OVH", () => {
  it("format $1$ + sha1 hex, stable", () => {
    const credentials = { appKey: "AK", appSecret: "AS", consumerKey: "CK" };
    const signature = ovhSignature(
      credentials,
      "GET",
      "https://eu.api.ovh.com/1.0/domain",
      "",
      1_700_000_000,
    );
    expect(signature).toMatch(/^\$1\$[0-9a-f]{40}$/);
    // déterministe
    expect(
      ovhSignature(credentials, "GET", "https://eu.api.ovh.com/1.0/domain", "", 1_700_000_000),
    ).toBe(signature);
    // sensible au timestamp et à la méthode
    expect(
      ovhSignature(credentials, "GET", "https://eu.api.ovh.com/1.0/domain", "", 1_700_000_001),
    ).not.toBe(signature);
    expect(
      ovhSignature(credentials, "POST", "https://eu.api.ovh.com/1.0/domain", "", 1_700_000_000),
    ).not.toBe(signature);
  });
});

describe("enregistrements DNS Vercel", () => {
  it("A racine + CNAME www vers Vercel", () => {
    expect(VERCEL_DNS_RECORDS).toEqual([
      { type: "A", subdomain: "", target: "76.76.21.21" },
      { type: "CNAME", subdomain: "www", target: "cname.vercel-dns.com." },
    ]);
  });
});
