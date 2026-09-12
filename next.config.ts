import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile in the home directory otherwise makes Turbopack
  // mis-detect the workspace root.
  turbopack: {
    root: __dirname,
  },
  // pdf.js is loaded at runtime from node_modules (it resolves its own
  // worker file) rather than bundled into the server build.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
