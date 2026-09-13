import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@wellrun/i18n", "@wellrun/tokens"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
