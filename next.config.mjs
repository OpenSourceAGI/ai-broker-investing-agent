import { createMDX } from "fumadocs-mdx/next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Makes Cloudflare bindings (D1, send_email, ...) available via
// getCloudflareContext() during `next dev`.
initOpenNextCloudflareForDev();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable Turbopack for builds to fix MDX serialization issues
  experimental: {
    turbo: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  transpilePackages: [
    "indicatorts",
  ],
  serverExternalPackages: [
    "dukascopy-node",
    "fastest-validator",
    "ts-morph",
    "typescript",
    "oxc-transform",
    "twoslash",
    "twoslash-protocol",
    "shiki",
    "entities",
    "parse5",
  ],
  reactStrictMode: true,

  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "entities/escape": path.resolve(
        __dirname,
        "node_modules/entities/escape.js",
      ),
      "investing/stocks": path.resolve(
        __dirname,
        isServer
          ? "packages/investing/src/stocks/index.ts"
          : "packages/investing/src/stocks/stock-names-client.ts",
      ),
      "investing": path.resolve(
        __dirname,
        "packages/investing/src/index.ts",
      ),
    };
    if (isServer) {
      config.resolve.alias["fumadocs-mdx:collections/server"] = path.resolve(
        __dirname,
        ".source/server.ts",
      );
    }
    return config;
  },
};

export default withMDX(nextConfig);
