import { createMDX } from "fumadocs-mdx/next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Makes Cloudflare bindings (D1, send_email, ...) available via
// getCloudflareContext() during `next dev`.
initOpenNextCloudflareForDev();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Monorepo root: workspace packages live in <root>/packages.
const monorepoRoot = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
// `entities` may be hoisted to the workspace root, so resolve it instead of
// assuming a local node_modules directory.
const entitiesEscape = require.resolve("entities/escape");

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable Turbopack for builds to fix MDX serialization issues
  experimental: {
    turbo: false,
  },
  // The app lives in apps/ai-broker-web but imports workspace packages from
  // ../../packages, so file tracing has to start at the monorepo root.
  outputFileTracingRoot: monorepoRoot,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // `investing` and `predictos` are workspace packages consumed straight from
  // TypeScript source, so Next has to compile them as part of the app.
  transpilePackages: [
    "indicatorts",
    "investing",
    "predictos",
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
      "entities/escape": entitiesEscape,
      "investing/stocks": path.resolve(
        monorepoRoot,
        isServer
          ? "packages/investing/src/stocks/index.ts"
          : "packages/investing/src/stocks/stock-names-client.ts",
      ),
      "investing": path.resolve(
        monorepoRoot,
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
