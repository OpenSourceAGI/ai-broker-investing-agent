/**
 * Cloudflare Workers entrypoint (`main` in wrangler.jsonc).
 *
 * The core request handler comes from vinext's App Router Worker entry. This
 * wrapper follows the vinext Cloudflare template while preserving this app's
 * scheduled cron routing: every schedule in wrangler.jsonc `triggers.crons` is
 * mapped to a Next.js API route and dispatched through the same handler with
 * the CRON_SECRET bearer token the routes already expect.
 */
import { env as workerEnv } from "cloudflare:workers";
import handler from "vinext/server/app-router-entry";

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
  fetch(request: Request, env: CloudflareEnv, ctx: import("@cloudflare/workers-types").ExecutionContext) {
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
