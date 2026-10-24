import type { NextConfig } from "next";

// cacheComponents is left off on purpose: almost every screen is behind a
// session cookie, so per-request rendering is the default we want.
const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Browsers still ask for /favicon.ico, which would otherwise hit the [org] route.
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: true }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
