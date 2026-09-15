import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import { env } from "cloudflare:workers";
import * as schema from "./schema";
import * as relations from "./relations";
import {
  createD1HttpDriver,
  getD1HttpCredentials,
} from "../../../../packages/investing/src/db/d1-http";

const fullSchema = { ...schema, ...relations };

export type Database = ReturnType<typeof drizzleD1<typeof fullSchema>>;

let _db: Database | null = null;

/**
 * Resolve the Cloudflare D1 connection for the current runtime:
 * - Cloudflare Workers (including `vinext dev`, which runs the server
 *   environment in workerd): the D1 binding `DB` from wrangler.jsonc, through
 *   drizzle-orm/d1.
 * - Anywhere else (build steps, maintenance scripts): the same D1 database
 *   over its REST API, through drizzle-orm/sqlite-proxy.
 *
 * Cloudflare D1 is the only supported database — there is no libsql/Turso,
 * Postgres, or local sqlite fallback.
 */
function resolveDb(): Database {
  if (_db) return _db;

  if (env?.DB) {
    _db = drizzleD1(env.DB as never, { schema: fullSchema });
    return _db;
  }

  const credentials = getD1HttpCredentials();
  if (!credentials) {
    throw new Error(
      "No Cloudflare D1 connection available. On Workers this needs the `DB` " +
        "binding from wrangler.jsonc; elsewhere set CLOUDFLARE_ACCOUNT_ID and " +
        "CLOUDFLARE_D1_TOKEN (and optionally CLOUDFLARE_DATABASE_ID) to reach " +
        "D1 over its REST API.",
    );
  }

  _db = drizzleProxy(createD1HttpDriver(credentials), {
    schema: fullSchema,
  }) as unknown as Database;
  return _db;
}

/**
 * Lazy proxy so the driver is only constructed on first use, while keeping the
 * existing `import { db }` call sites.
 */
export const db = new Proxy({} as Database, {
  get(_target, prop) {
    const real = resolveDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as CallableFunction).bind(real) : value;
  },
  has(_target, prop) {
    return prop in (resolveDb() as object);
  },
});

/**
 * Re-export database connection from packages/investing
 */
export * from "../../../../packages/investing/src/db";
