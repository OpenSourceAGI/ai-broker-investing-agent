/**
 * @fileoverview Integration test for the admin usage counters, run against a
 * real in-memory SQLite database rather than a query-builder double.
 *
 * The counters are correlated subqueries over nine tables that all have an
 * `id` column of their own, so an unqualified column reference binds to the
 * wrong table and silently counts zero for every account. Only executing the
 * SQL catches that, which is what this file does.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as schema from '@/lib/db/schema'
import type { AdminDB } from '../db'
import { USAGE_KEYS, loadSiteUsageTotals, loadUserUsagePage } from '../user-usage'

/**
 * Builds `create table` from the drizzle definition itself, so the fixture
 * database can never drift from the schema the queries are written against —
 * a renamed column fails here instead of quietly counting nothing.
 */
function createTableSql(table: SQLiteTable): string {
  const config = getTableConfig(table)
  const columns = config.columns.map((column) => {
    const parts = [`"${column.name}"`, column.getSQLType()]
    if (column.primary) parts.push('primary key')
    else if (column.notNull) parts.push('not null')
    return parts.join(' ')
  })
  return `create table "${config.name}" (${columns.join(', ')})`
}

/** Every table the usage counters read. */
const FIXTURE_TABLES: SQLiteTable[] = [
  schema.users,
  schema.sessions,
  schema.strategies,
  schema.watchlists,
  schema.watchlist,
  schema.signals,
  schema.positions,
  schema.trades,
  schema.agentApiLogs,
  schema.comments,
  schema.likes,
]

let db: AdminDB

const JAN_2024 = new Date('2024-01-01T00:00:00.000Z')
const LATER = new Date('2024-01-01T02:00:00.000Z')
const account = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `${id} person`,
  email: `${id}@example.com`,
  emailVerified: true,
  createdAt: JAN_2024,
  updatedAt: JAN_2024,
  ...overrides,
})

async function seed() {
  const client = createClient({ url: ':memory:' })
  for (const table of FIXTURE_TABLES) await client.execute(createTableSql(table))
  db = drizzle(client, { schema }) as unknown as AdminDB

  await db.insert(schema.users).values([
    account('busy'),
    account('quiet', { createdAt: new Date('2024-01-02T00:00:00.000Z') }),
    account('new', {
      emailVerified: false,
      createdAt: new Date('2024-01-03T00:00:00.000Z'),
    }),
  ])

  await db.insert(schema.sessions).values([
    {
      id: 's1',
      token: 'a',
      userId: 'busy',
      expiresAt: LATER,
      createdAt: JAN_2024,
      updatedAt: JAN_2024,
    },
    {
      id: 's2',
      token: 'b',
      userId: 'busy',
      expiresAt: LATER,
      createdAt: JAN_2024,
      updatedAt: LATER,
    },
  ])

  await db.insert(schema.strategies).values([
    {
      id: 'st1',
      userId: 'busy',
      name: 'Momentum',
      type: 'momentum',
      createdAt: JAN_2024,
      updatedAt: JAN_2024,
    },
    {
      id: 'st2',
      userId: 'busy',
      name: 'Scalp',
      type: 'day-scalp',
      createdAt: JAN_2024,
      updatedAt: JAN_2024,
    },
  ])
  await db.insert(schema.watchlists).values([
    { id: 'w1', userId: 'quiet', name: 'Tech', createdAt: JAN_2024, updatedAt: JAN_2024 },
  ])
  await db.insert(schema.watchlist).values([
    { id: 'i1', userId: 'quiet', watchlistId: 'w1', symbol: 'NVDA', addedAt: JAN_2024 },
    { id: 'i2', userId: 'quiet', watchlistId: 'w1', symbol: 'AMD', addedAt: JAN_2024 },
    { id: 'i3', userId: 'quiet', watchlistId: null, symbol: 'SPY', addedAt: JAN_2024 },
  ])
  await db.insert(schema.trades).values([
    {
      id: 't1',
      userId: 'busy',
      asset: 'NVDA',
      type: 'stock',
      action: 'buy',
      price: 100,
      size: 1,
      timestamp: JAN_2024,
      createdAt: JAN_2024,
    },
  ])
  await db.insert(schema.agentApiLogs).values([
    { id: 'l1', userId: 'busy', symbol: 'NVDA', timestamp: JAN_2024, createdAt: JAN_2024 },
    { id: 'l2', userId: 'busy', symbol: 'AMD', timestamp: JAN_2024, createdAt: JAN_2024 },
    // A signed-out call: the user id is null and must not land on any account.
    { id: 'l3', userId: null, symbol: 'SPY', timestamp: JAN_2024, createdAt: JAN_2024 },
  ])
  await db.insert(schema.likes).values([
    { id: 'k1', userId: 'quiet', itemType: 'signal', itemId: 'x', createdAt: JAN_2024 },
  ])
}

beforeEach(seed)

