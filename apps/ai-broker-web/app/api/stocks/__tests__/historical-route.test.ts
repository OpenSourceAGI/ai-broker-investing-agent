/**
 * @fileoverview Route tests for GET /api/stocks/historical/[symbol].
 *
 * Covers the three things that were wrong in production: partial tickers from a
 * search box reaching the data providers before being refused, the cache branch
 * that could never be taken because it compared trading days against calendar
 * days, and the period bounds reported from an unsorted row set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// `vi.mock` factories are hoisted above module-level consts, so the spy the
// fake wrapper closes over has to be hoisted with them.
const { getHistoricalData } = vi.hoisted(() => ({ getHistoricalData: vi.fn() }))

vi.mock('@/packages/investing/src/stocks/finnhub-wrapper', () => ({
  FinnhubWrapper: class {
    getHistoricalData = getHistoricalData
  },
}))
vi.mock('@/packages/investing/src/stocks/quote-cache-service', () => ({
  quoteCacheService: {
    getCachedHistoricalQuotes: vi.fn(),
    saveHistoricalQuotes: vi.fn(),
  },
}))

import { quoteCacheService } from '@/packages/investing/src/stocks/quote-cache-service'
import { routeContext } from '../../__tests__/helpers/fake-db'
import { GET } from '../historical/[symbol]/route'

const mockGetCached = quoteCacheService.getCachedHistoricalQuotes as unknown as ReturnType<typeof vi.fn>
const mockSaveCached = quoteCacheService.saveHistoricalQuotes as unknown as ReturnType<typeof vi.fn>

/** `count` consecutive daily bars ending today, oldest first. */
function bars(count: number, startPrice = 100) {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (count - 1 - i))
    return {
      date: date.toISOString().split('T')[0],
      open: startPrice + i,
      high: startPrice + i + 1,
      low: startPrice + i - 1,
      close: startPrice + i + 0.5,
      volume: 1_000_000 + i,
    }
  })
}

const call = (symbol: string, search = '') =>
  GET(
    new NextRequest(
      `http://localhost/api/stocks/historical/${encodeURIComponent(symbol)}${search}`,
    ),
    routeContext({ symbol }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCached.mockResolvedValue([])
  mockSaveCached.mockResolvedValue(undefined)
})

describe('GET /api/stocks/historical/[symbol] — validation', () => {
  it.each(['GOO', 'GOOH', 'GOOHL', 'GOOGLE'])(
    'refuses the partial ticker %s without calling a provider',
    async (partial) => {
      const res = await call(partial, '?range=5y&interval=1d')

      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(500)
      expect(getHistoricalData).not.toHaveBeenCalled()
      expect(mockGetCached).not.toHaveBeenCalled()
    },
  )

  it('distinguishes a malformed ticker (400) from an unlisted one (404)', async () => {
    expect((await call('GOOGLE')).status).toBe(400)
    expect((await call('ZZZZZ')).status).toBe(404)
  })

  it('upper-cases the symbol before fetching', async () => {
    getHistoricalData.mockResolvedValue({
      success: true,
      source: 'finnhub',
      data: { quotes: bars(5), meta: {} },
    })

    await call('aapl', '?range=1mo&interval=1d&cache=false')

    expect(getHistoricalData).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'AAPL' }),
    )
  })
})

describe('GET /api/stocks/historical/[symbol] — range handling', () => {
  beforeEach(() => {
    getHistoricalData.mockResolvedValue({
      success: true,
      source: 'finnhub',
      data: { quotes: bars(10), meta: { currency: 'USD', symbol: 'AAPL' } },
    })
  })

  it.each([
    ['1d', 1],
    ['5d', 5],
    ['1mo', 31],
    ['1y', 366],
    ['2y', 731],
    ['5y', 1827],
  ])('turns range=%s into a start date about %i days back', async (range, days) => {
    await call('AAPL', `?range=${range}&interval=1d&cache=false`)

    const { period1, period2 } = getHistoricalData.mock.calls[0][0]
    const spanDays = (new Date(period2).getTime() - new Date(period1).getTime()) / 86_400_000
    expect(spanDays).toBeGreaterThan(days - 3)
    expect(spanDays).toBeLessThan(days + 3)
  })

  it('prefers explicit period1/period2 over range', async () => {
    await call('AAPL', '?period1=1704067200&period2=1735689600&interval=1d&cache=false')

    expect(getHistoricalData).toHaveBeenCalledWith(
      expect.objectContaining({ period1: '1704067200', period2: '1735689600' }),
    )
  })

  it('falls back to one month for an unrecognized range', async () => {
    await call('AAPL', '?range=banana&interval=1d&cache=false')

    const { period1, period2 } = getHistoricalData.mock.calls[0][0]
    const spanDays = (new Date(period2).getTime() - new Date(period1).getTime()) / 86_400_000
    expect(spanDays).toBeGreaterThan(27)
    expect(spanDays).toBeLessThan(32)
  })
})

