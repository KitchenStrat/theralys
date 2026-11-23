import type { NextConfig } from "next";

/**
 * En-têtes de sécurité de toutes les réponses. Le studio n'est jamais affiché
 * dans le cadre d'une autre page : une page tierce (y compris le site d'un
 * client, servi sur un domaine voisin) ne peut pas le superposer pour faire
 * cliquer un praticien connecté à son insu.
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
  transpilePackages: [
    "@theralys/db",
    "@theralys/shared",
    "@theralys/ai",
    "@theralys/ui", "@theralys/providers",
    "@theralys/analytics",
    "@theralys/jobs",
  ],
  // sharp : binaire natif (rendu des visuels réseaux sociaux), jamais bundlé
  serverExternalPackages: ["pg", "sharp"],
  // Polices TTF lues par fs.readFile dans les routes /api/social/* : à embarquer
  // dans le bundle serverless (elles ne sont pas détectées par le traçage).
  outputFileTracingIncludes: {
    "/api/social/**": ["./assets/fonts/**"],
    "/api/google-posts/**": ["./assets/fonts/**"],
  },
  experimental: {
    serverActions: {
      // « Enregistrer et publier » peut porter une photo en data-URI quand le
      // stockage Blob n'est pas configuré (défaut Next.js : 1 Mo, trop juste)
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
