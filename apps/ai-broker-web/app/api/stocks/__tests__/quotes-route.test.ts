/**
 * @fileoverview Route tests for GET /api/stocks/quotes, the batch endpoint the
 * ticker strip polls. Each symbol costs a quote plus three historical fetches,
 * so the symbol list is the blast radius of one request and is pinned here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/packages/investing/src/stocks/unified-quote-service', () => ({
  getQuotes: vi.fn(),
}))
vi.mock('@/packages/investing/src/stocks/yahoo-finance-wrapper', () => ({
  yahooFinanceWrapper: { getHistorical: vi.fn() },
}))
vi.mock('@/packages/investing/src/stocks/quote-cache-service', () => ({
  quoteCacheService: { saveHistoricalQuotes: vi.fn() },
}))

import { getQuotes } from '@/packages/investing/src/stocks/unified-quote-service'
import { yahooFinanceWrapper } from '@/packages/investing/src/stocks/yahoo-finance-wrapper'
import { GET } from '../quotes/route'

const mockGetQuotes = getQuotes as unknown as ReturnType<typeof vi.fn>
const mockGetHistorical = yahooFinanceWrapper.getHistorical as unknown as ReturnType<typeof vi.fn>

const quote = (symbol: string, price = 100) => ({
  symbol,
  name: `${symbol} Inc.`,
  price,
  change: 1,
  changePercent: 1,
  open: 99,
  high: 101,
  low: 98,
  previousClose: 99,
  volume: 1000,
  marketCap: 1e12,
  currency: 'USD',
  exchange: 'NASDAQ',
  timestamp: new Date('2026-09-11T20:00:00Z'),
  source: 'yfinance' as const,
})

const call = (search: string) =>
  GET(new NextRequest(`http://localhost/api/stocks/quotes${search}`))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetHistorical.mockResolvedValue({ success: false })
})

describe('GET /api/stocks/quotes — request shape', () => {
  it('answers 400 when symbols is missing', async () => {
    const res = await call('')

    expect(res.status).toBe(400)
    expect(mockGetQuotes).not.toHaveBeenCalled()
  })

  it('answers 400 when symbols is present but empty', async () => {
    expect((await call('?symbols=')).status).toBe(400)
    expect((await call('?symbols=,,,')).status).toBe(400)
    expect(mockGetQuotes).not.toHaveBeenCalled()
  })

  it('upper-cases and trims each symbol', async () => {
    mockGetQuotes.mockResolvedValue({
      success: true,
      data: { quotes: [quote('AAPL')], source: 'yfinance' },
    })

    await call('?symbols= aapl , msft &skipHistorical=true')

    expect(mockGetQuotes).toHaveBeenCalledWith(['AAPL', 'MSFT'], expect.anything())
  })

  it('deduplicates repeated symbols', async () => {
    mockGetQuotes.mockResolvedValue({
      success: true,
      data: { quotes: [quote('AAPL')], source: 'yfinance' },
    })

    await call('?symbols=AAPL,AAPL,aapl&skipHistorical=true')

    expect(mockGetQuotes).toHaveBeenCalledWith(['AAPL'], expect.anything())
  })

  it('refuses a batch beyond the per-request ceiling', async () => {
    const symbols = Array.from({ length: 51 }, (_, i) => `SYM${i}`).join(',')

    const res = await call(`?symbols=${symbols}&skipHistorical=true`)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ code: 'TOO_MANY_SYMBOLS' })
    expect(mockGetQuotes).not.toHaveBeenCalled()
  })

  it('accepts a batch at exactly the ceiling', async () => {
    const symbols = Array.from({ length: 50 }, (_, i) => `SY${i}`)
    mockGetQuotes.mockResolvedValue({
      success: true,
      data: { quotes: symbols.map((s) => quote(s)), source: 'mixed' },
    })

    const res = await call(`?symbols=${symbols.join(',')}&skipHistorical=true`)

    expect(res.status).toBe(200)
    expect(mockGetQuotes).toHaveBeenCalled()
  })
})

describe('GET /api/stocks/quotes — cache and enrichment options', () => {
  beforeEach(() => {
    mockGetQuotes.mockResolvedValue({
      success: true,
      data: { quotes: [quote('AAPL')], source: 'yfinance' },
    })
  })

  it('uses the cache by default and bypasses it for live=true', async () => {
    await call('?symbols=AAPL&skipHistorical=true')
    expect(mockGetQuotes).toHaveBeenLastCalledWith(['AAPL'], { useCache: true, cacheTTL: undefined })

    await call('?symbols=AAPL&live=true&skipHistorical=true')
    expect(mockGetQuotes).toHaveBeenLastCalledWith(['AAPL'], { useCache: false, cacheTTL: undefined })
  })

  it('passes a numeric cacheTTL through', async () => {
    await call('?symbols=AAPL&cacheTTL=300000&skipHistorical=true')

    expect(mockGetQuotes).toHaveBeenCalledWith(['AAPL'], { useCache: true, cacheTTL: 300000 })
  })

  it('skips the historical lookups when skipHistorical=true', async () => {
    await call('?symbols=AAPL&skipHistorical=true')

    expect(mockGetHistorical).not.toHaveBeenCalled()
  })

  it('reports zeroed period changes when historical data is skipped', async () => {
    const body = await (await call('?symbols=AAPL&skipHistorical=true')).json()

    expect(body.data[0]).toMatchObject({
      symbol: 'AAPL',
      weeklyChange: 0,
      monthlyChange: 0,
      yearlyChange: 0,
    })
  })

  it('computes period changes from historical bars when not skipped', async () => {
    mockGetHistorical.mockResolvedValue({
      success: true,
      data: [
        { date: new Date('2026-09-01'), open: 90, high: 91, low: 89, close: 90, volume: 1 },
        { date: new Date('2026-09-11'), open: 99, high: 100, low: 98, close: 99, volume: 1 },
      ],
    })

    const body = await (await call('?symbols=AAPL')).json()

    expect(body.data[0].weeklyChange).toBeCloseTo(9, 2)
    expect(body.data[0].weeklyChangePercent).toBe(10)
  })

  it('still returns quotes when the historical lookup throws', async () => {
    mockGetHistorical.mockRejectedValue(new Error('yahoo down'))

    const res = await call('?symbols=AAPL')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true })
  })
})

describe('GET /api/stocks/quotes — failures', () => {
  it('answers 400 when the quote service reports failure', async () => {
    mockGetQuotes.mockResolvedValue({ success: false, error: 'no sources' })

    const res = await call('?symbols=AAPL&skipHistorical=true')

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ success: false, error: 'no sources' })
  })

  it('answers 500 when the quote service throws', async () => {
    mockGetQuotes.mockRejectedValue(new Error('socket hang up'))

    const res = await call('?symbols=AAPL&skipHistorical=true')

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({ error: 'socket hang up' })
  })
})
