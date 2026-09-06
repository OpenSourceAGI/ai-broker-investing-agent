/**
 * Types for the Cloudflare bindings declared in wrangler.jsonc.
 *
 * Ambient (no top-level import/export) so the `declare module` blocks below
 * register the workerd built-ins rather than trying to augment them.
 * `npm run cf-typegen` regenerates a full version of this file from
 * wrangler.jsonc, including the complete Workers runtime types.
 */
interface CloudflareEnv {
  /** D1 database (drizzle-orm/d1) */
  DB: import("@cloudflare/workers-types").D1Database;
  /** Cloudflare Email Workers outbound binding */
  SEND_EMAIL: import("@cloudflare/workers-types").SendEmail;
  /** Static assets emitted by `vinext build` into dist/client */
  ASSETS: import("@cloudflare/workers-types").Fetcher;
  NEXT_PUBLIC_APP_URL?: string;
  EMAIL_FROM?: string;
  CRON_SECRET?: string;
  /**
   * D1 read-replication session mode — "auto" (default), "primary",
   * "unconstrained" or "off". See lib/db/d1-session.ts. A plain Variable, so
   * it can be changed in the dashboard without a redeploy.
   */
  D1_SESSION_MODE?: string;
  /**
   * When set, responses carry x-d1-served-by-region / -primary so you can see
   * which D1 instance answered.
   */
  D1_SESSION_DEBUG?: string;
}

/** Worker bindings, available at module scope inside workerd. */
declare module "cloudflare:workers" {
  export const env: CloudflareEnv;
}

declare module "cloudflare:email" {
  export class EmailMessage {
    constructor(from: string, to: string, raw: string | ReadableStream);
    readonly from: string;
    readonly to: string;
  }
}

/**
 * Resolved by the vinext Vite plugin to this project's App Router request
 * handler at build time; declared here so the `vinext/server/app-router-entry`
 * import type-checks in worker/index.ts.
 */
declare module "vinext/server/app-router-entry" {
  const handler: {
    fetch(
      request: Request,
      env: CloudflareEnv,
      ctx: import("@cloudflare/workers-types").ExecutionContext,
    ): Promise<Response>;
  };
  export default handler;
}