describe('loadUserUsagePage', () => {
  it('counts each feature against the right account', async () => {
    const { users, matchedUsers } = await loadUserUsagePage(db, { page: 1, limit: 25 })
    const byId = Object.fromEntries(users.map((u) => [u.id, u]))

    expect(matchedUsers).toBe(3)
    expect(byId.busy).toMatchObject({ strategies: 2, trades: 1, apiCalls: 2, tickers: 0 })
    expect(byId.quiet).toMatchObject({ watchlists: 1, tickers: 3, likes: 1, strategies: 0 })
    expect(byId.new).toMatchObject({ strategies: 0, trades: 0, apiCalls: 0, likes: 0 })
  })

  it('does not attribute a null-user API log to any account', async () => {
    const totals = await loadSiteUsageTotals(db)
    const { users } = await loadUserUsagePage(db, { page: 1, limit: 25 })

    expect(totals.apiCalls).toBe(3)
    expect(users.reduce((sum, u) => sum + u.apiCalls, 0)).toBe(2)
  })

  it('totals every usage counter but not the session count', async () => {
    const { users } = await loadUserUsagePage(db, { page: 1, limit: 25 })
    const busy = users.find((u) => u.id === 'busy')!

    expect(busy.sessions).toBe(2)
    // 2 strategies + 1 trade + 2 API calls, and no session rows.
    expect(busy.total).toBe(5)
  })

  it('reports the newest session touch, and null for an account that never signed in', async () => {
    const { users } = await loadUserUsagePage(db, { page: 1, limit: 25 })
    const byId = Object.fromEntries(users.map((u) => [u.id, u]))

    expect(byId.busy.lastActiveAt).toBe(LATER.toISOString())
    expect(byId.quiet.lastActiveAt).toBeNull()
  })

  it('sorts by a usage counter across the whole directory', async () => {
    const byTickers = await loadUserUsagePage(db, { page: 1, limit: 25, sort: 'tickers' })
    expect(byTickers.users[0].id).toBe('quiet')

    const ascending = await loadUserUsagePage(db, {
      page: 1,
      limit: 25,
      sort: 'total',
      dir: 'asc',
    })
    expect(ascending.users[0].total).toBe(0)
  })

  it('falls back to the default sort for an unknown column', async () => {
    const { users } = await loadUserUsagePage(db, { page: 1, limit: 25, sort: 'nonsense' })

    // Newest account first, which is what sorting by `joined` descending gives.
    expect(users[0].id).toBe('new')
  })

  it('searches name, email and id', async () => {
    const byName = await loadUserUsagePage(db, { page: 1, limit: 25, search: 'busy person' })
    expect(byName.users.map((u) => u.id)).toEqual(['busy'])

    const byEmail = await loadUserUsagePage(db, { page: 1, limit: 25, search: 'quiet@' })
    expect(byEmail.users.map((u) => u.id)).toEqual(['quiet'])
  })

  it('treats a LIKE wildcard in the search as a literal character', async () => {
    const { matchedUsers } = await loadUserUsagePage(db, { page: 1, limit: 25, search: '%' })

    expect(matchedUsers).toBe(0)
  })

  it('drops unverified accounts when asked', async () => {
    const { users } = await loadUserUsagePage(db, { page: 1, limit: 25, hideUnverified: true })

    expect(users.map((u) => u.id).sort()).toEqual(['busy', 'quiet'])
  })

  it('pages without repeating or skipping an account', async () => {
    const first = await loadUserUsagePage(db, { page: 1, limit: 2 })
    const second = await loadUserUsagePage(db, { page: 2, limit: 2 })

    expect(first.users).toHaveLength(2)
    expect(second.users).toHaveLength(1)
    expect(new Set([...first.users, ...second.users].map((u) => u.id)).size).toBe(3)
  })

  it('never lists a broker credential in the directory projection', async () => {
    const { users } = await loadUserUsagePage(db, { page: 1, limit: 25 })
    const fields = Object.keys(users[0])

    for (const secret of ['apiKey', 'alpacaKeyId', 'alpacaSecretKey', 'kycSessionId']) {
      expect(fields).not.toContain(secret)
    }
    expect(fields).not.toContain('lastActiveSeconds')
    expect(fields).toContain('lastActiveAt')
  })
})

describe('loadSiteUsageTotals', () => {
  it('counts every table site-wide and sums the activity', async () => {
    const totals = await loadSiteUsageTotals(db)

    expect(totals).toMatchObject({
      users: 3,
      sessions: 2,
      strategies: 2,
      watchlists: 1,
      tickers: 3,
      signals: 0,
      positions: 0,
      trades: 1,
      apiCalls: 3,
      comments: 0,
      likes: 1,
    })
    expect(totals.activity).toBe(USAGE_KEYS.reduce((sum, key) => sum + totals[key], 0))
    expect(totals.activity).toBe(11)
  })
})
