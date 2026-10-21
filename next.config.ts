import type { NextConfig } from "next";

// cacheComponents is left off on purpose: almost every screen is behind a
// session cookie, so per-request rendering is the default we want.
const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
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
