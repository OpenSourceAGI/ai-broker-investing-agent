#!/usr/bin/env node
/**
 * Point Wrangler at the built Worker when it runs from the repository root.
 *
 * Cloudflare Workers Builds runs both the build command and the deploy command
 * (`npx wrangler deploy` / `npx wrangler versions upload`) from the configured
 * root directory, which here is the repository root. There is no Wrangler
 * configuration at the root — the Worker lives in `apps/ai-broker-web` — so
 * Wrangler fails with "Missing entry-point to Worker script or to assets
 * directory".
 *
 * `@cloudflare/vite-plugin` already emits a generated Wrangler configuration
 * for the built Worker plus a redirect file at
 * `apps/ai-broker-web/.wrangler/deploy/config.json` that points to it. Wrangler
 * searches *up* the directory tree from its working directory for
 * `.wrangler/deploy/config.json`, so a redirect inside the app is invisible
 * from the root. This script mirrors that redirect at the repository root,
 * rewriting the path so it still resolves to the same generated config.
 *
 * See https://developers.cloudflare.com/workers/wrangler/configuration/#generated-wrangler-configuration
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEPLOY_CONFIG = path.join(".wrangler", "deploy", "config.json");
const appDir = path.join(repoRoot, "apps", "ai-broker-web");

const appDeployConfigPath = path.join(appDir, DEPLOY_CONFIG);
if (!fs.existsSync(appDeployConfigPath)) {
  console.error(
    `[cloudflare] No deploy config at ${path.relative(repoRoot, appDeployConfigPath)}.\n` +
      "  It is written by @cloudflare/vite-plugin during `vinext build`, so run the\n" +
      "  web app build (`turbo run build`) before this script.",
  );
  process.exit(1);
}

/** @type {{ configPath?: string }} */
const appDeployConfig = JSON.parse(fs.readFileSync(appDeployConfigPath, "utf8"));
if (!appDeployConfig.configPath) {
  console.error(`[cloudflare] ${path.relative(repoRoot, appDeployConfigPath)} has no "configPath".`);
  process.exit(1);
}

// `configPath` is relative to the deploy config file that declares it.
const generatedConfigPath = path.resolve(path.dirname(appDeployConfigPath), appDeployConfig.configPath);
if (!fs.existsSync(generatedConfigPath)) {
  console.error(
    `[cloudflare] Generated Wrangler config ${path.relative(repoRoot, generatedConfigPath)} does not exist.\n` +
      "  Rebuild the web app so the Worker output is regenerated.",
  );
  process.exit(1);
}

const rootDeployConfigPath = path.join(repoRoot, DEPLOY_CONFIG);
const relativeConfigPath = path
  .relative(path.dirname(rootDeployConfigPath), generatedConfigPath)
  .split(path.sep)
  .join("/");

fs.mkdirSync(path.dirname(rootDeployConfigPath), { recursive: true });
fs.writeFileSync(rootDeployConfigPath, `${JSON.stringify({ configPath: relativeConfigPath }, null, 2)}\n`);

console.log(`[cloudflare] ${DEPLOY_CONFIG} -> ${relativeConfigPath}`);
