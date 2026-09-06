import { createClient } from "@libsql/client";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { env } from "cloudflare:workers";
import * as schema from "./schema";
import * as relations from "./relations";
import { sessionedD1 } from "./d1-session";

const fullSchema = { ...schema, ...relations };

export type Database = ReturnType<typeof drizzleLibsql<typeof fullSchema>>;

let _db: Database | null = null;

/**
 * Resolve the database for the current runtime:
 * - Cloudflare Workers (including `vinext dev`, which runs the server
 *   environment in workerd): the D1 binding `DB` from wrangler.jsonc, through
 *   drizzle-orm/d1. The binding is wrapped by `sessionedD1()` so that, with
 *   read replication enabled, every query in a request shares one D1 session
 *   and therefore one sequentially consistent view — see ./d1-session.ts. The
 *   wrapper resolves the session per call, so caching the driver below stays
 *   correct.
 * - Anywhere else (build, scripts): libsql against DATABASE_URL or a local file.
 */
function resolveDb(): Database {
  if (_db) return _db;

  if (env?.DB) {
    _db = drizzleD1(sessionedD1(env.DB) as never, { schema: fullSchema }) as unknown as Database;
    return _db;
  }

  const client = createClient({
    url: process.env.DATABASE_URL || "file:./local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  _db = drizzleLibsql(client, { schema: fullSchema });
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
