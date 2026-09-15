import { env as workerEnv } from "cloudflare:workers";

/**
 * Read a server-side variable at request time.
 *
 * Secrets set with `wrangler secret put` and the `vars` from wrangler.jsonc are
 * delivered on the Worker's `env` object. `process.env` only mirrors them under
 * `nodejs_compat`, and not at all in the Node scripts and build steps that
 * import the same modules, so the Worker env is the source of truth and
 * `process.env` (which is what `.env` files and `@t3-oss/env-nextjs` populate
 * locally) is the fallback.
 *
 * Empty strings are treated as "not set" so a blank secret never looks like a
 * real value to a call site that only checks for undefined.
 */
export function serverEnv(name: string): string | undefined {
  for (const source of [readWorkerEnv, readGlobalEnv, readProcessEnv]) {
    const value = source(name);
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Each source is guarded: outside workerd `cloudflare:workers` resolves to a
 * stub, and reading it must never be what breaks module evaluation.
 */
function readWorkerEnv(name: string): unknown {
  try {
    return (workerEnv as unknown as Record<string, unknown> | undefined)?.[name];
  } catch {
    return undefined;
  }
}

function readGlobalEnv(name: string): unknown {
  try {
    // worker/index.ts stashes the Worker env here for the code paths that also
    // run in plain Node scripts and so cannot import `cloudflare:workers`.
    const stashed = (globalThis as Record<string, unknown>).__CLOUDFLARE_ENV__;
    return stashed ? (stashed as Record<string, unknown>)[name] : undefined;
  } catch {
    return undefined;
  }
}

function readProcessEnv(name: string): unknown {
  try {
    return typeof process !== "undefined" ? process.env?.[name] : undefined;
  } catch {
    return undefined;
  }
}
