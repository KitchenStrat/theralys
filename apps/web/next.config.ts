import type { NextConfig } from "next";

/** En-têtes de sécurité : la vitrine ne s'affiche que dans son propre cadre, les types de fichiers ne sont pas devinés. */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  transpilePackages: ["@theralys/db", "@theralys/shared", "@theralys/providers"],
  serverExternalPackages: ["pg"],
  // Captures d'écran de la vitrine : AVIF d'abord, WebP en repli
  images: { formats: ["image/avif", "image/webp"] },
};

export default nextConfig;
