/**
 * @fileoverview The public market queries in packages/investing must leave out
 * markets an admin unpublished. Runs the package's own query functions against
 * a real in-memory SQLite database (swapped in for its D1 handle) and writes
 * the publish decisions through the admin module, so both sides agree on the
 * `listing_controls` contract.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { listingControls, polymarketMarkets } from '@/packages/investing/src/db/schema'
import type { AdminDB } from '../db'

const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@/packages/investing/src/db', () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        const real = holder.db as Record<PropertyKey, unknown>
        const value = real[prop]
        return typeof value === 'function' ? (value as CallableFunction).bind(real) : value
      },
    },
  ),
}))

import {
  getMarkets,
  getMarketsByCategory,
  searchMarketsInDB,
} from '@/packages/investing/src/prediction/db/markets'
import { setMarketsPublished } from '../listings'

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

const NOW = new Date('2026-01-01T00:00:00.000Z')
const market = (id: string, volume24hr: number, extra: Record<string, unknown> = {}) => ({
  id,
  question: `Question ${id}`,
  slug: id,
  outcomes: '["Yes","No"]',
  outcomePrices: '["0.4","0.6"]',
  tags: '["Elections"]',
  active: true,
  closed: false,
  volume24hr,
  volumeTotal: volume24hr,
  category: 'Politics',
  createdAt: NOW,
  updatedAt: NOW,
  ...extra,
})

let adminDb: AdminDB

beforeEach(async () => {
  const client = createClient({ url: ':memory:' })
  await client.execute(createTableSql(polymarketMarkets as SQLiteTable))
  await client.execute(createTableSql(listingControls as SQLiteTable))
  const db = drizzle(client)
  holder.db = db
  adminDb = db as unknown as AdminDB
  await db.insert(polymarketMarkets).values([
    market('a', 30),
    market('b', 20),
    market('c', 10, { category: 'Sports' }),
    market('d', 5, { active: false }),
  ])
})

describe('public market queries respect admin publishing', () => {
  it('getMarkets lists every active market when nothing is unpublished', async () => {
    expect((await getMarkets()).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('getMarkets leaves out unpublished markets', async () => {
    await setMarketsPublished(adminDb, ['b'], false, null)
    expect((await getMarkets()).map((m) => m.id)).toEqual(['a', 'c'])
    expect((await getMarkets({ category: 'Politics' })).map((m) => m.id)).toEqual(['a'])
  })

  it('getMarkets shows a market again once it is re-published', async () => {
    await setMarketsPublished(adminDb, ['b'], false, null)
    await setMarketsPublished(adminDb, ['b'], true, null)
    expect((await getMarkets()).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('getMarkets can include unpublished markets on request', async () => {
    await setMarketsPublished(adminDb, ['b'], false, null)
    expect((await getMarkets({ includeUnpublished: true })).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('getMarkets still pages after filtering', async () => {
    await setMarketsPublished(adminDb, ['a'], false, null)
    expect((await getMarkets({ limit: 1, offset: 1 })).map((m) => m.id)).toEqual(['c'])
  })

  it('searchMarketsInDB leaves out unpublished markets', async () => {
    await setMarketsPublished(adminDb, ['a'], false, null)
    expect((await searchMarketsInDB('question')).map((m) => m.id)).toEqual(['b', 'c'])
    expect((await searchMarketsInDB('question', { includeUnpublished: true })).map((m) => m.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('getMarketsByCategory leaves out unpublished markets', async () => {
    await setMarketsPublished(adminDb, ['a', 'c'], false, null)
    const grouped = await getMarketsByCategory()
    expect(grouped.Elections.map((m: { id: string }) => m.id)).toEqual(['b'])
  })

  it('leaves out closed and expired markets that sync never re-fetched', async () => {
    const db = holder.db as AdminDB
    await db.insert(polymarketMarkets).values([
      market('closed', 40, { closed: true }),
      market('expired', 35, { endDate: '2020-01-01T00:00:00Z' }),
      market('future', 1, { endDate: '2999-01-01T00:00:00Z' }),
    ])
    expect((await getMarkets()).map((m) => m.id)).toEqual(['a', 'b', 'c', 'future'])
    expect((await searchMarketsInDB('question')).map((m) => m.id)).toEqual(['a', 'b', 'c', 'future'])
    const grouped = await getMarketsByCategory()
    expect(grouped.Elections.map((m: { id: string }) => m.id)).toEqual(['a', 'b', 'c', 'future'])
    expect((await getMarkets({ activeOnly: false })).map((m) => m.id)).toEqual([
      'closed',
      'expired',
      'a',
      'b',
      'c',
      'd',
      'future',
    ])
  })

  it('ignores a stock decision that happens to share the market id', async () => {
    await adminDb.insert(listingControls).values({
      id: 'stock:A',
      kind: 'stock',
      itemId: 'a',
      published: false,
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect((await getMarkets()).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })
})
