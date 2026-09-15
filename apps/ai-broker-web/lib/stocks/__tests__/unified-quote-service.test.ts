/**
 * @fileoverview Tests for the unified quote service's provider fallback.
 *
 * Two defects are pinned here: a symbol that was not normalized, so "goog"
 * missed the cache entry "GOOG" had written and refetched every time; and an
 * Alpaca response with no ask or bid, which was accepted as a successful quote
 * priced at $0 and then cached for everyone else to read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCachedQuote: vi.fn(),
  saveQuoteToCache: vi.fn(),
  alpacaGetQuote: vi.fn(),
  yahooGetQuote: vi.fn(),
}))

vi.mock('@/packages/investing/src/stocks/quote-cache-service', () => ({
  quoteCacheService: {
    getCachedQuote: mocks.getCachedQuote,
    saveQuoteToCache: mocks.saveQuoteToCache,
    saveQuotesToCache: vi.fn(),
    getCachedHistoricalQuotes: vi.fn().mockResolvedValue([]),
    saveHistoricalQuotes: vi.fn(),
  },
}))
vi.mock('@/packages/investing/src/alpaca/alpaca-mcp-client', () => ({
  getAlpacaMCPClient: () => ({ getQuote: mocks.alpacaGetQuote }),
}))
vi.mock('@/packages/investing/src/stocks/yahoo-finance-wrapper', () => ({
  yahooFinanceWrapper: { getQuote: mocks.yahooGetQuote, getHistorical: vi.fn() },
}))
vi.mock('@/packages/investing/src/stocks/finnhub-wrapper', () => ({
  finnhub: { getQuote: vi.fn(), getHistoricalData: vi.fn() },
  FinnhubWrapper: class {},
}))

import { getQuote } from '@/packages/investing/src/stocks/unified-quote-service'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCachedQuote.mockResolvedValue(null)
  mocks.saveQuoteToCache.mockResolvedValue(undefined)
  mocks.alpacaGetQuote.mockResolvedValue(null)
  mocks.yahooGetQuote.mockResolvedValue({ success: false })
})

describe('getQuote — symbol handling', () => {
  it('rejects an empty symbol without calling a provider', async () => {
    const result = await getQuote('')

    expect(result.success).toBe(false)
    expect(mocks.alpacaGetQuote).not.toHaveBeenCalled()
    expect(mocks.yahooGetQuote).not.toHaveBeenCalled()
  })

  it('rejects a whitespace-only symbol', async () => {
    await expect(getQuote('   ')).resolves.toMatchObject({ success: false })
  })

  it('upper-cases the symbol before reading the cache', async () => {
    // The cache keys on the upper-cased symbol; without this, "goog" never
    // saw the entry "GOOG" wrote and refetched on every call.
    await getQuote('goog')

    expect(mocks.getCachedQuote).toHaveBeenCalledWith('GOOG', undefined)
  })

  it('reports the normalized symbol on the returned quote', async () => {
    mocks.alpacaGetQuote.mockResolvedValue({ ap: 100, t: '2026-09-11T20:00:00Z' })

    const result = await getQuote(' aapl ')

    expect(result.data?.symbol).toBe('AAPL')
  })
})

describe('getQuote — cache', () => {
  it('returns a cached quote without calling a provider', async () => {
    mocks.getCachedQuote.mockResolvedValue({ symbol: 'AAPL', price: 190 })

    const result = await getQuote('AAPL')

    expect(result).toMatchObject({ success: true, data: { price: 190 } })
    expect(mocks.alpacaGetQuote).not.toHaveBeenCalled()
  })

  it('skips the cache when useCache is false', async () => {
    mocks.getCachedQuote.mockResolvedValue({ symbol: 'AAPL', price: 190 })
    mocks.alpacaGetQuote.mockResolvedValue({ ap: 200 })

    const result = await getQuote('AAPL', { useCache: false })

    expect(mocks.getCachedQuote).not.toHaveBeenCalled()
    expect(result.data?.price).toBe(200)
  })

  it('passes the caller TTL through to the cache', async () => {
    await getQuote('AAPL', { cacheTTL: 300_000 })

    expect(mocks.getCachedQuote).toHaveBeenCalledWith('AAPL', 300_000)
  })

  it('falls through to a provider when the cache read throws', async () => {
    mocks.getCachedQuote.mockRejectedValue(new Error('D1 unavailable'))
    mocks.alpacaGetQuote.mockResolvedValue({ ap: 150 })

    await expect(getQuote('AAPL')).resolves.toMatchObject({ success: true })
  })
})

describe('getQuote — provider fallback', () => {
  it('prefers Alpaca and caches what it returns', async () => {
    mocks.alpacaGetQuote.mockResolvedValue({ ap: 190.5, x: 'NASDAQ' })

    const result = await getQuote('AAPL')

    expect(result.data).toMatchObject({ price: 190.5, source: 'alpaca' })
    expect(mocks.saveQuoteToCache).toHaveBeenCalled()
    expect(mocks.yahooGetQuote).not.toHaveBeenCalled()
  })

  it('uses the bid when there is no ask', async () => {
    mocks.alpacaGetQuote.mockResolvedValue({ bp: 188.25 })

    await expect(getQuote('AAPL')).resolves.toMatchObject({ data: { price: 188.25 } })
  })

  it.each([
    ['zero ask and bid', { ap: 0, bp: 0 }],
    ['no price fields at all', { x: 'NASDAQ' }],
    ['a non-numeric ask', { ap: 'N/A' }],
  ])('does not accept an Alpaca response with %s', async (_label, payload) => {
    // A $0 price used to be reported as a successful quote and written to the
    // cache, so every later reader saw a real stock priced at zero.
    mocks.alpacaGetQuote.mockResolvedValue(payload)
    mocks.yahooGetQuote.mockResolvedValue({
      success: true,
      data: { regularMarketPrice: 190, longName: 'Apple Inc.' },
    })

    const result = await getQuote('AAPL')

    expect(result.data?.source).toBe('yfinance')
    expect(result.data?.price).toBe(190)
  })

  it('falls back to Yahoo when Alpaca throws', async () => {
    mocks.alpacaGetQuote.mockRejectedValue(new Error('alpaca down'))
    mocks.yahooGetQuote.mockResolvedValue({
      success: true,
      data: { regularMarketPrice: 190, currency: 'USD' },
    })

    await expect(getQuote('AAPL')).resolves.toMatchObject({
      success: true,
      data: { price: 190, source: 'yfinance' },
    })
  })

  it('maps the Yahoo payload onto the normalized shape', async () => {
    mocks.alpacaGetQuote.mockResolvedValue(null)
    mocks.yahooGetQuote.mockResolvedValue({
      success: true,
      data: {
        regularMarketPrice: 190,
        regularMarketChange: 2,
        regularMarketChangePercent: 1.05,
        regularMarketOpen: 188,
        regularMarketDayHigh: 191,
        regularMarketDayLow: 187,
        regularMarketPreviousClose: 188,
        volume: 50_000,
        marketCap: 3e12,
        currency: 'USD',
        longName: 'Apple Inc.',
        exchange: 'NASDAQ',
      },
    })

    const result = await getQuote('AAPL')

    expect(result.data).toMatchObject({
      price: 190,
      change: 2,
      changePercent: 1.05,
      open: 188,
      high: 191,
      low: 187,
      previousClose: 188,
      volume: 50_000,
      marketCap: 3e12,
      currency: 'USD',
      name: 'Apple Inc.',
      exchange: 'NASDAQ',
    })
  })

  it('does not accept a Yahoo payload priced at zero', async () => {
    mocks.yahooGetQuote.mockResolvedValue({
      success: true,
      data: { regularMarketPrice: 0, longName: 'Delisted Co.' },
    })

    await expect(getQuote('AAPL')).resolves.toMatchObject({ success: false })
  })

  it('reports failure when every provider comes up empty', async () => {
    const result = await getQuote('AAPL')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/AAPL/)
    expect(mocks.saveQuoteToCache).not.toHaveBeenCalled()
  })
})
