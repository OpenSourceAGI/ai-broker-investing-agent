import { createClient } from "@libsql/client";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as schema from "./schema";
import * as relations from "./relations";

const fullSchema = { ...schema, ...relations };

type Database = ReturnType<typeof drizzleLibsql<typeof fullSchema>>;

let _db: Database | null = null;

/**
 * Resolve the database for the current runtime: the Cloudflare D1 binding when
 * running on Workers, otherwise libsql against DATABASE_URL or a local file.
 *
 * The bindings are read off globalThis rather than imported from
 * `cloudflare:workers` so this package still builds standalone (vite lib build)
 * and stays usable from plain Node scripts and browser bundles. The web app's
 * Worker entry (apps/ai-broker-web/worker/index.ts) publishes them.
 *
 * That entry also publishes `__D1_SESSION_DB__`: the same `DB` binding wrapped
 * so its queries run inside the current request's D1 read-replication session
 * (apps/ai-broker-web/lib/db/d1-session.ts). Preferring it keeps this package's
 * queries on the same sequentially consistent view of the database as the web
 * app's, instead of opening an unsessioned second read path. The wrapper picks
 * the session per call, so caching the driver below stays correct.
 */
function resolveDb(): Database {
  if (_db) return _db;

  const globals = globalThis as {
    __CLOUDFLARE_ENV__?: { DB?: unknown };
    __D1_SESSION_DB__?: unknown;
  };
  const d1 = globals.__D1_SESSION_DB__ ?? globals.__CLOUDFLARE_ENV__?.DB;
  if (d1) {
    _db = drizzleD1(d1 as never, { schema: fullSchema }) as unknown as Database;
    return _db;
  }

  const client = createClient({
    url: process.env.DATABASE_URL || "file:./investing-local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  _db = drizzleLibsql(client, { schema: fullSchema });
  return _db;
}

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
