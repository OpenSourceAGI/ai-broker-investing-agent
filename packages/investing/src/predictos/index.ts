/**
 * PredictOS agent toolkit
 *
 * Reusable backend TypeScript ported/adapted from the PredictOS project
 * (https://github.com/PredictionXBT/PredictOS, MIT, Copyright 2025 PredictionXBT).
 *
 * The original code targeted Deno / Supabase edge functions. It has been adapted
 * to Node/ESM for the `investing` package:
 * - `Deno.env.get(...)` -> `process.env.*`
 * - Deno URL / `npm:` / `jsr:` imports -> npm imports (global `fetch`, Node 18+)
 * - `serve(...)` / `Deno.serve(...)` HTTP + CORS wrappers removed; each agent is a
 *   plain exported async function.
 *
 * Public surface:
 * - Agent functions (and their type namespaces) at the top level
 * - AI provider clients + prompt builders under `ai`
 * - Data-provider / x402 clients under `clients`
 */

// Agent functions + per-agent type namespaces
export * from "./agents";

// AI provider clients and prompt builders
export * as ai from "./ai";

// Fetch-based API clients (dflow, dome, polyfactual, polymarket, x402)
export * as clients from "./clients";
