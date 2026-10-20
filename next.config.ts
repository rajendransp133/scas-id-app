import type { NextConfig } from "next";

// Frontend only: `next build` emits a static site to out/.  No server
// features (route handlers, server actions, image optimisation) are available.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
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
