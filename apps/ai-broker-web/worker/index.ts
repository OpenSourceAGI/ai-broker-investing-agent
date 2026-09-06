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
import {
  applyD1Bookmark,
  runWithD1Session,
  runWithPrimaryD1Session,
  sessionedD1,
} from "../lib/db/d1-session";

/**
 * `packages/investing` runs both on Workers and in plain Node scripts, so it
 * reads the D1 binding off globalThis rather than importing `cloudflare:workers`
 * (which only resolves inside workerd, and would break the client bundle).
 */
(globalThis as Record<string, unknown>).__CLOUDFLARE_ENV__ = workerEnv;

/**
 * The same `DB` binding, wrapped so its queries run inside the current
 * request's D1 read-replication session (lib/db/d1-session.ts). Published
 * separately so `packages/investing` can prefer it over the raw binding and
 * share this request's consistent view of the database. Left unset when there
 * is no binding to wrap, so the fallbacks over there still fire.
 */
if (workerEnv?.DB) {
  (globalThis as Record<string, unknown>).__D1_SESSION_DB__ = sessionedD1(workerEnv.DB);
}

const CRON_ROUTES: Record<string, string> = {
  "0 0 * * *": "/api/cron/sync-markets",
  "15 0 * * *": "/api/cron/refresh-quotes",
};

export default {
  fetch(request: Request, env: CloudflareEnv, ctx: import("@cloudflare/workers-types").ExecutionContext) {
    // The whole request runs inside one D1 read-replication session: reads can
    // be answered by the replica nearest the request, while the session's
    // bookmark keeps them sequentially consistent. The closing bookmark rides
    // back on the response so the client's next request never sees an older
    // version of the database than this one did.
    return runWithD1Session(request, env.D1_SESSION_MODE, async () => {
      const response = await handler.fetch(request, env, ctx);
      return applyD1Bookmark(response, { debug: Boolean(env.D1_SESSION_DEBUG) });
    });
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
    // Cron runs have no client bookmark to resume from and write, so their
    // session starts on the primary.
    ctx.waitUntil(
      runWithPrimaryD1Session(() =>
        handler
          .fetch(new Request(`${origin}${route}`, { headers }), env, ctx)
          .then((res: Response) => console.log(`Cron ${route} -> ${res.status}`)),
      ),
    );
  },
};
