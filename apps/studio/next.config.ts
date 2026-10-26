import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
