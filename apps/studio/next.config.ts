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
  serverExternalPackages: ["pg"],
  experimental: {
    serverActions: {
      // « Enregistrer et publier » peut porter une photo en data-URI quand le
      // stockage Blob n'est pas configuré (défaut Next.js : 1 Mo, trop juste)
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
