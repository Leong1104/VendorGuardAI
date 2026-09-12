import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pure static site: every page is client-rendered against IndexedDB, so
  // there is no server, no API routes, and nothing to configure at deploy.
  output: "export",
  // A stray lockfile in the home directory otherwise makes Turbopack
  // mis-detect the workspace root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
