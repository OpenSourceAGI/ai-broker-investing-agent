/**
 * Cloudflare Workers entrypoint (`main` in wrangler.jsonc).
 *
 * vinext builds the request handler; this wrapper only adds cron trigger
 * routing (replacing vercel.json crons): each schedule in wrangler.jsonc
 * `triggers.crons` is mapped to a Next.js cron API route and dispatched
 * through the same handler with the CRON_SECRET bearer token the routes
 * already expect.
 */
import { env as workerEnv } from "cloudflare:workers";
import handler from "vinext/server/fetch-handler";

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
  fetch: handler.fetch,

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
      headers["authorization"] = `Bearer ${env.CRON_SECRET}`;
    }
    ctx.waitUntil(
      handler
        .fetch(new Request(`${origin}${route}`, { headers }), env, ctx)
        .then((res: Response) => console.log(`Cron ${route} -> ${res.status}`)),
    );
  },
};
