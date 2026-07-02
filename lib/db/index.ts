import { createClient } from "@libsql/client";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";
import * as relations from "./relations";

const fullSchema = { ...schema, ...relations };

export type Database = ReturnType<typeof drizzleLibsql<typeof fullSchema>>;

let _db: Database | null = null;

/**
 * Resolve the database for the current runtime:
 * - Cloudflare Workers (and `next dev` via initOpenNextCloudflareForDev):
 *   the D1 binding `DB` from wrangler.jsonc, through drizzle-orm/d1.
 * - Anywhere else (build, scripts): libsql against DATABASE_URL or a local file.
 */
function resolveDb(): Database {
  if (_db) return _db;

  try {
    const { env } = getCloudflareContext();
    if (env?.DB) {
      _db = drizzleD1(env.DB as never, { schema: fullSchema }) as unknown as Database;
      return _db;
    }
  } catch {
    // Not inside a Cloudflare request context — fall back to libsql.
  }

  const client = createClient({
    url: process.env.DATABASE_URL || "file:./local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  _db = drizzleLibsql(client, { schema: fullSchema });
  return _db;
}

/**
 * Lazy proxy so the D1 binding is only read at request time (module scope has
 * no Cloudflare context) while keeping the existing `import { db }` call sites.
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
export * from "../../packages/investing/src/db";
