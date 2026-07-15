import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@theralys/db", "@theralys/shared", "@theralys/analytics"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
