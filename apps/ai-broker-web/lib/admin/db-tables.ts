import { and, count, desc, eq, like, lt, or, sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { AdminDB } from "./db";
import {
  accounts,
  agentApiLogs,
  comments,
  likes,
  notifications,
  organizations,
  portfolios,
  positions,
  sessions,
  sharedItems,
  signals,
  strategies,
  subscriptions,
  teamMembers,
  teams,
  trades,
  userFollows,
  userSettings,
  users,
  verifications,
  walletAddresses,
  watchlist,
  watchlists,
} from "@/lib/db/schema";

/** How a value coming back from the browser is coerced before it is written. */
export type FieldType = "string" | "number" | "boolean";

export interface EditableField {
  /** Drizzle property name; also the key used in the PATCH body. */
  name: string;
  label: string;
  type: FieldType;
  /** Shown under the input as a hint about what the column means. */
  hint?: string;
}

export interface AdminTable {
  label: string;
  description: string;
  table: SQLiteTable;
  /** Row identity for PATCH/DELETE. Composite keys are not supported. */
  primaryKey: AnySQLiteColumn;
  /** Columns rendered in the browser, in order. */
  columns: Array<{ name: string; column: AnySQLiteColumn; truncate?: boolean }>;
  /** Columns the `q` parameter matches with LIKE. */
  searchable: AnySQLiteColumn[];
  /** Default ordering — newest-first wherever the table records a time. */
  orderBy: AnySQLiteColumn;
  /** Subset of `columns` an admin may write. Empty means read-and-delete only. */
  editable: EditableField[];
  /**
   * Deleting a row here cascades or orphans a lot of user-visible data, so the
   * UI asks for the row id to be typed before it will send the request.
   */
  destructive?: boolean;
}

const col = (name: string, column: AnySQLiteColumn, truncate = false) => ({
  name,
  column,
  truncate,
});

/**
 * The tables an admin may browse and edit, keyed by the slug that appears in
 * the route. This registry is the entire attack surface of the database
 * controls: a table absent from it cannot be read, written or deleted through
 * the admin API, and within a listed table only the columns in `editable` can
 * be written. Credential-bearing columns — broker keys and secrets on `users`
 * and `user_settings`, OAuth tokens and password hashes on `accounts`,
 * `sessions.token` — are deliberately absent from every `columns` list, so
 * they are never serialised to the browser.
 */
export const ADMIN_TABLES = {
  users: {
    label: "Users",
    description:
      "Accounts. Broker credentials and API keys are stored on this table but never listed here.",
    table: users,
    primaryKey: users.id,
    columns: [
      col("id", users.id),
      col("name", users.name),
      col("email", users.email),
      col("emailVerified", users.emailVerified),
      col("kycStatus", users.kycStatus),
      col("usageCount", users.usageCount),
      col("trialAllowed", users.trialAllowed),
      col("alpacaPaper", users.alpacaPaper),
      col("stripeCustomerId", users.stripeCustomerId),
      col("createdAt", users.createdAt),
    ],
    searchable: [users.id, users.name, users.email],
    orderBy: users.createdAt,
    editable: [
      { name: "name", label: "Display name", type: "string" },
      { name: "email", label: "Email", type: "string" },
      { name: "emailVerified", label: "Email verified", type: "boolean" },
      {
        name: "usageCount",
        label: "Usage count",
        type: "number",
        hint: "Agent API calls charged to this account.",
      },
      {
        name: "trialAllowed",
        label: "Trial allowed",
        type: "boolean",
        hint: "Whether Stripe checkout grants this account a trial.",
      },
      {
        name: "alpacaPaper",
        label: "Alpaca paper trading",
        type: "boolean",
        hint: "Off means orders reach the live brokerage account.",
      },
      {
        name: "kycStatus",
        label: "KYC status",
        type: "string",
        hint: "not_started, pending, in_review, approved, rejected, abandoned, expired.",
      },
    ],
    destructive: true,
  },
  sessions: {
    label: "Sessions",
    description: "Active logins. Deleting a row signs that device out immediately.",
    table: sessions,
    primaryKey: sessions.id,
    columns: [
      col("id", sessions.id),
      col("userId", sessions.userId),
      col("ipAddress", sessions.ipAddress),
      col("userAgent", sessions.userAgent, true),
      col("expiresAt", sessions.expiresAt),
      col("createdAt", sessions.createdAt),
    ],
    searchable: [sessions.id, sessions.userId, sessions.ipAddress],
    orderBy: sessions.createdAt,
    editable: [],
  },
  accounts: {
    label: "Auth accounts",
    description:
      "Linked sign-in providers. Tokens and password hashes are never sent to the browser.",
    table: accounts,
    primaryKey: accounts.id,
    columns: [
      col("id", accounts.id),
      col("userId", accounts.userId),
      col("providerId", accounts.providerId),
      col("accountId", accounts.accountId),
      col("scope", accounts.scope, true),
      col("createdAt", accounts.createdAt),
    ],
    searchable: [accounts.id, accounts.userId, accounts.providerId],
    orderBy: accounts.createdAt,
    editable: [],
  },
  verifications: {
    label: "Verifications",
    description: "Pending email/reset tokens. Safe to purge once expired.",
    table: verifications,
    primaryKey: verifications.id,
    columns: [
      col("id", verifications.id),
      col("identifier", verifications.identifier),
      col("expiresAt", verifications.expiresAt),
      col("createdAt", verifications.createdAt),
    ],
    searchable: [verifications.id, verifications.identifier],
    orderBy: verifications.expiresAt,
    editable: [],
  },
  subscriptions: {
    label: "Subscriptions",
    description:
      "Stripe subscriptions, owned by the @better-auth/stripe plugin. Edit the plan here only to correct a failed webhook — it does not change anything at Stripe.",
    table: subscriptions,
    primaryKey: subscriptions.id,
    columns: [
      col("id", subscriptions.id),
      col("referenceId", subscriptions.referenceId),
      col("plan", subscriptions.plan),
      col("status", subscriptions.status),
      col("seats", subscriptions.seats),
      col("periodEnd", subscriptions.periodEnd),
      col("cancelAtPeriodEnd", subscriptions.cancelAtPeriodEnd),
      col("stripeCustomerId", subscriptions.stripeCustomerId, true),
    ],
    searchable: [subscriptions.id, subscriptions.referenceId, subscriptions.stripeCustomerId],
    orderBy: subscriptions.periodEnd,
    editable: [
      { name: "plan", label: "Plan", type: "string" },
      {
        name: "status",
        label: "Status",
        type: "string",
        hint: "incomplete, trialing, active, past_due, canceled.",
      },
      { name: "seats", label: "Seats", type: "number" },
    ],
    destructive: true,
  },
  userSettings: {
    label: "User settings",
    description:
      "Per-user provider and broker credentials. Only the row's identity is listed — no key or password is ever read out.",
    table: userSettings,
    primaryKey: userSettings.id,
    columns: [
      col("id", userSettings.id),
      col("userId", userSettings.userId),
      col("createdAt", userSettings.createdAt),
      col("updatedAt", userSettings.updatedAt),
    ],
    searchable: [userSettings.id, userSettings.userId],
    orderBy: userSettings.updatedAt,
    editable: [],
    destructive: true,
  },
  strategies: {
    label: "Strategies",
    description: "Trading strategies. Pausing one here stops it on its next scheduled run.",
    table: strategies,
    primaryKey: strategies.id,
    columns: [
      col("id", strategies.id),
      col("userId", strategies.userId),
      col("name", strategies.name),
      col("type", strategies.type),
      col("status", strategies.status),
      col("riskLevel", strategies.riskLevel),
      col("todayPnL", strategies.todayPnL),
      col("updatedAt", strategies.updatedAt),
    ],
    searchable: [strategies.id, strategies.userId, strategies.name],
    orderBy: strategies.updatedAt,
    editable: [
      { name: "name", label: "Name", type: "string" },
      { name: "status", label: "Status", type: "string", hint: "running, paused, paper." },
      { name: "riskLevel", label: "Risk level", type: "string", hint: "low, medium, high." },
    ],
  },
  watchlists: {
    label: "Watchlists",
    description: "Named watchlist collections.",
    table: watchlists,
    primaryKey: watchlists.id,
    columns: [
      col("id", watchlists.id),
      col("userId", watchlists.userId),
      col("name", watchlists.name),
      col("description", watchlists.description, true),
      col("createdAt", watchlists.createdAt),
    ],
    searchable: [watchlists.id, watchlists.userId, watchlists.name],
    orderBy: watchlists.createdAt,
    editable: [
      { name: "name", label: "Name", type: "string" },
      { name: "description", label: "Description", type: "string" },
    ],
  },
  watchlist: {
    label: "Watchlist tickers",
    description: "Individual symbols on a watchlist. A null watchlist id means Favorites.",
    table: watchlist,
    primaryKey: watchlist.id,
    columns: [
      col("id", watchlist.id),
      col("userId", watchlist.userId),
      col("watchlistId", watchlist.watchlistId),
      col("symbol", watchlist.symbol),
      col("name", watchlist.name),
      col("addedAt", watchlist.addedAt),
    ],
    searchable: [watchlist.userId, watchlist.symbol],
    orderBy: watchlist.addedAt,
    editable: [],
  },
  signals: {
    label: "Signals",
    description: "Scored buy/sell signals produced for an account.",
    table: signals,
    primaryKey: signals.id,
    columns: [
      col("id", signals.id),
      col("userId", signals.userId),
      col("asset", signals.asset),
      col("type", signals.type),
      col("combinedScore", signals.combinedScore),
      col("scoreLabel", signals.scoreLabel),
      col("createdAt", signals.createdAt),
    ],
    searchable: [signals.userId, signals.asset, signals.scoreLabel],
    orderBy: signals.createdAt,
    editable: [],
  },
  positions: {
    label: "Positions",
    description: "Open and closed positions. Prices here drive the portfolio totals.",
    table: positions,
    primaryKey: positions.id,
    columns: [
      col("id", positions.id),
      col("userId", positions.userId),
      col("asset", positions.asset),
      col("size", positions.size),
      col("entryPrice", positions.entryPrice),
      col("currentPrice", positions.currentPrice),
      col("unrealizedPnL", positions.unrealizedPnL),
      col("closedAt", positions.closedAt),
    ],
    searchable: [positions.id, positions.userId, positions.asset],
    orderBy: positions.openedAt,
    editable: [
      { name: "currentPrice", label: "Current price", type: "number" },
      { name: "size", label: "Size", type: "number" },
    ],
  },
  trades: {
    label: "Trades",
    description: "Executed trades. This is a ledger — correct a row only to fix bad ingest.",
    table: trades,
    primaryKey: trades.id,
    columns: [
      col("id", trades.id),
      col("userId", trades.userId),
      col("asset", trades.asset),
      col("action", trades.action),
      col("price", trades.price),
      col("size", trades.size),
      col("pnl", trades.pnl),
      col("timestamp", trades.timestamp),
    ],
    searchable: [trades.id, trades.userId, trades.asset],
    orderBy: trades.timestamp,
    editable: [],
    destructive: true,
  },
  portfolios: {
    label: "Portfolios",
    description:
      "One cached summary row per account. Recompute rather than hand-edit unless a number is visibly stuck.",
    table: portfolios,
    primaryKey: portfolios.id,
    columns: [
      col("id", portfolios.id),
      col("userId", portfolios.userId),
      col("totalEquity", portfolios.totalEquity),
      col("cash", portfolios.cash),
      col("dailyPnL", portfolios.dailyPnL),
      col("winRate", portfolios.winRate),
      col("openPositions", portfolios.openPositions),
      col("updatedAt", portfolios.updatedAt),
    ],
    searchable: [portfolios.id, portfolios.userId],
    orderBy: portfolios.updatedAt,
    editable: [
      { name: "cash", label: "Cash", type: "number" },
      { name: "totalEquity", label: "Total equity", type: "number" },
    ],
  },
  agentApiLogs: {
    label: "Agent API logs",
    description: "One row per agent API call. Payloads are large — only the identity is listed.",
    table: agentApiLogs,
    primaryKey: agentApiLogs.id,
    columns: [
      col("id", agentApiLogs.id),
      col("userId", agentApiLogs.userId),
      col("symbol", agentApiLogs.symbol),
      col("llmProvider", agentApiLogs.llmProvider),
      col("model", agentApiLogs.model),
      col("timestamp", agentApiLogs.timestamp),
    ],
    searchable: [agentApiLogs.userId, agentApiLogs.symbol, agentApiLogs.llmProvider],
    orderBy: agentApiLogs.timestamp,
    editable: [],
  },
  notifications: {
    label: "Notifications",
    description: "In-app notifications.",
    table: notifications,
    primaryKey: notifications.id,
    columns: [
      col("id", notifications.id),
      col("userId", notifications.userId),
      col("type", notifications.type),
      col("title", notifications.title, true),
      col("read", notifications.read),
      col("createdAt", notifications.createdAt),
    ],
    searchable: [notifications.userId, notifications.type, notifications.title],
    orderBy: notifications.createdAt,
    editable: [{ name: "read", label: "Read", type: "boolean" }],
  },
  comments: {
    label: "Comments",
    description: "Comments on reports, signals and strategies. Edit to redact, delete to remove.",
    table: comments,
    primaryKey: comments.id,
    columns: [
      col("id", comments.id),
      col("userId", comments.userId),
      col("itemType", comments.itemType),
      col("itemId", comments.itemId),
      col("content", comments.content, true),
      col("createdAt", comments.createdAt),
    ],
    searchable: [comments.userId, comments.itemId, comments.content],
    orderBy: comments.createdAt,
    editable: [{ name: "content", label: "Content", type: "string" }],
  },
  likes: {
    label: "Likes",
    description: "Likes on reports, comments and tips.",
    table: likes,
    primaryKey: likes.id,
    columns: [
      col("id", likes.id),
      col("userId", likes.userId),
      col("itemType", likes.itemType),
      col("itemId", likes.itemId),
      col("createdAt", likes.createdAt),
    ],
    searchable: [likes.userId, likes.itemId],
    orderBy: likes.createdAt,
    editable: [],
  },
  organizations: {
    label: "Organizations",
    description: "Companies and groups.",
    table: organizations,
    primaryKey: organizations.id,
    columns: [
      col("id", organizations.id),
      col("name", organizations.name),
      col("ownerId", organizations.ownerId),
      col("description", organizations.description, true),
      col("createdAt", organizations.createdAt),
    ],
    searchable: [organizations.id, organizations.name, organizations.ownerId],
    orderBy: organizations.createdAt,
    editable: [
      { name: "name", label: "Name", type: "string" },
      { name: "description", label: "Description", type: "string" },
    ],
    destructive: true,
  },
  teams: {
    label: "Teams",
    description:
      "Sub-groups within an organization. `upgradeMembers` grants every member the team's Pro seat.",
    table: teams,
    primaryKey: teams.id,
    columns: [
      col("id", teams.id),
      col("organizationId", teams.organizationId),
      col("name", teams.name),
      col("upgradeMembers", teams.upgradeMembers),
      col("maxMembers", teams.maxMembers),
      col("createdAt", teams.createdAt),
    ],
    searchable: [teams.id, teams.name, teams.organizationId],
    orderBy: teams.createdAt,
    editable: [
      { name: "name", label: "Name", type: "string" },
      { name: "upgradeMembers", label: "Pro upgrades for members", type: "boolean" },
      { name: "maxMembers", label: "Max members", type: "number" },
    ],
    destructive: true,
  },
  teamMembers: {
    label: "Team members",
    description: "Team membership and role.",
    table: teamMembers,
    primaryKey: teamMembers.id,
    columns: [
      col("id", teamMembers.id),
      col("teamId", teamMembers.teamId),
      col("userId", teamMembers.userId),
      col("role", teamMembers.role),
      col("joinedAt", teamMembers.joinedAt),
    ],
    searchable: [teamMembers.teamId, teamMembers.userId],
    orderBy: teamMembers.joinedAt,
    editable: [{ name: "role", label: "Role", type: "string", hint: "lead or member." }],
  },
  userFollows: {
    label: "Follows",
    description: "Who follows whom.",
    table: userFollows,
    primaryKey: userFollows.id,
    columns: [
      col("id", userFollows.id),
      col("followerId", userFollows.followerId),
      col("followingId", userFollows.followingId),
      col("createdAt", userFollows.createdAt),
    ],
    searchable: [userFollows.followerId, userFollows.followingId],
    orderBy: userFollows.createdAt,
    editable: [],
  },
  sharedItems: {
    label: "Shared items",
    description: "Alerts and reports shared with another address.",
    table: sharedItems,
    primaryKey: sharedItems.id,
    columns: [
      col("id", sharedItems.id),
      col("sharedById", sharedItems.sharedById),
      col("sharedWithEmail", sharedItems.sharedWithEmail),
      col("itemType", sharedItems.itemType),
      col("symbol", sharedItems.symbol),
      col("viewedAt", sharedItems.viewedAt),
      col("createdAt", sharedItems.createdAt),
    ],
    searchable: [sharedItems.sharedById, sharedItems.sharedWithEmail, sharedItems.symbol],
    orderBy: sharedItems.createdAt,
    editable: [],
  },
  walletAddresses: {
    label: "Wallet addresses",
    description: "Web3 addresses linked for SIWE sign-in. Deleting one revokes that sign-in route.",
    table: walletAddresses,
    primaryKey: walletAddresses.id,
    columns: [
      col("id", walletAddresses.id),
      col("userId", walletAddresses.userId),
      col("address", walletAddresses.address, true),
      col("chainId", walletAddresses.chainId),
      col("isPrimary", walletAddresses.isPrimary),
      col("createdAt", walletAddresses.createdAt),
    ],
    searchable: [walletAddresses.userId, walletAddresses.address],
    orderBy: walletAddresses.createdAt,
    editable: [{ name: "isPrimary", label: "Primary", type: "boolean" }],
  },
} satisfies Record<string, AdminTable>;

export type AdminTableKey = keyof typeof ADMIN_TABLES;

export const ADMIN_TABLE_KEYS = Object.keys(ADMIN_TABLES) as AdminTableKey[];

export function isAdminTableKey(value: string): value is AdminTableKey {
  return Object.prototype.hasOwnProperty.call(ADMIN_TABLES, value);
}

/** The shape the browser needs to render a table's controls, minus the drizzle objects. */
export function describeTable(key: AdminTableKey) {
  const config: AdminTable = ADMIN_TABLES[key];
  return {
    key,
    label: config.label,
    description: config.description,
    primaryKey: config.primaryKey.name,
    columns: config.columns.map((entry) => entry.name),
    truncated: config.columns.filter((entry) => entry.truncate).map((entry) => entry.name),
    editable: config.editable,
    destructive: Boolean(config.destructive),
  };
}

/** Row counts for every registered table, for the overview grid. */
export async function loadTableCounts(db: AdminDB) {
  return Promise.all(
    ADMIN_TABLE_KEYS.map(async (key) => {
      const [row] = await db.select({ value: count() }).from(ADMIN_TABLES[key].table);
      return { ...describeTable(key), rows: row?.value ?? 0 };
    }),
  );
}

function buildSearch(config: AdminTable, search: string | undefined): SQL | undefined {
  if (!search || config.searchable.length === 0) return undefined;
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  return or(...config.searchable.map((column) => like(column, pattern)));
}

export interface TableRowsQuery {
  page: number;
  limit: number;
  search?: string;
}

/** One page of rows from a registered table, restricted to its listed columns. */
export async function loadTableRows(db: AdminDB, key: AdminTableKey, options: TableRowsQuery) {
  const config: AdminTable = ADMIN_TABLES[key];
  const where = buildSearch(config, options.search);
  const projection = Object.fromEntries(
    config.columns.map((entry) => [entry.name, entry.column]),
  ) as Record<string, AnySQLiteColumn>;

  const [rows, [matched]] = await Promise.all([
    db
      .select(projection)
      .from(config.table)
      .where(where)
      .orderBy(desc(config.orderBy), desc(config.primaryKey))
      .limit(options.limit)
      .offset((options.page - 1) * options.limit),
    db.select({ value: count() }).from(config.table).where(where),
  ]);

  return { rows, matchedRows: matched?.value ?? 0 };
}

/**
 * Coerces one submitted value to the column's type. Returns `undefined` when
 * the value cannot be represented, so the caller can reject the whole write
 * rather than silently storing a `NaN` or the string `"false"`.
 */
function coerce(field: EditableField, value: unknown): unknown | undefined {
  if (value === null) return null;
  switch (field.type) {
    case "number": {
      const parsed = typeof value === "number" ? value : Number(String(value).trim());
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      if (value === "true" || value === 1 || value === "1") return true;
      if (value === "false" || value === 0 || value === "0") return false;
      return undefined;
    }
    default:
      return typeof value === "string" ? value : String(value);
  }
}

export class InvalidUpdateError extends Error {}

/**
 * Applies a patch to one row, keeping only the columns the registry marks
 * editable. Anything else in the body — including a primary key — is dropped
 * rather than written, so a crafted request cannot repoint a row at another
 * user or reach a column the registry never exposed.
 */
export async function updateTableRow(
  db: AdminDB,
  key: AdminTableKey,
  id: string,
  body: Record<string, unknown>,
) {
  const config: AdminTable = ADMIN_TABLES[key];
  if (config.editable.length === 0) {
    throw new InvalidUpdateError(`${config.label} rows are read-only`);
  }

  const updates: Record<string, unknown> = {};
  for (const field of config.editable) {
    if (!(field.name in body)) continue;
    const value = coerce(field, body[field.name]);
    if (value === undefined) {
      throw new InvalidUpdateError(`Invalid value for ${field.label}`);
    }
    updates[field.name] = value;
  }

  if (Object.keys(updates).length === 0) {
    throw new InvalidUpdateError("No editable fields in request");
  }

  const rows = await db
    .update(config.table)
    .set(updates)
    .where(eq(config.primaryKey, castId(config, id)))
    .returning();

  return rows[0] ?? null;
}

export async function deleteTableRow(db: AdminDB, key: AdminTableKey, id: string) {
  const config: AdminTable = ADMIN_TABLES[key];
  const rows = await db
    .delete(config.table)
    .where(eq(config.primaryKey, castId(config, id)))
    .returning();
  return rows[0] ?? null;
}

/**
 * Route params arrive as strings; integer primary keys have to be numbers or
 * the comparison silently matches nothing on SQLite.
 */
function castId(config: AdminTable, id: string): string | number {
  return config.primaryKey.columnType === "SQLiteInteger" ? Number(id) : id;
}

export interface MaintenanceAction {
  label: string;
  description: string;
  run: (db: AdminDB) => Promise<{ affected: number; detail?: string }>;
}

const affectedRows = (result: unknown): number => {
  const meta = result as { rowsAffected?: number; meta?: { changes?: number } } | undefined;
  return meta?.rowsAffected ?? meta?.meta?.changes ?? 0;
};

/** 30 days, in milliseconds — the window read notifications are kept for. */
const READ_NOTIFICATION_RETENTION_MS = 30 * 86_400_000;

/**
 * One-click cleanups and recomputes. Each is idempotent and scoped to rows
 * that are already dead — expired, read and old — or derives a cached number
 * from the rows it summarises, so running one twice is a no-op rather than a
 * second round of changes.
 */
export const MAINTENANCE_ACTIONS = {
  purgeExpiredSessions: {
    label: "Purge expired sessions",
    description: "Deletes session rows whose expiry has already passed.",
    async run(db) {
      const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
      return { affected: affectedRows(result) };
    },
  },
  purgeExpiredVerifications: {
    label: "Purge expired verifications",
    description: "Deletes email-verification and password-reset tokens that can no longer be used.",
    async run(db) {
      const result = await db.delete(verifications).where(lt(verifications.expiresAt, new Date()));
      return { affected: affectedRows(result) };
    },
  },
  purgeOldReadNotifications: {
    label: "Purge old read notifications",
    description: "Deletes notifications that have been read and are more than 30 days old.",
    async run(db) {
      const cutoff = new Date(Date.now() - READ_NOTIFICATION_RETENTION_MS);
      const result = await db
        .delete(notifications)
        .where(and(eq(notifications.read, true), lt(notifications.createdAt, cutoff)));
      return { affected: affectedRows(result) };
    },
  },
  recomputeUsageCounts: {
    label: "Recompute usage counts",
    description:
      "Rewrites every account's usage_count from its agent API log rows, fixing drift from failed increments.",
    async run(db) {
      const result = await db.update(users).set({
        usageCount: sql`(select count(*) from ${agentApiLogs} where ${agentApiLogs.userId} = ${users.id})`,
        updatedAt: new Date(),
      });
      return { affected: affectedRows(result), detail: "All accounts recalculated" };
    },
  },
  recomputeOpenPositions: {
    label: "Recompute open positions",
    description:
      "Rewrites each portfolio's cached open-position count from the positions that have no close date.",
    async run(db) {
      const result = await db.update(portfolios).set({
        openPositions: sql`(select count(*) from ${positions} where ${positions.userId} = ${portfolios.userId} and ${positions.closedAt} is null)`,
        updatedAt: new Date(),
      });
      return { affected: affectedRows(result), detail: "All portfolios recalculated" };
    },
  },
} satisfies Record<string, MaintenanceAction>;

export type MaintenanceActionKey = keyof typeof MAINTENANCE_ACTIONS;

export const MAINTENANCE_ACTION_KEYS = Object.keys(MAINTENANCE_ACTIONS) as MaintenanceActionKey[];

export function isMaintenanceActionKey(value: string): value is MaintenanceActionKey {
  return Object.prototype.hasOwnProperty.call(MAINTENANCE_ACTIONS, value);
}

export function describeMaintenanceActions() {
  return MAINTENANCE_ACTION_KEYS.map((key) => ({
    key,
    label: MAINTENANCE_ACTIONS[key].label,
    description: MAINTENANCE_ACTIONS[key].description,
  }));
}
