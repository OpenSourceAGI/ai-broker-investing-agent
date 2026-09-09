/**
 * @fileoverview Integration test for the database controls, run against a real
 * in-memory SQLite database. The write path (column allowlist, value coercion,
 * primary-key matching) and the maintenance SQL only prove out when executed.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { count, eq } from 'drizzle-orm'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as schema from '@/lib/db/schema'
import type { AdminDB } from '../db'
import {
  ADMIN_TABLES,
  ADMIN_TABLE_KEYS,
  InvalidUpdateError,
  MAINTENANCE_ACTIONS,
  deleteTableRow,
  describeTable,
  isAdminTableKey,
  loadTableCounts,
  loadTableRows,
  updateTableRow,
} from '../db-tables'

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

let db: AdminDB

const NOW = new Date('2024-06-01T00:00:00.000Z')
const PAST = new Date('2023-01-01T00:00:00.000Z')
const FUTURE = new Date('2030-01-01T00:00:00.000Z')
/** Read, but inside the 30-day window the purge keeps. */
const RECENT = new Date(Date.now() - 86_400_000)
/** Read and past the 30-day window. */
const STALE = new Date(Date.now() - 90 * 86_400_000)

async function seed() {
  const client = createClient({ url: ':memory:' })
  // Every registered table has to exist — `loadTableCounts` reads all of them.
  for (const key of ADMIN_TABLE_KEYS) {
    await client.execute(createTableSql(ADMIN_TABLES[key].table))
  }
  db = drizzle(client, { schema }) as unknown as AdminDB

  await db.insert(schema.users).values([
    {
      id: 'u1',
      name: 'First',
      email: 'first@example.com',
      emailVerified: true,
      apiKey: 'secret-key',
      alpacaSecretKey: 'secret-broker-key',
      usageCount: 0,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'u2',
      name: 'Second',
      email: 'second@example.com',
      emailVerified: false,
      usageCount: 99,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ])

  await db.insert(schema.sessions).values([
    { id: 'live', token: 'a', userId: 'u1', expiresAt: FUTURE, createdAt: NOW, updatedAt: NOW },
    { id: 'dead', token: 'b', userId: 'u1', expiresAt: PAST, createdAt: PAST, updatedAt: PAST },
  ])
  await db.insert(schema.verifications).values([
    { id: 'v-live', identifier: 'a@example.com', value: 'x', expiresAt: FUTURE },
    { id: 'v-dead', identifier: 'b@example.com', value: 'y', expiresAt: PAST },
  ])
  await db.insert(schema.strategies).values([
    {
      id: 'st1',
      userId: 'u1',
      name: 'Momentum',
      type: 'momentum',
      status: 'running',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ])
  await db.insert(schema.agentApiLogs).values([
    { id: 'l1', userId: 'u1', symbol: 'NVDA', timestamp: NOW, createdAt: NOW },
    { id: 'l2', userId: 'u1', symbol: 'AMD', timestamp: NOW, createdAt: NOW },
  ])
  await db.insert(schema.portfolios).values([
    { id: 'p1', userId: 'u1', openPositions: 0, updatedAt: NOW },
    { id: 'p2', userId: 'u2', openPositions: 7, updatedAt: NOW },
  ])
  await db.insert(schema.positions).values([
    {
      id: 'pos1',
      userId: 'u1',
      asset: 'NVDA',
      type: 'stock',
      entryPrice: 100,
      currentPrice: 110,
      size: 1,
      openedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'pos2',
      userId: 'u1',
      asset: 'AMD',
      type: 'stock',
      entryPrice: 100,
      currentPrice: 90,
      size: 1,
      openedAt: NOW,
      closedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ])
  await db.insert(schema.notifications).values([
    { id: 'n-unread', userId: 'u1', type: 'share', title: 'a', message: 'a', read: false, createdAt: STALE },
    { id: 'n-recent', userId: 'u1', type: 'share', title: 'b', message: 'b', read: true, createdAt: RECENT },
    { id: 'n-stale', userId: 'u1', type: 'share', title: 'c', message: 'c', read: true, createdAt: STALE },
  ])
}

beforeEach(seed)

const rowCount = async (table: SQLiteTable) => {
  const [row] = await db.select({ value: count() }).from(table)
  return row?.value ?? 0
}

describe('the table registry', () => {
  it('only recognises its own keys', () => {
    expect(isAdminTableKey('users')).toBe(true)
    expect(isAdminTableKey('sqlite_master')).toBe(false)
    expect(isAdminTableKey('__proto__')).toBe(false)
  })

  it('describes a table without leaking drizzle objects', () => {
    const described = describeTable('users')

    expect(described).toMatchObject({ key: 'users', primaryKey: 'id', destructive: true })
    expect(described.editable.map((f) => f.name)).toContain('usageCount')
    expect(JSON.stringify(described)).toBeTypeOf('string')
  })

  it('marks every editable field as a column the table actually lists', () => {
    for (const key of ADMIN_TABLE_KEYS) {
      const { columns, editable } = describeTable(key)
      for (const field of editable) expect(columns).toContain(field.name)
    }
  })

  it('counts every registered table', async () => {
    const counts = await loadTableCounts(db)

    expect(counts).toHaveLength(ADMIN_TABLE_KEYS.length)
    expect(counts.find((t) => t.key === 'users')?.rows).toBe(2)
    expect(counts.find((t) => t.key === 'positions')?.rows).toBe(2)
  })
})

describe('loadTableRows', () => {
  it('returns only the columns the registry lists, so credentials stay unread', async () => {
    const { rows } = await loadTableRows(db, 'users', { page: 1, limit: 25 })

    expect(Object.keys(rows[0])).toEqual(describeTable('users').columns)
    expect(Object.keys(rows[0])).not.toContain('apiKey')
    expect(Object.keys(rows[0])).not.toContain('alpacaSecretKey')
    expect(JSON.stringify(rows)).not.toContain('secret-broker-key')
  })

  it('searches the registered columns', async () => {
    const { rows, matchedRows } = await loadTableRows(db, 'users', {
      page: 1,
      limit: 25,
      search: 'second@',
    })

    expect(matchedRows).toBe(1)
    expect(rows[0]).toMatchObject({ id: 'u2' })
  })

  it('pages', async () => {
    const first = await loadTableRows(db, 'users', { page: 1, limit: 1 })
    const second = await loadTableRows(db, 'users', { page: 2, limit: 1 })

    expect(first.matchedRows).toBe(2)
    expect(first.rows[0].id).not.toBe(second.rows[0].id)
  })
})

describe('updateTableRow', () => {
  it('writes an allowlisted column', async () => {
    const row = await updateTableRow(db, 'users', 'u1', { name: 'Renamed' })

    expect(row).toMatchObject({ id: 'u1', name: 'Renamed' })
  })

  it('ignores a column the registry does not mark editable', async () => {
    await updateTableRow(db, 'users', 'u1', { name: 'Renamed', apiKey: 'stolen' })

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, 'u1'))
    expect(row.apiKey).toBe('secret-key')
  })

  it('coerces a numeric column submitted as a string', async () => {
    await updateTableRow(db, 'users', 'u1', { usageCount: '42' })

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, 'u1'))
    expect(row.usageCount).toBe(42)
  })

  it('coerces a boolean column submitted as a string', async () => {
    await updateTableRow(db, 'users', 'u1', { alpacaPaper: 'false' })

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, 'u1'))
    expect(row.alpacaPaper).toBe(false)
  })

  it('rejects a value that cannot be represented', async () => {
    await expect(updateTableRow(db, 'users', 'u1', { usageCount: 'lots' })).rejects.toBeInstanceOf(
      InvalidUpdateError,
    )
  })

  it('rejects a write against a read-only table', async () => {
    await expect(updateTableRow(db, 'sessions', 'live', { userId: 'u2' })).rejects.toBeInstanceOf(
      InvalidUpdateError,
    )
  })

  it('rejects a body with no editable fields', async () => {
    await expect(updateTableRow(db, 'users', 'u1', { apiKey: 'stolen' })).rejects.toBeInstanceOf(
      InvalidUpdateError,
    )
  })

  it('returns null when the id matched no row', async () => {
    expect(await updateTableRow(db, 'users', 'nobody', { name: 'x' })).toBeNull()
  })
})

