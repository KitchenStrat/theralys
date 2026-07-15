export type DomainAvailability = {
  domain: string;
  available: boolean;
  /** Prix TTC €/an (null si indisponible) */
  pricePerYear: number | null;
};

export type DomainOrder = {
  domain: string;
  orderId: string;
  status: "registered";
  expiresAt: Date;
};

export type DnsRecord = {
  type: "A" | "CNAME" | "TXT";
  subdomain: string;
  target: string;
};

/**
 * Registrar retenu : OVH (décision kickoff Phase 3, Gandi en alternative).
 * Le client cherche/achète son domaine depuis son back office ; la
 * configuration DNS pointe vers Vercel, le SSL est automatique côté Vercel.
 */
export interface RegistrarProvider {
  readonly mode: "ovh" | "mock";
  checkAvailability(domain: string): Promise<DomainAvailability>;
  /** Commande le domaine (flux panier OVH) au nom de l'agence. */
  orderDomain(domain: string, ownerEmail: string): Promise<DomainOrder>;
  /** Applique les enregistrements DNS (remplace les existants du même nom/type). */
  configureDns(domain: string, records: DnsRecord[]): Promise<void>;
}

/** Enregistrements DNS pour un site hébergé sur Vercel. */
export const VERCEL_DNS_RECORDS: DnsRecord[] = [
  { type: "A", subdomain: "", target: "76.76.21.21" },
  { type: "CNAME", subdomain: "www", target: "cname.vercel-dns.com." },
];