describe('GET /api/stocks/historical/[symbol] — cache', () => {
  it('serves a year of cached bars without calling a provider', async () => {
    // ~252 trading days is a complete year, but only ~69% of its calendar days.
    // Measured against calendar days this branch could never be taken.
    mockGetCached.mockResolvedValue(bars(252))

    const res = await call('AAPL', '?range=1y&interval=1d')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.source).toBe('cache')
    expect(body.dataPoints).toBe(252)
    expect(getHistoricalData).not.toHaveBeenCalled()
  })

  it('reports the period from the first and last cached bar', async () => {
    const cached = bars(252)
    mockGetCached.mockResolvedValue(cached)

    const body = await (await call('AAPL', '?range=1y&interval=1d')).json()

    expect(body.period.start).toBe(cached[0].date)
    expect(body.period.end).toBe(cached[cached.length - 1].date)
  })

  it('refetches when the cache holds only a sliver of the window', async () => {
    mockGetCached.mockResolvedValue(bars(5))
    getHistoricalData.mockResolvedValue({
      success: true,
      source: 'finnhub',
      data: { quotes: bars(250), meta: {} },
    })

    const body = await (await call('AAPL', '?range=1y&interval=1d')).json()

    expect(getHistoricalData).toHaveBeenCalled()
    expect(body.source).toBe('finnhub')
  })

  it('skips the cache entirely when cache=false', async () => {
    mockGetCached.mockResolvedValue(bars(252))
    getHistoricalData.mockResolvedValue({
      success: true,
      source: 'finnhub',
      data: { quotes: bars(250), meta: {} },
    })

    await call('AAPL', '?range=1y&interval=1d&cache=false')

    expect(mockGetCached).not.toHaveBeenCalled()
    expect(getHistoricalData).toHaveBeenCalled()
  })

  it('does not read the cache for intraday intervals', async () => {
    getHistoricalData.mockResolvedValue({
      success: true,
      source: 'finnhub',
      data: { quotes: bars(30), meta: {} },
    })

    await call('AAPL', '?range=5d&interval=5m')

    expect(mockGetCached).not.toHaveBeenCalled()
  })

  it('writes freshly fetched daily bars back to the cache', async () => {
    const fetched = bars(250)
    getHistoricalData.mockResolvedValue({
      success: true,
      source: 'finnhub',
      data: { quotes: fetched, meta: {} },
    })

    await call('AAPL', '?range=1y&interval=1d')

    expect(mockSaveCached).toHaveBeenCalledWith('AAPL', fetched)
  })

  it('still answers when writing to the cache fails', async () => {
    mockSaveCached.mockRejectedValue(new Error('D1 unavailable'))
    getHistoricalData.mockResolvedValue({
      success: true,
      source: 'finnhub',
      data: { quotes: bars(250), meta: {} },
    })

    expect((await call('AAPL', '?range=1y&interval=1d')).status).toBe(200)
  })
})

describe('GET /api/stocks/historical/[symbol] — no data', () => {
  it('answers 404 NO_DATA when every provider comes back empty', async () => {
    getHistoricalData.mockResolvedValue({
      success: true,
      source: 'finnhub',
      data: { quotes: [] },
    })

    const res = await call('AAPL', '?range=1y&interval=1d')

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ success: false, code: 'NO_DATA' })
  })

  it('hints at the missing credentials when no provider key is configured', async () => {
    vi.stubEnv('FINNHUB_API_KEY', '')
    vi.stubEnv('ALPACA_API_KEY', '')
    vi.stubEnv('APCA_API_KEY_ID', '')
    getHistoricalData.mockResolvedValue({ success: false, error: 'no keys' })

    const body = await (await call('AAPL', '?range=1y&interval=1d')).json()

    expect(body.hint).toMatch(/No API keys configured/)
  })

  it('hints at a shorter range for a long window that came back empty', async () => {
    vi.stubEnv('FINNHUB_API_KEY', 'test-key')
    getHistoricalData.mockResolvedValue({ success: true, data: { quotes: [] } })

    const body = await (await call('AAPL', '?range=5y&interval=1d')).json()

    expect(body.hint).toMatch(/Try a shorter range/)
  })

  it('answers 500 when the provider throws unexpectedly', async () => {
    getHistoricalData.mockRejectedValue(new Error('socket hang up'))

    const res = await call('AAPL', '?range=1y&interval=1d')

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({ code: 'HISTORICAL_ERROR' })
  })
})

describe('GET /api/stocks/historical/[symbol] — success payload', () => {
  it('returns the bars with their period, source and metadata', async () => {
    const quotes = bars(250)
    getHistoricalData.mockResolvedValue({
      success: true,
      source: 'finnhub',
      data: {
        quotes,
        meta: { currency: 'USD', symbol: 'AAPL', exchangeName: 'NASDAQ' },
      },
    })

    const body = await (await call('AAPL', '?range=1y&interval=1d')).json()

    expect(body).toMatchObject({
      success: true,
      symbol: 'AAPL',
      source: 'finnhub',
      interval: '1d',
      dataPoints: quotes.length,
      meta: { currency: 'USD', symbol: 'AAPL', exchangeName: 'NASDAQ' },
    })
    expect(body.period.start).toBe(quotes[0].date)
    expect(body.period.end).toBe(quotes[quotes.length - 1].date)
  })
})
