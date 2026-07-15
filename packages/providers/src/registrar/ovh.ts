import { createHash } from "node:crypto";
import type { DnsRecord, DomainAvailability, DomainOrder, RegistrarProvider } from "./types";

const OVH_ENDPOINT = "https://eu.api.ovh.com/1.0";

export type OvhCredentials = {
  appKey: string;
  appSecret: string;
  consumerKey: string;
};

/**
 * Signature OVH : $1$ + SHA1(AS+CK+METHOD+URL+BODY+TIMESTAMP joints par « + »).
 * https://help.ovhcloud.com/csm/fr-api-getting-started-ovhcloud-api
 */
export function ovhSignature(
  credentials: OvhCredentials,
  method: string,
  url: string,
  body: string,
  timestamp: number,
): string {
  const raw = [
    credentials.appSecret,
    credentials.consumerKey,
    method.toUpperCase(),
    url,
    body,
    String(timestamp),
  ].join("+");
  return `$1$${createHash("sha1").update(raw).digest("hex")}`;
}

export class OvhRegistrar implements RegistrarProvider {
  readonly mode = "ovh" as const;

  constructor(private readonly credentials: OvhCredentials) {}

  private async call<T>(method: string, path: string, payload?: unknown): Promise<T> {
    const url = `${OVH_ENDPOINT}${path}`;
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Ovh-Application": this.credentials.appKey,
        "X-Ovh-Consumer": this.credentials.consumerKey,
        "X-Ovh-Timestamp": String(timestamp),
        "X-Ovh-Signature": ovhSignature(this.credentials, method, url, body, timestamp),
      },
      body: body || undefined,
    });
    if (!response.ok) {
      throw new Error(`OVH ${method} ${path} → ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }

  async checkAvailability(domain: string): Promise<DomainAvailability> {
    // L'API d'ordre expose la disponibilité via la création d'un panier
    const cart = await this.call<{ cartId: string }>("POST", "/order/cart", {
      ovhSubsidiary: "FR",
    });
    try {
      const offers = await this.call<
        { productId: string; prices?: { price?: { value?: number }; duration?: string }[] }[]
      >("GET", `/order/cart/${cart.cartId}/domain?domain=${encodeURIComponent(domain)}`);
      const offer = offers[0];
      const yearly = offer?.prices?.find((p) => p.duration === "P1Y");
      return {
        domain,
        available: Boolean(offer),
        pricePerYear: yearly?.price?.value ?? null,
      };
    } catch {
      return { domain, available: false, pricePerYear: null };
    }
  }

  async orderDomain(domain: string, _ownerEmail: string): Promise<DomainOrder> {
    const cart = await this.call<{ cartId: string }>("POST", "/order/cart", {
      ovhSubsidiary: "FR",
    });
    await this.call("POST", `/order/cart/${cart.cartId}/domain`, { domain, duration: "P1Y" });
    await this.call("POST", `/order/cart/${cart.cartId}/assign`);
    const checkout = await this.call<{ orderId: number }>(
      "POST",
      `/order/cart/${cart.cartId}/checkout`,
      { autoPayWithPreferredPaymentMethod: true },
    );
    return {
      domain,
      orderId: String(checkout.orderId),
      status: "registered",
      expiresAt: new Date(Date.now() + 365 * 86_400_000),
    };
  }

  async configureDns(domain: string, records: DnsRecord[]): Promise<void> {
    for (const record of records) {
      const existing = await this.call<number[]>(
        "GET",
        `/domain/zone/${domain}/record?fieldType=${record.type}&subDomain=${record.subdomain}`,
      );
      for (const id of existing) {
        await this.call("DELETE", `/domain/zone/${domain}/record/${id}`);
      }
      await this.call("POST", `/domain/zone/${domain}/record`, {
        fieldType: record.type,
        subDomain: record.subdomain,
        target: record.target,
        ttl: 3600,
      });
    }
    await this.call("POST", `/domain/zone/${domain}/refresh`);
  }
}
