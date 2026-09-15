import { and, asc, count, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { AdminDB } from "./db";
import {
  agentApiLogs,
  comments,
  likes,
  positions,
  sessions,
  signals,
  strategies,
  trades,
  users,
  watchlist,
  watchlists,
} from "@/lib/db/schema";

/**
 * Every account-linked table that represents a user *doing* something, keyed
 * by the name the admin users table's column uses. Each becomes a correlated
 * `count(*)` subquery rather than a join: joining nine one-to-many tables at
 * once would fan out and multiply every counter by the row counts of the
 * others. A subquery can also be referenced from ORDER BY, so the table can
 * be sorted by any usage column across the whole result set instead of only
 * within the page that happened to be fetched.
 */
const USAGE_SOURCES = {
  strategies: { table: strategies, userId: strategies.userId },
  watchlists: { table: watchlists, userId: watchlists.userId },
  tickers: { table: watchlist, userId: watchlist.userId },
  signals: { table: signals, userId: signals.userId },
  positions: { table: positions, userId: positions.userId },
  trades: { table: trades, userId: trades.userId },
  apiCalls: { table: agentApiLogs, userId: agentApiLogs.userId },
  comments: { table: comments, userId: comments.userId },
  likes: { table: likes, userId: likes.userId },
} as const;

export type UsageKey = keyof typeof USAGE_SOURCES;

export const USAGE_KEYS = Object.keys(USAGE_SOURCES) as UsageKey[];

/**
 * Renders a column as `"table"."column"`. Interpolating a column directly
 * emits it unqualified, which silently binds to the wrong table inside a
 * correlated subquery: `${users.id}` becomes a bare `"id"`, and every table
 * counted below has an `id` column of its own, so the subquery would compare
 * `trades.user_id = trades.id` and count zero rows for everyone.
 */
const qualified = (table: SQLiteTable, column: AnySQLiteColumn) =>
  sql`${table}.${sql.identifier(column.name)}`;

const countForUser = ({ table, userId }: { table: SQLiteTable; userId: AnySQLiteColumn }) =>
  sql<number>`(select count(*) from ${table} where ${qualified(table, userId)} = ${qualified(
    users,
    users.id,
  )})`.mapWith(Number);

const usageExpressions = Object.fromEntries(
  USAGE_KEYS.map((key) => [key, countForUser(USAGE_SOURCES[key])]),
) as Record<UsageKey, SQL<number>>;

/** Sessions are logins rather than saved work, so they sit outside `total`. */
const sessionsExpression = countForUser({ table: sessions, userId: sessions.userId });

/** One number for "how much has this account actually been used". */
const totalExpression = sql<number>`(${sql.join(
  USAGE_KEYS.map((key) => usageExpressions[key]),
  sql` + `,
)})`.mapWith(Number);

/**
 * Newest session touch — the last sign-in or session refresh. Timestamps are
 * stored as unix seconds (drizzle `mode: "timestamp"`), and raw SQL bypasses
 * drizzle's Date mapping, so callers convert the seconds themselves.
 */
const lastActiveExpression = sql<number | null>`(select max(${qualified(
  sessions,
  sessions.updatedAt,
)}) from ${sessions} where ${qualified(sessions, sessions.userId)} = ${qualified(users, users.id)})`;

const SORT_EXPRESSIONS: Record<string, SQL | AnySQLiteColumn> = {
  name: users.name,
  email: users.email,
  joined: users.createdAt,
  usageCount: users.usageCount,
  lastActive: lastActiveExpression,
  sessions: sessionsExpression,
  total: totalExpression,
  ...usageExpressions,
};

export const DEFAULT_SORT = "joined";

export interface UserUsageQuery {
  page: number;
  limit: number;
  search?: string;
  hideUnverified?: boolean;
  sort?: string;
  dir?: "asc" | "desc";
}

/** Narrows the directory to what the admin typed and toggled. */
function buildFilter({ search, hideUnverified }: Pick<UserUsageQuery, "search" | "hideUnverified">) {
  const conditions = [];
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      or(like(users.name, pattern), like(users.email, pattern), like(users.id, pattern)),
    );
  }
  if (hideUnverified) conditions.push(eq(users.emailVerified, true));
  return conditions.length ? and(...conditions) : undefined;
}

/**
 * One page of accounts with a usage counter per feature, plus how many
 * accounts the filter matched in total (for the pager).
 */
export async function loadUserUsagePage(db: AdminDB, options: UserUsageQuery) {
  const where = buildFilter(options);
  const sortExpression = SORT_EXPRESSIONS[options.sort ?? ""] ?? SORT_EXPRESSIONS[DEFAULT_SORT];
  const direction = options.dir === "asc" ? asc : desc;

  const [rows, [matched]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        emailVerified: users.emailVerified,
        usageCount: users.usageCount,
        kycStatus: users.kycStatus,
        trialAllowed: users.trialAllowed,
        stripeCustomerId: users.stripeCustomerId,
        alpacaPaper: users.alpacaPaper,
        createdAt: users.createdAt,
        lastActiveSeconds: lastActiveExpression,
        sessions: sessionsExpression,
        total: totalExpression,
        ...usageExpressions,
      })
      .from(users)
      .where(where)
      // `users.id` breaks ties so pagination stays stable when many rows share
      // a sort value — every usage counter is 0 for a brand-new account.
      .orderBy(direction(sortExpression), desc(users.id))
      .limit(options.limit)
      .offset((options.page - 1) * options.limit),
    db.select({ value: count() }).from(users).where(where),
  ]);

  return {
    users: rows.map(({ lastActiveSeconds, ...row }: (typeof rows)[number]) => ({
      ...row,
      lastActiveAt: lastActiveSeconds ? new Date(lastActiveSeconds * 1000).toISOString() : null,
    })),
    matchedUsers: matched?.value ?? 0,
  };
}

/**
 * Site-wide row counts for the summary strip above the table. These
 * deliberately ignore the search and filter, so the headline numbers stay a
 * stable reference while an admin narrows the table underneath them.
 */
export async function loadSiteUsageTotals(db: AdminDB) {
  const sources: Array<[string, SQLiteTable]> = [
    ["users", users],
    ["sessions", sessions],
    ...USAGE_KEYS.map((key) => [key, USAGE_SOURCES[key].table] as [string, SQLiteTable]),
  ];

  const counts = await Promise.all(
    sources.map(async ([, table]) => {
      const [row] = await db.select({ value: count() }).from(table);
      return row?.value ?? 0;
    }),
  );

  const totals = Object.fromEntries(sources.map(([key], index) => [key, counts[index]])) as Record<
    "users" | "sessions" | UsageKey,
    number
  >;

  return { ...totals, activity: USAGE_KEYS.reduce((sum, key) => sum + totals[key], 0) };
}
