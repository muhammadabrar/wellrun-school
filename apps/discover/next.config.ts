import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@wellrun/i18n", "@wellrun/tokens", "@wellrun/ui"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
