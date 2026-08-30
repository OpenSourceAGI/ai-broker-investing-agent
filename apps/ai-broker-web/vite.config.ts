import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";
import mdx from "fumadocs-mdx/vite";
import { type Plugin, defineConfig } from "vite";
import vinext from "vinext";
import * as mdxConfig from "./source.config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
// Monorepo root: workspace packages live in <root>/packages.
const monorepoRoot = path.resolve(projectRoot, "../..");
const require = createRequire(import.meta.url);
// `entities` may be hoisted to the workspace root, so resolve it instead of
// assuming a local node_modules directory.
const entitiesEscape = require.resolve("entities/escape");

const investingSrc = path.resolve(monorepoRoot, "packages/investing/src");
const fumadocsPlugin = await mdx(mdxConfig);

/**
 * Fumadocs emits JSON collection imports with query strings. In vinext/RSC
 * builds those IDs can bypass Vite's standard JSON plugin, so load the raw
 * JSON early and wrap any remaining JSON payload as an ES module after the
 * Fumadocs transform. This mirrors the Cloudflare vinext template and keeps
 * docs generation compatible with Workers builds.
 */
function fumadocsJsonLoad(): Plugin {
  return {
    name: "fumadocs-json-load",
    enforce: "pre",
    resolveId(id) {
      if (id.match(/\.json\?.*collection=/)) return id;
      return null;
    },
    load(id) {
      if (!id.match(/\.json\?.*collection=/)) return null;
      const filePath = id.split("?")[0];
      try {
        return { code: readFileSync(filePath, "utf8"), map: null };
      } catch {
        return { code: "{}", map: null };
      }
    },
  };
}

function fumadocsJsonWrap(): Plugin {
  return {
    name: "fumadocs-json-wrap",
    transform(code, id) {
      if (!id.match(/\.json\?.*collection=/)) return null;
      const trimmed = code.trim();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
      try {
        return { code: `export default ${JSON.stringify(JSON.parse(trimmed))}`, map: null };
      } catch {
        return null;
      }
    },
  };
}

/**
 * `investing/stocks` has a server entry (full ticker dataset) and a trimmed
 * client entry. `resolve.alias` can't vary per environment, so this resolves
 * the specifier itself. `enforce: "pre"` also keeps the broader `investing`
 * alias below from claiming `investing/stocks` first.
 */
function investingStocksEntry(): Plugin {
  const entries = {
    client: path.join(investingSrc, "stocks/stock-names-client.ts"),
    server: path.join(investingSrc, "stocks/index.ts"),
  };
  return {
    name: "investing-stocks-entry",
    enforce: "pre",
    resolveId(source) {
      if (source !== "investing/stocks") return null;
      return this.environment.name === "client" ? entries.client : entries.server;
    },
  };
}

export default defineConfig({
  // Polyfill CJS globals used by a few Node-oriented dependencies when they
  // are bundled into the Cloudflare Workers runtime.
  define: {
    __filename: JSON.stringify("/"),
    __dirname: JSON.stringify("/"),
  },
  plugins: [
    investingStocksEntry(),
    fumadocsJsonLoad(),
    // Generates `.source/*` from source.config.ts and compiles content/docs.
    fumadocsPlugin,
    fumadocsJsonWrap(),
    vinext({
      // Page-level ISR served straight from the Cloudflare edge cache, so
      // there is no namespace to provision. Add
      // `data: kvDataAdapter()` (plus a VINEXT_KV_CACHE binding) if the
      // `"use cache"` / `unstable_cache` data cache is needed later.
      cache: { cdn: cdnAdapter() },
      // Inlined instead of a next.config file so the Vite config is the single
      // source of truth for the build.
      nextConfig: {
        images: {
          unoptimized: true,
        },
        // `investing` and `predictos` are workspace packages consumed straight
        // from TypeScript source, so they have to be compiled with the app.
        transpilePackages: ["indicatorts", "investing", "predictos"],
        reactStrictMode: true,
      },
    }),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
  resolve: {
    alias: {
      investing: path.join(investingSrc, "index.ts"),
      "entities/escape": entitiesEscape,
      // Emitted by the fumadocs-mdx Vite plugin into `.source/`.
      "fumadocs-mdx:collections/server": path.join(projectRoot, ".source/server.ts"),
    },
  },
});
