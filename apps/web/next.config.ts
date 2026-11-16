import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@theralys/db", "@theralys/shared"],
  serverExternalPackages: ["pg"],
  // Captures d'écran de la vitrine : AVIF d'abord, WebP en repli
  images: { formats: ["image/avif", "image/webp"] },
};

export default nextConfig;
