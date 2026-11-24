import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Consignes aux moteurs de recherche : tout le site public se lit, et le plan
 * du site est annoncé. La page de retour après paiement (`/merci`) se déclare
 * elle-même hors index : la laisser lisible permet aux moteurs de voir cette
 * consigne.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
