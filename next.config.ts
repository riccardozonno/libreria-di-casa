import type { NextConfig } from "next";

// Tutte le pagine sono dinamiche (sessione + CSP con nonce): vedi ADR-0013.
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: false,
  // Moduli nativi da non includere nel bundle server.
  serverExternalPackages: ["@node-rs/argon2", "sharp"],
  experimental: {
    serverActions: {
      // Foto copertina ridimensionate nel browser; il CSV ha un limite proprio.
      bodySizeLimit: "4mb",
    },
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
