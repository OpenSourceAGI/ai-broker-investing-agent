import { createClient } from "@libsql/client";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as schema from "./schema";
import * as relations from "./relations";

const fullSchema = { ...schema, ...relations };

type Database = ReturnType<typeof drizzleLibsql<typeof fullSchema>>;

let _db: Database | null = null;

/**
 * Resolve the database for the current runtime: the Cloudflare D1 binding
 * (via @opennextjs/cloudflare) when running on Workers, otherwise libsql
 * against DATABASE_URL or a local file. Imported dynamically so this package
 * still builds standalone (vite lib build) without the Next.js runtime.
 */
function resolveDb(): Database {
  if (_db) return _db;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    const { env } = getCloudflareContext();
    if (env?.DB) {
      _db = drizzleD1(env.DB, { schema: fullSchema }) as unknown as Database;
      return _db;
    }
  } catch {
    // Not on Cloudflare Workers — fall back to libsql.
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
