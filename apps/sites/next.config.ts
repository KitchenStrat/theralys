import type { NextConfig } from "next";

/**
 * En-têtes de sécurité des sites publics. Pas d'interdiction d'encadrement :
 * l'éditeur du studio affiche chaque site dans un cadre, y compris sur le
 * domaine du client ; le pont de l'éditeur n'écoute que l'origine du studio.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  transpilePackages: ["@theralys/db", "@theralys/shared", "@theralys/analytics"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
