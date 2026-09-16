import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../schema";

/**
 * Guards the invariant that broke Google sign-in in production: drizzle builds
 * every INSERT from `lib/db/schema.ts`, listing *all* of a table's columns, so
 * a column that exists in the schema but in no migration makes the statement
 * fail with "no such column" the first time it runs. better-auth swallows that
 * into "Unable to create OAuth user", and the D1 database is the only place it
 * is visible.
 *
 * `migrations/meta/` is drizzle-kit's record of what the migrations in this
 * directory produce, so comparing the schema against the newest snapshot is the
 * same check `drizzle-kit generate` makes, without needing a database.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../migrations");
const META_DIR = join(MIGRATIONS_DIR, "meta");

type JournalEntry = { idx: number; tag: string };
type Snapshot = {
  tables: Record<string, { columns: Record<string, { name: string }> }>;
};

const journal = JSON.parse(
  readFileSync(join(META_DIR, "_journal.json"), "utf8"),
) as { entries: JournalEntry[] };

const latestEntry = journal.entries[journal.entries.length - 1]!;
const latestSnapshot = JSON.parse(
  readFileSync(join(META_DIR, `${String(latestEntry.idx).padStart(4, "0")}_snapshot.json`), "utf8"),
) as Snapshot;

describe("migrations directory", () => {
  it("has the SQL and the snapshot for every journal entry", () => {
    const missing = journal.entries.flatMap((entry) => {
      const idx = String(entry.idx).padStart(4, "0");
      return [`${entry.tag}.sql`, `meta/${idx}_snapshot.json`].filter(
        (file) => !existsInMigrations(file),
      );
    });

    expect(missing).toEqual([]);
  });

  it("journals every migration in the directory", () => {
    const tags = new Set(journal.entries.map((entry) => entry.tag));
    const unjournalled = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => file.replace(/\.sql$/, ""))
      .filter((tag) => !tags.has(tag));

    expect(unjournalled).toEqual([]);
  });
});

describe("schema against the applied migrations", () => {
  const tables = Object.values(schema as Record<string, unknown>).filter(
    (value): value is SQLiteTable => value instanceof SQLiteTable,
  );

  const drift = tables
    .flatMap((table) => {
      const { name, columns } = getTableConfig(table);
      const snapshotTable = latestSnapshot.tables[name];
      if (!snapshotTable) return [`${name} (whole table)`];
      return columns
        .filter((column) => !(column.name in snapshotTable.columns))
        .map((column) => `${name}.${column.name}`);
    });

  it("has a migration for every table and column", () => {
    // A non-empty list means `bun run db:generate` was not run, or the
    // generated migration was not committed.
    expect(drift).toEqual([]);
  });

  /**
   * better-auth writes these through the drizzle adapter on OAuth sign-up, in
   * one INSERT ... RETURNING against `users`. `stripe_customer_id` and
   * `trial_allowed` are the pair the @better-auth/stripe plugin added.
   */
  it.each([
    "id",
    "name",
    "email",
    "email_verified",
    "image",
    "stripe_customer_id",
    "trial_allowed",
    "created_at",
    "updated_at",
  ])("creates users.%s", (column) => {
    expect(Object.keys(latestSnapshot.tables.users!.columns)).toContain(column);
  });

  /**
   * better-auth >= 1.7 keys accounts by (issuer, accountId); the unique index
   * is what the account lookup on the OAuth callback relies on.
   */
  it.each(["issuer", "account_id", "provider_id", "refresh_token_expires_at"])(
    "creates accounts.%s",
    (column) => {
      expect(Object.keys(latestSnapshot.tables.accounts!.columns)).toContain(column);
    },
  );
});

function existsInMigrations(relativePath: string): boolean {
  try {
    readFileSync(join(MIGRATIONS_DIR, relativePath));
    return true;
  } catch {
    return false;
  }
}
