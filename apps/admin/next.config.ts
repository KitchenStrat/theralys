import type { NextConfig } from "next";

/**
 * En-têtes de sécurité de toutes les réponses. Le back-office n'est jamais
 * affiché dans le cadre d'une autre page : une page tierce (y compris le site
 * d'un client, servi sur un domaine voisin) ne peut pas le superposer pour
 * faire cliquer un administrateur connecté à son insu (changement de formule,
 * ouverture de l'espace d'un client).
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  transpilePackages: ["@theralys/db", "@theralys/shared", "@theralys/ai", "@theralys/ui", "@theralys/providers", "@theralys/jobs", "@theralys/analytics"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
