import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the end-to-end tests build into their own folder without touching a running dev server
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
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
