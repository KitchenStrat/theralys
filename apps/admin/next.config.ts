import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@theralys/db", "@theralys/shared", "@theralys/ai", "@theralys/ui"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
