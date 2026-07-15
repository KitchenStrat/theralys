import type { DnsRecord, DomainAvailability, DomainOrder, RegistrarProvider } from "./types";

const PRICES_PER_TLD: Record<string, number> = {
  fr: 6.99,
  com: 12.99,
  net: 14.99,
  eu: 8.99,
  org: 13.99,
};

/**
 * Mock déterministe : les domaines contenant « pris » ou trop courts sont
 * indisponibles, le prix suit le TLD. Aucune commande réelle.
 */
export class MockRegistrar implements RegistrarProvider {
  readonly mode = "mock" as const;

  async checkAvailability(domain: string): Promise<DomainAvailability> {
    const normalized = domain.toLowerCase().trim();
    const [name, ...tldParts] = normalized.split(".");
    const tld = tldParts.join(".");
    const valid = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(name ?? "") && tld in PRICES_PER_TLD;
    const taken = !valid || (name ?? "").includes("pris") || (name ?? "").length < 3;
    return {
      domain: normalized,
      available: !taken,
      pricePerYear: taken ? null : PRICES_PER_TLD[tld]!,
    };
  }

  async orderDomain(domain: string, _ownerEmail: string): Promise<DomainOrder> {
    const availability = await this.checkAvailability(domain);
    if (!availability.available) throw new Error(`Domaine indisponible : ${domain}`);
    return {
      domain: availability.domain,
      orderId: `mock-order-${Date.now()}`,
      status: "registered",
      expiresAt: new Date(Date.now() + 365 * 86_400_000),
    };
  }

  async configureDns(_domain: string, _records: DnsRecord[]): Promise<void> {
    // no-op en mock
  }
}
