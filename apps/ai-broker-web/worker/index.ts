/**
 * Cloudflare Workers entrypoint (`main` in wrangler.jsonc).
 *
 * The core request handler comes from vinext's App Router Worker entry. This
 * wrapper follows the vinext Cloudflare template while preserving this app's
 * scheduled cron routing: every schedule in wrangler.jsonc `triggers.crons` is
 * mapped to a Next.js API route and dispatched through the same handler with
 * the CRON_SECRET bearer token the routes already expect.
 *
 * The request path also runs the first-load Turnstile gate (lib/turnstile)
 * ahead of the app, so an unverified desktop browser gets a bot check instead
 * of the page on its very first HTML request.
 */
import { env as workerEnv } from "cloudflare:workers";
import handler from "vinext/server/app-router-entry";
import { handleTurnstileGate } from "../lib/turnstile";

/**
 * `packages/investing` runs both on Workers and in plain Node scripts, so it
 * reads the D1 binding off globalThis rather than importing `cloudflare:workers`
 * (which only resolves inside workerd, and would break the client bundle).
 */
(globalThis as Record<string, unknown>).__CLOUDFLARE_ENV__ = workerEnv;

const CRON_ROUTES: Record<string, string> = {
  "0 0 * * *": "/api/cron/sync-markets",
  "15 0 * * *": "/api/cron/refresh-quotes",
};

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: import("@cloudflare/workers-types").ExecutionContext) {
    // Cloudflare Turnstile, in front of everything else: a desktop browser's
    // first HTML page view is answered with a "just a moment" check until it
    // carries a pass this Worker signed. Returns null — and costs one HMAC
    // verify — for every other request, and for all of them when the
    // TURNSTILE_* variables are unset. See lib/turnstile/gate.ts.
    const gated = await handleTurnstileGate(request, env);
    if (gated) return gated;

    return handler.fetch(request, env, ctx);
  },

  async scheduled(
    controller: { cron: string },
    env: CloudflareEnv,
    ctx: import("@cloudflare/workers-types").ExecutionContext,
  ) {
    const route = CRON_ROUTES[controller.cron];
    if (!route) {
      console.warn(`No cron route mapped for schedule "${controller.cron}"`);
      return;
    }
    const origin = env.NEXT_PUBLIC_APP_URL || "https://self.internal";
    const headers: Record<string, string> = {};
    if (env.CRON_SECRET) {
      headers.authorization = `Bearer ${env.CRON_SECRET}`;
    }
    ctx.waitUntil(
      handler
        .fetch(new Request(`${origin}${route}`, { headers }), env, ctx)
        .then((res: Response) => console.log(`Cron ${route} -> ${res.status}`)),
    );
  },
};