describe('deleteTableRow', () => {
  it('deletes by primary key', async () => {
    expect(await deleteTableRow(db, 'users', 'u2')).toMatchObject({ id: 'u2' })
    expect(await rowCount(schema.users)).toBe(1)
  })

  it('returns null when the id matched no row', async () => {
    expect(await deleteTableRow(db, 'users', 'nobody')).toBeNull()
  })
})

describe('maintenance actions', () => {
  it('purges only expired sessions', async () => {
    const { affected } = await MAINTENANCE_ACTIONS.purgeExpiredSessions.run(db)

    expect(affected).toBe(1)
    const [row] = await db.select().from(schema.sessions)
    expect(row.id).toBe('live')
  })

  it('purges only expired verifications', async () => {
    await MAINTENANCE_ACTIONS.purgeExpiredVerifications.run(db)

    const rows = await db.select().from(schema.verifications)
    expect(rows.map((r) => r.id)).toEqual(['v-live'])
  })

  it('purges read notifications older than the retention window only', async () => {
    await MAINTENANCE_ACTIONS.purgeOldReadNotifications.run(db)

    const rows = await db.select().from(schema.notifications)
    expect(rows.map((r) => r.id).sort()).toEqual(['n-recent', 'n-unread'])
  })

  it('recomputes usage counts from the agent API log', async () => {
    await MAINTENANCE_ACTIONS.recomputeUsageCounts.run(db)

    const rows = await db.select().from(schema.users)
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId.u1.usageCount).toBe(2)
    // An account with no logged calls is zeroed rather than left at its old value.
    expect(byId.u2.usageCount).toBe(0)
  })

  it('recomputes each portfolio from the positions that are still open', async () => {
    await MAINTENANCE_ACTIONS.recomputeOpenPositions.run(db)

    const rows = await db.select().from(schema.portfolios)
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    // One of u1's two positions carries a close date.
    expect(byId.p1.openPositions).toBe(1)
    expect(byId.p2.openPositions).toBe(0)
  })

  it('is a no-op on a second run', async () => {
    await MAINTENANCE_ACTIONS.purgeExpiredSessions.run(db)
    const second = await MAINTENANCE_ACTIONS.purgeExpiredSessions.run(db)

    expect(second.affected).toBe(0)
  })
})
