/**
 * @fileoverview Tests for the quote cache.
 *
 * Two defects live here. `getCachedQuote` took a TTL from every caller and
 * ignored it, so a cached price was served forever; and cached historical rows
 * came back in whatever order the database produced, while callers read the
 * first and last elements as the period bounds and charted the series in order.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fakeDb = vi.hoisted(() => ({
  selectRows: [] as unknown[],
  insertCalls: [] as unknown[],
  conflictCalls: [] as unknown[],
}))

vi.mock('@/packages/investing/src/db', () => {
  const chain = (rows: () => unknown[]) => {
    const node: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'limit', 'orderBy', 'values', 'set']) {
      node[m] = (...args: unknown[]) => {
        if (m === 'values') fakeDb.insertCalls.push(args[0])
        return node
      }
    }
    node.onConflictDoUpdate = (arg: unknown) => {
      fakeDb.conflictCalls.push(arg)
      return node
    }
    node.onConflictDoNothing = () => node
    node.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(rows()).then(res, rej)
    return node
  }
  return {
    db: {
      select: () => chain(() => fakeDb.selectRows),
      insert: () => chain(() => []),
      update: () => chain(() => []),
      delete: () => chain(() => []),
    },
  }
})

import { QuoteCacheService, QUOTE_CACHE_TTL } from '@/packages/investing/src/stocks/quote-cache-service'

const service = new QuoteCacheService()

/** A cache row as stored, `updatedAt` written `ageMs` ago. */
const row = (ageMs: number | null) => ({
  symbol: 'AAPL',
  price: 190.5,
  change: 1.5,
  changePercent: 0.8,
  open: 189,
  high: 191,
  low: 188.5,
  previousClose: 189,
  volume: 1_000_000,
  updatedAt: ageMs === null ? null : new Date(Date.now() - ageMs),
})

beforeEach(() => {
  vi.clearAllMocks()
  fakeDb.selectRows = []
  fakeDb.insertCalls = []
  fakeDb.conflictCalls = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getCachedQuote — freshness', () => {
  it('returns a quote written moments ago', async () => {
    fakeDb.selectRows = [row(1_000)]

    await expect(service.getCachedQuote('AAPL')).resolves.toMatchObject({
      symbol: 'AAPL',
      price: 190.5,
    })
  })

  it('treats a row older than the default TTL as a miss', async () => {
    fakeDb.selectRows = [row(QUOTE_CACHE_TTL + 1_000)]

    await expect(service.getCachedQuote('AAPL')).resolves.toBeNull()
  })

  it('honors an explicit TTL from the caller', async () => {
    fakeDb.selectRows = [row(30_000)]

    // Fresh under a five-minute window, stale under a ten-second one.
    await expect(service.getCachedQuote('AAPL', 300_000)).resolves.not.toBeNull()
    await expect(service.getCachedQuote('AAPL', 10_000)).resolves.toBeNull()
  })

  it('treats a row with no timestamp as stale', async () => {
    // Rows written before the column existed read back as null; serving them
    // would be serving a price of unknown age.
    fakeDb.selectRows = [row(null)]

    await expect(service.getCachedQuote('AAPL')).resolves.toBeNull()
  })

  it('accepts a row of any age when the TTL is Infinity', async () => {
    fakeDb.selectRows = [row(365 * 24 * 60 * 60 * 1000)]

    await expect(service.getCachedQuote('AAPL', Infinity)).resolves.not.toBeNull()
  })

  it('returns null when nothing is cached', async () => {
    fakeDb.selectRows = []

    await expect(service.getCachedQuote('AAPL')).resolves.toBeNull()
  })
})

describe('saveQuoteToCache', () => {
  const quote = {
    symbol: 'aapl',
    price: 190.567,
    change: 1.234,
    changePercent: 0.789,
    open: 189.111,
    high: 191.999,
    low: 188.5,
    previousClose: 189,
    volume: 1_000_000,
    marketCap: 3e12,
    currency: 'USD',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    timestamp: new Date(),
    source: 'yfinance' as const,
  }

  it('upper-cases the symbol so reads and writes share a key', async () => {
    await service.saveQuoteToCache(quote)

    expect(fakeDb.insertCalls[0]).toMatchObject({ symbol: 'AAPL' })
  })

  it('rounds prices to two decimals', async () => {
    await service.saveQuoteToCache(quote)

    expect(fakeDb.insertCalls[0]).toMatchObject({
      price: 190.57,
      change: 1.23,
      open: 189.11,
      high: 192,
    })
  })

  it('stamps updatedAt so the row can later be aged out', async () => {
    await service.saveQuoteToCache(quote)

    expect((fakeDb.insertCalls[0] as any).updatedAt).toBeInstanceOf(Date)
  })

  it('refreshes updatedAt on conflict rather than leaving the old timestamp', async () => {
    await service.saveQuoteToCache(quote)

    expect((fakeDb.conflictCalls[0] as any).set.updatedAt).toBeInstanceOf(Date)
  })
})

describe('getCachedHistoricalQuotes', () => {
  const unordered = [
    { date: '2026-03-02', open: 3, high: 3, low: 3, close: 3, volume: 3, adjustedClose: null },
    { date: '2026-01-02', open: 1, high: 1, low: 1, close: 1, volume: 1, adjustedClose: null },
    { date: '2026-02-02', open: 2, high: 2, low: 2, close: 2, volume: 2, adjustedClose: null },
  ]

  it('returns rows oldest-first regardless of database order', async () => {
    fakeDb.selectRows = unordered

    const result = await service.getCachedHistoricalQuotes('AAPL')

    expect(result.map((r) => r.date)).toEqual(['2026-01-02', '2026-02-02', '2026-03-02'])
  })

  it('puts the true period bounds at the ends, which callers read directly', async () => {
    fakeDb.selectRows = unordered

    const result = await service.getCachedHistoricalQuotes('AAPL')

    expect(result[0].date).toBe('2026-01-02')
    expect(result[result.length - 1].date).toBe('2026-03-02')
  })

  it('filters to the requested window, inclusive of both bounds', async () => {
    fakeDb.selectRows = unordered

    const result = await service.getCachedHistoricalQuotes('AAPL', '2026-01-02', '2026-02-02')

    expect(result.map((r) => r.date)).toEqual(['2026-01-02', '2026-02-02'])
  })

  it('returns an empty array when nothing falls in the window', async () => {
    fakeDb.selectRows = unordered

    await expect(
      service.getCachedHistoricalQuotes('AAPL', '2027-01-01', '2027-12-31'),
    ).resolves.toEqual([])
  })
})
